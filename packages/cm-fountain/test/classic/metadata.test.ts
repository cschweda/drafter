import { cursorDocEnd, history, redo, selectAll, undo } from '@codemirror/commands';
import {
  findNext,
  findPrevious,
  replaceAll,
  replaceNext,
  SearchQuery,
  search,
  selectMatches,
  selectNextOccurrence,
  selectSelectionMatches,
  setSearchQuery,
} from '@codemirror/search';
import { EditorSelection, EditorState, type StateCommand, Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { appChange, fountain, parsedDoc } from '@drafter/cm-fountain';
import { metadataSpan, setMeta } from '@drafter/fountain';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { classic, classicLine, elementAt, onlyClearedBlock } from '../../src/classic';
import { metadataHidden, protectedRange } from '../../src/classic/metadata';
import { BOM } from '../helpers';
import { classicEditor, keys, render, type } from './harness';

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;

const BLOCK = '/* drafter\n{"v":1,"template":"stage-play"}\n*/';
const STAGE = builtins['stage-play-standard'] as Template;
const META = { v: 1, template: 'stage-play' };

/** A stage play in Classic Mode, with a history. */
const play = (marked: string, withUndo = true) =>
  classicEditor(marked, { template: STAGE, with: withUndo ? [history()] : [] });

const metaOf = (state: EditorState) => state.field(parsedDoc).meta;

/** Runs a command, as a key would, on a view. */
function command(state: EditorState, run: StateCommand | ((view: EditorView) => boolean)) {
  const view = new EditorView({ state });
  try {
    (run as (view: EditorView) => boolean)(view);
    return view.state;
  } finally {
    view.destroy();
  }
}

const all = (state: EditorState) => command(state, selectAll);

/** The state after a transaction with `event`, as an input path would send it. */
const write = (state: EditorState, insert: string, event: string, range = state.selection.main) =>
  state.update({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + insert.length },
    userEvent: event,
  }).state;

const SCRIPT = `One.\n\nTwo.\n\n${BLOCK}\n`;

describe('protectedRange', () => {
  test('runs from the two line breaks before the block to its end', () => {
    expect(protectedRange(play(`|One.\n\n${BLOCK}\n`))).toEqual({ from: 4, to: 6 + BLOCK.length });
  });

  test('leaves the blank lines above those two to the writer', () => {
    expect(protectedRange(play(`|One.\n\n\n\n${BLOCK}`))?.from).toBe(6);
  });

  test('is null with no block', () => {
    expect(protectedRange(play('|One.'))).toBeNull();
  });
});

describe('what the writer does (§8.4)', () => {
  test('Select All, Delete leaves the block, an empty line for the cursor, and the blank line under it', () => {
    const next = keys(all(play(`|${SCRIPT}`)), 'Backspace');
    expect(render(next)).toBe(`|\n\n${BLOCK}\n`);
  });

  test('Select All, the Delete key, the same', () => {
    expect(render(keys(all(play(`|${SCRIPT}`)), 'Delete'))).toBe(`|\n\n${BLOCK}\n`);
  });

  test('one undo gives the text back, byte for byte', () => {
    const emptied = keys(all(play(`|${SCRIPT}`)), 'Backspace');
    expect(command(emptied, undo).sliceDoc()).toBe(SCRIPT);
  });

  test('a template holds', () => {
    expect(metaOf(keys(all(play(`|${SCRIPT}`)), 'Backspace'))).toEqual(META);
  });

  test('Select All, Cut: what is cut has no block, and the block stays', () => {
    const chosen = all(play(`|${SCRIPT}`));
    const { from, to } = chosen.selection.main;
    expect(chosen.sliceDoc(from, to)).toBe('One.\n\nTwo.');
    expect(render(write(chosen, '', 'delete.cut'))).toBe(`|\n\n${BLOCK}\n`);
  });

  test('Select All, Paste: the paste replaces the text, above the block', () => {
    const next = write(all(play(`|${SCRIPT}`)), 'Three.\n\nFour.', 'input.paste');
    expect(render(next)).toBe(`Three.\n\nFour.|\n\n${BLOCK}\n`);
    expect(metaOf(next)).toEqual(META);
    expect(command(next, undo).sliceDoc()).toBe(SCRIPT);
  });

  test('Select All, type: the first letter replaces the text', () => {
    const next = type(all(play(`|${SCRIPT}`)), 'x');
    expect(render(next)).toBe(`x|\n\n${BLOCK}\n`);
    expect(metaOf(next)).toEqual(META);
    expect(command(next, undo).sliceDoc()).toBe(SCRIPT);
  });

  test('a paste that ends in its own block: the kept block stays last and wins', () => {
    const other = '/* drafter\n{"v":1,"template":"us-screenplay"}\n*/';
    const next = write(all(play(`|${SCRIPT}`)), `Three.\n\n${other}`, 'input.paste');
    expect(next.sliceDoc()).toBe(`Three.\n\n${other}\n\n${BLOCK}\n`);
    expect(metaOf(next)).toEqual(META);
  });
});

