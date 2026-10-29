import { expect, type Page, test } from '@playwright/test';
import { expectTypingLeavesScript, lastPane, start } from './modules';

// Keys typed while a tab other than the Source has focus never reach the script (decided
// 2026-10-29): Safari types into the editor while its selection is still in the page, so the panes
// let go of it when focus goes to another tab. Compare's own check is in compare.spec.ts.

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
