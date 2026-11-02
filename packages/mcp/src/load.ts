// A file to what the tools read (§3): a script parsed, laid out, indexed, with its cast and its
// story map; or a Markdown document and its sections. Read only through a checked path, opened
// without following a link and only if it is still the file that was checked, and judged by what
// is inside it as the app's Open judges it (inside.ts); kept in the reader's memory by real path,
// size, and modified time.
import { createHash } from 'node:crypto';
import { type Cast, castOf } from '@drafter/cast';
import { markdownAnchors, splitLines } from '@drafter/compare';
import { type Doc, parse } from '@drafter/fountain';
import { type Layout, paginate } from '@drafter/layout';
import { findMarkdownMeta, markdownTitle } from '@drafter/markdown';
import { linesPerPage, type SceneIndex, sceneIndex } from '@drafter/outline';
import { buildStoryMap, type StoryMap, storyMapMeta } from '@drafter/story-map';
import { builtins, type Template } from '@drafter/templates';
import { type Format, formatOf } from './formats';
import { type Content, readInside } from './inside';
import { type Checked, Refusal, resolvePath } from './paths';
import type { ToolContext } from './tools/index';

export type Loaded =
  | {
      kind: 'script';
      file: Checked;
      format: Format;
      /** What was found inside the file, whatever its name says. */
      content: Content;
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
      /** What was found inside the file, whatever its name says. */
      content: Content;
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

let afterCheck: (() => void) | undefined;

/**
 * For tests only (the trap suite's swap): `hook` runs once a path is checked and before the file
 * is read, so a test can put a link in the file's place between the two. Never set in the program.
 */
export function __afterCheckForTests(hook: (() => void) | undefined): void {
  afterCheck = hook;
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

/**
 * The story map of a script as Story map builds it, with no contact: `status` null for the one
 * its gaps give, else the writer's choice (Finished leaves the planned scenes out).
 */
export function mapOf(
  script: { doc: Doc; template: Template; layout: Layout; file: Checked; text: string },
  status: StoryMap['status'] | null,
  wordsPerMinute: number,
): StoryMap {
  const { doc, template, layout, file, text } = script;
  const { plannedPages, hooks } = storyMapMeta(doc.meta);
  const logline = titleField(doc, 'logline');
  return buildStoryMap({
    doc,
    template,
    layout,
    options: {
      status,
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
}

function loadScript(
  file: Checked,
  format: Format,
  content: Content,
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
  const map = mapOf({ doc, template, layout, file, text }, null, wordsPerMinute);
  return {
    kind: 'script',
    file,
    format,
    content,
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

function loadMarkdown(file: Checked, format: Format, content: Content, text: string): Loaded {
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
  return {
    kind: 'markdown',
    file,
    format,
    content,
    text,
    title: markdownTitle(text) ?? null,
    sections,
  };
}

/** The file a tool's path names, read and parsed (or the cached parse, while it is unchanged). */
export async function load(path: string, ctx: ToolContext): Promise<Loaded> {
  const { roots, platform, options } = ctx.data;
  const file = await resolvePath(path, roots, platform, 'file');
  const name = file.shown.slice(file.shown.lastIndexOf('/') + 1);
  const format = formatOf(name);
  if (format === null) throw new Refusal(NOT_READ);
  const cached = ctx.cache.get(file.real, file.size, file.mtimeMs) as Loaded | undefined;
  if (cached) return { ...cached, file };

  afterCheck?.();
  // Judged by what is inside, in Open's order, whatever the name says.
  const inside = await readInside(file, name);
  parses++;
  const loaded = inside.markdown
    ? loadMarkdown(file, format, inside.content, inside.text)
    : loadScript(file, format, inside.content, inside.text, inside.notes, options.wordsPerMinute);
  ctx.cache.set(file.real, file.size, file.mtimeMs, loaded);
  return loaded;
}
