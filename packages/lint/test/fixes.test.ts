import { readdirSync, readFileSync } from 'node:fs';
import { blockAt, parse } from '@drafter/fountain';
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

// Lines that set off the rules in the shapes the parser reads, among lines that get in their
// way: blank lines, the two-space line that joins a speech, section and page-break markers.
const plain = [
  'INT. HALL - DAY',
  'INT. HALL - DAY  ',
  'EXT. YARD - NIGHT',
  'INT. HALL',
  'CUT TO:',
  '.THE HALL',
  '> FADE OUT.',
  'MARGARET',
  'DANNY (V.O.)',
  'MARGARET ^',
  "MARGARET (CONT'D)",
  "DANNY (V.O.) (CONT'D)",
  'BANG!',
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

// Speeches by two people, some with a (CONT'D) typed on the cue, between a few other things.
// Most of the typed ones come after the same speaker's speech, which is where the layout adds
// one, so the rule reports them. A speech is several lines that break as the script does.
const speeches = fc
  .tuple(
    fc.array(
      fc.constantFrom(
        'MARGARET\nHi.',
        "MARGARET (CONT'D)\nHi.",
        'MARGARET (V.O.)\nHi.',
        "MARGARET (V.O.) (CONT'D)\nHi.\n(softly)\nHi.",
        'DANNY\nYo.',
        "DANNY (CONT'D)\nYo.",
        'DANNY ^\nYo.',
        "DANNY (CONT'D) ^\nYo.",
        'She sits.',
        'INT. HALL - DAY',
        '===',
        '[[a note]]',
      ),
      { minLength: 2, maxLength: 12 },
    ),
    fc.boolean(),
    fc.constantFrom('\n', '\r\n'),
  )
  .map(
    ([paragraphs, final, lineBreak]) =>
      paragraphs.map((p) => p.replaceAll('\n', lineBreak)).join(lineBreak + lineBreak) +
      (final ? lineBreak : ''),
  );

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
  "(CONT'D)",
  'BANG!',
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

/**
 * Applies one fix and compares the problems before and after: the fix's own rule has one fewer,
 * no other rule's count changes, and no rule that had no problem has one now.
 */
function expectSettlesOnlyItsOwn(source: string, before: LintDiagnostic[], d: LintDiagnostic) {
  if (!d.fix) return;
  const after = run(applyFix(source, d.fix));
  for (const id of new Set(before.map((b) => b.ruleId))) {
    expect(countOf(after, id)).toBe(countOf(before, id) - (id === d.ruleId ? 1 : 0));
  }
  expect(after.every((a) => before.some((b) => b.ruleId === a.ruleId))).toBe(true);
}

describe('fixes', () => {
  // Without notes and boneyard, because a fix that joins lines can change where a note ends
  // (the search for `]]` stops at a blank line, and an empty line inside a boneyard is one).
  //
  // Only the Strict rules' fixes: they rewrite spacing, and the parser read the file that way
  // already, so no block changes kind. The fix for character-without-dialogue merges two blocks
  // into a cue and its speech, which can change another rule's count: a wrapped parenthetical
  // in the second block becomes one in a speech and gains a multiline-parenthetical, and the
  // cue makes its name known to other lines. It has a property of its own below.
  it('of the Strict rules settle the problem they are for, and no other', () => {
    fc.assert(
      fc.property(scripts(plain), (source) => {
        const before = run(source);
        for (const d of before.filter(isStrict)) expectSettlesOnlyItsOwn(source, before, d);
      }),
      { numRuns },
    );
  });

  it("that remove a typed (CONT'D) settle that problem, and no other", () => {
    let fixedAny = 0;
    fc.assert(
      fc.property(speeches, (source) => {
        const before = run(source);
        for (const d of before.filter((b) => b.ruleId === 'manual-contd')) {
          fixedAny++;
          expectSettlesOnlyItsOwn(source, before, d);
        }
      }),
      { numRuns },
    );
    // Only a cue the layout would continue is reported, so the generator has to reach some.
    expect(fixedAny).toBeGreaterThan(100);
  });

  it('that remove the blank line after a cue-like line make it a cue', () => {
    let fixedAny = false;
    fc.assert(
      fc.property(scripts(plain), (source) => {
        for (const d of run(source).filter((b) => b.ruleId === 'character-without-dialogue')) {
          if (!d.fix) continue;
          fixedAny = true;
          const fixed = applyFix(source, d.fix);
          const block = blockAt(parse(fixed), d.span.from)?.block;
          expect(block?.kind).toBe('character');
          expect(block?.span.from).toBe(d.span.from);
          // It is no longer reported, and the text lost a blank line and nothing else.
          expect(run(fixed).some((r) => r.ruleId === d.ruleId && r.span.from === d.span.from)).toBe(
            false,
          );
          const [change] = d.fix.changes;
          expect(d.fix.changes).toHaveLength(1);
          expect(source.slice(change?.from, change?.to)).toMatch(/^\s*\n$/);
        }
      }),
      { numRuns },
    );
    expect(fixedAny).toBe(true);
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
  ["speeches with a typed CONT'D", speeches],
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
