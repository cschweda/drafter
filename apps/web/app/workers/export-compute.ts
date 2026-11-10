import { toFdx } from '@drafter/fdx';
import { parse } from '@drafter/fountain';
import {
  type Layout,
  type Page,
  paginate,
  type SceneNumbering,
  type TitlePageMode,
  titlePageFor,
} from '@drafter/layout';
import {
  type ManuscriptDetails,
  type ManuscriptFont,
  manuscriptOf,
  resolveDetails,
} from '@drafter/novel';
import { sceneIndex, scriptMarkdown } from '@drafter/outline';
import {
  BREAKDOWN_COLUMNS,
  breakdownRows,
  noRevisedPages,
  type ProductionSet,
  paperTint,
  productionLayout,
  productionSceneNumbers,
  type RevisedChoice,
  revisedPages,
  sceneList,
  sides,
  sidesChoices,
  sidesHeader,
  toCsv,
} from '@drafter/production';
import { renderManuscriptDocx } from '@drafter/render-docx';
import {
  epubIdentifier,
  epubStylesUsed,
  type FontStyle,
  kindLine,
  renderDocumentEpub,
  renderDocumentHtml,
  renderScriptEpub,
  renderScriptHtml,
  scriptAuthor,
  stylesUsed,
} from '@drafter/render-html-file';
import {
  DOCUMENT_FONT_FILES,
  type DocumentFontSet,
  type Face,
  FONT_FILES,
  type FontSet,
  MANUSCRIPT_FONT_FILES,
  type ManuscriptFace,
  type ManuscriptFontSet,
  type RenderProgress,
  renderDocumentPdf,
  renderManuscriptPdf,
  renderPdf,
  renderTablePdf,
} from '@drafter/render-pdf';
import { renderText } from '@drafter/render-text';
import {
  buildStoryMap,
  type MapOptions,
  type QuoteCandidate,
  quoteCandidates,
  renderStoryMap,
  STORY_MAP_FONT_FILES,
  type StoryMapFace,
  type StoryMapFonts,
  storyMapMeta,
} from '@drafter/story-map';
import type { Paper, Template } from '@drafter/templates';
import {
  type ProgressReporter,
  progressReporter,
  type StageWeights,
  WEIGHTS,
} from './export-progress';
import { DEGRADED, ExportRefusal, NOT_LOCKED_REVISED } from './export-refusal';

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
  /**
   * "Let Drafter reopen this file" (reopenable exports): an HTML file and an EPUB carry the whole
   * script, notes and all, so Open can read it back. Absent is off, the default: an export is
   * often sent to someone with the notes left out.
   */
  reopenable?: true;
  /**
   * A locked script's revision marks in its PDF and its HTML file's pages (production design §8,
   * Call 3b): `'open'`, the default (absent), prints the open set's asterisks and its revision
   * header; `'none'` prints the locked labels only. An unlocked script has none to print.
   */
  revisionMarks?: 'open' | 'none';
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

/** What a breakdown report is made from (see `ExportRequest`). */
interface BreakdownRequest {
  source: string;
  template: Template;
  title: string;
  today: string;
}

