import { createHash } from 'node:crypto';
import { parse } from '@drafter/fountain';
import { readMarkdownMeta } from '@drafter/markdown';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  cleanWorkName,
  type DraftFacts,
  draftFile,
  draftFileName,
  readDraftFile,
  type WorkKind,
} from '../src';

const hashText = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

const facts = (text: string, extra: Partial<DraftFacts> = {}): DraftFacts => ({
  draft: 3,
  id: hashText(text),
  frozen: '2026-11-03T14:05:00.000Z',
  note: 'after the table read',
  ...extra,
});

/** Texts built from the pieces most likely to confuse the block. */
const anyText = fc
  .array(
    fc.constantFrom(
      'INT. FERRY - DAWN',
      'Nell counts the fares.',
      'NELL',
      '\n',
      '\r\n',
      '\n\n',
      ' ',
      '/*',
      '*/',
      '/* drafter',
      '/* drafter\n{"template":"stage-play"}\n*/',
      '<!-- drafter {"a":1} -->',
      '-->',
      '[[a note]]',
      '```',
      '# Part one',
      'é ✓ 𝄞',
    ),
    { maxLength: 30 },
  )
  .map((parts) => parts.join(''));

/** Texts that end with a metadata block of their own, laid out as a writer might. */
const textWithBlock = fc
  .tuple(
    anyText,
    fc.constantFrom('\n', '\r\n'),
    fc.constantFrom(
      '{"template":"stage-play"}',
      '{"v":1,"template":"us-screenplay","scenes":true}',
      '{ "template" : "x" ,\n  "draft": 9 }',
      '{"draft":2,"id":"abc","note":"older"}',
    ),
    fc.constantFrom('', '\n', '\n\n', '  \n'),
  )
  .map(([text, nl, json, after]) => `${text}${nl}${nl}/* drafter${nl}${json}${nl}*/${after}`);

const anyNote = fc.oneof(
  fc.constant(''),
  fc.constant('ends */ here'),
  fc.constant('ends --> here'),
  fc.constant('/* drafter */ and <!-- drafter {} -->'),
  fc.string({ maxLength: 20 }).filter((s) => !/[\r\n\u2028\u2029]/.test(s)),
);

describe('draftFileName', () => {
  test('names drafts with two digits, three past 99', () => {
    expect(draftFileName('Boca', 1, 'fountain')).toBe('Boca – Draft 01.fountain');
    expect(draftFileName('Boca', 12, 'markdown')).toBe('Boca – Draft 12.md');
    expect(draftFileName('Boca', 99, 'fountain')).toBe('Boca – Draft 99.fountain');
    expect(draftFileName('Boca', 100, 'fountain')).toBe('Boca – Draft 100.fountain');
  });

  test('refuses a number that isn’t a draft number', () => {
    for (const n of [0, -1, 1.5, Number.NaN]) {
      expect(() => draftFileName('Boca', n, 'fountain')).toThrow(RangeError);
    }
  });
});

describe('cleanWorkName', () => {
  test('replaces what a file name can\u2019t hold', () => {
    expect(draftFileName('Boca: the "movie"?', 1, 'fountain')).toBe(
      'Boca_ the _movie__ – Draft 01.fountain',
    );
    expect(cleanWorkName('a/b\\c*d<e>f|g')).toBe('a_b_c_d_e_f_g');
    expect(cleanWorkName('a\u0000b\u001fc\u007fd\te')).toBe('a_b_c_d_e');
  });

  test('drops leading dots and trailing dots and spaces', () => {
    expect(cleanWorkName('.hidden')).toBe('hidden');
    expect(cleanWorkName('. .x')).toBe('x');
    expect(cleanWorkName('Boca. ')).toBe('Boca');
  });

  test('refuses "..", and a name with nothing left', () => {
    for (const bad of ['..', 'a..b', '../etc', '', '   ', '.', '...']) {
      expect(() => cleanWorkName(bad)).toThrow(RangeError);
      expect(() => draftFileName(bad, 1, 'fountain')).toThrow(RangeError);
    }
  });

  test('caps the length without splitting a character', () => {
    expect(cleanWorkName('x'.repeat(500))).toBe('x'.repeat(120));
    const clef = cleanWorkName('𝄞'.repeat(100));
    expect(clef).toBe('𝄞'.repeat(60));
    expect(cleanWorkName(`${'x'.repeat(119)}𝄞`)).toBe('x'.repeat(119));
  });
});

