import { defineConfig, type UserConfig } from 'tsdown';

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

export default defineConfig([
  { ...common, entry: { main: 'src/main.ts' }, clean: true },
  { ...common, entry: { preload: 'src/preload.ts' }, clean: false },
]);
