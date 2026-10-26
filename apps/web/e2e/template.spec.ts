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
    // Focus goes to the editor, so Mod+Z undoes the change with no click in between.
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(chip(page)).toHaveText('Screenplay');
    expect((await endText(page)) ?? '').not.toMatch(STAGE_BLOCK);
    // Escape closes the menu with nothing changed, and focus goes back to the chip.
    await chip(page).focus();
    await page.keyboard.press('Enter');
    await expect(chipMenu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(chipMenu(page)).toBeHidden();
    await expect(chip(page)).toBeFocused();
    await expect(chip(page)).toHaveText('Screenplay');
  });

  test('lints again with the new template: a stage play has no scene-time warnings', async ({
    page,
  }) => {
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
  // The chip, the New menu, and the palette all read `DOCUMENT_TYPES`: Screenplay, Stage play, then
  // Markdown (plain text) last.
  test('lists Screenplay, Stage play, then Markdown last, in the chip, the New menu, and the palette', async ({
    page,
    isMobile,
  }) => {
    await start0(page, !!isMobile);

    if (!isMobile) {
      await chip(page).click();
      const names = await chipMenu(page)
        .getByRole('menuitemcheckbox')
        .evaluateAll((els) => els.map((el) => el.textContent?.trim()));
      expect(names).toEqual(['Screenplay', 'Stage play', 'Markdown (plain text)']);
      await page.keyboard.press('Escape');
    }

    await openButton(page).click();
    const items = await scriptsMenu(page)
      .getByRole('button')
      .evaluateAll((els) => els.map((el) => el.textContent?.trim()));
    expect(items.slice(0, 3)).toEqual([
      'New screenplay',
      'New stage play',
      'New Markdown document',
    ]);
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
    // Markdown comes after both.
    await palette.locator('input').fill('New');
    await expect(palette.getByRole('option', { name: /^New Markdown document/ })).toBeVisible();
    const news = await palette
      .getByRole('option')
      .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ''));
    const at = (prefix: string) => news.findIndex((t) => t.startsWith(prefix));
    expect(at('New Markdown document')).toBeGreaterThan(at('New stage play'));
    expect(at('New stage play')).toBeGreaterThan(at('New screenplay'));
  });
});

// The palette switches template wherever the chip is hidden, so these run on the phones too.
test.describe('switching template from the palette', () => {
  const paletteDialog = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
  const paletteOption = (page: Page, name: string) =>
    paletteDialog(page).getByRole('option', { name });

  test('switches to a stage play, and Mod+Z restores the screenplay', async ({ page }) => {
    await page.goto('/');
    await expect(editor(page)).toBeAttached();
    await page.keyboard.press('ControlOrMeta+k');
    await paletteDialog(page).locator('input').fill('Template');
    // Only the template the script isn't in is offered.
    await expect(paletteOption(page, 'Template: Stage play')).toBeVisible();
    await expect(paletteOption(page, 'Template: Screenplay')).toHaveCount(0);
    await paletteOption(page, 'Template: Stage play').click();
    await expect(paletteDialog(page)).toBeHidden();
    await expect(editor(page)).toBeFocused();
    expect(await endText(page)).toMatch(STAGE_BLOCK);
    await expect(status(page)).toContainText('Stage play');

    await page.keyboard.press('ControlOrMeta+z');
    await expect(status(page)).toContainText('Screenplay');
    expect((await endText(page)) ?? '').not.toMatch(STAGE_BLOCK);

    // And back the other way: now Screenplay is not offered.
    await page.keyboard.press('ControlOrMeta+k');
    await paletteDialog(page).locator('input').fill('Template');
    await expect(paletteOption(page, 'Template: Stage play')).toBeVisible();
  });

  test('is not offered in a tab that only shows the script', async ({
    page,
    context,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'two tabs are the same on a phone');
    await page.goto('/');
    await expect(editor(page)).toBeAttached();
    await expect(status(page)).toContainText('Screenplay');
    const other = await context.newPage();
    await other.goto('/');
    await expect(other.getByText('This script is open for editing in another tab')).toBeVisible();
    await other.keyboard.press('ControlOrMeta+k');
    await paletteDialog(other).locator('input').fill('Template');
    await expect(paletteOption(other, 'Template: Stage play')).toHaveCount(0);
  });
});

async function start0(page: Page, isMobile: boolean) {
  await page.goto('/');
  await expect(editor(page)).toBeAttached();
  if (!isMobile) await expect(chip(page)).toBeVisible();
}
