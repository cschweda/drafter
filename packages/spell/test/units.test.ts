import { readFileSync } from 'node:fs';
import { type Doc, parse } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import { tokenize } from '../src/tokens';
import { fountainUnits } from '../src/units';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/** The words checked in `doc`, in order, after checking each maps back to its source exactly. */
function checked(doc: Doc, notes = false): string[] {
  const out: string[] = [];
  for (const unit of fountainUnits(doc, { notes })) {
    expect(unit.from + unit.text.length).toBeLessThanOrEqual(doc.source.length);
    for (let i = 0; i < unit.text.length; i++) {
      if (unit.text[i] !== ' ') expect(unit.text[i]).toBe(doc.source[unit.from + i]);
    }
    for (const token of tokenize(unit.text, unit.from)) {
      expect(doc.source.slice(token.from, token.to).replaceAll('*', '').replaceAll('’', "'")).toBe(
        token.word,
      );
      out.push(token.word);
    }
  }
  return out;
}

/** Every source offset a unit checks (holds a character other than a space). */
function coveredOffsets(doc: Doc, notes: boolean): Set<number> {
  const out = new Set<number>();
  for (const unit of fountainUnits(doc, { notes })) {
    for (let i = 0; i < unit.text.length; i++) if (unit.text[i] !== ' ') out.add(unit.from + i);
  }
  return out;
}

describe('fountainUnits', () => {
  test('names are never units', () => {
    const doc = parse(fixture('names.fountain'));
    const covered = coveredOffsets(doc, true);
    const cues = doc.blocks.filter((b) => b.kind === 'character');
    expect(cues).toHaveLength(6);
    for (const cue of cues) {
      for (let at = cue.span.from; at < cue.span.to; at++) expect(covered.has(at)).toBe(false);
    }
    expect(checked(doc)).toEqual([
      'ODALYS',
      'sets',
      'down',
      'the',
      'kettel',
      "Brennigan's",
      'coat',
      'hangs',
      'by',
      'the',
      'door',
      'Where',
      'is',
      'Brennigan',
      'distant',
      'Upstairs',
      'with',
      'Quillon',
      'Leave',
      'me',
      'out',
      'of',
      'it',
      'Nobody',
      'asked',
      'you',
      'Fine',
      'Fine',
    ]);
  });

  test('a scene heading gives only its time', () => {
    const doc = parse(fixture('locations.fountain'));
    expect(checked(doc)).toEqual([
      'MOMENTS',
      'LATER',
      'Steam',
      'fogs',
      'the',
      'windoe',
      'of',
      'the',
      'Halversham',
      'NIGHT',
      'CONTINUOUS',
      'DAWN',
    ]);
    // With CRLF line breaks, the same words at the same places.
    const crlf = parse(fixture('locations.fountain').replaceAll('\n', '\r\n'));
    expect(checked(crlf)).toEqual(checked(doc));
    for (const unit of fountainUnits(crlf, { notes: false })) expect(unit.text).not.toContain('\r');
  });

  test('transitions, page breaks, the title page, scene numbers, and the metadata block are never units', () => {
    const doc = parse(fixture('skips.fountain'));
    expect(checked(doc, true)).toEqual([
      'DUSK',
      'mailbox',
      'crooked',
      'ORMSBY',
      'on',
      'its',
      'side',
      'stikker',
      'on',
      'the',
      'flag',
    ]);
    const covered = coveredOffsets(doc, true);
    const heading = doc.blocks[0];
    expect(heading?.kind).toBe('scene_heading');
    const number = doc.source.indexOf('#1#');
    for (let at = number; at < number + 3; at++) expect(covered.has(at)).toBe(false);
  });

  test('forcing marks are blanked', () => {
    const doc = parse(
      '!LOUD NOISE!\n!still\n\n~la la\n~lo lo\n\n> MID <\n\n= A synopsis\n\n## An act\n',
    );
    expect(fountainUnits(doc, { notes: false }).map((u) => u.text)).toEqual([
      ' LOUD NOISE!\n!still',
      ' la la\n lo lo',
      '  MID  ',
      '  A synopsis',
      '   An act',
    ]);
  });

  test('notes and boneyard are blanked by default', () => {
    const doc = parse(fixture('notes.fountain'));
    expect(checked(doc)).toEqual(['Odalys', 'waters', 'the', 'ferns', 'and', 'hums']);
    const units = fountainUnits(doc, { notes: false });
    const action = units.find((u) => u.text.includes('Odalys'));
    const spaces = (text: string) => ' '.repeat(text.length);
    expect(action?.text).toBe(
      `Odalys waters the ferns ${spaces('[[maybe orchids instead]]')} and hums. ${spaces('/* she used to sing here */')}`,
    );
  });

  test("with notes on, a keyed note's head is blanked", () => {
    const doc = parse(fixture('notes.fountain'));
    expect(checked(doc, true)).toEqual([
      'Odalys',
      'waters',
      'the',
      'ferns',
      'and',
      'hums',
      'maybe',
      'orchids',
      'instead',
      'she',
      'used',
      'to',
      'sing',
      'here',
      'recieve',
      'the',
      'shipment',
      'first',
      'cut',
      'scene',
      'about',
      'the',
      'orchard',
    ]);
    const units = fountainUnits(doc, { notes: true });
    expect(units.some((u) => u.text.includes('blue'))).toBe(false);
    expect(units.find((u) => u.text.includes('recieve'))?.text).toBe(
      '        recieve the shipment first  ',
    );
  });

  test('works for a stage play', () => {
    const doc = parse(fixture('stage.fountain'));
    expect(checked(doc)).toEqual([
      'Scene',
      'One',
      'Morning',
      'WREN',
      'stands',
      'at',
      'the',
      'stvoe',
      'The',
      "kettle's",
      'been',
      'singing',
      'for',
      'an',
      'hour',
      'from',
      'offstage',
      'Let',
      'it',
      'sing',
      'CURTAIN',
    ]);
  });

  test('equal blocks share a key', () => {
    const doc = parse('ANA\nFine.\n\nBO\nFine.\n\nFine.\n');
    const units = fountainUnits(doc, { notes: false });
    expect(units).toHaveLength(3);
    const [first, second, action] = units;
    expect(first?.key).toBe(second?.key);
    expect(first?.from).not.toBe(second?.from);
    expect(action?.key).not.toBe(first?.key);
  });

  test('emphasis, escapes, inline notes, dual dialogue, and astral characters keep their offsets', () => {
    const source =
      'ANA\r\nI *did* it 😀 [[a nöte]] \\*really\\* /* gone */ yes.\r\n\r\nBO ^\r\n𐐀 recieve _now_.\r\n';
    const doc = parse(source);
    expect(checked(doc)).toEqual(['did', 'it', 'really', 'yes', 'recieve', 'now']);
    expect(checked(parse('Un*believ*able.\n'))).toEqual(['Unbelievable']);
    expect(checked(doc, true)).toEqual([
      'did',
      'it',
      'really',
      'yes',
      'a',
      'nöte',
      'gone',
      'recieve',
      'now',
    ]);
  });
});
