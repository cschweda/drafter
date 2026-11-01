// Counts Drafter's tests and writes apps/web/app/about/test-counts.json, which the What is Drafter
// page shows ("as of v0.23.2"). A release step (docs/DEVELOPMENT.md, Releasing): run it after the
// version is set and the e2e build exists, and commit the file with the release.
//
//   pnpm test-counts            # needs the packages built (pnpm -r build) and the e2e build
//                               # (DRAFTER_TEST_MODULES=1 NETLIFY=true pnpm --filter @drafter/web build)
//
// The unit tests are run, once, with Vitest's JSON reporter, because only a run counts the tests a
// suite makes as it goes (the trap documents' tests, one for each trap at each way in, among
// them); a run with a failure stops the script, since its counts would be wrong. The end-to-end
// tests are listed, not run: Playwright's `--list` collects every test, once for each project, as
// a run would, without running the full suite. A listed test can still skip itself at
// run time (a phone-only test on a desktop browser), so the e2e counts are what is listed. The
// trap documents and their checks are counted from fixtures/trap/MANIFEST.md, which the trap
// suite generates and keeps equal to traps.ts.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'apps/web/app/about/test-counts.json');
const scratch = mkdtempSync(join(tmpdir(), 'drafter-test-counts-'));

/** Runs a command in `cwd`, failing loudly with its output. */
function run(command, args, cwd, env = {}) {
  try {
    return execFileSync(command, args, {
      cwd,
      env: { ...process.env, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (error) {
    process.stderr.write(`${error.stdout ?? ''}${error.stderr ?? ''}`);
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}`);
  }
}

/** The Vitest project a test file belongs to (vitest.config.ts): a package's name, or web, desktop, modules, trap. */
function projectOf(file) {
  const path = file.slice(ROOT.length + 1);
  const pkg = /^packages\/([^/]+)\//.exec(path);
  if (pkg) return pkg[1];
  if (path.startsWith('apps/web/')) return 'web';
  if (path.startsWith('apps/desktop/')) return 'desktop';
  if (path.startsWith('modules/')) return 'modules';
  if (path.startsWith('fixtures/trap/')) return 'trap';
  throw new Error(`No Vitest project for ${path}.`);
}

/** Every Vitest test in the workspace, run once, by project. */
function vitestCounts() {
  const file = join(scratch, 'vitest.json');
  run(
    'pnpm',
    ['exec', 'vitest', 'run', '--maxWorkers=4', '--reporter=json', `--outputFile=${file}`],
    ROOT,
  );
  const report = JSON.parse(readFileSync(file, 'utf8'));
  if (report.numFailedTests > 0 || !report.success) {
    throw new Error(`${report.numFailedTests} unit tests failed: fix them before counting.`);
  }
  const counts = {};
  for (const result of report.testResults) {
    const project = projectOf(result.name);
    counts[project] = (counts[project] ?? 0) + result.assertionResults.length;
  }
  return counts;
}

/** Playwright's listed tests in `cwd`, by project, and how many tests there are before projects. */
function playwrightCounts(cwd, env = {}) {
  const file = join(scratch, `playwright-${cwd.split('/').at(-1)}.json`);
  run('pnpm', ['exec', 'playwright', 'test', '--list', '--reporter=json'], cwd, {
    ...env,
    PLAYWRIGHT_JSON_OUTPUT_NAME: file,
  });
  const report = JSON.parse(readFileSync(file, 'utf8'));
  if (report.errors?.length) {
    throw new Error(
      `Playwright couldn't list the tests in ${cwd}: ${report.errors.map((e) => e.message).join('; ')}`,
    );
  }
  // The report repeats each file's tests under each project, so a test is its file and its titles.
  const projects = {};
  const tests = new Set();
  const walk = (suite, path) => {
    for (const spec of suite.specs ?? []) {
      tests.add(JSON.stringify([...path, spec.file, spec.title]));
      for (const test of spec.tests) {
        projects[test.projectName || 'default'] =
          (projects[test.projectName || 'default'] ?? 0) + 1;
      }
    }
    for (const child of suite.suites ?? []) walk(child, [...path, child.title]);
  };
  for (const suite of report.suites ?? []) walk(suite, [suite.title]);
  return { tests: tests.size, projects };
}

/** The trap documents and their checks (one for each entry point a trap goes through). */
function trapCounts() {
  const manifest = readFileSync(join(ROOT, 'fixtures/trap/MANIFEST.md'), 'utf8');
  const rows = manifest.split('\n').filter((line) => line.startsWith('| `'));
  const checks = rows.reduce((sum, row) => sum + (row.match(/\*\*[a-z-]+\*\*:/g)?.length ?? 0), 0);
  const formats = /^\d+ traps: (.+)\.$/m.exec(manifest)?.[1];
  if (!formats) throw new Error('fixtures/trap/MANIFEST.md has no "N traps: …" line.');
  return {
    traps: rows.length,
    checks,
    byFormat: Object.fromEntries(
      formats.split(', ').map((part) => {
        const [name, count] = part.split(' ');
        return [name, Number(count)];
      }),
    ),
  };
}

const PACKAGES = readdirSync(join(ROOT, 'packages'));
const version = JSON.parse(readFileSync(join(ROOT, 'apps/desktop/package.json'), 'utf8')).version;

try {
  const vitest = vitestCounts();
  const packages = PACKAGES.reduce((sum, name) => sum + (vitest[name] ?? 0), 0);
  const web = playwrightCounts(join(ROOT, 'apps/web'), {
    E2E_PORT: process.env.E2E_PORT ?? '4173',
  });
  const desktop = playwrightCounts(join(ROOT, 'apps/desktop'));
  const counts = {
    version,
    date: process.env.DRAFTER_COUNT_DATE ?? new Date().toISOString().slice(0, 10),
    unit: {
      packages,
      packageCount: PACKAGES.filter((name) => vitest[name]).length,
      web: vitest.web ?? 0,
      desktop: vitest.desktop ?? 0,
      modules: vitest.modules ?? 0,
      trapHarness: vitest.trap ?? 0,
    },
    e2e: {
      web: web.tests,
      webProjects: Object.keys(web.projects),
      webRuns: Object.values(web.projects).reduce((a, b) => a + b, 0),
      desktop: desktop.tests,
    },
    trap: trapCounts(),
  };
  counts.unit.total =
    counts.unit.packages +
    counts.unit.web +
    counts.unit.desktop +
    counts.unit.modules +
    counts.unit.trapHarness;
  writeFileSync(OUT, `${JSON.stringify(counts, null, 2)}\n`);
  // As the repository formats it, so a run with the same counts changes nothing.
  run('pnpm', ['exec', 'biome', 'format', '--write', OUT], ROOT);
  console.log(`Wrote ${OUT.slice(ROOT.length + 1)}:`);
  console.log(JSON.stringify(counts, null, 2));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
