import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  // `.js` and `.d.ts`, which `"type": "module"` makes ESM, rather than `.mjs`.
  fixedExtension: false,
});
