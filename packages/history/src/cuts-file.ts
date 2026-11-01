// The cuts file beside the work (drafts and cuts design §4): `Boca.fountain.cuts.md`, a Markdown
// document a writer can read without Drafter, newest cut first. Each cut is a `## title`, a line
// saying when and where it was cut, its text (a script's in a fence, a Markdown document's as it
// is, headings one level down), and a trailing `<!-- drafter-cut {json} -->` comment with the
// exact entry. Reading the file reads only those comments, so a writer can tidy the prose freely,
// and an entry whose comment was damaged loses only itself.

import { commentJson } from '@drafter/markdown';
import type { WorkKind } from './draft-file';

/** One cut: a piece of text that left the work, and every time it did. */
export interface CutEntry {
  /** The SHA-256 of `text`, so the same text cut twice is one entry. */
  id: string;
  /** A scene's heading, a section's title, or a passage's first words. */
  title: string;
  /** The text that was cut, exactly. */
  text: string;
  kind: WorkKind;
  /** When it was cut, and in which draft (null before the first draft was started). */
  cuts: { at: string; draft: number | null }[];
  /** What it was between: the heading or words before and after it, null at the start or end. */
  where: { after: string | null; before: string | null };
  /** When it was put back, if it was. */
  putBack?: string;
}

const COMMENT_OPENER = '<!-- drafter-cut ';
const COMMENT_CLOSER = ' -->';

const ID = /^[0-9a-f]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isIso = (at: unknown): at is string =>
  typeof at === 'string' && ISO.test(at) && !Number.isNaN(Date.parse(at));
const isStringOrNull = (s: unknown): s is string | null => s === null || typeof s === 'string';

/** The newest date the entry was cut. */
function latest(entry: CutEntry): string {
  let at = '';
  for (const cut of entry.cuts) if (cut.at > at) at = cut.at;
  return at;
}

/** The earliest date the entry was cut. */
function earliest(entry: CutEntry): string {
  let at = '';
  for (const cut of entry.cuts) if (at === '' || cut.at < at) at = cut.at;
  return at;
}

/** Newest cut first; the same moment, by ID. */
function newestFirst(a: CutEntry, b: CutEntry): number {
  const la = latest(a);
  const lb = latest(b);
  if (la !== lb) return la > lb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** "3 Nov 2026", in UTC so every computer writes the same file. */
function day(at: string): string {
  const d = new Date(at);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Prose on one line: line breaks become spaces. */
function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim();
}

/** "Cut while writing Draft 12, 3 Nov 2026 (and Draft 14, 9 Nov 2026) · from between … · id …". */
function cutLine(entry: CutEntry): string {
  const sorted = [...entry.cuts].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const when = sorted.map((c) => (c.draft === null ? day(c.at) : `Draft ${c.draft}, ${day(c.at)}`));
  const [first = '', ...rest] = when;
  let line = sorted[0]?.draft != null ? `Cut while writing ${first}` : `Cut ${first}`;
  if (rest.length > 0) line += ` (and ${rest.join('; ')})`;
  const { after, before } = entry.where;
  if (after !== null && before !== null) {
    line += ` · from between "${oneLine(after)}" and "${oneLine(before)}"`;
  } else if (before !== null) {
    line += ` · from the start, before "${oneLine(before)}"`;
  } else if (after !== null) {
    line += ` · from the end, after "${oneLine(after)}"`;
  }
  return `${line} · id ${entry.id.slice(0, 12)}`;
}

/**
 * The text's lines as shown, with `\n` breaks. A line that starts like an entry's comment gets a
 * space in front, so only the real comments are read back.
 */
function shownLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (line.startsWith(COMMENT_OPENER.trimEnd()) ? ` ${line}` : line));
}

