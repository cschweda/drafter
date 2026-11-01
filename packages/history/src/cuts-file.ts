// The cuts file beside the work (drafts and cuts design §4): `Boca.fountain.cuts.md`, a Markdown
// document a writer can read without Drafter, newest cut first. Each cut is a `## title`, a line
// saying when and where it was cut, its text (a script's in a fence, a Markdown document's as it
// is, headings one level down), and a trailing `<!-- drafter-cut {json} -->` comment with the
// exact entry. Reading the file reads only those comments, so a writer can tidy the prose freely,
// and an entry whose comment was damaged loses only itself.

import { commentJson } from '@drafter/markdown';
import type { WorkKind } from './draft-file';
import { isCanonicalIso, isoInstant } from './iso';

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

/**
 * The most dates one cut keeps. Reading refuses an entry with more, and a merge keeps the newest
 * this many. A writer cutting the same text a thousand times is far past anything real.
 */
export const MAX_CUTS_PER_ENTRY = 1000;
/**
 * The most versions of one cut (entries with the same ID) a merge looks at. Each side of a merge
 * has one per ID when it comes from Drafter; more are a damaged or hostile file, and past this
 * many the rest are ignored.
 */
export const MAX_VERSIONS_PER_ID = 64;

const ID = /^[0-9a-f]{64}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isStringOrNull = (s: unknown): s is string | null => s === null || typeof s === 'string';

/** The newest and earliest dates the entry was cut, found once. */
function span(entry: CutEntry): { earliest: string; latest: string } {
  let earliest = '';
  let latest = '';
  for (const cut of entry.cuts) {
    if (earliest === '' || cut.at < earliest) earliest = cut.at;
    if (cut.at > latest) latest = cut.at;
  }
  return { earliest, latest };
}

