import { readdirSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { builtInModuleIds } from '../scripts/built-in-modules.mjs';

// The ids of the modules built into Drafter, which the build bakes into the main process
// (tsdown.config.ts) so a module in the modules folder can never take one (module-folder.ts).

describe('builtInModuleIds', () => {
  test('are read from the repository’s modules, with the test module, so the list can’t drift', async () => {
    const ids = await builtInModuleIds();
    expect(ids).toEqual([...ids].sort());
    for (const id of ['cast', 'notes', 'scene-list', 'fixture']) expect(ids).toContain(id);
    const folders = readdirSync(new URL('../../../modules/', import.meta.url), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .filter((entry) =>
        readdirSync(new URL(`../../../modules/${entry.name}/`, import.meta.url)).includes(
          'index.ts',
        ),
      );
    // Each module's id, and its folder's name besides when they differ.
    expect(ids.length).toBeGreaterThanOrEqual(folders.length + 1);
  });
});