describe('Fountain draft files', () => {
  test('a Fountain draft file is the text, one blank line, the block', () => {
    const text = 'INT. FERRY - DAWN\n\nNell counts the fares.';
    const file = draftFile(text, facts(text), 'fountain');
    expect(file).toBe(
      `${text}\n\n/* drafter\n{"v":1,"draft":3,"id":"${hashText(text)}","frozen":"2026-11-03T14:05:00.000Z","note":"after the table read"}\n*/\n`,
    );
    // Other Fountain apps (and Drafter) read it as the script's metadata block.
    expect(parse(file).meta).toMatchObject({ draft: 3, id: hashText(text) });
  });

  test('readDraftFile gives back the exact text and facts', () => {
    fc.assert(
      fc.property(fc.oneof(anyText, textWithBlock), anyNote, (text, note) => {
        const f = facts(text, { note });
        const back = readDraftFile(draftFile(text, f, 'fountain'), 'fountain');
        expect(back).toEqual({ text, facts: f });
      }),
      { numRuns: 400 },
    );
  });

  test('the ID verifies: hashing readDraftFile’s text gives facts.id', () => {
    fc.assert(
      fc.property(fc.oneof(anyText, textWithBlock), (text) => {
        const back = readDraftFile(draftFile(text, facts(text), 'fountain'), 'fountain');
        expect(back.facts).not.toBeNull();
        expect(hashText(back.text)).toBe(back.facts?.id);
      }),
      { numRuns: 200 },
    );
  });

  test('a script’s own block is merged, and its keys survive', () => {
    const text = 'INT. FERRY - DAWN\n\n/* drafter\n{"template":"stage-play","v":1}\n*/\n';
    const file = draftFile(text, facts(text), 'fountain');
    // One block, not two: the draft's facts joined the script's own.
    expect(file.match(/(?<!\\)\/\* drafter/g)).toHaveLength(1);
    expect(parse(file).meta).toMatchObject({ template: 'stage-play', draft: 3 });
    expect(readDraftFile(file, 'fountain')).toEqual({ text, facts: facts(text) });

    fc.assert(
      fc.property(textWithBlock, (t) => {
        const own = parse(t).meta;
        fc.pre(own !== null);
        const merged = parse(draftFile(t, facts(t), 'fountain')).meta;
        expect(merged).toMatchObject({ ...own, ...facts(t) });
      }),
      { numRuns: 200 },
    );
  });

  test('freezing a reopened draft file replaces its old facts whole', () => {
    const first = 'Nell counts the fares.';
    const restored = facts(first, { draft: 7, from: { draft: 3, id: 'a'.repeat(64) } });
    for (const kind of ['fountain', 'markdown'] as const) {
      const reopened = draftFile(first, restored, kind);
      const again = draftFile(reopened, facts(reopened, { draft: 9 }), kind);
      expect(readDraftFile(again, kind)).toEqual({
        text: reopened,
        facts: facts(reopened, { draft: 9 }),
      });
    }
  });

  test('keeps where a restored draft came from', () => {
    const text = 'Nell counts the fares.';
    const f = facts(text, { draft: 7, from: { draft: 3, id: 'a'.repeat(64) } });
    expect(readDraftFile(draftFile(text, f, 'fountain'), 'fountain')).toEqual({ text, facts: f });
  });

  test('a damaged block is a problem, not a throw', () => {
    const text = 'Nell counts the fares.';
    const good = draftFile(text, facts(text), 'fountain');
    const damaged = [
      good.replace('"draft":3', '"draft":"three"'),
      good.replace('"draft":3', '"draft":0'),
      good.replace(hashText(text), 'abc123'),
      good.replace(hashText(text), hashText(text).toUpperCase()),
      good.replace('2026-11-03T14:05:00.000Z', 'last Tuesday'),
      good.replace('"note":"after the table read"', '"note":"two\\nlines"'),
      good.replace('"note":"after the table read"', '"note":5'),
      good.replace('{"v"', '{v'),
      good.replace('\n*/\n', '\n'),
      good.replace('/* drafter', '/* other'),
      'Just a script, no block at all.',
      '',
    ];
    for (const file of damaged) {
      const back = readDraftFile(file, 'fountain');
      expect(back.facts).toBeNull();
      expect(back).toHaveProperty('problem');
      expect((back as { problem: string }).problem).toMatch(/\S/);
      expect(back.text).toBe(file);
    }
  });

  test('a note with "*/" or "-->" can’t end the block early', () => {
    const text = 'Nell counts the fares.';
    for (const note of ['ends */ here', 'ends --> here', '*/', '/* drafter']) {
      const file = draftFile(text, facts(text, { note }), 'fountain');
      expect(file.indexOf('*/')).toBe(file.lastIndexOf('*/'));
      expect(readDraftFile(file, 'fountain')).toEqual({ text, facts: facts(text, { note }) });
      expect(parse(file).meta).toMatchObject({ note });
    }
  });

  test('refuses facts that couldn’t be read back', () => {
    const text = 'Nell.';
    for (const bad of [
      { draft: 0 },
      { id: 'abc' },
      { frozen: 'yesterday' },
      { note: 'two\nlines' },
      { from: { draft: 1, id: 'nope' } },
    ]) {
      expect(() => draftFile(text, facts(text, bad as Partial<DraftFacts>), 'fountain')).toThrow(
        TypeError,
      );
    }
  });
});

