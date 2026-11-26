import { parse, type TextChange } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import {
  removeThread,
  renameThread,
  SCENE_COLORS,
  setSceneDetails,
  setSceneThreads,
  threadInfo,
} from '../src';
import { apply, indexOf, sceneAt } from './helpers';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

/** A script of scenes, each with these note lines under its heading, and an optional meta block. */
const script = (scenes: string[], meta?: string) =>
  `${scenes.map((n, i) => `INT. ROOM ${i + 1} - DAY\n\n${n}Action ${i + 1}.\n\n`).join('')}${meta ? `/* drafter\n${meta}\n*/\n` : ''}`;
const note = (labels: string) => (labels === '' ? '' : `[[Thread: ${labels}]]\n`);
const threadsOf = (source: string) => indexOf(source).index.scenes.map((s) => s.threads);

/** Changes in the text's offsets, as CodeMirror takes them: sorted, apart, ties in listed order. */
function cm(source: string, changes: readonly TextChange[]): string {
  const sorted = [...changes].sort((a, b) => a.from - b.from);
  for (let i = 1; i < sorted.length; i++) {
    expect((sorted[i] as TextChange).from).toBeGreaterThanOrEqual((sorted[i - 1] as TextChange).to);
  }
  return changes.reduceRight((out, c) => out.slice(0, c.from) + c.insert + out.slice(c.to), source);
}
const meta = (source: string) => parse(source).meta?.threads;

describe('threadInfo', () => {
  test('an unchosen color is shown, never written; chosen ones are skipped', () => {
    const source = script([note('A'), note('B')], '{"v":1,"threads":{"a":{"color":"orange"}}}');
    const { doc, index } = indexOf(source);
    expect(threadInfo(doc, index).map((t) => [t.label, t.color, t.chosen])).toEqual([
      ['A', 'orange', true],
      ['B', 'red', false],
    ]);
  });

  test('by first appearance with units, then named-but-unused', () => {
    const source = script(
      [note('B, A'), note('a'), note('C')],
      '{"v":1,"threads":{"zed":{"name":"Never used"},"c":{"name":"Cee"}}}',
    );
    const { doc, index } = indexOf(source);
    const info = threadInfo(doc, index);
    expect(info.map((t) => [t.key, t.label, t.name, t.units])).toEqual([
      ['b', 'B', null, 1],
      ['a', 'A', null, 2],
      ['c', 'C', 'Cee', 1],
      ['zed', 'zed', 'Never used', 0],
    ]);
    expect(info.map((t) => t.color)).toEqual(SCENE_COLORS.slice(0, 4));
  });

  test('colors wrap when more than nine threads are in use', () => {
    const labels = Array.from({ length: 11 }, (_, i) => `T${i}`);
    const { doc, index } = indexOf(script([note(labels.join(', '))]));
    const colors = threadInfo(doc, index).map((t) => t.color);
    expect(colors[9]).toBe(SCENE_COLORS[0]);
    expect(colors[10]).toBe(SCENE_COLORS[1]);
  });
});

describe('setSceneThreads', () => {
  test('writes one note, removes it when empty, one change set', () => {
    const source = script(['', '']);
    const { doc, index } = indexOf(source);
    const first = index.scenes[0];
    if (!first) throw new Error('no scene');
    const out = cm(source, setSceneThreads(doc, first, ['A', ' b ', 'a']));
    expect(out).toContain('INT. ROOM 1 - DAY\n\n[[Thread: A, b]]\n\nAction 1.');
    expect(threadsOf(out)).toEqual([['A', 'b'], []]);
    const again = indexOf(out);
    const cleared = cm(out, setSceneThreads(again.doc, sceneAt(again.index, 0), []));
    expect(cleared).toBe(source);
    expect(setSceneThreads(again.doc, sceneAt(again.index, 0), ['A', 'b'])).toEqual([]);
  });

  test('turns Storyline notes in the header into the one Thread note', () => {
    const source = script(['[[Storyline: A]]\n[[Thread: B]]\n']);
    const { doc, index } = indexOf(source);
    const out = cm(source, setSceneThreads(doc, sceneAt(index, 0), ['B', 'C']));
    expect(out).toBe(script(['[[Thread: B, C]]\n']));
  });

  test('refuses labels with , [[ ]] or a line break, and over 40 or 12', () => {
    const { doc, index } = indexOf(script(['']));
    const s = sceneAt(index, 0);
    for (const bad of ['a,b', 'a[[b', 'a]]b', 'a\nb', '', 'x'.repeat(41)]) {
      expect(() => setSceneThreads(doc, s, [bad])).toThrow(RangeError);
    }
    const thirteen = Array.from({ length: 13 }, (_, i) => `T${i}`);
    expect(() => setSceneThreads(doc, s, thirteen)).toThrow(RangeError);
    expect(setSceneThreads(doc, s, thirteen.slice(0, 12))).toHaveLength(1);
  });

  test('changes nothing while a /* is stray', () => {
    const { doc, index } = indexOf('INT. A - DAY\n\nAction.\n\n/* open\n');
    expect(setSceneThreads(doc, sceneAt(index, 0), ['A'])).toEqual([]);
  });

  test('__proto__ is an ordinary thread', () => {
    const source = script(['']);
    const { doc, index } = indexOf(source);
    const out = cm(source, setSceneThreads(doc, sceneAt(index, 0), ['__proto__']));
    const next = indexOf(out);
    expect(next.index.scenes[0]?.threads).toEqual(['__proto__']);
    expect(threadInfo(next.doc, next.index).map((t) => t.label)).toEqual(['__proto__']);
    expect(({} as Record<string, unknown>).units).toBeUndefined();
  });
});

