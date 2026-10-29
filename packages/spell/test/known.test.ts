import { readFileSync } from 'node:fs';
import { type Doc, parse, type TextChange } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import {
  addToScriptDictionary,
  harvestedWords,
  isKnown,
  knownSet,
  scriptDictionary,
} from '../src/known';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const apply = (source: string, changes: TextChange[]) => {
  let out = source;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
};

const after = (doc: Doc, changes: TextChange[]) => parse(apply(doc.source, changes));

describe('harvested words', () => {
  test('harvests every word of names and locations', () => {
    const names = harvestedWords(parse(fixture('names.fountain')));
    expect([...names].sort()).toEqual([
      'brassworks',
      'brennigan',
      'mckittrick',
      'odalys',
      'quillon',
    ]);
    const places = harvestedWords(parse(fixture('locations.fountain')));
    expect([...places].sort()).toEqual(
      [
        'attic',
        'bellwether',
        'diner',
        'halversham',
        'house',
        'keokuk',
        'of',
        'ormsby',
        'riverbank',
        'station',
        'the',
        'truck',
        "zephyrine's",
        'zephyrine',
      ].sort(),
    );
  });

  test('a harvested word is known in any case and as a possessive', () => {
    const known = knownSet(harvestedWords(parse(fixture('names.fountain'))), ['Keokuk']);
    for (const word of ['Odalys', 'ODALYS', 'odalys', "Brennigan's", 'Brennigan’s', 'KEOKUK']) {
      expect(isKnown(word, known)).toBe(true);
    }
    expect(isKnown('Odalysez', known)).toBe(false);
    expect(isKnown('recieve', known)).toBe(false);
  });

  test('a harvested name is known as a plural too, and its plural possessive', () => {
    const doc = parse('INT. DOCK - DAY\n\nHALVORSEN\nAhoy.\n\nVELLOX\nAhoy.\n');
    const known = knownSet(harvestedWords(doc));
    for (const word of ['Halvorsens', 'HALVORSENS', "Halvorsens'", 'Halvorsens’', 'Velloxes']) {
      expect(isKnown(word, known)).toBe(true);
    }
    // The harvest itself keeps only the name and its possessive: a name ending in s isn't cut.
    expect([...knownSet(harvestedWords(parse('INT. DOCK - DAY\n\nODALYS\nAhoy.\n')))]).toEqual([
      'dock',
      'odalys',
    ]);
    expect(isKnown('Halvorsenz', known)).toBe(false);
    // `es` is a plural only after s, x, z, ch, or sh.
    expect(isKnown('Halvorsenes', known)).toBe(false);
    const box = knownSet(harvestedWords(parse('INT. DOCK - DAY\n\nBOX\nAhoy.\n\nBIRCH\nAhoy.\n')));
    for (const word of ['Boxes', "Boxes'", 'Birches']) expect(isKnown(word, box)).toBe(true);
    expect(isKnown('Kitchenes', knownSet(['kitchen']))).toBe(false);
  });
});

describe("the script's dictionary", () => {
  test("adds a word to the script's dictionary, sorted and once", () => {
    let doc = parse('INT. HALL - DAY\n\nKeokuk waits.\n');
    expect(scriptDictionary(doc)).toEqual([]);
    const first = addToScriptDictionary(doc, 'Keokuk');
    expect(first).toHaveLength(1);
    doc = after(doc, first);
    expect(doc.source).toBe(
      'INT. HALL - DAY\n\nKeokuk waits.\n\n/* drafter\n{"v":1,"dictionary":["Keokuk"]}\n*/\n',
    );
    doc = after(doc, addToScriptDictionary(doc, 'brennigan'));
    doc = after(doc, addToScriptDictionary(doc, 'Avalos'));
    expect(scriptDictionary(doc)).toEqual(['Avalos', 'brennigan', 'Keokuk']);
    // Already there, in any case: nothing to do.
    expect(addToScriptDictionary(doc, 'Keokuk')).toEqual([]);
    expect(addToScriptDictionary(doc, 'KEOKUK')).toEqual([]);
  });

  test("keeps the block's other entries", () => {
    const doc = parse(
      'Hello.\r\n\r\n/* drafter\r\n{"v":1,"template":"us-screenplay","categories":{"todo":"teal"},"dictionary":["Zed"]}\r\n*/\r\n',
    );
    const next = after(doc, addToScriptDictionary(doc, 'Avalos'));
    expect(next.meta).toEqual({
      v: 1,
      template: 'us-screenplay',
      categories: { todo: 'teal' },
      dictionary: ['Avalos', 'Zed'],
    });
    expect(next.source).toContain('\r\n{"v":1,');
  });

  test('refuses with a stray /*', () => {
    expect(addToScriptDictionary(parse('Hello.\n\n/* never closed\n'), 'Keokuk')).toEqual([]);
    expect(addToScriptDictionary(parse('Hello. /* one /* two */\n'), 'Keokuk')).toEqual([]);
  });

  test('reads a damaged dictionary entry as empty', () => {
    const asString = parse('Hi.\n\n/* drafter\n{"v":1,"dictionary":"Keokuk"}\n*/\n');
    expect(scriptDictionary(asString)).toEqual([]);
    const mixed = parse('Hi.\n\n/* drafter\n{"v":1,"dictionary":[1,"Keokuk",null]}\n*/\n');
    expect(scriptDictionary(mixed)).toEqual(['Keokuk']);
    expect(after(asString, addToScriptDictionary(asString, 'Avalos')).meta?.dictionary).toEqual([
      'Avalos',
    ]);
    expect(after(mixed, addToScriptDictionary(mixed, 'Avalos')).meta?.dictionary).toEqual([
      'Avalos',
      'Keokuk',
    ]);
  });
});
