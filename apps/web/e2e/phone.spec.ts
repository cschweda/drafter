import { expect, type Page, test } from '@playwright/test';
import { removePickers } from './fs-stub';
import { setText } from './modules';

// Phone sizes (Phase 1 design §12): the toolbar is icons below 1024px, and the template chip does not
// fit among them, so the app menu holds the template choice. The icon toolbar plus the app menu is
// this design's "toolbar folds into a menu". These run at 320px (WCAG 1.4.10's reflow width) in
// every engine, so the desktop projects check the same narrow layout.
// (The accessibility checks for these states wait for the project's final stage, decided 2026-10-26.)

const editor = (page: Page) => page.locator('.cm-content');
const toolbar = (page: Page) => page.getByRole('banner');
const status = (page: Page) => page.locator('[data-tour="status"]');
const mark = (page: Page) => page.getByRole('button', { name: 'Drafter menu' });
const appMenu = (page: Page) => page.getByRole('menu', { name: 'Drafter menu' });
const typeItem = (page: Page, name: string | RegExp) =>
  appMenu(page).getByRole('menuitemcheckbox', { name });
const question = (page: Page) =>
  page.getByRole('dialog', { name: 'Make this a Markdown document?' });

test.beforeEach(async ({ page }) => {
  // Save downloads a copy, where there is no file picker (set before the page loads).
  await removePickers(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await expect(editor(page)).toContainText('The Call');
});

/** The text of the script, even when the Source tab is not the one showing. */
const text = (page: Page) => editor(page).evaluate((el) => el.textContent ?? '');

async function openAppMenu(page: Page) {
  await mark(page).click();
  await expect(appMenu(page)).toBeVisible();
}

test.describe('the toolbar at 320px', () => {
  test('keeps every button on the screen, in a 24px target, with the page unscrolled', async ({
    page,
  }) => {
    const layout = await page.evaluate(() => {
      const bar = document.querySelector('header.toolbar') as HTMLElement;
      return {
        page: document.documentElement.scrollWidth,
        bar: [bar.scrollWidth, bar.clientWidth],
        // The template chip is not in the toolbar at this width (display: none), so it has no box.
        buttons: Array.from(bar.querySelectorAll('button'))
          .filter((b) => b.offsetWidth > 0)
          .map((b) => {
            const r = b.getBoundingClientRect();
            return {
              name:
                b.getAttribute('aria-label') ??
                b.querySelector('.label')?.textContent?.trim() ??
                b.textContent?.trim(),
              left: r.left,
              right: r.right,
              width: r.width,
              height: r.height,
            };
          }),
      };
    });
    expect(layout.page).toBeLessThanOrEqual(320);
    expect(layout.bar[0]).toBeLessThanOrEqual(layout.bar[1] as number);
    // The mark (the app menu), Open, Save, Export, Focus, the palette, and the theme.
    expect(layout.buttons.map((b) => b.name)).toEqual([
      'Drafter menu',
      'Open',
      'Save',
      'Export',
      'Focus',
      'Go to scene or command',
      'Switch to light theme',
    ]);
    for (const b of layout.buttons) {
      expect(b.left, `${b.name} left`).toBeGreaterThanOrEqual(0);
      expect(b.right, `${b.name} right`).toBeLessThanOrEqual(320);
      expect(b.width, `${b.name} width`).toBeGreaterThanOrEqual(24);
      expect(b.height, `${b.name} height`).toBeGreaterThanOrEqual(24);
    }
  });

  test('reaches every action: Open, Save, Export, Focus, the palette, the theme, and the menu', async ({
    page,
  }) => {
    // Open: the Scripts menu.
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Scripts' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('group', { name: 'Scripts' })).toBeHidden();

    // Export: the export menu.
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Export' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('group', { name: 'Export' })).toBeHidden();

    // Save: a download, where the browser has no file picker.
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('The Call.fountain');

    // Focus mode on, and off with its own button.
    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Focus mode' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('group', { name: 'Focus mode' })).toBeHidden();

    // The palette.
    await page.getByRole('button', { name: 'Go to scene or command' }).click();
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden();

    // The theme.
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();

    // The app menu.
    await openAppMenu(page);
    await page.keyboard.press('Escape');
    await expect(appMenu(page)).toBeHidden();
  });
});

test.describe('the template choice in the app menu', () => {
  test('lists the document types in order, with the script’s own checked', async ({ page }) => {
    await expect(toolbar(page).locator('.chip.template')).toBeHidden();
    await openAppMenu(page);
    await expect(appMenu(page).getByText('Template: Screenplay', { exact: true })).toBeVisible();
    const types = appMenu(page).getByRole('menuitemcheckbox');
    await expect(types).toHaveText(['Screenplay', 'Stage play', 'Markdown (plain text)']);
    await expect(typeItem(page, 'Screenplay')).toHaveAttribute('aria-checked', 'true');
    await expect(typeItem(page, 'Stage play')).toHaveAttribute('aria-checked', 'false');
    await expect(typeItem(page, /^Markdown/)).toHaveAttribute('aria-checked', 'false');
    // The sample stays a screenplay or a stage play: Markdown is off, as it is in the toolbar's chip and the palette.
    await expect(typeItem(page, /^Markdown/)).toHaveAttribute('data-disabled', '');
  });

  test('switches to a stage play and back, as one undo each, naming it in the status bar', async ({
    page,
  }) => {
    await openAppMenu(page);
    await typeItem(page, 'Stage play').click();
    await expect(appMenu(page)).toBeHidden();
    await expect(status(page)).toContainText('Stage play');

    // Focus went to the editor with the choice, so undo needs no tap first.
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(status(page)).toContainText('Screenplay');

    // The menu shows what the script is now, and Escape leaves it as it was.
    await openAppMenu(page);
    await expect(appMenu(page).getByText('Template: Screenplay', { exact: true })).toBeVisible();
    await typeItem(page, 'Stage play').click();
    await expect(appMenu(page)).toBeHidden();
    await expect(status(page)).toContainText('Stage play');
    await openAppMenu(page);
    await expect(appMenu(page).getByText('Template: Stage play', { exact: true })).toBeVisible();
    await expect(typeItem(page, 'Stage play')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(appMenu(page)).toBeHidden();
    await expect(mark(page)).toBeFocused();
    await expect(status(page)).toContainText('Stage play');
  });

  test('asks before making a script of its own Markdown, and changes nothing on Cancel', async ({
    page,
  }) => {
    // A script of the writer's own: New screenplay.
    await mark(page).click();
    await appMenu(page)
      .getByRole('menuitem', { name: /^New screenplay/ })
      .click();
    await expect(editor(page)).not.toContainText('The Call');

    await openAppMenu(page);
    await expect(typeItem(page, /^Markdown/)).not.toHaveAttribute('data-disabled', '');
    await typeItem(page, /^Markdown/).click();
    await expect(question(page)).toBeVisible();
    await question(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(question(page)).toBeHidden();
    await expect(status(page)).not.toContainText('Markdown');

    await openAppMenu(page);
    await typeItem(page, /^Markdown/).click();
    await question(page).getByRole('button', { name: 'Make it Markdown' }).click();
    await expect(status(page)).toContainText('Markdown (plain text)');

    // Back to a template from Markdown keeps the text.
    await openAppMenu(page);
    await expect(appMenu(page).getByText('Document: Markdown (plain text)')).toBeVisible();
    await expect(typeItem(page, /^Markdown/)).toHaveAttribute('aria-checked', 'true');
    await typeItem(page, 'Stage play').click();
    await expect(status(page)).toContainText('Stage play');
  });
});

test.describe('a template Drafter does not have, on a phone', () => {
  const UNKNOWN = 'INT. HALL - DAY\n\nShe waits.\n\n/* drafter\n{"v":1,"template":"my-own"}\n*/\n';
  const NOTE =
    "This script asks for “my-own”, which Drafter doesn't have, so it's shown as a screenplay.";

  test('shows the fallback in the status bar and the app menu, and says why', async ({ page }) => {
    await setText(page, UNKNOWN);
    await expect(status(page)).toContainText('Screenplay (fallback)');
    await openAppMenu(page);
    await expect(
      appMenu(page).getByText('Template: Screenplay (fallback)', { exact: true }),
    ).toBeVisible();
    await expect(appMenu(page).getByText(NOTE, { exact: true })).toBeVisible();
    await expect(typeItem(page, 'Screenplay (fallback)')).toHaveAttribute('aria-checked', 'true');

    // Choosing Screenplay writes it over the name Drafter doesn't have, and the fallback goes.
    await typeItem(page, 'Screenplay (fallback)').click();
    await expect(status(page)).not.toContainText('fallback');
    await expect.poll(() => text(page)).toMatch(/"template":"us-screenplay"/);
    await expect.poll(() => text(page)).not.toMatch(/my-own/);
  });
});
