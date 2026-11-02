// What the tests and the trap suite import: Drafter for Claude's library, not the program.
export { type Format, formatOf } from './formats';
export {
  BAD_PACE,
  MAX_FOLDERS,
  NO_FOLDER,
  type Options,
  PACE,
  parseOptions,
  TOO_MANY_FOLDERS,
  USAGE,
} from './options';
export {
  type Checked,
  MAX_PATH_CHARS,
  OUTSIDE,
  pathProblem,
  Refusal,
  resolvePath,
  type Want,
} from './paths';
export { isInside, type Root, resolveRoots, StartError } from './roots';
export { type Found, WALK_LIMITS, walk } from './walk';