/**
 * What the main thread sends the export worker: the whole text, the template to lay a script out
 * with, and its options (absent, the defaults); or, for a Markdown document's PDF, the paper, the
 * title, and the language its PDF carries (Markdown PDF design §5, §6). A script's HTML file adds
 * its title, language, and generator line (HTML export design §6, §7), and the script's own page
 * rate, for the header's kind line ("Screenplay · 94 pages · About 1 h 34 min"), which the worker
 * writes from the pages it lays out; a Markdown document's HTML file is its text, title,
 * language, and generator. An EPUB (§10a), a script's or a document's, is asked for as the HTML
 * file is, without the page rate and with the time it was asked for (milliseconds since 1970),
 * its package's modified date. With "Let Drafter reopen this file", each of those four carries
 * `embed`, the text as Save would write it (its line breaks and byte order mark), which goes
 * inside the file whole. A novel's standard manuscript, as a PDF or a Word file, is its text, the
 * name its file goes by (the title when nothing else gives one), the details its dialog keeps, and
 * the paper and language a Markdown PDF takes.
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
      /** The text to carry inside the file, for Drafter to reopen (`ExportOptions.reopenable`). */
      embed?: string;
    }
  | {
      kind: 'epub';
      source: string;
      template: Template;
      options?: ExportOptions;
      title: string;
      lang: string;
      generator: string;
      modified: number;
      /** The project's id, the book's identity (`epubIdentifier`); none for a script not saved. */
      projectId?: string;
      embed?: string;
    }
  | { kind: 'markdown-pdf'; source: string; paper: Paper; title: string; lang: string }
  | ManuscriptRequest<'manuscript-pdf'>
  | ManuscriptRequest<'manuscript-docx'>
  | {
      kind: 'markdown-html';
      source: string;
      title: string;
      lang: string;
      generator: string;
      embed?: string;
    }
  | {
      kind: 'markdown-epub';
      source: string;
      title: string;
      lang: string;
      generator: string;
      modified: number;
      /** The project's id, as a script's EPUB's. */
      projectId?: string;
      embed?: string;
    }
  /**
   * A story map (story-map design §10): the page the dialog's choices make. Never `embed`: a story
   * map never carries the script, whatever "Let Drafter reopen this file" says (Call 20).
   */
  | {
      kind: 'story-map';
      source: string;
      template: Template;
      title: string;
      lang: string;
      generator: string;
      options: MapOptions;
    }
  /** What the Make a story map dialog shows (`StoryMapPicks`, as JSON). */
  | { kind: 'story-map-picks'; source: string; template: Template; options: MapOptions }
  /**
   * A locked script's revised pages (production design §8): the pages `which` chooses, as they
   * print in the full PDF (the export options' scene numbers), with the marks of the open set or of
   * every set, `header` under each page number, and, with `tint`, behind each page the colour
   * of the newest set with a mark on it.
   */
  | {
      kind: 'revised-pdf';
      source: string;
      template: Template;
      options?: ExportOptions;
      which: RevisedChoice;
      marks: 'open' | 'all';
      header: string;
      tint: boolean;
    }
  /**
   * A script's breakdown report (production design §9), one row per scene: as a CSV (text) or a
   * PDF table. `today` is `YYYY-MM-DD`, the PDF's date line.
   */
  | ({ kind: 'breakdown-csv' } & BreakdownRequest)
  | ({ kind: 'breakdown-pdf' } & BreakdownRequest)
  /** What the Export revised pages dialog shows (`RevisedInfo`, as JSON). */
  | { kind: 'revised-info'; source: string; template: Template; options?: ExportOptions }
  /**
   * One actor's sides (production design §10): the pages the ticked `scenes` (ordinals) are on,
   * with the other scenes' lines crossed out, and a header naming `names` and the scenes, dated
   * `today` (`YYYY-MM-DD`). Printed as the full PDF is, with the open set's marks and no tint.
   */
  | {
      kind: 'sides-pdf';
      source: string;
      template: Template;
      options?: ExportOptions;
      names: string[];
      scenes: number[];
      today: string;
    }
  /** What the Export sides dialog lists (`SidesChoices`, as JSON): the characters and the scenes. */
  | { kind: 'sides-info'; source: string; template: Template };

/**
 * What the Export revised pages dialog opens with: the open set's name (null when the script isn't
 * locked), the body pages' labels in page order (for the range's ends), the default header for the
 * open set and the production's own (null when it has none), and whether any page carries the open
 * set's marks (`current`) or any set's (`any`), so an export with nothing to print is refused
 * before a picker.
 */
export interface RevisedInfo {
  open: string | null;
  labels: string[];
  defaultHeader: string;
  header: string | null;
  current: boolean;
  any: boolean;
}

/**
 * A novel's manuscript, as a PDF or a Word file (one member each, so a check of the kind narrows
 * the request): its text, the name its file goes by, the details its dialog keeps, the paper, and
 * the language.
 */
interface ManuscriptRequest<K extends 'manuscript-pdf' | 'manuscript-docx'> {
  kind: K;
  source: string;
  fileTitle: string;
  details: ManuscriptDetails;
  paper: Paper;
  lang: string;
}

/**
 * The Make a story map dialog's quick look (design §7): the lines of dialogue the page would use,
 * each with its speaker, the next line in its scene for Pick another (`next`, null with none),
 * and every line its scene offers (`choices`, in order, the pick among them; never a `[[No quote]]`
 * one); each lead's hook, as found (`found`) and as the metadata block has it edited (`hook`);
 * and whether any gap was found (the status's default, Call 18).
 */
