import { expect, type Page, test } from '@playwright/test';

// Opening the command palette again and again must keep working: on Firefox, Enter was sometimes
// ignored on a later opening. Each run here is ten openings in a row, one script, no reload.

const ROUNDS = 10;
const editor = (page: Page) => page.locator('.cm-content');
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const query = (page: Page) => palette(page).locator('input');
const settings = (page: Page) => page.getByRole('dialog', { name: 'Settings' });

async function start(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toBeAttached();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open('drafter');
            open.onerror = () => resolve(false);
            open.onsuccess = () => {
              const db = open.result;
              const ok = db.objectStoreNames.contains('projects');
              db.close();
              resolve(ok);
            };
          }),
      ),
    )
    .toBe(true);
}

/** What the palette looked like when Enter was pressed, for the failure message. */
function snapshot(page: Page) {
  return page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('.palette input');
    const rows = [...document.querySelectorAll('.palette [role="option"]')];
    return {
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      focus: `${document.activeElement?.tagName}.${document.activeElement?.className}`,
      inputFocused: !!input && document.activeElement === input,
      value: input?.value,
      active: input?.getAttribute('aria-activedescendant'),
      rows: rows.map(
        (r) =>
          `${r.textContent?.trim().slice(0, 20)}${r.hasAttribute('data-highlighted') ? ' *' : ''}`,
      ),
    };
  });
}

/** Opens the palette, types `text`, and presses Enter on the first match, as a writer would. */
async function run(page: Page, text: string, first: RegExp) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeVisible();
  await expect(query(page)).toBeFocused();
  await expect(palette(page).locator('[role="option"][data-highlighted]')).toHaveCount(1);
  await page.keyboard.insertText(text);
  const row = palette(page).getByRole('option', { name: first });
  await expect(row.first()).toBeVisible();
  await expect(palette(page).getByRole('option').first()).toHaveAccessibleName(first);
  await expect(palette(page).getByRole('option').first()).toHaveAttribute('data-highlighted', '');
  const before = await snapshot(page);
  await page.keyboard.press('Enter');
  return before;
}

test.describe('the palette, opened again and again', () => {
  test.beforeEach(async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 700, 'a phone has no keyboard to start from');
    await start(page);
    await editor(page).click();
  });

  for (const how of ['Done', 'Escape'] as const) {
    test(`runs Settings every time, closed with ${how}`, async ({ page }) => {
      for (let i = 1; i <= ROUNDS; i++) {
        const before = await run(page, 'Settings', /^Settings…/);
        await expect(
          settings(page),
          `round ${i}: Enter did nothing; palette was ${JSON.stringify(before)}`,
        ).toBeVisible({ timeout: 3000 });
        await expect(palette(page)).toBeHidden();
        if (how === 'Done') await settings(page).getByRole('button', { name: 'Done' }).click();
        else await page.keyboard.press('Escape');
        await expect(settings(page)).toBeHidden();
      }
    });
  }

  test('toggles line numbers every time', async ({ page }) => {
    const bar = page.getByRole('button', { name: 'Line numbers', exact: true });
    for (let i = 1; i <= ROUNDS; i++) {
      const showing = i % 2 === 1;
      const before = await run(
        page,
        'line numbers',
        showing ? /^Show line numbers/ : /^Hide line numbers/,
      );
      await expect(
        bar,
        `round ${i}: Enter did nothing; palette was ${JSON.stringify(before)}`,
      ).toHaveAttribute('aria-pressed', showing ? 'true' : 'false', { timeout: 3000 });
      await expect(palette(page)).toBeHidden();
    }
  });

  test('alternates the key and the palette for Settings, with a switch changed in between', async ({
    page,
  }) => {
    const spell = settings(page).getByRole('switch', { name: 'Spellcheck' });
    for (let i = 1; i <= ROUNDS; i++) {
      await page.keyboard.press('ControlOrMeta+,');
      await expect(settings(page), `round ${i}: Mod+, did nothing`).toBeVisible();
      await spell.click();
      await settings(page).getByRole('button', { name: 'Done' }).click();
      await expect(settings(page)).toBeHidden();
      const before = await run(page, 'Settings', /^Settings…/);
      await expect(
        settings(page),
        `round ${i}: Enter did nothing; palette was ${JSON.stringify(before)}`,
      ).toBeVisible({ timeout: 3000 });
      await spell.click();
      await page.keyboard.press('Escape');
      await expect(settings(page)).toBeHidden();
    }
  });

  test('runs Settings when the typing starts the moment the palette opens', async ({ page }) => {
    for (let i = 1; i <= ROUNDS; i++) {
      await page.keyboard.press('ControlOrMeta+k');
      await page.keyboard.type('Settings', { delay: 5 });
      await expect(palette(page).getByRole('option').first()).toHaveAccessibleName(/^Settings…/);
      const before = await snapshot(page);
      // A writer presses Enter once the row looks chosen: the app must have chosen one by then.
      await expect(
        palette(page).locator('[role="option"][data-highlighted]'),
        `round ${i}: nothing highlighted; palette was ${JSON.stringify(before)}`,
      ).toHaveCount(1, { timeout: 3000 });
      await page.keyboard.press('Enter');
      await expect(
        settings(page),
        `round ${i}: Enter did nothing; palette was ${JSON.stringify(before)}`,
      ).toBeVisible({ timeout: 3000 });
      await page.keyboard.press('Escape');
      await expect(settings(page)).toBeHidden();
    }
  });

  // Settings keeps its open state in `settingsOpen`, and the browser reports a dialog closed by Escape
  // a moment after it is hidden: a reopen in that moment (a key, or the palette's Settings command
  // on a slow machine) found the state still open and did nothing.
  test('reopens Settings when Mod+, follows Escape at once', async ({ page }) => {
    for (let i = 1; i <= ROUNDS; i++) {
      await page.keyboard.press('ControlOrMeta+,');
      await expect(settings(page), `round ${i}: first Mod+,`).toBeVisible();
      await page.keyboard.press('Escape');
      await page.keyboard.press('ControlOrMeta+,');
      await expect(settings(page), `round ${i}: Mod+, after Escape`).toBeVisible();
      // And it stays: no late close takes it away.
      await page.waitForTimeout(150);
      await expect(settings(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(settings(page)).toBeHidden();
    }
  });

  test('reopens Settings when Mod+, follows Done at once', async ({ page }) => {
    for (let i = 1; i <= ROUNDS; i++) {
      await page.keyboard.press('ControlOrMeta+,');
      await expect(settings(page)).toBeVisible();
      await settings(page).getByRole('button', { name: 'Done' }).click();
      await page.keyboard.press('ControlOrMeta+,');
      await page.waitForTimeout(150);
      await expect(settings(page), `round ${i}: Mod+, after Done`).toBeVisible();
      await settings(page).getByRole('button', { name: 'Done' }).click();
      await expect(settings(page)).toBeHidden();
    }
  });
});
