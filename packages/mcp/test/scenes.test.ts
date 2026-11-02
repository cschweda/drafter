import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { load } from '../src/load';
import { Refusal } from '../src/paths';
import { findScene } from '../src/scenes';
import { contextFor } from './context';
import { EPISODE_101, makeLibrary } from './library';
import { put, tempFolder } from './temp';

/** Loads `text` as a file of its own. */
async function loaded(text: string, name = 'x.fountain') {
  const dir = tempFolder();
  put(join(dir, 'Lib', name), text);
  return load(`Lib/${name}`, await contextFor([join(dir, 'Lib')]));
}

const scenes = (headings: string[]) =>
  headings.map((h) => `${h}\n\nSomething happens.\n`).join('\n');

describe('findScene', () => {
  it('order first, then written number, then heading words', async () => {
    // Five scenes, one locked #7#: "7" is past the order, so the written number wins.
    const five = await loaded(
      scenes([
        'INT. KITCHEN - NIGHT',
        'EXT. FARM - DAWN',
        'INT. RADIO ROOM - DAY #7#',
        'EXT. HILL - NIGHT',
        'INT. VAN - NIGHT',
      ]),
    );
    expect(findScene(five, '7')).toEqual({ scene: 3 });
    expect(findScene(five, '2')).toEqual({ scene: 2 });
    expect(findScene(five, ' 5 ')).toEqual({ scene: 5 });
    expect(findScene(five, 'radio room')).toEqual({ scene: 3 });
    expect(findScene(five, 'Radio')).toEqual({ scene: 3 });

    // Twelve scenes, the third locked #12#: "12" is the twelfth in order.
    const headings = Array.from({ length: 12 }, (_, i) => `INT. ROOM ${i + 1} - DAY`);
    headings[2] = 'INT. ROOM 3 - DAY #12#';
    headings[5] = 'INT. ROOM 6 - DAY #6A#';
    const twelve = await loaded(scenes(headings));
    expect(findScene(twelve, '12')).toEqual({ scene: 12 });
    expect(findScene(twelve, '6a')).toEqual({ scene: 6 });
    expect(findScene(twelve, '#6A#')).toEqual({ scene: 6 });
    // "0" is no place in order, and no written number.
    expect(() => findScene(twelve, '0')).toThrow(Refusal);
  });

  it('heading words are whole words', async () => {
    const script = await loaded(scenes(['INT. KITCHEN - NIGHT', 'INT. KITCHENETTE - DAY']));
    expect(findScene(script, 'kitchen')).toEqual({ scene: 1 });
    expect(findScene(script, 'kitchenette day')).toEqual({ scene: 2 });
  });

  it('words matching several scenes come back as matches, at most 20', async () => {
    const { scripts } = makeLibrary(tempFolder());
    const ctx = await contextFor([scripts]);
    const episode = await load(`Scripts/Signal Hill/${EPISODE_101}`, ctx);
    expect(findScene(episode, 'signal hill')).toEqual({
      matches: [
        { scene: 5, heading: 'EXT. SIGNAL HILL - DAY' },
        { scene: 11, heading: 'EXT. SIGNAL HILL - NIGHT' },
        { scene: 13, heading: 'EXT. SIGNAL HILL - DAY' },
      ],
    });
    const many = await loaded(
      scenes(Array.from({ length: 30 }, (_, i) => `INT. THE ROOM ${i + 1} - DAY`)),
    );
    const found = findScene(many, 'the');
    expect('matches' in found && found.matches).toHaveLength(20);
    expect('matches' in found && found.matches[0]).toEqual({
      scene: 1,
      heading: 'INT. THE ROOM 1 - DAY',
    });
  });

  it('no scene by that name refuses with the count', async () => {
    const five = await loaded(scenes(['INT. A - DAY', 'INT. B - DAY', 'INT. C - DAY']));
    expect(() => findScene(five, 'lighthouse')).toThrow(
      new Refusal('There’s no scene lighthouse. This script has 3 scenes.'),
    );
    expect(() => findScene(five, '4')).toThrow(/This script has 3 scenes/);
    const none = await loaded('Just some action, and no scene at all.\n');
    expect(() => findScene(none, '1')).toThrow(/This script has 0 scenes/);
    const one = await loaded(scenes(['INT. A - DAY']));
    expect(() => findScene(one, '2')).toThrow(/This script has 1 scene\./);
  });

  it('a document’s sections are its scenes', async () => {
    const doc = await loaded('# Bible\n\n## June\n\nSeventy-one.\n\n## Eli\n\nSixteen.\n', 'b.md');
    expect(findScene(doc, '2')).toEqual({ scene: 2 });
    expect(findScene(doc, 'eli')).toEqual({ scene: 3 });
    expect(() => findScene(doc, 'wes')).toThrow(/This document has 3 sections/);
  });
});
