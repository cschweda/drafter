import type { ParseDiagnostic } from './types';

export interface Region {
  kind: 'note' | 'boneyard';
  from: number;
  /** Just past the closing delimiter, or the end of the source when unclosed. */
  to: number;
  closed: boolean;
}

/**
 * A line is blank when it is empty or whitespace only, except a line of exactly
 * two spaces, which the spec uses to connect lines into one element.
 * `text` excludes the line's `\n` and may end with a CRLF's `\r`.
 */
export function isBlankText(text: string): boolean {
  const t = text.endsWith('\r') ? text.slice(0, -1) : text;
  if (t === '  ') return false;
  return /^\s*$/.test(t);
}

const OPENER = /\/\*|\[\[/g;

/**
 * The pre-pass (technical design §2.4): finds every note and boneyard region.
 * A boneyard may span anything; an unclosed one runs to the end of the source.
 * A note must close before the next blank line, or its `[[` stays literal.
 */
export function scanRegions(source: string): { regions: Region[]; diagnostics: ParseDiagnostic[] } {
  const regions: Region[] = [];
  const diagnostics: ParseDiagnostic[] = [];
  OPENER.lastIndex = 0;
  let match = OPENER.exec(source);
  while (match) {
    const from = match.index;
    if (match[0] === '/*') {
      const close = source.indexOf('*/', from + 2);
      if (close === -1) {
        regions.push({ kind: 'boneyard', from, to: source.length, closed: false });
        diagnostics.push({
          code: 'unclosed-boneyard',
          severity: 'error',
          span: { from, to: from + 2 },
          message:
            'This boneyard has no closing */, so everything after it is cut from the script.',
        });
        break;
      }
      regions.push({ kind: 'boneyard', from, to: close + 2, closed: true });
      OPENER.lastIndex = close + 2;
    } else {
      const close = findNoteEnd(source, from + 2);
      if (close === -1) {
        diagnostics.push({
          code: 'unclosed-note',
          severity: 'warning',
          span: { from, to: from + 2 },
          message: 'This note has no closing ]] before the next blank line, so it shows as text.',
        });
        OPENER.lastIndex = from + 2;
      } else {
        regions.push({ kind: 'note', from, to: close + 2, closed: true });
        OPENER.lastIndex = close + 2;
      }
    }
    match = OPENER.exec(source);
  }
  return { regions, diagnostics };
}

/** The offset of the `]]` that closes a note opened before `start`, or -1. */
function findNoteEnd(source: string, start: number): number {
  for (let i = start; i < source.length; i++) {
    const c = source.charCodeAt(i);
    if (c === 93 /* ] */ && source.charCodeAt(i + 1) === 93) return i;
    if (c === 10 /* \n */) {
      const lineEnd = source.indexOf('\n', i + 1);
      if (isBlankText(source.slice(i + 1, lineEnd === -1 ? source.length : lineEnd))) return -1;
    }
  }
  return -1;
}
