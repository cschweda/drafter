import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  accessProblem,
  agreedOrigins,
  allowsModuleFrame,
  appCspWithModules,
  currentWriter,
  GROUP_PROBLEM,
  groupIsPrivate,
  manifestProblem,
  moduleCsp,
  moduleHandler,
  moduleIdOf,
  RUNTIME_PATH,
  readModulesFolder,
  resolveModuleUrl,
  shellQuote,
  shownText,
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

  test('refuses an origin whose host isn’t a plain host name or address', () => {
    // Each would reach the frame's CSP (connect-src), where `*` is a wildcard and `;` or a space
    // ends the source list.
    for (const origin of [
      'https://*.example.com',
      'https://*',
      'https://a*b.example.com',
      'https://a;b.example.com',
      'https://a,b.example.com',
      "https://a'b.example.com",
      'https://a"b.example.com',
      'https://a%20b.example.com',
      'https://a..example.com',
      'https://.example.com',
      'https://example.com.',
      'https://-a.example.com',
      'https://a-.example.com',
      'https://a_b.example.com',
      'https://example.com/',
      'https://example.com/path',
      'https://example.com?q=1',
      'https://example.com#x',
      'https://user@example.com',
      'https://user:pw@example.com',
      'HTTPS://EXAMPLE.COM',
      'http://example.com',
      'http://10.0.0.1',
      'ws://localhost',
      'wss://example.com',
      'file:///etc',
      'data:text/plain,x',
      'https://[::1',
      'https://example.com:0',
      'https://example.com:99999',
      ' https://example.com',
      'https://example.com ',
    ]) {
      expect(manifestProblem({ ...MANIFEST, permissions: { network: [origin] } }), origin).toMatch(
        /not an origin/,
      );
    }
    for (const origin of [
      'https://example.com',
      'https://api.example.com:8443',
      'https://192.0.2.10',
      'https://[2001:db8::1]',
      'https://xn--bcher-kva.example',
      'http://localhost',
      'http://127.0.0.1:11434',
      'http://[::1]:8080',
    ]) {
      expect(
        manifestProblem({ ...MANIFEST, permissions: { network: [origin] } }),
        origin,
      ).toBeUndefined();
    }
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
      [{ ...MANIFEST, name: 'Drafter' }, /name can’t be “Drafter”/],
      [{ ...MANIFEST, name: 'Drafter Helper' }, /name can’t be “Drafter”/],
      [{ ...MANIFEST, name: 'drafter' }, /name can’t be “Drafter”/],
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
    // A fingerprint of the folder name and its module.json, so a different module under the same id
    // is noticed (I1). The same folder read twice gives the same one; a changed module.json, a new one.
    expect(modules[0]?.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    const again = readModulesFolder(dir);
    expect(again.modules[0]?.fingerprint).toBe(modules[0]?.fingerprint);
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
      // The security walk catches the link out of the folder before the manifest is read.
      expect(problems[0]).toMatch(/Drafter skipped the folder “linked”.*\(index\.js\)/);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  test('skips a module that takes the id of one built into Drafter', async () => {
    await addModule('my-notes', { ...MANIFEST, id: 'notes' });
    await addModule('tidy');
    const { modules, problems } = readModulesFolder(dir, ['cast', 'notes']);
    expect(modules.map((m) => m.id)).toEqual(['tidy']);
    expect(problems).toEqual([
      'Drafter skipped the folder “my-notes”: it uses the id “notes”, which a module built into Drafter has.',
    ]);
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
    // Whatever reaches it, nothing but a strict origin goes into the policy.
    expect(
      moduleCsp('tidy', [
        'https://*.example.com',
        "https://a.example; script-src 'unsafe-eval'",
        '*',
      ]),
    ).toContain('connect-src drafter-module://tidy;');
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
    // Every response carries a policy, the runtime and a 404 included (minor 11).
    expect(code.headers.get('content-security-policy')).toBe(moduleCsp('tidy', []));
    const runtime = await get(`drafter-module://tidy${RUNTIME_PATH}`);
    expect(runtime.headers.get('content-security-policy')).toBe(moduleCsp('tidy', []));
    const missing = await get('drafter-module://tidy/nope.js');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
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

describe('allowsModuleFrame', () => {
  const known = (id: string) => id === 'tidy';
  test('lets the app’s page load a loaded module’s frame', () => {
    expect(
      allowsModuleFrame('drafter-module://tidy/?surface=tab', 'app://drafter/', false, known),
    ).toBe(true);
  });

  test('refuses a module navigating a frame, the main frame, an unknown module, or a file', () => {
    const cases: [string, string | undefined, boolean][] = [
      ['drafter-module://tidy/', 'drafter-module://tidy/', false],
      ['drafter-module://tidy/', 'drafter-module://other/', false],
      ['drafter-module://tidy/', undefined, false],
      ['drafter-module://tidy/', 'app://drafter/', true],
      ['drafter-module://other/', 'app://drafter/', false],
      ['drafter-module://tidy/index.js', 'app://drafter/', false],
      ['https://example.com/', 'app://drafter/', false],
    ];
    for (const [url, initiator, main] of cases) {
      expect(allowsModuleFrame(url, initiator, main, known), `${url} ${initiator}`).toBe(false);
    }
  });
});

describe('agreedOrigins', () => {
  test('keeps only what the module declares, once each', () => {
    const declared = ['https://api.example.com', 'http://127.0.0.1:11434'];
    expect(agreedOrigins(declared, ['https://api.example.com', 'https://evil.example'])).toEqual([
      'https://api.example.com',
    ]);
    expect(agreedOrigins(declared, [...declared, ...declared])).toEqual(declared);
    for (const bad of [null, 'https://api.example.com', [3], {}]) {
      expect(agreedOrigins(declared, bad), JSON.stringify(bad)).toEqual([]);
    }
  });
});

describe('appCspWithModules', () => {
  const CSP = "default-src 'self'; connect-src 'self'; frame-ancestors 'none'";
  test('lets the app’s page frame the modules, and changes nothing else', () => {
    expect(appCspWithModules(CSP)).toBe(`${CSP}; frame-src drafter-module:`);
  });
});

describe('readModulesFolder, insecure folders (POSIX)', () => {
  test('skips a module folder anyone but its owner can write', async () => {
    if (process.platform === 'win32') return;
    const { chmodSync } = await import('node:fs');
    await addModule('open-wide');
    chmodSync(join(dir, 'open-wide'), 0o777);
    await addModule('safe');
    chmodSync(join(dir, 'safe'), 0o755);
    const { modules, problems } = readModulesFolder(dir);
    expect(modules.map((m) => m.id)).toEqual(['safe']);
    expect(problems).toEqual([
      'Drafter skipped the folder “open-wide”: something under it (open-wide) isn’t yours alone, or Drafter can’t read it, so Drafter won’t run it.',
    ]);
  });

  test('skips a module with a writable file anywhere under it, naming the file', async () => {
    if (process.platform === 'win32') return;
    const { chmodSync, mkdirSync, writeFileSync } = await import('node:fs');
    await addModule('nested');
    mkdirSync(join(dir, 'nested', 'lib'));
    writeFileSync(join(dir, 'nested', 'lib', 'util.js'), '');
    chmodSync(join(dir, 'nested', 'lib', 'util.js'), 0o666);
    const { modules, problems } = readModulesFolder(dir);
    expect(modules).toEqual([]);
    expect(problems[0]).toMatch(/something under it \(lib\/util\.js\)/);
  });

  test('fails closed: skips a module with a subfolder it can’t read', async () => {
    if (process.platform === 'win32' || typeof process.getuid !== 'function') return;
    if (process.getuid() === 0) return; // root can read anything; the check is meaningless.
    const { chmodSync, mkdirSync } = await import('node:fs');
    await addModule('locked');
    mkdirSync(join(dir, 'locked', 'secret'));
    chmodSync(join(dir, 'locked', 'secret'), 0o000);
    try {
      const { modules, problems } = readModulesFolder(dir);
      expect(modules).toEqual([]);
      expect(problems[0]).toMatch(/Drafter skipped the folder “locked”/);
    } finally {
      chmodSync(join(dir, 'locked', 'secret'), 0o755);
    }
  });

  test('fails closed: skips a module with a dangling symlink, or a link out of its folder', async () => {
    if (process.platform === 'win32') return;
    const { symlinkSync } = await import('node:fs');
    await addModule('dangling');
    symlinkSync(join(dir, 'dangling', 'gone'), join(dir, 'dangling', 'link.js'));
    await addModule('escapes');
    symlinkSync('/etc/hosts', join(dir, 'escapes', 'out.js'));
    const { modules, problems } = readModulesFolder(dir);
    expect(modules.map((m) => m.id).sort()).not.toContain('dangling');
    expect(modules.map((m) => m.id)).not.toContain('escapes');
    expect(problems.join('\n')).toMatch(/Drafter skipped the folder “dangling”/);
    expect(problems.join('\n')).toMatch(/Drafter skipped the folder “escapes”/);
  });

  test('skips every module when the modules folder itself is writable', async () => {
    if (process.platform === 'win32') return;
    const { chmodSync } = await import('node:fs');
    await addModule('a');
    chmodSync(dir, 0o777);
    const { modules, problems } = readModulesFolder(dir);
    expect(modules).toEqual([]);
    expect(problems).toEqual([
      'Drafter skipped the modules folder: anyone on this computer can change it, so Drafter won’t run anything in it. Make it writable only by you.',
    ]);
  });
});

describe('accessProblem (who may change a module)', () => {
  const me = { uid: 501, gid: 20, groupIsPrivate: true };
  test('accepts what the writer owns, writable by them alone or by their own private group', () => {
    expect(accessProblem({ mode: 0o40755, uid: 501, gid: 20 }, me)).toBeUndefined();
    expect(accessProblem({ mode: 0o100644, uid: 501, gid: 999 }, me)).toBeUndefined();
    // Ubuntu's umask 002 with a user-private group.
    expect(accessProblem({ mode: 0o40775, uid: 501, gid: 20 }, me)).toBeUndefined();
    expect(accessProblem({ mode: 0o100664, uid: 501, gid: 20 }, me)).toBeUndefined();
  });

  test('refuses world-writable, another group, a shared group, or another owner', () => {
    expect(accessProblem({ mode: 0o40777, uid: 501, gid: 20 }, me)).toMatch(/anyone/);
    expect(accessProblem({ mode: 0o100666, uid: 501, gid: 20 }, me)).toMatch(/anyone/);
    expect(accessProblem({ mode: 0o40775, uid: 501, gid: 999 }, me)).toBe(GROUP_PROBLEM);
    expect(accessProblem({ mode: 0o100644, uid: 0, gid: 20 }, me)).toMatch(/owned/);
    // The writer's own primary group, but not provably private (macOS's staff): refused.
    const shared = { ...me, groupIsPrivate: false };
    expect(accessProblem({ mode: 0o40775, uid: 501, gid: 20 }, shared)).toBe(GROUP_PROBLEM);
    expect(accessProblem({ mode: 0o40755, uid: 501, gid: 20 }, shared)).toBeUndefined();
  });
});

describe('groupIsPrivate (Linux user-private groups)', () => {
  const PASSWD =
    'root:x:0:0:root:/root:/bin/bash\nana:x:1000:1000:Ana:/home/ana:/bin/bash\nbo:x:1001:1001::/home/bo:/bin/sh\n';
  const GROUP = 'root:x:0:\nana:x:1000:\nbo:x:1001:\nstaff:x:50:ana,bo\n';
  test('is private when its name is the user’s, it lists no members, and no one else has it', () => {
    expect(groupIsPrivate(1000, 'ana', GROUP, PASSWD)).toBe(true);
  });

  test('is not when the name differs, it lists members, another account has it, or it is unknown', () => {
    expect(groupIsPrivate(50, 'ana', GROUP, PASSWD)).toBe(false); // staff
    expect(groupIsPrivate(1000, 'ana', GROUP.replace('ana:x:1000:', 'ana:x:1000:bo'), PASSWD)).toBe(
      false,
    );
    expect(
      groupIsPrivate(1000, 'ana', GROUP, `${PASSWD}eve:x:1002:1000::/home/eve:/bin/sh\n`),
    ).toBe(false);
    expect(groupIsPrivate(4242, 'ana', GROUP, PASSWD)).toBe(false); // LDAP or SSSD: not in the files
    expect(groupIsPrivate(1000, 'ana', GROUP, 'root:x:0:0::/:/bin/sh\n')).toBe(false); // user not listed
  });
});

describe('currentWriter', () => {
  const ids = { uid: 1000, gid: 1000, username: 'ana' };
  const files: Record<string, string> = {
    '/etc/group': 'ana:x:1000:\n',
    '/etc/passwd': 'ana:x:1000:1000::/home/ana:/bin/sh\n',
  };
  const read = (path: string) => {
    const text = files[path];
    if (text === undefined) throw new Error('ENOENT');
    return text;
  };
  test('trusts a private group on Linux only', () => {
    expect(currentWriter('linux', ids, read)).toEqual({
      uid: 1000,
      gid: 1000,
      groupIsPrivate: true,
    });
    expect(currentWriter('darwin', ids, read)?.groupIsPrivate).toBe(false);
    expect(currentWriter('freebsd', ids, read)?.groupIsPrivate).toBe(false);
  });

  test('fails closed when the files can’t be read, and checks nothing on Windows', () => {
    expect(
      currentWriter('linux', ids, () => {
        throw new Error('EACCES');
      })?.groupIsPrivate,
    ).toBe(false);
    expect(currentWriter('win32', ids, read)).toBeNull();
  });
});

describe('readModulesFolder, group-writable', () => {
  const writer = (groupIsPrivate: boolean) => ({
    uid: (process.getuid as () => number)(),
    gid: (process.getgid as () => number)(),
    groupIsPrivate,
  });
  async function groupWritableModule(name: string) {
    const { chmodSync, chownSync } = await import('node:fs');
    await addModule(name);
    const me = writer(true);
    for (const path of [
      dir,
      join(dir, name),
      join(dir, name, 'module.json'),
      join(dir, name, 'index.js'),
    ]) {
      chownSync(path, me.uid, me.gid);
    }
    chmodSync(dir, 0o700);
    chmodSync(join(dir, name), 0o775);
    chmodSync(join(dir, name, 'module.json'), 0o664);
    chmodSync(join(dir, name, 'index.js'), 0o664);
  }

  test('loads a module unpacked under umask 002 when the group is provably the writer’s own', async () => {
    if (process.platform === 'win32' || typeof process.getuid !== 'function') return;
    await groupWritableModule('ubuntu');
    const { modules, problems } = readModulesFolder(dir, [], writer(true));
    expect(problems).toEqual([]);
    expect(modules.map((m) => m.id)).toEqual(['ubuntu']);
  });

  test('refuses it when the group may be shared, with the command that fixes it', async () => {
    if (process.platform === 'win32' || typeof process.getuid !== 'function') return;
    await groupWritableModule('shared');
    const { modules, problems } = readModulesFolder(dir, [], writer(false));
    expect(modules).toEqual([]);
    expect(problems).toEqual([
      `Drafter skipped the folder “shared”: a group other than yours alone can change it (shared). Run: chmod -R g-w '${join(dir, 'shared')}'.`,
    ]);
  });

  test('refuses a group-writable modules folder with the command that fixes it', async () => {
    if (process.platform === 'win32' || typeof process.getuid !== 'function') return;
    const { chmodSync } = await import('node:fs');
    await addModule('a');
    chmodSync(dir, 0o770);
    const { modules, problems } = readModulesFolder(dir, [], writer(false));
    expect(modules).toEqual([]);
    expect(problems).toEqual([
      `Drafter skipped the modules folder: a group other than yours alone can change it. Run: chmod g-w '${dir}'.`,
    ]);
  });
});

describe('the advice is safe to paste into a shell', () => {
  test('quotes a path for a POSIX shell, quotes included', () => {
    expect(shellQuote('/a b/x; rm -rf ~')).toBe("'/a b/x; rm -rf ~'");
    expect(shellQuote('/m/$(touch pwned)')).toBe("'/m/$(touch pwned)'");
    expect(shellQuote("/m/it's")).toBe("'/m/it'\\''s'");
  });

  test('shows a name without its control characters', () => {
    expect(shownText('a\nb\u0007c\u001b[31m')).toBe('a?b?c?[31m');
  });

  async function hostile(name: string) {
    const { chmodSync, chownSync, mkdirSync, writeFileSync } = await import('node:fs');
    const uid = (process.getuid as () => number)();
    const gid = (process.getgid as () => number)();
    const folder = join(dir, name);
    mkdirSync(folder);
    writeFileSync(join(folder, 'module.json'), JSON.stringify({ ...MANIFEST, id: 'evil' }));
    writeFileSync(join(folder, 'index.js'), '');
    for (const path of [dir, folder, join(folder, 'module.json'), join(folder, 'index.js')])
      chownSync(path, uid, gid);
    chmodSync(dir, 0o700);
    chmodSync(folder, 0o775);
    return { uid, gid, groupIsPrivate: false };
  }

  test('a folder named to inject a command gets it single-quoted, never run', async () => {
    if (process.platform === 'win32' || typeof process.getuid !== 'function') return;
    for (const name of ['x; rm -rf ~', '$(touch pwned)', "it's"]) {
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir);
      const me = await hostile(name);
      const { problems } = readModulesFolder(dir, [], me);
      expect(problems).toEqual([
        `Drafter skipped the folder “${name}”: a group other than yours alone can change it (${name}). Run: chmod -R g-w ${shellQuote(join(dir, name))}.`,
      ]);
    }
  });

  test('a folder name with a newline gets no command, and is shown without it', async () => {
    if (process.platform === 'win32' || typeof process.getuid !== 'function') return;
    const me = await hostile('two\nlines');
    const { problems } = readModulesFolder(dir, [], me);
    expect(problems).toEqual([
      'Drafter skipped the folder “two?lines”: a group other than yours alone can change it (two?lines). Remove group write access from it.',
    ]);
  });
});