/** Entries newest cut first (the same moment, by ID), each entry's newest date found once. */
function sortNewestFirst(entries: readonly CutEntry[]): CutEntry[] {
  return entries
    .map((entry) => ({ entry, latest: span(entry).latest }))
    .sort((a, b) => {
      if (a.latest !== b.latest) return a.latest > b.latest ? -1 : 1;
      return a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0;
    })
    .map(({ entry }) => entry);
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
 * entry, newest cut first. An entry with no dates, or a date not written as `toISOString` writes
 * it, is refused with a TypeError: the file never holds an entry Drafter would skip.
 */
export function cutsFile(work: string, entries: readonly CutEntry[]): string {
  const name = oneLine(work) || 'this work';
  const parts = [
    `# Cuts from ${name}`,
    `Everything cut from ${name} while writing, newest first. Drafter keeps this file next to the work and only ever adds to it. The comment after each cut holds it exactly, for Drafter to read back.`,
  ];
  for (const entry of entries) {
    if (entry.cuts.length === 0)
      throw new TypeError(`The cut "${oneLine(entry.title)}" has no dates.`);
    for (const cut of entry.cuts) {
      if (!isCanonicalIso(cut.at))
        throw new TypeError(`Not a date as Drafter writes it: ${cut.at}`);
    }
    if (entry.putBack !== undefined && !isCanonicalIso(entry.putBack)) {
      throw new TypeError(`Not a date as Drafter writes it: ${entry.putBack}`);
    }
  }
  for (const entry of sortNewestFirst(entries)) {
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
  if (v.cuts.length > MAX_CUTS_PER_ENTRY) return null;
  const cuts: CutEntry['cuts'] = [];
  for (const c of v.cuts as unknown[]) {
    if (c === null || typeof c !== 'object') return null;
    const { at: written, draft } = c as Record<string, unknown>;
    const at = isoInstant(written);
    if (at === null) return null;
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
  const putBack = v.putBack === undefined ? undefined : isoInstant(v.putBack);
  if (putBack === null) return null;
  const entry: CutEntry = {
    id: v.id,
    title: v.title,
    text: v.text,
    kind: v.kind,
    cuts,
    where: { after: where.after, before: where.before },
  };
  if (putBack !== undefined) entry.putBack = putBack;
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

/** The SHA-256 of the text's UTF-8 bytes, as lower-case hex (as the app's `hashText`). */
async function sha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The cuts whose text gives their ID (its SHA-256), and how many didn't. Run it on every list
 * read from outside Drafter's own storage (a cuts file beside the work, from another computer, or
 * edited by hand) before `mergeCuts`: a merge keeps one text per ID and can't hash, so an entry
 * with someone else's text under a good cut's ID would otherwise take that cut's place. Async,
 * because SHA-256 in the browser is (Web Crypto).
 */
export async function verifyCuts(
  entries: readonly CutEntry[],
): Promise<{ entries: CutEntry[]; skipped: number }> {
  const kept: CutEntry[] = [];
  let skipped = 0;
  for (const entry of entries) {
    if (ID.test(entry.id) && (await sha256(entry.text)) === entry.id) kept.push(entry);
    else skipped++;
  }
  return { entries: kept, skipped };
}

/** One version of a cut, with what choosing among versions needs, worked out once. */
interface Version {
  entry: CutEntry;
  earliest: string;
  json: string;
}

/** The version first cut; the same moment, the smaller JSON. A total order, so any order of input agrees. */
function earlier(a: Version, b: Version): Version {
  if (a.earliest !== b.earliest) return a.earliest < b.earliest ? a : b;
  return a.json <= b.json ? a : b;
}

/**
 * Two lists of cuts as one (two computers' copies of a cuts file, say): every entry of either, one
 * per ID, with every date it was cut on either side (once each, oldest first, the newest
 * `MAX_CUTS_PER_ENTRY` kept), the earliest Put back, and the title, text and place of the version
 * first cut. Newest cut first. The same whichever way round, and merging again changes nothing.
 * Dates are compared as the moments they name. At most `MAX_VERSIONS_PER_ID` versions of one ID
 * are looked at. Linear in the size of the lists (each version's JSON is made once).
 *
 * Both lists must be verified (`verifyCuts`) when either came from outside Drafter's storage.
 */
export function mergeCuts(a: readonly CutEntry[], b: readonly CutEntry[]): CutEntry[] {
  const byId = new Map<string, CutEntry[]>();
  for (const entry of [...a, ...b]) {
    const list = byId.get(entry.id);
    if (!list) byId.set(entry.id, [entry]);
    else if (list.length < MAX_VERSIONS_PER_ID) list.push(entry);
  }
  const merged: CutEntry[] = [];
  for (const versions of byId.values()) {
    const seen = new Map<string, { at: string; draft: number | null }>();
    let putBack: string | undefined;
    let base: Version | null = null;
    for (const v of versions) {
      const cuts = v.cuts.map((c) => ({ at: isoInstant(c.at) ?? c.at, draft: c.draft }));
      for (const c of cuts) seen.set(`${c.at}|${c.draft}`, c);
      const back = v.putBack === undefined ? undefined : (isoInstant(v.putBack) ?? v.putBack);
      if (back !== undefined && (putBack === undefined || back < putBack)) putBack = back;
      const version: Version = {
        entry: v,
        earliest: span({ ...v, cuts }).earliest,
        json: entryJson(v),
      };
      base = base === null ? version : earlier(base, version);
    }
    if (base === null) continue;
    const cuts = [...seen.values()]
      .sort((x, y) => (x.at !== y.at ? (x.at < y.at ? -1 : 1) : (x.draft ?? 0) - (y.draft ?? 0)))
      .slice(-MAX_CUTS_PER_ENTRY);
    const { entry: first } = base;
    const entry: CutEntry = {
      id: first.id,
      title: first.title,
      text: first.text,
      kind: first.kind,
      cuts,
      where: { after: first.where.after, before: first.where.before },
    };
    if (putBack !== undefined) entry.putBack = putBack;
    merged.push(entry);
  }
  return sortNewestFirst(merged);
}