export interface StoryMapPicks {
  quotes: Array<
    QuoteCandidate & {
      speaker: string;
      next: number | null;
      choices: Array<{ cue: number; text: string; speaker: string }>;
    }
  >;
  hooks: Array<{ key: string; name: string; hook: string | null; found: string | null }>;
  gapsFound: boolean;
}
/**
 * The file, and for a Markdown PDF the characters its fonts lack, printed as `?`; or why not.
 * `refused` is an export that had nothing to make (no revised pages), whose message is said as it
 * is, not as a failure.
 */
export type ExportReply =
  | { data: Uint8Array | string; missing?: string[] }
  | { error: string; refused?: true };

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
/** Where the app serves the story map's four WOFF2 faces (`@drafter/story-map`'s `fonts/`). */
const STORY_MAP_FONT_FOLDER = '/fonts/story-map/';
/** Where the app serves each manuscript font's four styles: Liberation Serif for Times, else Courier Prime. */
const MANUSCRIPT_FONT_FOLDER: Record<ManuscriptFont, string> = {
  times: '/fonts/liberation-serif/',
  courier: FONT_FOLDER,
};

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
 * The four styles of the one font a manuscript asked for, from the app's own origin: Liberation
 * Serif from /fonts/liberation-serif/ for `times`, Courier Prime from /fonts/courier-prime/ for
 * `courier`. Never the other font's.
 */
