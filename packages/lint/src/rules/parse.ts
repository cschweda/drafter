import type { Doc, ParseDiagnostic, Region, Span, TextChange } from '@drafter/fountain';
import type { LintDiagnostic, Rule, Severity } from '../types';

// The rules in this file carry over what the parser already reports (technical design
// §2.10). The parser finds these without a template, so a rule only chooses a severity and,
// for the two Strict Fountain rules, supplies the fix.

/** The parse diagnostics with one of these codes. */
function reported(doc: Doc, ...codes: string[]): ParseDiagnostic[] {
  return doc.diagnostics.filter((d) => codes.includes(d.code));
}

/** A parse diagnostic as the rule's own, about the same text and saying the same thing. */
function carry(rule: Rule, d: ParseDiagnostic, severity: Severity = rule.severity): LintDiagnostic {
  return { ruleId: rule.id, severity, span: { ...d.span }, message: d.message };
}

/** Whether a line break at `offset` would fall inside a note or a boneyard, and cut it in two. */
function insideRegion(regions: readonly Region[], offset: number): boolean {
  // Regions are in order and never overlap: find the first one that ends after the offset.
  let lo = 0;
  let hi = regions.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((regions[mid] as Region).span.to <= offset) lo = mid + 1;
    else hi = mid;
  }
  const region: Region | undefined = regions[lo];
  return region !== undefined && region.span.from < offset;
}

/**
 * The change that puts a blank line after the line `line` is the span of: a line break at the end
 * of its text, in the line's own style. A CRLF line's span ends with its `\r`, and the new break
 * goes in front of that, so the line keeps its own ending too. Null when the end of the text is
 * inside a note or a boneyard: a blank line there would end the note, or leave the text below it
 * in place.
 */
function blankLineAfter(doc: Doc, line: Span): TextChange | null {
  const crlf = line.to > line.from && doc.source.charCodeAt(line.to - 1) === 13;
  const at = crlf ? line.to - 1 : line.to;
  if (insideRegion(doc.regions, at)) return null;
  return { from: at, to: at, insert: crlf ? '\r\n' : '\n' };
}

const isSpace = (code: number) => code === 32 || code === 9;

/**
 * The changes that put the lines `span` covers on one. Each line break becomes a single space,
 * and takes with it a `\r` before it, the spaces and tabs on either side of it, and the next
 * line's indent. A line's `\r` goes with its `\n`, so a CRLF file stays CRLF: the break after
 * the last line is outside the span and untouched.
 */
function joinLines(source: string, span: Span): TextChange[] {
  const changes: TextChange[] = [];
  // Where the last change ended: the spaces before the next break stop there.
  let reached = span.from;
  for (
    let nl = source.indexOf('\n', span.from);
    nl !== -1 && nl < span.to;
    nl = source.indexOf('\n', nl + 1)
  ) {
    let from = nl > reached && source.charCodeAt(nl - 1) === 13 ? nl - 1 : nl;
    while (from > reached && isSpace(source.charCodeAt(from - 1))) from--;
    let to = nl + 1;
    while (to < span.to && isSpace(source.charCodeAt(to))) to++;
    changes.push({ from, to, insert: ' ' });
    reached = to;
  }
  return changes;
}

export const unclosedRegion: Rule = {
  id: 'unclosed-region',
  // The highest it reports: a boneyard is an error, and each diagnostic keeps the
  // severity the parser gave it, so a note is a warning.
  severity: 'error',
  run: ({ doc }) =>
    reported(doc, 'unclosed-boneyard', 'unclosed-note').map((d) =>
      carry(unclosedRegion, d, d.severity),
    ),
};

export const invalidMeta: Rule = {
  id: 'invalid-meta',
  severity: 'warning',
  run: ({ doc }) => reported(doc, 'invalid-meta').map((d) => carry(invalidMeta, d)),
};

export const headingBlankAfter: Rule = {
  id: 'heading-blank-after',
  severity: 'info',
  run: ({ doc }) =>
    reported(doc, 'heading-blank-after').map((d) => {
      const diagnostic = carry(headingBlankAfter, d);
      const change = blankLineAfter(doc, d.span);
      if (change) diagnostic.fix = { title: 'Insert a blank line', changes: [change] };
      return diagnostic;
    }),
};

export const multilineParenthetical: Rule = {
  id: 'multiline-parenthetical',
  severity: 'info',
  run: ({ doc }) =>
    reported(doc, 'multiline-parenthetical').map((d) => ({
      ...carry(multilineParenthetical, d),
      fix: { title: 'Join onto one line', changes: joinLines(doc.source, d.span) },
    })),
};
