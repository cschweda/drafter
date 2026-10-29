import { parse, type TextChange } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import { categoryColors, setCategoryColor } from '../src';

const apply = (source: string, changes: readonly TextChange[]) =>
  changes.reduceRight((out, c) => out.slice(0, c.from) + c.insert + out.slice(c.to), source);

describe('category colors', () => {
  test('reads category colors from the metadata block', () => {
    const source =
      'Tom sits.\n\n/* drafter\n{"v":1,"categories":{"Continuity":"teal","story":"plaid","todo":3}}\n*/\n';
    expect(categoryColors(parse(source))).toEqual({ continuity: 'teal' });
    expect(categoryColors(parse('Tom sits.\n'))).toEqual({});
  });

  test('sets and clears a color in one change', () => {
    const source = 'Tom sits.\n\n/* drafter\n{"v":1,"template":"screenplay"}\n*/\n';
    const set = setCategoryColor(parse(source), 'Continuity', 'teal');
    expect(set).toHaveLength(1);
    const colored = apply(source, set);
    expect(parse(colored).meta).toEqual({
      v: 1,
      template: 'screenplay',
      categories: { continuity: 'teal' },
    });
    expect(setCategoryColor(parse(colored), 'continuity', 'teal')).toEqual([]);
    const clear = setCategoryColor(parse(colored), 'continuity', null);
    expect(clear).toHaveLength(1);
    expect(parse(apply(colored, clear)).meta).toEqual({ v: 1, template: 'screenplay' });
  });

  test('adds a metadata block to a script without one', () => {
    const source = 'Tom sits.\n';
    const after = apply(source, setCategoryColor(parse(source), 'todo', 'red'));
    expect(parse(after).meta).toEqual({ v: 1, categories: { todo: 'red' } });
  });

  test('changes nothing while a /* is stray', () => {
    expect(setCategoryColor(parse('Tom.\n\n/* open\n'), 'todo', 'red')).toEqual([]);
  });
});
