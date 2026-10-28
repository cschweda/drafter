import { describe, expect, test } from 'vitest';
import { downTarget, moveItem, type SceneColor, setColor, setSynopsis } from '../src';
import { apply, indexOf } from './helpers';

/** The script after `edit` on its scene number `n` (1-based). */
function edited(
  source: string,
  n: number,
  edit: (doc: ReturnType<typeof indexOf>['doc'], scene: never) => ReturnType<typeof setColor>,
) {
  const { doc, index } = indexOf(source);
  const scene = index.scenes[n - 1];
  if (!scene) throw new Error(`no scene ${n}`);
  return apply(source, edit(doc, scene as never));
}
const synopsis = (source: string, text: string, n = 1) =>
  edited(source, n, (doc, scene) => setSynopsis(doc, scene, text));
const color = (source: string, value: SceneColor | null, n = 1) =>
  edited(source, n, (doc, scene) => setColor(doc, scene, value));

describe('setSynopsis', () => {
  test('edits the first synopsis in place', () => {
    expect(synopsis('INT. A - DAY\n\n=Old.\n\nAction.\n\n= Later.\n', 'New.')).toBe(
      'INT. A - DAY\n\n= New.\n\nAction.\n\n= Later.\n',
    );
  });

  test('adds a synopsis under the heading', () => {
    expect(synopsis('INT. A - DAY\n\nAction.\n', 'New.')).toBe(
      'INT. A - DAY\n\n= New.\n\nAction.\n',
    );
    expect(synopsis('INT. A - DAY\n', 'New.')).toBe('INT. A - DAY\n\n= New.\n');
    expect(
      synopsis(
        '# Act\n\n## Scene 1\n\nWords.\n\n/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/\n',
        'New.',
      ),
    ).toBe(
      '# Act\n\n## Scene 1\n\n= New.\n\nWords.\n\n/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/\n',
    );
  });

  test("adds a synopsis above the header's notes", () => {
    expect(synopsis('INT. A - DAY\n\n[[Color: blue]]\n\nAction.\n', 'New.')).toBe(
      'INT. A - DAY\n\n= New.\n[[Color: blue]]\n\nAction.\n',
    );
  });

  test('removes a synopsis when it is emptied', () => {
    expect(synopsis('INT. A - DAY\n\n= Old.\n\nAction.\n', '  ')).toBe('INT. A - DAY\n\nAction.\n');
    expect(synopsis('INT. A - DAY\n\n= Old.\n[[Color: blue]]\n\nAction.\n', '')).toBe(
      'INT. A - DAY\n\n[[Color: blue]]\n\nAction.\n',
    );
    expect(synopsis('INT. A - DAY\n\nAction.\n', '')).toBe('INT. A - DAY\n\nAction.\n');
  });

  test("writes the writer's words on one line, opening no note or boneyard", () => {
    expect(synopsis('INT. A - DAY\n\nAction.\n', 'Two\nlines [[and /* this')).toBe(
      'INT. A - DAY\n\n= Two / lines [ [and / * this\n\nAction.\n',
    );
  });
});

describe('setColor', () => {
  test('adds a color after the synopses', () => {
    expect(color('INT. A - DAY\n\n= Syn.\n\nAction.\n', 'blue')).toBe(
      'INT. A - DAY\n\n= Syn.\n[[Color: blue]]\n\nAction.\n',
    );
    expect(color('INT. A - DAY\n\n= Syn.\n[[Goal: Win.]]\n\nAction.\n', 'blue')).toBe(
      'INT. A - DAY\n\n= Syn.\n[[Color: blue]]\n[[Goal: Win.]]\n\nAction.\n',
    );
  });

  test('adds a color under a heading with nothing after it', () => {
    expect(color('INT. A - DAY\n', 'red')).toBe('INT. A - DAY\n\n[[Color: red]]\n');
    expect(color('INT. A - DAY\n\nINT. B - DAY\n', 'red')).toBe(
      'INT. A - DAY\n\n[[Color: red]]\n\nINT. B - DAY\n',
    );
  });

  test('changes a color written by hand in another case', () => {
    expect(color('INT. A - DAY\n\nShe waits. [[COLOR :teal]]\n', 'blue')).toBe(
      'INT. A - DAY\n\nShe waits. [[Color: blue]]\n',
    );
    expect(color('INT. A - DAY\n\n[[Color: blue]]\n', 'blue')).toBe(
      'INT. A - DAY\n\n[[Color: blue]]\n',
    );
  });

  test('removes a color and its line', () => {
    expect(color('INT. A - DAY\n\n= Syn.\n[[Color: blue]]\n\nAction.\n', null)).toBe(
      'INT. A - DAY\n\n= Syn.\n\nAction.\n',
    );
    expect(color('INT. A - DAY\n\n[[Color: blue]]\n\nAction.\n', null)).toBe(
      'INT. A - DAY\n\nAction.\n',
    );
    expect(color('INT. A - DAY\n\n[[Color: blue]]\n[[Goal: Win.]]\n\nAction.\n', null)).toBe(
      'INT. A - DAY\n\n[[Goal: Win.]]\n\nAction.\n',
    );
    expect(color('INT. A - DAY\n\nShe waits. [[Color: blue]]\n', null)).toBe(
      'INT. A - DAY\n\nShe waits.\n',
    );
    expect(color('INT. A - DAY\n\nAction.\n', null)).toBe('INT. A - DAY\n\nAction.\n');
  });

  test("a scene's color survives renaming its heading and moving it", () => {
    let source = 'INT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n';
    source = color(source, 'teal');
    source = source.replace('INT. A - DAY', 'EXT. GARDEN - NIGHT');
    const { doc, index } = indexOf(source);
    const first = index.scenes[0];
    if (!first) throw new Error('no scene');
    const target = downTarget(index, first.block);
    const move = target && moveItem(doc, index, first.block, target);
    if (!move) throw new Error('no move');
    source = apply(source, move.changes);
    const after = indexOf(source).index.scenes;
    expect(after.map((s) => [s.heading, s.color?.value ?? null])).toEqual([
      ['INT. B - DAY', null],
      ['EXT. GARDEN - NIGHT', 'teal'],
    ]);
  });

  test('keeps a CRLF line break style', () => {
    expect(color('INT. A - DAY\r\n\r\nAction.\r\n', 'blue')).toBe(
      'INT. A - DAY\r\n\r\n[[Color: blue]]\r\n\r\nAction.\r\n',
    );
    expect(synopsis('INT. A - DAY\r\n\r\n[[Color: blue]]\r\n\r\nAction.\r\n', 'New.')).toBe(
      'INT. A - DAY\r\n\r\n= New.\r\n[[Color: blue]]\r\n\r\nAction.\r\n',
    );
  });
});
