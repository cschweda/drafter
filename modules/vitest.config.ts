import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../vitest.shared.ts';

// The modules' tests: each module run against a fake context made from a parsed script.
export default mergeConfig(
  shared,
  defineProject({ test: { name: 'modules', include: ['*/index.test.ts'] } }),
);
