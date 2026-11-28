import 'fake-indexeddb/auto';
import { gzipSync } from 'node:zlib';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, test } from 'vitest';
import type { LookupBuild } from 'w1913';
import { DEFINITIONS_SIZE_LABEL, DEFINITIONS_SOURCE, isTheFile } from '../app/definitions/source';
import { hasDefinitions, readDefinitions, saveDefinitions } from '../app/definitions/store';
import { wordToLookUp } from '../app/definitions/word';
import { spellMenuItems } from '../app/spell/menu-items';
import {
  createDefinitionsWorker,
  lookupWord,
  parseBuild,
} from '../app/workers/definitions-compute';
import { cachedDefinitions, syncDefinitions } from '../scripts/definitions.mjs';

// Definitions (definitions design §7): the worker's answers from a small build in the real format,
// the word Look up takes, the store's refusal of anything but the pinned file, and the build
// script's download.

const build: LookupBuild = {
  format: 'w1913-lookup',
  formatVersion: 1,
  edition: 'test',
  siteVersion: '0.0.0',
  built: '2026-11-27',
  licence: 'CC0-1.0',
  source: 'test',
  site: 'https://w1913.com',
  reserved: [],
  pages: [
    [
      'bill',
      'Bill',
      [['n.', [[1, 'An account.']], [[['Bill of fare'], 'a list of dishes.', 'n-p-bill-of-fare']]]],
    ],
    ['saunter', 'Saunter', [['v. i.', [[null, 'To wander idly.']]]]],
    ['walk', 'Walk', [['v. i.', [[1, 'To move along on foot.', [['a', 'Of persons.']]]]]]],
  ],
  forms: { bill: 0, saunter: 1, walk: 2 },
  stemForms: {},
  phrases: { billoffare: [0, 'n-p-bill-of-fare'] },
};
const gz = new Uint8Array(gzipSync(JSON.stringify(build)));

describe('the definitions worker', () => {
  test('parses the gzipped build and answers lookups, inflections, phrases, and misses', async () => {
    expect((await parseBuild(gz)).pages).toHaveLength(3);
    let loads = 0;
    const worker = createDefinitionsWorker(async () => {
      loads++;
      return gz;
    });
    const walked = await worker.handle({ type: 'lookup', seq: 1, word: 'walked' });
    expect(walked).toMatchObject({
      type: 'result',
      seq: 1,
      result: { headword: 'Walk', via: 'walked' },
    });
    const phrase = await worker.handle({ type: 'lookup', seq: 2, word: 'Bill of fare' });
    expect(phrase.type === 'result' && phrase.result?.phrase?.url).toBe(
      'https://w1913.com/bill#n-p-bill-of-fare',
    );
    expect(await worker.handle({ type: 'lookup', seq: 3, word: 'smartphone' })).toEqual({
      type: 'result',
      seq: 3,
      result: null,
    });
    expect(await worker.handle({ type: 'suggest', seq: 4, prefix: 'sa', limit: 8 })).toEqual({
      type: 'suggestions',
      seq: 4,
      suggestions: [{ headword: 'Saunter', slug: 'saunter' }],
    });
    // Loaded once, kept after.
    expect(loads).toBe(1);
  });

  test('says missing before a download, and tries again on the next question', async () => {
    let stored: Uint8Array | null = null;
    const worker = createDefinitionsWorker(async () => stored);
    expect(await worker.handle({ type: 'lookup', seq: 1, word: 'walk' })).toEqual({
      type: 'missing',
      seq: 1,
    });
    stored = gz;
    expect(await worker.handle({ type: 'lookup', seq: 2, word: 'walk' })).toMatchObject({
      type: 'result',
      result: { headword: 'Walk' },
    });
  });

  test('reports a broken file as failed, never throws', async () => {
    const worker = createDefinitionsWorker(async () => new Uint8Array([1, 2, 3]));
    expect((await worker.handle({ type: 'lookup', seq: 1, word: 'walk' })).type).toBe('failed');
  });
});

describe('the word Look up takes', () => {
  test('lookupWord trims marks and refuses what is no word', () => {
    expect(lookupWord('  “Saunter,” ')).toBe('Saunter');
    expect(lookupWord('bill  of\nfare')).toBe('bill of fare');
    expect(lookupWord("o'clock")).toBe("o'clock");
    expect(lookupWord('INT. HOUSE - DAY')).toBeNull();
    expect(lookupWord('42')).toBeNull();
    expect(lookupWord('')).toBeNull();
    expect(lookupWord('a'.repeat(65))).toBeNull();
  });

  test('wordToLookUp takes the selection when it is a word or phrase, else the word at the point', () => {
    const doc = 'She would saunter to the bill of fare.';
    const at = (anchor: number, head = anchor) =>
      EditorState.create({ doc, selection: EditorSelection.single(anchor, head) });
    expect(wordToLookUp(at(12))).toBe('saunter');
    // Just after a word: that word.
    expect(wordToLookUp(at(17))).toBe('saunter');
    expect(wordToLookUp(at(25, 37))).toBe('bill of fare');
    // A click outside the selection: the word there, not the selection.
    expect(wordToLookUp(at(25, 37), 2)).toBe('She');
    // A selection that is no phrase: the word at the point.
    expect(wordToLookUp(at(0, 38), 12)).toBe('saunter');
  });
});

describe('the store', () => {
  test('keeps only the pinned file', async () => {
    expect(await hasDefinitions()).toBe(false);
    expect(await readDefinitions()).toBeNull();
    await expect(saveDefinitions(gz)).rejects.toThrow('isn’t the expected file');
    expect(await hasDefinitions()).toBe(false);
    expect(await isTheFile(gz)).toBe(false);
  });

  test('names its size as the writer reads it', () => {
    expect(DEFINITIONS_SIZE_LABEL).toBe('8.1 MB');
    expect(DEFINITIONS_SOURCE.file).toBe(`w1913-lookup-${DEFINITIONS_SOURCE.edition}.json.gz`);
  });
});

describe('the build script', () => {
  test('refuses a download that isn’t the pinned file, and a desktop build gets none', async () => {
    const { mkdtemp, readdir } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'drafter-definitions-'));
    const wrong = async () => new Response(gz);
    await expect(cachedDefinitions(join(dir, 'cache'), wrong)).rejects.toThrow(
      "isn't the pinned file",
    );
    expect(
      await syncDefinitions(join(dir, 'public'), join(dir, 'cache'), { desktop: true }),
    ).toBeNull();
    await expect(readdir(join(dir, 'public'))).rejects.toThrow();
  });
});

describe('the spelling menu', () => {
  test('ends with Look up when given the word', () => {
    const view = { state: EditorState.create({ doc: 'x' }) } as never;
    const ran: string[] = [];
    const hooks = {
      replace: () => {},
      addToScript: () => {},
      addToMine: () => {},
      ignore: () => {},
    };
    const without = spellMenuItems(view, [], 'markdown', null, hooks);
    expect(without.flat().some((item) => String(item.label).startsWith('Look up'))).toBe(false);
    const groups = spellMenuItems(view, [], 'markdown', null, {
      ...hooks,
      lookUp: { word: 'musick', run: () => ran.push('musick') },
    });
    const last = groups.at(-1)?.[0];
    expect(last?.label).toBe('Look up “musick”');
    last?.onSelect?.(new Event('select'));
    expect(ran).toEqual(['musick']);
  });
});
