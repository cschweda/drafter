import { parse, type TextChange } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import { isThreadLabel, replaceThreadMeta, setThreadMeta, THREAD_LIMITS, threadMeta } from '../src';

const apply = (source: string, changes: readonly TextChange[]) =>
  changes.reduceRight((out, c) => out.slice(0, c.from) + c.insert + out.slice(c.to), source);
const block = (json: string) => `Tom sits.\n\n/* drafter\n${json}\n*/\n`;

describe('thread names and colors', () => {
  test('are kept in the settings block by normalized label', () => {
    const doc = parse('Tom sits.\n');
    const out = apply(
      doc.source,
      setThreadMeta(doc, ' The  Heist ', { name: 'The heist', color: 'yellow' }),
    );
    expect(parse(out).meta?.threads).toEqual({
      'the heist': { name: 'The heist', color: 'yellow' },
    });
    expect(threadMeta(parse(out))).toEqual({ 'the heist': { name: 'The heist', color: 'yellow' } });
  });

  test('keep the block’s other keys and drop the key when the last goes', () => {
    const source = block('{"v":1,"template":"screenplay","categories":{"todo":"red"}}');
    const set = apply(source, setThreadMeta(parse(source), 'A', { color: 'teal' }));
    expect(parse(set).meta).toEqual({
      v: 1,
      template: 'screenplay',
      categories: { todo: 'red' },
      threads: { a: { color: 'teal' } },
    });
    const gone = apply(set, setThreadMeta(parse(set), 'a', null));
    expect(parse(gone).meta).toEqual({ v: 1, template: 'screenplay', categories: { todo: 'red' } });
    expect(setThreadMeta(parse(gone), 'a', null)).toEqual([]);
    expect(setThreadMeta(parse(set), 'A', { color: 'teal' })).toEqual([]);
  });

  test('an entry with neither a name nor a color is no entry', () => {
    const source = block('{"v":1,"threads":{"a":{"color":"teal"}}}');
    const out = apply(source, setThreadMeta(parse(source), 'a', { name: '  ' }));
    expect(parse(out).meta).toEqual({ v: 1 });
  });

  test('junk is ignored and a long name is cut when read', () => {
    const long = 'x'.repeat(100);
    const source = block(
      JSON.stringify({
        v: 1,
        threads: {
          a: { name: long, color: 'plaid' },
          b: 3,
          c: { color: 'red' },
          d: [],
          'e,f': { color: 'red' },
          '': { color: 'red' },
        },
      }),
    );
    const read = threadMeta(parse(source));
    expect(Object.keys(read)).toEqual(['a', 'c']);
    expect(read.a).toEqual({ name: 'x'.repeat(80) });
    expect(threadMeta(parse(block('{"v":1,"threads":[1]}')))).toEqual({});
    expect(threadMeta(parse('Tom.\n'))).toEqual({});
  });

  test('a cut never splits a surrogate pair', () => {
    const name = `${'x'.repeat(79)}😀`;
    const read = threadMeta(parse(block(JSON.stringify({ v: 1, threads: { a: { name } } }))));
    expect(read.a?.name).toBe('x'.repeat(79));
  });

  test('refuse what is not a label, a name, or a color', () => {
    const doc = parse('Tom.\n');
    expect(() => setThreadMeta(doc, 'a,b', null)).toThrow(RangeError);
    expect(() => setThreadMeta(doc, 'a', { name: 'x'.repeat(81) })).toThrow(RangeError);
    expect(() => setThreadMeta(doc, 'a', { name: 'a\nb' })).toThrow(RangeError);
    expect(() => setThreadMeta(doc, 'a', { color: 'plaid' as never })).toThrow(RangeError);
  });

  test('changes nothing while a /* is stray', () => {
    expect(setThreadMeta(parse('Tom.\n\n/* open\n'), 'a', { color: 'red' })).toEqual([]);
    expect(replaceThreadMeta(parse('Tom.\n\n/* open\n'), [['a', { color: 'red' }]])).toEqual([]);
  });

  test('__proto__ is an ordinary thread', () => {
    const doc = parse('Tom.\n');
    const out = apply(doc.source, setThreadMeta(doc, '__proto__', { color: 'red', name: 'P' }));
    expect(out).toContain('"__proto__":{"name":"P","color":"red"}');
    const read = threadMeta(parse(out));
    expect(Object.keys(read)).toEqual(['__proto__']);
    expect(Object.getOwnPropertyDescriptor(read, '__proto__')?.value).toEqual({
      name: 'P',
      color: 'red',
    });
    expect(Object.getPrototypeOf(read)).toBeNull();
    expect(({} as Record<string, unknown>).color).toBeUndefined();
    expect(setThreadMeta(parse(out), '__PROTO__', { color: 'red', name: 'P' })).toEqual([]);
  });
});

describe('isThreadLabel', () => {
  test('takes 1 to 40 units with no comma, brackets, or line break', () => {
    expect(isThreadLabel('A')).toBe(true);
    expect(isThreadLabel('  Maya & dad ')).toBe(true);
    expect(isThreadLabel('x'.repeat(THREAD_LIMITS.label))).toBe(true);
    for (const bad of ['', '   ', 'a,b', 'a[[b', 'a]]b', 'a\nb', 'a\rb', 'x'.repeat(41)]) {
      expect(isThreadLabel(bad)).toBe(false);
    }
  });
});
