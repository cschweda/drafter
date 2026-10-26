import { describe, expect, test, vi } from 'vitest';
import { collectModules } from '../app/modules/registry';

// The real `modules/` folder, as the build finds it: `pnpm test` fails on a module with the
// wrong shape, a repeated id, or an index.ts that doesn't load, before a build would.
const found = import.meta.glob('../../../modules/*/index.ts', { eager: true });

describe('the modules folder', () => {
  test('holds only modules of the right shape, with ids of their own', () => {
    const warn = vi.fn();
    const error = vi.fn();
    const modules = collectModules(found, warn, error);
    expect(warn.mock.calls).toEqual([]);
    expect(error.mock.calls).toEqual([]);
    expect(modules).toHaveLength(Object.keys(found).length);
  });
});
