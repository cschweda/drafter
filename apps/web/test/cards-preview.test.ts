import { parse } from '@drafter/fountain';
import { sceneIndex } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { cardPreview } from '../app/cards/labels';

// A card with no synopsis shows a line of its scene (fresh-look design §5), so no card is empty.
const screenplay = builtins['us-screenplay'] as Template;
const play = builtins['stage-play-standard'] as Template;

function previews(text: string, template = screenplay) {
  const doc = parse(text);
  return sceneIndex(doc, template, null).scenes.map((scene) => cardPreview(doc, scene));
}

describe('a card’s preview', () => {
  test('is the first action line, without its marks and notes', () => {
    expect(
      previews(
        'INT. HALL - DAY\n\n[[Color: teal]]\n\nAnn *waits* by the door. [[a note]]\nShe sighs.\n\nANN\nHello.\n',
      ),
    ).toEqual(['Ann waits by the door.']);
  });

  test('is the first speech when the scene has no action', () => {
    expect(previews('EXT. YARD - NIGHT\n\nBOB (V.O.)\n(quietly)\nHi there.\n')).toEqual([
      'BOB: Hi there.',
    ]);
  });

  test('is none for a scene with nothing in it, and stays inside its own scene', () => {
    expect(previews('INT. A - DAY\n\nINT. B - DAY\n\nSomething happens.\n')).toEqual([
      null,
      'Something happens.',
    ]);
  });

  test('skips a blank action line and boneyard', () => {
    expect(previews('INT. A - DAY\n\n/* cut */\n\nThe real line.\n')).toEqual(['The real line.']);
  });

  test('reads a stage play’s scenes too', () => {
    expect(previews('## Scene 1\n\nThe lights come up.\n', play)).toEqual(['The lights come up.']);
  });
});
