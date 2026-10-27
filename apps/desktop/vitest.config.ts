import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

// The main process's pure parts (the protocol's path rules and headers): no Electron is loaded.
export default mergeConfig(
  shared,
  defineProject({ test: { name: 'desktop', include: ['test/**/*.test.ts'], environment: 'node' } }),
);
