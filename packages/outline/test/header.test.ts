import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { renderText } from '@drafter/render-text';
import { describe, expect, test } from 'vitest';
import {
  downTarget,
  moveItem,
  type SceneColor,
  type SceneDetails,
  setColor,
  setSceneDetails,
  setSynopsis,
} from '../src';
import { apply, indexOf, screenplay } from './helpers';

const printed = (source: string) => renderText(paginate(parse(source), screenplay), screenplay);

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

/** The changes, checked to be sorted and apart, as one editor transaction takes them. */
function apart<T extends { from: number; to: number }>(changes: T[]): T[] {
  for (let i = 1; i < changes.length; i++) {
    expect((changes[i] as T).from).toBeGreaterThan((changes[i - 1] as T).to);
  }
  return changes;
}
const details = (source: string, value: SceneDetails, n = 1) =>
  edited(source, n, (doc, scene) => apart(setSceneDetails(doc, scene, value)));

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
    // A note beside other text goes alone, and the spaces around it stay: the line prints as it did.
    expect(color('INT. A - DAY\n\nShe waits [[Color: blue]] by.\n', null)).toBe(
      'INT. A - DAY\n\nShe waits  by.\n',
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

describe('setSceneDetails', () => {
  test('writes all four goal fields in the header order', () => {
    expect(
      details('INT. A - DAY\n\nAction.\n', {
        shift: 'hope → dread',
        outcome: 'He leaves.',
        conflict: 'Tom jokes.',
        goal: 'Make Tom admit it.',
      }),
    ).toBe(
      'INT. A - DAY\n\n[[Goal: Make Tom admit it.]]\n[[Conflict: Tom jokes.]]\n[[Outcome: He leaves.]]\n[[Shift: hope → dread]]\n\nAction.\n',
    );
    // The design's whole header (§5.4), given in any order.
    expect(
      details('INT. KITCHEN - NIGHT\n\nMARGARET sits at the table, not eating.\n', {
        shift: 'hope → dread',
        storyline: 'A',
        outcome: "He won't. He leaves.",
        color: 'blue',
        conflict: 'Tom keeps making jokes.',
        synopsis: "Margaret waits for a call that won't come.",
        goal: 'Margaret wants Tom to admit he lied.',
      }),
    ).toBe(
      "INT. KITCHEN - NIGHT\n\n= Margaret waits for a call that won't come.\n[[Color: blue]]\n[[Storyline: A]]\n[[Goal: Margaret wants Tom to admit he lied.]]\n[[Conflict: Tom keeps making jokes.]]\n[[Outcome: He won't. He leaves.]]\n[[Shift: hope → dread]]\n\nMARGARET sits at the table, not eating.\n",
    );
  });

  test('adds a field between the ones before and after it', () => {
    expect(
      details('INT. A - DAY\n\n= Syn.\n[[Color: blue]]\n[[Outcome: Lost.]]\n\nAction.\n', {
        goal: 'Win.',
      }),
    ).toBe(
      'INT. A - DAY\n\n= Syn.\n[[Color: blue]]\n[[Goal: Win.]]\n[[Outcome: Lost.]]\n\nAction.\n',
    );
    // Before the first field after it, with no field before it.
    expect(details('INT. A - DAY\n\n[[Shift: + → −]]\n\nAction.\n', { storyline: 'B' })).toBe(
      'INT. A - DAY\n\n[[Storyline: B]]\n[[Shift: + → −]]\n\nAction.\n',
    );
    // After the fields before it, and before the writer's other notes.
    expect(
      details('INT. A - DAY\n\n[[Color: red]]\n[[TODO: tighten]]\n\nAction.\n', { goal: 'Win.' }),
    ).toBe('INT. A - DAY\n\n[[Color: red]]\n[[Goal: Win.]]\n[[TODO: tighten]]\n\nAction.\n');
    // A field typed by hand lower in the scene stays there; the header gets only what's new.
    expect(
      details('INT. A - DAY\n\n= Syn.\n\nShe waits. [[Goal: Win.]]\n', {
        goal: 'Lose.',
        color: 'teal',
      }),
    ).toBe('INT. A - DAY\n\n= Syn.\n[[Color: teal]]\n\nShe waits. [[Goal: Lose.]]\n');
  });

  test('clears a field and its line', () => {
    const header =
      'INT. A - DAY\n\n[[Color: blue]]\n[[Goal: Win.]]\n[[Conflict: Rain.]]\n\nAction.\n';
    expect(details(header, { goal: '', conflict: '' })).toBe(
      'INT. A - DAY\n\n[[Color: blue]]\n\nAction.\n',
    );
    expect(details(header, { color: null, goal: '  ', conflict: '' })).toBe(
      'INT. A - DAY\n\nAction.\n',
    );
    // A field cleared and another added in its place.
    expect(details(header, { color: null, storyline: 'A' })).toBe(
      'INT. A - DAY\n\n[[Storyline: A]]\n[[Goal: Win.]]\n[[Conflict: Rain.]]\n\nAction.\n',
    );
    expect(details(header, { conflict: '', outcome: 'Wet.' })).toBe(
      'INT. A - DAY\n\n[[Color: blue]]\n[[Goal: Win.]]\n[[Outcome: Wet.]]\n\nAction.\n',
    );
    expect(
      details('INT. A - DAY\n\n= Syn.\n[[Goal: Win.]]\n\nAction.\n', {
        synopsis: '',
        goal: '',
        shift: 'up',
      }),
    ).toBe('INT. A - DAY\n\n[[Shift: up]]\n\nAction.\n');
    // Two hand-typed fields on lines of their own, side by side, go together.
    expect(
      details('INT. A - DAY\n\nAction.\n[[Goal: Win.]]\n[[Conflict: Rain.]]\n\nMore.\n', {
        goal: '',
        conflict: '',
      }),
    ).toBe('INT. A - DAY\n\nAction.\n\nMore.\n');
    // Clearing a field that isn't there changes nothing.
    expect(details('INT. A - DAY\n\nAction.\n', { goal: '' })).toBe('INT. A - DAY\n\nAction.\n');
  });

  test('edits a hand-typed field where it is', () => {
    expect(details('INT. A - DAY\n\nShe waits. [[goal :  win ]]\n', { goal: 'Lose.' })).toBe(
      'INT. A - DAY\n\nShe waits. [[Goal: Lose.]]\n',
    );
    // Taken out of a line it shares, the spaces around it stay.
    expect(details('INT. A - DAY\n\nShe waits [[Goal: win]] by.\n', { goal: '' })).toBe(
      'INT. A - DAY\n\nShe waits  by.\n',
    );
    // A second Goal is left alone (lint's duplicate-field lists it).
    expect(
      details('INT. A - DAY\n\n[[Goal: One.]]\n\nAction. [[Goal: Two.]]\n', { goal: 'Three.' }),
    ).toBe('INT. A - DAY\n\n[[Goal: Three.]]\n\nAction. [[Goal: Two.]]\n');
  });

  test('clears or changes a synopsis without the notes on its line', () => {
    const source =
      'INT. A - DAY\n\n= Syn. [[Setup: the letter]] [[Sam: cut?]]\n[[Goal: Win.]]\n\nAction.\n';
    const cleared = details(source, { synopsis: '' });
    expect(cleared).toBe(
      'INT. A - DAY\n\n[[Setup: the letter]] [[Sam: cut?]]\n[[Goal: Win.]]\n\nAction.\n',
    );
    expect(printed(cleared)).toBe(printed(source));
    expect(indexOf(cleared).index.scenes[0]?.marks.map((m) => m.label)).toEqual(['the letter']);
    const changed = details(source, { synopsis: 'New.', goal: 'Lose.' });
    expect(changed).toBe(
      'INT. A - DAY\n\n= New. [[Setup: the letter]] [[Sam: cut?]]\n[[Goal: Lose.]]\n\nAction.\n',
    );
    expect(printed(changed)).toBe(printed(source));
    // Through setSynopsis too.
    expect(synopsis(source, '')).toBe(cleared);
    // Words around the notes are the synopsis's: they go with its `=`, and every note stays.
    const shapes: Array<[string, string]> = [
      ['= Syn. [[Setup: the letter]] more words.', '[[Setup: the letter]]'],
      ['= [[a note]] the.', '[[a note]]'],
      ['= /* cut */ Syn. [[Sam: why?]] end.', '/* cut */ [[Sam: why?]]'],
    ];
    for (const [line, kept] of shapes) {
      const before = `INT. A - DAY\n\n${line}\n\nAction.\n`;
      const after = synopsis(before, '');
      expect(after).toBe(`INT. A - DAY\n\n${kept}\n\nAction.\n`);
      expect(details(before, { synopsis: '' })).toBe(after);
      expect(printed(after)).toBe(printed(before));
    }
    // Among lines it would join, where the line of notes would print differently, nothing changes.
    const joined = 'INT. A - DAY\n\n!LOUD NOISE.\nThe walls shake.\n= [[a note]] the.\n> the. <';
    expect(synopsis(joined, '')).toBe(joined);
    // With nothing else on it, the line goes.
    expect(synopsis('INT. A - DAY\n\n= Syn.\n\nAction.\n', '')).toBe('INT. A - DAY\n\nAction.\n');
  });

  test('a value typed in another case is no change', () => {
    const source = 'INT. A - DAY\n\n[[color: Blue]]\n\nAction.\n';
    const { doc, index } = indexOf(source);
    const scene = index.scenes[0];
    if (!scene) throw new Error('no scene');
    expect(setSceneDetails(doc, scene, { color: 'blue' })).toEqual([]);
  });

  test('fills in an empty field where it is', () => {
    expect(details('INT. A - DAY\n\nAction. [[Goal:]]\n', { goal: 'Win.', color: 'red' })).toBe(
      'INT. A - DAY\n\n[[Color: red]]\n\nAction. [[Goal: Win.]]\n',
    );
    // An empty one is still no field for reading.
    expect(indexOf('INT. A - DAY\n\n[[Goal:]]\n').index.scenes[0]?.fields).toEqual({});
  });

  test('writes a synopsis and fields together under a bare heading', () => {
    expect(details('INT. A - DAY\n', { goal: 'G.', color: 'red', synopsis: 'S.' })).toBe(
      'INT. A - DAY\n\n= S.\n[[Color: red]]\n[[Goal: G.]]\n',
    );
    expect(details('INT. A - DAY\n\nINT. B - DAY\n', { synopsis: 'S.', storyline: 'A, B' })).toBe(
      'INT. A - DAY\n\n= S.\n[[Storyline: A, B]]\n\nINT. B - DAY\n',
    );
    // A synopsis replaced while a field goes in under it.
    expect(
      details('INT. A - DAY\n\n= Old.\n[[Goal: G.]]\n\nAction.\n', {
        synopsis: 'New.',
        color: 'gray',
      }),
    ).toBe('INT. A - DAY\n\n= New.\n[[Color: gray]]\n[[Goal: G.]]\n\nAction.\n');
    // A new synopsis goes above a header of notes.
    expect(
      details('INT. A - DAY\n\n[[Goal: G.]]\n\nAction.\n', { synopsis: 'S.', goal: 'H.' }),
    ).toBe('INT. A - DAY\n\n= S.\n[[Goal: H.]]\n\nAction.\n');
  });

  test("writes a play's ## scene header", () => {
    const meta = '/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/\n';
    expect(
      details(`# Act\n\n## Scene 1\n\nWords.\n\n## Scene 2\n\nMore.\n\n${meta}`, {
        synopsis: 'S.',
        conflict: 'C.',
      }),
    ).toBe(
      `# Act\n\n## Scene 1\n\n= S.\n[[Conflict: C.]]\n\nWords.\n\n## Scene 2\n\nMore.\n\n${meta}`,
    );
    expect(details(`# Act\n\n## Scene 1\n\n${meta}`, { goal: 'G.' }, 1)).toBe(
      `# Act\n\n## Scene 1\n\n[[Goal: G.]]\n\n${meta}`,
    );
  });

  test('changes nothing when nothing changed', () => {
    const source =
      'INT. A - DAY\n\n= Syn.\n[[Color: blue]]\n[[Goal: Win.]]\n\nAction. [[Shift: up]]\n';
    const { doc, index } = indexOf(source);
    const scene = index.scenes[0];
    if (!scene) throw new Error('no scene');
    expect(setSceneDetails(doc, scene, {})).toEqual([]);
    expect(
      setSceneDetails(doc, scene, {
        synopsis: 'Syn.',
        color: 'blue',
        goal: 'Win.',
        shift: 'up',
        conflict: '',
        outcome: '',
      }),
    ).toEqual([]);
  });

  test("writes the writer's words on one line, closing nothing", () => {
    expect(details('INT. A - DAY\n', { goal: 'Two\nlines ]] /* x' })).toBe(
      'INT. A - DAY\n\n[[Goal: Two / lines ] ] / * x]]\n',
    );
  });

  test('keeps a CRLF line break style', () => {
    expect(
      details('INT. A - DAY\r\n\r\n[[Color: blue]]\r\n[[Shift: up]]\r\n\r\nAction.\r\n', {
        synopsis: 'S.',
        goal: 'G.',
        shift: '',
      }),
    ).toBe('INT. A - DAY\r\n\r\n= S.\r\n[[Color: blue]]\r\n[[Goal: G.]]\r\n\r\nAction.\r\n');
  });
});

describe('a script with an unclosed /*', () => {
  const OPEN = 'INT. A - DAY\n\nA.\n\nINT. B - DAY\n\nB. /* oops\n\n/* drafter\n{"v":1}\n*/\n';
  test('gets no synopsis or color changes', () => {
    const { doc, index } = indexOf(OPEN);
    const scene = index.scenes[0];
    if (!scene) throw new Error('no scene');
    expect(setSynopsis(doc, scene, 'New.')).toEqual([]);
    expect(setColor(doc, scene, 'blue')).toEqual([]);
    expect(setSceneDetails(doc, scene, { goal: 'Win.' })).toEqual([]);
  });
});

describe('two-space lines', () => {
  test("a synopsis joined to its neighbours by them isn't taken out", () => {
    const source = 'INT. A - DAY\n\nCUT TO:\n  \n= the.\n  \n> the. <';
    expect(synopsis(source, '')).toBe(source);
    const speech = 'INT. A - DAY\n\nANN\nHi.\n  \n= the.\nANN\nHi.';
    expect(synopsis(speech, '')).toBe(speech);
  });
});
