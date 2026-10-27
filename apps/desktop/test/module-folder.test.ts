import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  manifestProblem,
  moduleCsp,
  moduleHandler,
  moduleIdOf,
  RUNTIME_PATH,
  readModulesFolder,
  resolveModuleUrl,
} from '../src/module-folder';

// The modules folder (docs/plans/2026-10-27-desktop-modules-folder.md §1, §3): what the main
// process reads at start, and what it serves at drafter-module://<id>/.

const MANIFEST = {
  id: 'tidy',
  name: 'Tidy',
  description: 'Finds spaces at the ends of lines.',
  permissions: {},
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'drafter-modules-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function addModule(
  folder: string,
  manifest: unknown = { ...MANIFEST, id: folder },
  code: string | null = 'export default { id: "x" };',
) {
  await mkdir(join(dir, folder), { recursive: true });
  // null: no module.json at all.
  if (manifest !== null) {
    await writeFile(
      join(dir, folder, 'module.json'),
      typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
    );
  }
  if (code !== null) await writeFile(join(dir, folder, 'index.js'), code);
}

describe('manifestProblem', () => {
  test('takes a module.json with an id, a name, a description, and permissions', () => {
    expect(manifestProblem(MANIFEST)).toBeUndefined();
    expect(
      manifestProblem({
        ...MANIFEST,
        permissions: {
          network: ['https://api.example.com', 'https://a.example:8443', 'http://127.0.0.1:11434'],
        },
      }),
    ).toBeUndefined();
    expect(
      manifestProblem({ ...MANIFEST, permissions: { network: ['http://localhost:8080'] } }),
    ).toBeUndefined();
  });

  test('says what is wrong with one that isn’t', () => {
    const cases: [unknown, RegExp][] = [
      [null, /not an object/],
      [[], /not an object/],
      [{ ...MANIFEST, id: 'Tidy' }, /id must be lowercase/],
      [{ ...MANIFEST, id: 'a--b' }, /id must be lowercase/],
      [{ ...MANIFEST, id: 'a'.repeat(64) }, /id must be lowercase/],
      [{ ...MANIFEST, name: '' }, /has no name/],
      [{ ...MANIFEST, name: 'x'.repeat(81) }, /name is longer than 80/],
      [{ ...MANIFEST, description: 3 }, /has no description/],
      [{ ...MANIFEST, description: 'x'.repeat(401) }, /description is longer than 400/],
      [{ ...MANIFEST, permissions: undefined }, /no permissions/],
      [{ ...MANIFEST, permissions: { network: 'https://a.example' } }, /list of origins/],
      [{ ...MANIFEST, permissions: { network: ['https://a.example/path'] } }, /not an origin/],
      [{ ...MANIFEST, permissions: { network: ['http://example.com'] } }, /not an origin/],
      [{ ...MANIFEST, permissions: { network: ['ftp://example.com'] } }, /not an origin/],
      [{ ...MANIFEST, permissions: { network: ['*'] } }, /not an origin/],
      [{ ...MANIFEST, permissions: { network: ['https://user@a.example'] } }, /not an origin/],
      [
        {
          ...MANIFEST,
          permissions: { network: Array.from({ length: 17 }, (_, i) => `https://a${i}.example`) },
        },
        /at most 16/,
      ],
    ];
    for (const [value, why] of cases)
      expect(manifestProblem(value), JSON.stringify(value)).toMatch(why);
  });
});

