import { parse, type TextChange } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import {
  deleteEntry,
  insertNote,
  type NoteEntry,
  noteEntries,
  resolveAll,
  rewriteNote,
  setResolved,
  setTags,
} from '../src';

/** `source` with `changes` made (non-overlapping, any order). */
function apply(source: string, changes: readonly TextChange[]): string {
  let out = source;
  for (const change of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, change.from) + change.insert + out.slice(change.to);
  }
  return out;
}

/** The entry whose text is `text`. */
function entryOf(
  source: string,
  text: string,
): { doc: ReturnType<typeof parse>; entry: NoteEntry } {
  const doc = parse(source);
  const entry = noteEntries(doc).find((e) => e.text === text);
  if (!entry) throw new Error(`no entry ${text}`);
  return { doc, entry };
}

/** What each block prints: its kind and its lines' printable text. */
const printed = (source: string) =>
  parse(source).blocks.map((b) => [
    b.kind,
    b.lines.filter((l) => !l.transparent).map((l) => l.inline.map((r) => r.text).join('')),
  ]);

describe('status and tags', () => {
  test('resolves and reopens in one change, touching only the tag', () => {
    const source = 'Tom sits. [[TODO:  check the  dates #continuity]] Then he stands.\n';
    const { doc, entry } = entryOf(source, 'TODO:  check the  dates #continuity');
    const resolve = setResolved(doc, entry, true);
    expect(resolve).toHaveLength(1);
    expect(resolve[0]?.from).toBe(resolve[0]?.to);
    const resolved = apply(source, resolve);
    expect(resolved).toBe(
      'Tom sits. [[TODO:  check the  dates #continuity #resolved]] Then he stands.\n',
    );
    expect(setResolved(doc, entry, false)).toEqual([]);

    const again = entryOf(resolved, 'TODO:  check the  dates #continuity #resolved');
    expect(setResolved(again.doc, again.entry, true)).toEqual([]);
    const reopen = setResolved(again.doc, again.entry, false);
    expect(reopen).toHaveLength(1);
    expect(apply(resolved, reopen)).toBe(source);
  });

  test('reopening removes every #resolved, in any case', () => {
    const source = '[[Sam: #Resolved Done. #resolved]]\n';
    const { doc, entry } = entryOf(source, 'Sam: #Resolved Done. #resolved');
    expect(apply(source, setResolved(doc, entry, false))).toBe('[[Sam: Done.]]\n');
  });

  test('leaves a scene field or a mark without a status', () => {
    const source = '[[Goal: Win.]] [[Setup: the letter]]\n';
    for (const text of ['Goal: Win.', 'Setup: the letter']) {
      const { doc, entry } = entryOf(source, text);
      expect(setResolved(doc, entry, true)).toEqual([]);
      expect(setTags(doc, entry, ['story'])).toEqual([]);
    }
  });

  test('adds and removes a tag, keeping the rest exactly', () => {
    const source = '[[Ann:  Cut  #Pacing this #story line. #resolved]]\n';
    const { doc, entry } = entryOf(source, 'Ann:  Cut  #Pacing this #story line. #resolved');
    const changes = setTags(doc, entry, ['pacing', 'Character', 'question']);
    expect(apply(source, changes)).toBe(
      '[[Ann:  Cut  #Pacing this line. #resolved #character #question]]\n',
    );
    expect(setTags(doc, entry, ['story', 'pacing'])).toEqual([]);
    expect(() => setTags(doc, entry, ['two words'])).toThrow(RangeError);
  });

  test('rewrites a note in the exact form', () => {
    const source = 'Tom sits. [[ sam :  old  words ]]\n';
    const { doc, entry } = entryOf(source, ' sam :  old  words ');
    expect(apply(source, rewriteNote(doc, entry, 'Sam', 'New\nwords]'))).toBe(
      'Tom sits. [[Sam: New / words] ]]\n',
    );
    expect(apply(source, rewriteNote(doc, entry, null, 'TODO: plain'))).toBe(
      'Tom sits. [[TODO: plain]]\n',
    );
    const exact = entryOf('[[Sam: x]]\n', 'Sam: x');
    expect(rewriteNote(exact.doc, exact.entry, 'Sam', 'x')).toEqual([]);
  });
});

describe('deleting', () => {
  test('deletes a note alone on its line, and the line', () => {
    const source = 'Tom sits.\n[[Sam: Why?]]\nHe stands.\n\n[[TODO: dates]]\n\nINT. HALL - DAY\n';
    const one = entryOf(source, 'Sam: Why?');
    expect(apply(source, deleteEntry(one.doc, one.entry))).toBe(
      'Tom sits.\nHe stands.\n\n[[TODO: dates]]\n\nINT. HALL - DAY\n',
    );
    const two = entryOf(source, 'TODO: dates');
    expect(apply(source, deleteEntry(two.doc, two.entry))).toBe(
      'Tom sits.\n[[Sam: Why?]]\nHe stands.\n\nINT. HALL - DAY\n',
    );
  });

  test('deletes a boneyard over several lines, and its lines', () => {
    const source = 'Tom sits.\n\n/* gone\n\nfor good */\n\nHe stands.\n';
    const { doc, entry } = entryOf(source, ' gone\n\nfor good ');
    expect(apply(source, deleteEntry(doc, entry))).toBe('Tom sits.\n\nHe stands.\n');
  });

  test('deleting an inline note leaves the line printing as it did', () => {
    const source = 'Tom sits [[Ann: really?]] by the door.\n\nCUT TO:[[x]]\n\nINT. HALL - DAY\n';
    for (const text of ['Ann: really?', 'x']) {
      const { doc, entry } = entryOf(source, text);
      expect(entry.alone).toBe(false);
      const after = apply(source, deleteEntry(doc, entry));
      expect(after.length).toBe(source.length - text.length - 4);
      expect(printed(after)).toEqual(printed(source));
    }
  });

  test('refuses to delete where a two-space line would join its neighbours', () => {
    const source = 'SAM\nHello.\n  \n[[gone]]\n\nThere.\n';
    const { doc, entry } = entryOf(source, 'gone');
    expect(deleteEntry(doc, entry)).toEqual([]);
  });

  test('resolve all changes only open notes', () => {
    const source = [
      '[[one]] [[two #resolved]] /* bone */',
      '[[Goal: Win.]] [[Setup: the letter]] [[Ann: three]]',
      '',
    ].join('\n');
    const doc = parse(source);
    const changes = resolveAll(doc, noteEntries(doc));
    expect(changes).toHaveLength(2);
    expect(changes[0]?.from).toBeLessThan(changes[1]?.from as number);
    expect(apply(source, changes)).toBe(
      [
        '[[one #resolved]] [[two #resolved]] /* bone */',
        '[[Goal: Win.]] [[Setup: the letter]] [[Ann: three #resolved]]',
        '',
      ].join('\n'),
    );
  });
});

