import { defineConfig, type UserConfig } from 'tsdown';
import { builtInModuleIds } from './scripts/built-in-modules.mjs';

// Electron loads the main process and the preload as CommonJS: a sandboxed preload can't be an ES
// module, and it may `require` only `electron` (and a few of Node's own modules), never a file of
// ours. So each is built on its own into one self-contained file, sharing no chunk; the main
// process uses the same format so the two are built alike.
const common: UserConfig = {
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  // `electron` is the runtime's own module, never bundled.
  deps: { neverBundle: ['electron'] },
  dts: false,
  // `.cjs`, since the package is `"type": "module"`.
  fixedExtension: true,
};

// The built-in modules' ids, which a module in the modules folder may not take (module-folder.ts).
const builtIn = await builtInModuleIds();

export default defineConfig([
  {
    ...common,
    entry: { main: 'src/main.ts' },
    clean: true,
    define: { __DRAFTER_BUILT_IN_MODULES__: JSON.stringify(builtIn) },
  },
  { ...common, entry: { preload: 'src/preload.ts' }, clean: false },
  // The runtime in each folder module's frame (module-runtime.ts): a browser module script, served
  // by the main process at drafter-module://<id>/__drafter__/runtime.js.
  {
    entry: { 'module-runtime': 'src/module-runtime.ts' },
    format: 'esm',
    platform: 'browser',
    target: 'chrome140',
    dts: false,
    fixedExtension: false,
    clean: false,
  },
]);
