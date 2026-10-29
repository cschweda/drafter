import { describe, expect, test } from 'vitest';
import {
  categoriesOf,
  FIELD_ORDER,
  fieldNote,
  normalizeLabel,
  readKeyedNote,
  readNote,
  STARTING_CATEGORIES,
  safeBody,
  safeLine,
  writeNote,
} from '../src';

const head = (inner: string) => readNote(inner).head;

describe('readNote', () => {
  test('reads each field key in any case and spacing', () => {
    expect(head('Color: blue')).toEqual({ kind: 'field', key: 'color' });
    expect(head('  COLOR :blue  ')).toEqual({ kind: 'field', key: 'color' });
    expect(head('storyline: A, B')).toEqual({ kind: 'field', key: 'storyline' });
    expect(head('GoAl:Win.')).toEqual({ kind: 'field', key: 'goal' });
    expect(head('Conflict: He jokes.')).toEqual({ kind: 'field', key: 'conflict' });
    expect(head('outcome: He leaves.')).toEqual({ kind: 'field', key: 'outcome' });
    expect(head('SHIFT: hope → dread')).toEqual({ kind: 'field', key: 'shift' });
    // A field key needs nothing after its colon.
    expect(readNote('Color:blue')).toEqual({
      head: { kind: 'field', key: 'color' },
      body: 'blue',
      tags: [],
      resolved: false,
    });
    expect(FIELD_ORDER).toEqual(['color', 'storyline', 'goal', 'conflict', 'outcome', 'shift']);
  });

  test('reads Setup and Payoff as marks', () => {
    expect(readNote('Setup: the gun in the drawer')).toEqual({
      head: { kind: 'mark', key: 'setup' },
      body: 'the gun in the drawer',
      tags: [],
      resolved: false,
    });
    expect(head('PAYOFF:the gun')).toEqual({ kind: 'mark', key: 'payoff' });
  });

  test('reads Card', () => {
    expect(head('Card: 1, 2')).toEqual({ kind: 'card' });
    expect(head('card:x')).toEqual({ kind: 'card' });
  });

  test('reads an all-capitals head as a category', () => {
    expect(readNote('TODO: check the dates')).toEqual({
      head: { kind: 'category', name: 'todo' },
      body: 'check the dates',
      tags: [],
      resolved: false,
    });
    expect(head('CUT?: maybe')).toEqual({ kind: 'category', name: 'cut?' });
    expect(head('FIX:')).toEqual({ kind: 'category', name: 'fix' });
    expect(head('TO   DO: x')).toEqual({ kind: 'category', name: 'to do' });
    expect(STARTING_CATEGORIES).toEqual([
      'story',
      'character',
      'dialogue',
      'pacing',
      'format',
      'continuity',
      'question',
      'todo',
    ]);
  });

  test('reads a name with a lowercase letter as a person', () => {
    expect(readNote("Sam: I don't believe she'd stay. #character")).toEqual({
      head: { kind: 'person', name: 'Sam', on: null, re: null },
      body: "I don't believe she'd stay. #character",
      tags: ['character'],
      resolved: false,
    });
    expect(head('Ann  Lee: Lovely.')).toEqual({
      kind: 'person',
      name: 'Ann Lee',
      on: null,
      re: null,
    });
    expect(head("Mary-Jo O'Neil Jr.: Hm")).toEqual({
      kind: 'person',
      name: "Mary-Jo O'Neil Jr.",
      on: null,
      re: null,
    });
  });

  test('reads Name on “quote” and Name re Name', () => {
    expect(readNote('Sam on “the dates”: Wrong year.')).toEqual({
      head: { kind: 'person', name: 'Sam', on: 'the dates', re: null },
      body: 'Wrong year.',
      tags: [],
      resolved: false,
    });
    // Straight quotes, and a colon inside the quote.
    expect(readNote('Ann Lee on "at 10:30": Too early.')).toEqual({
      head: { kind: 'person', name: 'Ann Lee', on: 'at 10:30', re: null },
      body: 'Too early.',
      tags: [],
      resolved: false,
    });
    expect(readNote('Sam re Ann: Agreed. #resolved')).toEqual({
      head: { kind: 'person', name: 'Sam', on: null, re: 'Ann' },
      body: 'Agreed. #resolved',
      tags: [],
      resolved: true,
    });
    expect(head('Ann Lee re Sam Wu: No.')).toEqual({
      kind: 'person',
      name: 'Ann Lee',
      on: null,
      re: 'Sam Wu',
    });
  });

  test('reads no head from a URL or a time', () => {
    expect(readNote('http://example.com/a')).toEqual({
      head: null,
      body: 'http://example.com/a',
      tags: [],
      resolved: false,
    });
    expect(head('Call at 10:30')).toBeNull();
    expect(head('10:30 call')).toBeNull();
    expect(head('Sam:x')).toBeNull();
    expect(head('TODO:x')).toBeNull();
    expect(head('no head here')).toBeNull();
    expect(head(': no key')).toBeNull();
    expect(head('Sam (2): hi')).toBeNull();
    expect(head('Sam\nLee: hi')).toBeNull();
    expect(readNote('  just a thought  ').body).toBe('just a thought');
  });

  test('reads no head longer than 40 characters', () => {
    const forty = `A${'b'.repeat(39)}`;
    expect(head(`${forty}: hi`)).toEqual({ kind: 'person', name: forty, on: null, re: null });
    expect(head(`${forty}b: hi`)).toBeNull();
    expect(head(`${'X'.repeat(41)}: hi`)).toBeNull();
  });

  test('a field key wins over a person of the same name', () => {
    expect(head('Goal: x')).toEqual({ kind: 'field', key: 'goal' });
    expect(head('GOAL: x')).toEqual({ kind: 'field', key: 'goal' });
    expect(head('Setup: x')).toEqual({ kind: 'mark', key: 'setup' });
    expect(head('CARD: x')).toEqual({ kind: 'card' });
  });

  test('reads tags once each, lowercased, and #resolved as the status', () => {
    const note = readNote(
      'TODO: #Story check #continuity and #story-beat (#pacing) #STORY #Resolved',
    );
    expect(note.tags).toEqual(['story', 'continuity', 'story-beat', 'pacing']);
    expect(note.resolved).toBe(true);
    expect(categoriesOf(note)).toEqual(['todo', 'story', 'continuity', 'story-beat', 'pacing']);
    expect(categoriesOf(readNote('TODO: x #todo #pacing'))).toEqual(['todo', 'pacing']);
    expect(categoriesOf(readNote('Sam: x #pacing'))).toEqual(['pacing']);
    expect(readNote('a#b #ok').tags).toEqual(['ok']);
    expect(readNote('no status').resolved).toBe(false);
    expect(readNote('#resolvedly not').resolved).toBe(false);
  });

  test('does not read #3 as a tag', () => {
    expect(readNote('Take #3 and #-x and # y').tags).toEqual([]);
  });
});

