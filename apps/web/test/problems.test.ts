import { Text } from '@codemirror/state';
import { describe, expect, test, vi } from 'vitest';
import { mergeFixes, occurrenceKeys, oncePerFrame } from '../app/editor/problems';
import { mayHaveOrphans, orphanCount, orphanMessage } from '../app/novel/orphans';

const change = (from: number, to: number, insert = '') => ({ from, to, insert });

describe('mergeFixes', () => {
  test('sorts changes and skips overlapping fixes', () => {
    const merged = mergeFixes([
      { changes: [change(20, 25), change(30, 31, ' ')] },
      { changes: [change(2, 4)] },
      // Overlaps the first fix's second change: left out whole, its other change with it.
      { changes: [change(5, 5, '\n'), change(28, 32)] },
      // Inside the first fix's first change.
      { changes: [change(21, 21, 'x')] },
      { changes: [change(40, 40, '\n')] },
    ]);
    expect(merged).toEqual([
      change(2, 4),
      change(20, 25),
      change(30, 31, ' '),
      change(40, 40, '\n'),
    ]);
  });

  test('keeps fixes that only touch', () => {
    const merged = mergeFixes([
      { changes: [change(10, 15)] },
      { changes: [change(15, 15, '\n')] },
      { changes: [change(15, 18, '-')] },
      { changes: [change(5, 10)] },
    ]);
    expect(merged).toEqual([
      change(5, 10),
      change(10, 15),
      change(15, 15, '\n'),
      change(15, 18, '-'),
    ]);
  });

  test('is empty for no fixes', () => {
    expect(mergeFixes([])).toEqual([]);
    expect(mergeFixes([{ changes: [] }])).toEqual([]);
  });
});

describe('occurrenceKeys', () => {
  test('names a problem by its rule and how many of the rule came before it', () => {
    expect(occurrenceKeys(['a', 'b', 'a', 'a', 'b'])).toEqual(['a:0', 'b:0', 'a:1', 'a:2', 'b:1']);
  });

  test('gives two problems of one rule at one place two keys, and keeps a key when text moves', () => {
    const keys = occurrenceKeys(['heading-no-time', 'heading-no-time']);
    expect(new Set(keys).size).toBe(2);
    // Positions aren't part of a key, so an edit above doesn't make a new one.
    expect(occurrenceKeys(['heading-no-time', 'heading-no-time'])).toEqual(keys);
  });
});

describe('oncePerFrame', () => {
  test('runs a burst of calls once, with the last arguments, on the next frame', () => {
    let frame: (() => void) | undefined;
    const schedule = vi.fn((run: () => void) => {
      frame = run;
    });
    const seen: number[] = [];
    const read = oncePerFrame((n: number) => seen.push(n), schedule);
    read(1);
    read(2);
    read(3);
    expect(seen).toEqual([]);
    expect(schedule).toHaveBeenCalledTimes(1);
    frame?.();
    expect(seen).toEqual([3]);
    // The next burst gets a frame of its own.
    read(4);
    expect(schedule).toHaveBeenCalledTimes(2);
    frame?.();
    expect(seen).toEqual([3, 4]);
  });
});

describe('a novel’s orphaned notes', () => {
  const comment = (nodes: object) =>
    `<!-- drafter ${JSON.stringify({ template: 'novel', novel: { nodes } })} -->\n`;
  const doc = (text: string) => Text.of(text.split('\n'));

  test('says it plainly, in the singular and the plural, and not at all for none', () => {
    expect(orphanMessage(0)).toBeNull();
    expect(orphanMessage(1)).toBe("1 passage's notes no longer match a chapter or section.");
    expect(orphanMessage(3)).toBe("3 passages' notes no longer match a chapter or section.");
  });

  test('counts the notes whose heading is gone', () => {
    const text = `# One\n\nWords.\n\n${comment({
      'chapter:one:0': { status: 'draft' },
      'chapter:gone:0': { status: 'done' },
    })}`;
    expect(orphanCount(doc(text))).toBe(1);
  });

  test('reads nothing in a book without notes, or a document that is not a novel', () => {
    const none = `# One\n\n<!-- drafter {"template":"novel"} -->\n`;
    expect(mayHaveOrphans(doc(none))).toBe(false);
    const plain = `# One\n\n<!-- drafter ${JSON.stringify({ novel: { nodes: { a: { status: 'done' } } } })} -->\n`;
    expect(mayHaveOrphans(doc(plain))).toBe(false);
    expect(orphanCount(doc(plain))).toBe(0);
    expect(orphanCount(doc('A screenplay line.\n'))).toBe(0);
  });

  test('hostile notes are never an error', () => {
    const text = `# One\n\n<!-- drafter {"template":"novel","novel":{"nodes":{"__proto__":{"status":"done"},"x":7}}} -->\n`;
    expect(() => orphanCount(doc(text))).not.toThrow();
  });
});
