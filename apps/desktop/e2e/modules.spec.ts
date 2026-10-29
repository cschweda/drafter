import { createSocket } from 'node:dgram';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { type AddressInfo, createServer as createTcpServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import {
  chooseMenuItem,
  chooseTab,
  editor,
  editorDocument,
  expect,
  type Profile,
  test,
} from './helpers';

// The modules folder (docs/plans/2026-10-27-desktop-modules-folder.md): modules dropped into
// <userData>/modules are listed off, run in sandboxed frames of their own when turned on, and can't
// reach the page, the file bridge, the app's storage, another module, or the network unasked.

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
/** The example in the repository, as a writer would copy it. */
const TIDY = fileURLToPath(new URL('../../../modules/from-a-folder/tidy/', import.meta.url));
const FIXTURES = fileURLToPath(new URL('./modules/', import.meta.url));

const modulesDir = (profile: Profile) => join(profile.userData, 'modules');

function addFolder(profile: Profile, name: string, from: string) {
  mkdirSync(modulesDir(profile), { recursive: true });
  cpSync(from, join(modulesDir(profile), name), { recursive: true });
}

function addProbe(
  profile: Profile,
  { network = [] as string[], urls = {} as Record<string, string> } = {},
) {
  addFolder(profile, 'probe', join(FIXTURES, 'probe'));
  const dir = join(modulesDir(profile), 'probe');
  writeFileSync(
    join(dir, 'module.json'),
    JSON.stringify({
      id: 'probe',
      name: 'Probe',
      description: 'Tries what a module must not be able to do.',
      permissions: { network },
    }),
  );
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ urls }));
}

const settings = (page: Page) => page.getByRole('dialog', { name: 'Settings' });

async function openSettings(page: Page) {
  await page.keyboard.press(`${MOD}+,`);
  await expect(settings(page)).toBeVisible();
}

async function closeSettings(page: Page) {
  await settings(page).getByRole('button', { name: 'Done' }).click();
  await expect(settings(page)).toBeHidden();
}

async function turnOn(page: Page, name: string, consent = false) {
  await openSettings(page);
  const toggle = settings(page).getByRole('switch', { name });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  if (consent) {
    const ask = page.getByRole('dialog', { name: `Turn on ${name}?` });
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Turn on' }).click();
  }
  await expect(toggle).toBeChecked();
  await closeSettings(page);
}

async function runCommand(page: Page, title: string) {
  await page.keyboard.press(`${MOD}+k`);
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await page.keyboard.insertText(title);
  const row = palette.getByRole('option', { name: title, exact: true });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('data-highlighted', '');
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
}

async function setText(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press(`${MOD}+A`);
  await page.keyboard.insertText(text);
  await expect.poll(() => editorDocument(page)).toBe(text);
}

/** A row the app keeps in its settings table (IndexedDB), as the page sees it. */
function settingsRow(page: Page, key: string): Promise<unknown> {
  return page.evaluate(
    (rowKey) =>
      new Promise((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve(undefined);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('settings').objectStore('settings').get(rowKey);
          request.onsuccess = () => {
            db.close();
            resolve((request.result as { value?: unknown } | undefined)?.value);
          };
          request.onerror = () => {
            db.close();
            resolve(undefined);
          };
        };
      }),
    key,
  );
}

