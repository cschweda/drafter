import { expect, type Page, test } from '@playwright/test';
import { editor, pressToolbarButton, setText, showSource, start, wholeText } from './modules';

// Classic Mode on a phone (design §10): an on-screen keyboard has Enter and no Tab, so the element
// row over the keyboard starts with a Next button that does what Tab does; the row shows there
// whatever the setting, in focus mode too; and the chooser opens where the writer can see it, above
// the keyboard. A test browser has no on-screen keyboard, so `visualViewport` is a stand-in whose
// height the test sets, as bottom-bar.spec.ts does.

const SCRIPT = 'INT. DINER - DAY\n\nThe lights hum.';

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

const KEYBOARD = 300;
const keyboard = (page: Page, px: number) =>
  page.evaluate((n) => (window as unknown as { keyboard(px: number): void }).keyboard(n), px);
const row = (page: Page) => page.getByRole('toolbar', { name: 'Element bar' });
const next = (page: Page) => row(page).locator('[data-next]');

/** Classic Mode on the script, the hint seen, the cursor at the end, the keyboard up. */
async function classic(page: Page) {
  await start(page);
  await setText(page, SCRIPT);
  await page.getByRole('button', { name: /^Writing mode: Fountain\./ }).click();
  await expect(editor(page)).toHaveAttribute('aria-label', 'Source, Classic Mode');
  await showSource(page);
  const hint = page.locator('[data-classic-hint]');
  if (await hint.isVisible()) await hint.getByRole('button', { name: 'Got it' }).click();
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await keyboard(page, KEYBOARD);
  await expect(next(page)).toBeVisible();
  // Chrome for Android's Enter is read from the page's change, and CodeMirror drops one that comes
  // within 50 ms of another change with none of its own, as the room the keyboard makes is: a real
  // keyboard's Enter always changes the page, a test's doesn't. So the test lets that settle.
  await page.waitForTimeout(100);
}

test('the Next button names where Tab goes, does it, and keeps the keyboard up', async ({
  page,
}) => {
  await classic(page);
  await expect(next(page)).toHaveText('Next: Character');
  // First in the row, and big enough for a finger.
  const first = await row(page).locator('[data-bar-item]:not([data-folded])').first();
  await expect(first).toHaveAttribute('data-next', '');
  const box = await next(page).boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  // It lies wholly above the keyboard.
  const height = page.viewportSize()?.height ?? 0;
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(height - KEYBOARD + 1);

  await next(page).tap();
  // Tab from Action: Character, a blank line, and the editor still has focus.
  await expect.poll(() => wholeText(page)).toBe(`${SCRIPT}\n\n`);
  await expect(editor(page)).toBeFocused();
  await expect(next(page)).toHaveText('Next: Transition');
  await page.keyboard.type('june');
  await expect(next(page)).toHaveText('Next: Dialogue');
  await next(page).tap();
  await expect.poll(() => wholeText(page)).toBe(`${SCRIPT}\n\nJUNE\n`);
  await expect(editor(page)).toBeFocused();
});

test('the row shows in Classic Mode whatever the setting, and in focus mode', async ({ page }) => {
  await classic(page);
  await expect(next(page)).toBeVisible();
  // Hidden by its own menu: the keyboard down, it's gone; up again, it's back for its Next.
  await keyboard(page, 0);
  await row(page).getByRole('button', { name: 'Element bar options' }).click();
  await page.getByRole('menuitem', { name: 'Hide the element bar' }).click();
  await expect(row(page)).toHaveCount(0);
  await editor(page).click();
  await keyboard(page, KEYBOARD);
  await expect(next(page)).toBeVisible();
  // Focus mode keeps it too.
  await keyboard(page, 0);
  await pressToolbarButton(page, 'Focus');
  await expect(page.locator('[data-focus-layout]')).toBeVisible();
  await expect(row(page)).toHaveCount(0);
  await editor(page).click();
  await keyboard(page, KEYBOARD);
  await expect(next(page)).toBeVisible();
});

test('Fountain Mode’s row over the keyboard has no Next button', async ({ page }) => {
  await start(page);
  await setText(page, SCRIPT);
  await editor(page).click();
  await keyboard(page, KEYBOARD);
  await expect(row(page)).toBeVisible();
  await expect(next(page)).toHaveCount(0);
});

test('the chooser opens above the keyboard, with rows a finger can take', async ({ page }) => {
  await classic(page);
  // Android's Enter reaches the editor a moment later, through the page's change.
  await page.keyboard.press('Enter');
  await expect.poll(() => wholeText(page)).toBe(`${SCRIPT}\n\n`);
  await page.keyboard.press('Enter');
  const list = page.locator('.cm-chooser');
  await expect(list).toBeVisible();
  const height = page.viewportSize()?.height ?? 0;
  await expect
    .poll(async () => {
      const box = await list.boundingBox();
      return (box?.y ?? 0) + (box?.height ?? 0);
    })
    .toBeLessThanOrEqual(height - KEYBOARD + 1);
  // Nor under the top bar: it keeps to the editor.
  const box = await list.boundingBox();
  const area = await page.locator('.cm-editor').boundingBox();
  expect(box?.y ?? 0).toBeGreaterThanOrEqual((area?.y ?? 0) - 1);
  const rowBox = await list.getByRole('option').first().boundingBox();
  expect(rowBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await list.getByRole('option', { name: 'Character' }).tap();
  await expect(list).toBeHidden();
  await expect(editor(page)).toBeFocused();
  await expect(next(page)).toHaveText('Next: Transition');
});