/** The longest run of backticks in the text. Linear. */
function longestBacktickRun(text: string): number {
  let longest = 0;
  let run = 0;
  for (let i = 0; i < text.length; i++) {
    run = text.charCodeAt(i) === 96 ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  return longest;
}

/** A script's cut text in a fence longer than any run of backticks inside it. */
function fountainShown(text: string): string {
  const fence = '`'.repeat(Math.max(3, longestBacktickRun(text) + 1));
  const lines = shownLines(text);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return `${fence}fountain\n${lines.join('\n')}\n${fence}`;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ATX = /^( {0,3})(#{1,6})(?=[ \t]|$)/;

/**
 * A Markdown document's cut text as it is, but its `#` headings one level down (`######` kept),
 * outside code fences, and a fence left open closed, so the next entry isn't swallowed.
 */
function markdownShown(text: string): string {
  const lines = shownLines(text);
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  let open: string | null = null;
  const out = lines.map((line) => {
    const fence = FENCE.exec(line);
    if (open !== null) {
      if (
        fence &&
        (fence[1] as string)[0] === open[0] &&
        (fence[1] as string).length >= open.length &&
        line.slice(fence[0].length).trim() === ''
      ) {
        open = null;
      }
      return line;
    }
    if (fence) {
      open = fence[1] as string;
      return line;
    }
    const heading = ATX.exec(line);
    if (heading && (heading[2] as string).length < 6) {
      return `${heading[1]}#${line.slice((heading[1] as string).length)}`;
    }
    return line;
  });
  if (open !== null) out.push(open);
  return out.join('\n');
}

/** The entry as JSON, its keys in a fixed order. */
function entryJson(entry: CutEntry): string {
  const value: Record<string, unknown> = {
    id: entry.id,
    title: entry.title,
    text: entry.text,
    kind: entry.kind,
    cuts: entry.cuts.map((c) => ({ at: c.at, draft: c.draft })),
    where: { after: entry.where.after, before: entry.where.before },
  };
  if (entry.putBack !== undefined) value.putBack = entry.putBack;
  return commentJson(value);
}

/**
 * The cuts file for a work (named by its whole file name, `Boca.fountain`): a header, then every
 * entry, newest cut first.
 */
export function cutsFile(work: string, entries: readonly CutEntry[]): string {
  const name = oneLine(work) || 'this work';
  const parts = [
    `# Cuts from ${name}`,
    `Everything cut from ${name} while writing, newest first. Drafter keeps this file next to the work and only ever adds to it. The comment after each cut holds it exactly, for Drafter to read back.`,
  ];
  for (const entry of [...entries].sort(newestFirst)) {
    parts.push(
      `## ${oneLine(entry.title) || 'Untitled cut'}`,
      cutLine(entry),
      entry.kind === 'fountain' ? fountainShown(entry.text) : markdownShown(entry.text),
      `${COMMENT_OPENER}${entryJson(entry)}${COMMENT_CLOSER}`,
    );
  }
  return `${parts.join('\n\n')}\n`;
}

/** The entry an entry's comment holds, or null when its fields don't read strictly. */
function entryOf(value: unknown): CutEntry | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !ID.test(v.id)) return null;
  if (typeof v.title !== 'string' || typeof v.text !== 'string') return null;
  if (v.kind !== 'fountain' && v.kind !== 'markdown') return null;
  if (!Array.isArray(v.cuts) || v.cuts.length === 0) return null;
  const cuts: CutEntry['cuts'] = [];
  for (const c of v.cuts as unknown[]) {
    if (c === null || typeof c !== 'object') return null;
    const { at, draft } = c as Record<string, unknown>;
    if (!isIso(at)) return null;
    if (
      draft !== null &&
      !(typeof draft === 'number' && Number.isSafeInteger(draft) && draft >= 1)
    ) {
      return null;
    }
    cuts.push({ at, draft: draft as number | null });
  }
  const where = v.where as Record<string, unknown> | null;
  if (where === null || typeof where !== 'object' || Array.isArray(where)) return null;
  if (!isStringOrNull(where.after) || !isStringOrNull(where.before)) return null;
  if (v.putBack !== undefined && !isIso(v.putBack)) return null;
  const entry: CutEntry = {
    id: v.id,
    title: v.title,
    text: v.text,
    kind: v.kind,
    cuts,
    where: { after: where.after, before: where.before },
  };
  if (v.putBack !== undefined) entry.putBack = v.putBack as string;
  return entry;
}

/**
 * The entries of a cuts file, in the file's order, from its `<!-- drafter-cut … -->` comments
 * alone (each at a line's start). A comment whose JSON or fields don't read is counted in
 * `skipped` and the rest kept. One pass over the lines: linear.
 */
export function readCutsFile(file: string): { entries: CutEntry[]; skipped: number } {
  const entries: CutEntry[] = [];
  let skipped = 0;
  let start = 0;
  while (start < file.length) {
    let end = file.indexOf('\n', start);
    if (end < 0) end = file.length;
    if (file.startsWith(COMMENT_OPENER, start)) {
      let lineEnd = end;
      if (lineEnd > start && file.charCodeAt(lineEnd - 1) === 13) lineEnd--;
      let entry: CutEntry | null = null;
      if (file.startsWith(COMMENT_CLOSER, lineEnd - COMMENT_CLOSER.length)) {
        try {
          entry = entryOf(
            JSON.parse(file.slice(start + COMMENT_OPENER.length, lineEnd - COMMENT_CLOSER.length)),
          );
        } catch {
          entry = null;
        }
      }
      if (entry) entries.push(entry);
      else skipped++;
    }
    start = end + 1;
  }
  return { entries, skipped };
}

/** A stable order for two versions of one entry: the first cut, then the JSON. */
function earlierVersion(a: CutEntry, b: CutEntry): CutEntry {
  const ea = earliest(a);
  const eb = earliest(b);
  if (ea !== eb) return ea < eb ? a : b;
  return entryJson(a) <= entryJson(b) ? a : b;
}

/**
 * Two lists of cuts as one (two computers' copies of a cuts file, say): every entry of either, one
 * per ID, with every date it was cut on either side (once each, oldest first), the earliest Put
 * back, and the title, text and place of the version first cut. Newest cut first. The same
 * whichever way round, and merging again changes nothing.
 */
export function mergeCuts(a: readonly CutEntry[], b: readonly CutEntry[]): CutEntry[] {
  const byId = new Map<string, CutEntry[]>();
  for (const entry of [...a, ...b]) {
    const list = byId.get(entry.id);
    if (list) list.push(entry);
    else byId.set(entry.id, [entry]);
  }
  const merged: CutEntry[] = [];
  for (const versions of byId.values()) {
    const base = versions.reduce(earlierVersion);
    const seen = new Map<string, { at: string; draft: number | null }>();
    let putBack: string | undefined;
    for (const v of versions) {
      for (const c of v.cuts) seen.set(`${c.at}|${c.draft}`, { at: c.at, draft: c.draft });
      if (v.putBack !== undefined && (putBack === undefined || v.putBack < putBack)) {
        putBack = v.putBack;
      }
    }
    const cuts = [...seen.values()].sort((x, y) =>
      x.at !== y.at ? (x.at < y.at ? -1 : 1) : (x.draft ?? 0) - (y.draft ?? 0),
    );
    const entry: CutEntry = {
      id: base.id,
      title: base.title,
      text: base.text,
      kind: base.kind,
      cuts,
      where: { after: base.where.after, before: base.where.before },
    };
    if (putBack !== undefined) entry.putBack = putBack;
    merged.push(entry);
  }
  return merged.sort(newestFirst);
}