describe('the selection', () => {
  test('the selection stops above the block', () => {
    const state = play(`|${SCRIPT}`).update({
      selection: EditorSelection.single(2, SCRIPT.length),
      userEvent: 'select',
    }).state;
    expect(state.selection.main.to).toBe(10);
    expect(state.selection.main.from).toBe(2);
  });

  test('both ends of a selection stop, and it comes to a cursor', () => {
    const state = play(`|${SCRIPT}`).update({
      selection: EditorSelection.single(SCRIPT.length, 14),
      userEvent: 'select',
    }).state;
    expect(render(state)).toBe(`One.\n\nTwo.|\n\n${BLOCK}\n`);
  });

  test('a selection with no user event stops too', () => {
    const state = play(`|${SCRIPT}`).update({ selection: { anchor: 0, head: 20 } }).state;
    expect(state.selection.main.to).toBe(10);
  });

  test('a lone cursor sent into the block stops above it, by key or click', () => {
    for (const userEvent of ['select', 'select.pointer']) {
      const state = play(`|${SCRIPT}`).update({ selection: { anchor: 20 }, userEvent }).state;
      expect(render(state)).toBe(`One.\n\nTwo.|\n\n${BLOCK}\n`);
    }
  });

  test('every range of several stops', () => {
    const start = classicEditor(`|${SCRIPT}`, {
      template: STAGE,
      with: [EditorState.allowMultipleSelections.of(true)],
    });
    const next = start.update({
      selection: EditorSelection.create([
        EditorSelection.cursor(1),
        EditorSelection.range(8, 20),
        EditorSelection.cursor(25),
      ]),
      userEvent: 'select',
    }).state;
    expect(next.selection.ranges.at(-1)?.to).toBe(10);
  });

  test('Mod+End stops above the block', () => {
    const next = command(play(`|${SCRIPT}`), cursorDocEnd);
    expect(render(next)).toBe(`One.\n\nTwo.|\n\n${BLOCK}\n`);
  });

  test('Mod+End passes extra blank lines above the block', () => {
    const marked = `One.\n\nTwo.\n\n\n\n${BLOCK}\n`;
    expect(render(command(play(`|${marked}`), cursorDocEnd))).toBe(
      `One.\n\nTwo.|\n\n\n\n${BLOCK}\n`,
    );
  });

  test('Mod+End from the line above the block stays on the last element', () => {
    expect(render(command(play(`Two.|\n\n\n${BLOCK}\n`), cursorDocEnd))).toBe(
      `Two.|\n\n\n${BLOCK}\n`,
    );
  });

  test('Mod+End on a script with nothing but the block stays', () => {
    expect(render(command(play(`|${BLOCK}\n`), cursorDocEnd))).toBe(`|${BLOCK}\n`);
  });

  test('a step off the last line stays above the block', () => {
    const start = play(`One.\n\nTwo.|\n\n${BLOCK}\n`);
    const moved = start.update({ selection: { anchor: 11 }, userEvent: 'select' }).state;
    expect(render(moved)).toBe(`One.\n\nTwo.|\n\n${BLOCK}\n`);
  });
});

