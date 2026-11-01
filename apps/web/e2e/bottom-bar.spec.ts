import { expect, type Locator, type Page, test } from '@playwright/test';
import { editor, start, turnOnFixture } from './modules';

// One pane below 1024px, made for a phone (fresh-look design §3.1, §6; Task 9): a 56px bottom tab
// bar of Write, Script, Outline, and More; a phone opens on Write; from 640px up a status bar under
// it; the element row above the on-screen keyboard; menus and the palette as bottom sheets. The
// desktop projects run these at 800 by 1000, between a phone and a wide screen.

test.beforeEach(async ({ page, isMobile }) => {
  if (!isMobile) await page.setViewportSize({ width: 800, height: 1000 });
  // The recovery copy is kept, so no warning shows below 640px, where only one may (Task 6).
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persisted: async () => true, persist: async () => true },
    });
  });
});

const bar = (page: Page) => page.locator('[data-bottom-bar]');
const tabs = (page: Page) => bar(page).getByRole('tablist', { name: 'Panes' });
const more = (page: Page) => bar(page).getByRole('button', { name: /^More tabs/ });
const moreMenu = (page: Page) => page.getByRole('menu', { name: 'More tabs' });
const status = (page: Page) => page.getByRole('contentinfo');

test('a phone opens on Write', async ({ page }) => {
  await start(page);
  await expect(tabs(page).getByRole('tab', { name: 'Write', selected: true })).toBeVisible();
  await expect(editor(page)).toBeVisible();
  // One pane at a time.
  await expect(page.locator('[data-pane]')).toHaveCount(1);
});

