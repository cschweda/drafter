import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packages = ['fountain', 'templates', 'layout', 'render-pdf', 'cli'];

// Tests import sibling packages from source, so a change in one package is
// visible to the others without a rebuild. Exact-match patterns leave subpath
// imports such as `@drafter/render-pdf/fonts/…` to the package's own exports.
export default defineConfig({
  resolve: {
    alias: packages.map((name) => ({
      find: new RegExp(`^@drafter/${name}$`),
      replacement: fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
    })),
  },
});
