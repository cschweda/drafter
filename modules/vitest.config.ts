import { fileURLToPath } from 'node:url';
import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../vitest.shared.ts';

// The modules' tests: each module run against a fake context made from a parsed script. `modules/`
// is outside any package, so the `vue` its modules import resolves from the app.
export default mergeConfig(
  shared,
  defineProject({
    resolve: {
      alias: [
        {
          find: /^vue$/,
          replacement: fileURLToPath(new URL('../apps/web/node_modules/vue', import.meta.url)),
        },
      ],
    },
    test: { name: 'modules', include: ['*/index.test.ts'] },
  }),
);