test('the bottom tab bar switches Write, Script, Outline, and More', async ({ page }) => {
  await start(page);
  await expect(tabs(page).getByRole('tab')).toHaveText(['Write', 'Script', 'Outline']);
  await expect(more(page)).toBeVisible();
  // 56px, across the window, under the pane; every target at least 44 by 44.
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  const box = await bar(page).boundingBox();
  expect(Math.round(box?.height ?? 0)).toBe(56);
  expect(Math.round(box?.width ?? 0)).toBe(viewport.width);
  const pane = await page.locator('[data-pane]').locator('[role="tabpanel"]').boundingBox();
  expect((pane?.y ?? 0) + (pane?.height ?? 0)).toBeLessThanOrEqual((box?.y ?? 0) + 1);
  for (const target of [...(await tabs(page).getByRole('tab').all()), more(page)]) {
    const t = await target.boundingBox();
    expect(t?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(t?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await tabs(page).getByRole('tab', { name: 'Script' }).click();
  await expect(tabs(page).getByRole('tab', { name: 'Script', selected: true })).toBeVisible();
  await expect(page.locator('#panel-script')).toBeVisible();
  await tabs(page).getByRole('tab', { name: 'Outline' }).click();
  await expect(page.locator('#panel-outline')).toBeVisible();
  // More: the other views, then History.
  await more(page).click();
  await expect(moreMenu(page).getByRole('menuitem')).toHaveText([
    'Cards',
    'Stats',
    'Scaffold',
    /^Notes(, \d+ open)?$/,
    /^Problems(, \d+)?$/,
    'History',
  ]);
  await moreMenu(page).getByRole('menuitem', { name: 'Stats' }).click();
  // The view chosen from More shows as a tab while it is the one showing, then goes back.
  const stats = tabs(page).getByRole('tab', { name: 'Stats', selected: true });
  await expect(stats).toBeFocused();
  await expect(page.locator('#panel-stats')).toBeVisible();
  await tabs(page).getByRole('tab', { name: 'Write' }).click();
  await expect(tabs(page).getByRole('tab')).toHaveText(['Write', 'Script', 'Outline']);
  // History is a dialog, opened from More.
  await more(page).click();
  await moreMenu(page).getByRole('menuitem', { name: 'History' }).click();
  await expect(page.getByRole('dialog', { name: /History/ })).toBeVisible();
});

test('the arrow keys move along the bar, and Escape from More gives focus back', async ({
  page,
}) => {
  await start(page);
  const write = tabs(page).getByRole('tab', { name: 'Write' });
  await write.focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs(page).getByRole('tab', { name: 'Script' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tabs(page).getByRole('tab', { name: 'Script', selected: true })).toBeFocused();
  await more(page).focus();
  await page.keyboard.press('Enter');
  await expect(moreMenu(page).getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(moreMenu(page)).toBeHidden();
  await expect(more(page)).toBeFocused();
});

test("between 640 and 1023px it's one pane with the bottom bar and a status bar", async ({
  page,
  isMobile,
}) => {
  test.skip(!!isMobile, 'a phone has no status bar');
  for (const width of [640, 800, 1023]) {
    await page.setViewportSize({ width, height: 1000 });
    await start(page);
    await expect(page.locator('[data-pane]'), `${width}px`).toHaveCount(1);
    await expect(bar(page)).toBeVisible();
    await expect(status(page)).toBeVisible();
    // The status bar is the last row, under the tab bar.
    const tabsBox = await bar(page).boundingBox();
    const statusBox = await status(page).boundingBox();
    expect(statusBox?.y ?? 0).toBeGreaterThanOrEqual(
      (tabsBox?.y ?? 0) + (tabsBox?.height ?? 0) - 1,
    );
    expect(Math.round((statusBox?.y ?? 0) + (statusBox?.height ?? 0))).toBe(1000);
  }
  // From 1024 up, two panes and no bottom bar.
  await page.setViewportSize({ width: 1024, height: 1000 });
  await expect(page.locator('[data-pane]')).toHaveCount(2);
  await expect(bar(page)).toHaveCount(0);
});

test('below 640px the status bar is hidden, and the tab bar is the bottom row', async ({
  page,
  isMobile,
}) => {
  if (!isMobile) await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await expect(status(page)).toBeHidden();
  const box = await bar(page).boundingBox();
  const height = page.viewportSize()?.height ?? 0;
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(height);
});

// Review Focus 5. A test browser has no on-screen keyboard, so `visualViewport` is a stand-in
// whose height the test sets, as a keyboard opening takes it away (and the window's height stays).
test.describe('with the on-screen keyboard', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a phone');
    await page.addInitScript(() => {
      const fake = new EventTarget() as EventTarget & Record<string, unknown>;
      let keyboard = 0;
      for (const [name, get] of Object.entries({
        width: () => window.innerWidth,
        height: () => window.innerHeight - keyboard,
        offsetTop: () => 0,
        offsetLeft: () => 0,
        pageTop: () => window.scrollY,
        pageLeft: () => window.scrollX,
        scale: () => 1,
      })) {
        Object.defineProperty(fake, name, { get });
      }
      Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true });
      window.addEventListener('resize', () => fake.dispatchEvent(new Event('resize')));
      (window as unknown as { keyboard(px: number): void }).keyboard = (px: number) => {
        keyboard = px;
        fake.dispatchEvent(new Event('resize'));
      };
    });
  });

  const elementBar = (page: Page) => page.getByRole('toolbar', { name: 'Element bar' });
  const keyboard = (page: Page, px: number) =>
    page.evaluate((n) => (window as unknown as { keyboard(px: number): void }).keyboard(n), px);

  /** The element row sits on the keyboard's top edge, and the typed line is above the row. */
  async function expectAttached(page: Page, px: number) {
    const height = page.viewportSize()?.height ?? 0;
    await expect
      .poll(async () =>
        Math.round(
          ((await elementBar(page).boundingBox())?.y ?? 0) +
            ((await elementBar(page).boundingBox())?.height ?? 0),
        ),
      )
      .toBe(height - px);
    const row = await elementBar(page).boundingBox();
    const line = await page.locator('.cm-activeLine').boundingBox();
    expect(line, 'the line being typed').toBeTruthy();
    expect((line?.y ?? 0) + (line?.height ?? 0)).toBeLessThanOrEqual((row?.y ?? 0) + 1);
    expect(line?.y ?? 0).toBeGreaterThanOrEqual(0);
  }

  test('the element row sits above the on-screen keyboard and never covers the typed line, also after rotating', async ({
    page,
  }) => {
    await start(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await keyboard(page, 300);
    await expectAttached(page, 300);
    // Typing on: new lines stay above the row.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Enter');
      await page.keyboard.type(`Line ${i}.`);
    }
    await expectAttached(page, 300);
    // The bottom tab bar is under the keyboard, out of the way.
    await expect(bar(page)).toBeHidden();
    // Turned on its side: the keyboard is shorter, and the row follows it.
    const size = page.viewportSize() ?? { width: 0, height: 0 };
    await page.setViewportSize({ width: size.height, height: size.width });
    await keyboard(page, 160);
    await expectAttached(page, 160);
    await page.keyboard.type(' More.');
    await expectAttached(page, 160);
    // The keyboard goes: the row goes back over the text, and the tab bar comes back.
    await keyboard(page, 0);
    await expect(bar(page)).toBeVisible();
    const row = await elementBar(page).boundingBox();
    const text = await page.locator('.cm-scroller').boundingBox();
    expect(row?.y ?? 0).toBeLessThan(text?.y ?? 0);
  });
});

