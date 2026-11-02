import { join } from 'node:path';
import { defineConfig } from 'tsdown';
// @ts-expect-error: a plain script, with no types of its own.
import { appendNotices } from './scripts/notices.mjs';

// The program people run: one file, `dist/drafter-mcp.js`, with every dependency inside it (the
// SDK, zod, and Drafter's own packages), so it imports nothing but Node's own modules. It is its
// own worker too: bin.ts runs the server in the main thread and the reader in a worker started
// from this same file. Once it is written, the third-party licences are appended to it, from the
// modules it was built from (scripts/notices.mjs).
export default defineConfig({
  entry: { 'drafter-mcp': 'src/bin.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  dts: false,
  clean: true,
  // `.js`, which `"type": "module"` makes ESM, rather than `.mjs`.
  fixedExtension: false,
  banner: '#!/usr/bin/env node',
  deps: { alwaysBundle: [/./] },
  // One file: any dynamic import is inlined, never split into a chunk of its own.
  outputOptions: { codeSplitting: false },
  plugins: [
    {
      name: 'drafter-mcp-notices',
      writeBundle(options, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== 'chunk') continue;
          appendNotices(join(options.dir ?? 'dist', chunk.fileName), chunk.moduleIds);
        }
      },
    },
  ],
});
