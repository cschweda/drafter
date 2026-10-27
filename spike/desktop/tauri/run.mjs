// Drives Drafter-in-Tauri (Linux: WebKitGTK) through tauri-driver + WebKitWebDriver with WebdriverIO,
// and writes out/tauri-*.json + screenshots. Usage: node run.mjs <path to the built binary>
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { remote } from 'webdriverio';
import { BENCH, LONG, MIN_PAGES, OUT, PERSIST, PHRASE, save, sleep } from '../bench/common.mjs';

const exe = resolve(process.argv[2] ?? 'src-tauri/target/release/drafter');
const work = mkdtempSync(join(tmpdir(), 'drafter-tauri-'));
const fixture = join(work, 'opened.fountain');
writeFileSync(fixture, 'Title: Picked\n\nINT. STUB - DAY\n\nOpened through the IPC path.\n');
process.env.SPIKE_STUB_DIALOG = fixture; // inherited: tauri-driver → WebKitWebDriver → the app
const result = { shell: 'tauri', exe, work };

function rootShot(name) {
  if (!process.env.DISPLAY) return;
  try {
    execFileSync('import', ['-window', 'root', join(OUT, name)]);
  } catch (e) {
    console.log('root screenshot failed', String(e));
  }
}

function treeRss() {
  try {
    const rows = execFileSync('ps', ['-eo', 'pid=,ppid=,rss=,args='], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((l) => l.trim().split(/\s+/));
    const roots = rows.filter((r) => r[3] === exe).map((r) => r[0]);
    const kids = new Map();
    for (const [p, pp] of rows) kids.set(pp, [...(kids.get(pp) ?? []), p]);
    const all = new Set(roots);
    const stack = [...roots];
    while (stack.length) for (const k of kids.get(stack.pop()) ?? []) if (!all.has(k)) all.add(k) && stack.push(k);
    const procs = rows.filter(([p]) => all.has(p));
    return {
      processes: procs.length,
      names: procs.map((r) => r[3].split('/').pop()),
      rssMB: Math.round(procs.reduce((a, r) => a + Number(r[2]), 0) / 1024),
    };
  } catch (e) {
    return { error: String(e) };
  }
}

const driver = spawn(join(homedir(), '.cargo/bin/tauri-driver'), ['--port', '4444'], {
  stdio: ['ignore', 'inherit', 'inherit'],
});
await sleep(1500);

const js = (browser, fn, ...args) => browser.execute(fn, ...args);

async function untilReady(browser, timeout = 60_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      // The bench is plain script, passed as the WebDriver script body: no eval in the page.
      const has = await browser.execute(() => !!window.__spike);
      if (!has) await browser.execute(BENCH);
      if (await browser.execute(() => window.__spike.ready())) return;
    } catch (e) {
      last = String(e);
    }
    await sleep(100);
  }
  const why = await browser
    .execute(() => ({ href: location.href, body: document.body?.innerText.slice(0, 400), st: window.__spike?.state() }))
    .catch((e) => String(e));
  throw new Error(`the app did not get ready: ${JSON.stringify(why)} ${last ?? ''}`);
}

async function launch() {
  const t0 = Date.now();
  const browser = await remote({
    hostname: '127.0.0.1',
    port: 4444,
    logLevel: 'warn',
    connectionRetryTimeout: 120_000,
    capabilities: { 'tauri:options': { application: exe } },
  });
  await browser.setTimeout({ script: 300_000 });
  await untilReady(browser);
  return { browser, readyMs: Date.now() - t0 };
}

/** Real key events through WebDriver actions, one character at a time, paced like the Electron run. */
async function typeKeys(browser, text, gap = 60) {
  for (const ch of text) {
    const t = Date.now();
    await browser.keys(ch);
    const left = gap - (Date.now() - t);
    if (left > 0) await sleep(left);
  }
}

const step = async (name, fn) => {
  try {
    result[name] = await fn();
  } catch (e) {
    result[name] = { error: String(e).slice(0, 2000) };
    console.log(`step ${name} failed:`, e);
  }
};