test.describe('menus and the palette', () => {
  test('open as bottom sheets on a phone', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a phone');
    await start(page);
    const viewport = page.viewportSize() ?? { width: 0, height: 0 };
    /** Across the window and on its bottom edge, once its motion (a 4px rise) has ended. */
    const expectSheet = async (sheet: Locator, what: string) => {
      await expect
        .poll(
          async () => {
            const box = await sheet.boundingBox();
            return box
              ? [Math.round(box.x), Math.round(box.width), Math.round(box.y + box.height)]
              : null;
          },
          { message: what },
        )
        .toEqual([0, viewport.width, viewport.height]);
    };
    await page.getByRole('button', { name: 'Drafter menu' }).click();
    const menu = page.getByRole('menu', { name: 'Drafter menu' });
    await expect(menu).toBeVisible();
    await expectSheet(menu, 'the Drafter menu');
    // Its rows are big enough for a finger.
    const row = await menu.getByRole('menuitem').first().boundingBox();
    expect(row?.height ?? 0).toBeGreaterThanOrEqual(40);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await more(page).click();
    await expectSheet(moreMenu(page), 'More');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Go to scene or command' }).click();
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette).toBeVisible();
    await expectSheet(palette, 'the palette');
    // The search field still has focus, and Escape closes it.
    await expect(palette.locator('input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  });

  test('stay menus beside their button on a wide screen', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'a wide screen');
    await page.setViewportSize({ width: 1280, height: 800 });
    await start(page);
    await page.getByRole('button', { name: 'Drafter menu' }).click();
    const menu = page.getByRole('menu', { name: 'Drafter menu' });
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box?.width ?? 0).toBeLessThan(600);
  });
});

// The top bar's overflow (Task 6's stopgap scrolled it sideways): what doesn't fit goes into a
// "More actions" menu at the bar's end, and the page never widens.
test.describe('the top bar on a phone', () => {
  test('folds what does not fit into More actions, which runs it', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await start(page);
    // A module's button and the unsaved dot make the bar fuller than 320px.
    await turnOnFixture(page);
    await editor(page).click();
    await page.keyboard.type('x');
    const toolbar = page.locator('header.toolbar');
    const fits = () =>
      toolbar.evaluate((el) => ({
        bar: el.scrollWidth <= el.clientWidth,
        page: document.documentElement.scrollWidth <= window.innerWidth,
        scrolls: getComputedStyle(el).overflowX,
      }));
    await expect.poll(fits).toEqual({ bar: true, page: true, scrolls: 'hidden' });
    const overflow = toolbar.getByRole('button', { name: 'More actions' });
    await expect(overflow).toBeVisible();
    await overflow.click();
    const menu = page.getByRole('menu', { name: 'More actions' });
    await expect(menu).toBeVisible();
    // The theme folds first.
    await menu.getByRole('menuitem', { name: /^Switch to (light|dark) theme$/ }).click();
    await expect(page.locator('html')).toHaveClass(/light/);
    // With room again, nothing is folded.
    await page.setViewportSize({ width: 800, height: 800 });
    await expect(overflow).toBeHidden();
  });
});