describe('typing at the end', () => {
  test('Enter on the last element makes a place above the block', () => {
    const next = keys(play(`One.|\n\n${BLOCK}\n`), 'Enter');
    expect(render(next)).toBe(`One.\n\n|\n\n${BLOCK}\n`);
    expect(render(keys(next, 'A'))).toBe(`One.\n\nA|\n\n${BLOCK}\n`);
    expect(metaOf(keys(next, 'A'))).toEqual(META);
  });

  test('a made line above the block is tidied when it is left', () => {
    const made = keys(play(`One.|\n\n${BLOCK}\n`), 'Enter');
    const next = made.update({ selection: { anchor: 4 }, userEvent: 'select' }).state;
    expect(next.sliceDoc()).toBe(`One.\n\n${BLOCK}\n`);
    expect(metaOf(next)).toEqual(META);
  });

  test('Delete at the end of the last element leaves the block alone', () => {
    expect(render(keys(play(`One.|\n\n${BLOCK}\n`), 'Delete'))).toBe(`One.|\n\n${BLOCK}\n`);
  });

  test('Backspace on the last letter leaves its place above the block', () => {
    const next = keys(play(`x|\n\n${BLOCK}\n`), 'Backspace');
    expect(render(next)).toBe(`|\n\n${BLOCK}\n`);
    expect(render(type(next, 'y'))).toBe(`y|\n\n${BLOCK}\n`);
  });
});

describe('a blank script', () => {
  const blank = () => play(`|${BLOCK}\n`);

  test('the first letter of a new blank stage play keeps its template', () => {
    const next = type(blank(), 'x');
    expect(metaOf(next)).toEqual(META);
    expect(render(next)).toBe(`x|\n\n${BLOCK}\n`);
    expect(metadataSpan(next.field(parsedDoc))).not.toBeNull();
  });

  test('more letters and an undo', () => {
    const next = type(blank(), 'xy');
    expect(render(next)).toBe(`xy|\n\n${BLOCK}\n`);
    expect(command(next, undo).sliceDoc()).toBe(`${BLOCK}\n`);
  });

  test('a paste with a break of its own takes the one it needs', () => {
    expect(write(blank(), 'x\n', 'input.paste').sliceDoc()).toBe(`x\n\n${BLOCK}\n`);
    expect(write(blank(), 'x\n\n', 'input.paste').sliceDoc()).toBe(`x\n\n${BLOCK}\n`);
  });

  test('with CRLF breaks the block stays CRLF', () => {
    const crlf = '/* drafter\r\n{"v":1,"template":"stage-play"}\r\n*/\r\n';
    const state = EditorState.create({
      doc: Text.of(crlf.split('\r\n')),
      extensions: [
        EditorState.lineSeparator.of('\r\n'),
        fountain({ template: () => STAGE }),
        classic(),
      ],
    });
    const next = type(state, 'x');
    expect(next.doc.toString()).toBe(`x\n\n${BLOCK}\n`);
    expect(next.sliceDoc()).toBe(`x\r\n\r\n${crlf}`);
  });

  test('its cursor stands on an empty line', () => {
    const state = blank();
    expect(elementAt(state)).toMatchObject({ kind: 'action', pending: true });
    expect(state.field(classicLine)?.kind).toBe('action');
  });

  test('Enter writes nothing and Tab walks the row', () => {
    expect(render(keys(blank(), 'Enter'))).toBe(`|${BLOCK}\n`);
    const next = keys(blank(), 'Tab');
    expect(render(next)).toBe(`|${BLOCK}\n`);
    expect(elementAt(next)?.kind).toBe('character');
  });

  test('a letter takes the element Tab chose', () => {
    const next = keys(blank(), 'Tab', 'june');
    expect(next.sliceDoc()).toBe(`JUNE\n\n${BLOCK}\n`);
    expect(metaOf(next)).toEqual(META);
  });

  test('Backspace and Delete take nothing', () => {
    expect(render(keys(blank(), 'Backspace'))).toBe(`|${BLOCK}\n`);
    expect(render(keys(blank(), 'Delete'))).toBe(`|${BLOCK}\n`);
  });

  test('Select All, Delete: nothing to take', () => {
    expect(render(keys(all(blank()), 'Backspace'))).toBe(`|${BLOCK}\n`);
  });
});

