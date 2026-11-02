import { describe, expect, it } from 'vitest';
import { storyMapMeta } from '../src';

// The metadata block's `storyMap` (design §4.2, §6.1.4), read strictly: anyone can edit the file.

describe('storyMapMeta', () => {
  it('reads the planned length and the hooks', () => {
    expect(
      storyMapMeta({ v: 1, storyMap: { plannedPages: 95, hooks: { WREN: 'keeps the lamp' } } }),
    ).toEqual({ plannedPages: 95, hooks: { WREN: 'keeps the lamp' } });
    expect(storyMapMeta({ storyMap: { plannedPages: 1 } }).plannedPages).toBe(1);
    expect(storyMapMeta({ storyMap: { plannedPages: 999 } }).plannedPages).toBe(999);
    expect(storyMapMeta({ storyMap: { plannedPages: 87.5 } }).plannedPages).toBe(87.5);
  });

  it('leaves out anything that is not a number from 1 to 999, or a string of 200 at most', () => {
    const none = { plannedPages: null, hooks: {} };
    for (const meta of [null, undefined, 'x', [], { storyMap: null }, { storyMap: [1] }]) {
      expect(storyMapMeta(meta)).toEqual(none);
    }
    for (const plannedPages of [
      '90',
      0,
      0.5,
      1000,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -3,
      true,
    ]) {
      expect(storyMapMeta({ storyMap: { plannedPages } }).plannedPages).toBeNull();
    }
    for (const hooks of [null, 'x', ['a'], 7]) {
      expect(storyMapMeta({ storyMap: { hooks } }).hooks).toEqual({});
    }
    const hooks = storyMapMeta({
      storyMap: { hooks: { A: 'fine', B: 7, C: 'x'.repeat(201), D: 'x'.repeat(200), E: null } },
    }).hooks;
    expect(hooks).toEqual({ A: 'fine', D: 'x'.repeat(200) });
  });

  it('a key named like a property of every object is only a key', () => {
    const meta = JSON.parse('{"storyMap":{"hooks":{"__proto__":"a","constructor":"b"}}}');
    const { hooks } = storyMapMeta(meta);
    expect(Object.getPrototypeOf(hooks)).toBeNull();
    expect(Object.getOwnPropertyDescriptor(hooks, '__proto__')?.value).toBe('a');
    expect(hooks.constructor).toBe('b');
    expect(storyMapMeta({ storyMap: { hooks: {} } }).hooks.toString).toBeUndefined();
  });
});
