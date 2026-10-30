import { describe, expect, test } from 'vitest';
import { build, HARBOR, notKnown, noWords, scenesOf } from './scripts';

describe('presence', () => {
  const { cast, doc } = build(HARBOR);
  const presence = (key: string, scene: number) =>
    cast.byScene[cast.characters.findIndex((c) => c.key === key)]?.find(
      (p) => p.scene === scene - 1,
    );

  test('speaking puts a character in the scene', () => {
    expect(scenesOf(cast, 'HOPE')).toEqual([1, 5, 6, 8, 12]);
    expect(presence('HOPE', 6)).toEqual({
      scene: 5,
      speaking: true,
      speeches: 1,
      words: 12,
      firstMention: null,
    });
    // The dual pair: both sides speak.
    expect(presence('TOM', 4)?.speaking).toBe(true);
    expect(presence('MCCLANE', 4)).toMatchObject({ speaking: true, speeches: 1, words: 2 });
  });

  test('a name in the action in capitals puts them in', () => {
    expect(presence('TOM', 2)).toEqual({
      scene: 1,
      speaking: false,
      speeches: 0,
      words: 0,
      firstMention: doc.source.indexOf('TOM on the desk'),
    });
    // A possessive in capitals, and a speaker's own mention is kept as theirs.
    expect(presence('WILL', 10)?.firstMention).toBe(doc.source.indexOf("WILL'S truck"));
    expect(presence('WILL', 1)?.firstMention).toBe(doc.source.indexOf('WILL (40s)'));
    // As the cue spells it, with a possessive.
    expect(scenesOf(cast, 'MCCLANE')).toEqual([4, 8, 10]);
  });

  test('Tom capitalised counts', () => {
    expect(scenesOf(cast, 'TOM')).toEqual([2, 4, 9, 11]);
    expect(presence('TOM', 9)?.firstMention).toBe(doc.source.indexOf('Tom’s jacket'));
    expect(presence('TOM', 4)?.firstMention).toBe(doc.source.indexOf('Tom waits'));
  });

  test('Will counts only in capitals', () => {
    expect(scenesOf(cast, 'WILL')).toEqual([1, 7, 10, 13]);
    // Were it no word, "Will you look at that" would put him in scene 2.
    expect(scenesOf(build(HARBOR, { isWord: noWords }).cast, 'WILL')).toEqual([1, 2, 7, 10, 13]);
  });

  test('Hope in lowercase never counts', () => {
    expect(scenesOf(cast, 'HOPE')).not.toContain(11);
    const loose = build(HARBOR, { isWord: noWords }).cast;
    expect(scenesOf(loose, 'HOPE')).toEqual([1, 2, 5, 6, 8, 12]);
    expect(scenesOf(loose, 'WILL')).not.toContain(11);
  });

  test('THE DRIVER counts only in capitals when both words are words', () => {
    expect(scenesOf(cast, 'THE DRIVER')).toEqual([5, 7]);
    expect(scenesOf(build(HARBOR, { isWord: noWords }).cast, 'THE DRIVER')).toEqual([5, 6, 7]);
  });

  test('ANN LEE is not also ANN', () => {
    expect(scenesOf(cast, 'ANN LEE')).toEqual([3, 14]);
    expect(scenesOf(cast, 'ANN')).toEqual([2, 9, 14]);
    expect(presence('ANN LEE', 3)?.firstMention).toBe(doc.source.indexOf('ANN LEE steps'));
  });

  test('a name in dialogue is not presence', () => {
    expect(scenesOf(cast, 'ANN')).not.toContain(8);
  });

  test('a name in a parenthetical, note, synopsis, or boneyard is not presence', () => {
    expect(scenesOf(cast, 'TOM')).not.toContain(7);
    expect(scenesOf(cast, 'TOM')).not.toContain(8);
    expect(scenesOf(cast, 'WILL')).not.toContain(8);
    expect(scenesOf(cast, 'ANN LEE')).not.toContain(8);
  });

  test('a character with no cue is not in the cast', () => {
    expect(cast.characters.map((c) => c.key)).toEqual([
      'HOPE',
      'WILL',
      'ANN',
      'ANN LEE',
      'MCCLANE',
      'TOM',
      'THE DRIVER',
    ]);
    expect(cast.characters.find((c) => c.key === 'MCCLANE')).toEqual({
      key: 'MCCLANE',
      name: 'McCLANE',
      order: 5,
    });
    expect(cast.characters.find((c) => c.key === 'WILL')?.order).toBe(0);
  });

  test('undefined from isWord reads as a word', () => {
    const strict = build(HARBOR, { isWord: notKnown }).cast;
    expect(scenesOf(strict, 'TOM')).toEqual([2, 4, 11]);
    expect(scenesOf(strict, 'MCCLANE')).toEqual([4, 10]);
    expect(scenesOf(strict, 'ANN LEE')).toEqual([3, 14]);
    expect(scenesOf(strict, 'WILL')).toEqual([1, 7, 10, 13]);
  });
});
