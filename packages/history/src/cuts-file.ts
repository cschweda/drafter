// The cuts file beside the work (drafts and cuts design §4): `Boca.fountain.cuts.md`, a Markdown
// document a writer can read without Drafter, newest cut first. Each cut is a `## title`, a line
// saying when and where it was cut, its text (a script's in a fence, a Markdown document's as it
// is, headings one level down), and a trailing `<!-- drafter-cut {json} -->` comment with the
// exact entry. Reading the file reads only those comments, so a writer can tidy the prose freely,
// and an entry whose comment was damaged loses only itself.

import { commentJson } from '@drafter/markdown';
import { draftName, type WorkKind } from './draft-file';
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

/** "Cut while writing Draft 03, 3 Nov 2026 (and Draft 14, 9 Nov 2026) · from between … · id …". */
function cutLine(entry: CutEntry): string {
  const sorted = [...entry.cuts].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const when = sorted.map((c) =>
    c.draft === null ? day(c.at) : `${draftName(c.draft)}, ${day(c.at)}`,
  );
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
 * A cut's text as it is kept and hashed: line breaks as `\n`, as a draft's ID is, so the same cut
 * made on Windows and on a Mac is one entry with one ID (`findCuts` gives its texts this way).
 */
export function cutText(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * The cuts whose text gives their ID (its SHA-256), and how many didn't. Run it on every list
 * read from outside Drafter's own storage (a cuts file beside the work, from another computer, or
 * edited by hand) before `mergeCuts`: a merge keeps one text per ID and can't hash, so an entry
 * with someone else's text under a good cut's ID would otherwise take that cut's place. Async,
 * because SHA-256 in the browser is (Web Crypto). The ID is of the text with `\n` line breaks
 * (`cutText`), and the entries kept come back with their text that way.
 */
export async function verifyCuts(
  entries: readonly CutEntry[],
): Promise<{ entries: CutEntry[]; skipped: number }> {
  const kept: CutEntry[] = [];
  let skipped = 0;
  for (const entry of entries) {
    const text = cutText(entry.text);
    if (ID.test(entry.id) && (await sha256(text)) === entry.id) kept.push({ ...entry, text });
    else skipped++;
  }
  return { entries: kept, skipped };
}

/** How far past the merge's `now` an incoming date may be before it is ignored: a day. */
export const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

/** What a merge needs to know besides the two lists. */
export interface MergeCutsOptions {
  /** The local work's kind: an incoming cut of another kind is dropped. */
  kind: WorkKind;
  /** The time of the merge: incoming dates more than `FUTURE_SLACK_MS` past it are ignored. */
  now: Date;
}

/** Dates oldest first; the same moment, by draft number (none first). */
function byDate(
  cuts: { at: string; draft: number | null }[],
): { at: string; draft: number | null }[] {
  return cuts.sort((x, y) =>
    x.at !== y.at ? (x.at < y.at ? -1 : 1) : (x.draft ?? 0) - (y.draft ?? 0),
  );
}

/** One version of a cut, with what choosing among versions needs, worked out once. */
interface Version {
  entry: CutEntry;
  cuts: { at: string; draft: number | null }[];
  putBack: string | undefined;
  earliest: string;
  json: string;
}

/** The version first cut; the same moment, the smaller JSON. A total order. */
function compareVersions(a: Version, b: Version): number {
  if (a.earliest !== b.earliest) return a.earliest < b.earliest ? -1 : 1;
  return a.json < b.json ? -1 : a.json > b.json ? 1 : 0;
}

/**
 * One side's versions of each cut: identical ones once, then at most `MAX_VERSIONS_PER_ID` of an
 * ID, chosen by `compareVersions`, so the list's order never matters. An incoming side's dates past
 * `limit` are dropped (and a version left with none), and so is a version of another kind.
 */
function sideVersions(
  list: readonly CutEntry[],
  incoming: { kind: WorkKind; limit: string } | null,
): Map<string, Version[]> {
  const byId = new Map<string, Map<string, Version>>();
  for (const entry of list) {
    if (incoming && entry.kind !== incoming.kind) continue;
    let cuts = entry.cuts.map((c) => ({ at: isoInstant(c.at) ?? c.at, draft: c.draft }));
    let putBack =
      entry.putBack === undefined ? undefined : (isoInstant(entry.putBack) ?? entry.putBack);
    if (incoming) {
      cuts = cuts.filter((c) => isoInstant(c.at) !== null && c.at <= incoming.limit);
      if (cuts.length === 0) continue;
      if (putBack !== undefined && (isoInstant(putBack) === null || putBack > incoming.limit)) {
        putBack = undefined;
      }
    }
    const json = entryJson(entry);
    let versions = byId.get(entry.id);
    if (!versions) {
      versions = new Map();
      byId.set(entry.id, versions);
    }
    if (!versions.has(json)) {
      versions.set(json, {
        entry,
        cuts,
        putBack,
        earliest: span({ ...entry, cuts }).earliest,
        json,
      });
    }
  }
  const out = new Map<string, Version[]>();
  for (const [id, versions] of byId) {
    out.set(id, [...versions.values()].sort(compareVersions).slice(0, MAX_VERSIONS_PER_ID));
  }
  return out;
}

/**
 * The cuts kept on this computer (`local`, Drafter's own storage, trusted) merged with a list from
 * elsewhere (`incoming`: the cuts file beside the work, perhaps written by another computer or
 * edited by hand). Every entry of either, one per ID, with every date it was cut on either side
 * (once each, oldest first), newest cut first.
 *
 * The date cap, `MAX_CUTS_PER_ENTRY`, keeps every local date first (the newest that many, should
 * local alone hold more), then fills whatever room is left with the newest incoming dates. A local
 * list already at the cap takes no incoming dates. So an incoming file, even one crafted with
 * dates inside the day's slack, can never push a local date out.
 *
 * For an ID on both sides, the title, text, kind, place and Put back are the local entry's: an
 * incoming Put back is advice, used only for a cut this computer doesn't have. An incoming entry of
 * another kind than `options.kind`, and incoming dates more than a day past `options.now`, are
 * ignored. Each side keeps at most
 * `MAX_VERSIONS_PER_ID` versions of one ID, chosen by a fixed order, so one side can't crowd out
 * the other and neither list's order changes the result. Swapping the sides keeps the same cuts
 * and, under the date cap, the same dates; only the local-wins fields can differ. Linear in the size of the lists, but for
 * sorting.
 *
 * Run `verifyCuts` on `incoming` first: a merge can't hash.
 */
export function mergeCuts(
  local: readonly CutEntry[],
  incoming: readonly CutEntry[],
  options: MergeCutsOptions,
): CutEntry[] {
  const limit = new Date(options.now.getTime() + FUTURE_SLACK_MS).toISOString();
  const mine = sideVersions(local, null);
  const theirs = sideVersions(incoming, { kind: options.kind, limit });
  const merged: CutEntry[] = [];
  for (const id of new Set([...mine.keys(), ...theirs.keys()])) {
    const ours = mine.get(id) ?? [];
    const other = theirs.get(id) ?? [];
    const trusted = ours.length > 0 ? ours : other;
    const first = (trusted[0] as Version).entry;
    // Every local date first (the newest MAX_CUTS_PER_ENTRY, if a damaged store holds more), then
    // the newest incoming dates in whatever room is left: an incoming file can never push a local
    // date out.
    const localDates = new Map<string, { at: string; draft: number | null }>();
    for (const v of ours) for (const c of v.cuts) localDates.set(`${c.at}|${c.draft}`, c);
    const incomingDates = new Map<string, { at: string; draft: number | null }>();
    for (const v of other) {
      for (const c of v.cuts) {
        const key = `${c.at}|${c.draft}`;
        if (!localDates.has(key)) incomingDates.set(key, c);
      }
    }
    const kept = byDate([...localDates.values()]).slice(-MAX_CUTS_PER_ENTRY);
    const room = MAX_CUTS_PER_ENTRY - kept.length;
    if (room > 0) kept.push(...byDate([...incomingDates.values()]).slice(-room));
    let putBack: string | undefined;
    for (const v of trusted) {
      if (v.putBack !== undefined && (putBack === undefined || v.putBack < putBack))
        putBack = v.putBack;
    }
    const cuts = byDate(kept);
    const entry: CutEntry = {
      id,
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
