import { expect, type Page, test } from '@playwright/test';
import {
  editor,
  expectTypingLeavesScript,
  lastPane,
  showSource,
  start,
  wholeText,
} from './modules';

// Keys typed while a tab other than the Source has focus never reach the script (decided
// 2026-10-29): Safari types into the editor while its selection is still in the page, so the panes
// let go of it when focus goes anywhere else in the page. Compare's own check is in
// compare.spec.ts.

/** Shows the tab called `name` in the right pane (from its row, or from More), with the Source on the left. */
async function showRight(page: Page, name: string) {
  const pane = lastPane(page);
  const tab = pane.getByRole('tab', { name, exact: true });
  if ((await tab.count()) === 0) {
    await pane.getByRole('button', { name: 'More tabs' }).click();
    await page
      .getByRole('menu', { name: 'More tabs' })
      .getByRole('menuitem', { name: new RegExp(`^${name}`) })
      .click();
    // Focus goes to the chosen tab once the menu has closed: wait for it, so it can't take focus
    // from the panel afterwards.
    await expect(pane.getByRole('tab', { name: new RegExp(`^${name}`) })).toBeFocused();
  } else {
    await tab.click();
  }
  await expect(
    pane.getByRole('tab', { name: new RegExp(`^${name}`), selected: true }),
  ).toBeVisible();
}

test.describe('keys in a tab other than the Source', () => {
  test.skip(({ isMobile }) => !!isMobile, 'the Source beside the tab');

  for (const [name, id] of [
    ['Outline', 'outline'],
    ['Cards', 'cards'],
    ['Notes', 'notes'],
    ['Problems', 'problems'],
  ] as const) {
    test(`typing in the ${name} tab leaves the script alone`, async ({ page }) => {
      await start(page);
      await showRight(page, name);
      await expectTypingLeavesScript(page, page.locator(`#panel-${id}`));
    });
  }
});

/** With the cursor at the end of the script, `move` takes focus elsewhere; then "xyz" is typed. */
async function expectTypingAfterLeavesScript(page: Page, move: () => Promise<void>) {
  await start(page);
  await showSource(page);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  const before = await wholeText(page);
  await move();
  await page.keyboard.type('xyz');
  expect(await wholeText(page)).toBe(before);
  // Back in the editor, the cursor is where it was: at the end.
  await editor(page).focus();
  await page.keyboard.type('Q');
  await expect.poll(() => wholeText(page)).toBe(`${before}Q`);
}

const outlineTab = (page: Page) =>
  lastPane(page).getByRole('tab', { name: 'Outline', exact: true });
const historyButton = (page: Page) => page.getByRole('button', { name: /^History, / });

test.describe('keys outside the tab panels', () => {
  test.skip(({ isMobile }) => !!isMobile, 'the Source beside the other pane');

  test('typing after clicking a tab in the tab row leaves the script alone', async ({ page }) => {
    await expectTypingAfterLeavesScript(page, async () => {
      await outlineTab(page).click();
      await expect(outlineTab(page)).toBeFocused();
    });
  });

  test('typing on the status bar’s History button leaves the script alone', async ({ page }) => {
    await expectTypingAfterLeavesScript(page, async () => {
      await historyButton(page).focus();
      await expect(historyButton(page)).toBeFocused();
    });
  });

  test('typing once the editor has lost focus leaves the script alone', async ({ page }) => {
    await expectTypingAfterLeavesScript(page, async () => {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect(editor(page)).not.toBeFocused();
    });
  });

  for (const [name, target] of [
    ['a tab in the tab row', outlineTab],
    ['the status bar’s History button', historyButton],
  ] as const) {
    test(`Backspace on ${name} doesn’t go back a page`, async ({ page }) => {
      // A page to go back to.
      await page.goto('/docs/');
      await start(page);
      await showSource(page);
      await editor(page).click();
      await page.keyboard.press('ControlOrMeta+End');
      const before = await wholeText(page);
      await target(page).focus();
      await page.keyboard.press('Backspace');
      // Going back would have started by now.
      await page.waitForTimeout(300);
      expect(new URL(page.url()).pathname).toBe('/');
      expect(await wholeText(page)).toBe(before);
      // Backspace in the editor still deletes.
      await editor(page).focus();
      await page.keyboard.press('Backspace');
      await expect.poll(() => wholeText(page)).toBe(before.slice(0, -1));
    });
  }
});