describe('the backstop', () => {
  test('a change over the block is cut back, keeping what it inserts, the selection, and the event', () => {
    const state = play(`|${SCRIPT}`);
    const tr = state.update({
      changes: { from: 6, to: SCRIPT.length, insert: 'New.' },
      selection: { anchor: 10 },
      userEvent: 'input.paste',
    });
    expect(tr.state.sliceDoc()).toBe(`One.\n\nNew.\n\n${BLOCK}\n`);
    expect(tr.state.selection.main.head).toBe(10);
    expect(tr.isUserEvent('input.paste')).toBe(true);
  });

  test('a change that takes only the block changes nothing', () => {
    const tr = play(`|${SCRIPT}`).update({
      changes: { from: 12, to: 12 + BLOCK.length },
      userEvent: 'delete',
    });
    expect(tr.state.sliceDoc()).toBe(SCRIPT);
  });

  test('a replacement inside the block goes whole', () => {
    const at = SCRIPT.indexOf('template');
    const tr = play(`|${SCRIPT}`).update({
      changes: { from: at, to: at + 8, insert: 'X' },
      userEvent: 'input.replace.all',
    });
    expect(tr.state.sliceDoc()).toBe(SCRIPT);
  });

  test('a change above the block that sends the cursor into it stops it', () => {
    const tr = play(`|${SCRIPT}`).update({
      changes: { from: 0, insert: 'a' },
      selection: { anchor: 20 },
      userEvent: 'input',
    });
    expect(render(tr.state)).toBe(`aOne.\n\nTwo.|\n\n${BLOCK}\n`);
  });

  test('a drag past the block keeps the dragged text selected', () => {
    const tr = play(`|${SCRIPT}`).update({
      changes: [
        { from: 0, to: 4 },
        { from: SCRIPT.length, insert: 'One.' },
      ],
      selection: { anchor: SCRIPT.length - 4, head: SCRIPT.length },
      userEvent: 'move.drop',
    });
    expect(tr.state.sliceDoc()).toBe(`\n\nTwo.One.\n\n${BLOCK}\n`);
    const { from, to } = tr.state.selection.main;
    expect(tr.state.sliceDoc(from, to)).toBe('One.');
  });

  test('text dropped past the block lands above it', () => {
    const state = play(`|${SCRIPT}`);
    const tr = state.update({
      changes: { from: SCRIPT.length, insert: 'New.' },
      selection: { anchor: SCRIPT.length, head: SCRIPT.length + 4 },
      userEvent: 'input.drop',
    });
    expect(tr.state.sliceDoc()).toBe(`One.\n\nTwo.New.\n\n${BLOCK}\n`);
    expect(tr.state.selection.main.from).toBe(10);
    expect(tr.state.selection.main.to).toBe(14);
  });

  test('a delete that reaches the block is cut, and a delete on either side of it stays one', () => {
    const tr = play(`|${SCRIPT}`).update({
      changes: [
        { from: 0, to: 2 },
        { from: 8, to: 20 },
      ],
      selection: { anchor: 0 },
      userEvent: 'delete.selection',
    });
    expect(tr.state.sliceDoc()).toBe(`e.\n\nTw\n\n${BLOCK}\n`);
  });

  test('setMeta, undo, and appChange pass the filter', () => {
    const state = play(`|${SCRIPT}`);
    const [change] = setMeta(state.field(parsedDoc), { v: 1, template: 'us-screenplay' });
    const set = state.update({ changes: change }).state;
    expect(metaOf(set)).toEqual({ v: 1, template: 'us-screenplay' });
    const app = state.update({
      changes: { from: 0, to: SCRIPT.length },
      annotations: appChange.of(true),
      userEvent: 'input.replace',
    });
    expect(app.state.sliceDoc()).toBe('');
    const gone = state.update({ changes: { from: 0, to: SCRIPT.length } });
    expect(gone.state.sliceDoc()).toBe('');
    expect(command(gone.state, undo).sliceDoc()).toBe(SCRIPT);
    expect(command(command(gone.state, undo), redo).sliceDoc()).toBe('');
  });

  test('a composition is not rewritten', () => {
    const over = play(`|${SCRIPT}`).update({
      changes: { from: 0, to: SCRIPT.length, insert: 'あ' },
      userEvent: 'input.type.compose',
    });
    expect(over.state.sliceDoc()).toBe('あ');
  });
});

