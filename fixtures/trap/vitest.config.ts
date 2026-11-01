import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

// The trap documents' own project (fixtures/trap/README.md): the package readers, the command
// line, and the desktop app's modules folder. A trap's own time limit is checked inside the test;
// the test's timeout is only the backstop for a hang.
export default mergeConfig(
  shared,
  defineProject({
    // `gc`, so a trap's memory is measured as what it keeps, not the garbage it has made so far.
    test: { name: 'trap', include: ['*.test.ts'], testTimeout: 60_000, execArgv: ['--expose-gc'] },
  }),
);