describe('renameThread', () => {
  const body = script(
    ['[[Thread: A, X]]\n', '[[Storyline: a]]\n', ''],
    '{"v":1,"threads":{"a":{"name":"The heist","color":"yellow"},"x":{"color":"blue"}}}',
  );

  test('rewrites every note and moves the meta; A to a is a rename, not a merge', () => {
    const { doc, index } = indexOf(body);
    const r = renameThread(doc, index, 'A', 'a');
    expect(r).toMatchObject({ scenes: 2, merged: false });
    const out = cm(body, r.changes);
    expect(threadsOf(out)).toEqual([['a', 'X'], ['a'], []]);
    expect(meta(out)).toEqual(meta(body));
  });

  test('to a new label moves the name and color, once', () => {
    const { doc, index } = indexOf(body);
    const r = renameThread(doc, index, 'A', 'Heist');
    expect(r).toMatchObject({ scenes: 2, merged: false });
    const out = cm(body, r.changes);
    expect(threadsOf(out)).toEqual([['Heist', 'X'], ['Heist'], []]);
    expect(meta(out)).toEqual({
      heist: { name: 'The heist', color: 'yellow' },
      x: { color: 'blue' },
    });
  });

  test('onto an existing label merges, once each per scene, keeping the target’s meta', () => {
    const source = script(
      ['[[Thread: A, B]]\n', '[[Thread: A]]\n'],
      '{"v":1,"threads":{"a":{"color":"red"},"b":{"name":"Bee"}}}',
    );
    const { doc, index } = indexOf(source);
    const r = renameThread(doc, index, 'A', 'B');
    expect(r).toMatchObject({ scenes: 2, merged: true });
    const out = cm(source, r.changes);
    expect(out).toMatch(/\[\[Thread: B\]\][\s\S]*\[\[Thread: B\]\]/);
    expect(threadsOf(out)).toEqual([['B'], ['B']]);
    expect(meta(out)).toEqual({ b: { name: 'Bee' } });
  });

  test('onto a label that is only named is a merge too', () => {
    const source = script(['[[Thread: A]]\n'], '{"v":1,"threads":{"b":{"name":"Bee"}}}');
    const { doc, index } = indexOf(source);
    expect(renameThread(doc, index, 'a', 'b').merged).toBe(true);
  });

  test('a thread with only a name is renamed in the settings', () => {
    const source = script([''], '{"v":1,"threads":{"a":{"name":"Ay"}}}');
    const { doc, index } = indexOf(source);
    const r = renameThread(doc, index, 'a', 'B');
    expect(r.scenes).toBe(0);
    expect(meta(cm(source, r.changes))).toEqual({ b: { name: 'Ay' } });
  });

  test('refuses a label that is not one; nothing for a stray /*', () => {
    const { doc, index } = indexOf(body);
    expect(() => renameThread(doc, index, 'A', 'a,b')).toThrow(RangeError);
    const stray = indexOf('INT. A - DAY\n\n[[Thread: A]]\n\n/* open\n');
    expect(renameThread(stray.doc, stray.index, 'A', 'B').changes).toEqual([]);
  });

  test('with no meta block and a last scene that has no line break, everything still applies', () => {
    const source = 'INT. A - DAY\n\nAction.\n\nINT. B - DAY';
    const { doc, index } = indexOf(source);
    const tagged = cm(source, setSceneThreads(doc, sceneAt(index, 1), ['A']));
    const next = indexOf(tagged);
    const named = cm(tagged, [...renameThread(next.doc, next.index, 'A', 'B').changes]);
    expect(threadsOf(named)).toEqual([[], ['B']]);
  });
});

