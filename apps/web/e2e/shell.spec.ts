import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

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
        // selected tab's underline is one, focused or not.)
        const style = getComputedStyle(el);
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

  test('shows one pane with all three tabs on a phone', async ({ page }) => {
    await expect(page.getByRole('tablist')).toHaveCount(1);
    const tabs = page.getByRole('tablist', { name: 'Panes' }).getByRole('tab');
    await expect(tabs).toHaveText(['Source', 'Script', 'Problems']);
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

  test('fits a 360px screen without horizontal scrolling', async ({ page }) => {
    expect(await overflowAt(page, 360)).toBeLessThanOrEqual(0);
  });

  test('fits a 320px screen without horizontal scrolling, as WCAG reflow requires', async ({
    page,
  }) => {
    expect(await overflowAt(page, 320)).toBeLessThanOrEqual(0);
  });

  test('has no accessibility violations on a phone', async ({ page }) => {
    expect(await violations(page)).toEqual([]);
  });
});
