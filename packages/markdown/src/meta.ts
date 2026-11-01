// A Markdown document's metadata: one trailing HTML comment, `<!-- drafter {json} -->`, after the
// text and one blank line. Markdown viewers hide it, and Drafter keeps a document's own facts in it
// (a draft's number, ID, date and note) the way a script keeps them in its `/* drafter … */` block.

const OPENER = '<!-- drafter ';
const CLOSER = ' -->';

/**
 * JSON that can sit inside an HTML comment, or a Fountain boneyard, without closing it: every `/`
 * written `\/`, `<` and `>` written `<` and `>`, and the second `-` of every `--`
 * written `-`. JSON reads all of these back as the characters they stand for. A `--` can
 * only be inside a string (no JSON number or word has one), where `-` is allowed.
 */
export function commentJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('/', '\\/')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('--', '-\\u002d');
}

/** The document's own line break: the first one in it, `\r\n` or `\n`, else `\n`. */
function lineBreakOf(text: string): string {
  const at = text.indexOf('\n');
  return at > 0 && text[at - 1] === '\r' ? '\r\n' : '\n';
}

function isSpace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

/** Where the block is, and what it holds. */
export interface MarkdownMetaBlock {
  /** The block's first character: the `<` at the start of its line. */
  from: number;
  /** Just after its `-->`. */
  to: number;
  /** The JSON object it holds. */
  meta: Record<string, unknown>;
}

/**
 * The document's metadata block: its last line (trailing spaces and blank lines aside), starting
 * at the line's start (so not indented code) as `<!-- drafter `, ending ` -->`, and holding a JSON
 * object. Anything else, a comment with words after it, or one whose JSON doesn't read as an
 * object, is the writer's own text. One backwards scan, then one JSON parse: linear.
 */
export function findMarkdownMeta(text: string): MarkdownMetaBlock | null {
  let end = text.length;
  while (end > 0 && isSpace(text.charCodeAt(end - 1))) end--;
  const from = text.lastIndexOf('\n', end - 1) + 1;
  if (end - from < OPENER.length + CLOSER.length) return null;
  if (!text.startsWith(OPENER, from) || !text.startsWith(CLOSER, end - CLOSER.length)) return null;
  let meta: unknown;
  try {
    meta = JSON.parse(text.slice(from + OPENER.length, end - CLOSER.length));
  } catch {
    return null;
  }
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) return null;
  return { from, to: end, meta: meta as Record<string, unknown> };
}

/**
 * The document's text and its metadata. The body is the text without the block, the line break
 * after it, and the one blank line before it that `setMarkdownMeta` wrote, so a body written with
 * `setMarkdownMeta` comes back exactly. No block: the whole text, and `meta: null`.
 */
export function readMarkdownMeta(text: string): {
  body: string;
  meta: Record<string, unknown> | null;
} {
  const block = findMarkdownMeta(text);
  if (!block) return { body: text, meta: null };
  const before = text.slice(0, block.from);
  // The line break written after the block says which one the separator used.
  const nl = text.startsWith('\r\n', block.to)
    ? '\r\n'
    : text.startsWith('\n', block.to)
      ? '\n'
      : before.endsWith('\r\n\r\n')
        ? '\r\n'
        : '\n';
  const gap = nl + nl;
  const body = before.endsWith(gap) ? before.slice(0, -gap.length) : before;
  return { body, meta: block.meta };
}

/**
 * The text with `meta` as its metadata block. An existing block is replaced where it is, and
 * everything around it kept; otherwise the block goes at the end: the text, one blank line (two
 * line breaks, always, so the body can be told apart exactly), the block, and a line break, all
 * with the text's own line break.
 */
export function setMarkdownMeta(text: string, meta: Record<string, unknown>): string {
  const block = findMarkdownMeta(text);
  if (!block) return appendMarkdownMeta(text, meta);
  return text.slice(0, block.from) + OPENER + commentJson(meta) + CLOSER + text.slice(block.to);
}

/**
 * The text, one blank line, a new metadata block, and a line break, whatever the text ends with:
 * a block already at its end stays as the writer's text, and the new one is read instead.
 */
export function appendMarkdownMeta(text: string, meta: Record<string, unknown>): string {
  const nl = lineBreakOf(text);
  return `${text}${nl}${nl}${OPENER}${commentJson(meta)}${CLOSER}${nl}`;
}
