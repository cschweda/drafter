// The npm package, staged from the built bundle: `node scripts/stage.mjs <outDir>`.
//
// What npm gets is not the workspace's package.json, which lists Drafter's packages, the SDK, and
// zod as dependencies (true in the monorepo); the bundle carries all of them, so the staged
// manifest has no dependencies, devDependencies, scripts, or exports, and nothing runs on install.
// <outDir> must be new or empty, and gets exactly package.json, README.md, LICENSE, and
// drafter-mcp.js (dist/drafter-mcp.js, executable). Nothing else is written.
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const PACKAGE = resolve(import.meta.dirname, '..');
const ROOT = resolve(PACKAGE, '..', '..');
const BUNDLE = join(PACKAGE, 'dist', 'drafter-mcp.js');

/** The fields npm gets, in this order, each copied from the workspace's manifest. */
export const FIELDS = [
  'name',
  'version',
  'description',
  'license',
  'type',
  'bin',
  'files',
  'engines',
  'repository',
  'homepage',
  'keywords',
];

/** The staged manifest, from the workspace's. */
export function stagedManifest(workspace) {
  const values = {
    ...workspace,
    // The bundle sits at the package's root, beside package.json.
    // No leading ./: npm 11 "cleans" it off on publish, with a warning.
    bin: { 'drafter-mcp': 'drafter-mcp.js' },
    files: ['drafter-mcp.js'],
  };
  const staged = {};
  for (const field of FIELDS) {
    if (values[field] === undefined) throw new Error(`packages/mcp/package.json has no "${field}"`);
    staged[field] = values[field];
  }
  return staged;
}

function fail(message) {
  console.error(`stage.mjs: ${message}`);
  process.exit(1);
}

const out = process.argv[2];
if (!out || process.argv.length > 3) fail('usage: node scripts/stage.mjs <outDir>');
if (!existsSync(BUNDLE)) fail('no dist/drafter-mcp.js: run pnpm --filter "drafter-mcp..." build');
const dir = resolve(out);
if (existsSync(dir) && readdirSync(dir).length > 0) fail(`${dir} isn’t empty`);
mkdirSync(dir, { recursive: true });

const workspace = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8'));
writeFileSync(join(dir, 'package.json'), `${JSON.stringify(stagedManifest(workspace), null, 2)}\n`);
copyFileSync(BUNDLE, join(dir, 'drafter-mcp.js'));
chmodSync(join(dir, 'drafter-mcp.js'), 0o755);
copyFileSync(join(PACKAGE, 'README.md'), join(dir, 'README.md'));
copyFileSync(join(ROOT, 'LICENSE'), join(dir, 'LICENSE'));
console.log(`Staged ${workspace.name}@${workspace.version} in ${dir}`);