/** A local web server that counts the requests it gets. */
async function countingServer(): Promise<{ server: Server; url: string; hits: () => number }> {
  let hits = 0;
  const server = createHttpServer((_request, response) => {
    hits++;
    response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' });
    response.end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}`, hits: () => hits };
}

test('lists a folder module off, with the warning; turned on, its button, command, and tab work, and its edit is one undo', async ({
  desktop,
  profile,
}) => {
  addFolder(profile, 'tidy', TIDY);
  const { page, errors } = await desktop();

  await openSettings(page);
  await expect(
    settings(page).getByRole('heading', { name: 'From your modules folder' }),
  ).toBeVisible();
  await expect(settings(page).locator('[data-folder-warning]')).toContainText(
    'code that Drafter didn’t write and hasn’t checked',
  );
  await expect(settings(page).getByRole('switch', { name: 'Tidy' })).not.toBeChecked();
  // Off: none of its code runs, so it has no frame and no button.
  await expect(page.locator('iframe[data-folder-module]')).toHaveCount(0);
  await closeSettings(page);
  await expect(page.getByRole('button', { name: 'Tidy' })).toHaveCount(0);

  await turnOn(page, 'Tidy');
  // Its settings section is drawn in a frame of its own.
  await openSettings(page);
  const settingsFrame = page.frameLocator('iframe[data-surface="settings"]');
  await expect(settingsFrame.getByLabel('Ask before removing spaces')).toBeChecked();
  await closeSettings(page);

  const text = 'INT. HOUSE - DAY  \n\nShe waits.\t\n\nHe arrives.\n';
  await setText(page, text);

  // The button: one item per line, and a toast.
  const button = page.getByRole('button', { name: 'Tidy' });
  await expect(button).toBeVisible();
  await button.click();
  await expect(
    page.getByRole('status').filter({ hasText: '2 lines end in spaces.' }),
  ).toBeVisible();

  // The tab: drawn in its own frame, listing the lines (in the pane beside the Source).
  await chooseTab(page, 'Tidy');
  await expect(editor(page)).toBeVisible();
  const tab = page.frameLocator('iframe[data-surface="tab"]');
  await expect(tab.getByText('2 lines end in spaces.')).toBeVisible();
  await expect(tab.getByRole('button', { name: 'Line 3' })).toBeVisible();

  // The command: asks first, then one change.
  await runCommand(page, 'Tidy: remove spaces at line ends');
  const ask = page.getByRole('dialog', { name: 'Tidy' });
  await expect(ask).toContainText('Remove the spaces at the ends of 2 lines?');
  await ask.getByRole('button', { name: 'Remove' }).click();
  const tidied = 'INT. HOUSE - DAY\n\nShe waits.\n\nHe arrives.\n';
  await expect.poll(() => editorDocument(page)).toBe(tidied);
  // The tab followed the change.
  await expect(tab.getByText('No line ends in spaces.')).toBeVisible();

  // One undo takes the whole change back.
  await editor(page).click();
  await page.keyboard.press(`${MOD}+z`);
  await expect.poll(() => editorDocument(page)).toBe(text);

  expect(errors.filter((e) => /Content Security Policy|Refused/i.test(e))).toEqual([]);
});

test('reports a malformed module, naming its folder, and starts the rest', async ({
  desktop,
  profile,
}) => {
  addFolder(profile, 'tidy', TIDY);
  mkdirSync(join(modulesDir(profile), 'no-manifest'), { recursive: true });
  writeFileSync(join(modulesDir(profile), 'no-manifest', 'index.js'), 'export default {};');
  mkdirSync(join(modulesDir(profile), 'bad-json'), { recursive: true });
  writeFileSync(join(modulesDir(profile), 'bad-json', 'module.json'), '{ id: nope');
  // One that takes a built-in module's id.
  mkdirSync(join(modulesDir(profile), 'my-notes'), { recursive: true });
  writeFileSync(
    join(modulesDir(profile), 'my-notes', 'module.json'),
    JSON.stringify({ id: 'notes', name: 'Notes', description: 'A copy.', permissions: {} }),
  );
  writeFileSync(
    join(modulesDir(profile), 'my-notes', 'index.js'),
    'export default { id: "notes" };',
  );
  addFolder(profile, 'broken-code', join(FIXTURES, 'broken-code'));
  const { page } = await desktop();

  await openSettings(page);
  const skipped = settings(page).locator('[data-folder-problems]');
  await expect(skipped).toContainText(
    'Drafter skipped the folder “bad-json”: its module.json isn’t valid JSON.',
  );
  await expect(skipped).toContainText(
    'Drafter skipped the folder “no-manifest”: it has no module.json.',
  );
  await expect(skipped).toContainText(
    'Drafter skipped the folder “my-notes”: it uses the id “notes”, which a module built into Drafter has.',
  );
  // Only the built-in Notes has a switch of that name.
  await expect(settings(page).getByRole('switch', { name: 'Notes', exact: true })).toHaveCount(1);
  await expect(settings(page).getByRole('switch', { name: 'Tidy' })).toBeVisible();

  // One whose code loads but exports the wrong id says so when it is turned on.
  await settings(page).getByRole('switch', { name: 'Broken code' }).click();
  await expect(settings(page).locator('[data-module="folder.broken-code"]')).toContainText(
    'It couldn’t start: its index.js says its id is “someone-else”, but its module.json says “broken-code”.',
  );
  await expect(
    page.getByRole('alert').filter({ hasText: 'Broken code couldn’t start' }),
  ).toBeVisible();
});

test('keeps a module away from the page, the file bridge, the app’s storage, other modules, and the network', async ({
  desktop,
  profile,
}) => {
  const outside = await countingServer();
  try {
    addFolder(profile, 'tidy', TIDY);
    addProbe(profile, { urls: { unasked: `${outside.url}/leak` } });
    const { page, app } = await desktop();
    await turnOn(page, 'Tidy');
    await turnOn(page, 'Probe');
    const text = 'Hello  \n';
    await setText(page, text);

    await page.getByRole('button', { name: 'Probe' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Probe done.' })).toBeVisible();
    const results = (await settingsRow(page, 'module:folder.probe:results')) as Record<
      string,
      unknown
    >;
    expect(results).toMatchObject({
      parentDocument: 'refused',
      ownBridge: 'absent',
      appDatabase: 'refused',
      localStorage: 'refused',
      otherModuleFile: 'refused',
      otherModuleImport: 'refused',
      otherFrames: 'refused',
      popup: 'refused',
      network: { unasked: 'refused' },
    });
    // Cross-origin: the bridge on the page can't be read from the frame at all.
    expect(['refused', 'absent']).toContain(results.parentBridge);
    expect(['refused', 'absent']).toContain(results.topBridge);
    expect(outside.hits()).toBe(0);

    // Its forged messages to Tidy's frame did nothing: no question, no change.
    await expect(page.getByRole('dialog', { name: 'Tidy' })).toHaveCount(0);
    expect(await editorDocument(page)).toBe(text);
    // The app is where it was.
    expect(page.url()).toBe('app://drafter/');
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  } finally {
    outside.server.close();
  }
});

test('lets a module reach the network only where the writer agreed, and only from its own frame', async ({
  desktop,
  profile,
}) => {
  const agreed = await countingServer();
  const other = await countingServer();
  try {
    addProbe(profile, {
      network: [agreed.url],
      urls: { agreed: `${agreed.url}/ok`, other: `${other.url}/leak` },
    });
    const { page } = await desktop();
    // The app's own page still can't reach the agreed origin.
    const fromPage = await page.evaluate(
      (url) =>
        fetch(url).then(
          () => 'reached',
          () => 'refused',
        ),
      `${agreed.url}/page`,
    );
    expect(fromPage).toBe('refused');

    await turnOn(page, 'Probe', true);
    await page.getByRole('button', { name: 'Probe' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Probe done.' })).toBeVisible();
    const results = (await settingsRow(page, 'module:folder.probe:results')) as {
      network: Record<string, string>;
    };
    expect(results.network).toEqual({ agreed: 'reached', other: 'refused' });
    expect(agreed.hits()).toBe(1);
    expect(other.hits()).toBe(0);
  } finally {
    agreed.server.close();
    other.server.close();
  }
});

/** The machine's own non-loopback IPv4, so a leak test doesn't hit loopback (which Chromium bypasses). */
function lanAddress(): string | null {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return null;
}

test('keeps a module off WebRTC: no STUN or TURN leaves, over UDP or TCP, even from a srcdoc child', async ({
  desktop,
  profile,
}) => {
  const host = lanAddress();
  test.skip(host === null, 'no non-loopback address to test against');
  const lan = host as string;
  let udpHits = 0;
  let tcpHits = 0;
  const udp = createSocket('udp4');
  udp.on('message', () => {
    udpHits++;
  });
  await new Promise<void>((resolve) => udp.bind(0, '0.0.0.0', resolve));
  const tcp = createTcpServer((socket) => {
    tcpHits++;
    socket.end();
  });
  await new Promise<void>((resolve) => tcp.listen(0, '0.0.0.0', resolve));
  const udpPort = (udp.address() as AddressInfo).port;
  const tcpPort = (tcp.address() as AddressInfo).port;
  try {
    addProbe(profile);
    // The probe asks for no network; these ICE servers are the attacker's.
    const probeDir = join(modulesDir(profile), 'probe');
    const config = JSON.parse(readFileSync(join(probeDir, 'config.json'), 'utf8'));
    config.ice = {
      turnUdp: [
        { urls: `turn:${lan}:${udpPort}?transport=udp`, username: 'SECRETDATA', credential: 'x' },
      ],
      turnTcp: [
        { urls: `turn:${lan}:${tcpPort}?transport=tcp`, username: 'SECRETDATA', credential: 'x' },
      ],
      stun: [{ urls: `stun:${lan}:${udpPort}` }],
      dns: [{ urls: `stun:secretdata.leak.invalid:${udpPort}` }],
    };
    writeFileSync(join(probeDir, 'config.json'), JSON.stringify(config));

    const { page } = await desktop();
    await turnOn(page, 'Probe');
    await page.getByRole('button', { name: 'Probe' }).click();
    await expect
      .poll(
        async () =>
          (await settingsRow(page, 'module:folder.probe:results')) as {
            webrtc?: Record<string, string>;
          },
        { timeout: 20000 },
      )
      .toHaveProperty('webrtc');
    const results = (await settingsRow(page, 'module:folder.probe:results')) as {
      webrtc: Record<string, string>;
    };
    // The JS ran (the constructor is there), but nothing reached the attacker's servers.
    expect(results.webrtc.srcdocChild).toBe('attempted');
    // Give any late packet a moment.
    await page.waitForTimeout(1000);
    expect(udpHits, 'STUN/TURN UDP must not leave').toBe(0);
    expect(tcpHits, 'TURN over TCP must not leave').toBe(0);
  } finally {
    udp.close();
    tcp.close();
  }
});

test('Help → Open Modules Folder shows the folder, making it if it is missing', async ({
  desktop,
  profile,
}) => {
  const log = join(profile.dir, 'opened.log');
  const { app } = await desktop({ env: { DRAFTER_E2E_OPENED_FOLDER: log } });
  await chooseMenuItem(app, ['Help', 'Open Modules Folder']);
  await expect
    .poll(() => {
      try {
        return readFileSync(log, 'utf8').trim();
      } catch {
        return '';
      }
    })
    .toBe(modulesDir(profile));
});
