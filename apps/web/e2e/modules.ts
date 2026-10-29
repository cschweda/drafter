import { expect, type Page } from '@playwright/test';

// Helpers for the specs that try the module host. `pnpm e2e` builds with the test module, the
// Fixture, which has a button ("Count scenes"), a tab ("Fixture"), a command ("Fixture: add a
// note"), and asks for the network (example.invalid) before it is turned on.

export const editor = (page: Page) => page.locator('.cm-content');
export const settingsDialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
export const consentDialog = (page: Page) => page.getByRole('dialog', { name: 'Turn on Fixture?' });
export const fixtureSwitch = (page: Page) =>
  settingsDialog(page).getByRole('switch', { name: 'Fixture' });
export const countScenes = (page: Page) => page.getByRole('button', { name: 'Count scenes' });
export const fixtureTab = (page: Page) => page.getByRole('tab', { name: 'Fixture' });
export const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
export const paletteInput = (page: Page) => palette(page).locator('input');

/** Loads the app and waits until the script is open and the module choices have been read. */
export async function start(page: Page) {
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

/** The Source tab, which a phone doesn't show to begin with. */
export async function showSource(page: Page) {
  if (!(await editor(page).isVisible())) {
    await page.getByRole('tab', { name: 'Source' }).first().click();
  }
  await expect(editor(page)).toBeVisible();
}

export async function openSettings(page: Page) {
  await page.keyboard.press('ControlOrMeta+,');
  await expect(settingsDialog(page)).toBeVisible();
}

export async function closeSettings(page: Page) {
  await settingsDialog(page).getByRole('button', { name: 'Done' }).click();
  await expect(settingsDialog(page)).toBeHidden();
}

/** Turns the Fixture on in Settings, saying yes to the question about the network. */
export async function turnOnFixture(page: Page) {
  await openSettings(page);
  await fixtureSwitch(page).click();
  await expect(consentDialog(page)).toBeVisible();
  await consentDialog(page).getByRole('button', { name: 'Turn on' }).click();
  await expect(fixtureSwitch(page)).toBeChecked();
  await closeSettings(page);
  await expect(countScenes(page)).toBeVisible();
}

/** Replaces the script with `text`, typed in one go. */
export async function setText(page: Page, text: string) {
  await showSource(page);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
}

/** The script's text, line by line. */
export const textOf = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.cm-content .cm-line'))
      .map((line) => line.textContent ?? '')
      .join('\n'),
  );

/** Opens the palette from the keyboard and runs the command called `title`. */
export async function runCommand(page: Page, title: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeVisible();
  await expect(paletteInput(page)).toBeFocused();
  await expect(palette(page).locator('[role="option"][data-highlighted]')).toHaveCount(1);
  await page.keyboard.insertText(title);
  const row = palette(page).getByRole('option', { name: title, exact: true });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('data-highlighted', '');
  await page.keyboard.press('Enter');
  await expect(palette(page)).toBeHidden();
}

/** The pane that holds Problems when it is chosen: the right pane, or the only one on a phone. */
export const lastPane = (page: Page) => page.locator('[data-pane]').last();
export const problemsTab = (page: Page) => lastPane(page).getByRole('tab', { name: /^Problems/ });
export const problemsList = (page: Page) => page.getByRole('tabpanel', { name: /^Problems/ });

export async function showProblems(page: Page) {
  await problemsTab(page).click();
  await expect(problemsList(page)).toBeVisible();
}

/**
 * Chooses the tab called `name` in the first pane: from the tab row, or from More when it isn't
 * in the row (Phase 2 design §5.8: the core tabs, one slot, then More).
 */
export async function chooseTab(page: Page, name: string) {
  const pane = page.locator('[data-pane]').first();
  const tab = pane.getByRole('tab', { name, exact: true });
  if ((await tab.count()) > 0) {
    await tab.click();
    return;
  }
  await pane.getByRole('button', { name: 'More tabs' }).click();
  await page
    .getByRole('menu', { name: 'More tabs' })
    .getByRole('menuitem', { name, exact: true })
    .click();
}

/** What the settings table holds, a row to a setting. */
export function stored(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve({});
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('settings').objectStore('settings').getAll();
          request.onsuccess = () => {
            db.close();
            resolve(
              Object.fromEntries(
                (request.result as Array<{ key: string; value: unknown }>)
                  // The samples met, which the tests start with (playwright.config.ts), are not settings.
                  .filter((r) => !r.key.startsWith('sample-seen:'))
                  .map((r) => [r.key, r.value]),
              ),
            );
          };
          request.onerror = () => {
            db.close();
            resolve({});
          };
        };
      }),
  );
}
