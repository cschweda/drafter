// A file to what the tools read (§3): a script parsed, laid out, indexed, with its cast and its
// story map; or a Markdown document and its sections. Read only through a checked path, opened
// without following a link and only if it is still the file that was checked; kept in the
// reader's memory by real path, size, and modified time.
import { createHash } from 'node:crypto';
import { MAX_SCRIPT_BYTES } from '@drafter/archive';
import { Refused, readCapped, readScriptFile, strictText } from '@drafter/archive/node';
import { type Cast, castOf } from '@drafter/cast';
import { markdownAnchors, splitLines } from '@drafter/compare';
import { type Doc, parse } from '@drafter/fountain';
import { type Layout, paginate } from '@drafter/layout';
import { findMarkdownMeta, markdownTitle } from '@drafter/markdown';
import { linesPerPage, type SceneIndex, sceneIndex } from '@drafter/outline';
import { buildStoryMap, type StoryMap, storyMapMeta } from '@drafter/story-map';
import { builtins, type Template } from '@drafter/templates';
import { type Format, formatOf } from './formats';
import { type Checked, Refusal, resolvePath } from './paths';
import type { ToolContext } from './tools/index';

export type Loaded =
  | {
      kind: 'script';
      file: Checked;
      format: Format;
      text: string;
      doc: Doc;
      template: Template;
      layout: Layout;
      index: SceneIndex;
      cast: Cast;
      map: StoryMap;
      /** What an import from another app brought in as notes. */
      importNotes: number;
    }
  | {
      kind: 'markdown';
      file: Checked;
      format: Format;
      text: string;
      title: string | null;
      /** Its headings of levels 1 to 3, each to the next (or to the metadata comment, or the end). */
      sections: Array<{ title: string; from: number; to: number }>;
    };

export const NOT_READ =
  'Drafter for Claude doesn’t read that kind of file. It reads Fountain, plain text, Markdown, Final Draft, Highland, and Fade In files, and Drafter’s HTML and EPUB exports.';

const SCREENPLAY = builtins['us-screenplay'] as Template;

let parses = 0;

/** For tests only: how many files have been parsed in this thread. */
export function __parsesForTests(): number {
  return parses;
}

/** A title-page field's text, its lines joined by spaces; empty when there is none. */
export function titleField(doc: Doc, key: string): string {
  const field = doc.titlePage?.fields.find((f) => f.key.trim().toLowerCase() === key);
  return (
    field?.runs
      .map((runs) =>
        runs
          .map((run) => run.text)
          .join('')
          .trim(),
      )
      .filter((line) => line !== '')
      .join(' ') ?? ''
  );
}

const DRAFT_ID = /^[0-9a-f]{64}$/;

/** As the CLI: a Drafter draft file's number and ID, else Draft 01 and the text's SHA-256. */
function draftOf(doc: Doc, text: string): { number: number; id: string } {
  const number = doc.meta?.draft;
  const id = doc.meta?.id;
  if (
    typeof number === 'number' &&
    Number.isSafeInteger(number) &&
    number >= 1 &&
    typeof id === 'string' &&
    DRAFT_ID.test(id)
  )
    return { number, id };
  return { number: 1, id: createHash('sha256').update(text).digest('hex') };
}

/** As the CLI: the file's own template when it is built in, else the US screenplay. */
export function templateFor(doc: Doc): Template {
  const named = doc.meta?.template;
  return typeof named === 'string' && Object.hasOwn(builtins, named)
    ? (builtins[named] as Template)
    : SCREENPLAY;
}

/** The file's stem, as shown: `Signal Hill – 101`. */
const stemOf = (shown: string) => {
  const name = shown.slice(shown.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
};

function loadScript(
  file: Checked,
  format: Format,
  text: string,
  importNotes: number,
  wordsPerMinute: number,
): Loaded {
  const doc = parse(text);
  const template = templateFor(doc);
  const layout = paginate(doc, template);
  const index = sceneIndex(doc, template, layout);
  // As the story map: only capitals count, as with no dictionary.
  const cast = castOf(index, doc, template, linesPerPage(layout), () => undefined);
  const { plannedPages, hooks } = storyMapMeta(doc.meta);
  const logline = titleField(doc, 'logline');
  const map = buildStoryMap({
    doc,
    template,
    layout,
    options: {
      status: null,
      plannedPages,
      logline: logline === '' ? null : logline,
      greeting: "What I'm writing",
      explain: null,
      include: { summaries: true, lines: true, threads: true, contact: false },
      contact: null,
      hooks,
      rates: { minutesPerPage: 1, wordsPerMinute },
      draft: draftOf(doc, text),
      updated: file.mtimeMs,
      title: titleField(doc, 'title') || stemOf(file.shown),
    },
  });
  return {
    kind: 'script',
    file,
    format,
    text,
    doc,
    template,
    layout,
    index,
    cast,
    map,
    importNotes,
  };
}

function loadMarkdown(file: Checked, format: Format, text: string): Loaded {
  const meta = findMarkdownMeta(text);
  const end = meta ? meta.from : text.length;
  const { starts } = splitLines(text);
  const anchors = markdownAnchors(text).filter((anchor) => (starts[anchor.line] ?? 0) < end);
  const sections = anchors.map((anchor, i) => {
    const next = anchors[i + 1];
    return {
      title: anchor.title,
      from: starts[anchor.line] as number,
      to: next ? (starts[next.line] as number) : end,
    };
  });
  return { kind: 'markdown', file, format, text, title: markdownTitle(text) ?? null, sections };
}

const tooBig = () => new Refused('it is larger than 5 MB');

/** An import's own refusal (Final Draft, Highland, Fade In): its words, never a path. */
const IMPORT_ERRORS = new Set(['FdxError', 'ArchiveError', 'OsfError']);

/** The file a tool's path names, read and parsed (or the cached parse, while it is unchanged). */
export async function load(path: string, ctx: ToolContext): Promise<Loaded> {
  const { roots, platform, options } = ctx.data;
  const file = await resolvePath(path, roots, platform, 'file');
  const format = formatOf(file.shown.slice(file.shown.lastIndexOf('/') + 1));
  if (format === null) throw new Refusal(NOT_READ);
  const cached = ctx.cache.get(file.real, file.size, file.mtimeMs) as Loaded | undefined;
  if (cached) return { ...cached, file };

  const read = { noFollow: true, expect: { dev: file.dev, ino: file.ino } };
  let loaded: Loaded;
  try {
    if (format === 'fountain' || format === 'text' || format === 'markdown') {
      const text = strictText(await readCapped(file.real, MAX_SCRIPT_BYTES, tooBig, read));
      parses++;
      loaded =
        format === 'markdown'
          ? loadMarkdown(file, format, text)
          : loadScript(file, format, text, 0, options.wordsPerMinute);
    } else {
      const got = await readScriptFile(file.real, 'it holds no script Drafter can read', read);
      parses++;
      loaded = got.markdown
        ? loadMarkdown(file, format, got.text)
        : loadScript(file, format, got.text, got.notes, options.wordsPerMinute);
    }
  } catch (error) {
    if (error instanceof Error && IMPORT_ERRORS.has(error.name)) throw new Refusal(error.message);
    throw error;
  }
  ctx.cache.set(file.real, file.size, file.mtimeMs, loaded);
  return loaded;
}
