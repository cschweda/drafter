// The rules live in @drafter/archive (shared with the CLI and the MCP server); a relative import,
// as this app does for apps/web, so its bundle needs no built package.
export {
  windowsNameProblem,
  windowsPathProblem,
} from '../../../packages/archive/src/windows-paths';
