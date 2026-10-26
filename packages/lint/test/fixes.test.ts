import { readdirSync, readFileSync } from 'node:fs';
import { parse } from '@drafter/fountain';
import { type LintDiagnostic, lint, STRICT_RULES } from '@drafter/lint';
import { builtins, type Template } from '@drafter/templates';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyFix } from './helpers';

const screenplay = builtins['us-screenplay'] as Template;
const run = (source: string) => lint(parse(source), screenplay);
const countOf = (found: LintDiagnostic[], id: string) =>
  found.filter((d) => d.ruleId === id).length;
const isStrict = (d: LintDiagnostic) => STRICT_RULES.includes(d.ruleId);

/** How many line endings of each kind a text has: CRLF, a lone LF, and a lone CR. */
const endings = (text: string) => ({
  crlf: text.match(/\r\n/g)?.length ?? 0,
  lf: text.match(/(?<!\r)\n/g)?.length ?? 0,
  cr: text.match(/\r(?!\n)/g)?.length ?? 0,
});

/** Whether `after` has no kind of line ending that `before` lacked, and as many lone CRs. */
function keepsEndings(before: string, after: string): boolean {
  const was = endings(before);
  const now = endings(after);
  return now.cr === was.cr && (was.lf > 0 || now.lf === 0) && (was.crlf > 0 || now.crlf === 0);
}

// Lines that set off the Strict rules in the shapes the parser reads, among lines that get in
// their way: blank lines, the two-space line that joins a speech, section and page-break markers.
const plain = [
  'INT. HALL - DAY',
  'INT. HALL - DAY  ',
  'EXT. YARD - NIGHT',
  'CUT TO:',
  '.THE HALL',
  '> FADE OUT.',
  'MARGARET',
  'DANNY (V.O.)',
  'MARGARET ^',
  '(quietly,',
  '(quietly,  ',
  '   then louder)',
  '\tthen louder)',
  'and louder',
  '(aside)',
  '(',
  'x)',
  'Hi.',
  'She waits.',
  '  ',
  ' ',
  '',
  '# Act',
  '===',
  '~sings',
  '= a synopsis',
];
// The same, with notes and boneyard, closed and open, starting and ending on different lines.
const withRegions = [
  ...plain,
  '[[a note]]',
  '[[open',
  'close]]',
  'x [[y',
  'z]] w',
  '/* cut */',
  '/* cut',
  'end */',
];

/** A script of lines from a pool, with LF or CRLF line endings, and a final one or not. */
const scripts = (pool: readonly string[]) =>
  fc
    .tuple(
      fc.array(fc.constantFrom(...pool), { maxLength: 18, size: 'max' }),
      fc.boolean(),
      fc.constantFrom('\n', '\r\n'),
    )
    .map(([lines, final, lineBreak]) => lines.join(lineBreak) + (final ? lineBreak : ''));

// Text built from fragments, not whole lines, so brackets, markers, a lone `\r`, and a
// byte-order mark land anywhere, line breaks included.
const fragments = [
  '(',
  ')',
  '(x',
  'x)',
  ',',
  '\n',
  '\n\n',
  '\r\n',
  '\r',
  ' ',
  '  ',
  '\t',
  '[[',
  ']]',
  '/*',
  '*/',
  'INT. A',
  'CUT TO:',
  'MARGARET',
  'Hi.',
  '\ufeff',
  '#',
  '=',
  '>',
  '.',
];
const jumble = fc
  .array(fc.constantFrom(...fragments), { maxLength: 40, size: 'max' })
  .map((parts) => parts.join(''));

const numRuns = 1_000;

