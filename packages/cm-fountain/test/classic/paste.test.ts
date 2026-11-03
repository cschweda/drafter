import { history, undo } from '@codemirror/commands';
import type { EditorState } from '@codemirror/state';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { type ClassicKind, classicLine, setStored } from '../../src/classic/line';
import { apply, render } from '../helpers';
import { classicEditor, keys, type } from './harness';

// Paste and drop in Classic Mode (design §11): what was copied goes in as it was. One line takes
// the element of the line it lands on, with the mark that line needs; several lines are the
// parser's, with no marks; and a paste gets the blank lines it needs to stand apart.

const SCRIPT = `Title: Signal Hill
Author: Test

INT. DINER - DAY

The lights hum. JUNE wipes the counter.

JUNE
(to herself)
Still open?

DALE (V.O.)
Always.

> CUT TO: <

.FLASHBACK - 1987

!SMASH CUT TO:

~One more song

[[a note]]
`;

const PLAY = builtins['stage-play-standard'] as Template;

const paste = (state: EditorState, text: string, userEvent = 'input.paste') =>
  type(state, text, { userEvent, by: 'whole' });

/** The state with `kind` chosen on the cursor's empty line, as Tab or the chooser leaves it. */
const choose = (state: EditorState, kind: ClassicKind) =>
  state.update({ effects: setStored.of({ kind, chosen: true }) }).state;

