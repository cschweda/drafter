import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`);
}

const editor = (page: Page) => page.locator('.cm-content');
const bar = (page: Page) => page.getByText('This script is open for editing in another tab');
const editHere = (page: Page) => page.getByRole('button', { name: 'Edit here instead' });

interface Row {
  id: string;
  source: string;
  updatedAt: number;
}

/** The projects as the app stored them (both tabs share the context's database). */
function stored(page: Page): Promise<Row[]> {
  return page.evaluate(
    () =>
      new Promise<Row[]>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('projects')) {
            db.close();
            resolve([]);
            return;
          }
          const request = db.transaction('projects').objectStore('projects').getAll();
          request.onsuccess = () => {
            db.close();
            resolve(request.result as Row[]);
          };
          request.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      }),
  );
}

/** Opens the app in a new tab of the context and waits until a project is stored. */
async function openTab(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/');
  await expect.poll(async () => (await stored(page)).length).toBeGreaterThan(0);
  // On a phone the Script tab shows first, so the editor is in the page but not on screen.
  await expect(editor(page)).toBeAttached();
  return page;
}

async function typeAtStart(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.insertText(text);
}

const isEditable = (page: Page) =>
  editor(page)
    .getAttribute('contenteditable')
    .then((value) => value === 'true');

const STASH = 'drafter:unwritten';

function setStash(page: Page, id: string, source: string, at: number) {
  return page.evaluate(
    ([key, value]) => localStorage.setItem(key as string, value as string),
    [STASH, JSON.stringify({ id, source, at })],
  );
}

test.describe('one tab at a time', () => {
  test.skip(({ isMobile }) => !!isMobile, 'two tabs are the same on a phone; see the axe test');

  test('opens read-only in a second tab and hands editing over', async ({ context }) => {
    const a = await openTab(context);
    await expect(bar(a)).toHaveCount(0);
    expect(await isEditable(a)).toBe(true);
    // Not yet written: the handover has to flush it.
    await typeAtStart(a, 'Typed in tab A.\n');

    const b = await openTab(context);
    await expect(bar(b)).toBeVisible();
    expect(await isEditable(b)).toBe(false);

    await editHere(b).click();
    await expect(bar(b)).toHaveCount(0);
    await expect(editor(b)).toContainText('Typed in tab A.');
    expect(await isEditable(b)).toBe(true);

    await expect(bar(a)).toBeVisible();
    expect(await isEditable(a)).toBe(false);
    await expect(editHere(a)).toBeVisible();

    // And it can be handed back, with what B wrote.
    await typeAtStart(b, 'Then in tab B.\n');
    await editHere(a).click();
    await expect(editor(a)).toContainText('Then in tab B.');
    await expect(editor(a)).toContainText('Typed in tab A.');
    expect(await isEditable(a)).toBe(true);
    await expect(bar(b)).toBeVisible();
  });

  test('lets a script edit again when the other tab closes', async ({ context }) => {
    const a = await openTab(context);
    const b = await openTab(context);
    await expect(bar(b)).toBeVisible();
    await a.close();
    await b.reload();
    await expect(editor(b)).toBeVisible();
    await expect(bar(b)).toHaveCount(0);
    expect(await isEditable(b)).toBe(true);
  });

  test('writes nothing while read-only', async ({ context }) => {
    const a = await openTab(context);
    await typeAtStart(a, 'Written by A.\n');
    await expect.poll(async () => (await stored(a))[0]?.source).toContain('Written by A.');
    const b = await openTab(context);
    await expect(bar(b)).toBeVisible();
    const before = await stored(b);

    // It takes no typing...
    await editor(b).click({ force: true });
    await b.keyboard.press('ControlOrMeta+End');
    await b.keyboard.insertText('Typed in the read-only tab.');
    await expect(editor(b)).not.toContainText('Typed in the read-only tab.');
    // ...and leaves nothing for a closing page, or for the writer, to put anywhere.
    await b.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
    });
    await b.waitForTimeout(1500);
    expect(await stored(b)).toEqual(before);
    expect(await b.evaluate((key) => localStorage.getItem(key), STASH)).toBeNull();
  });

  test('leaves a stash alone while the other tab holds the script', async ({ context }) => {
    const a = await openTab(context);
    await typeAtStart(a, 'Kept by A.\n');
    await expect.poll(async () => (await stored(a))[0]?.source).toContain('Kept by A.');
    const [row] = await stored(a);
    const stash = JSON.stringify({ id: row.id, source: 'A stash from A.', at: Date.now() + 5000 });
    await a.evaluate(([key, value]) => localStorage.setItem(key, value), [STASH, stash]);

    const b = await openTab(context);
    await expect(bar(b)).toBeVisible();
    await expect(editor(b)).toContainText('Kept by A.');
    await expect(editor(b)).not.toContainText('A stash from A.');
    expect((await stored(b))[0].source).toContain('Kept by A.');
    // It is A's to clear.
    expect(await b.evaluate((key) => localStorage.getItem(key), STASH)).toBe(stash);
  });

  test('does not let an older stash overwrite the handed-over text', async ({ context }) => {
    const a = await openTab(context);
    await typeAtStart(a, 'The newest text.\n');
    await expect.poll(async () => (await stored(a))[0]?.source).toContain('The newest text.');
    const [row] = await stored(a);
    await setStash(a, row.id, 'An older stash.', row.updatedAt - 5000);

    const b = await openTab(context);
    await editHere(b).click();
    await expect(bar(b)).toHaveCount(0);
    await expect(editor(b)).toContainText('The newest text.');
    await expect(editor(b)).not.toContainText('An older stash.');
    expect((await stored(b))[0].source).toContain('The newest text.');
    expect(await b.evaluate((key) => localStorage.getItem(key), STASH)).toBeNull();
  });

  test('applies a newer stash when it takes over', async ({ context }) => {
    const a = await openTab(context);
    const [row] = await stored(a);
    await setStash(a, row.id, 'INT. STASHED - DAY\n\nNewer than the copy.\n', Date.now() + 60_000);

    const b = await openTab(context);
    await editHere(b).click();
    await expect(bar(b)).toHaveCount(0);
    await expect(editor(b)).toContainText('Newer than the copy.');
    await expect.poll(async () => (await stored(b))[0]?.source).toContain('Newer than the copy.');
  });

  test('hands over from the keyboard', async ({ context }) => {
    const a = await openTab(context);
    const b = await openTab(context);
    await editHere(b).focus();
    await expect(editHere(b)).toBeFocused();
    await b.keyboard.press('Enter');
    await expect(bar(b)).toHaveCount(0);
    expect(await isEditable(b)).toBe(true);
    // Focus lands in the text, not on a button that is gone.
    await expect(editor(b)).toBeFocused();
    await expect(bar(a)).toBeVisible();
  });

  test('does not ask before a read-only tab closes', async ({ context }) => {
    const a = await openTab(context);
    await typeAtStart(a, 'Only the holder has a draft.\n');
    const b = await openTab(context);
    await expect(bar(b)).toBeVisible();
    const asks = await b.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(asks).toBe(false);
  });

  test('guards nothing without Web Locks', async ({ context }) => {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    });
    const a = await openTab(context);
    const b = await openTab(context);
    await expect(bar(a)).toHaveCount(0);
    await expect(bar(b)).toHaveCount(0);
    expect(await isEditable(a)).toBe(true);
    expect(await isEditable(b)).toBe(true);
  });
});

test.describe('the read-only bar', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`has no accessibility violations (${theme})`, async ({ context }) => {
      await openTab(context);
      const b = await openTab(context);
      await expect(bar(b)).toBeVisible();
      if (theme === 'light') {
        await b.getByRole('button', { name: 'Switch to light theme' }).click();
        await expect(b.locator('html')).toHaveClass(/\blight\b/);
      }
      expect(await violations(b)).toEqual([]);
    });
  }
});
