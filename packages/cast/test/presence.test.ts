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

  test('a voice-over or off-screen cue inside a scene is present and speaking', () => {
    const attic = build(
      'INT. ATTIC - NIGHT\n\nDust on every box.\n\nMARA (V.O.)\nI kept all of it.\n\nODELL (O.S.)\nMara?\n\nEXT. LANE - NIGHT\n\nODELL\nGone.\n',
    ).cast;
    expect(attic.characters.map((c) => c.key)).toEqual(['ODELL', 'MARA']);
    expect(attic.inScene[0]?.map(({ row, presence }) => [row, presence])).toEqual([
      [0, { scene: 0, speaking: true, speeches: 1, words: 1, firstMention: null }],
      [1, { scene: 0, speaking: true, speeches: 1, words: 5, firstMention: null }],
    ]);
    expect(scenesOf(attic, 'ODELL')).toEqual([1, 2]);
  });

  test('inScene lists who is in each scene, in the rows order', () => {
    expect(cast.inScene).toHaveLength(14);
    const keys = (scene: number) =>
      cast.inScene[scene - 1]?.map(({ row }) => cast.characters[row]?.key);
    expect(keys(1)).toEqual(['HOPE', 'WILL']);
    expect(keys(2)).toEqual(['ANN', 'TOM']);
    // The same cells as byScene: one object per character and scene.
    for (const here of cast.inScene) {
      for (const { row, presence } of here) {
        expect(cast.byScene[row]).toContain(presence);
      }
    }
  });

  test('the shared lists are frozen', () => {
    const r = cast.characters.findIndex((c) => c.key === 'TOM');
    // A character's scenes in figures are the very array in byScene.
    expect(cast.figures.get('TOM')?.scenes).toBe(cast.byScene[r]);
    expect(Object.isFrozen(cast.byScene)).toBe(true);
    expect(Object.isFrozen(cast.byScene[r])).toBe(true);
    expect(Object.isFrozen(cast.byScene[r]?.[0])).toBe(true);
    expect(Object.isFrozen(cast.inScene)).toBe(true);
    expect(Object.isFrozen(cast.inScene[1])).toBe(true);
  });

  test('undefined from isWord reads as a word', () => {
    const strict = build(HARBOR, { isWord: notKnown }).cast;
    expect(scenesOf(strict, 'TOM')).toEqual([2, 4, 11]);
    expect(scenesOf(strict, 'MCCLANE')).toEqual([4, 10]);
    expect(scenesOf(strict, 'ANN LEE')).toEqual([3, 14]);
    expect(scenesOf(strict, 'WILL')).toEqual([1, 7, 10, 13]);
  });
});
