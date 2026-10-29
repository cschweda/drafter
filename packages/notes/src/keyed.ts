// Keyed notes (Phase 2 design §5.3): `[[Head: body]]`. Reading is lenient (any case, extra
// spaces); writing is exact (`[[Key: body]]`, title case, one space, the body on one line).

/** The fields a scene's header holds, in the order Drafter writes them (design §5.4). */
export type FieldKey = 'color' | 'storyline' | 'goal' | 'conflict' | 'outcome' | 'shift';
/** The inline marks that tie a setup to its payoff (design §10). */
export type MarkKey = 'setup' | 'payoff';

/** A scene header's order (design §5.4). */
export const FIELD_ORDER: readonly FieldKey[] = [
  'color',
  'storyline',
  'goal',
  'conflict',
  'outcome',
  'shift',
];

const MARKS: readonly MarkKey[] = ['setup', 'payoff'];

/** The categories a new script offers before the writer adds any (design §8). */
export const STARTING_CATEGORIES: readonly string[] = [
  'story',
  'character',
  'dialogue',
  'pacing',
  'format',
  'continuity',
  'question',
  'todo',
];

/** What a note's head says it is. */
export type Head =
  | { kind: 'field'; key: FieldKey }
  | { kind: 'mark'; key: MarkKey }
  | { kind: 'card' }
  /** An all-capitals head, lowercased: `TODO` is `todo`, `CUT?` is `cut?`. */
  | { kind: 'category'; name: string }
  /** `Sam`, `Sam on “the words”`, `Sam re Ann`. */
  | { kind: 'person'; name: string; on: string | null; re: string | null };

export interface KeyedNote {
  /** Null: the writer's own note, uncategorized. */
  head: Head | null;
  /** After the head's colon, trimmed; the whole text when there is no head. */
  body: string;
  /** `#word` category tags, lowercased, once each, in order; never `resolved`. */
  tags: string[];
  /** A `#resolved` anywhere in the body. */
  resolved: boolean;
}

/** The longest head that counts as one. */
const MAX_HEAD = 40;

