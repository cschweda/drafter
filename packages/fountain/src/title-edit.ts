import type { Doc, TextChange, TitleField } from './types';

/** The script's own line break: the first one in it, `\r\n` or `\n`, else `\n`. */
function lineBreakOf(source: string): string {
  const at = source.indexOf('\n');
  return at > 0 && source[at - 1] === '\r' ? '\r\n' : '\n';
}

/**
 * A value as one title-page line: line breaks and tabs become spaces, runs of spaces one, and no
 * `[[`, `/*`, or `*\/` that would open or close a note or a boneyard. One pass each, so linear.
 */
function oneLine(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\[(?=\[)/g, '[ ')
    .replace(/\/(?=\*)/g, '/ ')
    .replace(/\*(?=\/)/g, '* ')
    .trim();
}

/** Where a line's text ends: before a CRLF's `\r`. */
const textEnd = (source: string, at: number) => (source[at - 1] === '\r' ? at - 1 : at);

/** Just past the line break after `at` (a line's end), or the end of the text. */
const nextLine = (source: string, at: number) => (source[at] === '\n' ? at + 1 : at);

/**
 * The changes that set the title page's `key` field (story-map design §3.5, `Logline:`): they
 * replace the field's value (the key kept as typed, continuation lines and all made one line), add
 * it after the last field, or start a title page with it; with null or an empty value they remove
 * the field (and a title page left with no field). The value is one line: a line break is a space.
 * The script's own line break is used. [] when nothing changes.
 */
export function setTitleField(doc: Doc, key: string, value: string | null): TextChange[] {
  const { source } = doc;
  const text = value === null ? '' : oneLine(value);
  const name = key.trim().toLowerCase();
  const fields = doc.titlePage?.fields ?? [];
  const field: TitleField | undefined = fields.find((f) => f.key.trim().toLowerCase() === name);
  const nl = lineBreakOf(source);

  if (field) {
    if (text === '') {
      if (fields.length === 1) {
        // The title page goes: up to the script's first line with text.
        let to = nextLine(source, field.span.to);
        while (to < source.length) {
          const end = source.indexOf('\n', to);
          const line = source.slice(to, end < 0 ? source.length : end);
          if (line.trim() !== '') break;
          to = end < 0 ? source.length : end + 1;
        }
        return [{ from: field.span.from, to, insert: '' }];
      }
      return [{ from: field.span.from, to: nextLine(source, field.span.to), insert: '' }];
    }
    if (field.value.length === 1 && field.value[0] === text) return [];
    return [
      {
        from: field.span.from,
        to: textEnd(source, field.span.to),
        insert: `${field.key}: ${text}`,
      },
    ];
  }

  if (text === '') return [];
  const line = `${key.trim()}: ${text}`;
  const last = fields.at(-1);
  if (last) {
    const at = textEnd(source, last.span.to);
    return [{ from: at, to: at, insert: `${nl}${line}` }];
  }
  // No title page: one at the very start (after a byte order mark), then a blank line.
  const at = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  const rest = source.slice(at);
  return [{ from: at, to: at, insert: rest === '' ? `${line}${nl}` : `${line}${nl}${nl}` }];
}