/** A state that finds `word`, in a view, for Find's own commands. */
function finding(marked: string, query: ConstructorParameters<typeof SearchQuery>[0]) {
  const state = classicEditor(marked, {
    template: STAGE,
    with: [search(), history(), EditorState.allowMultipleSelections.of(true)],
  });
  const view = new EditorView({ state, parent: document.body });
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery(query)) });
  return view;
}

const chosen = (view: EditorView) =>
  view.state.selection.ranges.map(({ from, to }) => view.state.sliceDoc(from, to));

/** A script with `play` above the block and in it. */
const FOUND = `A play.\n\nOne play.\n\n${BLOCK}\n`;

describe('Find and Replace', () => {
  const inBlock = FOUND.indexOf('play', FOUND.indexOf('/*'));

  test('replace all leaves the script alone where the match is in the block', () => {
    const view = finding(`|${FOUND}`, { search: 'template', replace: 'X' });
    replaceAll(view);
    expect(view.state.sliceDoc()).toBe(FOUND);
    view.destroy();
  });

  test('replace all takes the matches above and only those', () => {
    const view = finding(`|${FOUND}`, { search: 'play', replace: 'drama' });
    replaceAll(view);
    expect(view.state.sliceDoc()).toBe(
      FOUND.replace('A play', 'A drama').replace('One play', 'One drama'),
    );
    expect(view.state.field(parsedDoc).meta).toEqual(META);
    view.destroy();
  });

  test('Find Next wraps past the block', () => {
    const view = finding(`|${FOUND}`, { search: 'play' });
    const heads = [0, 1, 2, 3].map(() => {
      findNext(view);
      return view.state.selection.main.from;
    });
    expect(heads).toEqual([2, 13, 2, 13]);
    expect(inBlock).toBeGreaterThan(13);
    view.destroy();
  });

  test('Find Previous wraps to the last match above the block', () => {
    const view = finding(`|${FOUND}`, { search: 'play' });
    findPrevious(view);
    expect(view.state.selection.main.from).toBe(13);
    findPrevious(view);
    expect(view.state.selection.main.from).toBe(2);
    view.destroy();
  });

  test('Find with a match only in the block stays', () => {
    const view = finding(`A|b\n\n${BLOCK}\n`, { search: 'template' });
    findNext(view);
    expect(view.state.selection.main.head).toBe(1);
    expect(view.state.selection.ranges).toHaveLength(1);
    view.destroy();
  });

  test('Replace past the last match above wraps too', () => {
    const view = finding(`|${FOUND}`, { search: 'play', replace: 'act' });
    findNext(view);
    findNext(view);
    replaceNext(view);
    expect(view.state.sliceDoc()).toBe(FOUND.replace('One play', 'One act'));
    replaceNext(view);
    expect(view.state.selection.main.from).toBe(2);
    expect(chosen(view)).toEqual(['play']);
    view.destroy();
  });

  test('select matches leaves out those in the block', () => {
    const view = finding(`|${FOUND}`, { search: 'play' });
    selectMatches(view);
    expect(view.state.selection.ranges.map(({ from }) => from)).toEqual([2, 13]);
    view.destroy();
  });

  test('select the selection’s matches, and Mod+D, leave no cursor at the block', () => {
    const view = finding(`A [play].\n\nOne play.\n\n${BLOCK}\n`, { search: 'play' });
    selectSelectionMatches(view);
    expect(chosen(view)).toEqual(['play', 'play']);
    view.destroy();
    const next = finding(`One [play].\n\n${BLOCK}\n`, { search: 'play' });
    selectNextOccurrence(next);
    expect(next.state.selection.ranges).toHaveLength(1);
    expect(chosen(next)).toEqual(['play']);
    next.destroy();
  });
});

