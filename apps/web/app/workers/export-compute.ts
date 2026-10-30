import { toFdx } from '@drafter/fdx';
import { parse } from '@drafter/fountain';
import { paginate, type SceneNumbering, type TitlePageMode, titlePageFor } from '@drafter/layout';
import { sceneIndex, scriptMarkdown } from '@drafter/outline';
import {
  type FontStyle,
  renderDocumentHtml,
  renderScriptHtml,
  stylesUsed,
} from '@drafter/render-html-file';
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
import { isBuiltIn, TEMPLATE_NAMES } from '../editor/template';
import { countScript, runningTime } from '../stats/count';
import {
  type ProgressReporter,
  progressReporter,
  type StageWeights,
  WEIGHTS,
} from './export-progress';

/**
 * How a script exports: which scene numbers print, how much of the title page, and whether a
 * Markdown file carries the notes and synopses (Call 28; the other exports never print them). A
 * Final Draft file keeps the numbers written in the script whatever `sceneNumbers` says, since
 * Final Draft decides what it prints (Call 8). The script itself is never changed.
 */
export interface ExportOptions {
  sceneNumbers: SceneNumbering;
  titlePage: TitlePageMode;
  notes: 'leave-out' | 'include';
}

/**
 * No scene numbers, the whole title page, and no notes: what an export did before there were
 * options.
 */
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = Object.freeze({
  sceneNumbers: 'none',
  titlePage: 'full',
  notes: 'leave-out',
});

/**
 * What the main thread sends the export worker: the whole text, the template to lay a script out
 * with, and its options (absent, the defaults); or, for a Markdown document's PDF, the paper, the
 * title, and the language its PDF carries (Markdown PDF design §5, §6). A script's HTML file adds
 * its title, language, and generator line (HTML export design §6, §7), and the script's own page
 * rate, for the header's kind line ("Screenplay · 94 pages · About 1 h 34 min"), which the worker
 * writes from the pages it lays out; a Markdown document's HTML file is its text, title,
 * language, and generator.
 */
export type ExportRequest =
  | {
      kind: 'pdf' | 'txt' | 'fdx' | 'md';
      source: string;
      template: Template;
      options?: ExportOptions;
    }
  | {
      kind: 'html';
      source: string;
      template: Template;
      options?: ExportOptions;
      title: string;
      lang: string;
      generator: string;
      minutesPerPage: number;
    }
  | { kind: 'markdown-pdf'; source: string; paper: Paper; title: string; lang: string }
  | { kind: 'markdown-html'; source: string; title: string; lang: string; generator: string };
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

/**
 * The small line over an HTML file's title (design §3.3): the template's kind, the printed pages,
 * and the running time as Stats shows it, `pages` (to a tenth, `countScript`'s) at the script's
 * own rate, in whole minutes: "Stage play · 94 pages · About 1 h 52 min". `printed` is the pages
 * the file draws, the title page left out.
 */
export function scriptKindLine(
  template: Template,
  printed: number,
  pages: number,
  minutesPerPage: number,
): string {
  // Only the built-in templates have a kind's name: the app shows any other script as a
  // screenplay (`templateIdOf`), so that is its name here. A template of the writer's own (not
  // yet in Drafter) will need a name of its own for this line.
  const kind = isBuiltIn(template.id)
    ? TEMPLATE_NAMES[template.id]
    : TEMPLATE_NAMES['us-screenplay'];
  const count = `${printed.toLocaleString('en-US')} ${printed === 1 ? 'page' : 'pages'}`;
  return `${kind} · ${count} · ${runningTime(Math.round(pages * minutesPerPage))}`;
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
 * Parses, paginates, and renders one request: what `drafter build --pdf` and `--txt` do, with the
 * request's options. A Final Draft file is the parsed script, its title page cut to the options,
 * as `toFdx` writes it, with no pages; a script's Markdown file is the same, as `scriptMarkdown`
 * writes it (Calls 25 to 28). A script's HTML file is its pages and its Reading view, with
 * Courier Prime in the styles the pages use (`@drafter/render-html-file`). A Markdown document's
 * PDF and HTML file are parsed here with the app's own parser, imported on the first one
 * (Call 21), so a script's export never loads it. Each set of fonts is loaded by the first file
 * that needs it and kept; a failed load is tried again next time. An error is a reply, so the
 * worker never throws. With `onProgress`, each export says how far it is as it goes: unknown
 * while it fetches, parses, and (for a script) lays out; by blocks and pages as it lays out and
 * draws a PDF; unknown again while pdf-lib saves; and 1 at the end. Plain text, Final Draft,
 * Markdown, and HTML files are quick: unknown, then 1.
 */
export function createExporter(
  loadFonts: () => Promise<FontSet> = fetchFonts,
  loadDocumentFonts: () => Promise<DocumentFontSet> = fetchDocumentFonts,
) {
  const fontsOnce = once(loadFonts);
  const documentFontsOnce = once(loadDocumentFonts);
  const parserOnce = once(() => import('../markdown/parse'));

  async function exportOne(request: ExportRequest, report: ProgressReporter): Promise<ExportReply> {
    if (request.kind === 'markdown-html') {
      const { parseMarkdown } = await parserOnce();
      const { title, lang, generator } = request;
      return {
        data: renderDocumentHtml({ tree: parseMarkdown(request.source), title, lang, generator }),
      };
    }
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
    const { kind, source, template, options = DEFAULT_EXPORT_OPTIONS } = request;
    const parsed = parse(source);
    const doc = { ...parsed, titlePage: titlePageFor(parsed.titlePage, options.titlePage) };
    if (kind === 'fdx') return { data: toFdx(doc, template) };
    if (kind === 'md') {
      const { sceneNumbers, notes } = options;
      const index = sceneIndex(doc, template);
      return { data: scriptMarkdown(doc, index, template, { sceneNumbers, notes }) };
    }
    const layout = paginate(doc, template, { sceneNumbers: options.sceneNumbers });
    if (kind === 'txt') return { data: renderText(layout, template) };
    const fonts = await fontsOnce();
    if (request.kind === 'html') {
      // Only the styles the pages draw in: the file embeds no other.
      const used = [...stylesUsed(layout)].map((style) => [style, fonts[style]] as const);
      const printed = layout.pages.filter((page) => page.number > 0).length;
      const { pages } = countScript(doc, layout, template);
      return {
        data: renderScriptHtml({
          doc,
          layout,
          template,
          notes: options.notes,
          fonts: Object.fromEntries(used) as Partial<Record<FontStyle, Uint8Array>>,
          title: request.title,
          lang: request.lang,
          generator: request.generator,
          kindLine: scriptKindLine(template, printed, pages, request.minutesPerPage),
        }),
      };
    }
    return { data: await renderPdf(layout, template, { fonts, onProgress: rendering(report) }) };
  }

  return async (
    request: ExportRequest,
    onProgress: (fraction: number | null) => void = () => {},
  ): Promise<ExportReply> => {
    const weights: StageWeights =
      request.kind === 'markdown-pdf' || request.kind === 'markdown-html'
        ? WEIGHTS.markdown
        : WEIGHTS.script;
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
