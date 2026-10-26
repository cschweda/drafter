import { parse } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import { fakeContext, SAMPLE } from '../fake-context';
import notes from './index';

const removeAll = (ctx: ReturnType<typeof fakeContext>) => {
  const command = notes.commands?.(ctx).find((c) => c.id === 'remove-all');
  if (!command) throw new Error('Notes has no remove command');
  return command;
};
const lineOf = (text: string, offset: number) => text.slice(0, offset).split('\n').length;

describe('Notes', () => {
  test('is a button and one command, with no tab, and asks for nothing', () => {
    expect(notes.action?.label).toBe('Notes');
    expect(notes.tab).toBeUndefined();
    expect(notes.permissions).toEqual({});
    expect(notes.commands?.(fakeContext()).map((c) => c.title)).toEqual([
      'Notes: remove all notes',
    ]);
  });

  test('reports one info item per note, at the right lines', () => {
    const ctx = fakeContext();
    notes.action?.run(ctx);
    const items = ctx.calls.problems.at(-1) ?? [];
    // The sample has ten notes and a boneyard; the boneyard is not a note.
    expect(items).toHaveLength(10);
    expect(items.every((p) => p.severity === 'info')).toBe(true);
    expect(items.map((p) => lineOf(ctx.text, p.from))).toEqual([
      9, 15, 19, 28, 34, 43, 60, 70, 81, 97,
    ]);
    // Each item covers exactly its note.
    for (const p of items) {
      expect(ctx.text.slice(p.from, p.from + 2)).toBe('[[');
      expect(ctx.text.slice(p.to - 2, p.to)).toBe(']]');
    }
    expect(items[2]?.message).toBe(
      'A scene heading starts with INT. or EXT. and usually ends with the time of day.',
    );
    expect(ctx.calls.notices).toEqual(['10 notes are listed in Problems.']);
  });

  test('shortens a long note and describes an empty one', () => {
    const long = 'word '.repeat(60).trim();
    const ctx = fakeContext({
      source: `INT. A - DAY\n\n[[${long}]]\n\n[[   ]]\n\n[[two\nlines]]\n`,
    });
    notes.action?.run(ctx);
    const messages = (ctx.calls.problems.at(-1) ?? []).map((p) => p.message);
    expect(messages[0]?.length).toBeLessThanOrEqual(120);
    expect(messages[0]?.endsWith('…')).toBe(true);
    expect(messages[1]).toBe('(empty note)');
    expect(messages[2]).toBe('two lines');
  });

  test('clears its items and says so when there are no notes', () => {
    const ctx = fakeContext({ source: 'INT. A - DAY\n\nQuiet.\n' });
    notes.action?.run(ctx);
    expect(ctx.calls.problems).toEqual([[]]);
    expect(ctx.calls.notices).toEqual(['There are no notes in this script.']);
  });

  test('finds no notes in a Markdown document', () => {
    const ctx = fakeContext({ kind: 'markdown', source: '# A\n\n[[a wiki link]]\n' });
    notes.action?.run(ctx);
    expect(ctx.calls.problems).toEqual([[]]);
    expect(ctx.calls.notices).toEqual(['Not available for Markdown documents.']);
    expect(removeAll(ctx).enabled?.()).toBe(false);
  });

  test('asks first, saying how many, and removes all notes as one change', async () => {
    const ctx = fakeContext();
    await removeAll(ctx).run();
    expect(ctx.calls.confirms).toEqual([
      {
        message: 'Remove 10 notes from this script? You can undo it with Undo.',
        options: { confirmLabel: 'Remove notes' },
      },
    ]);
    // One call to applyChanges, so one step of undo.
    expect(ctx.calls.changes).toHaveLength(1);
    expect(ctx.text).not.toContain('[[');
    const after = parse(ctx.text);
    expect(after.regions.filter((r) => r.kind === 'note')).toEqual([]);
    expect(ctx.calls.problems.at(-1)).toEqual([]);
    expect(ctx.calls.notices).toEqual(['Removed 10 notes. Undo brings them back.']);
  });

  test('leaves the rest of the script as it was, with no new blank lines', async () => {
    const ctx = fakeContext();
    await removeAll(ctx).run();
    const before = parse(SAMPLE).blocks.filter((b) => b.kind !== 'note');
    const after = parse(ctx.text).blocks;
    expect(after.map((b) => [b.kind, b.lines.map((l) => l.raw)])).toEqual(
      before.map((b) => [b.kind, b.lines.map((l) => l.raw)]),
    );
    expect(ctx.text).not.toMatch(/\n\n\n/);
  });

  test.each([
    ['a note alone between paragraphs', 'A\n\n[[n]]\n\nB\n', 'A\n\nB\n'],
    ['a note on the line after text', 'A\n[[n]]\nB\n', 'A\nB\n'],
    ['a note at the start of the script', '[[n]]\n\nA\n', 'A\n'],
    ['a note at the end of the script', 'A\n\n[[n]]\n', 'A\n\n'],
    ['two notes on lines of their own, side by side', 'A\n\n[[a]]\n[[b]]\n\nB\n', 'A\n\nB\n'],
    ['two notes apart', 'A\n\n[[a]]\n\n[[b]]\n\nB\n', 'A\n\nB\n'],
    ['a note after text', 'A [[n]]\n', 'A\n'],
    ['a note before text', '[[n]] A\n', 'A\n'],
    ['a note inside a sentence', 'A [[n]] B\n', 'A B\n'],
    ['a note against the words', 'A[[n]]B\n', 'AB\n'],
    ['two notes on one line', 'A [[a]] [[b]]\n', 'A\n'],
    [
      'a note after text, and one at the start of the next paragraph',
      'x [[a]]\n\n[[b]] y\n',
      'x\n\ny\n',
    ],
    ['text on both sides of two notes on neighbouring lines', 'A [[a]]\n[[b]] B\n', 'A\nB\n'],
    ['a note across two lines', 'A\n\n[[one\ntwo]]\n\nB\n', 'A\n\nB\n'],
  ])('removes %s', async (_name, source, expected) => {
    const ctx = fakeContext({ source });
    await removeAll(ctx).run();
    expect(ctx.text).toBe(expected);
  });

  test('says 1 note, in the singular', async () => {
    const ctx = fakeContext({ source: 'A\n\n[[n]]\n' });
    await removeAll(ctx).run();
    expect(ctx.calls.confirms[0]?.message).toBe(
      'Remove 1 note from this script? You can undo it with Undo.',
    );
    expect(ctx.calls.notices).toEqual(['Removed 1 note. Undo brings it back.']);
  });

  test('changes nothing when the writer says no', async () => {
    const ctx = fakeContext({ confirm: false });
    await removeAll(ctx).run();
    expect(ctx.calls.confirms).toHaveLength(1);
    expect(ctx.calls.changes).toEqual([]);
    expect(ctx.text).toBe(SAMPLE);
    expect(ctx.calls.notices).toEqual([]);
  });

  test('says so, and asks nothing, when there are no notes to remove', async () => {
    const ctx = fakeContext({ source: 'A\n' });
    await removeAll(ctx).run();
    expect(ctx.calls.confirms).toEqual([]);
    expect(ctx.calls.changes).toEqual([]);
    expect(ctx.calls.notices).toEqual(['There are no notes to remove.']);
  });

  test('says so when the run is stale and nothing could be removed', async () => {
    const ctx = fakeContext({ stale: true });
    await removeAll(ctx).run();
    expect(ctx.text).toBe(SAMPLE);
    expect(ctx.calls.notices).toEqual([
      'The notes weren’t removed: the script changed, or can’t be edited right now.',
    ]);
  });
});
