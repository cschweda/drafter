import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

// The trap documents' own project (fixtures/trap/README.md): the package readers, the command
// line, and the desktop app's modules folder. Each trap runs in a worker thread that is stopped
// at its time limit (pool.ts); the test's timeout is only a backstop.
export default mergeConfig(
  shared,
  defineProject({
    test: { name: 'trap', include: ['*.test.ts'], testTimeout: 60_000 },
  }),
);
