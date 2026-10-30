import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { closeSettings, openSettings, runCommand, setText, settingsDialog, start } from './modules';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`);
}

test.describe('on a desktop', () => {
  test.skip(({ isMobile }) => !!isMobile, 'two panes need a wide screen');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tablist', { name: 'Left pane' })).toBeVisible();
  });

  test('shows Source on the left and Script on the right', async ({ page }) => {
    const left = page.getByRole('tablist', { name: 'Left pane' });
    const right = page.getByRole('tablist', { name: 'Right pane' });
    await expect(left.getByRole('tab', { name: 'Source' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(right.getByRole('tab', { name: 'Script' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tabpanel', { name: 'Source' })).toContainText('Title: The Call');
  });

  test('leaves room between the logo and the toolbar buttons', async ({ page }) => {
    const logo = await page.getByRole('img', { name: 'Drafter' }).boundingBox();
    const open = await page.getByRole('button', { name: 'Open', exact: true }).boundingBox();
    if (!logo || !open) throw new Error('the logo or the Open button is missing');
    expect(open.x - (logo.x + logo.width)).toBeGreaterThanOrEqual(24);
  });

  test('keeps the action icons smaller than the logo', async ({ page }) => {
    const logo = await page.getByRole('img', { name: 'Drafter' }).boundingBox();
    const circle = await page
      .getByRole('button', { name: 'Open', exact: true })
      .locator('.round')
      .boundingBox();
    if (!logo || !circle) throw new Error('the logo or the Open icon is missing');
    expect(circle.height).toBeLessThan(logo.height);
    expect(circle.height).toBeGreaterThanOrEqual(24); // WCAG 2.5.8's minimum target
  });

  test('swaps panes when a tab open in the other pane is chosen', async ({ page }) => {
    await page
      .getByRole('tablist', { name: 'Right pane' })
      .getByRole('tab', { name: 'Source' })
      .click();
    await expect(
      page.getByRole('tablist', { name: 'Left pane' }).getByRole('tab', { name: 'Script' }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('tablist', { name: 'Right pane' }).getByRole('tab', { name: 'Source' }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  test('chooses a tab with the keyboard, not by arrowing past it', async ({ page }) => {
    const right = page.getByRole('tablist', { name: 'Right pane' });
    await right.getByRole('tab', { name: 'Script' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(right.getByRole('tab', { name: 'Problems' })).toBeFocused();
    await expect(right.getByRole('tab', { name: 'Script' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('Enter');
    await expect(right.getByRole('tab', { name: 'Problems' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('marks the selected tab in forced-colors mode', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'forced colors are emulated in Chromium');
    // Windows High Contrast drops backgrounds and box-shadows, which is how
    // the selected tab normally stands out; a border survives.
    await page.emulateMedia({ forcedColors: 'active' });
    const right = page.getByRole('tablist', { name: 'Right pane' });
    const bottomBorder = (name: string) =>
      right.getByRole('tab', { name }).evaluate((el) => {
        const style = getComputedStyle(el);
        return `${style.borderBottomStyle} ${style.borderBottomWidth}`;
      });
    expect(await bottomBorder('Script')).toMatch(/^solid [1-9]/);
    expect(await bottomBorder('Problems')).not.toMatch(/^solid/);
  });

  test('moves focus between the panes with F6', async ({ page }) => {
    await page.getByRole('tabpanel', { name: 'Source' }).focus();
    await page.keyboard.press('F6');
    await expect(page.getByRole('tabpanel', { name: 'Script' })).toBeFocused();
    await page.keyboard.press('F6');
    await expect(page.getByRole('tabpanel', { name: 'Source' })).toBeFocused();
  });

  test('resizes the panes with the keyboard', async ({ page }) => {
    const divider = page.getByRole('separator', { name: 'Resize panes' });
    const leftWidth = async () =>
      (await page.getByRole('tabpanel', { name: 'Source' }).boundingBox())?.width ?? 0;
    await expect(divider).toHaveAttribute('aria-valuenow', '50');
    const before = await leftWidth();
    await divider.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(divider).toHaveAttribute('aria-valuenow', '45');
    await page.keyboard.press('Home');
    await expect(divider).toHaveAttribute('aria-valuenow', '25');
    await page.keyboard.press('End');
    await expect(divider).toHaveAttribute('aria-valuenow', '75');
    expect(await leftWidth()).toBeGreaterThan(before * 1.4);
  });

  test('switches to the light theme and remembers it', async ({ page }) => {
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
  });

  test('has no accessibility violations in either theme', async ({ page }) => {
    expect(await violations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    expect(await violations(page)).toEqual([]);
  });

  test('shows a focus ring on every control', async ({ page, browserName }) => {
    // WebKit on macOS skips buttons on Tab, as Safari does; Option-Tab reaches them.
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    const unringed: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press(tab);
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        // The focus ring is an outline. (A box-shadow doesn't count: the
        // selected tab's underline is one, focused or not.) The editor's
        // text is ringed through the whole editor, gutters included; other
        // controls inside the editor, such as the search panel's, ring themselves.
        const ringedElement = el.closest('.cm-content') ? el.closest('.cm-editor') : null;
        const style = getComputedStyle(ringedElement ?? el);
        const ringed = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
        return {
          name: `${el.tagName.toLowerCase()} ${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 24)}`,
          ringed,
        };
      });
      if (!focused || seen.has(focused.name)) continue;
      seen.add(focused.name);
      if (!focused.ringed) unringed.push(focused.name);
    }
    expect(seen.size).toBeGreaterThan(8);
    expect(unringed).toEqual([]);
  });
});

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'one pane on a narrow screen');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tablist')).toBeVisible();
  });

  test('shows one pane with all four tabs, and More, on a phone', async ({ page }) => {
    await expect(page.getByRole('tablist')).toHaveCount(1);
    const tabs = page.getByRole('tablist', { name: 'Panes' }).getByRole('tab');
    await expect(tabs).toHaveText(['Source', 'Script', /^Problems(\s+\d+)?\s*$/, 'Outline']);
    await expect(page.getByRole('button', { name: 'More tabs' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Script' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tabpanel', { name: 'Script' })).toBeVisible();
  });

  // How far the page is wider than the screen at `width`. It loads at that
  // width, as a phone would, and waits for images and fonts, so the logo has
  // settled. In mobile emulation the layout viewport (innerWidth) grows to fit
  // whatever overflows, so measure against the root's client width instead.
  async function overflowAt(page: Page, width: number) {
    await page.setViewportSize({ width, height: 740 });
    await page.reload();
    await expect(page.getByRole('tablist', { name: 'Panes' })).toBeVisible();
    return page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
  }

  test('keeps More on a 375px screen, with the Problems count showing and a tab in the slot', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.reload();
    // Twelve headings with no time of day: a count of two digits on the Problems tab.
    const scenes = Array.from({ length: 12 }, (_, i) => `INT. ROOM ${i + 1}\n\nWaiting.\n`);
    await setText(page, scenes.join('\n'));
    const problems = page.getByRole('tab', { name: /^Problems/ });
    await expect(problems).toHaveText(/^Problems\s+\d\d$/);
    const more = page.getByRole('button', { name: 'More tabs' });
    await expect(more).toBeVisible();
    const box = await more.boundingBox();
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
    // And with a tab in the slot: More is its chevron alone there, still named "More tabs".
    await runCommand(page, 'Show Cards');
    await expect(page.getByRole('tab', { name: 'Cards' })).toHaveAttribute('aria-selected', 'true');
    await expect(problems).toHaveText(/^Problems\s+\d\d$/);
    const filled = await more.boundingBox();
    expect((filled?.x ?? 0) + (filled?.width ?? 0)).toBeLessThanOrEqual(width);
  });

  test('fits a 360px screen without horizontal scrolling', async ({ page }) => {
    expect(await overflowAt(page, 360)).toBeLessThanOrEqual(0);
  });

  test('fits a 320px screen without horizontal scrolling, as WCAG reflow requires', async ({
    page,
  }) => {
    expect(await overflowAt(page, 320)).toBeLessThanOrEqual(0);
  });

  test('gives every toolbar button at least a 24px target on a phone', async ({ page }) => {
    const small: string[] = [];
    for (const button of await page.getByRole('banner').getByRole('button').all()) {
      const box = await button.boundingBox();
      if (!box || box.width < 24 || box.height < 24) {
        small.push(
          `${(await button.getAttribute('aria-label')) ?? (await button.textContent())}: ${box?.width}x${box?.height}`,
        );
      }
    }
    expect(small).toEqual([]);
  });

  test('sizes the search and theme buttons like the action circles', async ({ page }) => {
    const banner = page.getByRole('banner');
    const size = async (target: Locator) => {
      const box = await target.boundingBox();
      if (!box) throw new Error('a toolbar button is missing');
      return `${Math.round(box.width)}x${Math.round(box.height)}`;
    };
    const circle = await size(
      banner.getByRole('button', { name: 'Open', exact: true }).locator('.round'),
    );
    expect(await size(banner.getByRole('button', { name: 'Go to scene or command' }))).toBe(circle);
    expect(await size(banner.getByRole('button', { name: /^Switch to (light|dark) theme$/ }))).toBe(
      circle,
    );
  });

  test('has no accessibility violations on a phone', async ({ page }) => {
    expect(await violations(page)).toEqual([]);
  });
});

// The tab row (Phase 2 design §5.8): Source, Script, Problems, and Outline, then one slot for
// another tab (a module's), then More with the rest.
test.describe('the tab row', () => {
  /** Turns sample modules on in Settings. */
  async function turnOn(page: Page, names: string[]) {
    await openSettings(page);
    for (const name of names) {
      const toggle = settingsDialog(page).getByRole('switch', { name, exact: true });
      await toggle.click();
      await expect(toggle).toBeChecked();
    }
    await closeSettings(page);
  }
  const firstPane = (page: Page) => page.locator('[data-pane]').first();
  const row = (page: Page) => firstPane(page).getByRole('tablist');
  const more = (page: Page) => firstPane(page).getByRole('button', { name: 'More tabs' });
  const menu = (page: Page) => page.getByRole('menu', { name: 'More tabs' });

  test("shows Outline, then More, in each pane's tab row", async ({ page, isMobile }) => {
    await start(page);
    for (const list of await page.getByRole('tablist').all()) {
      await expect(list.getByRole('tab')).toHaveText([
        'Source',
        'Script',
        /^Problems(\s+\d+)?\s*$/,
        'Outline',
      ]);
    }
    await expect(page.getByRole('tablist')).toHaveCount(isMobile ? 1 : 2);
    // Cards, Notes, and Stats wait under More until one is chosen (controller ruling 4).
    await expect(page.getByRole('button', { name: 'More tabs' })).toHaveCount(isMobile ? 1 : 2);
  });

  test('chooses a module tab from More, which then takes the slot', async ({ page }) => {
    await start(page);
    await turnOn(page, ['Scene list', 'Cast']);
    const tabs = row(page).getByRole('tab');
    // No tab holds the slot until one is chosen; Cards, Notes, Stats, Scaffold, then the modules'
    // tabs are in More.
    await expect(tabs).toHaveText([/^Source/, /^Script/, /^Problems/, /^Outline/]);
    await more(page).click();
    await expect(more(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(menu(page).getByRole('menuitem')).toHaveText([
      'Cards',
      // The sample's open notes are counted in Notes' name.
      /^Notes, \d+ open$/,
      'Stats',
      'Scaffold',
      /^(Scenes|Cast)$/,
      /^(Scenes|Cast)$/,
    ]);
    await menu(page).getByRole('menuitem', { name: 'Cast' }).click();
    await expect(menu(page)).toBeHidden();
    const chosen = row(page).getByRole('tab', { name: 'Cast' });
    await expect(chosen).toHaveAttribute('aria-selected', 'true');
    await expect(chosen).toBeFocused();
    await expect(tabs).toHaveCount(5);
    // Back to a core tab: the one chosen keeps the slot.
    await row(page).getByRole('tab', { name: 'Outline' }).click();
    await expect(tabs.last()).toHaveText('Cast');
  });

  test('More works from the keyboard, and Escape returns focus', async ({ page }) => {
    await start(page);
    await turnOn(page, ['Scene list', 'Cast']);
    const items = menu(page).getByRole('menuitem');
    await more(page).focus();
    await page.keyboard.press('Enter');
    // Cards, Notes, and Stats first, then the modules' tabs.
    await expect(items.first()).toBeFocused();
    await expect(items.first()).toHaveText('Cards');
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(more(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();
    const name = ((await items.nth(1).textContent()) ?? '').trim();
    await page.keyboard.press('Enter');
    await expect(row(page).getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
  });
});