describe('§11, paste', () => {
  test('a Fountain script pasted in comes out as it was', () => {
    expect(paste(classicEditor('|'), SCRIPT).sliceDoc()).toBe(SCRIPT);
    // Between two elements, with the blank lines it already has around it.
    const between = classicEditor('She waits.\n\n|\n\nThe lights hum.');
    expect(paste(between, 'JUNE\nStill open?').sliceDoc()).toBe(
      'She waits.\n\nJUNE\nStill open?\n\nThe lights hum.',
    );
    // Dropped, the same.
    expect(paste(classicEditor('|'), SCRIPT, 'input.drop').sliceDoc()).toBe(SCRIPT);
  });

  test('one line takes the line’s element', () => {
    const heading = paste(choose(classicEditor('She waits.\n\n|'), 'scene_heading'), 'FLASHBACK');
    expect(render(heading)).toBe('She waits.\n\n.FLASHBACK|');
    expect(heading.field(classicLine)?.kind).toBe('scene_heading');
    // And keeps it: the next key goes on from that element, as from one typed.
    expect(render(keys(heading, 'Enter'))).toBe('She waits.\n\n.FLASHBACK\n\n|');
    // A line that needs no mark gets none.
    const name = paste(choose(classicEditor('She waits.\n\n|'), 'character'), 'DALE');
    expect(render(name)).toBe('She waits.\n\nDALE|');
    expect(name.field(classicLine)?.kind).toBe('character');
    expect(render(keys(name, 'Enter'))).toBe('She waits.\n\nDALE\n|');
    // Into a line with text, it's that line's: Action stays Action.
    expect(render(paste(classicEditor('She waits|.'), ' for CUT TO:'))).toBe(
      'She waits for CUT TO:|.',
    );
  });

  test('a pasted line with a mark of its own keeps it, and is what it says', () => {
    // On a fresh line after Action, after a speech (a pending Character), and in a play.
    const cases: [string, string, string | null][] = [
      ['@McGRAW', 'character', null],
      ['.FLASHBACK', 'scene_heading', null],
      ['>CUT TO BLACK.', 'transition', null],
      ['> CUT TO: <', 'centered', null],
      ['~One more song', 'lyric', null],
      ['= A synopsis', 'synopsis', null],
      ['!INT. BY THE DOOR', 'action', null],
    ];
    for (const [text, kind] of cases) {
      for (const before of ['She waits.\n\n|', 'JUNE\nStill open?\n\n|']) {
        const state = paste(classicEditor(before), text);
        expect(render(state), `${text} after ${before}`).toBe(`${before.slice(0, -1)}${text}|`);
        expect(state.field(classicLine)?.kind, text).toBe(kind);
        expect(state.field(classicLine)?.added, text).toEqual([]);
      }
    }
    // Even on a line where another element was chosen.
    expect(render(paste(choose(classicEditor('She waits.\n\n|'), 'action'), '@McGRAW'))).toBe(
      'She waits.\n\n@McGRAW|',
    );
    const play = paste(classicEditor('She waits.\n\n|', { template: PLAY }), '# Act');
    expect(render(play)).toBe('She waits.\n\n# Act|');
    expect(play.field(classicLine)?.kind).toBe('act');
  });

  test('pasted june on a Character is @june', () => {
    const state = paste(choose(classicEditor('She waits.\n\n|'), 'character'), 'june');
    expect(render(state)).toBe('She waits.\n\n@june|');
    expect(state.field(classicLine)?.added).toEqual([{ from: 12, to: 13 }]);
    // Dropped, the same; and the `@` goes with one undo.
    const dropped = paste(
      choose(classicEditor('She waits.\n\n|', { with: [history()] }), 'character'),
      'june',
      'input.drop',
    );
    expect(dropped.sliceDoc()).toBe('She waits.\n\n@june');
  });

  test('pasted on a speech line made by Enter, it goes on with the speech', () => {
    const state = keys(classicEditor('JUNE\nStill open?|\nAlways.'), 'Enter');
    expect(render(state)).toBe('JUNE\nStill open?\n|\nAlways.');
    expect(render(paste(state, 'Maybe.'))).toBe('JUNE\nStill open?\nMaybe.|\nAlways.');
  });

  test('pasted on a two-space blank speech line, it takes the spaces’ place', () => {
    expect(render(paste(classicEditor('JUNE\nStill open?\n  |'), 'Yes.'))).toBe(
      'JUNE\nStill open?\nYes.|',
    );
    expect(render(paste(classicEditor('JUNE\nStill open?\n | '), 'Yes.\nNo.'))).toBe(
      'JUNE\nStill open?\nYes.\nNo.|',
    );
  });

  test('a paste gets the blank lines it needs', () => {
    // An empty line straight between two paragraphs: the paste would join them both.
    const tight = classicEditor('She waits.\n|\nThe lights hum.');
    expect(render(paste(tight, 'JUNE\nStill open?'))).toBe(
      'She waits.\n\nJUNE\nStill open?|\n\nThe lights hum.',
    );
    // One line, a Character chosen there.
    expect(render(paste(choose(tight, 'character'), 'DALE'))).toBe(
      'She waits.\n\nDALE|\n\nThe lights hum.',
    );
    // A pasted text that brings its own blank lines gets no more.
    expect(paste(tight, '\nJUNE\nHi.\n').sliceDoc()).toBe(
      'She waits.\n\nJUNE\nHi.\n\nThe lights hum.',
    );
    // In a speech, a line of it goes on with the speech: no blank lines.
    const speech = keys(classicEditor('JUNE\nStill open?|\nAlways.'), 'Enter');
    expect(paste(speech, 'Maybe.\nNo.').sliceDoc()).toBe('JUNE\nStill open?\nMaybe.\nNo.\nAlways.');
  });

  test('paste isn’t capitalised', () => {
    expect(render(paste(choose(classicEditor('She waits.\n\n|'), 'character'), 'june'))).toBe(
      'She waits.\n\n@june|',
    );
    // Not even a heading's prefix on a fresh line, which typing would make capitals.
    const heading = paste(classicEditor('She waits.\n\n|'), 'int. diner - day');
    expect(render(heading)).toBe('She waits.\n\nint. diner - day|');
    expect(heading.field(classicLine)?.kind).toBe('scene_heading');
    expect(render(paste(classicEditor('She waits.\n\n|'), 'smash cut to:'))).toBe(
      'She waits.\n\nsmash cut to:|',
    );
  });

  test('a replace-all is left alone', () => {
    const state = choose(classicEditor('She waits.\n\n|'), 'character');
    expect(paste(state, 'june', 'input.replace').sliceDoc()).toBe('She waits.\n\njune');
    expect(
      paste(classicEditor('She waits.\n|\nThe lights hum.'), 'A\nB', 'input.replace').sliceDoc(),
    ).toBe('She waits.\nA\nB\nThe lights hum.');
  });

  test('one undo takes the paste and what it wrote', () => {
    const start = choose(
      classicEditor('She waits.\n|\nThe lights hum.', { with: [history()] }),
      'character',
    );
    const pasted = paste(start, 'june');
    expect(pasted.sliceDoc()).toBe('She waits.\n\n@june\n\nThe lights hum.');
    expect(apply(pasted, undo).sliceDoc()).toBe('She waits.\n\nThe lights hum.');
  });
});
