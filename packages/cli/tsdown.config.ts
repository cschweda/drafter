import { defineConfig } from 'tsdown';

export default defineConfig({
  // index.ts is the `drafter` binary; cli.ts is `run()`, importable for tests and other tools.
  entry: ['src/index.ts', 'src/cli.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  // `.js` and `.d.ts`, which `"type": "module"` makes ESM, rather than `.mjs`.
  fixedExtension: false,
});
