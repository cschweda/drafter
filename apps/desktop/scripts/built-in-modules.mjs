// The ids of the modules built into Drafter: the repository's `modules/` folder, and the test
// module (apps/web/app/modules/fixture.ts, in builds made with DRAFTER_TEST_MODULES=1). tsdown bakes
// them into the main process (`__DRAFTER_BUILT_IN_MODULES__`), which refuses a module in the modules
// folder that takes one (module-folder.ts), so the list is made from the modules themselves and
// can't drift from them.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { declaredId, moduleIds } from '../../web/scripts/modules.mjs';

const MODULES = fileURLToPath(new URL('../../../modules/', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../../web/app/modules/fixture.ts', import.meta.url));

/** @returns {Promise<string[]>} sorted, without repeats */
export async function builtInModuleIds() {
  const ids = new Set(await moduleIds(MODULES));
  const fixture = declaredId(await readFile(FIXTURE, 'utf8'));
  if (fixture) ids.add(fixture);
  return [...ids].sort();
}