describe('a blank script is made ready', () => {
  const settled = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  /** A view on `doc` in Classic Mode, attached, with an unfocused start. */
  const opened = (doc: string, extra: Parameters<typeof classicEditor>[1] = {}) =>
    new EditorView({
      state: classicEditor(`|${doc}`, { template: STAGE, with: [history()], ...extra }),
      parent: document.body,
    });

  test('when Classic Mode starts: two breaks above the block, in no undo step', async () => {
    const view = opened(`${BLOCK}\n`);
    await settled();
    expect(render(view.state)).toBe(`|\n\n${BLOCK}\n`);
    undo(view);
    expect(view.state.sliceDoc()).toBe(`\n\n${BLOCK}\n`);
    view.destroy();
  });

  test('a composed first letter lands above a block clear of it', async () => {
    const view = opened(`${BLOCK}\n`);
    await settled();
    view.dispatch({ changes: { from: 0, insert: 'あ' }, userEvent: 'input.type.compose' });
    expect(view.state.sliceDoc()).toBe(`あ\n\n${BLOCK}\n`);
    expect(view.state.field(parsedDoc).meta).toEqual(META);
    view.destroy();
  });

  test('on focus, and when the text changes under a focused editor', async () => {
    const view = opened('One.\n');
    await settled();
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: `${BLOCK}\n` } });
    await settled();
    expect(view.state.sliceDoc()).toBe(`${BLOCK}\n`);
    view.focus();
    await settled();
    expect(view.state.sliceDoc()).toBe(`\n\n${BLOCK}\n`);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: `${BLOCK}\n` } });
    await settled();
    expect(view.state.sliceDoc()).toBe(`\n\n${BLOCK}\n`);
    view.destroy();
  });

  test('a script with text, a read-only one, and a composition are left alone', async () => {
    const view = opened(SCRIPT);
    await settled();
    expect(view.state.sliceDoc()).toBe(SCRIPT);
    view.destroy();
    const locked = opened(`${BLOCK}\n`, { with: [EditorState.readOnly.of(true)] });
    await settled();
    expect(locked.state.sliceDoc()).toBe(`${BLOCK}\n`);
    locked.destroy();
  });

  test('a destroyed view is left alone', async () => {
    const view = opened(`${BLOCK}\n`);
    view.destroy();
    await settled();
    expect(view.state.sliceDoc()).toBe(`${BLOCK}\n`);
  });

  test('marks the change as the app’s and keeps a byte-order mark first', async () => {
    const seen: boolean[] = [];
    const view = opened(`${BOM}${BLOCK}\n`, {
      with: [
        EditorView.updateListener.of((update) => {
          for (const tr of update.transactions) seen.push(tr.annotation(appChange) === true);
        }),
      ],
    });
    await settled();
    expect(view.state.sliceDoc()).toBe(`${BOM}\n\n${BLOCK}\n`);
    expect(view.state.selection.main.head).toBe(1);
    expect(seen).toEqual([true]);
    view.destroy();
  });

  test('Fountain Mode never does it', async () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: `${BLOCK}\n`,
        extensions: [fountain({ template: () => STAGE })],
      }),
      parent: document.body,
    });
    view.focus();
    await settled();
    expect(view.state.sliceDoc()).toBe(`${BLOCK}\n`);
    view.destroy();
  });

  test('a new stage play gets a line of its own under the title page, and its first letter stands there', async () => {
    // The app's new stage play: a title page, its blank line, and the block, whose two breaks leave
    // only the title page's blank line to stand on, where a letter would be more of the title page.
    const title =
      'Title: Untitled Play\nCredit: Written by\nAuthor: Your Name\nDraft date: May 1, 2026\n\n';
    const doc = `${title}\n${BLOCK}\n`;
    const view = new EditorView({
      state: classicEditor(`${title}|\n${BLOCK}\n`, { template: STAGE, with: [history()] }),
      parent: document.body,
    });
    view.focus();
    await settled();
    expect(view.state.sliceDoc()).toBe(`${title}\n\n${BLOCK}\n`);
    expect(onlyClearedBlock(Text.of(doc.split('\n')), view.state.doc)).toBe(true);
    // Moved onto the line made, and the letter typed there is a stage direction.
    view.dispatch({ selection: { anchor: view.state.selection.main.head } });
    view.dispatch(
      view.state.update({
        changes: { from: view.state.selection.main.head, insert: 'a' },
        selection: { anchor: view.state.selection.main.head + 1 },
        userEvent: 'input.type',
      }),
    );
    expect(view.state.sliceDoc()).toBe(`${title}a\n\n${BLOCK}\n`);
    expect(view.state.field(parsedDoc).titlePage?.fields.map((f) => f.key)).toEqual([
      'Title',
      'Credit',
      'Author',
      'Draft date',
    ]);
    expect(view.state.field(parsedDoc).meta).toEqual(META);
    undo(view);
    expect(view.state.sliceDoc()).toBe(`${title}\n\n${BLOCK}\n`);
    view.destroy();
  });

  test('a title page with a line of its own already, and Fountain Mode, are left alone', async () => {
    const title = 'Title: Untitled Play\n\n';
    const view = opened(`${title}One.\n\n${BLOCK}\n`);
    view.focus();
    await settled();
    expect(view.state.sliceDoc()).toBe(`${title}One.\n\n${BLOCK}\n`);
    view.destroy();
    const fountainView = new EditorView({
      state: EditorState.create({
        doc: `${title}\n${BLOCK}\n`,
        extensions: [fountain({ template: () => STAGE })],
      }),
      parent: document.body,
    });
    fountainView.focus();
    await settled();
    expect(fountainView.state.sliceDoc()).toBe(`${title}\n${BLOCK}\n`);
    fountainView.destroy();
  });

  test('onlyClearedBlock knows those two breaks from anything else', () => {
    const of = (text: string) => Text.of(text.split('\n'));
    expect(onlyClearedBlock(of(`${BLOCK}\n`), of(`\n\n${BLOCK}\n`))).toBe(true);
    expect(onlyClearedBlock(of(`${BOM}${BLOCK}`), of(`${BOM}\n\n${BLOCK}`))).toBe(true);
    expect(onlyClearedBlock(of(`${BLOCK}\n`), of(`x\n${BLOCK}\n`))).toBe(false);
    expect(onlyClearedBlock(of('One.'), of('One.ab'))).toBe(false);
    expect(onlyClearedBlock(of(`T: x\n\n\n${BLOCK}`), of(`T: x\n\n\n\n${BLOCK}`))).toBe(true);
    expect(onlyClearedBlock(of(`T: x\n\n\n${BLOCK}`), of(`T: x\n\nx\n${BLOCK}`))).toBe(false);
    expect(onlyClearedBlock(of(`T: x\n\n\n${BLOCK}`), of(`T: x\n\n\n${BLOCK}x`))).toBe(false);
  });
});