describe('fixes', () => {
  // Without notes and boneyard, because a fix that joins lines can change where a note ends
  // (the search for `]]` stops at a blank line, and an empty line inside a boneyard is one).
  it('settle the problem they are for, and no other', () => {
    fc.assert(
      fc.property(scripts(plain), (source) => {
        const before = run(source);
        for (const d of before) {
          if (!d.fix) continue;
          const after = run(applyFix(source, d.fix));
          for (const id of new Set(before.map((b) => b.ruleId))) {
            expect(countOf(after, id)).toBe(countOf(before, id) - (id === d.ruleId ? 1 : 0));
          }
          expect(after.every((a) => before.some((b) => b.ruleId === a.ruleId))).toBe(true);
        }
      }),
      { numRuns },
    );
  });

  it('can all be made at once, which leaves no Strict problem', () => {
    fc.assert(
      fc.property(scripts(plain), (source) => {
        const changes = run(source)
          .filter(isStrict)
          .flatMap((d) => d.fix?.changes ?? [])
          .sort((a, b) => a.from - b.from);
        for (const [i, change] of changes.entries()) {
          expect(change.from).toBeGreaterThanOrEqual(changes[i - 1]?.to ?? 0);
        }
        const fixed = applyFix(source, { title: 'Fix all', changes });
        expect(run(fixed).filter(isStrict)).toEqual([]);
      }),
      { numRuns },
    );
  });
});

for (const [label, generator] of [
  ['scripts made of lines', scripts(withRegions)],
  ['text made of fragments', jumble],
] as const) {
  describe(`for ${label}`, () => {
    it('diagnostics come in order, and lie inside the text', () => {
      fc.assert(
        fc.property(generator, (source) => {
          const found = run(source);
          for (const [i, d] of found.entries()) {
            expect(d.span.from).toBeGreaterThanOrEqual(0);
            expect(d.span.to).toBeGreaterThanOrEqual(d.span.from);
            expect(d.span.to).toBeLessThanOrEqual(source.length);
            const previous = found[i - 1];
            if (previous && previous.span.from === d.span.from) {
              expect(previous.ruleId <= d.ruleId).toBe(true);
            } else if (previous) {
              expect(previous.span.from).toBeLessThan(d.span.from);
            }
          }
        }),
        { numRuns },
      );
    });

    it('fixes make changes that lie inside the text, in order, and never overlap', () => {
      fc.assert(
        fc.property(generator, (source) => {
          for (const d of run(source)) {
            let end = 0;
            for (const change of d.fix?.changes ?? []) {
              expect(change.from).toBeGreaterThanOrEqual(end);
              expect(change.to).toBeGreaterThanOrEqual(change.from);
              expect(change.to).toBeLessThanOrEqual(source.length);
              end = change.to;
            }
          }
        }),
        { numRuns },
      );
    });

    it('fixes keep the line endings the text has', () => {
      fc.assert(
        fc.property(generator, (source) => {
          for (const d of run(source)) {
            if (d.fix) expect(keepsEndings(source, applyFix(source, d.fix))).toBe(true);
          }
        }),
        { numRuns },
      );
    });
  });
}

describe('the fixtures and samples', () => {
  const dirs = ['fixtures/classification/', 'fixtures/layout/', 'samples/'];
  const files = dirs.flatMap((dir) => {
    const url = new URL(`../../../${dir}`, import.meta.url);
    return readdirSync(url)
      .filter((name) => name.endsWith('.fountain'))
      .map((name) => new URL(name, url));
  });

  it('lose every Strict problem to Fix all, and keep their line endings', () => {
    let fixedFiles = 0;
    for (const url of files) {
      const source = readFileSync(url, 'utf8');
      const changes = run(source)
        .filter(isStrict)
        .flatMap((d) => d.fix?.changes ?? []);
      if (changes.length > 0) fixedFiles++;
      const fixed = applyFix(source, { title: 'Fix all', changes });
      expect(run(fixed).filter(isStrict), url.pathname).toEqual([]);
      expect(keepsEndings(source, fixed), url.pathname).toBe(true);
    }
    // Four of them set off a Strict rule: two classification fixtures, the play's layout
    // fixture, and the stage-play sample.
    expect(fixedFiles).toBeGreaterThanOrEqual(4);
  });
});
