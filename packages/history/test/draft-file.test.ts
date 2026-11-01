import { createHash } from 'node:crypto';
import { parse } from '@drafter/fountain';
import { readMarkdownMeta } from '@drafter/markdown';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { type DraftFacts, draftFile, draftFileName, readDraftFile, type WorkKind } from '../src';

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
    const text = 'The pier.\n\n<!-- drafter { "draft": 2, "keep": "me" } -->\n';
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
