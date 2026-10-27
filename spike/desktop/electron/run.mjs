// Drives Drafter-in-Electron with Playwright's _electron and writes out/electron-*.json + screenshots.
// Usage: node run.mjs [path to the packaged executable]   (default: electron + main.cjs from source)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron } from 'playwright-core';
import { BENCH, LONG, MIN_PAGES, OUT, PERSIST, PHRASE, save, sleep } from '../bench/common.mjs';

const HERE = import.meta.dirname;
const exe = process.argv[2] ? resolve(process.argv[2]) : undefined;
const profile = mkdtempSync(join(tmpdir(), 'drafter-electron-'));
const fixture = join(profile, 'opened.fountain');
writeFileSync(fixture, 'Title: Picked\n\nINT. STUB - DAY\n\nOpened through the IPC path.\n');
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const result = { shell: 'electron', exe: exe ?? 'electron (source)', profile };

function rootShot(name) {
  // What the X server shows: the composited window, as a writer would see it.
  if (!process.env.DISPLAY) return;
  try {
    execFileSync('import', ['-window', 'root', join(OUT, name)]);
  } catch (e) {
    console.log('root screenshot failed', String(e));
  }
}

function treeRss(pid) {
  try {
    const rows = execFileSync('ps', ['-eo', 'pid=,ppid=,rss=,comm='], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((l) => l.trim().split(/\s+/));
    const kids = new Map();
    for (const [p, pp] of rows) kids.set(pp, [...(kids.get(pp) ?? []), p]);
    const all = new Set([String(pid)]);
    const stack = [String(pid)];
    while (stack.length) for (const k of kids.get(stack.pop()) ?? []) if (!all.has(k)) all.add(k) && stack.push(k);
    const procs = rows.filter(([p]) => all.has(p));
    return { processes: procs.length, rssMB: Math.round(procs.reduce((a, r) => a + Number(r[2]), 0) / 1024) };
  } catch (e) {
    return { error: String(e) };
  }
}

// Polls from Node: waitForFunction compiles its predicate in the page, which the app's CSP forbids.
async function untilReady(page, timeout = 60_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const ok = await page
      .evaluate((bench) => {
        if (!window.__spike) (0, eval)(bench);
        return window.__spike.ready();
      }, BENCH)
      .catch(() => false);
    if (ok) return;
    await sleep(50);
  }
  const why = await page.evaluate(() => ({ st: window.__spike?.state(), status: document.querySelector('[data-tour="status"]')?.textContent, url: location.href })).catch((e) => String(e));
  throw new Error(`the app did not get ready: ${JSON.stringify(why)}`);
}

async function launch() {
  const t0 = Date.now();
  const app = await electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: [join(HERE, 'main.cjs')] }),
    env: { ...process.env, SPIKE_USER_DATA: profile, SPIKE_STUB_DIALOG: fixture },
    timeout: 60_000,
  });
  const page = await app.firstWindow();
  page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(BENCH);
  await untilReady(page);
  return { app, page, readyMs: Date.now() - t0 };
}

// ---- First launch: a first visit. The tour's "seen" key is set and the page reloaded (the e2e
// tests do the same with storageState), so the dialog doesn't take the keyboard.
let { app, page, readyMs } = await launch();
result.firstLaunchReadyMs = readyMs;
result.electron = await app.evaluate(({ app }) => ({ version: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, name: app.getName() }));
await page.evaluate(() => localStorage.setItem('drafter-tour-v1', 'true'));
await page.reload();
await page.evaluate(BENCH);
await untilReady(page);
await sleep(1500);
await page.screenshot({ path: join(OUT, 'electron-sample.png') });
rootShot('electron-sample-root.png');
result.info = await page.evaluate(() => window.__spike.info());
await sleep(4000);
result.serviceWorker = await page.evaluate(() => window.__spike.swStatus());
result.serviceWorkerTry = await page.evaluate(() => window.__spike.swTry());
result.memoryAtSample = treeRss(app.process().pid);

// ---- The Script pane: the 120-page script, as one paste.
result.longScript = { chars: LONG.length, ...(await page.evaluate(([t, n]) => window.__spike.loadLong(t, n), [LONG, MIN_PAGES])) };
await sleep(1000);

// ---- Typing with real key events (Playwright → Chromium input), at the start of the script.
await page.evaluate(() => document.querySelector('.cm-content').focus());
await page.keyboard.press(`${MOD}+Home`);
await page.evaluate(() => window.__spike.startRecording());
const tType = Date.now();
await page.keyboard.type(PHRASE, { delay: 60 });
const realWall = Date.now() - tType;
const real = await page.evaluate(() => window.__spike.stopRecording());
const shows = await page.evaluate(() => window.__spike.firstPageShows('Typing into a long'));
result.typingRealKeys = { chars: PHRASE.length, wallMs: realWall, firstPageShowsIt: shows, ...real };

// ---- The same typing through document.execCommand inside the page (the Tauri side's method too).
await page.evaluate(() => window.__spike.toStart());
result.typingInPage = await page.evaluate((p) => window.__spike.typeJS(p), PHRASE);
result.memoryAtLong = treeRss(app.process().pid);
await page.screenshot({ path: join(OUT, 'electron-long.png') });

// ---- PDF export through the app's own menu (the export worker, with its font fetches).
result.exportPdf = await page.evaluate(() => window.__spike.exportPdf());

// ---- File dialogs over IPC: the real functions exist; the stubbed answer goes through the bridge.
result.dialogs = await page.evaluate(async () => {
  const d = window.drafterDesktop;
  const info = await d.dialogInfo();
  const opened = await d.pickToOpen();
  const text = new TextDecoder().decode(opened.bytes);
  const ref = await d.pickToSave('The Call.fountain', 'fountain');
  await d.write(ref, `${text}\nWritten back.\n`);
  const again = await d.read(ref);
  let refused = null;
  try {
    await d.read({ name: 'passwd', path: '/etc/passwd' });
  } catch (e) {
    refused = String(e.message ?? e);
  }
  return { info, opened: { name: opened.name, text }, saved: ref, readBack: new TextDecoder().decode(again.bytes), refusedUngranted: refused };
});
result.dialogs.fileOnDisk = readFileSync(`${fixture}.saved`, 'utf8');

// ---- Persistence: type a marker, let the autosave (750 ms debounce) run, quit, relaunch.
await page.evaluate(() => document.querySelector('.cm-content').focus());
await page.keyboard.press(`${MOD}+Home`);
await page.keyboard.type(`${PERSIST} `);
await sleep(3000);
await app.close();
({ app, page, readyMs } = await launch());
result.relaunchReadyMs = readyMs;
await sleep(1000);
const back = await page.evaluate(() => document.querySelector('.cm-content')?.textContent.slice(0, 300) ?? '');
result.persistence = { marker: PERSIST, restored: back.includes(PERSIST), firstText: back.slice(0, 120) };

// ---- A real native open dialog, shown under Xvfb, captured, and dismissed with Escape.
if (process.env.DISPLAY) {
  await app.evaluate(({ dialog, BrowserWindow }) => {
    globalThis.__dlg = dialog.showOpenDialog(BrowserWindow.getAllWindows()[0], { properties: ['openFile'] });
  });
  await sleep(2500);
  rootShot('electron-native-dialog.png');
  try {
    execFileSync('xdotool', ['key', 'Escape']);
  } catch {}
  result.nativeDialog = await Promise.race([
    app.evaluate(async () => JSON.stringify(await globalThis.__dlg)),
    sleep(5000).then(() => 'still open after Escape'),
  ]);
}
await app.close();
save('electron-results.json', result);
