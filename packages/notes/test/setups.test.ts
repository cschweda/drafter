import { parse } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import { markLabels, noteEntries, setupsAndPayoffs } from '../src';

const threads = (source: string) => setupsAndPayoffs(noteEntries(parse(source)));

describe('setupsAndPayoffs', () => {
  test('matches labels without regard to case or spacing', () => {
    const source = [
      'Tom hangs his coat. [[Setup: The  Letter]]',
      '',
      'Margaret reads it. [[payoff:the letter ]]',
      '',
    ].join('\n');
    const [thread, ...rest] = threads(source);
    expect(rest).toEqual([]);
    expect(thread?.label).toBe('The  Letter');
    expect(thread?.setups.map((e) => e.text)).toEqual(['Setup: The  Letter']);
    expect(thread?.payoffs.map((e) => e.text)).toEqual(['payoff:the letter ']);
    expect(thread?.unpaid).toBe(false);
    expect(thread?.early).toEqual([]);
  });

  test('a setup may have several payoffs', () => {
    const source = [
      '[[Setup: the key]]',
      '',
      'A. [[Payoff: the key]]',
      '',
      'B. [[Payoff: THE KEY]]',
      '',
    ].join('\n');
    const [thread] = threads(source);
    expect(thread?.payoffs).toHaveLength(2);
    expect(thread?.unpaid).toBe(false);
  });

  test('a payoff before its setup is early, and the setup unpaid', () => {
    const source = ['A. [[Payoff: the gun]]', '', 'B. [[Setup: the gun]]', ''].join('\n');
    const [thread] = threads(source);
    expect(thread?.unpaid).toBe(true);
    expect(thread?.early.map((e) => e.text)).toEqual(['Payoff: the gun']);
  });

  test('lists unpaid labels first', () => {
    const source = [
      'A. [[Setup: the coat]] [[Setup: the ring]]',
      '',
      'B. [[Payoff: the coat]] [[Setup: the map]]',
      '',
      'C. [[Payoff: a door]]',
      '',
    ].join('\n');
    expect(threads(source).map((t) => [t.label, t.unpaid])).toEqual([
      ['the ring', true],
      ['the map', true],
      ['the coat', false],
      ['a door', false],
    ]);
  });
});

describe('markLabels', () => {
  test('lists each label once, as first typed', () => {
    const source = [
      'A. [[Setup: The Letter]] [[Payoff: the  letter]] [[Setup:]]',
      '',
      'B. [[Payoff: a door]] [[Goal: not a label]]',
      '',
    ].join('\n');
    expect(markLabels(parse(source))).toEqual(['The Letter', 'a door']);
  });
});
