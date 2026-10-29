import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { alertsHeard, watchAlerts } from './fs-stub';
import { start } from './modules';

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

const stashKey = (id: string) => `drafter:unwritten:${id}`;
const stashes = (page: Page) =>
  page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith('drafter:unwritten')),
  );

function setStash(page: Page, id: string, source: string, at: number) {
  return page.evaluate(
    ([key, value]) => localStorage.setItem(key as string, value as string),
    [stashKey(id), JSON.stringify({ id, source, at })],
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
    expect(await stashes(b)).toEqual([]);
  });

  test('leaves a stash alone while the other tab holds the script', async ({ context }) => {
    const a = await openTab(context);
    await typeAtStart(a, 'Kept by A.\n');
    await expect.poll(async () => (await stored(a))[0]?.source).toContain('Kept by A.');
    const [row] = await stored(a);
    const stash = JSON.stringify({ id: row.id, source: 'A stash from A.', at: Date.now() + 5000 });
    await a.evaluate(([key, value]) => localStorage.setItem(key, value), [stashKey(row.id), stash]);

    const b = await openTab(context);
    await expect(bar(b)).toBeVisible();
    await expect(editor(b)).toContainText('Kept by A.');
    await expect(editor(b)).not.toContainText('A stash from A.');
    expect((await stored(b))[0].source).toContain('Kept by A.');
    // It is A's to clear.
    expect(await b.evaluate((key) => localStorage.getItem(key), stashKey(row.id))).toBe(stash);
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
    expect(await stashes(b)).toEqual([]);
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

  test('applies the text a closed tab left behind when another tab switches to that script', async ({
    context,
  }) => {
    const menuOf = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
    const openMenu = async (page: Page) => {
      await page.getByRole('button', { name: 'Open', exact: true }).click();
      await expect(menuOf(page)).toBeVisible();
    };
    const a = await openTab(context);
    await openMenu(a);
    await menuOf(a).getByRole('button', { name: 'New screenplay' }).click();
    await expect(menuOf(a)).toBeHidden();
    await editor(a).click();
    await a.keyboard.insertText('\nINT. ROOM - DAY\n\nFirst words.');
    await expect
      .poll(async () => (await stored(a)).some((p) => p.source.includes('First words.')))
      .toBe(true);
    const x = (await stored(a)).find((p) => p.source.includes('First words.')) as Row;

    // B finds the script held by A, so it shows it read-only, and moves to the sample.
    const b = await context.newPage();
    await b.goto('/');
    await expect(bar(b)).toBeVisible();
    await openMenu(b);
    await menuOf(b).getByRole('button', { name: 'Screenplay', exact: true }).click();
    await expect(menuOf(b)).toBeHidden();
    await expect(bar(b)).toHaveCount(0);

    // A types and closes at once. The newest text is usually only in the stash, with the
    // database behind it; if the timed write happened to commit first, it's in the database
    // and the stash was cleared. Either way it must not be lost.
    //
    // A real closing page runs `pagehide`, which is what leaves the stash. Playwright's `close`
    // does not promise that: WebKit sometimes drops the page without running it (about 1 run in
    // 20 here), and otherwise runs it just after `close` resolves. So leave the page first, which
    // runs `pagehide` and waits for it, then close the empty tab.
    await a.bringToFront();
    await editor(a).press('End');
    await a.keyboard.insertText(' LAST WORDS');
    await a.goto('about:blank');
    await a.close({ runBeforeUnload: false });
    await expect
      .poll(async () => {
        const stash = await b.evaluate((key) => localStorage.getItem(key), stashKey(x.id));
        const saved = (await stored(b)).find((p) => p.id === x.id)?.source ?? '';
        return `${stash ?? ''}${saved}`.includes('LAST WORDS');
      })
      .toBe(true);

    await openMenu(b);
    await menuOf(b)
      .locator('li', { hasText: 'Untitled Screenplay' })
      .getByRole('button')
      .first()
      .click();
    await expect(editor(b)).toContainText('First words.');
    await expect(editor(b)).toContainText('LAST WORDS');
    await expect
      .poll(async () => (await stored(b)).find((p) => p.id === x.id)?.source)
      .toContain('LAST WORDS');
    expect(await b.evaluate((key) => localStorage.getItem(key), stashKey(x.id))).toBeNull();
    expect(await isEditable(b)).toBe(true);
  });

  test('keeps the scripts menu from switching while the handover waits', async ({ context }) => {
    const a = await openTab(context);
    const b = await openTab(context);
    const [row] = await stored(a);
    // A transaction that keeps the projects store busy: A's flush, and so the handover, waits.
    await a.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const open = indexedDB.open('drafter');
          open.onsuccess = () => {
            const tx = open.result.transaction('projects', 'readwrite');
            const spin = () => {
              if ((window as unknown as { __hold?: boolean }).__hold === false) return;
              tx.objectStore('projects').count().onsuccess = spin;
            };
            (window as unknown as { __hold?: boolean }).__hold = true;
            spin();
            resolve();
          };
        }),
    );
    await typeAtStart(a, 'Typed during the handover.\n');
    await editHere(b).click();
    await expect(bar(a)).toBeVisible();

    // B is still waiting for A: choosing another script now would take the lock for the wrong one.
    await b.getByRole('button', { name: 'Open', exact: true }).click();
    const menu = b.getByRole('group', { name: 'Scripts', exact: true });
    await expect(menu).toBeVisible();
    for (const name of ['Screenplay', 'Stage play']) {
      await expect(menu.getByRole('button', { name, exact: true })).toBeDisabled();
    }

    await a.evaluate(() => {
      (window as unknown as { __hold?: boolean }).__hold = false;
    });
    await expect(bar(b)).toHaveCount(0);
    // B edits the script it asked for, with A's last words.
    await expect(editor(b)).toContainText('Typed during the handover.');
    expect((await stored(b)).find((p) => p.id === row.id)?.source).toContain(
      'Typed during the handover.',
    );
    // And the menu works again.
    if (!(await menu.isVisible())) {
      await b.getByRole('button', { name: 'Open', exact: true }).click();
    }
    await expect(menu.getByRole('button', { name: 'Stage play', exact: true })).toBeEnabled();
  });

  test('announces the read-only hint again when Save is tried twice', async ({ context }) => {
    await openTab(context);
    const b = await context.newPage();
    await watchAlerts(b);
    await b.goto('/');
    await expect(bar(b)).toBeVisible();
    const heard = async () =>
      (await alertsHeard(b)).filter((text) => text.includes('Edit here instead'));
    await b.keyboard.press('ControlOrMeta+s');
    await expect.poll(heard).toHaveLength(1);
    await b.keyboard.press('ControlOrMeta+s');
    await expect.poll(heard).toHaveLength(2);
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

  test('leaves a stash for the text it is still writing while it hands the script over', async ({
    context,
  }) => {
    const a = await openTab(context);
    const b = await openTab(context);
    const [row] = await stored(a);
    // A transaction that keeps the projects store busy: A's next write waits behind it.
    await a.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const open = indexedDB.open('drafter');
          open.onsuccess = () => {
            const tx = open.result.transaction('projects', 'readwrite');
            const spin = () => {
              if ((window as unknown as { __hold?: boolean }).__hold === false) return;
              tx.objectStore('projects').count().onsuccess = spin;
            };
            (window as unknown as { __hold?: boolean }).__hold = true;
            spin();
            resolve();
          };
        }),
    );
    await typeAtStart(a, 'Typed during the handover.\n');
    await editHere(b).click();
    // A is read-only at once and its write is still waiting.
    await expect(bar(a)).toBeVisible();
    await a.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
    });
    const left = await a.evaluate((key) => localStorage.getItem(key), stashKey(row.id));
    expect(left).toContain('Typed during the handover.');
    await a.evaluate(() => {
      (window as unknown as { __hold?: boolean }).__hold = false;
    });
    await expect(bar(b)).toHaveCount(0);
    await expect(editor(b)).toContainText('Typed during the handover.');
  });

  test('announces the bar from a status region that was already in the page', async ({
    context,
  }) => {
    const a = await openTab(context);
    const region = a.locator('p[role="status"]');
    await expect(region).toHaveCount(1);
    await expect(region).toHaveText('');
    await region.evaluate((el) => {
      el.setAttribute('data-mark', 'same');
    });
    const b = await openTab(context);
    await editHere(b).click();
    await expect(bar(a)).toBeVisible();
    await expect(a.locator('p[role="status"][data-mark="same"]')).toContainText(
      'This script is open for editing in another tab.',
    );
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

// The tab row (Phase 2 design §5.8): Cards and Notes are not core tabs, so they share the slot and
// More with module tabs, first in More.
test.describe('the tab row’s slot', () => {
  test('chooses Cards from More, which then takes the slot', async ({ page }) => {
    await start(page);
    const pane = page.locator('[data-pane]').first();
    const row = pane.getByRole('tablist');
    const more = pane.getByRole('button', { name: 'More tabs' });
    const menu = page.getByRole('menu', { name: 'More tabs' });
    // On the emulated phone WebKit a tap is now and then ignored (the Plan 4 deferred list), so
    // More is tapped again until its menu is open.
    const openMore = () =>
      expect(async () => {
        if (!(await menu.isVisible())) await more.click();
        await expect(menu).toBeVisible({ timeout: 1000 });
      }).toPass();
    await expect(row.getByRole('tab')).toHaveText([
      'Source',
      'Script',
      /^Problems/,
      'Outline',
      'Cards',
    ]);
    // Notes from More takes the slot; Cards goes to More.
    await openMore();
    await expect(menu.getByRole('menuitem')).toHaveText(['Notes']);
    await menu.getByRole('menuitem', { name: 'Notes' }).click();
    await expect(menu).toBeHidden();
    await expect(row.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');
    await expect(row.getByRole('tab', { name: 'Cards' })).toHaveCount(0);
    // Then Cards from More: it takes the slot, and focus goes to its tab.
    await openMore();
    await expect(menu.getByRole('menuitem')).toHaveText(['Cards']);
    await menu.getByRole('menuitem', { name: 'Cards' }).click();
    await expect(menu).toBeHidden();
    const cards = row.getByRole('tab', { name: 'Cards' });
    await expect(cards).toHaveAttribute('aria-selected', 'true');
    await expect(cards).toBeFocused();
    await expect(page.getByRole('listbox', { name: 'Cards' })).toBeVisible();
    // Back to a core tab: Cards keeps the slot.
    await row.getByRole('tab', { name: 'Outline' }).click();
    await expect(row.getByRole('tab').last()).toHaveText('Cards');
  });
});
