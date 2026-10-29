import { toFdx } from '@drafter/fdx';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import {
  DOCUMENT_FONT_FILES,
  type DocumentFontSet,
  type Face,
  FONT_FILES,
  type FontSet,
  type RenderProgress,
  renderDocumentPdf,
  renderPdf,
} from '@drafter/render-pdf';
import { renderText } from '@drafter/render-text';
import type { Paper, Template } from '@drafter/templates';
import {
  type ProgressReporter,
  progressReporter,
  type StageWeights,
  WEIGHTS,
} from './export-progress';

/**
 * What the main thread sends the export worker: the whole text, and the template to lay a script
 * out with; or, for a Markdown document's PDF, the paper, the title, and the language its PDF
 * carries (Markdown PDF design §5, §6).
 */
export type ExportRequest =
  | { kind: 'pdf' | 'txt' | 'fdx'; source: string; template: Template }
  | { kind: 'markdown-pdf'; source: string; paper: Paper; title: string; lang: string };
/** The file, and for a Markdown PDF the characters its fonts lack, printed as `?`. */
export type ExportReply = { data: Uint8Array | string; missing?: string[] } | { error: string };
/**
 * Sent while an export runs, before its reply: how far it is, from 0 to 1, or null while it can't
 * say (`export-progress.ts`). The last one before a good reply is 1.
 */
export interface ExportProgress {
  progress: number | null;
}

/** Where the app serves Courier Prime (the same files the PDF embeds). */
const FONT_FOLDER = '/fonts/courier-prime/';
/** Where the app serves Inter Tight's four static styles, for a Markdown document's PDF. */
const DOCUMENT_FONT_FOLDER = '/fonts/inter-tight/';

/** A font file from the app's own origin, which `connect-src 'self'` allows. */
async function fontFile(
  fetcher: (url: string) => Promise<Response>,
  folder: string,
  file: string,
): Promise<Uint8Array> {
  const response = await fetcher(`${folder}${file}`);
  if (!response.ok) throw new Error(`Couldn’t load the font ${file}.`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Fetches the four Courier Prime files from the app's own origin. */
export async function fetchFonts(
  fetcher: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<FontSet> {
  const styles = Object.keys(FONT_FILES) as (keyof FontSet)[];
  const loaded = await Promise.all(
    styles.map(
      async (style) => [style, await fontFile(fetcher, FONT_FOLDER, FONT_FILES[style])] as const,
    ),
  );
  return Object.fromEntries(loaded) as unknown as FontSet;
}

/**
 * The five document fonts from the app's own origin: Inter Tight from /fonts/inter-tight/,
 * Courier Prime Regular (the code) from /fonts/courier-prime/.
 */
export async function fetchDocumentFonts(
  fetcher: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<DocumentFontSet> {
  const faces = Object.keys(DOCUMENT_FONT_FILES) as Face[];
  const loaded = await Promise.all(
    faces.map(async (face) => {
      // The package's paths are under its `fonts/`: `inter-tight/…` or Courier Prime's own name.
      const file = DOCUMENT_FONT_FILES[face].split('/').at(-1) as string;
      const folder = face === 'code' ? FONT_FOLDER : DOCUMENT_FONT_FOLDER;
      return [face, await fontFile(fetcher, folder, file)] as const;
    }),
  );
  return Object.fromEntries(loaded) as unknown as DocumentFontSet;
}

/** A render's progress as the export's: saving says nothing until it ends, so it is unknown. */
const rendering =
  (report: ProgressReporter) =>
  ({ stage, done, total }: RenderProgress) => {
    if (stage === 'save' && done < total) report.unknown();
    else report.step(stage, done, total);
  };

/** Loads something once and keeps it; a failed load is tried again next time. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let kept: Promise<T> | undefined;
  return () => {
    kept ??= load().catch((error) => {
      kept = undefined;
      throw error;
    });
    return kept;
  };
}

/**
 * Parses, paginates, and renders one request: what `drafter build --pdf` and `--txt` do. A Final
 * Draft file is the parsed script as `toFdx` writes it, with no pages. A Markdown document's PDF
 * is parsed here with the app's own parser, imported on the first one (Call 21), so a script's
 * export never loads it. Each set of fonts is loaded by the first PDF that needs it and kept; a
 * failed load is tried again next time. An error is a reply, so the worker never throws. With
 * `onProgress`, each export says how far it is as it goes: unknown while it fetches, parses, and
 * (for a script) lays out; by blocks and pages as it lays out and draws a PDF; unknown again while
 * pdf-lib saves; and 1 at the end. Plain text and Final Draft files are quick: unknown, then 1.
 */
export function createExporter(
  loadFonts: () => Promise<FontSet> = fetchFonts,
  loadDocumentFonts: () => Promise<DocumentFontSet> = fetchDocumentFonts,
) {
  const fontsOnce = once(loadFonts);
  const documentFontsOnce = once(loadDocumentFonts);
  const parserOnce = once(() => import('../markdown/parse'));

  async function exportOne(request: ExportRequest, report: ProgressReporter): Promise<ExportReply> {
    if (request.kind === 'markdown-pdf') {
      const [{ parseMarkdown }, fonts] = await Promise.all([parserOnce(), documentFontsOnce()]);
      const { bytes, missing } = await renderDocumentPdf(parseMarkdown(request.source), {
        fonts,
        paper: request.paper,
        title: request.title,
        lang: request.lang,
        onProgress: rendering(report),
      });
      return { data: bytes, missing };
    }
    const { kind, source, template } = request;
    if (kind === 'fdx') return { data: toFdx(parse(source), template) };
    const layout = paginate(parse(source), template);
    if (kind === 'txt') return { data: renderText(layout, template) };
    const fonts = await fontsOnce();
    return { data: await renderPdf(layout, template, { fonts, onProgress: rendering(report) }) };
  }

  return async (
    request: ExportRequest,
    onProgress: (fraction: number | null) => void = () => {},
  ): Promise<ExportReply> => {
    const weights: StageWeights =
      request.kind === 'markdown-pdf' ? WEIGHTS.markdown : WEIGHTS.script;
    const report = progressReporter(weights, onProgress);
    try {
      report.unknown();
      const reply = await exportOne(request, report);
      report.done();
      return reply;
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  };
}
