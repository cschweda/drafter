// Files move between drafter.dev and the desktop app: a script saved by one opens in the other as the
// same text, the same kind and template, and the same pages, and each writes the bytes it found
// (line breaks, byte-order mark, UTF-8, the last line) back as they were.
//
// The web side is the static build in `web/` (the one the desktop app serves) in Playwright's own
// Chromium over http://localhost, where there is no desktop bridge, so the page takes the web's
// paths: the File System Access API (stood in for by the origin-private file system, as in
// apps/web's e2e) and, without it, the file input and a download. That build differs from
// drafter.dev's only in having no service worker, no manifest, and no storage warning
// (apps/web/scripts/check-build.mjs), none of which reads or writes a file.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium, type Page } from '@playwright/test';
import { bytesOf, nextFileName, putFile, removePickers, stubPickers } from '../../web/e2e/fs-stub';
import { createStaticServer } from '../../web/scripts/serve.mjs';
import { answerDialogs, editor, expect, newProfile, type Profile, stored, test } from './helpers';

const WEB_ROOT = fileURLToPath(new URL('../web/', import.meta.url));
const DESKTOP_MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

interface Fixture {
  name: string;
  /** The file's text, with `\n` line breaks and no byte-order mark. */
  text: string;
  eol: '\n' | '\r\n';
  bom: boolean;
  kind: 'fountain' | 'markdown';
  /** The template the app must recognise, when the file names one. */
  template?: string;
  /** A whole line of `text`, which the edit adds to. */
  anchor: string;
  addition: string;
}

const FIXTURES: Fixture[] = [
  {
    name: 'The Lighthouse Café.fountain',
    text: [
      'Title: The Lighthouse Café',
      'Credit: Written by',
      'Author: Zoë Brontë-Ishikawa',
      'Draft date: 27 October 2026',
      'Contact:',
      '    zoe@example.com',
      '',
      'INT. LIGHTHOUSE CAFÉ - NIGHT',
      '',
      'Rain against the glass. NOËL (40s) wipes the counter. [[A note: the clock has stopped.]]',
      '',
      'NOËL',
      '(to nobody)',
      'Ça va. Everything is fine.',
      '',
      '/* The boneyard: a cut scene.',
      'EXT. PIER - NIGHT',
      'Nobody here.',
      '*/',
      '',
      'MIKA',
      '雨はまだやみません。',
      '',
      'YUKI ^',
      'まだです。',
      '',
      '> FADE OUT.',
      '',
    ].join('\n'),
    eol: '\n',
    bom: false,
    kind: 'fountain',
    anchor: 'Ça va. Everything is fine.',
    addition: ' Truly.',
  },
  {
    name: 'Ferry.fountain',
    text: [
      'Title: Ferry',
      'Author: A. Writer',
      '',
      '# Act One',
      '',
      '## Scene 1',
      '',
      'A dock at dawn. Gulls.',
      '',
      'OLA',
      'Is this the last boat?',
      '',
      'PIET',
      '(checking a watch)',
      'The last one today.',
      '',
      '/* drafter',
      '{ "v": 1, "template": "stage-play-standard" }',
      '*/',
      '',
    ].join('\n'),
    eol: '\n',
    bom: false,
    kind: 'fountain',
    template: 'stage-play-standard',
    anchor: 'A dock at dawn. Gulls.',
    addition: ' Fog.',
  },
  {
    name: 'Windows Draft.fountain',
    text: [
      'Title: Windows Draft',
      '',
      'INT. BÜRO - TAG',
      '',
      'Ein Ventilator summt. Größe zählt.',
      '',
      'RENÉE',
      'Où est le café ?',
      '',
    ].join('\n'),
    eol: '\r\n',
    bom: true,
    kind: 'fountain',
    anchor: 'Ein Ventilator summt. Größe zählt.',
    addition: ' Dann Stille.',
  },
  {
    name: 'Lighthouse notes.md',
    text: [
      '# Notes on the lighthouse',
      '',
      'A short *Markdown* document, with **bold** words, a list, and some 日本語.',
      '',
      '## Places',
      '',
      '- The café',
      '- The pier',
      '- 灯台',
      '',
      '> A quote, for good measure.',
    ].join('\n'),
    eol: '\n',
    bom: false,
    kind: 'markdown',
    anchor: '- The pier',
    addition: ' at night',
  },
];

/** The bytes of a file with this text, written as the fixture's file is (its breaks, its BOM). */
function bytesFor(fixture: Fixture, text: string): Buffer {
  return Buffer.from(`${fixture.bom ? '﻿' : ''}${text.replace(/\n/g, fixture.eol)}`, 'utf8');
}

const original = (f: Fixture) => bytesFor(f, f.text);
const edited = (f: Fixture) => bytesFor(f, f.text.replace(f.anchor, f.anchor + f.addition));

