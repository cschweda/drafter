import { fileURLToPath } from 'node:url';
import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

export default mergeConfig(
  shared,
  defineProject({
    // Nuxt's `~` is the app directory and `#samples` the sample scripts, for the modules a test
    // imports that import by them.
    // A module in `modules/` may import `.vue` files, and packages (`vue`) the app has and the
    // repository root doesn't. The test that loads the real folder needs only the module's shape,
    // so a component is an empty object, and packages resolve from this package.
    plugins: [
      {
        name: 'drafter-stub-vue-components',
        transform: (_code: string, id: string) =>
          id.split('?')[0]?.endsWith('.vue') ? { code: 'export default {}', map: null } : null,
      },
    ],
    resolve: {
      dedupe: ['vue'],
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
