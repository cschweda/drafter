import { readFileSync } from 'node:fs';
import { parse } from '@drafter/fountain';
import { type LintDiagnostic, lint, withinOneEdit } from '@drafter/lint';
import { builtins, type Template } from '@drafter/templates';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

const screenplay = builtins['us-screenplay'] as Template;

/** What the rule says about a script. Other rules' diagnostics are not looked at. */
const found = (source: string): LintDiagnostic[] =>
  lint(parse(source), screenplay).filter((d) => d.ruleId === 'similar-names');

/** A name cued `times` times, each cue with a line of speech. */
const cued = (name: string, times = 1) => `${name}\nHi.\n\n`.repeat(times);

/** The script with a Drafter metadata block at its end. */
const withMeta = (source: string, meta: object) =>
  `${source}/* drafter\n${JSON.stringify({ v: 1, ...meta })}\n*/\n`;

/** The restricted Damerau-Levenshtein distance, worked out from the whole table. */
function distance(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  const d: number[][] = [];
  for (let i = 0; i <= x.length; i++) {
    d.push(Array.from({ length: y.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  }
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[x.length][y.length];
}

describe('withinOneEdit', () => {
  it.each([
    ['MARGARET', 'MARGERET'],
    ['MARGARET', 'MARGARETT'],
    ['MARGARET', 'MARGRET'],
    ['MARGARET', 'MAGRARET'],
    ['DANNY', 'DANNY'],
  ])('counts %s and %s as within one edit', (a, b) => {
    expect(withinOneEdit(a, b)).toBe(true);
    expect(withinOneEdit(b, a)).toBe(true);
  });

  it('counts two edits as more than one', () => {
    expect(withinOneEdit('MARGARET', 'MAGRARETT')).toBe(false);
  });

  it.each([
    ['two substitutions', 'MARGARET', 'MARGORIT'],
    ['a deletion and an insertion', 'MARGARET', 'MARGRETT'],
    ['two deletions', 'MARGARET', 'MARGRT'],
    ['two insertions', 'MARGARET', 'MARGARETTS'],
    ['a swap of letters that are not neighbours', 'ABCDE', 'CBADE'],
    ['two swaps', 'ABCD', 'BADC'],
    ['three deletions', 'ABC', ''],
  ])('counts %s as more than one edit', (_label, a, b) => {
    expect(withinOneEdit(a, b)).toBe(false);
    expect(withinOneEdit(b, a)).toBe(false);
  });

  it.each([
    ['a substitution at the start', 'MARGARET', 'XARGARET'],
    ['a substitution at the end', 'MARGARET', 'MARGARES'],
    ['an insertion at the start', 'MARGARET', 'XMARGARET'],
    ['an insertion at the end', 'MARGARET', 'MARGARETX'],
    ['a deletion at the start', 'MARGARET', 'ARGARET'],
    ['a deletion at the end', 'MARGARET', 'MARGARE'],
    ['a swap at the start', 'MARGARET', 'AMRGARET'],
    ['a swap at the end', 'MARGARET', 'MARGARTE'],
    ['a swap of the only two letters', 'AB', 'BA'],
  ])('finds %s', (_label, a, b) => {
    expect(withinOneEdit(a, b)).toBe(true);
    expect(withinOneEdit(b, a)).toBe(true);
  });

  it('handles the empty string', () => {
    expect(withinOneEdit('', '')).toBe(true);
    expect(withinOneEdit('', 'A')).toBe(true);
    expect(withinOneEdit('A', '')).toBe(true);
    expect(withinOneEdit('', 'AB')).toBe(false);
  });

  it('counts code points, not UTF-16 units', () => {
    expect(withinOneEdit('A😀BCDE', 'A😁BCDE')).toBe(true);
    expect(withinOneEdit('A😀BCDE', 'ABCDE')).toBe(true);
    // An insertion, and a swap, of whole code points. Two units each would be two edits.
    expect(withinOneEdit('A😀BCDE', 'A😀😁BCDE')).toBe(true);
    expect(withinOneEdit('A😀😁CDE', 'A😁😀CDE')).toBe(true);
    expect(withinOneEdit('😀😁', '😁😀')).toBe(true);
    // Two code points are still two edits.
    expect(withinOneEdit('A😀BCDE', 'A😁BCDF')).toBe(false);
    expect(withinOneEdit('A😀BCDE', 'ABCD')).toBe(false);
  });

  it('agrees with the whole table of the distance', () => {
    const text = fc
      .array(fc.constantFrom('a', 'b', 'c', '😀', '😁'), { maxLength: 6 })
      .map((points) => points.join(''));
    let within = 0;
    let beyond = 0;
    fc.assert(
      fc.property(text, text, (a, b) => {
        const expected = distance(a, b) <= 1;
        expect(withinOneEdit(a, b), JSON.stringify([a, b])).toBe(expected);
        if (expected) within++;
        else beyond++;
      }),
      { numRuns: 5000 },
    );
    // The generator reaches both answers, and plenty of each.
    expect(within).toBeGreaterThan(300);
    expect(beyond).toBeGreaterThan(300);
  });

  it('finds any one edit made to a string, anywhere in it', () => {
    const points = ['a', 'b', 'c', '😀', '😁'];
    const text = fc.array(fc.constantFrom(...points), { maxLength: 8 });
    fc.assert(
      fc.property(
        text,
        fc.nat(),
        fc.constantFrom(...points),
        fc.constantFrom('substitute', 'insert', 'delete', 'swap'),
        (before, place, point, edit) => {
          const after = [...before];
          const i = place % Math.max(before.length, 1);
          if (edit === 'insert') after.splice(place % (before.length + 1), 0, point);
          else if (edit === 'substitute' && before.length > 0) after[i] = point;
          else if (edit === 'delete' && before.length > 0) after.splice(i, 1);
          else if (edit === 'swap' && before.length > 1) {
            const j = place % (before.length - 1);
            after[j] = before[j + 1] as string;
            after[j + 1] = before[j] as string;
          }
          const a = before.join('');
          const b = after.join('');
          expect(withinOneEdit(a, b), JSON.stringify([a, b, edit])).toBe(true);
          expect(withinOneEdit(b, a), JSON.stringify([b, a, edit])).toBe(true);
        },
      ),
      { numRuns: 3000 },
    );
  });
});

describe('similar-names', () => {
  it('flags a rare name one letter from a common one, at its first cue', () => {
    const source = `${cued('MARGARET', 6)}${cued('MARGERET')}${cued('MARGARET', 6)}`;
    const at = source.indexOf('MARGERET');
    expect(found(source)).toEqual([
      {
        ruleId: 'similar-names',
        severity: 'info',
        span: { from: at, to: at + 'MARGERET'.length },
        message: '"MARGERET" is one letter from "MARGARET", which has 12 cues. A typo?',
      },
    ]);
    expect(found(source)[0]?.fix).toBeUndefined();
  });

  it('points at the first cue of the rare name, and counts all of them', () => {
    const source = `${cued('MARGARET', 3)}${cued('MARGERET')}${cued('MARGARET', 3)}${cued('MARGERET')}`;
    const [d, ...rest] = found(source);
    expect(rest).toEqual([]);
    expect(d?.span).toEqual({
      from: source.indexOf('MARGERET'),
      to: source.indexOf('MARGERET') + 8,
    });
    expect(d?.message).toBe('"MARGERET" is one letter from "MARGARET", which has 6 cues. A typo?');
  });

  it('reports the rarer name even when it comes first', () => {
    const source = `${cued('MARGERET')}${cued('MARGARET', 5)}`;
    expect(found(source)).toEqual([
      {
        ruleId: 'similar-names',
        severity: 'info',
        span: { from: 0, to: 8 },
        message: '"MARGERET" is one letter from "MARGARET", which has 5 cues. A typo?',
      },
    ]);
  });

  it('reports a name cued twice, and leaves one cued three times', () => {
    expect(found(`${cued('MARGARET', 5)}${cued('MARGERET', 2)}`)).toHaveLength(1);
    expect(found(`${cued('MARGARET', 5)}${cued('MARGERET', 3)}`)).toEqual([]);
  });

  it('leaves two common names alone', () => {
    expect(found(`${cued('MARGARET', 3)}${cued('MARGERET', 3)}`)).toEqual([]);
    expect(found(`${cued('MARGARET', 12)}${cued('MARGERET', 3)}`)).toEqual([]);
    expect(found(`${cued('MARGARET', 4)}${cued('MARGERET', 9)}`)).toEqual([]);
  });

  describe('with a tie', () => {
    it('reports the name that first appears later', () => {
      const margaretFirst = `${cued('MARGARET')}${cued('MARGERET')}`;
      const at = margaretFirst.indexOf('MARGERET');
      expect(found(margaretFirst)).toEqual([
        {
          ruleId: 'similar-names',
          severity: 'info',
          span: { from: at, to: at + 8 },
          message: '"MARGERET" is one letter from "MARGARET", which has 1 cue. A typo?',
        },
      ]);

      const margeretFirst = `${cued('MARGERET')}${cued('MARGARET')}`;
      const later = margeretFirst.indexOf('MARGARET');
      expect(found(margeretFirst)).toEqual([
        {
          ruleId: 'similar-names',
          severity: 'info',
          span: { from: later, to: later + 8 },
          message: '"MARGARET" is one letter from "MARGERET", which has 1 cue. A typo?',
        },
      ]);
    });

    it('breaks a tie at two cues the same way', () => {
      const source = `${cued('MARGERET', 2)}${cued('MARGARET', 2)}`;
      const [d, ...rest] = found(source);
      expect(rest).toEqual([]);
      expect(d?.span.from).toBe(source.indexOf('MARGARET'));
      expect(d?.message).toBe(
        '"MARGARET" is one letter from "MARGERET", which has 2 cues. A typo?',
      );
    });
  });

  it('says "1 cue" for one, and "2 cues" for two', () => {
    expect(found(`${cued('MARGARET')}${cued('MARGERET')}`)[0]?.message).toMatch(
      /which has 1 cue\./,
    );
    expect(found(`${cued('MARGARET', 2)}${cued('MARGERET')}`)[0]?.message).toMatch(
      /which has 2 cues\./,
    );
  });

  it('reports each pair once, at the rarer name of the pair', () => {
    // MARGARET is the common one. The other two are one letter from it and from each other.
    const source = `${cued('MARGARET', 5)}${cued('MARGERET')}${cued('MARGIRET')}`;
    const erat = source.indexOf('MARGERET');
    const irat = source.indexOf('MARGIRET');
    expect(found(source).map((d) => [d.span.from, d.message])).toEqual([
      [erat, '"MARGERET" is one letter from "MARGARET", which has 5 cues. A typo?'],
      [irat, '"MARGIRET" is one letter from "MARGARET", which has 5 cues. A typo?'],
      [irat, '"MARGIRET" is one letter from "MARGERET", which has 1 cue. A typo?'],
    ]);
  });

  it('gives each diagnostic a span of its own', () => {
    const doc = parse(`${cued('MARGARET', 5)}${cued('MARGERET')}${cued('MARGIRET')}`);
    const before = structuredClone(doc.blocks.map((b) => [b.span, ...b.lines.map((l) => l.span)]));
    const mine = lint(doc, screenplay).filter((d) => d.ruleId === 'similar-names');
    expect(mine).toHaveLength(3);
    // The last two are about the same cue line, and still don't share a span.
    expect(mine[1]?.span).toEqual(mine[2]?.span);
    expect(mine[1]?.span).not.toBe(mine[2]?.span);
    for (const d of mine) {
      d.span.from = 99;
      d.span.to = 99;
    }
    expect(doc.blocks.map((b) => [b.span, ...b.lines.map((l) => l.span)])).toEqual(before);
  });

  describe('which edits count', () => {
    it.each([
      ['a letter that is wrong', 'MARGERET'],
      ['a letter that is missing', 'MARGRET'],
      ['a letter too many', 'MARGAERET'],
      ['two letters swapped', 'MAGRARET'],
      ['a different first letter', 'NARGARET'],
      ['a different last letter', 'MARGARES'],
    ])('flags %s', (_label, typo) => {
      const source = `${cued('MARGARET', 5)}${cued(typo)}`;
      expect(found(source).map((d) => d.message)).toEqual([
        `"${typo}" is one letter from "MARGARET", which has 5 cues. A typo?`,
      ]);
    });

    it('reports a swap once, though the two names share two keys', () => {
      expect(found(`${cued('MARGARET', 5)}${cued('MAGRARET')}`)).toHaveLength(1);
    });

    it('leaves two edits alone', () => {
      expect(found(`${cued('MARGARET', 5)}${cued('MAGRARETT')}`)).toEqual([]);
      expect(found(`${cued('MARGARET', 5)}${cued('MARGORIT')}`)).toEqual([]);
      expect(found(`${cued('MARGARET', 5)}${cued('MARGRT')}`)).toEqual([]);
    });
  });

  describe('which names are compared', () => {
    it.each([
      ['MAX', 'MAC'],
      ['ANN', 'ANNA'],
      ['DANNY', 'DANNYS'],
    ])('leaves %s and %s alone', (a, b) => {
      // Too short, or one starts the other. Either way, a rare one next to a common one.
      expect(found(`${cued(a, 5)}${cued(b)}`)).toEqual([]);
      expect(found(`${cued(a)}${cued(b, 5)}`)).toEqual([]);
    });

    it('leaves a name alone that another name starts, and not one that ends it', () => {
      expect(found(`${cued('MARGARET', 5)}${cued('MARGARETT')}`)).toEqual([]);
      expect(found(`${cued('MARGARETT', 5)}${cued('MARGARET')}`)).toEqual([]);
      // At the other end it is no prefix.
      expect(found(`${cued('MARGARET', 5)}${cued('SMARGARET')}`)).toHaveLength(1);
    });

    it('wants five letters in both names', () => {
      expect(found(`${cued('LEILA', 5)}${cued('LAILA')}`)).toHaveLength(1);
      expect(found(`${cued('LEILA', 5)}${cued('LEIA')}`)).toEqual([]);
      expect(found(`${cued('JOHN', 5)}${cued('JOAN')}`)).toEqual([]);
    });

    it('counts letters, not characters', () => {
      // Five characters, or six, but not five letters.
      expect(found(`${cued('COP 1', 5)}${cued('COP 2')}`)).toEqual([]);
      expect(found(`${cued('R2-D2', 5)}${cued('R2-B2')}`)).toEqual([]);
      expect(found(`${cued('NAME12', 5)}${cued('NAME13')}`)).toEqual([]);
      // Letters in other alphabets count as letters.
      expect(found(`${cued('ÉLODIE', 5)}${cued('ÉLODIA')}`)).toHaveLength(1);
      expect(found(`${cued('ΜΑΡΙΑΜ', 5)}${cued('ΜΑΡΙΑΝ')}`)).toHaveLength(1);
    });

    it('compares names of up to 32 code points', () => {
      const full = 'ABCDEFGH'.repeat(4);
      expect(found(`${cued(full, 5)}${cued(`${full.slice(0, 31)}Z`)}`)).toHaveLength(1);
      expect(found(`${cued(`${full}K`, 5)}${cued(`${full}Z`)}`)).toEqual([]);
    });

    it.each([
      ['an emoji put in', 'ABCDE😀F', 'ABCDEF'],
      ['an emoji left out', 'ABCDEF', 'ABCDE😀F'],
      ['an emoji for a letter of another plane', 'ABCDE😀', 'ABCDE\u{1D400}'],
      ['two such characters swapped', 'ABCDE😀\u{1D400}', 'ABCDE\u{1D400}😀'],
    ])('finds %s, which is one edit although it is two UTF-16 units', (_label, common, typo) => {
      // The two names have no UTF-16 unit in common where they differ, so the index has to
      // leave out whole code points to find them.
      expect(found(`${cued(common, 5)}${cued(typo)}`)).toHaveLength(1);
    });

    it('measures a name in code points, not UTF-16 units', () => {
      // 𝐀 and 𝐁 are capital letters of two units each: 32 of them are 64 units, 32 code points.
      const [a, b] = ['\u{1D400}', '\u{1D401}'] as [string, string];
      expect(found(`${cued(a.repeat(32), 5)}${cued(a.repeat(31) + b)}`)).toHaveLength(1);
      expect(found(`${cued(a.repeat(33), 5)}${cued(a.repeat(32) + b)}`)).toEqual([]);
    });

    it('looks at up to eight names that differ in one place, and leaves a longer series alone', () => {
      const series = (size: number) =>
        Array.from({ length: size }, (_, i) => cued(`SOLDIER ${i + 1}`)).join('');
      // Eight names that differ in one place are looked at, and each pair is one letter apart.
      expect(found(series(8))).toHaveLength(28);
      // Nine are a series: nobody typed that many typos of one name.
      expect(found(series(9))).toEqual([]);
    });

    it('does not count what is not a cue', () => {
      // An upper-case action line, and a name in speech and in action.
      const source = `${cued('MARGARET', 5)}MARGERET\n\nShe waits for MARGERET.\n\nDANNY\nTell MARGERET.\n`;
      expect(found(source)).toEqual([]);
    });
  });

  describe('names are compared in upper case', () => {
    it('treats names that differ only in case as one name', () => {
      expect(found(`${cued('@McCLANE')}${cued('MCCLANE')}`)).toEqual([]);
      expect(found(`${cued('MCCLANE')}${cued('@McCLANE')}`)).toEqual([]);
      expect(found(`${cued('@Margaret', 2)}${cued('MARGARET')}${cued('@margaret')}`)).toEqual([]);
    });

    it('adds up the cues of a name typed two ways', () => {
      // MARGARET has 2 + 3 cues, in two spellings.
      const source = `${cued('@Margaret', 2)}${cued('MARGARET', 3)}${cued('MARGERET')}`;
      expect(found(source).map((d) => d.message)).toEqual([
        '"MARGERET" is one letter from "MARGARET", which has 5 cues. A typo?',
      ]);
    });

    it('counts the rare name typed two ways as one, and reports it at its first cue', () => {
      // MARGERET is 2 cues in all, the first of them forced in mixed case.
      const source = `${cued('MARGARET', 5)}${cued('@Margeret')}${cued('MARGERET')}`;
      const [d, ...rest] = found(source);
      expect(rest).toEqual([]);
      expect(d?.span).toEqual({
        from: source.indexOf('@Margeret'),
        to: source.indexOf('@Margeret') + 9,
      });
      expect(d?.message).toBe(
        '"MARGERET" is one letter from "MARGARET", which has 5 cues. A typo?',
      );
      // Three cues in all is a common name.
      expect(found(`${source}${cued('@Margeret')}`)).toEqual([]);
    });

    it('names the upper-case spelling of a name typed in mixed case', () => {
      const source = `${cued('MARGARET', 5)}${cued('@Margeret')}`;
      expect(found(source)[0]?.message).toBe(
        '"MARGERET" is one letter from "MARGARET", which has 5 cues. A typo?',
      );
    });
  });

  describe('what makes a cue', () => {
    it('counts extensions and dual dialogue as cues of the name', () => {
      const source = `MARGARET (V.O.)\nHi.\n\nMARGARET (O.S.)\nHi.\n\nMARGARET ^\nHi.\n\n${cued('MARGERET')}`;
      expect(found(source).map((d) => d.message)).toEqual([
        '"MARGERET" is one letter from "MARGARET", which has 3 cues. A typo?',
      ]);
    });

    it('points at the whole cue line, extension and indent included', () => {
      const source = `${cued('MARGARET', 5)}  MARGERET (V.O.)\nHi.\n`;
      const at = source.indexOf('  MARGERET');
      expect(found(source)[0]?.span).toEqual({ from: at, to: at + '  MARGERET (V.O.)'.length });
    });

    it('points at a cue line in a CRLF file, which ends with its carriage return', () => {
      const source = `${cued('MARGARET', 5)}${cued('MARGERET')}`.replaceAll('\n', '\r\n');
      const at = source.indexOf('MARGERET');
      expect(found(source)).toEqual([
        {
          ruleId: 'similar-names',
          severity: 'info',
          span: { from: at, to: at + 'MARGERET\r'.length },
          message: '"MARGERET" is one letter from "MARGARET", which has 5 cues. A typo?',
        },
      ]);
    });

    it('points at a forced cue from its marker', () => {
      const source = `${cued('@McCLANE', 5)}${cued('@McLANE')}`;
      const at = source.indexOf('@McLANE');
      expect(found(source)).toEqual([
        {
          ruleId: 'similar-names',
          severity: 'info',
          span: { from: at, to: at + '@McLANE'.length },
          message: '"MCLANE" is one letter from "MCCLANE", which has 5 cues. A typo?',
        },
      ]);
    });
  });

  describe('names marked as distinct', () => {
    const script = `${cued('MARGARET', 5)}${cued('MARGERET')}`;

    it('leaves names marked as distinct alone', () => {
      expect(found(script)).toHaveLength(1);
      expect(found(withMeta(script, { distinctNames: [['margaret', 'margeret']] }))).toEqual([]);
    });

    it('takes the pair in either order, in any case', () => {
      for (const pair of [
        ['MARGERET', 'MARGARET'],
        ['Margeret', 'Margaret'],
        ['  margeret ', ' MARGARET  '],
      ]) {
        expect(found(withMeta(script, { distinctNames: [pair] })), JSON.stringify(pair)).toEqual(
          [],
        );
      }
    });

    it('marks only the pair it lists', () => {
      const three = `${cued('MARGARET', 5)}${cued('MARGERET')}${cued('MARGIRET')}`;
      const irat = three.indexOf('MARGIRET');
      expect(found(three)).toHaveLength(3);
      // MARGARET and MARGERET are distinct. The other two pairs are still reported.
      expect(
        found(withMeta(three, { distinctNames: [['margaret', 'margeret']] })).map((d) => [
          d.span.from,
          d.message,
        ]),
      ).toEqual([
        [irat, '"MARGIRET" is one letter from "MARGARET", which has 5 cues. A typo?'],
        [irat, '"MARGIRET" is one letter from "MARGERET", which has 1 cue. A typo?'],
      ]);
      expect(
        found(
          withMeta(three, {
            distinctNames: [
              ['MARGARET', 'MARGERET'],
              ['MARGARET', 'MARGIRET'],
              ['MARGERET', 'MARGIRET'],
            ],
          }),
        ),
      ).toEqual([]);
    });

    it('does not take a name by itself, or a pair that shares only one name', () => {
      expect(found(withMeta(script, { distinctNames: [['margaret', 'danny']] }))).toHaveLength(1);
      expect(found(withMeta(script, { distinctNames: [['margeret', 'margeret']] }))).toHaveLength(
        1,
      );
    });

    it.each([
      ['a string', 'margaret'],
      ['a number', 42],
      ['true', true],
      ['null', null],
      ['an object', { margaret: 'margeret' }],
      ['a list of strings', ['margaret', 'margeret']],
      ['a list of numbers', [[1, 2]]],
      ['a list of one name', [['margaret']]],
      ['a list of three names', [['margaret', 'margeret', 'margiret']]],
      ['a pair with a null', [[null, 'margeret']]],
      ['a pair with a list', [[['margaret'], 'margeret']]],
      ['a pair with an object', [['margaret', { name: 'margeret' }]]],
      ['an empty list', []],
      ['a list of empty pairs', [[], [[]]]],
    ])('ignores distinctNames that is %s', (_label, distinctNames) => {
      expect(found(withMeta(script, { distinctNames }))).toHaveLength(1);
    });

    it('takes the pairs it can read from a list with other things in it', () => {
      const distinctNames = [5, null, 'margaret', ['danny'], ['margaret', 'margeret'], [7, 8]];
      expect(found(withMeta(script, { distinctNames }))).toEqual([]);
    });

    it('is not troubled by a script with no metadata, or metadata that is not JSON', () => {
      expect(found(script)).toHaveLength(1);
      expect(found(withMeta(script, {}))).toHaveLength(1);
      expect(found(`${script}/* drafter\n{ nope }\n*/\n`)).toHaveLength(1);
    });
  });

  it('finds nothing in the sample scripts', () => {
    for (const name of ['screenplay', 'stage-play']) {
      const source = readFileSync(
        new URL(`../../../samples/${name}.fountain`, import.meta.url),
        'utf8',
      );
      expect(found(source), name).toEqual([]);
    }
  });

  describe('the candidate index', () => {
    // Names of two letters, five or six long, so that many pairs are one edit apart: at most
    // eight of them, so that no key is shared by more than eight names.
    const word = fc
      .array(fc.constantFrom('A', 'B'), { minLength: 5, maxLength: 6 })
      .map((letters) => letters.join(''));
    const casts = fc.array(
      fc.record({ name: word, forced: fc.boolean(), times: fc.integer({ min: 1, max: 4 }) }),
      { minLength: 2, maxLength: 8 },
    );

    const startsTheOther = (a: string, b: string) => {
      const [short, long] = a.length <= b.length ? [a, b] : [b, a];
      return long.startsWith(short);
    };

    it('finds exactly the pairs that comparing every name with every other finds', () => {
      let reported = 0;
      let tooCommon = 0;
      let aPrefix = 0;
      fc.assert(
        fc.property(casts, (cast) => {
          // The script, and for each name in upper case where it first appears and how often.
          let source = '';
          const names = new Map<string, { at: number; count: number; order: number }>();
          for (const { name, forced, times } of cast) {
            const known = names.get(name);
            if (known) known.count += times;
            else names.set(name, { at: source.length, count: times, order: names.size });
            source += cued(forced ? `@${name.toLowerCase()}` : name, times);
          }

          // Every pair, by the table of the distance.
          const expected: Array<{ order: [number, number]; at: number; message: string }> = [];
          const list = [...names];
          for (const [i, [keyA, a]] of list.entries()) {
            for (const [keyB, b] of list.slice(i + 1)) {
              if (distance(keyA, keyB) > 1) continue;
              if (startsTheOther(keyA, keyB)) aPrefix++;
              else if (Math.min(a.count, b.count) > 2) tooCommon++;
              if (startsTheOther(keyA, keyB) || Math.min(a.count, b.count) > 2) continue;
              const rare =
                a.count === b.count ? (a.order > b.order ? a : b) : a.count < b.count ? a : b;
              const [rareKey, other, otherKey] = rare === a ? [keyA, b, keyB] : [keyB, a, keyA];
              expected.push({
                order: [rare.order, other.order],
                at: rare.at,
                message: `"${rareKey}" is one letter from "${otherKey}", which has ${other.count} ${other.count === 1 ? 'cue' : 'cues'}. A typo?`,
              });
            }
          }
          expected.sort((x, y) => x.order[0] - y.order[0] || x.order[1] - y.order[1]);
          reported += expected.length;

          expect(
            found(source).map((d) => ({ at: d.span.from, message: d.message })),
            JSON.stringify(source),
          ).toEqual(expected.map(({ at, message }) => ({ at, message })));
        }),
        { numRuns: 1000 },
      );
      // The generator reaches pairs that are reported, and pairs that the counts or a prefix spare.
      expect(reported).toBeGreaterThan(300);
      expect(tooCommon).toBeGreaterThan(30);
      expect(aPrefix).toBeGreaterThan(30);
    });
  });
});
