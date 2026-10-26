import { fileURLToPath } from 'node:url';
import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

export default mergeConfig(
  shared,
  defineProject({
    // Nuxt's `~` is the app directory and `#samples` the sample scripts, for the modules a test
    // imports that import by them.
    resolve: {
      alias: [
        { find: /^~\//, replacement: fileURLToPath(new URL('./app/', import.meta.url)) },
        {
          find: /^#samples\//,
          replacement: fileURLToPath(new URL('../../samples/', import.meta.url)),
        },
      ],
    },
    test: { name: 'web', include: ['test/**/*.test.ts'] },
  }),
);