describe('insertNote', () => {
  test("inserts a note at the end of the cursor's line", () => {
    const source = 'INT. KITCHEN - NIGHT\n\nTom sits.\nHe waits.\n';
    const at = source.indexOf('sits');
    const { changes, cursor } = insertNote(parse(source), at, '[[TODO: x]]');
    const after = apply(source, changes);
    expect(after).toBe('INT. KITCHEN - NIGHT\n\nTom sits. [[TODO: x]]\nHe waits.\n');
    expect(after.slice(cursor, cursor + 2)).toBe(']]');
    expect(after.slice(0, cursor).endsWith('x')).toBe(true);
    expect(printed(after)).toEqual(printed(source));
  });

  test('keeps a transition a transition', () => {
    const source = 'Tom sits.\n\nCUT TO:\n\nINT. HALL - DAY\n';
    const { changes } = insertNote(parse(source), source.indexOf('CUT'), '[[x]]');
    const after = apply(source, changes);
    expect(after).toBe('Tom sits.\n\nCUT TO:[[x]]\n\nINT. HALL - DAY\n');
    expect(printed(after)).toEqual(printed(source));
  });

  test('goes after a note or boneyard the line ends inside', () => {
    const source = 'Tom sits. [[a\nlong note]] He waits.\n';
    const { changes } = insertNote(parse(source), 2, '[[x]]');
    expect(apply(source, changes)).toBe('Tom sits. [[a\nlong note]] He waits. [[x]]\n');
  });

  test('inserts on a blank line at the end of the line above', () => {
    const source = 'Tom sits.\n\n\nHe waits.\n';
    const { changes, cursor } = insertNote(parse(source), source.indexOf('\n\nHe'), '[[x]]');
    const after = apply(source, changes);
    expect(after).toBe('Tom sits. [[x]]\n\n\nHe waits.\n');
    expect(cursor).toBe(after.indexOf('x]]') + 1);
  });

  test('at the very start, inserts on its own line before a blank line', () => {
    const source = '\nTom sits.\n';
    const { changes, cursor } = insertNote(parse(source), 0, '[[x]]');
    const after = apply(source, changes);
    expect(after).toBe('[[x]]\n\nTom sits.\n');
    expect(cursor).toBe(3);
    expect(printed(after).slice(1)).toEqual(printed(source));
    expect(apply('', insertNote(parse(''), 0, '[[x]]').changes)).toBe('[[x]]\n');
  });

  test('inserts nothing in the metadata block', () => {
    const source = 'Tom sits.\n\n/* drafter\n{"v":1}\n*/\n';
    expect(insertNote(parse(source), source.indexOf('{'), '[[x]]').changes).toEqual([]);
  });
});

describe('line breaks and the stray-boneyard gate', () => {
  test('keeps CRLF line breaks', () => {
    const source = 'Tom sits.\r\n[[gone]]\r\nHe waits.\r\n\r\nINT. HALL - DAY\r\n';
    const { doc, entry } = entryOf(source, 'gone');
    expect(apply(source, deleteEntry(doc, entry))).toBe(
      'Tom sits.\r\nHe waits.\r\n\r\nINT. HALL - DAY\r\n',
    );
    const inserted = apply(source, insertNote(doc, 2, '[[x]]').changes);
    expect(inserted).toBe('Tom sits. [[x]]\r\n[[gone]]\r\nHe waits.\r\n\r\nINT. HALL - DAY\r\n');
    const start = '\r\nTom.\r\n';
    expect(apply(start, insertNote(parse(start), 0, '[[x]]').changes)).toBe(
      '[[x]]\r\n\r\nTom.\r\n',
    );
  });

  test('changes nothing while a /* is stray', () => {
    const source = 'Tom sits. [[Ann: why?]]\n\n/* open\n';
    const doc = parse(source);
    const entry = noteEntries(doc)[0] as NoteEntry;
    expect(setResolved(doc, entry, true)).toEqual([]);
    expect(setTags(doc, entry, ['story'])).toEqual([]);
    expect(rewriteNote(doc, entry, null, 'x')).toEqual([]);
    expect(deleteEntry(doc, entry)).toEqual([]);
    expect(resolveAll(doc, [entry])).toEqual([]);
    expect(insertNote(doc, 0, '[[x]]')).toEqual({ changes: [], cursor: 0 });
  });
});