describe('writeNote', () => {
  test('writes title case with one space', () => {
    expect(writeNote('goal', 'Win.')).toBe('[[Goal: Win.]]');
    expect(writeNote('  STORYLINE ', '  A ')).toBe('[[Storyline: A]]');
    expect(writeNote('card', '1')).toBe('[[Card: 1]]');
    expect(writeNote('TODO', 'check')).toBe('[[TODO: check]]');
    expect(writeNote('Ann   Lee', 'Lovely.')).toBe('[[Ann Lee: Lovely.]]');
    expect(writeNote(null, 'A thought.')).toBe('[[A thought.]]');
    expect(writeNote('Sam', '')).toBe('[[Sam:]]');
    expect(fieldNote('shift', 'hope → dread')).toBe('[[Shift: hope → dread]]');
    expect(fieldNote('payoff', 'the gun')).toBe('[[Payoff: the gun]]');
  });

  test('writes ]] as ] ], a line break as / , and spaces /* and */', () => {
    expect(writeNote('Sam', 'a]]b\nc /* d */ e [[f')).toBe('[[Sam: a] ]b / c / * d * / e [ [f]]');
    expect(writeNote('Sam', 'a]]]b')).toBe('[[Sam: a] ] ]b]]');
    // A body ending in `]` would close the note one early.
    expect(writeNote('Sam', 'see [x]')).toBe('[[Sam: see [x] ]]');
    expect(safeBody('one\r\n\r\ntwo')).toBe('one / two');
    expect(safeLine('[[[ /*/ */*')).toBe('[ [ [ / * / * / *');
  });
});

describe('normalizeLabel', () => {
  test('folds case and collapses spaces', () => {
    expect(normalizeLabel('  The   Gun\tIn the DRAWER ')).toBe('the gun in the drawer');
  });
});

describe('readKeyedNote', () => {
  test.each([
    ['Color: blue', { key: 'color', body: 'blue' }],
    ['  COLOR :blue  ', { key: 'color', body: 'blue' }],
    ['Goal: Margaret wants: everything', { key: 'goal', body: 'Margaret wants: everything' }],
    ['no head here', null],
    [': no key', null],
  ])('%j', (text, expected) => {
    expect(readKeyedNote(text)).toEqual(expected);
  });
});
