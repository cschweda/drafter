import { type Block, characters, type Line } from '@drafter/fountain';
import type { LintDiagnostic, Rule } from '../types';

// character-without-dialogue (technical design §9). The parser reads an upper-case line as a
// cue only when the line below it is part of the same block (§2.5), so a writer who leaves
// a blank line between a cue and its speech gets two action blocks and no diagnostic from the
// parser. This rule finds that typo.

/** Has at least one uppercase letter and no lowercase letters (technical design §2.5). */
function isUpper(text: string): boolean {
  return /\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text);
}

const isSpace = (ch: string) => /\s/.test(ch);

/** A name as the layout compares names: ignoring case. */
const nameKey = (name: string) => name.trim().toUpperCase();

/** Text whose first line opens with a parenthesis, after any indent. */
const OPENS_WITH_PAREN = /^[^\S\n]*\(/;

/**
 * A line's printed text, trimmed, when that is the text the parser tests. Notes and boneyard
 * don't print and the parser skips them too, but emphasis markers differ: `*MARGARET (V.O.)*`
 * prints without them, and the parser, which tests them as typed, reads no cue in it. So a line
 * counts only if no emphasis took effect, which leaves one unstyled run, and no backslash is on
 * it, since an escaping backslash is cut from the text and shows only in the source. Null
 * for any other line.
 */
function typedText(line: Line): string | null {
  const [run, ...more] = line.inline;
  if (!run || more.length > 0 || run.bold || run.italic || run.underline) return null;
  return line.raw.includes('\\') ? null : run.text.trim();
}

/**
 * The character name, when `text` is shaped as the parser reads a cue (technical design §2.5): a
 * name in upper case, then any number of parenthesized extensions in any case, then an optional
 * `^`, and nothing else. Null for any other shape. `text` is a line's printed text, trimmed.
 */
function cueName(text: string): string | null {
  const open = text.search(/[(^]/);
  const name = (open === -1 ? text : text.slice(0, open)).trim();
  if (!name || !isUpper(name)) return null;
  let i = open === -1 ? text.length : open;
  for (;;) {
    while (isSpace(text.charAt(i))) i++;
    if (text.charAt(i) !== '(') break;
    // Each search starts after the last extension, so the whole line is scanned once.
    const close = text.indexOf(')', i + 1);
    if (close === -1) return null;
    i = close + 1;
  }
  if (text.charAt(i) === '^') i++;
  while (isSpace(text.charAt(i))) i++;
  return i === text.length ? name : null;
}

/**
 * Where the one blank line is in `leading`, the line break before a block plus the blank lines
 * before it: its text and its line break, as offsets into `leading`. Null when there is no blank
 * line, or more than one. A line break is a `\n`, and a CRLF file's `\r` goes with it.
 */
function onlyBlankLine(leading: string): { from: number; to: number } | null {
  const first = leading.indexOf('\n');
  if (first === -1) return null;
  const second = leading.indexOf('\n', first + 1);
  if (second === -1 || leading.indexOf('\n', second + 1) !== -1) return null;
  return { from: first + 1, to: second + 1 };
}

/**
 * Whether the blank line is whitespace and its own line break, with no carriage return of its
 * own. Taking out a lone `\r` would change the file's line endings.
 */
function isPlainBlankLine(leading: string, blank: { from: number; to: number }): boolean {
  const text = leading.slice(blank.from, blank.to - 1);
  return !(text.endsWith('\r') ? text.slice(0, -1) : text).includes('\r');
}

export const characterWithoutDialogue: Rule = {
  id: 'character-without-dialogue',
  severity: 'warning',
  run: ({ doc }) => {
    const found: LintDiagnostic[] = [];
    // The names cued in the script. The first line that needs them builds the set, once for the
    // whole script.
    let cued: Set<string> | undefined;
    for (let i = 0; i + 1 < doc.blocks.length; i++) {
      const a = doc.blocks[i] as Block;
      const b = doc.blocks[i + 1] as Block;
      // Two action blocks, one blank line apart. A forced one is action on purpose.
      if (a.kind !== 'action' || b.kind !== 'action' || a.forced || b.forced) continue;
      if (a.lines.length !== 1) continue;
      const blank = onlyBlankLine(b.leading);
      if (!blank) continue;
      const text = typedText(a.lines[0] as Line);
      if (text === null) continue;
      const name = cueName(text);
      if (name === null) continue;
      // The second block must read as the speech: it opens with a parenthetical, or the
      // name is a character's. Only its first line counts: below that is the speech itself.
      if (!OPENS_WITH_PAREN.test(b.sem.text)) {
        cued ??= new Set(characters(doc).map((c) => nameKey(c.name)));
        if (!cued.has(nameKey(name))) continue;
      }
      const diagnostic: LintDiagnostic = {
        ruleId: characterWithoutDialogue.id,
        severity: characterWithoutDialogue.severity,
        span: { ...a.span },
        message: `"${text}" looks like a character cue, but the blank line after it turns the speech into action.`,
      };
      if (isPlainBlankLine(b.leading, blank)) {
        // The whole blank line, text and break. When it is empty that is its break alone: `\n`,
        // or `\r\n` in a CRLF file.
        const start = b.span.from - b.leading.length;
        diagnostic.fix = {
          title: 'Remove the blank line',
          changes: [{ from: start + blank.from, to: start + blank.to, insert: '' }],
        };
      }
      found.push(diagnostic);
    }
    return found;
  },
};