/** A head's characters: a letter, then letters, spaces, and `' ’ . - ? !`. */
const HEAD = /^\p{L}[\p{L}\p{M} '’.\-?!]*$/u;

/** `Name on “quote”:` (straight or curly quotes), up to and including the colon. */
const ON = /^[ \t]*([^\r\n:]*?)[ \t]+on[ \t]+["“]([^"”\r\n]*)["”][ \t]*:/u;

/** `#word` at a word's start: a letter, then letters, digits, or hyphens. */
const TAG = /(?<![\p{L}\p{M}\p{N}_#])#(\p{L}[\p{L}\p{M}\p{N}-]*)/gu;

/** Spaces and tabs collapsed to one space, and the ends trimmed. */
const collapse = (text: string) => text.replace(/[ \t]+/g, ' ').trim();

/** A name as a head may hold it, collapsed, or null when it can't be one. */
function nameOf(text: string): string | null {
  const name = collapse(text);
  return name.length <= MAX_HEAD && HEAD.test(name) ? name : null;
}

/** Lowercase words a name may hold between its capitalized ones (`Luis de la Cruz`). */
const PARTICLES = new Set([
  'de',
  'da',
  'del',
  'della',
  'di',
  'du',
  'la',
  'le',
  'van',
  'von',
  'der',
  'den',
  'ter',
  'bin',
  'ibn',
  'al',
]);

/** Whether `lower` is a field key, a mark, or `card`. */
const isKey = (lower: string) =>
  (FIELD_ORDER as readonly string[]).includes(lower) ||
  (MARKS as readonly string[]).includes(lower) ||
  lower === 'card';

/**
 * A person's name, or null (controller ruling 1): one to four words, each starting with a capital,
 * except a lowercase particle between two of them. A word with no cased letter (a script such as
 * Japanese) passes. A key is never a name, so `Goal on “x”` is no head.
 */
function personOf(text: string): string | null {
  const name = nameOf(text);
  if (name === null || isKey(name.toLowerCase())) return null;
  const words = name.split(' ');
  if (words.length > 4) return null;
  const ok = words.every(
    (word, i) =>
      /^[\p{Lu}\p{Lt}]/u.test(word) ||
      !/[\p{Lu}\p{Ll}\p{Lt}]/u.test(word) ||
      (i > 0 && i < words.length - 1 && PARTICLES.has(word)),
  );
  return ok ? name : null;
}

/** The head `text` (before the colon) names, or null. `open` is whether the colon has room after it. */
function headOf(text: string, open: boolean): Head | null {
  if (/[\r\n]/.test(text.trim())) return null;
  const head = nameOf(text);
  if (head === null) return null;
  const lower = head.toLowerCase();
  if ((FIELD_ORDER as readonly string[]).includes(lower))
    return { kind: 'field', key: lower as FieldKey };
  if ((MARKS as readonly string[]).includes(lower)) return { kind: 'mark', key: lower as MarkKey };
  if (lower === 'card') return { kind: 'card' };
  // A category or a person needs a space or the note's end after the colon, so `http://…` and
  // `10:30` are never heads.
  if (!open) return null;
  if (!/\p{Ll}/u.test(head) && /\p{Lu}/u.test(head)) return { kind: 'category', name: lower };
  const reply = / re /.exec(head);
  if (reply) {
    // `Ann re Bob re Cy` has no head: `Bob re Cy` isn't a name.
    const name = personOf(head.slice(0, reply.index));
    const re = personOf(head.slice(reply.index + 4));
    return name && re ? { kind: 'person', name, on: null, re } : null;
  }
  const name = personOf(head);
  return name ? { kind: 'person', name, on: null, re: null } : null;
}

/** Whether the colon at `colon` is followed by a space or the end. */
const openAfter = (text: string, colon: number) =>
  colon + 1 >= text.length || /\s/u.test(text[colon + 1] as string);

/** The `#word` tags in `body`, lowercased, once each; and whether one is `#resolved`. */
function tagsOf(body: string): { tags: string[]; resolved: boolean } {
  const tags: string[] = [];
  let resolved = false;
  for (const match of body.matchAll(TAG)) {
    const tag = (match[1] as string).toLowerCase();
    if (tag === 'resolved') resolved = true;
    else if (!tags.includes(tag)) tags.push(tag);
  }
  return { tags, resolved };
}

/** `inner` is the text between `[[` and `]]`. */
export function readNote(inner: string): KeyedNote {
  let head: Head | null = null;
  let body = inner.trim();
  const quoted = ON.exec(inner);
  const quotedName = quoted ? personOf(quoted[1] as string) : null;
  if (quoted && quotedName && openAfter(inner, quoted[0].length - 1)) {
    head = { kind: 'person', name: quotedName, on: quoted[2] as string, re: null };
    body = inner.slice(quoted[0].length).trim();
  } else {
    const colon = inner.indexOf(':');
    if (colon >= 0) {
      head = headOf(inner.slice(0, colon), openAfter(inner, colon));
      if (head) body = inner.slice(colon + 1).trim();
    }
  }
  return { head, body, ...tagsOf(body) };
}

/** A category head's name first, then the tags. */
export function categoriesOf(note: KeyedNote): string[] {
  const out = note.head?.kind === 'category' ? [note.head.name] : [];
  for (const tag of note.tags) if (!out.includes(tag)) out.push(tag);
  return out;
}

const titleCase = (key: string) => key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();

/** A head as Drafter writes it: a key in title case; any other head with its spaces collapsed. */
function writtenHead(head: string): string {
  const text = safeBody(head);
  const lower = collapse(text).toLowerCase();
  if (isKey(lower)) return titleCase(lower);
  // A quote keeps its words exactly; only the name before it is collapsed.
  const quote = text.search(/["“]/);
  if (quote < 0) return collapse(text);
  return `${text
    .slice(0, quote)
    .replace(/[ \t]+/g, ' ')
    .trimStart()}${text.slice(quote)}`;
}

/**
 * `[[Head: body]]` exactly (`[[body]]` with no head, or a blank one), the body through `safeBody`.
 * Throws a RangeError for a head that wouldn't read back as a head, such as `Note to self` or one
 * holding a colon: the note would read as the writer's own, with the head in its body.
 */
export function writeNote(head: string | null, body: string): string {
  const text = safeBody(body);
  // A body ending in `]` would close the note one early; reading trims the space.
  const safe = text.endsWith(']') ? `${text} ` : text;
  if (head === null || head.trim() === '') return `[[${safe}]]`;
  const written = writtenHead(head);
  const check = readNote(`${written}: x`);
  if (check.head === null || check.body !== 'x') {
    throw new RangeError(`“${head}” can't be a note's head.`);
  }
  return `[[${written}:${safe === '' ? '' : ` ${safe}`}]]`;
}

/** `[[Goal: body]]`, the key in title case. */
export function fieldNote(key: FieldKey | MarkKey, body: string): string {
  return writeNote(key, body);
}

/** A setup or payoff label for matching: case folded, spaces collapsed and trimmed. */
export function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/gu, ' ').trim();
}

/**
 * The head (lowercased) and body of a note's inner text, or null when it has no head: no colon,
 * nothing before it, a head longer than 40 characters, or one that spans lines. Plan A's reading,
 * kept for the scene index's colors.
 */
export function readKeyedNote(text: string): { key: string; body: string } | null {
  const colon = text.indexOf(':');
  if (colon < 0) return null;
  const head = text.slice(0, colon).trim();
  if (head === '' || head.length > MAX_HEAD || /[\r\n]/.test(head)) return null;
  return { key: head.toLowerCase(), body: text.slice(colon + 1).trim() };
}

/**
 * A body as Drafter writes it: on one line (breaks become ` / `), and never closing the note
 * (`]]` becomes `] ]`) or opening or closing a boneyard (`/*` and `*\/` get a space).
 */
export function safeBody(text: string): string {
  return safeLine(text).replace(/\](?=\])/g, '] ');
}

/** One line of the writer's words, safe to put anywhere in Fountain: no line break, no note or boneyard opener. */
export function safeLine(text: string): string {
  return text
    .replace(/\s*\r?\n\s*/g, ' / ')
    .replace(/\[(?=\[)/g, '[ ')
    .replace(/\/(?=\*)/g, '/ ')
    .replace(/\*(?=\/)/g, '* ')
    .trim();
}