export async function fetchManuscriptFonts(
  font: ManuscriptFont,
  fetcher: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<ManuscriptFontSet> {
  const files = MANUSCRIPT_FONT_FILES[font];
  const faces = Object.keys(files) as ManuscriptFace[];
  const loaded = await Promise.all(
    faces.map(async (face) => {
      // The package's paths are under its `fonts/`; the app serves each font in its own folder.
      const file = files[face].split('/').at(-1) as string;
      return [face, await fontFile(fetcher, MANUSCRIPT_FONT_FOLDER[font], file)] as const;
    }),
  );
  return Object.fromEntries(loaded) as ManuscriptFontSet;
}

/** Fetches Anton, Archivo (two weights), and Courier Prime for a story map, from the app's own origin. */
export async function fetchStoryMapFonts(
  fetcher: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<StoryMapFonts> {
  const faces = Object.keys(STORY_MAP_FONT_FILES) as StoryMapFace[];
  const loaded = await Promise.all(
    faces.map(
      async (face) =>
        [face, await fontFile(fetcher, STORY_MAP_FONT_FOLDER, STORY_MAP_FONT_FILES[face])] as const,
    ),
  );
  return Object.fromEntries(loaded) as StoryMapFonts;
}

/**
 * The dialog's picks (`StoryMapPicks`) for `source`: the model as the page would draw it with every
 * line of dialogue in and no hook edited, so the dialog shows what was found.
 */
function storyMapPicks(source: string, template: Template, options: MapOptions): StoryMapPicks {
  const doc = parse(source);
  const layout = paginate(doc, template, { sceneNumbers: 'none' });
  const map = buildStoryMap({
    doc,
    template,
    layout,
    options: { ...options, status: null, include: { ...options.include, lines: true }, hooks: {} },
  });
  const candidates = quoteCandidates(doc, sceneIndex(doc, template, layout));
  const nameOf = (key: string) => map.characters.find((c) => c.key === key)?.name ?? key;
  const quotes = map.quotes.flatMap((quote) => {
    const pick = candidates.find((c) => c.cue === quote.cue);
    if (!quote.inScene || !pick) return [];
    const choices = candidates
      .filter((c) => c.scene === pick.scene && c.marked !== 'no-quote')
      .map((c) => ({ cue: c.cue, text: c.text, speaker: nameOf(c.character) }));
    const at = choices.findIndex((c) => c.cue === pick.cue);
    const next = choices.length > 1 ? (choices[(at + 1) % choices.length]?.cue ?? null) : null;
    return [{ ...pick, speaker: map.characters[quote.character]?.name ?? '', next, choices }];
  });
  const edited = storyMapMeta(doc.meta).hooks;
  const hooks = map.characters
    .filter((c) => c.lead)
    .map((c) => ({
      key: c.key,
      name: c.name,
      found: c.hook,
      hook: Object.hasOwn(edited, c.key) ? (edited[c.key] as string) : c.hook,
    }));
  return { quotes, hooks, gapsFound: map.gaps.found };
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * A revision set's header (production design §8): "Blue Revision — 12 November 2026", from its
 * name and its own date (YYYY-MM-DD), the date written as `longDate` writes one
 * (`whats-new/entries.ts`); the name alone when the date can't be read.
 */
export function revisionHeader(set: Pick<ProductionSet, 'name' | 'date'>): string {
  const [year, month, day] = set.date.split('-').map(Number);
  const name = MONTHS[(month ?? 0) - 1];
  if (!year || !day || !name) return `${set.name} Revision`;
  return `${set.name} Revision — ${day} ${name} ${year}`;
}

/** A render's progress as the export's: saving says nothing until it ends, so it is unknown. */
const rendering =
  (report: ProgressReporter) =>
  ({ stage, done, total }: RenderProgress) => {
    if (stage === 'save' && done < total) report.unknown();
    else report.step(stage, done, total);
  };

/** A renderer's `source`, the text to carry inside the file, when there is one. */
const embedded = (embed: string | undefined) => (embed === undefined ? {} : { source: embed });

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
 * Markdown, HTML, and EPUB files are quick: unknown, then 1. A story map is the model of the script
 * (`@drafter/story-map`) drawn as one page with its own fonts, loaded once; its dialog's picks are
 * the same model, as JSON. A novel's manuscript is its text parsed as a document's PDF is, read as
 * a book (`@drafter/novel`), and drawn as a PDF in the one font it asked for (each font loaded once,
 * by the first manuscript in it), or written as a Word file, which embeds no fonts.
 */
export function createExporter(
  loadFonts: () => Promise<FontSet> = fetchFonts,
  loadDocumentFonts: () => Promise<DocumentFontSet> = fetchDocumentFonts,
  loadStoryMapFonts: () => Promise<StoryMapFonts> = fetchStoryMapFonts,
  loadManuscriptFonts: (font: ManuscriptFont) => Promise<ManuscriptFontSet> = fetchManuscriptFonts,
) {
  const fontsOnce = once(loadFonts);
  const documentFontsOnce = once(loadDocumentFonts);
  const storyMapFontsOnce = once(loadStoryMapFonts);
  const manuscriptFontsOnce: Record<ManuscriptFont, () => Promise<ManuscriptFontSet>> = {
    times: once(() => loadManuscriptFonts('times')),
    courier: once(() => loadManuscriptFonts('courier')),
  };
  const parserOnce = once(() => import('../markdown/parse'));

  async function exportOne(request: ExportRequest, report: ProgressReporter): Promise<ExportReply> {
    if (request.kind === 'story-map-picks') {
      return {
        data: JSON.stringify(storyMapPicks(request.source, request.template, request.options)),
      };
    }
    if (request.kind === 'story-map') {
      const { source, template, options } = request;
      const doc = parse(source);
      // The page's own numbering, never the export options' (design §8).
      const layout = paginate(doc, template, { sceneNumbers: 'none' });
      const map = buildStoryMap({ doc, template, layout, options });
      return {
        data: renderStoryMap({
          map,
          fonts: await storyMapFontsOnce(),
          lang: request.lang,
          generator: request.generator,
        }),
      };
    }
    if (request.kind === 'markdown-html') {
      const { parseMarkdown } = await parserOnce();
      const { title, lang, generator } = request;
      return {
        data: renderDocumentHtml({
          tree: parseMarkdown(request.source),
          title,
          lang,
          generator,
          ...embedded(request.embed),
        }),
      };
    }
    if (request.kind === 'markdown-epub') {
      const { parseMarkdown } = await parserOnce();
      const { source, title, lang, generator } = request;
      return {
        data: renderDocumentEpub({
          tree: parseMarkdown(source),
          title,
          lang,
          generator,
          modified: new Date(request.modified),
          // The same work is the same book, so a re-export replaces the old one on an e-reader.
          id: epubIdentifier({ project: request.projectId, title }),
          ...embedded(request.embed),
        }),
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
    if (request.kind === 'manuscript-pdf' || request.kind === 'manuscript-docx') {
      const { source, paper, lang } = request;
      const { parseMarkdown } = await parserOnce();
      const details = resolveDetails(source, request.fileTitle, request.details);
      const ms = manuscriptOf(source, parseMarkdown(source), details);
      if (request.kind === 'manuscript-docx') {
        return { data: renderManuscriptDocx(ms, { paper, lang }) };
      }
      // A font it doesn't know is Times, as the renderer draws it.
      const fonts = await (manuscriptFontsOnce[ms.font] ?? manuscriptFontsOnce.times)();
      const { bytes, missing } = await renderManuscriptPdf(ms, {
        fonts,
        paper,
        lang,
        onProgress: rendering(report),
      });
      return { data: bytes, missing };
    }
    if (request.kind === 'revised-info') {
      return {
        data: JSON.stringify(await revisedInfo(request.source, request.template, request.options)),
      };
    }
    if (request.kind === 'sides-info') {
      const { source, template } = request;
      const numbers = await productionSceneNumbers(source, template);
      return { data: JSON.stringify(sidesChoices(parse(source), template, numbers)) };
    }
    if (request.kind === 'sides-pdf') {
      const fonts = await fontsOnce();
      return { data: await sidesPdf(request, fonts, rendering(report)) };
    }
    if (request.kind === 'revised-pdf') {
      const fonts = await fontsOnce();
      return { data: await revisedPdf(request, fonts, rendering(report)) };
    }
    if (request.kind === 'breakdown-csv' || request.kind === 'breakdown-pdf') {
      return { data: await breakdown(request, documentFontsOnce) };
    }
    const { kind, source, template, options = DEFAULT_EXPORT_OPTIONS } = request;
    const parsed = parse(source);
    const doc = { ...parsed, titlePage: titlePageFor(parsed.titlePage, options.titlePage) };
    // Notes go into a Final Draft file only when Include notes says so: Final Draft prints them.
    if (kind === 'fdx') return { data: toFdx(doc, template, { notes: options.notes }) };
    if (kind === 'md') {
      const { sceneNumbers, notes } = options;
      const index = sceneIndex(doc, template);
      return { data: scriptMarkdown(doc, index, template, { sceneNumbers, notes }) };
    }
    // Plain text prints a locked script's pages as the PDF does, at their locked labels (12A,
    // 13-14) and with its scenes' A-numbers (ruling F1); it has no margin for revision marks.
    if (kind === 'txt') {
      const { layout } = await productionLayout(source, template, {
        sceneNumbers: options.sceneNumbers,
        titlePage: options.titlePage,
        marks: 'none',
      });
      return { data: renderText(layout, template) };
    }
    // A locked script prints on its locked pages, with the open set's marks unless Revision marks
    // says None; an unlocked one is laid out exactly as `paginate` lays it out. An EPUB is the
    // Reading view, which prints no pages, so it never spends the time finding marks.
    const marks = kind === 'epub' ? 'none' : (options.revisionMarks ?? 'open');
    const production = await productionLayout(source, template, {
      sceneNumbers: options.sceneNumbers,
      titlePage: options.titlePage,
      marks,
    });
    const { layout } = production;
    // A production's own header, else the open set's (Ruling 5b: one header per script).
    const header =
      production.locked && marks === 'open' && production.open
        ? { revisionHeader: production.header ?? revisionHeader(production.open) }
        : {};
    const fonts = await fontsOnce();
    if (request.kind === 'html') {
      // Only the styles the pages draw in: the file embeds no other.
      const used = [...stylesUsed(layout)].map((style) => [style, fonts[style]] as const);
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
          kindLine: kindLine(layout, template, request.minutesPerPage),
          ...header,
          ...embedded(request.embed),
        }),
      };
    }
    if (request.kind === 'epub') {
      // The Reading view as an e-book: only the styles its text draws in.
      const used = [...epubStylesUsed(doc, layout)].map((style) => [style, fonts[style]] as const);
      return {
        data: renderScriptEpub({
          doc,
          layout,
          template,
          notes: options.notes,
          fonts: Object.fromEntries(used) as Partial<Record<FontStyle, Uint8Array>>,
          title: request.title,
          lang: request.lang,
          generator: request.generator,
          // The title page as the export keeps it: with none, the book names no author either.
          author: scriptAuthor(doc),
          modified: new Date(request.modified),
          // The work's identity, not its text's: the project, else the title and the title
          // page's author (as written), so a reader app knows a new copy for the same book. With no
          // title page (a blind submission), a new random id, so the copy can't be tied to the
          // named ones or to a guessed author (red/blue audit, 2026-11-03).
          id:
            options.titlePage === 'none'
              ? `urn:uuid:${crypto.randomUUID()}`
              : epubIdentifier({
                  project: request.projectId,
                  title: request.title,
                  author: scriptAuthor(parsed),
                }),
          ...embedded(request.embed),
        }),
      };
    }
    return {
      data: await renderPdf(layout, template, { fonts, onProgress: rendering(report), ...header }),
    };
  }

  return async (
    request: ExportRequest,
    onProgress: (fraction: number | null) => void = () => {},
  ): Promise<ExportReply> => {
    const weights: StageWeights =
      request.kind === 'markdown-pdf' ||
      request.kind === 'markdown-html' ||
      request.kind === 'markdown-epub' ||
      request.kind === 'manuscript-pdf' ||
      request.kind === 'manuscript-docx'
        ? WEIGHTS.markdown
        : WEIGHTS.script;
    const report = progressReporter(weights, onProgress);
    try {
      report.unknown();
      const reply = await exportOne(request, report);
      report.done();
      return reply;
    } catch (error) {
      if (error instanceof ExportRefusal) return { error: error.message, refused: true };
      return { error: error instanceof Error ? error.message : String(error) };
    }
  };
}

/** The dialog's `RevisedInfo` for `source`, laid out as its revised pages would be. */
async function revisedInfo(
  source: string,
  template: Template,
  options: ExportOptions = DEFAULT_EXPORT_OPTIONS,
): Promise<RevisedInfo> {
  const opts = { sceneNumbers: options.sceneNumbers, titlePage: 'none' } as const;
  const all = await productionLayout(source, template, { ...opts, marks: 'all' });
  const open = all.open;
  const body = all.layout.pages.filter((page) => page.number !== 0);
  const any = revisedPages(all.layout, { kind: 'all' }).pages.length > 0;
  // The open set's pages are among every set's: only then is it worth laying the script out again.
  const current =
    any &&
    open !== null &&
    revisedPages((await productionLayout(source, template, { ...opts, marks: 'open' })).layout, {
      kind: 'current',
    }).pages.length > 0;
  return {
    open: all.locked && open ? open.name : null,
    labels: body.map((page) => page.label),
    defaultHeader: open ? revisionHeader(open) : '',
    header: all.header,
    current,
    any,
  };
}

/** `2026-11-09` as `9 November 2026`; as it is when it can't be read. */
export function longDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const name = MONTHS[(month ?? 0) - 1];
  return year && day && name ? `${day} ${name} ${year}` : iso;
}

/**
 * The breakdown report (production design §9): a CSV as text, or a table PDF in the document
 * fonts, on the template's paper, dated `today`. The pages are the locked ones for a locked script.
 */
async function breakdown(
  request: Extract<ExportRequest, { kind: 'breakdown-csv' | 'breakdown-pdf' }>,
  documentFonts: () => Promise<DocumentFontSet>,
): Promise<string | Uint8Array> {
  const { source, template } = request;
  const { layout, degraded, sceneNumbers } = await productionLayout(source, template, {
    sceneNumbers: 'none',
    titlePage: 'none',
    marks: 'none',
  });
  if (degraded) throw new ExportRefusal(DEGRADED);
  const rows = breakdownRows(parse(source), template, layout, sceneNumbers);
  if (request.kind === 'breakdown-csv') return toCsv([[...BREAKDOWN_COLUMNS], ...rows]);
  return renderTablePdf(
    {
      title: request.title,
      date: longDate(request.today),
      columns: [...BREAKDOWN_COLUMNS],
      rows,
    },
    { fonts: await documentFonts(), paper: template.page.paper === 'a4' ? 'a4' : 'letter' },
  );
}

/**
 * A locked script's revised pages as a PDF (production design §8). The pages are chosen from a
 * layout with the open set's marks (the current revision) or every set's (all revisions, a range),
 * and printed from one with the marks asked for; both are laid out on the same locked pages, so
 * their pages line up. Nothing to print, or a script that isn't locked, is refused
 * (`ExportRefusal`), with no file.
 */
async function revisedPdf(
  request: Extract<ExportRequest, { kind: 'revised-pdf' }>,
  fonts: FontSet,
  onProgress: (progress: RenderProgress) => void,
): Promise<Uint8Array> {
  const { source, template, which, marks, options = DEFAULT_EXPORT_OPTIONS } = request;
  const opts = { sceneNumbers: options.sceneNumbers, titlePage: 'none' } as const;
  const printed = await productionLayout(source, template, { ...opts, marks });
  if (printed.degraded) throw new ExportRefusal(DEGRADED);
  if (!printed.locked || !printed.open) throw new ExportRefusal(NOT_LOCKED_REVISED);
  const chooseMarks = which.kind === 'current' ? 'open' : 'all';
  const chooseBy =
    which.kind === 'range' || chooseMarks === marks
      ? printed.layout
      : (await productionLayout(source, template, { ...opts, marks: chooseMarks })).layout;
  const layout = revisedPages(printed.layout, which, chooseBy);
  if (layout.pages.length === 0) throw new ExportRefusal(noRevisedPages(which, printed.open.name));
  let tint: ((page: Page) => string | null) | undefined;
  if (request.tint) {
    // Each page in the colour of the newest set with a mark on it (Ruling 5d), whichever marks
    // print: read from a layout with every set's marks. The current revision's pages all carry
    // the open set's, the newest, so the printed layout says as much for them.
    const tintBy =
      marks === 'all' || which.kind === 'current'
        ? printed.layout
        : which.kind === 'all'
          ? chooseBy
          : (await productionLayout(source, template, { ...opts, marks: 'all' })).layout;
    const colours = pageColours(tintBy, printed.sets);
    tint = (page) => colours.get(page.number) ?? null;
  }
  return renderPdf(layout, template, {
    fonts,
    onProgress,
    revisionHeader: request.header,
    ...(tint ? { tint } : {}),
  });
}

/**
 * One actor's sides as a PDF (production design §10): laid out as the full PDF is (the export
 * options' scene numbers, the open set's marks, no tint, no title page), cut to the pages the
 * ticked scenes are on, with the other scenes' lines crossed out and the header under each page
 * number. Nothing ticked is refused (`ExportRefusal`), with no file.
 */
async function sidesPdf(
  request: Extract<ExportRequest, { kind: 'sides-pdf' }>,
  fonts: FontSet,
  onProgress: (progress: RenderProgress) => void,
): Promise<Uint8Array> {
  const { source, template, options = DEFAULT_EXPORT_OPTIONS } = request;
  const doc = parse(source);
  const known = new Set(sidesChoices(doc, template).scenes.map((scene) => scene.ordinal));
  const scenes = request.scenes.filter((ordinal) => known.has(ordinal));
  if (scenes.length === 0) throw new ExportRefusal('Tick at least one scene to print.');
  const { layout, degraded, sceneNumbers } = await productionLayout(source, template, {
    sceneNumbers: options.sceneNumbers,
    titlePage: 'none',
    marks: 'open',
  });
  if (degraded) throw new ExportRefusal(DEGRADED);
  const cut = sides(layout, doc, template, scenes);
  if (cut.layout.pages.length === 0) throw new ExportRefusal('Tick at least one scene to print.');
  return renderPdf(cut.layout, template, {
    fonts,
    onProgress,
    revisionHeader: sidesHeader(
      request.names,
      sceneList(doc, template, scenes, sceneNumbers),
      longDate(request.today),
    ),
    crossOut: cut.crossOut,
  });
}

/**
 * Each body page's tint, by its number: the paper colour (`paperTint`) of the newest of `sets`
 * (oldest first) with a mark on it; a page with none, or whose set is White or has a name with no
 * paper colour, has no entry. renderPdf ignores a colour that isn't `#rrggbb`.
 */
function pageColours(layout: Layout, sets: readonly ProductionSet[]): Map<number, string> {
  const rank = new Map(sets.map((set, i) => [set.name, i]));
  const colours = new Map<number, string>();
  for (const page of layout.pages) {
    if (page.number === 0) continue;
    let newest = -1;
    for (const line of page.lines) {
      for (const mark of [line.mark, line.right?.mark]) {
        if (mark) newest = Math.max(newest, rank.get(mark.set) ?? -1);
      }
    }
    const tint = paperTint(sets[newest]?.name ?? '');
    if (tint) colours.set(page.number, tint);
  }
  return colours;
}