/** What the app keeps about a script it opened: the same in both apps, apart from where. */
async function recordOf(page: Page, name: string) {
  const row = (await stored(page)).find((r) => (r as { fileName?: string }).fileName === name) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    source: row.source,
    kind: row.kind ?? 'fountain',
    templateId: row.templateId,
    lineBreak: row.lineBreak,
    bom: row.bom === true,
    title: row.title,
  };
}

/**
 * What the page shows of the script: the pages and their lines for Fountain, the Preview's text for
 * Markdown. Page breaks are the template's paper and margins, not the window's size.
 */
async function rendered(page: Page, kind: Fixture['kind']) {
  if (kind === 'markdown') {
    const preview = page.getByRole('article', { name: 'Preview' });
    await showTab(page, 'Preview');
    return { preview: ((await preview.textContent()) ?? '').replace(/\s+/g, ' ').trim() };
  }
  await showTab(page, 'Script');
  const script = page.getByRole('region', { name: 'Script' });
  return {
    pages: await script.locator('.drafter-page').count(),
    lines: (await script.locator('.drafter-line').allTextContents()).map((t) => t.trim()),
  };
}

async function showTab(page: Page, name: 'Script' | 'Preview') {
  const shown = page.locator('[role="tab"][aria-selected="true"]', { hasText: name });
  if ((await shown.count()) === 0) await page.getByRole('tab', { name }).first().click();
}

/** The rendering, once it has the edit (or the text) in it and has stopped changing. */
async function settled(page: Page, fixture: Fixture, mustShow: string) {
  let last = '';
  let same = 0;
  let result: Awaited<ReturnType<typeof rendered>> | undefined;
  await expect
    .poll(
      async () => {
        result = await rendered(page, fixture.kind);
        const now = JSON.stringify(result);
        same = now === last && now.includes(mustShow) ? same + 1 : 0;
        last = now;
        return same;
      },
      { timeout: 20_000, intervals: [250] },
    )
    .toBeGreaterThanOrEqual(2);
  return result;
}

/** Adds the fixture's edit at the end of its anchor line, as a person types it. */
async function addEdit(page: Page, fixture: Fixture) {
  await page.locator('.cm-line', { hasText: fixture.anchor }).first().click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(fixture.addition);
  await expect(editor(page)).toContainText(fixture.anchor + fixture.addition);
}

// ---- the web app ----

let browser: Browser;
let server: ReturnType<typeof createStaticServer>;
let base = '';

