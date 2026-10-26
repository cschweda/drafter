import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`);
}

const status = (page: Page) => page.locator('[data-tour="status"]');
const editor = (page: Page) => page.locator('.cm-content');
const warning = (page: Page) => page.locator('[data-warning]');

/** Makes `navigator.storage.persisted` and `persist` answer `granted`. */
async function stubPersistence(page: Page, granted: boolean) {
  await page.addInitScript((value) => {
    // The whole object: WebKit does not let a method be set on the real one.
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persisted: async () => value, persist: async () => value },
    });
  }, granted);
}

/**
 * Makes every attempt to open IndexedDB fail, as it does when site data is blocked, until
 * `mendIndexedDb` is called.
 */
async function breakIndexedDb(page: Page) {
  await page.addInitScript(() => {
    const open = indexedDB.open.bind(indexedDB);
    const mend = window as unknown as { indexedDbDown: boolean };
    mend.indexedDbDown = true;
    indexedDB.open = (...args: Parameters<typeof open>) => {
      if (mend.indexedDbDown) {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      }
      return open(...args);
    };
  });
}
const mendIndexedDb = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { indexedDbDown: boolean }).indexedDbDown = false;
  });

interface Row {
  id: string;
  title: string;
  source: string;
  sample?: string;
  updatedAt: number;
}

/** The projects as the app stored them; none while its database doesn't exist yet. */
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

/** Adds a project to the app's database (the app has opened it already). */
function seed(page: Page, source: string, updatedAt: number, sample = false) {
  return page.evaluate(
    ({ source, updatedAt, sample }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('projects', 'readwrite');
          tx.objectStore('projects').put({
            id: crypto.randomUUID(),
            title: 'Seeded',
            templateId: 'us-screenplay',
            source,
            lineBreak: '\n',
            meta: null,
            ...(sample ? { sample: 'screenplay' } : {}),
            createdAt: updatedAt,
            updatedAt,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { source, updatedAt, sample },
  );
}

/** Opens the app and waits until its first project is in the database. */
async function start(page: Page) {
  await page.goto('/');
  await expect.poll(async () => (await stored(page)).length).toBeGreaterThan(0);
  await expect(editor(page)).toBeVisible();
}

/** Types at the very start, which is on screen after a reload. */
async function typeAtStart(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.insertText(text);
}

async function typeAtEnd(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(text);
}

test.describe('the recovery copy', () => {
  test.skip(({ isMobile }) => !!isMobile, 'the editor is the same on a phone; see the axe test');

  test('restores your text after a reload', async ({ page }) => {
    await start(page);
    await typeAtStart(page, 'A line that must survive.\n');
    await expect.poll(async () => (await stored(page))[0]?.source).toContain('must survive');
    await page.reload();
    await expect(editor(page)).toContainText('A line that must survive.');
  });

  test('keeps the last keystrokes when the page closes at once', async ({ page }) => {
    await start(page);
    await typeAtStart(page, 'Typed a moment ago.\n');
    // Well inside the 750 ms the writer waits.
    await page.reload();
    await expect(editor(page)).toContainText('Typed a moment ago.');
  });

  test('does not undo the restored text away', async ({ page }) => {
    await start(page);
    await typeAtStart(page, 'Kept.\n');
    await expect.poll(async () => (await stored(page))[0]?.source).toContain('Kept.');
    await page.reload();
    await expect(editor(page)).toContainText('Kept.');
    // The reopened script has its own, empty undo history.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor(page)).toContainText('Kept.');
  });

  test('opens the most recent script', async ({ page }) => {
    await start(page);
    const now = Date.now();
    await seed(page, 'INT. OLDER ROOM - DAY\n\nThe older script.\n', now + 1000);
    await seed(page, 'INT. NEWER ROOM - DAY\n\nThe newer script.\n', now + 2000);
    await page.reload();
    await expect(editor(page)).toContainText('The newer script.');
    await expect(editor(page)).not.toContainText('The older script.');
    await expect(editor(page)).not.toContainText('Title: The Call');
  });

  test.describe('its state in the status bar', () => {
    test('says the recovery copy is kept when storage is persistent', async ({ page }) => {
      await stubPersistence(page, true);
      // A warning that appears for an instant is announced too, so watch from the first node.
      await page.addInitScript(() => {
        const seen = window as unknown as { sawWarning: boolean };
        seen.sawWarning = false;
        new MutationObserver(() => {
          if (document.querySelector('[data-warning]')) seen.sawWarning = true;
        }).observe(document, { childList: true, subtree: true });
      });
      await page.goto('/');
      await expect(status(page).getByRole('button', { name: /Recovery copy/ })).toHaveText(
        'Recovery copy: kept in this browser',
      );
      await expect(warning(page)).toHaveCount(0);
      expect(
        await page.evaluate(() => (window as unknown as { sawWarning: boolean }).sawWarning),
      ).toBe(false);
    });

    test('warns that the recovery copy may be cleared, and the warning can be dismissed', async ({
      page,
    }) => {
      await stubPersistence(page, false);
      await page.goto('/');
      await expect(status(page).getByRole('button', { name: /Recovery copy/ })).toHaveText(
        'Recovery copy: may be cleared',
      );
      await expect(warning(page)).toBeVisible();
      await expect(page.locator('[role="status"] [data-warning]')).toBeVisible();
      await expect(warning(page)).toContainText('may clear');
      await warning(page).getByRole('button', { name: 'Dismiss' }).click();
      await expect(warning(page)).toHaveCount(0);
      // The status bar still says so.
      await expect(status(page)).toContainText('Recovery copy: may be cleared');
    });

    test('keeps its live regions in the page, and puts each warning in the right one', async ({
      page,
    }) => {
      await stubPersistence(page, false);
      // The regions have to be in the page before a warning is put in one, or it is not announced.
      await page.addInitScript(() => {
        const seen = window as unknown as { regionBeforeWarning: boolean };
        seen.regionBeforeWarning = false;
        new MutationObserver(() => {
          if (
            document.querySelector('[data-warning-region]') &&
            !document.querySelector('[data-warning]')
          ) {
            seen.regionBeforeWarning = true;
          }
        }).observe(document, { childList: true, subtree: true });
      });
      await page.goto('/');
      const polite = page.locator('[role="status"][data-warning-region]');
      const urgent = page.locator('[role="alert"][data-warning-region]');
      await expect(polite.locator('[data-warning="not-persistent"]')).toBeVisible();
      await expect(urgent).toHaveCount(1);
      await expect(urgent.locator('[data-warning]')).toHaveCount(0);
      expect(
        await page.evaluate(
          () => (window as unknown as { regionBeforeWarning: boolean }).regionBeforeWarning,
        ),
      ).toBe(true);
      // Dismissed, the region stays and only its text goes.
      await warning(page).getByRole('button', { name: 'Dismiss' }).click();
      await expect(polite).toHaveCount(1);
      await expect(polite.locator('[data-warning]')).toHaveCount(0);
    });

    test('puts “unavailable” in an alert region that was already there', async ({ page }) => {
      await breakIndexedDb(page);
      await page.goto('/');
      const urgent = page.locator('[role="alert"][data-warning-region]');
      await expect(urgent.locator('[data-warning="unavailable"]')).toContainText('only in memory');
      await expect(page.locator('[role="status"][data-warning-region]')).toHaveCount(1);
      await expect(page.locator('[role="status"][data-warning-region] [data-warning]')).toHaveCount(
        0,
      );
    });

    test('dismisses the warning from the keyboard', async ({ page }) => {
      await stubPersistence(page, false);
      await page.goto('/');
      const dismiss = warning(page).getByRole('button', { name: 'Dismiss' });
      await dismiss.focus();
      await page.keyboard.press('Space');
      await expect(warning(page)).toHaveCount(0);
    });

    test('asks the browser to keep storage when the first script is created', async ({ page }) => {
      await page.addInitScript(() => {
        (window as unknown as { persistCalls: number }).persistCalls = 0;
        Object.defineProperty(navigator, 'storage', {
          configurable: true,
          value: {
            persisted: async () => true,
            persist: async () => {
              (window as unknown as { persistCalls: number }).persistCalls++;
              return true;
            },
          },
        });
      });
      await start(page);
      await expect
        .poll(() =>
          page.evaluate(() => (window as unknown as { persistCalls: number }).persistCalls),
        )
        .toBe(1);
      // A second launch has a project already: no new request.
      await page.reload();
      await expect(status(page)).toContainText('Recovery copy:');
      await expect
        .poll(() =>
          page.evaluate(() => (window as unknown as { persistCalls: number }).persistCalls),
        )
        .toBe(0);
    });

    test('keeps editing and warns when IndexedDB is unavailable', async ({ page }) => {
      await breakIndexedDb(page);
      await page.goto('/');
      await expect(editor(page)).toContainText('Title: The Call');
      await expect(status(page).getByRole('button', { name: /Recovery copy/ })).toHaveText(
        'Recovery copy: unavailable',
      );
      await expect(warning(page)).toBeVisible();
      // It matters most, so it is announced at once.
      await expect(page.locator('[role="alert"] [data-warning]')).toBeVisible();
      await expect(warning(page)).toContainText('only in memory');
      await typeAtEnd(page, '\n\nStill typing.');
      await expect(editor(page)).toContainText('Still typing.');
      // It has no way to dismiss, and it stays.
      await page.waitForTimeout(1500);
      await expect(warning(page)).toBeVisible();
      await expect(warning(page).getByRole('button', { name: 'Dismiss' })).toHaveCount(0);
    });

    test('starts keeping the recovery copy when IndexedDB comes back, with the text typed meanwhile', async ({
      page,
    }) => {
      await stubPersistence(page, true);
      await breakIndexedDb(page);
      await page.clock.install();
      await page.goto('/');
      await expect(status(page)).toContainText('Recovery copy: unavailable');
      await typeAtEnd(page, '\n\nTyped while storage was down.');
      await mendIndexedDb(page);
      await page.clock.runFor(30_000);
      await expect(status(page)).toContainText('Recovery copy: kept in this browser');
      // The text in the editor became a script of its own, and is still open.
      await expect(editor(page)).toContainText('Typed while storage was down.');
      await expect
        .poll(async () => (await stored(page)).map((row) => row.source).join('|'))
        .toContain('Typed while storage was down.');
    });

    test('explains the recovery copy from its button, with the keyboard', async ({ page }) => {
      await stubPersistence(page, false);
      await page.goto('/');
      const button = status(page).getByRole('button', { name: /Recovery copy/ });
      await expect(button).toBeVisible();
      await button.focus();
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await page.keyboard.press('Enter');
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      const explanation = page.locator(`#${await button.getAttribute('aria-controls')}`);
      await expect(explanation).toBeVisible();
      await expect(explanation).toContainText('clear');
      await page.keyboard.press('Escape');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(explanation).toBeHidden();
    });
  });

  test.describe('a failing write', () => {
    // Makes IndexedDB's put throw while `window.failWrites` is set (a full disk, blocked site data).
    async function failWritesOnDemand(page: Page) {
      await page.addInitScript(() => {
        const put = IDBObjectStore.prototype.put;
        (window as unknown as { failWrites: boolean }).failWrites = false;
        IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
          if ((window as unknown as { failWrites: boolean }).failWrites) {
            throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
          }
          return put.apply(this, args);
        };
      });
    }
    const failWrites = (page: Page, on: boolean) =>
      page.evaluate((value) => {
        (window as unknown as { failWrites: boolean }).failWrites = value;
      }, on);
    const recovery = (page: Page) => status(page).getByRole('button', { name: /Recovery copy/ });

    test('reports the recovery copy as unavailable, and clears when the next change is kept', async ({
      page,
    }) => {
      await stubPersistence(page, true);
      await failWritesOnDemand(page);
      await start(page);
      await expect(recovery(page)).toHaveText('Recovery copy: kept in this browser');
      await failWrites(page, true);
      await typeAtEnd(page, '\n\nNot written.');
      await expect(recovery(page)).toHaveText('Recovery copy: unavailable');
      await expect(warning(page)).toBeVisible();
      // Storage works again; the next change writes the text that was waiting.
      await failWrites(page, false);
      await page.keyboard.insertText(' Written now.');
      await expect(recovery(page)).toHaveText('Recovery copy: kept in this browser');
      await expect(warning(page)).toHaveCount(0);
      await expect
        .poll(async () => (await stored(page))[0]?.source)
        .toContain('Not written. Written now.');
    });

    test('tries again by itself every 30 seconds', async ({ page }) => {
      await stubPersistence(page, true);
      await failWritesOnDemand(page);
      await start(page);
      await page.clock.install();
      await failWrites(page, true);
      await typeAtEnd(page, '\n\nWaiting.');
      await page.clock.runFor(1000);
      await expect(recovery(page)).toHaveText('Recovery copy: unavailable');
      // Still failing after one retry.
      await page.clock.runFor(30_000);
      await expect(recovery(page)).toHaveText('Recovery copy: unavailable');
      await failWrites(page, false);
      await page.clock.runFor(30_000);
      await expect(recovery(page)).toHaveText('Recovery copy: kept in this browser');
      await expect.poll(async () => (await stored(page))[0]?.source).toContain('Waiting.');
    });
  });

  test.describe('the first item of the status bar', () => {
    test('says a sample keeps its edits in this browser', async ({ page }) => {
      await page.goto('/');
      await expect(status(page)).toContainText('Sample · your edits stay in this browser');
    });

    test('says a script with no file is not saved to one', async ({ page }) => {
      await start(page);
      await seed(page, 'INT. ROOM - DAY\n\nNo file yet.\n', Date.now() + 1000);
      await page.reload();
      await expect(editor(page)).toContainText('No file yet.');
      await expect(status(page)).toContainText('Not saved to a file yet');
      await expect(status(page)).not.toContainText('Sample');
    });

    test('shows the script’s title in the Source pane’s bar', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('.slim').filter({ hasText: 'The Call' }).first()).toBeVisible();
    });
  });

  test.describe('leaving the page', () => {
    // Closing runs the page's beforeunload handlers. A page that registers
    // one raises a dialog, and stays open; one that doesn't closes.
    async function leave(page: Page): Promise<'dialog' | 'closed'> {
      const outcome = new Promise<'dialog' | 'closed'>((resolve) => {
        page.once('dialog', (dialog) => {
          expect(dialog.type()).toBe('beforeunload');
          void dialog.dismiss();
          resolve('dialog');
        });
        page.once('close', () => resolve('closed'));
      });
      await page.close({ runBeforeUnload: true });
      return outcome;
    }

    // Whether the page has a beforeunload handler that asks: it cancels the
    // event. Each browser's own closing is too different to rely on for the
    // quiet cases (WebKit doesn't close at all), so this reads it directly.
    const asks = (page: Page) =>
      page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      });

    test('never asks before leaving a sample', async ({ page }) => {
      await start(page);
      await typeAtEnd(page, '\n\nEdited a sample.');
      await expect(editor(page)).toContainText('Edited a sample.');
      expect(await asks(page)).toBe(false);
    });

    test('closes a sample with edits without a dialog', async ({ page, browserName }) => {
      test.skip(browserName === 'webkit', 'WebKit leaves the page open when it is closed this way');
      await start(page);
      await typeAtEnd(page, '\n\nEdited a sample.');
      expect(await leave(page)).toBe('closed');
    });

    test('asks before leaving a script with changes', async ({ page }) => {
      await start(page);
      await seed(page, 'INT. ROOM - DAY\n\nMine.\n', Date.now() + 1000);
      await page.reload();
      await expect(editor(page)).toContainText('Mine.');
      await typeAtEnd(page, '\n\nUnsaved.');
      await expect(editor(page)).toContainText('Unsaved.');
      expect(await asks(page)).toBe(true);
      expect(await leave(page)).toBe('dialog');
    });

    test('still asks about a script with no file after a reload', async ({ page }) => {
      await start(page);
      await seed(page, 'INT. ROOM - DAY\n\nMine.\n', Date.now() + 1000);
      await page.reload();
      await expect(editor(page)).toContainText('Mine.');
      expect(await asks(page)).toBe(true);
    });

    test('asks before leaving a sample when nothing can keep the edits', async ({ page }) => {
      await breakIndexedDb(page);
      await page.goto('/');
      await expect(editor(page)).toContainText('Title: The Call');
      expect(await asks(page)).toBe(false);
      await typeAtEnd(page, '\n\nOnly in memory.');
      await expect(editor(page)).toContainText('Only in memory.');
      expect(await asks(page)).toBe(true);
    });
  });
});

