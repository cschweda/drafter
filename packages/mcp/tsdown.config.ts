import { defineConfig } from 'tsdown';

// A placeholder until the release bundle (one file, every dependency inside it) is set up.
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  // `.js` and `.d.ts`, which `"type": "module"` makes ESM, rather than `.mjs`.
  fixedExtension: false,
});
