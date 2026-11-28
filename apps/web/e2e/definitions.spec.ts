import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from './fixtures';
import { editor, openSettings, setText, start } from './modules';

// Definitions (definitions design §7): Shift+F7 looks up the word at the cursor in a tab that
// exists only while open; before the dictionary is downloaded the tab offers Download, which
// fetches drafter.dev's own copy; then the entry, an inflection's "from", a phrase, a miss, and
// Escape; Settings' row downloads and removes it; and axe.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const panel = (page: Page) => page.locator('#panel-definitions');
const search = (page: Page) => panel(page).getByRole('combobox', { name: 'Look up' });

async function lookUpAt(page: Page, text: string, word: string) {
  await setText(page, text);
  const at = text.indexOf(word) + 2;
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+Home');
  for (let i = 0; i < at; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+F7');
  await expect(panel(page)).toBeVisible();
}

test.describe('Definitions', () => {
  test.setTimeout(120_000);

  test('Shift+F7 offers the download, then shows the word, inflections, phrases, and misses', async ({
    page,
  }) => {
    await start(page);
    await lookUpAt(page, 'INT. HALL - DAY\n\nHe goeth to the window.\n', 'goeth');
    await expect(panel(page)).toContainText('“goeth” will be looked up once it’s downloaded.');
    await panel(page)
      .getByRole('button', { name: /^Download/ })
      .click();
    // The word that waited is looked up once the file is in.
    await expect(panel(page).getByRole('heading', { level: 3 })).toContainText('Go', {
      timeout: 60_000,
    });
    await expect(panel(page)).toContainText('from “goeth”');
    await expect(panel(page)).toContainText('To pass from one place to another');
    await expect(panel(page).getByRole('link', { name: 'More on w1913.com' })).toHaveAttribute(
      'href',
      'https://w1913.com/go',
    );

    await search(page).fill('bill of fare');
    await search(page).press('Enter');
    await expect(panel(page).getByRole('heading', { level: 4 })).toHaveText('Bill of fare');
    await search(page).fill('smartphone');
    await search(page).press('Enter');
    await expect(panel(page)).toContainText('“smartphone” isn’t in the 1913 Webster’s.');

    const results = await new AxeBuilder({ page })
      .include('#panel-definitions')
      .withTags(WCAG)
      .analyze();
    expect(results.violations).toEqual([]);

    // Escape closes the tab and gives the editor its focus back.
    await search(page).press('Escape');
    await expect(panel(page)).toBeHidden();
  });

  test('Settings → Spelling downloads and removes the dictionary', async ({ page }) => {
    await start(page);
    await openSettings(page);
    const row = page.getByRole('group', { name: 'Definitions' });
    await expect(row).toContainText('8.1 MB, downloaded once from this site');
    await row.getByRole('button', { name: 'Download' }).click();
    await expect(row.getByRole('button', { name: 'Remove' })).toBeVisible({ timeout: 60_000 });
    await expect(row).toContainText('Downloaded.');
    await row.getByRole('button', { name: 'Remove' }).click();
    await expect(row.getByRole('button', { name: 'Download' })).toBeVisible();
  });
});
