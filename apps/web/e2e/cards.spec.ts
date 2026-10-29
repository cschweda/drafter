import { expect, type Page, test } from '@playwright/test';
import {
  editor,
  palette,
  paletteInput,
  runCommand,
  setText,
  start,
  stored,
  textOf,
} from './modules';

// The Cards tab (Phase 2 design §7, Plan B): every scene as a card under its section, one tab
// stop and the arrow keys by position, a synopsis edited in place in one undo, the card size on
// the slim bar, nothing for a Markdown document, and no edits in a read-only tab.

const SCRIPT = [
  'Title: The Test',
  '',
  '# Act One',
  '',
  'INT. HALL - DAY',
  '',
  '= Ann arrives.',
  '[[Color: teal]]',
  '[[Goal: Find the key. / Then leave.]]',
  '',
  'ANN',
  'Hello.',
  '',
  'EXT. YARD - NIGHT',
  '',
  'BOB',
  'Hi.',
  '',
  'INT. SHED - DAY',
  '',
  'Tools.',
  '',
  '# Act Two',
  '',
  'INT. CAR - DAY',
  '',
  'Driving.',
  '',
].join('\n');

const cards = (page: Page) => page.getByRole('listbox', { name: 'Cards' });
const card = (page: Page, name: string | RegExp) => cards(page).getByRole('option', { name });
const hall = (page: Page) => card(page, /^Scene 1, INT\. HALL - DAY/);
const yard = (page: Page) => card(page, /^Scene 2, EXT\. YARD - NIGHT/);
const shed = (page: Page) => card(page, /^Scene 3, INT\. SHED - DAY/);
const car = (page: Page) => card(page, /^Scene 4, INT\. CAR - DAY/);
const announcer = (page: Page) => page.locator('.outline-announcer');
const cardMenu = (page: Page) =>
  page.getByRole('menu', { name: /^Actions for / }).and(page.locator('[data-state="open"]'));

async function showCards(page: Page) {
  await runCommand(page, 'Show Cards');
  await expect(cards(page)).toBeVisible();
}

async function openWith(page: Page, text = SCRIPT) {
  await start(page);
  await setText(page, text);
  await showCards(page);
}

/** How many cards the first section's row holds, as drawn. */
const columns = (page: Page) =>
  cards(page)
    .getByRole('group')
    .first()
    .getByRole('option')
    .evaluateAll((els) => {
      const top = els[0]?.getBoundingClientRect().top;
      return els.filter((el) => Math.abs(el.getBoundingClientRect().top - (top ?? 0)) < 2).length;
    });