describe('merge, half-done edits, and labels already in a script', () => {
  test('a merge drops the source meta even when the target has none', () => {
    const source = script(
      ['[[Thread: A]]\n', '[[Thread: B]]\n'],
      '{"v":1,"threads":{"a":{"name":"Ay","color":"red"}}}',
    );
    const { doc, index } = indexOf(source);
    const r = renameThread(doc, index, 'A', 'B');
    expect(r).toMatchObject({ scenes: 1, merged: true });
    const out = cm(source, r.changes);
    expect(threadsOf(out)).toEqual([['B'], ['B']]);
    expect(meta(out)).toBeUndefined();
  });

  // A stray two-space line between two Thread notes: the first can't be taken out safely.
  const stuck = 'INT. A - DAY\n\nOne.\n[[Thread: A]]\n  \n[[Thread: A]]\n';
  const withMeta = `INT. B - DAY\n\n[[Thread: A]]\n\n${stuck}\n/* drafter\n{"v":1,"threads":{"a":{"name":"Ay"}}}\n*/\n`;

  test('remove is all or nothing', () => {
    const { doc, index } = indexOf(withMeta);
    expect(index.scenes[1]?.threads).toEqual(['A']);
    expect(removeThread(doc, index, 'A')).toEqual({ changes: [], scenes: 0 });
  });

  test('rename is all or nothing, meta included', () => {
    const { doc, index } = indexOf(withMeta);
    expect(renameThread(doc, index, 'A', 'Z')).toEqual({ changes: [], scenes: 0, merged: false });
  });

  test('renaming one thread leaves another scene label of any length alone', () => {
    const long = 'L'.repeat(60);
    const labels = Array.from({ length: 13 }, (_, i) => `T${i}`).join(', ');
    const source = script([`[[Thread: A, ${long}]]\n`, `[[Thread: A, ${labels}]]\n`]);
    const { doc, index } = indexOf(source);
    const r = renameThread(doc, index, 'A', 'Z');
    expect(r.scenes).toBe(2);
    const out = cm(source, r.changes);
    expect(threadsOf(out)[0]).toEqual(['Z', long]);
    expect(threadsOf(out)[1]).toHaveLength(14);
  });
});

describe('removeThread', () => {
  test('takes the label from every scene and its meta', () => {
    const source = script(
      ['[[Thread: A, B]]\n', '[[Storyline: a]]\n', '[[Thread: B]]\n'],
      '{"v":1,"template":"screenplay","threads":{"a":{"color":"red"},"b":{"name":"Bee"}}}',
    );
    const { doc, index } = indexOf(source);
    const r = removeThread(doc, index, 'A');
    expect(r.scenes).toBe(2);
    const out = cm(source, r.changes);
    expect(threadsOf(out)).toEqual([['B'], [], ['B']]);
    expect(out).not.toContain('Storyline');
    expect(parse(out).meta).toEqual({
      v: 1,
      template: 'screenplay',
      threads: { b: { name: 'Bee' } },
    });
  });

  test('drops the threads key with the last entry; a stray /* does nothing', () => {
    const source = script([''], '{"v":1,"threads":{"a":{"color":"red"}}}');
    const { doc, index } = indexOf(source);
    const r = removeThread(doc, index, 'a');
    expect(r.scenes).toBe(0);
    expect(parse(cm(source, r.changes)).meta).toEqual({ v: 1 });
    const stray = indexOf('INT. A - DAY\n\n[[Thread: A]]\n\n/* open\n');
    expect(removeThread(stray.doc, stray.index, 'A')).toEqual({ changes: [], scenes: 0 });
  });
});

describe('a Thread note outside the header (setThreadField)', () => {
  const source = 'INT. A - DAY\n\nAction. [[Thread: A]]\n\nMore.\n';
  const run = (labels: string[]) => {
    const { doc, index } = indexOf(source);
    return cm(source, setSceneDetails(doc, sceneAt(index, 0), { thread: labels.join(', ') }));
  };

  // Scene details' field shows every note's labels, so its save rewrites them all (the ruling for
  // setSceneThreads): one note in the header, the others gone.
  test('goes into the header when the header has none', () => {
    expect(run(['B'])).toBe('INT. A - DAY\n\n[[Thread: B]]\n\nAction. \n\nMore.\n');
  });

  test('is deleted when emptied', () => {
    const out = run([]);
    expect(out).not.toContain('Thread');
    expect(threadsOf(out)).toEqual([[]]);
  });

  test('goes when the header has a note of its own', () => {
    const two = 'INT. A - DAY\n\n[[Thread: B]]\nAction. [[Thread: A]]\n';
    const { doc, index } = indexOf(two);
    const out = cm(two, setSceneDetails(doc, sceneAt(index, 0), { thread: 'C' }));
    expect(out).toBe('INT. A - DAY\n\n[[Thread: C]]\nAction. \n');
  });

  test('is inserted into the header when there is none anywhere', () => {
    const none = 'INT. A - DAY\n\nAction.\n';
    const { doc, index } = indexOf(none);
    expect(cm(none, setSceneDetails(doc, sceneAt(index, 0), { thread: 'C' }))).toBe(
      'INT. A - DAY\n\n[[Thread: C]]\n\nAction.\n',
    );
  });
});

