import { defineConfig } from 'tsdown';

export default defineConfig({
  // notes.ts and words.ts are entries of their own, `@drafter/markdown/notes` and
  // `@drafter/markdown/words`: the footnote walk and the word count without the parser, for
  // `@drafter/render-pdf` and `@drafter/render-html-file`, which must not load it at runtime.
  entry: ['src/index.ts', 'src/notes.ts', 'src/words.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  // `.js` and `.d.ts`, which `"type": "module"` makes ESM, rather than `.mjs`.
  fixedExtension: false,
});