test.beforeAll(async () => {
  server = createStaticServer(WEB_ROOT);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}/`;
  browser = await chromium.launch();
});

test.afterAll(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

/** drafter.dev in a browser: with the File System Access API (`picker`) or without (`download`). */
async function webPage(route: 'picker' | 'download') {
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(() => localStorage.setItem('drafter-tour-v1', 'true'));
  const page = await context.newPage();
  if (route === 'picker') await stubPickers(page);
  else await removePickers(page);
  await page.goto(base);
  // A fresh browser loads the whole app; a slow Windows runner has taken more than 30 s.
  await expect(page.locator('.cm-content')).toBeVisible({ timeout: 90_000 });
  await expect
    .poll(async () => (await stored(page)).length, { timeout: 30_000 })
    .toBeGreaterThan(0);
  // Nothing in this page may come from the desktop app.
  expect(await page.evaluate(() => 'drafterDesktop' in window)).toBe(false);
  return { context, page };
}

const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });

async function openFileItem(page: Page) {
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await scriptsMenu(page).getByRole('button', { name: 'Open a file…' }).click();
}

/** Opens `bytes` as `name` in the web app, by its route, and waits for it to be the script shown. */
async function webOpen(page: Page, route: 'picker' | 'download', name: string, bytes: Buffer) {
  if (route === 'picker') {
    await putFile(page, name, [...bytes]);
    await nextFileName(page, name);
    await openFileItem(page);
  } else {
    const chooser = page.waitForEvent('filechooser');
    await openFileItem(page);
    await (await chooser).setFiles({ name, mimeType: 'text/plain', buffer: bytes });
  }
  await expect.poll(() => recordOf(page, name)).not.toBeNull();
}

/** Saves in the web app and returns the bytes written: to the stand-in file, or downloaded. */
async function webSave(page: Page, route: 'picker' | 'download', name: string): Promise<Buffer> {
  if (route === 'picker') {
    const savedAt = async () =>
      (
        (await stored(page)).find((r) => (r as { fileName?: string }).fileName === name) as {
          savedAt?: number;
        }
      )?.savedAt ?? 0;
    const at = await savedAt();
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(savedAt).toBeGreaterThan(at);
    return Buffer.from((await bytesOf(page, name)) ?? []);
  }
  const download = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+s');
  const file = await download;
  expect(file.suggestedFilename()).toBe(name);
  return readFileSync(await file.path());
}

// ---- the desktop app ----

function folder(profile: Profile): string {
  const path = join(profile.home, 'Interchange');
  mkdirSync(path, { recursive: true });
  return path;
}

async function desktopOpen(page: Page, profile: Profile, path: string, name: string) {
  answerDialogs(profile, [path]);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await scriptsMenu(page).getByRole('button', { name: 'Open a file…' }).click();
  await expect.poll(() => recordOf(page, name)).not.toBeNull();
}

/** Saves in the desktop app (in place: the file was opened, so no dialog) and waits for the write. */
async function desktopSave(page: Page, name: string) {
  const savedAt = async () =>
    (
      (await stored(page)).find((r) => (r as { fileName?: string }).fileName === name) as {
        savedAt?: number;
      }
    )?.savedAt ?? 0;
  const at = await savedAt();
  await editor(page).click();
  await page.keyboard.press(`${DESKTOP_MOD}+s`);
  await expect.poll(savedAt).toBeGreaterThan(at);
}

for (const fixture of FIXTURES) {
  test(`${fixture.name} moves between the desktop app and the web app unchanged`, async ({
    desktop,
  }) => {
    test.setTimeout(240_000);
    const profiles: Profile[] = [];
    /** The desktop app in a profile of its own, as on another computer. */
    const freshDesktop = async () => {
      const profile = await newProfile();
      profiles.push(profile);
      return { app: await desktop({ profile }), profile };
    };
    try {
      await bothWays(fixture, freshDesktop);
    } finally {
      for (const profile of profiles) await rm(profile.dir, { recursive: true, force: true });
    }
  });
}

async function bothWays(
  fixture: Fixture,
  freshDesktop: () => Promise<{ app: { page: Page; close(): Promise<void> }; profile: Profile }>,
) {
  const want = edited(fixture);
  const wantText = fixture.text.replace(fixture.anchor, fixture.anchor + fixture.addition);
  const mustShow = fixture.addition.trim();

  // Desktop → web. The desktop app opens the file, the writer edits it, and Save writes it.
  const first = await freshDesktop();
  const onDisk = join(folder(first.profile), fixture.name);
  writeFileSync(onDisk, original(fixture));
  await desktopOpen(first.app.page, first.profile, onDisk, fixture.name);
  await addEdit(first.app.page, fixture);
  await desktopSave(first.app.page, fixture.name);
  const desktopBytes = readFileSync(onDisk);
  // As the file was: its line breaks, its BOM (or none), UTF-8, and its last line as it ended.
  expect(
    desktopBytes.equals(want),
    `desktop wrote:\n${JSON.stringify(desktopBytes.toString('utf8'))}`,
  ).toBe(true);
  const desktopRecord = await recordOf(first.app.page, fixture.name);
  expect(desktopRecord).toMatchObject({
    source: wantText,
    kind: fixture.kind,
    lineBreak: fixture.eol,
    bom: fixture.bom,
  });
  if (fixture.template) expect(desktopRecord?.templateId).toBe(fixture.template);
  const desktopView = await settled(first.app.page, fixture, mustShow);
  await first.app.close();

  for (const route of ['picker', 'download'] as const) {
    const web = await webPage(route);
    await webOpen(web.page, route, fixture.name, desktopBytes);
    // The same text (decoded), kind, template, line break, and BOM as the desktop app has.
    expect(await recordOf(web.page, fixture.name), route).toEqual(desktopRecord);
    // The same pages, line for line (or the same Preview).
    expect(await settled(web.page, fixture, mustShow), route).toEqual(desktopView);
    // Saved again with no change, the web app writes the desktop app's bytes back as they were.
    await editor(web.page).click();
    const again = await webSave(web.page, route, fixture.name);
    expect(again.equals(desktopBytes), `${route} rewrote the desktop's file`).toBe(true);
    await web.context.close();
  }

  // Web → desktop. The web app opens the original file, the writer makes the same edit, and Save
  // writes it: to the file (File System Access) and as a download.
  for (const route of ['picker', 'download'] as const) {
    const web = await webPage(route);
    await webOpen(web.page, route, fixture.name, original(fixture));
    await addEdit(web.page, fixture);
    const webBytes = await webSave(web.page, route, fixture.name);
    expect(
      webBytes.equals(want),
      `${route} wrote:\n${JSON.stringify(webBytes.toString('utf8'))}`,
    ).toBe(true);
    const webRecord = await recordOf(web.page, fixture.name);
    expect(webRecord).toEqual(desktopRecord);
    const webView = await settled(web.page, fixture, mustShow);
    await web.context.close();

    // The desktop app (on another computer) opens what the web app wrote.
    const other = await freshDesktop();
    const fromWeb = join(folder(other.profile), fixture.name);
    writeFileSync(fromWeb, webBytes);
    await desktopOpen(other.app.page, other.profile, fromWeb, fixture.name);
    expect(await recordOf(other.app.page, fixture.name), route).toEqual(webRecord);
    expect(await settled(other.app.page, fixture, mustShow), route).toEqual(webView);
    // And saved with no change, the desktop app leaves the web's bytes as they were.
    await desktopSave(other.app.page, fixture.name);
    expect(readFileSync(fromWeb).equals(webBytes), `desktop rewrote the ${route} file`).toBe(true);
    await other.app.close();
  }
}
