// The privacy audit's writing session (docs/privacy-audit-2026-11-03.md): drives Chromium,
// Firefox, and WebKit through a session on a Drafter site (write, Classic Mode, every export,
// save, the views, a snapshot, a help page, a reload) and records every request each makes. A
// made-up phrase is typed into the script; no request's address, headers, or body may hold it.
// Plausible's requests are recorded and stopped, so a run adds no visits to drafter.dev's numbers.
//
//   node apps/web/scripts/privacy-check.mjs https://drafter.dev/ privacy.json [chromium|firefox|webkit]
//
// It exits 1 if any request holds the phrase or the title.

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium, firefox, webkit } = require('@playwright/test');

const [base, out] = process.argv.slice(2);
const MARKER = 'QUILLFERN ZEBRA 7731';
const TITLE_MARKER = 'Pomegranate Lighthouse 4402';
const SCRIPT = `Title: ${TITLE_MARKER}\nAuthor: Test Writer\n\nINT. ${MARKER} ROOM - NIGHT\n\nA lamp flickers. ${MARKER} is written on the wall.\n\nWREN\nNobody must read ${MARKER}.\n`;

async function session(browserType) {
  const browser = await browserType.launch();
  const context = await browser.newContext({ acceptDownloads: true });
  const requests = [];
  context.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    requests.push({
      method: request.method(),
      url,
      host: new URL(url).host,
      body: request.postData() ?? '',
      headers: JSON.stringify(request.headers()),
    });
  });
  await context.route(/plausible\.io/, (route) => route.abort());
  // Saves and exports as downloads in every browser (Chromium would open its save picker).
  await context.addInitScript(() => {
    for (const name of ['showSaveFilePicker', 'showOpenFilePicker', 'showDirectoryPicker'])
      delete window[name];
    // A writer who has seen the guided tour, which would otherwise greet a first visit.
    try {
      localStorage.setItem('drafter-tour-v1', 'true');
    } catch {}
  });
  const page = await context.newPage();
  const say = (step) => process.stderr.write(`[${browserType.name()}] ${step}\n`);
  const command = async (title) => {
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('dialog', { name: 'Command palette' }).waitFor({ timeout: 10000 });
    await page.keyboard.type(title);
    await page.getByRole('option', { name: title }).first().click();
    await page.waitForTimeout(800);
  };
  const steps = [];
  const step = async (name, run) => {
    try {
      await run();
      steps.push({ name, ok: true });
    } catch (error) {
      steps.push({ name, ok: false, error: String(error).slice(0, 200) });
      // Whatever was left open, closed, so the next step starts clean.
      await page.keyboard.press('Escape').catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
    }
    say(name);
  };

  await step('load', async () => {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.cm-content').waitFor();
  });
  await step('start a new screenplay and write', async () => {
    await command('New screenplay');
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText(SCRIPT);
    await page.waitForTimeout(2000);
  });
  await step('Classic Mode and back', async () => {
    await command('Switch to Classic Mode');
    await page.locator('.cm-content').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('WREN');
    await command('Switch to Fountain Mode');
  });
  for (const kind of [
    'Export as PDF',
    'Export as HTML',
    'Export as plain text',
    'Export as EPUB',
    'Export as Final Draft (.fdx)',
    'Export as Markdown file',
  ]) {
    await step(kind, async () => {
      const download = page.waitForEvent('download', { timeout: 20000 });
      download.catch(() => {});
      await command(kind);
      await download;
    });
  }
  await step('save (download)', async () => {
    const download = page.waitForEvent('download', { timeout: 20000 });
    download.catch(() => {});
    await page.keyboard.press('ControlOrMeta+s');
    await download;
  });
  for (const view of ['Show stats', 'Show Scaffold', 'Show Outline']) {
    await step(view, () => command(view));
  }
  await step('spellcheck on', async () => {
    await command('Settings…');
    await page.keyboard.press('Escape');
  });
  await step('a snapshot and a draft', async () => {
    await command('Take snapshot');
    await page.keyboard.press('Escape');
  });
  await step('help pages', async () => {
    await page.goto(new URL('/docs/privacy/', base).href, { waitUntil: 'networkidle' });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.cm-content').waitFor();
  });
  await step('reload: the script is still here, from this device', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.cm-content').waitFor();
    await page.waitForFunction((m) => (document.body.textContent ?? '').includes(m), MARKER, {
      timeout: 15000,
    });
  });
  await page.waitForTimeout(5000);
  // Where the script is kept: this browser's IndexedDB, and nowhere else.
  const local = await page.evaluate(async () => {
    const dbs = (await indexedDB.databases?.()) ?? [];
    return dbs.map((db) => db.name);
  });
  await browser.close();
  const carrying = requests.filter((r) =>
    [MARKER, TITLE_MARKER, encodeURIComponent(MARKER), MARKER.replace(/ /g, '+')].some(
      (m) => r.url.includes(m) || r.body.includes(m) || r.headers.includes(m),
    ),
  );
  const hosts = [...new Set(requests.map((r) => r.host))];
  const nonGet = requests.filter((r) => r.method !== 'GET');
  return {
    browser: browserType.name(),
    steps,
    hosts,
    requests: requests.length,
    nonGet,
    carrying,
    local,
  };
}

const results = [];
const only = process.argv[4];
for (const type of [chromium, firefox, webkit])
  if (!only || type.name() === only) results.push(await session(type));
writeFileSync(
  out,
  JSON.stringify({ base, marker: MARKER, at: new Date().toISOString(), results }, null, 2),
);
const leaked = results.some((r) => r.carrying.length > 0);
for (const r of results) {
  console.log(
    `${r.browser}: ${r.requests} requests, hosts ${r.hosts.join(', ')}; non-GET ${r.nonGet.length} (${r.nonGet.map((x) => `${x.method} ${x.host}`).join(', ')}); carrying the script: ${r.carrying.length}; steps failed: ${
      r.steps
        .filter((s) => !s.ok)
        .map((s) => s.name)
        .join(', ') || 'none'
    }; local databases: ${r.local.join(', ')}`,
  );
}
if (leaked) process.exit(1);