describe('Markdown draft files', () => {
  const kind: WorkKind = 'markdown';

  test('a Markdown draft round-trips through the trailing comment', () => {
    const text = '# Boca\n\nThe pier at dawn.\n';
    const file = draftFile(text, facts(text), kind);
    expect(file.startsWith(`${text}\n\n<!-- drafter {`)).toBe(true);
    expect(readMarkdownMeta(file).meta).toMatchObject({ draft: 3, id: hashText(text) });
    expect(readDraftFile(file, kind)).toEqual({ text, facts: facts(text) });

    fc.assert(
      fc.property(anyText, anyNote, (t, note) => {
        const f = facts(t, { note });
        expect(readDraftFile(draftFile(t, f, kind), kind)).toEqual({ text: t, facts: f });
      }),
      { numRuns: 400 },
    );
  });

  test('a document’s own trailing comment is merged, and the text comes back exactly', () => {
    const text = 'The pier.\n\n<!-- drafter { "v": 2, "keep": "me" } -->\n';
    const file = draftFile(text, facts(text), kind);
    expect(file.match(/<!-- drafter/g)).toHaveLength(1);
    expect(readMarkdownMeta(file).meta).toMatchObject({ keep: 'me', draft: 3 });
    expect(readDraftFile(file, kind)).toEqual({ text, facts: facts(text) });
  });

  test('a damaged comment is a problem, not a throw', () => {
    const text = 'The pier.';
    const good = draftFile(text, facts(text), kind);
    for (const file of [
      good.replace('"draft":3', '"draft":-3'),
      good.replace(' -->', ''),
      'No comment here.',
    ]) {
      const back = readDraftFile(file, kind);
      expect(back.facts).toBeNull();
      expect((back as { problem: string }).problem).toMatch(/\S/);
      expect(back.text).toBe(file);
    }
  });
});

describe('freezing again, dates, and the byte order mark', () => {
  for (const kind of ['fountain', 'markdown'] as const) {
    test(`a ${kind} draft file frozen 30 times over stays a bounded size beyond its text`, () => {
      let text =
        kind === 'fountain'
          ? 'INT. FERRY - DAWN\n\n/* drafter\n{"template":"stage-play"}\n*/\n'
          : 'The pier.\n\n<!-- drafter {"keep":"me"} -->\n';
      for (let round = 1; round <= 30; round++) {
        const f = facts(text, { draft: round, note: `round ${round}` });
        const file = draftFile(text, f, kind);
        expect(readDraftFile(file, kind)).toEqual({ text, facts: f });
        expect(hashText(text)).toBe(f.id);
        // The block is the facts and the writer's own keys, never the old blocks again.
        expect(file.length - text.length).toBeLessThan(400);
        if (kind === 'fountain') expect(parse(file).meta).toMatchObject({ template: 'stage-play' });
        else expect(readMarkdownMeta(file).meta).toMatchObject({ keep: 'me' });
        text = file;
      }
    });
  }

  test('a date is read as the moment it names, whatever its precision', () => {
    const text = 'Nell.';
    const good = draftFile(text, facts(text), 'fountain');
    const back = readDraftFile(good.replace('14:05:00.000Z', '14:05:00Z'), 'fountain');
    expect(back.facts?.frozen).toBe('2026-11-03T14:05:00.000Z');
    expect(
      readDraftFile(good.replace('14:05:00.000Z', '14:05:00.5Z'), 'fountain').facts?.frozen,
    ).toBe('2026-11-03T14:05:00.500Z');
  });

  test('an impossible date is a problem, and isn\u2019t written', () => {
    const text = 'Nell.';
    const good = draftFile(text, facts(text), 'fountain');
    for (const at of [
      '2026-02-30T10:00:00.000Z',
      '2026-13-01T10:00:00.000Z',
      '2026-11-03T24:30:00.000Z',
    ]) {
      const back = readDraftFile(good.replace('2026-11-03T14:05:00.000Z', at), 'fountain');
      expect(back.facts).toBeNull();
      expect(() => draftFile(text, facts(text, { frozen: at }), 'fountain')).toThrow(TypeError);
    }
    // Written by Drafter means written as toISOString writes it.
    expect(() =>
      draftFile(text, facts(text, { frozen: '2026-11-03T14:05:00Z' }), 'fountain'),
    ).toThrow(TypeError);
  });

  test('a text that starts with a byte order mark keeps it', () => {
    for (const kind of ['fountain', 'markdown'] as const) {
      const text = '\uFEFFINT. FERRY - DAWN\n';
      const back = readDraftFile(draftFile(text, facts(text), kind), kind);
      expect(back).toEqual({ text, facts: facts(text) });
      expect(hashText(back.text)).toBe(hashText(text));
    }
  });
});
