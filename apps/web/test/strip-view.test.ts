import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { linesPerPage, type SceneIndex, sceneIndex, structureStrip } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { blockIndexAt } from '../app/editor/pages';
import { currentBlocks, nextView, type StripView } from '../app/strip/use-strip';

const screenplay = builtins['us-screenplay'] as Template;

const SCRIPT = [
  'Title: The Strip',
  '',
  'INT. HALL - DAY',
  '',
  'Ann waits.',
  '',
  '# Act One',
  '',
  '## The call',
  '',
  'EXT. YARD - NIGHT',
  '',
  'BEN',
  'Hi.',
  '',
  '',
  '',
  'INT. CAR - MOVING',
  '',
  'Driving.',
  '',
].join('\n');

function indexOf(source: string, pages: boolean): SceneIndex {
  const doc = parse(source);
  return sceneIndex(doc, screenplay, pages ? paginate(doc, screenplay) : null);
}

/** The view of `source`, by pages when `pages`, each block's id its block number. */
function viewOf(source: string, pages: boolean): StripView {
  const doc = parse(source);
  const layout = pages ? paginate(doc, screenplay) : null;
  const index = sceneIndex(doc, screenplay, layout);
  return {
    strip: structureStrip(index, linesPerPage(layout)),
    ids: new Map(index.items.map((item) => [item.block, `id-${item.block}`])),
  };
}

const blockOf = (index: SceneIndex, heading: string) =>
  (index.scenes.find((scene) => scene.heading === heading) ?? { block: NaN }).block;
const sectionOf = (index: SceneIndex, title: string) =>
  (index.sections.find((section) => section.title === title) ?? { block: NaN }).block;

describe('the strip view', () => {
  test('nextView keeps the last paged strip while the new one has no pages', () => {
    const paged = viewOf(SCRIPT, true);
    const typing = viewOf(`${SCRIPT}\nINT. SHED - DAY\n`, false);
    expect(paged.strip.unit).toBe('pages');
    expect(typing.strip.unit).toBe('words');
    expect(nextView(paged, typing, false)).toBe(paged);
    // And the new paged strip, once the layout catches up, replaces it.
    const caught = viewOf(`${SCRIPT}\nINT. SHED - DAY\n`, true);
    expect(nextView(paged, caught, false)).toBe(caught);
  });

  test('takes a words strip when the layout has failed', () => {
    const paged = viewOf(SCRIPT, true);
    const words = viewOf(SCRIPT, false);
    expect(nextView(paged, words, true)).toBe(words);
    // A words strip after a words strip is the new one, failed or not.
    const more = viewOf(`${SCRIPT}\nINT. SHED - DAY\n`, false);
    expect(nextView(words, more, false)).toBe(more);
  });

  test('takes the new strip when there was none', () => {
    const words = viewOf(SCRIPT, false);
    const paged = viewOf(SCRIPT, true);
    expect(nextView(null, words, false)).toBe(words);
    expect(nextView(null, paged, false)).toBe(paged);
  });

  test("currentBlocks gives the cursor's scene and its sections", () => {
    const index = indexOf(SCRIPT, false);
    const yard = blockOf(index, 'EXT. YARD - NIGHT');
    const actOne = sectionOf(index, 'Act One');
    const call = sectionOf(index, 'The call');
    // On the scene's heading, and on a block inside it.
    expect(currentBlocks(index, yard)).toEqual([yard, actOne, call]);
    expect(currentBlocks(index, yard + 1)).toEqual([yard, actOne, call]);
    // A scene before any section is the scene alone.
    const hall = blockOf(index, 'INT. HALL - DAY');
    expect(currentBlocks(index, hall + 1)).toEqual([hall]);
  });

  test('none before the first scene', () => {
    const index = indexOf(SCRIPT, false);
    expect(currentBlocks(index, -1)).toEqual([]);
    const untitled = indexOf('Ann waits.\n\nINT. HALL - DAY\n\nHi.\n', false);
    expect(currentBlocks(untitled, 0)).toEqual([]);
    expect(currentBlocks(indexOf('', false), 0)).toEqual([]);
  });

  test('a blank line after a scene is still that scene', () => {
    const doc = parse(SCRIPT);
    const index = sceneIndex(doc, screenplay, null);
    // The second of the three blank lines after BEN's "Hi.".
    const blank = SCRIPT.indexOf('Hi.\n\n\n') + 'Hi.\n\n'.length;
    const yard = blockOf(index, 'EXT. YARD - NIGHT');
    expect(currentBlocks(index, blockIndexAt(doc, blank))).toEqual([
      yard,
      sectionOf(index, 'Act One'),
      sectionOf(index, 'The call'),
    ]);
  });
});
