import { parse } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import { findEntry, nestReplies, noteEntries } from '../src';

const SCRIPT = [
  'INT. KITCHEN - NIGHT',
  '',
  'Margaret dries a cup. [[TODO: which cup?]]',
  '[[Sam: Slow this down. #pacing]]',
  '',
  '/* an older opening',
  '',
  'she was on the phone */',
  '',
  'Tom waits /* at the door */ by the hook.',
  '',
].join('\n');

describe('noteEntries', () => {
  test('lists notes and boneyards in source order with their blocks', () => {
    const doc = parse(SCRIPT);
    const entries = noteEntries(doc);
    expect(entries.map((e) => [e.kind, e.text])).toEqual([
      ['note', 'TODO: which cup?'],
      ['note', 'Sam: Slow this down. #pacing'],
      ['boneyard', ' an older opening\n\nshe was on the phone '],
      ['boneyard', ' at the door '],
    ]);
    for (const entry of entries) {
      const block = doc.blocks[entry.block];
      expect(block?.span.from).toBeLessThanOrEqual(entry.span.from);
      expect(block?.span.to).toBeGreaterThanOrEqual(entry.span.to);
      const open = entry.kind === 'note' ? '[[' : '/*';
      expect(SCRIPT.slice(entry.span.from, entry.span.to)).toBe(
        `${open}${entry.text}${entry.kind === 'note' ? ']]' : '*/'}`,
      );
    }
    expect(entries[0]?.note?.head).toEqual({ kind: 'category', name: 'todo' });
    expect(entries[1]?.note?.tags).toEqual(['pacing']);
    expect(entries[2]?.note).toBeNull();
  });

  test('leaves out the metadata block and the Beat Board block', () => {
    const source = [
      'Tom sits. [[mine]]',
      '',
      '/* beat board',
      '[[Card: 1]]',
      '*/',
      '',
      '/* drafter',
      '{"v":1}',
      '*/',
      '',
    ].join('\n');
    expect(noteEntries(parse(source)).map((e) => e.text)).toEqual(['mine']);
  });

  test('leaves out an unclosed boneyard', () => {
    expect(noteEntries(parse('Tom sits.\n\n/* never closed\n'))).toEqual([]);
  });

  test('marks a note alone on its line', () => {
    const entries = noteEntries(parse(SCRIPT));
    expect(entries.map((e) => e.alone)).toEqual([false, true, true, false]);
    const crlf = noteEntries(parse('Tom sits.\r\n  [[alone]]  \r\n'));
    expect(crlf[0]?.alone).toBe(true);
    expect(noteEntries(parse('[[a]] [[b]]\n')).map((e) => e.alone)).toEqual([false, false]);
  });
});

describe('findEntry', () => {
  test('findEntry finds a note after text is typed above it', () => {
    const before = noteEntries(parse(SCRIPT));
    const was = before[1] as (typeof before)[number];
    const typed = `FADE IN:\n\n${SCRIPT}`;
    const found = findEntry(noteEntries(parse(typed)), was);
    expect(found?.text).toBe(was.text);
    expect(found?.span.from).toBe(was.span.from + 10);
  });

  test('picks the nearest of two notes with the same text', () => {
    const source = 'A. [[same]]\n\nB. [[same]]\n';
    const entries = noteEntries(parse(source));
    const second = entries[1] as (typeof entries)[number];
    expect(findEntry(entries, { span: second.span, text: 'same' })).toBe(second);
    expect(findEntry(entries, { span: { from: 0, to: 8 }, text: 'same' })).toBe(entries[0]);
  });

  test('findEntry returns null for a note that changed', () => {
    const before = noteEntries(parse(SCRIPT));
    const changed = SCRIPT.replace('Slow this down.', 'Speed this up.');
    expect(findEntry(noteEntries(parse(changed)), before[1] as (typeof before)[number])).toBe(null);
  });

  test('findEntry takes no far-away twin of a note that is gone', () => {
    const filler = 'Tom waits by the door.\n\n'.repeat(40);
    const source = `A. [[same]]\n\n${filler}B. [[same]]\n`;
    const was = noteEntries(parse(source))[0] as NonNullable<ReturnType<typeof findEntry>>;
    const gone = source.replace('A. [[same]]', 'A.');
    const entries = noteEntries(parse(gone));
    expect(findEntry(entries, was)).toBeNull();
    // Told how much the script grew or shrank since, it reaches that much further.
    const moved = `${filler}${source}`;
    expect(findEntry(noteEntries(parse(moved)), was)).toBeNull();
    expect(findEntry(noteEntries(parse(moved)), was, filler.length)?.span.from).toBe(
      was.span.from + filler.length,
    );
  });
});

describe('nestReplies', () => {
  test("nests a reply under the person's earlier note", () => {
    const source = [
      'Tom sits. [[Ann: Why here?]]',
      '',
      'He stands. [[Sam: Too long.]]',
      '',
      'He leaves. [[Ann re Sam: Agreed.]] [[Sam re Ann: Thanks.]]',
      '',
      '[[Ann re Cy: Nobody to answer.]]',
      '',
    ].join('\n');
    const nested = nestReplies(noteEntries(parse(source)));
    expect(nested.map((n) => [n.entry.text, n.replies.map((r) => r.text)])).toEqual([
      ['Ann: Why here?', []],
      ['Sam: Too long.', ['Ann re Sam: Agreed.', 'Sam re Ann: Thanks.']],
      ['Ann re Cy: Nobody to answer.', []],
    ]);
  });
});