describe('a byte-order mark stays first', () => {
  test('typing on a blank script with one', () => {
    const next = type(play(`${BOM}|${BLOCK}\n`), 'x');
    expect(next.sliceDoc()).toBe(`${BOM}x\n\n${BLOCK}\n`);
    expect(metaOf(next)).toEqual(META);
  });

  test('a letter takes the element Tab chose, past it', () => {
    const next = keys(play(`${BOM}|${BLOCK}\n`), 'Tab', 'june');
    expect(next.sliceDoc()).toBe(`${BOM}JUNE\n\n${BLOCK}\n`);
  });

  test('Delete on a blank script with one writes nothing', () => {
    expect(keys(play(`${BOM}|${BLOCK}\n`), 'Delete').sliceDoc()).toBe(`${BOM}${BLOCK}\n`);
  });

  test('Select All, Delete keeps it, with a block and with none', () => {
    const script = `${BOM}One.\n\n${BLOCK}\n`;
    expect(keys(all(play(`|${script}`)), 'Backspace').sliceDoc()).toBe(`${BOM}\n\n${BLOCK}\n`);
    expect(keys(all(play(`|${BOM}One.`)), 'Backspace').sliceDoc()).toBe(BOM);
  });
});

describe('which block', () => {
  const damaged = '/* drafter\n{not json\n*/';

  test('a damaged block is not protected and shows as a boneyard', () => {
    const marked = `One.\n\n${damaged}\n`;
    const state = play(`|${marked}`);
    expect(protectedRange(state)).toBeNull();
    expect(render(keys(all(state), 'Backspace'))).toBe('|');
    expect(hiddenFrom(state)).toHaveLength(0);
  });

  test('two blocks: only the last is protected', () => {
    const marked = `One.\n\n${BLOCK}\n\n${BLOCK}\n`;
    const state = play(`|${marked}`);
    expect(protectedRange(state)?.from).toBe(6 + BLOCK.length);
    expect(render(keys(all(state), 'Backspace'))).toBe(`|\n\n${BLOCK}\n`);
  });
});