describe('a thread note in the middle of a scene', () => {
  const source =
    'INT. A - DAY\n\n[[Thread: A]]\nAction one.\n\n[[Storyline: B]]\n\nMore. [[Thread: A, D]]\n\nINT. B - DAY\n\n[[Thread: B]]\n\nEnd.\n';
  /** The inverse of a change set, in the changed text's offsets. */
  const undo = (text: string, changes: readonly TextChange[]) => {
    let shift = 0;
    const inverse = [...changes]
      .sort((a, b) => a.from - b.from)
      .map((c) => {
        const from = c.from + shift;
        shift += c.insert.length - (c.to - c.from);
        return { from, to: from + c.insert.length, insert: text.slice(c.from, c.to) };
      });
    return inverse;
  };

  test('setSceneThreads leaves one note, in the header', () => {
    const { doc, index } = indexOf(source);
    const changes = setSceneThreads(doc, sceneAt(index, 0), ['C']);
    const out = cm(source, changes);
    expect(out.slice(0, out.indexOf('INT. B'))).toBe(
      'INT. A - DAY\n\n[[Thread: C]]\nAction one.\n\nMore. \n\n',
    );
    expect(threadsOf(out)).toEqual([['C'], ['B']]);
    expect(changes).toHaveLength(1);
    expect(cm(out, undo(source, changes))).toBe(source);
  });

  test('renameThread and removeThread leave no stale label, and undo is one inverse', () => {
    const { doc, index } = indexOf(source);
    const renamed = renameThread(doc, index, 'A', 'X');
    const out = cm(source, renamed.changes);
    expect(threadsOf(out)).toEqual([['X', 'B', 'D'], ['B']]);
    expect(out).not.toMatch(/Thread: A|Storyline/);
    expect(cm(out, undo(source, renamed.changes))).toBe(source);
    const removed = removeThread(doc, index, 'B');
    expect(removed.scenes).toBe(2);
    const gone = cm(source, removed.changes);
    expect(threadsOf(gone)).toEqual([['A', 'D'], []]);
    expect(gone).not.toMatch(/Storyline|Thread: B/);
    expect(cm(gone, undo(source, removed.changes))).toBe(source);
  });
});

describe('a header note flush against the action', () => {
  test('is emptied, not refused, when the last thread goes', () => {
    const source = 'INT. A - DAY\n\n[[Storyline: a]]\nAction.\n';
    const { doc, index } = indexOf(source);
    const out = cm(source, removeThread(doc, index, 'a').changes);
    expect(threadsOf(out)).toEqual([[]]);
    expect(out).not.toContain('[[');
    expect(out).toContain('Action.');
  });
});

describe('thread budget', () => {
  const make = (n: number) =>
    indexOf(script(Array.from({ length: n }, (_, i) => note(`A, T${i % 7}, B${i % 3}`))));

  test(
    'threadInfo grows linearly',
    () => {
      const { growth } = scaling(make, ({ doc, index }) => threadInfo(doc, index), 120);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  test(
    'rename and remove over every scene grow linearly',
    () => {
      const rename = scaling(make, ({ doc, index }) => renameThread(doc, index, 'A', 'Z'), 120);
      expect(rename.growth).toBeLessThan(MAX_GROWTH);
      const remove = scaling(make, ({ doc, index }) => removeThread(doc, index, 'A'), 120);
      expect(remove.growth).toBeLessThan(MAX_GROWTH);
      const { doc, index } = make(480);
      expect(renameThread(doc, index, 'A', 'Z').scenes).toBe(480);
    },
    SCALING_TIMEOUT,
  );
});

test('apply from helpers agrees with cm on sorted changes', () => {
  const source = script(['[[Thread: A]]\n', '[[Thread: A]]\n']);
  const { doc, index } = indexOf(source);
  const r = renameThread(doc, index, 'A', 'B');
  expect(apply(source, r.changes)).toBe(cm(source, r.changes));
});