test.describe('the Cards tab', () => {
  test('shows every scene as a card under its section', async ({ page }) => {
    await openWith(page);
    await expect(cards(page).getByRole('option')).toHaveCount(4);
    const actOne = cards(page).getByRole('group', { name: 'Act One' });
    const actTwo = cards(page).getByRole('group', { name: 'Act Two' });
    await expect(actOne.getByRole('option')).toHaveCount(3);
    await expect(actTwo.getByRole('option')).toHaveCount(1);
    await expect(actTwo.getByRole('option')).toHaveAccessibleName(/^Scene 4, INT\. CAR - DAY/);
    // The number, heading, synopsis, color by name, the goal's first line, and the length.
    await expect(hall(page)).toHaveAccessibleName(/^Scene 1, INT\. HALL - DAY, teal, \S.* pages?$/);
    await expect(hall(page)).toHaveAccessibleDescription('Ann arrives.');
    await expect(hall(page)).toContainText('teal');
    await expect(hall(page)).toContainText('Ann arrives.');
    await expect(hall(page)).toContainText('Goal: Find the key.');
    await expect(hall(page)).not.toContainText('Then leave.');
    await expect(hall(page)).toContainText(/\d p{1,2}\b|\d\/8 p/);
    await expect(page.getByRole('tab', { name: 'Cards' }).first()).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('moves between cards with the arrow keys from one tab stop', async ({ page }) => {
    await openWith(page);
    await expect(hall(page)).toHaveAttribute('tabindex', '0');
    await expect(yard(page)).toHaveAttribute('tabindex', '-1');
    await hall(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(yard(page)).toBeFocused();
    await expect(yard(page)).toHaveAttribute('tabindex', '0');
    await expect(hall(page)).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('ArrowLeft');
    await expect(hall(page)).toBeFocused();
    await page.keyboard.press('End');
    await expect(car(page)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(hall(page)).toBeFocused();
    // Down goes a row as drawn: within Act One when its cards wrap, else to Act Two below.
    const cols = await columns(page);
    await page.keyboard.press('ArrowDown');
    if (cols === 1) await expect(yard(page)).toBeFocused();
    else if (cols === 2) await expect(shed(page)).toBeFocused();
    else await expect(car(page)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(hall(page)).toBeFocused();
    // The tab stop stays on the card last focused.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(yard(page)).toBeFocused();
  });

  test('edits a synopsis on Enter and undoes it in one step', async ({ page }) => {
    await openWith(page);
    await yard(page).focus();
    await page.keyboard.press('Enter');
    const field = page.getByRole('textbox', { name: 'Synopsis of EXT. YARD - NIGHT' });
    await expect(field).toBeFocused();
    await field.fill('Bob says hi.');
    await page.keyboard.press('Enter');
    await expect(yard(page)).toBeFocused();
    await expect(yard(page)).toContainText('Bob says hi.');
    expect(await textOf(page)).toContain('EXT. YARD - NIGHT\n\n= Bob says hi.\n\nBOB');
    // Escape leaves it as it was.
    await hall(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Synopsis of INT. HALL - DAY' })).toBeFocused();
    await page.keyboard.insertText(' Changed.');
    await page.keyboard.press('Escape');
    await expect(hall(page)).toBeFocused();
    expect(await textOf(page)).toContain('= Ann arrives.\n');
    // One undo, from the card, takes the edit back.
    await yard(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
    await expect(yard(page)).toBeFocused();
  });

  test('changes the card size from the slim bar', async ({ page }) => {
    await openWith(page);
    const sizes = page.getByRole('group', { name: 'Card size' });
    const medium = sizes.getByRole('button', { name: 'Medium' });
    const large = sizes.getByRole('button', { name: 'Large' });
    await expect(medium).toHaveAttribute('aria-pressed', 'true');
    const before = (await hall(page).boundingBox())?.height ?? 0;
    await large.click();
    await expect(large).toHaveAttribute('aria-pressed', 'true');
    await expect(medium).toHaveAttribute('aria-pressed', 'false');
    await expect
      .poll(async () => (await hall(page).boundingBox())?.height ?? 0)
      .toBeGreaterThan(before);
    // Kept as a setting.
    await expect.poll(async () => (await stored(page)).cardSize).toBe('large');
    await page.reload();
    await expect(editor(page)).toBeAttached();
    await showCards(page);
    await expect(
      page.getByRole('group', { name: 'Card size' }).getByRole('button', { name: 'Large' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('is not offered for a Markdown document', async ({ page }) => {
    await openWith(page);
    await runCommand(page, 'New Markdown document');
    await expect(page.getByRole('tab', { name: 'Preview' }).first()).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Cards' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Notes' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'More tabs' })).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+k');
    await expect(paletteInput(page)).toBeFocused();
    await page.keyboard.insertText('Show Cards');
    await expect(palette(page).getByRole('option', { name: 'Show Cards' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.insertText('Show Notes');
    await expect(palette(page).getByRole('option', { name: 'Show Notes' })).toHaveCount(0);
  });

  test('offers no edits in a read-only tab, and says why', async ({ context, isMobile }) => {
    test.skip(!!isMobile, 'two browser tabs are the same on a phone');
    const why = 'This script is open for editing in another tab.';
    const first = await context.newPage();
    await start(first);
    const second = await context.newPage();
    await second.goto('/');
    await expect(second.getByText(why)).toBeVisible();
    await showCards(second);
    const kitchen = card(second, /^Scene 1, INT\. KITCHEN - NIGHT/);
    // Everything shows.
    await expect(cards(second).getByRole('option')).not.toHaveCount(0);
    const before = await textOf(second);
    await kitchen.focus();
    await second.keyboard.press('Enter');
    await expect(announcer(second)).toHaveText(why);
    await expect(second.getByRole('textbox', { name: /^Synopsis of/ })).toHaveCount(0);
    await expect(kitchen).toBeFocused();
    await second.keyboard.press('Shift+F10');
    await expect(cardMenu(second)).toBeVisible();
    await expect(cardMenu(second)).toContainText(why);
    for (const name of ['Edit synopsis', 'Color…', 'Move scene down']) {
      await expect(cardMenu(second).getByRole('menuitem', { name })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    }
    await second.keyboard.press('Escape');
    await expect(kitchen).toBeFocused();
    expect(await textOf(second)).toBe(before);
  });
});