/** The stretches the field hides. */
function hiddenFrom(state: EditorState): { from: number; to: number; block: boolean }[] {
  const out: { from: number; to: number; block: boolean }[] = [];
  for (const cursor = state.field(metadataHidden).iter(); cursor.value; cursor.next()) {
    out.push({ from: cursor.from, to: cursor.to, block: cursor.value.spec.block === true });
  }
  return out;
}

const drawn = (state: EditorState) => {
  const view = new EditorView({ state });
  try {
    return [...view.contentDOM.querySelectorAll('.cm-line')].map((line) => line.textContent);
  } finally {
    view.destroy();
  }
};

describe('metadataHidden', () => {
  test('a block with a trailing break draws no extra line', () => {
    expect(hiddenFrom(play(`|${SCRIPT}`))).toEqual([{ from: 12, to: SCRIPT.length, block: true }]);
    expect(drawn(play(`|${SCRIPT}`))).toEqual(['One.', '', 'Two.', '']);
  });

  test('an indented block is hidden whole', () => {
    const marked = `One.\n\n   ${BLOCK}`;
    expect(hiddenFrom(play(`|${marked}`))).toEqual([{ from: 6, to: marked.length, block: true }]);
    expect(drawn(play(`|${marked}`))).toEqual(['One.', '']);
  });

  test('a script with nothing but the block draws one empty line, for the cursor', () => {
    const marked = `${BLOCK}\n`;
    expect(hiddenFrom(play(`|${marked}`))).toEqual([{ from: 0, to: marked.length, block: false }]);
    expect(drawn(play(`|${marked}`))).toEqual(['']);
  });

  test('follows the text', () => {
    const next = type(play(`|${BLOCK}\n`), 'x');
    expect(drawn(next)).toEqual(['x', '']);
  });
});

test('with Classic Mode off, Select All then Delete removes the block', () => {
  const state = EditorState.create({
    doc: SCRIPT,
    extensions: [fountain({ template: () => STAGE })],
  });
  const chosen = command(state, selectAll);
  const { from, to } = chosen.selection.main;
  expect(to - from).toBe(SCRIPT.length);
  expect(chosen.update({ changes: { from, to }, userEvent: 'delete' }).state.sliceDoc()).toBe('');
});
