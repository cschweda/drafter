import { expect, type Page, test } from '@playwright/test';

const editor = (page: Page) => page.locator('.cm-content');
const script = (page: Page) => page.getByRole('region', { name: 'Script' });
const status = (page: Page) => page.locator('[data-tour="status"]');
const chip = (page: Page) => page.locator('.chip.template');
const chipMenu = (page: Page) => page.getByRole('menu');
const chipItem = (page: Page, name: string) =>
  chipMenu(page).getByRole('menuitemcheckbox', { name });
const openButton = (page: Page) => page.getByRole('button', { name: 'Open', exact: true });
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts' });

const STAGE_BLOCK = /\/\* drafter\s*\{"v":1,"template":"stage-play-standard"\}\s*\*\//;

async function start(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toContainText('The Call');
  await expect(chip(page)).toBeVisible();
}

/** Chooses a template from the toolbar's chip; the menu closes. */
async function choose(page: Page, name: string) {
  await chip(page).click();
  await chipItem(page, name).click();
  await expect(chipMenu(page)).toBeHidden();
}

/** The editor's text at the end of the script: it draws only the lines in view, and the block is the last thing. */
async function endText(page: Page) {
  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+End');
  await expect(editor(page)).toContainText('END OF SAMPLE');
  return editor(page).textContent();
}

async function typeAtEnd(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(text);
}

// The chip is not in the toolbar below 1024px (the status bar names the template there), so these
// run where it is. The New menu and the palette reach the same list on a phone.
test.describe('the template chip', () => {
  test.skip(({ isMobile }) => !!isMobile, 'the chip is hidden on a phone');

  test('switches to a stage play and back with undo', async ({ page }) => {
    await start(page);
    const before = await endText(page);
    expect(before).not.toMatch(STAGE_BLOCK);
    // A screenplay leaves out the sections; a stage play sets "# Act One" as its act heading.
    await expect(script(page)).not.toContainText(/act one/i);

    await choose(page, 'Stage play');
    await expect(chip(page)).toHaveText('Stage play');
    expect(await endText(page)).toMatch(STAGE_BLOCK);
    await expect(script(page)).toContainText(/act one/i);

    // One undo step brings the screenplay and the original text back.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(chip(page)).toHaveText('Screenplay');
    expect((await endText(page))?.slice(-200)).toBe(before?.slice(-200));
    await expect(script(page)).not.toContainText(/act one/i);
  });

  test('choosing Screenplay again writes it to the block', async ({ page }) => {
    await start(page);
    await choose(page, 'Stage play');
    await choose(page, 'Screenplay');
    await expect(chip(page)).toHaveText('Screenplay');
    const text = (await endText(page)) ?? '';
    expect(text).toMatch(/\{"v":1,"template":"us-screenplay"\}/);
    // The block is replaced, not added to.
    expect(text.match(/\/\* drafter/g)).toHaveLength(1);
  });

  test('is one undo step even right after typing', async ({ page }) => {
    await start(page);
    await typeAtEnd(page, 'More.');
    await choose(page, 'Stage play');
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(chip(page)).toHaveText('Screenplay');
    await expect(editor(page)).toContainText('More.');
  });

  test('shows the template in the toolbar and the status bar', async ({ page }) => {
    await start(page);
    await expect(chip(page)).toHaveText('Screenplay');
    await expect(status(page)).toContainText('Screenplay');
    await chip(page).click();
    await expect(chipItem(page, 'Screenplay')).toHaveAttribute('aria-checked', 'true');
    await expect(chipItem(page, 'Stage play')).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Escape');

    await choose(page, 'Stage play');
    await expect(chip(page)).toHaveText('Stage play');
    await expect(status(page)).toContainText('Stage play');
    await chip(page).click();
    await expect(chipItem(page, 'Stage play')).toHaveAttribute('aria-checked', 'true');
    await expect(chipItem(page, 'Screenplay')).toHaveAttribute('aria-checked', 'false');
  });

  test('is reachable from the keyboard', async ({ page }) => {
    await start(page);
    // The chip is an ordinary button in the tab order. (Safari's Tab skips buttons unless the
    // reader turns that on, so the test puts focus there; the other menus' tests do the same.)
    await chip(page).focus();
    await expect(chip(page)).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(chipMenu(page)).toBeVisible();
    // Focus is on the checked item; the arrows move through the list.
    await expect(chipItem(page, 'Screenplay')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(chipItem(page, 'Stage play')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(chip(page)).toHaveText('Stage play');
    // Focus goes back to the chip, and Escape closes the menu with nothing changed.
    await expect(chip(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(chipMenu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(chipMenu(page)).toBeHidden();
    await expect(chip(page)).toBeFocused();
    await expect(chip(page)).toHaveText('Stage play');
    expect(await endText(page)).toMatch(STAGE_BLOCK);
  });

  test('lints again at once: a stage play has no scene-time warnings', async ({ page }) => {
    await start(page);
    await typeAtEnd(page, '\n\nINT. KITCHEN\n\nShe waits.\n');
    await expect(status(page)).toContainText(/[1-9]\d* problems?/);
    await choose(page, 'Stage play');
    await expect(status(page)).toContainText('No problems');
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(status(page)).toContainText(/[1-9]\d* problems?/);
  });

  test('is off while a /* is unclosed, since the block could not be read back', async ({
    page,
  }) => {
    await start(page);
    await typeAtEnd(page, '\n\n/* oops\n');
    await chip(page).click();
    await expect(chipItem(page, 'Stage play')).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    expect(await endText(page)).not.toMatch(STAGE_BLOCK);
    await expect(chip(page)).toHaveText('Screenplay');
  });
});

test.describe('the list of document types', () => {
  // Markdown (plain text) comes last in each of these once Task 6 adds it; the chip, the New menu
  // and the palette all read `DOCUMENT_TYPES`, so the assertion there is one more name at the end.
  test('lists Screenplay first and Stage play second, in the chip, the New menu, and the palette', async ({
    page,
    isMobile,
  }) => {
    await start0(page, !!isMobile);

    if (!isMobile) {
      await chip(page).click();
      const names = await chipMenu(page)
        .getByRole('menuitemcheckbox')
        .evaluateAll((els) => els.map((el) => el.textContent?.trim()));
      expect(names.slice(0, 2)).toEqual(['Screenplay', 'Stage play']);
      await page.keyboard.press('Escape');
    }

    await openButton(page).click();
    const items = await scriptsMenu(page)
      .getByRole('button')
      .evaluateAll((els) => els.map((el) => el.textContent?.trim()));
    expect(items.slice(0, 2)).toEqual(['New screenplay', 'New stage play']);
    await page.keyboard.press('Escape');
    await expect(scriptsMenu(page)).toBeHidden();

    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await palette.locator('input').fill('New s');
    const options = await palette
      .getByRole('option')
      .evaluateAll((els) => els.map((el) => el.textContent?.trim()));
    const screenplay = options.findIndex((t) => t?.startsWith('New screenplay'));
    const stage = options.findIndex((t) => t?.startsWith('New stage play'));
    expect(screenplay).toBeGreaterThanOrEqual(0);
    expect(stage).toBeGreaterThan(screenplay);
  });
});

async function start0(page: Page, isMobile: boolean) {
  await page.goto('/');
  await expect(editor(page)).toBeAttached();
  if (!isMobile) await expect(chip(page)).toBeVisible();
}
