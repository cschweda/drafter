import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`);
}

const editor = (page: Page) => page.locator('.cm-content');
const openButton = (page: Page) => page.getByRole('button', { name: 'Open', exact: true });
const menu = (page: Page) => page.getByRole('group', { name: 'Scripts' });
const script = (page: Page) => page.getByRole('region', { name: 'Script' });
const status = (page: Page) => page.locator('[data-tour="status"]');
const chip = (page: Page) => page.locator('.chip.template');
const row = (page: Page, title: string) => menu(page).locator('li', { hasText: title });
const confirm = (page: Page) => page.getByRole('dialog');
const bar = (page: Page) => page.getByText('This script is open for editing in another tab');

interface Row {
  id: string;
  title: string;
  source: string;
  sample?: string;
  updatedAt: number;
}

/** The projects as the app stored them. */
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

async function start(page: Page) {
  await page.goto('/');
  await expect.poll(async () => (await stored(page)).length).toBeGreaterThan(0);
  await expect(editor(page)).toBeAttached();
}

async function openTab(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await start(page);
  return page;
}

async function openMenu(page: Page) {
  if (!(await menu(page).isVisible())) await openButton(page).click();
  await expect(menu(page)).toBeVisible();
}

/** Chooses an item from the Open menu; the menu closes. */
async function choose(page: Page, name: string | RegExp, within = menu(page)) {
  await openMenu(page);
  await within.getByRole('button', { name }).click();
  await expect(menu(page)).toBeHidden();
}

async function typeAtEnd(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(text);
}

const isEditable = (page: Page) =>
  editor(page)
    .getAttribute('contenteditable')
    .then((value) => value === 'true');

const asks = (page: Page) =>
  page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

async function useLightTheme(page: Page) {
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
}

test.describe('new scripts and switching', () => {
  test.skip(({ isMobile }) => !!isMobile, 'the editor is the same on a phone; see the axe tests');

  test('starts a new screenplay', async ({ page }) => {
    await start(page);
    await choose(page, 'New screenplay');
    const first = script(page).locator('.drafter-page').first();
    await expect(first).toContainText('Untitled Screenplay');
    await expect(first).toContainText('Written by');
    await expect(first).toContainText('Your Name');
    await expect(chip(page)).toHaveText('Screenplay');
    // Typing starts after the title page, with the editor ready for it.
    await expect(editor(page)).toBeFocused();
    await page.keyboard.insertText('FADE IN:');
    await expect(editor(page)).toHaveText(/Draft date: [A-Z][a-z]+ \d{1,2}, \d{4}\s*FADE IN:$/);
    expect(await stored(page)).toHaveLength(2);
    // The old script, the sample, is still there.
    await expect.poll(async () => (await stored(page)).filter((p) => p.sample).length).toBe(1);
  });

  test('starts a new stage play', async ({ page }) => {
    await start(page);
    await choose(page, 'New stage play');
    await expect(chip(page)).toHaveText('Stage play');
    await expect(status(page)).toContainText('Stage play');
    await expect(script(page).locator('.drafter-page').first()).toContainText('Untitled Play');
    await expect(editor(page)).toBeFocused();
    await page.keyboard.insertText('A kitchen.');
    // The cursor sat before the metadata block, which is still the last thing in the text.
    await expect(editor(page)).toHaveText(
      /Draft date: [^\n]*\s*A kitchen\.\s*\/\* drafter\s*\{"v":1,"template":"stage-play-standard"\}\s*\*\/\s*$/,
    );
  });

  test('lists the new items in order, screenplay first', async ({ page }) => {
    await start(page);
    await openMenu(page);
    const names = await menu(page)
      .getByRole('button')
      .evaluateAll((els) => els.map((el) => el.textContent?.trim()));
    expect(names.slice(0, 2)).toEqual(['New screenplay', 'New stage play']);
    expect(names.slice(-3)).toEqual(['Screenplay', 'Stage play', 'Markdown']);
  });

  test('switches between scripts from the Open menu, each with its own undo history', async ({
    page,
  }) => {
    await start(page);
    await choose(page, 'New screenplay');
    await page.keyboard.insertText('ALPHA');
    await choose(page, 'New stage play');
    await page.keyboard.insertText('BETA');

    // Most recent first, and the open one is marked.
    await openMenu(page);
    await expect(menu(page).locator('li .title')).toHaveText([
      'Untitled Play',
      'Untitled Screenplay',
    ]);
    await expect(row(page, 'Untitled Play').getByRole('button').first()).toHaveAttribute(
      'aria-current',
      'true',
    );
    await menu(page)
      .getByRole('button', { name: /Untitled Screenplay/ })
      .click();
    await expect(menu(page)).toBeHidden();

    await expect(editor(page)).toContainText('ALPHA');
    await expect(editor(page)).not.toContainText('BETA');
    await expect(chip(page)).toHaveText('Screenplay');
    // A fresh history: undo can't reach the other script, or the text just loaded.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor(page)).toContainText('ALPHA');
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText(' GAMMA');
    await expect(editor(page)).toContainText('ALPHA GAMMA');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor(page)).not.toContainText('GAMMA');
    await expect(editor(page)).toContainText('ALPHA');

    await choose(page, /Untitled Play/);
    await expect(editor(page)).toContainText('BETA');
    await expect(editor(page)).not.toContainText('ALPHA');
    await expect(chip(page)).toHaveText('Stage play');
    // What was typed was kept by the switch.
    const sources = (await stored(page)).map((p) => p.source);
    expect(sources.some((s) => s.includes('ALPHA'))).toBe(true);
    expect(sources.some((s) => s.includes('BETA'))).toBe(true);
  });

  test('opens a sample beside your own scripts', async ({ page }) => {
    await start(page);
    await choose(page, 'New screenplay');
    await page.keyboard.insertText('MINE');
    await choose(page, 'Stage play', menu(page).getByRole('group', { name: 'Samples' }));
    await expect(editor(page)).toContainText('Title: The Call');
    await expect(chip(page)).toHaveText('Stage play');
    await expect(status(page)).toContainText('Sample · your edits stay in this browser');
    // A sample never asks before you leave it.
    await typeAtEnd(page, '\nEDITED SAMPLE');
    expect(await asks(page)).toBe(false);

    await openMenu(page);
    await expect(
      menu(page)
        .getByRole('group', { name: 'Samples' })
        .getByRole('button', { name: 'Stage play' }),
    ).toHaveAttribute('aria-current', 'true');
    // Your scripts are listed; the samples are not.
    await expect(menu(page).locator('li .title')).toHaveText(['Untitled Screenplay']);
    await menu(page)
      .getByRole('button', { name: /Untitled Screenplay/ })
      .click();
    await expect(editor(page)).toContainText('MINE');

    // The other sample is the one the first visit made, and the first sample keeps its edits.
    await choose(page, 'Screenplay', menu(page).getByRole('group', { name: 'Samples' }));
    await expect(editor(page)).toContainText('INT. KITCHEN - NIGHT');
    await choose(page, 'Stage play', menu(page).getByRole('group', { name: 'Samples' }));
    // (The editor draws only what is in view, so the stored copy is what shows the edit.)
    await expect(editor(page)).toContainText('Title: The Call');
    expect((await stored(page)).find((p) => p.sample === 'stage-play')?.source).toContain(
      'EDITED SAMPLE',
    );
    expect(await stored(page)).toHaveLength(3);
  });

  test('removes a script from this browser after confirming', async ({ page }) => {
    await start(page);
    await choose(page, 'New screenplay');
    await page.keyboard.insertText('DOOMED');
    await expect.poll(async () => (await stored(page)).length).toBe(2);

    await openMenu(page);
    const remove = row(page, 'Untitled Screenplay').getByRole('button', {
      name: 'Remove from this browser',
    });
    await remove.click();
    await expect(confirm(page)).toBeVisible();
    await expect(confirm(page)).toContainText('isn’t touched');
    await expect(confirm(page)).toContainText('never been saved to a file');
    // Cancelling changes nothing, and Escape cancels.
    await confirm(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm(page)).toBeHidden();
    await expect(remove).toBeFocused();
    expect(await stored(page)).toHaveLength(2);
    await remove.click();
    await page.keyboard.press('Escape');
    await expect(confirm(page)).toBeHidden();
    expect(await stored(page)).toHaveLength(2);
    await expect(editor(page)).toContainText('DOOMED');

    await remove.click();
    await confirm(page).getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(menu(page)).toBeHidden();
    // Nothing else is left, so the sample opens.
    await expect(editor(page)).toContainText('INT. KITCHEN - NIGHT');
    await expect(editor(page)).not.toContainText('DOOMED');
    await expect(status(page)).toContainText('Sample ·');
    await expect.poll(async () => (await stored(page)).length).toBe(1);
    await openMenu(page);
    await expect(menu(page)).toContainText('Scripts you start are kept here.');
    // And nothing the removed script's writer had pending brings it back.
    await page.waitForTimeout(1500);
    expect(await stored(page)).toHaveLength(1);
  });

  test('ignores a second New while the first is still switching', async ({ page }) => {
    await start(page);
    await openMenu(page);
    // Two clicks in one task, before the page can draw the first one's effect: only the
    // session's own guard can stop the second.
    await page.evaluate(() => {
      const item = [...document.querySelectorAll<HTMLButtonElement>('#scripts-menu button')].find(
        (b) => b.textContent?.includes('New screenplay'),
      );
      item?.click();
      item?.click();
    });
    await expect(menu(page)).toBeHidden();
    await expect(chip(page)).toHaveText('Screenplay');
    expect((await stored(page)).filter((p) => !p.sample)).toHaveLength(1);
    // The text typed after it lands in the new script, and stays.
    await expect(editor(page)).toBeFocused();
    await page.keyboard.insertText('TYPED AFTER');
    await page.waitForTimeout(300);
    await expect(editor(page)).toContainText('TYPED AFTER');
    await expect.poll(async () => (await stored(page)).filter((p) => !p.sample)).toHaveLength(1);
  });

  test('disables the menu items while a switch is under way', async ({ page }) => {
    await start(page);
    await openMenu(page);
    await menu(page).getByRole('button', { name: 'New stage play' }).dblclick();
    await expect(menu(page)).toBeHidden();
    expect((await stored(page)).filter((p) => !p.sample)).toHaveLength(1);
  });

  test('says that changes since the last save are lost when removing a script with a file', async ({
    page,
  }) => {
    await start(page);
    // Two scripts that have a file: one changed since it was saved, one not.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('drafter');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(['projects', 'snapshots'], 'readwrite');
            const now = Date.now();
            for (const [id, title, source, saved] of [
              [
                'changed',
                'Changed One',
                'Title: Changed One\n\nEdited.\n',
                'Title: Changed One\n\nOriginal.\n',
              ],
              ['clean', 'Clean One', 'Title: Clean One\n\nSame.\n', 'Title: Clean One\n\nSame.\n'],
            ] as const) {
              tx.objectStore('projects').put({
                id,
                title,
                source,
                templateId: 'us-screenplay',
                meta: null,
                lineBreak: '\n',
                createdAt: now,
                updatedAt: now,
                savedHash: 'x',
                savedAt: now,
                fileName: `${title}.fountain`,
              });
              tx.objectStore('snapshots').put({
                id: `saved:${id}`,
                projectId: id,
                createdAt: now,
                source: saved,
              });
            }
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await openMenu(page);
    await row(page, 'Changed One')
      .getByRole('button', { name: 'Remove from this browser' })
      .click();
    await expect(confirm(page)).toContainText('Changes since you last saved it to a file are lost');
    await expect(confirm(page)).not.toContainText('never been saved');
    await confirm(page).getByRole('button', { name: 'Cancel' }).click();
    await row(page, 'Clean One').getByRole('button', { name: 'Remove from this browser' }).click();
    await expect(confirm(page)).toBeVisible();
    await expect(confirm(page)).not.toContainText('Changes since you last saved');
    await expect(confirm(page)).not.toContainText('never been saved');
  });

  test('opens the most recent other script when the open one is removed', async ({ page }) => {
    await start(page);
    await choose(page, 'New screenplay');
    await page.keyboard.insertText('KEEP-ME');
    await choose(page, 'New stage play');
    await page.keyboard.insertText('GOING');
    await openMenu(page);
    await row(page, 'Untitled Play')
      .getByRole('button', { name: 'Remove from this browser' })
      .click();
    await confirm(page).getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(menu(page)).toBeHidden();
    await expect(editor(page)).toContainText('KEEP-ME');
    await expect(editor(page)).not.toContainText('GOING');
    await expect(openButton(page)).toBeFocused();
    expect((await stored(page)).some((p) => p.source.includes('GOING'))).toBe(false);
  });

  test('removes a script that is not open without leaving the open one', async ({ page }) => {
    await start(page);
    await choose(page, 'New screenplay');
    await page.keyboard.insertText('OTHER');
    await choose(page, 'New stage play');
    await page.keyboard.insertText('STAYS OPEN');
    await openMenu(page);
    await row(page, 'Untitled Screenplay')
      .getByRole('button', { name: 'Remove from this browser' })
      .click();
    await confirm(page).getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(menu(page)).toBeHidden();
    await expect(editor(page)).toContainText('STAYS OPEN');
    await expect.poll(async () => (await stored(page)).length).toBe(2);
    expect((await stored(page)).some((p) => p.source.includes('OTHER'))).toBe(false);
  });

  test('doesn’t ask before leaving an untouched new script', async ({ page }) => {
    await start(page);
    await choose(page, 'New screenplay');
    expect(await asks(page)).toBe(false);
    await page.reload();
    await expect(editor(page)).toContainText('Title: Untitled Screenplay');
    expect(await asks(page)).toBe(false);
    // Typing makes it a script with changes, and putting it back to the template ends them.
    await typeAtEnd(page, 'X');
    expect(await asks(page)).toBe(true);
    await page.keyboard.press('Backspace');
    expect(await asks(page)).toBe(false);
    await page.keyboard.insertText('Y');
    await page.reload();
    await expect(editor(page)).toContainText('Y');
    // The handler is registered once the script is open, a moment after the text shows.
    await expect.poll(() => asks(page)).toBe(true);
  });

  test('works from the keyboard', async ({ page }) => {
    await start(page);
    await openButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(menu(page)).toBeVisible();
    await expect(openButton(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(menu(page).getByRole('button', { name: 'New screenplay' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(openButton(page)).toBeFocused();
    await expect(openButton(page)).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('Space');
    await expect(menu(page).getByRole('button', { name: 'New screenplay' })).toBeFocused();
    await menu(page).getByRole('button', { name: 'New stage play' }).focus();
    await page.keyboard.press('Enter');
    await expect(chip(page)).toHaveText('Stage play');
    await expect(editor(page)).toBeFocused();

    // The list and the dialog work from the keyboard too.
    await openButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(menu(page).getByRole('button', { name: 'New screenplay' })).toBeFocused();
    await row(page, 'Untitled Play')
      .getByRole('button', { name: 'Remove from this browser' })
      .focus();
    await page.keyboard.press('Enter');
    await expect(confirm(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm(page)).toBeHidden();
    await expect(
      row(page, 'Untitled Play').getByRole('button', { name: 'Remove from this browser' }),
    ).toBeFocused();
  });

  test('closes when focus leaves the menu', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit’s Tab skips buttons');
    await start(page);
    await openButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(menu(page).getByRole('button', { name: 'New screenplay' })).toBeFocused();
    await menu(page).getByRole('group', { name: 'Samples' }).getByRole('button').last().focus();
    await page.keyboard.press('Tab');
    await expect(menu(page)).toBeHidden();
  });

  test('closes when you click elsewhere', async ({ page }) => {
    await start(page);
    await openMenu(page);
    await script(page).click({ position: { x: 5, y: 5 } });
    await expect(menu(page)).toBeHidden();
  });
});

test.describe('scripts and another tab', () => {
  test.skip(({ isMobile }) => !!isMobile, 'two tabs are the same on a phone');

  test('opens a script another tab holds read-only, and lets go of the one it left', async ({
    context,
  }) => {
    const a = await openTab(context);
    await choose(a, 'New screenplay');
    await a.keyboard.insertText('HELD BY A');
    await expect
      .poll(async () => (await stored(a)).some((p) => p.source.includes('HELD')))
      .toBe(true);

    // B opens on the newest script, which A holds; it goes to the sample, then back to A's.
    const b = await openTab(context);
    await expect(bar(b)).toBeVisible();
    await choose(b, 'Screenplay', menu(b).getByRole('group', { name: 'Samples' }));
    await expect(bar(b)).toHaveCount(0);
    expect(await isEditable(b)).toBe(true);
    await choose(b, /Untitled Screenplay/);
    await expect(bar(b)).toBeVisible();
    expect(await isEditable(b)).toBe(false);
    await expect(editor(b)).toContainText('HELD BY A');
    // Typing does nothing there.
    await editor(b).click({ force: true });
    await b.keyboard.insertText('NOPE');
    await expect(editor(b)).not.toContainText('NOPE');

    // B let go of the sample, so A can take it.
    await choose(a, 'Screenplay', menu(a).getByRole('group', { name: 'Samples' }));
    await expect(bar(a)).toHaveCount(0);
    expect(await isEditable(a)).toBe(true);
    // And now nobody holds A's old script: B takes it.
    await b.getByRole('button', { name: 'Edit here instead' }).click();
    await expect(bar(b)).toHaveCount(0);
    expect(await isEditable(b)).toBe(true);
    await expect(editor(b)).toContainText('HELD BY A');
  });

  test('never removes a script another tab holds, and says so', async ({ context }) => {
    const a = await openTab(context);
    await choose(a, 'New screenplay');
    await a.keyboard.insertText('HELD BY A');
    await expect
      .poll(async () => (await stored(a)).some((p) => p.source.includes('HELD')))
      .toBe(true);

    const b = await openTab(context);
    await expect(bar(b)).toBeVisible();
    // Open in B too, read-only: B can't remove it.
    await openMenu(b);
    await row(b, 'Untitled Screenplay')
      .getByRole('button', { name: 'Remove from this browser' })
      .click();
    await confirm(b).getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(
      b.getByRole('alert').filter({ hasText: 'open for editing in another tab' }),
    ).toBeVisible();
    expect(await stored(b)).toHaveLength(2);

    // From the sample, as a script that is not open here.
    await choose(b, 'Screenplay', menu(b).getByRole('group', { name: 'Samples' }));
    await openMenu(b);
    await row(b, 'Untitled Screenplay')
      .getByRole('button', { name: 'Remove from this browser' })
      .click();
    await confirm(b).getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(
      b.getByRole('alert').filter({ hasText: 'open for editing in another tab' }),
    ).toBeVisible();
    expect(await stored(b)).toHaveLength(2);
    await expect(row(b, 'Untitled Screenplay')).toBeVisible();
    expect(await isEditable(a)).toBe(true);
    await expect(editor(a)).toContainText('HELD BY A');
  });

  test('switching scripts never leaves the old one writable without its lock', async ({
    context,
  }) => {
    const a = await context.newPage();
    // A's lock requests wait while `__gate` is a promise.
    await a.addInitScript(() => {
      const w = window as unknown as { __gate?: Promise<void> | null };
      // On the prototype: WebKit may hand out a new LockManager wrapper for each `navigator.locks`.
      const proto = Object.getPrototypeOf(navigator.locks);
      const request = proto.request as (this: object, ...args: unknown[]) => Promise<unknown>;
      Object.defineProperty(proto, 'request', {
        configurable: true,
        writable: true,
        value(this: object, ...args: unknown[]) {
          return w.__gate
            ? w.__gate.then(() => request.apply(this, args))
            : request.apply(this, args);
        },
      });
    });
    await start(a);
    await choose(a, 'New screenplay');
    await a.keyboard.insertText('FIRST');
    const held = () =>
      a.evaluate(async () => (await navigator.locks.query()).held?.map((l) => l.name) ?? []);
    const lockOf = (id: string) => `drafter:project:${id}`;
    const [x] = (await stored(a)).filter((p) => !p.sample);
    const [sample] = (await stored(a)).filter((p) => p.sample);
    if (!x || !sample) throw new Error('both scripts should be stored');
    await expect.poll(held).toContain(lockOf(x.id));

    await a.evaluate(() => {
      const w = window as unknown as { __gate?: Promise<void> | null; __open?: () => void };
      w.__gate = new Promise<void>((resolve) => {
        w.__open = resolve;
      });
    });
    await openMenu(a);
    await menu(a)
      .getByRole('group', { name: 'Samples' })
      .getByRole('button', { name: 'Screenplay' })
      .click();
    // While the new lock is being got, the old script has its lock and can't be typed in.
    await expect.poll(() => isEditable(a)).toBe(false);
    expect(await held()).toContain(lockOf(x.id));
    await a.evaluate(() => {
      const w = window as unknown as { __gate?: Promise<void> | null; __open?: () => void };
      const release = w.__open;
      w.__gate = null;
      release?.();
    });
    await expect(editor(a)).toContainText('INT. KITCHEN - NIGHT');
    await expect.poll(() => isEditable(a)).toBe(true);
    await expect.poll(held).toContain(lockOf(sample.id));
    await expect.poll(held).not.toContain(lockOf(x.id));
  });
});

test.describe('the scripts menu', () => {
  const themes = ['dark', 'light'] as const;

  for (const theme of themes) {
    test(`has no accessibility violations with each menu open (${theme})`, async ({ page }) => {
      await start(page);
      // Something of the user's to list.
      await choose(page, 'New stage play');
      await expect(chip(page)).toHaveText('Stage play');
      if (theme === 'light') await useLightTheme(page);

      await openMenu(page);
      await expect(menu(page).locator('li')).toHaveCount(1);
      expect(await violations(page)).toEqual([]);

      await row(page, 'Untitled Play')
        .getByRole('button', { name: 'Remove from this browser' })
        .click();
      await expect(confirm(page)).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  }
});
