import { defineConfig } from 'tsdown';

export default defineConfig({
  // notes.ts is its own entry, `@drafter/markdown/notes`: the footnote walk without the parser, for
  // `@drafter/render-pdf`, which must not load the parser at runtime.
  entry: ['src/index.ts', 'src/notes.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  // `.js` and `.d.ts`, which `"type": "module"` makes ESM, rather than `.mjs`.
  fixedExtension: false,
});