test.describe('the storage warnings', () => {
  const themes = ['dark', 'light'] as const;

  async function useLightTheme(page: Page) {
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
  }

  test('have no accessibility violations when "may be cleared" shows', async ({ page }) => {
    await stubPersistence(page, false);
    await page.goto('/');
    await expect(warning(page)).toBeVisible();
    for (const theme of themes) {
      if (theme === 'light') await useLightTheme(page);
      expect(await violations(page), theme).toEqual([]);
    }
  });

  test('have no accessibility violations when the copy is unavailable', async ({ page }) => {
    await breakIndexedDb(page);
    await page.goto('/');
    await expect(warning(page)).toBeVisible();
    for (const theme of themes) {
      if (theme === 'light') await useLightTheme(page);
      expect(await violations(page), theme).toEqual([]);
    }
  });

  test('have no accessibility violations with the explanation open', async ({ page }) => {
    await stubPersistence(page, false);
    await page.goto('/');
    await status(page)
      .getByRole('button', { name: /Recovery copy/ })
      .click();
    expect(await violations(page)).toEqual([]);
  });
});

const stashKey = (id: string) => `drafter:unwritten:${id}`;

function leaveStash(page: Page, id: string, source: string, at: number) {
  return page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [stashKey(id), JSON.stringify({ id, source, at })],
  );
}