describe('readModulesFolder', () => {
  test('reads each module folder, in order of its name', async () => {
    await addModule('tidy');
    await addModule('beta', { ...MANIFEST, id: 'beta', name: 'Beta' });
    const { modules, problems } = readModulesFolder(dir);
    expect(problems).toEqual([]);
    expect(modules.map((m) => [m.folder, m.id, m.name])).toEqual([
      ['beta', 'beta', 'Beta'],
      ['tidy', 'tidy', 'Tidy'],
    ]);
    expect(modules[0]?.permissions).toEqual({ network: [] });
    expect(modules[0]?.root).toMatch(/beta$/);
  });

  test('has nothing when there is no folder, and ignores loose files and hidden folders', async () => {
    expect(readModulesFolder(join(dir, 'none'))).toEqual({ modules: [], problems: [] });
    await writeFile(join(dir, 'README.txt'), 'hello');
    await addModule('.cache');
    expect(readModulesFolder(dir)).toEqual({ modules: [], problems: [] });
  });

  test('skips a malformed module with a message naming its folder', async () => {
    await addModule('no-manifest', null);
    await addModule('bad-json', '{ id: tidy');
    await addModule('no-name', { ...MANIFEST, id: 'no-name', name: '' });
    await addModule('no-code', { ...MANIFEST, id: 'no-code' }, null);
    await addModule('big', ' '.repeat(70_000));
    await addModule('good');
    const { modules, problems } = readModulesFolder(dir);
    expect(modules.map((m) => m.id)).toEqual(['good']);
    expect(problems).toEqual([
      'Drafter skipped the folder “bad-json”: its module.json isn’t valid JSON.',
      'Drafter skipped the folder “big”: its module.json is larger than 64 KB.',
      'Drafter skipped the folder “no-code”: it has no index.js.',
      'Drafter skipped the folder “no-manifest”: it has no module.json.',
      'Drafter skipped the folder “no-name”: its module.json has no name.',
    ]);
  });

  test('skips a second module with the same id, naming both folders', async () => {
    await addModule('a', { ...MANIFEST, id: 'same' });
    await addModule('b', { ...MANIFEST, id: 'same' });
    const { modules, problems } = readModulesFolder(dir);
    expect(modules.map((m) => m.folder)).toEqual(['a']);
    expect(problems).toEqual([
      'Drafter skipped the folder “b”: it has the id “same”, which the folder “a” has.',
    ]);
  });

  test('refuses an index.js that is a link out of its folder', async () => {
    if (process.platform === 'win32') return;
    const outside = await mkdtemp(join(tmpdir(), 'drafter-outside-'));
    try {
      await writeFile(join(outside, 'evil.js'), 'export default {}');
      await addModule('linked', { ...MANIFEST, id: 'linked' }, null);
      await symlink(join(outside, 'evil.js'), join(dir, 'linked', 'index.js'));
      const { modules, problems } = readModulesFolder(dir);
      expect(modules).toEqual([]);
      expect(problems).toEqual([
        'Drafter skipped the folder “linked”: its index.js is outside its folder.',
      ]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  test('reads at most 50 modules', async () => {
    for (let i = 0; i < 52; i++) await addModule(`m${String(i).padStart(2, '0')}`);
    const { modules, problems } = readModulesFolder(dir);
    expect(modules).toHaveLength(50);
    expect(problems).toEqual([
      'Drafter skipped the folder “m50”: Drafter reads at most 50 modules.',
      'Drafter skipped the folder “m51”: Drafter reads at most 50 modules.',
    ]);
  });
});

describe('resolveModuleUrl', () => {
  const roots = new Map([['tidy', '/modules/tidy']]);

  test('names the frame’s page, the runtime, or a file of the module', () => {
    expect(resolveModuleUrl('drafter-module://tidy/', roots)).toEqual({ id: 'tidy', file: 'page' });
    expect(resolveModuleUrl('drafter-module://tidy/?surface=tab', roots)).toEqual({
      id: 'tidy',
      file: 'page',
    });
    expect(resolveModuleUrl(`drafter-module://tidy${RUNTIME_PATH}`, roots)).toEqual({
      id: 'tidy',
      file: 'runtime',
    });
    expect(resolveModuleUrl('drafter-module://tidy/index.js', roots)).toEqual({
      id: 'tidy',
      file: join('/modules/tidy', 'index.js'),
    });
    expect(resolveModuleUrl('drafter-module://tidy/lib/a%20b.js', roots)).toEqual({
      id: 'tidy',
      file: join('/modules/tidy', 'lib', 'a b.js'),
    });
  });

  test('refuses paths that leave the folder, and modules that weren’t loaded', () => {
    for (const url of [
      'drafter-module://tidy/../other/index.js',
      'drafter-module://tidy/%2e%2e/other/index.js',
      'drafter-module://tidy/..%2fother%2findex.js',
      'drafter-module://tidy/..%5cother',
      'drafter-module://tidy/..\\other',
      'drafter-module://tidy//etc/passwd',
      'drafter-module://tidy/C:/Windows/win.ini',
      'drafter-module://tidy/index.js%00.png',
      'drafter-module://other/index.js',
      'drafter-module://tidy:80/index.js',
      'drafter-module://user@tidy/index.js',
      'app://drafter/index.html',
      'not a url',
    ]) {
      expect(resolveModuleUrl(url, roots), url).toBeNull();
    }
  });
});

describe('moduleIdOf', () => {
  test('names the module of a frame’s URL', () => {
    expect(moduleIdOf('drafter-module://tidy/?surface=background')).toBe('tidy');
    expect(moduleIdOf('DRAFTER-MODULE://Tidy/')).toBe('tidy');
    for (const url of ['app://drafter/', 'https://tidy/', '', 'about:blank']) {
      expect(moduleIdOf(url), url).toBeNull();
    }
  });
});

describe('moduleCsp', () => {
  test('keeps a module to its own folder, and the network to what the writer agreed to', () => {
    const csp = moduleCsp('tidy', []);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain('script-src drafter-module://tidy');
    expect(csp).toContain('connect-src drafter-module://tidy;');
    expect(csp).toContain('frame-ancestors app://drafter');
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain('sandbox allow-scripts');
    expect(moduleCsp('tidy', ['https://api.example.com'])).toContain(
      'connect-src drafter-module://tidy https://api.example.com;',
    );
  });
});

describe('moduleHandler', () => {
  let runtime: string;
  let root: string;
  let granted: string[];
  const handler = () =>
    moduleHandler({
      modules: new Map([['tidy', root]]),
      runtime,
      origins: () => granted,
    });
  const get = (url: string, method = 'GET') => handler()(new Request(url, { method }));

  beforeEach(async () => {
    root = join(dir, 'tidy');
    await addModule('tidy', MANIFEST, 'export default { id: "tidy" };');
    await mkdir(join(dir, 'lib'));
    runtime = join(dir, 'lib', 'module-runtime.js');
    await writeFile(runtime, '// runtime');
    granted = [];
  });

  test('serves the frame’s page with its policy', async () => {
    const page = await get('drafter-module://tidy/?surface=tab');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(page.headers.get('content-security-policy')).toBe(moduleCsp('tidy', []));
    expect(await page.text()).toContain(`<script type="module" src="${RUNTIME_PATH}"></script>`);
    granted = ['https://api.example.com'];
    expect((await get('drafter-module://tidy/')).headers.get('content-security-policy')).toBe(
      moduleCsp('tidy', ['https://api.example.com']),
    );
  });

  test('serves the runtime and the module’s files, readable by its opaque origin', async () => {
    const script = await get(`drafter-module://tidy${RUNTIME_PATH}`);
    expect(await script.text()).toBe('// runtime');
    expect(script.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    const code = await get('drafter-module://tidy/index.js');
    expect(await code.text()).toBe('export default { id: "tidy" };');
    expect(code.headers.get('access-control-allow-origin')).toBe('*');
    expect(code.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('answers anything else with a 404', async () => {
    for (const url of [
      'drafter-module://tidy/nope.js',
      'drafter-module://tidy/../lib/module-runtime.js',
      'drafter-module://other/index.js',
      'drafter-module://tidy/module.json/x',
    ]) {
      expect((await get(url)).status, url).toBe(404);
    }
    expect((await get('drafter-module://tidy/index.js', 'POST')).status).toBe(405);
  });

  test('never follows a link out of the module’s folder', async () => {
    if (process.platform === 'win32') return;
    await writeFile(join(dir, 'lib', 'secret.txt'), 'secret');
    await symlink(join(dir, 'lib', 'secret.txt'), join(root, 'leak.txt'));
    await symlink(join(dir, 'lib'), join(root, 'leak'));
    await symlink(join(root, 'index.js'), join(root, 'inside.js'));
    expect((await get('drafter-module://tidy/leak.txt')).status).toBe(404);
    expect((await get('drafter-module://tidy/leak/secret.txt')).status).toBe(404);
    expect((await get('drafter-module://tidy/inside.js')).status).toBe(200);
  });
});