let { browser, readyMs } = await launch();
result.firstLaunchReadyMs = readyMs;
await browser.execute(() => localStorage.setItem('drafter-tour-v1', 'true'));
await browser.refresh();
await untilReady(browser);
await sleep(1500);
await browser.saveScreenshot(join(OUT, 'tauri-sample.png')).catch((e) => console.log('screenshot', e));
rootShot('tauri-sample-root.png');
await step('info', () => js(browser, () => window.__spike.info()));
await step('tauriGlobal', () => js(browser, () => typeof window.__TAURI__ === 'object' && Object.keys(window.__TAURI__)));
await sleep(4000);
await step('serviceWorker', () => js(browser, () => window.__spike.swStatus()));
await step('serviceWorkerTry', () => js(browser, () => window.__spike.swTry()));
result.memoryAtSample = treeRss();

await step('longScript', async () => ({
  chars: LONG.length,
  ...(await js(browser, (t, n) => window.__spike.loadLong(t, n), LONG, MIN_PAGES)),
}));
await sleep(1000);

await step('typingRealKeys', async () => {
  await js(browser, () => document.querySelector('.cm-content').focus());
  await browser.keys(['Control', 'Home']);
  await js(browser, () => window.__spike.startRecording());
  const t = Date.now();
  await typeKeys(browser, PHRASE);
  const wallMs = Date.now() - t;
  const rec = await js(browser, () => window.__spike.stopRecording());
  const shows = await js(browser, () => window.__spike.firstPageShows('Typing into a long'));
  return { chars: PHRASE.length, wallMs, firstPageShowsIt: shows, ...rec };
});

await step('typingInPage', async () => {
  await js(browser, () => window.__spike.toStart());
  return js(browser, (p) => window.__spike.typeJS(p), PHRASE);
});
result.memoryAtLong = treeRss();
await browser.saveScreenshot(join(OUT, 'tauri-long.png')).catch(() => {});

await step('exportPdf', () => js(browser, () => window.__spike.exportPdf()));

await step('dialogs', async () => {
  const r = await js(browser, async () => {
    const invoke = window.__TAURI__.core.invoke;
    const info = await invoke('dialog_info');
    const opened = await invoke('pick_to_open');
    const ref = await invoke('pick_to_save', { suggestedName: 'The Call.fountain', kind: 'fountain' });
    await invoke('write_file', { fileRef: ref, text: `${opened.text}\nWritten back.\n` });
    const again = await invoke('read_file', { fileRef: ref });
    let refused = null;
    try {
      await invoke('read_file', { fileRef: { name: 'passwd', path: '/etc/passwd' } });
    } catch (e) {
      refused = String(e);
    }
    return { info, opened: { name: opened.name, text: opened.text }, saved: ref, readBack: again.text, refusedUngranted: refused };
  });
  return { ...r, fileOnDisk: readFileSync(`${fixture}.saved`, 'utf8') };
});

await step('persistenceTyped', async () => {
  await js(browser, () => document.querySelector('.cm-content').focus());
  await browser.keys(['Control', 'Home']);
  await typeKeys(browser, `${PERSIST} `, 30);
  await sleep(3000);
  return { marker: PERSIST };
});

// A real GTK open dialog, captured under Xvfb, then dismissed.
await step('nativeDialog', async () => {
  await js(browser, () => {
    window.__TAURI__.core.invoke('spike_show_dialog');
  });
  await sleep(2500);
  rootShot('tauri-native-dialog.png');
  try {
    execFileSync('xdotool', ['key', 'Escape']);
  } catch {}
  return 'shown; see tauri-native-dialog.png';
});

// Quit cleanly from inside (app.exit), then start a new session: a relaunch with the same profile.
await js(browser, () => {
  window.__TAURI__.core.invoke('spike_quit');
}).catch(() => {});
await sleep(2000);
await browser.deleteSession().catch(() => {});
await sleep(1000);
await step('relaunch', async () => {
  const r = await launch();
  browser = r.browser;
  await sleep(1000);
  const back = await js(browser, () => document.querySelector('.cm-content')?.textContent.slice(0, 300) ?? '');
  return { readyMs: r.readyMs, restored: back.includes(PERSIST), firstText: back.slice(0, 120) };
});
await browser.deleteSession().catch(() => {});
driver.kill();
try {
  result.webkitDataDirs = execFileSync('bash', ['-c', 'ls -la ~/.local/share/dev.drafter.spike ~/.local/share/dev.drafter.spike/* 2>&1 | head -40'], { encoding: 'utf8' });
} catch {}
save('tauri-results.json', result);
process.exit(0);
