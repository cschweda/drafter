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

/** A card by its heading, whatever its number after a move. */
const byHeading = (page: Page, heading: string) =>
  cards(page).getByRole('option', {
    name: new RegExp(`^Scene \\d+, ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  });
/** The cards' headings, in the order drawn. */
const order = (page: Page) =>
  cards(page)
    .locator('[role="option"] .heading')
    .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ''));

const HALL = 'INT. HALL - DAY';
const YARD = 'EXT. YARD - NIGHT';
const SHED = 'INT. SHED - DAY';
const CAR = 'INT. CAR - DAY';

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
    // Up from a section of one card counts the row as wide as drawn: the same column above.
    await car(page).focus();
    await page.keyboard.press('ArrowUp');
    await expect(cols >= 3 ? hall(page) : shed(page)).toBeFocused();
    await hall(page).focus();
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
    // Its one view tab is Stats, under More.
    await expect(page.getByRole('tab', { name: 'Stats' })).toHaveCount(0);
    const more = page.locator('[data-pane]').first().getByRole('button', { name: 'More tabs' });
    await more.click();
    await expect(page.getByRole('menu', { name: 'More tabs' }).getByRole('menuitem')).toHaveText([
      'Stats',
    ]);
    await page.keyboard.press('Escape');
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

// Moving cards (Phase 2 design §7, §6.2): Alt+Left and Alt+Right a place, Alt+Up and Alt+Down a
// row as drawn, the card's menu (a phone's way), Move to…, and drag; one undo, focus stays on the
// card, and the live region says where it went once.
test.describe('moving cards', () => {
  test('moves a card later with Alt+Right, keeps focus on it, and says where it went', async ({
    page,
  }) => {
    await openWith(page);
    await hall(page).focus();
    await page.keyboard.press('Alt+ArrowRight');
    await expect.poll(() => order(page)).toEqual([YARD, HALL, SHED, CAR]);
    await expect(byHeading(page, HALL)).toBeFocused();
    await expect(announcer(page)).toHaveText(`Moved ${HALL} to scene 2 of 4, in Act One.`);
    // And back with Alt+Left; then out past its section's start, as the Outline does, and at
    // the very start it says it can't go further.
    await page.keyboard.press('Alt+ArrowLeft');
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
    await expect(byHeading(page, HALL)).toBeFocused();
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(announcer(page)).toHaveText(`Moved ${HALL} to scene 1 of 4.`);
    await expect(
      cards(page).getByRole('group', { name: 'Act One' }).getByRole('option'),
    ).toHaveCount(2);
    await expect(byHeading(page, HALL)).toBeFocused();
    const outside = await textOf(page);
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(announcer(page)).toHaveText(`${HALL} can’t move further up.`);
    expect(await textOf(page)).toBe(outside);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
    // Across a section's edge, as the Outline does.
    await shed(page).focus();
    await page.keyboard.press('Alt+ArrowRight');
    await expect(announcer(page)).toHaveText(`Moved ${SHED} to scene 3 of 4, in Act Two.`);
    await expect(
      cards(page).getByRole('group', { name: 'Act Two' }).getByRole('option'),
    ).toHaveCount(2);
    await expect(byHeading(page, SHED)).toBeFocused();
  });

  test('moves a card a row up with Alt+Up', async ({ page }) => {
    await openWith(page);
    const cols = await columns(page);
    await car(page).focus();
    await page.keyboard.press('Alt+ArrowUp');
    // From Act Two's first row, before the card in Act One's last row in the same column; in one
    // column (a phone), one place: to the end of Act One.
    if (cols === 1) await expect.poll(() => order(page)).toEqual([HALL, YARD, SHED, CAR]);
    else if (cols === 2) await expect.poll(() => order(page)).toEqual([HALL, YARD, CAR, SHED]);
    else await expect.poll(() => order(page)).toEqual([CAR, HALL, YARD, SHED]);
    await expect(
      cards(page).getByRole('group', { name: 'Act One' }).getByRole('option'),
    ).toHaveCount(4);
    await expect(byHeading(page, CAR)).toBeFocused();
    await expect(announcer(page)).toHaveText(
      new RegExp(`^Moved ${CAR.replace(/\./g, '\\.')} to scene \\d of 4, in Act One\\.$`),
    );
    // Alt+Down: after the card a row down (one place in one column).
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
    await byHeading(page, HALL).focus();
    await page.keyboard.press('Alt+ArrowDown');
    if (cols === 1) await expect.poll(() => order(page)).toEqual([YARD, HALL, SHED, CAR]);
    else if (cols === 2) await expect.poll(() => order(page)).toEqual([YARD, SHED, HALL, CAR]);
    else await expect.poll(() => order(page)).toEqual([YARD, SHED, CAR, HALL]);
    await expect(byHeading(page, HALL)).toBeFocused();
  });

  test('undoes a card move in one step', async ({ page }) => {
    await openWith(page);
    await yard(page).focus();
    await page.keyboard.press('Alt+ArrowRight');
    await expect.poll(() => order(page)).toEqual([HALL, SHED, YARD, CAR]);
    await expect(byHeading(page, YARD)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
    await expect(byHeading(page, YARD)).toBeFocused();
  });

  test('moves a card with Move to…', async ({ page }) => {
    await openWith(page);
    await hall(page).focus();
    await page.keyboard.press('Shift+F10');
    await cardMenu(page).getByRole('menuitem', { name: 'Move scene to…' }).click();
    const dialog = page.getByRole('dialog', { name: `Move ${HALL}` });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('searchbox').fill('car');
    await dialog.getByRole('button', { name: `Scene 4: ${CAR}` }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => order(page)).toEqual([YARD, SHED, CAR, HALL]);
    await expect(byHeading(page, HALL)).toBeFocused();
    await expect(announcer(page)).toHaveText(`Moved ${HALL} to scene 4 of 4, in Act Two.`);
  });

  test('moves a card from its menu on a phone', async ({ page }) => {
    await openWith(page);
    // The ⋯ button is a pointer's (a finger's): the card's keys open the same menu.
    await hall(page).locator('button.more').click();
    await cardMenu(page).getByRole('menuitem', { name: 'Move scene down' }).click();
    await expect.poll(() => order(page)).toEqual([YARD, HALL, SHED, CAR]);
    await expect(byHeading(page, HALL)).toBeFocused();
    await expect(announcer(page)).toHaveText(`Moved ${HALL} to scene 2 of 4, in Act One.`);
    await byHeading(page, HALL).locator('button.more').click();
    await cardMenu(page).getByRole('menuitem', { name: 'Move scene up' }).click();
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
    await expect(byHeading(page, HALL)).toBeFocused();
  });

  test('moves a card by dragging it', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'a phone moves cards from their menu');
    await openWith(page);
    await expect(hall(page)).toHaveAttribute('draggable', 'true');
    const target = await car(page).boundingBox();
    if (!target) throw new Error('no card');
    // The far end of the card under the pointer (its right in a row, its bottom in a column).
    await hall(page).dragTo(car(page), {
      targetPosition: { x: target.width - 4, y: target.height - 4 },
    });
    await expect.poll(() => order(page)).toEqual([YARD, SHED, CAR, HALL]);
    await expect(byHeading(page, HALL)).toBeFocused();
    await expect(announcer(page)).toHaveText(`Moved ${HALL} to scene 4 of 4, in Act Two.`);
    // And before a card: its near end.
    await byHeading(page, HALL).dragTo(byHeading(page, YARD), { targetPosition: { x: 4, y: 4 } });
    await expect.poll(() => textOf(page)).toBe(SCRIPT);
  });

  test("doesn't move a card in a read-only tab", async ({ context, isMobile }) => {
    test.skip(!!isMobile, 'two browser tabs are the same on a phone');
    const why = 'This script is open for editing in another tab.';
    const first = await context.newPage();
    await start(first);
    const second = await context.newPage();
    await second.goto('/');
    await expect(second.getByText(why)).toBeVisible();
    await showCards(second);
    const kitchen = card(second, /^Scene 1, INT\. KITCHEN - NIGHT/);
    const before = await textOf(second);
    await expect(kitchen).toHaveAttribute('draggable', 'false');
    await kitchen.focus();
    for (const key of ['Alt+ArrowRight', 'Alt+ArrowDown']) {
      await second.keyboard.press(key);
      await expect(announcer(second)).toHaveText(why);
      await expect(kitchen).toBeFocused();
    }
    await second.keyboard.press('Shift+F10');
    await expect(cardMenu(second)).toContainText(why);
    for (const name of ['Move scene up', 'Move scene down', 'Move scene to…']) {
      await expect(cardMenu(second).getByRole('menuitem', { name })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    }
    await second.keyboard.press('Escape');
    expect(await textOf(second)).toBe(before);
  });
});