const stashLeft = (page: Page, id: string) =>
  page.evaluate((key) => localStorage.getItem(key), stashKey(id));

test.describe('the text a closing page left behind', () => {
  test.skip(({ isMobile }) => !!isMobile, 'the launch is the same on a phone');

  test('is written when it is newer than the stored copy', async ({ page }) => {
    await start(page);
    const [row] = await stored(page);
    await leaveStash(page, row.id, 'INT. LEFT - DAY\n\nFrom the stash.\n', Date.now() + 1000);
    await page.reload();
    await expect(editor(page)).toContainText('From the stash.');
    await expect.poll(async () => (await stored(page))[0]?.source).toContain('From the stash.');
    expect(await stashLeft(page, row.id)).toBeNull();
  });

  test('is ignored when the stored copy is newer', async ({ page }) => {
    await start(page);
    const [row] = await stored(page);
    await leaveStash(page, row.id, 'From a stale stash.', row.updatedAt - 1000);
    await page.reload();
    await expect(editor(page)).toContainText('Title: The Call');
    await expect(editor(page)).not.toContainText('From a stale stash.');
    expect((await stored(page))[0].source).toBe(row.source);
    // It is no use to anyone now.
    expect(await stashLeft(page, row.id)).toBeNull();
  });

  test('is not written to another script', async ({ page }) => {
    await start(page);
    const [first] = await stored(page);
    const now = Date.now();
    await seed(page, 'INT. OTHER ROOM - DAY\n\nThe other script.\n', now + 5000);
    const [, other] = (await stored(page)).sort((a, b) => a.updatedAt - b.updatedAt);
    await leaveStash(page, first.id, 'INT. FIRST - DAY\n\nFirst script only.\n', now + 9000);
    await page.reload();
    await expect(editor(page)).toContainText('First script only.');
    const rows = await stored(page);
    expect(rows.find((r) => r.id === other.id)?.source).toBe(
      'INT. OTHER ROOM - DAY\n\nThe other script.\n',
    );
    expect(rows.find((r) => r.id === first.id)?.source).toContain('First script only.');
    expect(rows.find((r) => r.id === other.id)?.source).not.toContain('First script only.');
  });

  test('keeps one stash for each script', async ({ page }) => {
    await start(page);
    const [first] = await stored(page);
    const now = Date.now();
    await seed(page, 'INT. OTHER ROOM - DAY\n\nThe other script.\n', now + 5000);
    const other = (await stored(page)).find((r) => r.id !== first.id) as Row;
    await leaveStash(page, first.id, 'First, left behind.', now + 9000);
    await leaveStash(page, other.id, 'Other, left behind.', now + 9000);
    await page.reload();
    await expect
      .poll(async () => (await stored(page)).map((r) => r.source).sort())
      .toEqual(['First, left behind.', 'Other, left behind.']);
    expect(await stashLeft(page, first.id)).toBeNull();
    expect(await stashLeft(page, other.id)).toBeNull();
  });

  test('is applied when the same tab switches to that script, and stays after a reload', async ({
    page,
  }) => {
    await start(page);
    const now = Date.now();
    const seeded = 'INT. OTHER ROOM - DAY\n\nThe stored words.\n';
    await seed(page, seeded, now);
    const other = (await stored(page)).find((r) => r.source === seeded) as Row;
    // What a tab closing on that script leaves: newer than the stored copy, which is old.
    await leaveStash(page, other.id, `${seeded}LAST WORDS`, now + 5000);

    await page.getByRole('button', { name: 'Open', exact: true }).click();
    const menu = page.getByRole('group', { name: 'Scripts' });
    await menu.locator('li', { hasText: 'Seeded' }).getByRole('button').first().click();
    await expect(editor(page)).toContainText('The stored words.');
    await expect(editor(page)).toContainText('LAST WORDS');
    await expect
      .poll(async () => (await stored(page)).find((r) => r.id === other.id)?.source)
      .toContain('LAST WORDS');
    expect(await stashLeft(page, other.id)).toBeNull();

    // Typing on top of it, and a reload, keep all of it.
    await typeAtEnd(page, '!');
    await expect
      .poll(async () => (await stored(page)).find((r) => r.id === other.id)?.source)
      .toContain('LAST WORDS!');
    await page.reload();
    await expect(editor(page)).toContainText('LAST WORDS!');
  });

  test('is left alone when the same tab switches to a script the stored copy is newer than', async ({
    page,
  }) => {
    await start(page);
    const now = Date.now();
    const seeded = 'INT. OTHER ROOM - DAY\n\nThe stored words.\n';
    await seed(page, seeded, now);
    const other = (await stored(page)).find((r) => r.source === seeded) as Row;
    await leaveStash(page, other.id, 'A stale stash.', now - 5000);

    await page.getByRole('button', { name: 'Open', exact: true }).click();
    const menu = page.getByRole('group', { name: 'Scripts' });
    await menu.locator('li', { hasText: 'Seeded' }).getByRole('button').first().click();
    await expect(editor(page)).toContainText('The stored words.');
    await expect(editor(page)).not.toContainText('A stale stash.');
    expect(await stashLeft(page, other.id)).toBeNull();
    expect((await stored(page)).find((r) => r.id === other.id)?.source).toBe(seeded);
  });

  test('is cleared when its script is gone', async ({ page }) => {
    await start(page);
    const before = await stored(page);
    await leaveStash(page, 'a-script-that-was-deleted', 'Nobody wants this.', Date.now() + 1000);
    await page.reload();
    await expect(editor(page)).toContainText('Title: The Call');
    expect(await stashLeft(page, 'a-script-that-was-deleted')).toBeNull();
    expect(await stored(page)).toEqual(before);
  });

  test('keeps text typed before the database answers', async ({ page }) => {
    // A first visit whose IndexedDB takes a while to open.
    await page.addInitScript(() => {
      const open = indexedDB.open.bind(indexedDB);
      indexedDB.open = (...args: Parameters<typeof open>) => {
        const request = open(...args);
        return new Proxy(request, {
          set(target, property, value) {
            if (property === 'onsuccess') {
              target.onsuccess = (event) => {
                setTimeout(() => value.call(target, event), 1500);
              };
              return true;
            }
            Reflect.set(target, property, value);
            return true;
          },
          get(target, property) {
            const value = Reflect.get(target, property);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      };
    });
    await page.goto('/');
    await expect(editor(page)).toContainText('Title: The Call');
    await typeAtEnd(page, '\n\nTyped while it opened.');
    await expect
      .poll(async () => (await stored(page)).length, { timeout: 15000 })
      .toBeGreaterThan(0);
    await expect
      .poll(async () => (await stored(page)).map((r) => r.source).join('|'), { timeout: 15000 })
      .toContain('Typed while it opened.');
    await expect(editor(page)).toContainText('Typed while it opened.');
  });
});
