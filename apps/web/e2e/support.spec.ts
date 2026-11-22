import { SUPPORT_ON, SUPPORT_ROUTES } from '../app/about/support';
import { expect, test } from './fixtures';
import { palette, start } from './modules';

// Support Drafter (docs/drafter-support-page-design.md): a tip jar on a help page. One button, to
// Ko-fi, where no account is needed; a sentence for people who have a GitHub account; nothing
// loaded from either; and no word of it on the writing screen. A build without the maintainer's
// Ko-fi page has no such page at all, which the last two tests check.

test.describe('the Support page', () => {
  test.skip(!SUPPORT_ON, 'this build has no Ko-fi page set');

  test('says what it is, in the words agreed', async ({ page }) => {
    await page.goto('/docs/support/');
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText('Support Drafter');
    await expect(main).toContainText('Drafter is free, and every part of it stays free.');
    await expect(main).toContainText(
      'If it has been useful and you’d like to say thanks, you can leave a tip.',
    );
    await expect(main).toContainText('No account needed.');
    await expect(main).toContainText('Nothing changes in Drafter whether you do or not.');
    await expect(main).toContainText('a tip is not tax-deductible');
    expect(await main.textContent()).not.toMatch(/donat|donor|charit/i);
  });

  test('has one button, to Ko-fi, and it leaves the app', async ({ page }) => {
    await page.goto('/docs/support/');
    const tip = page.locator('[data-support="tip"]');
    await expect(tip).toHaveText('Leave a tip');
    await expect(tip).toHaveAttribute('href', SUPPORT_ROUTES.tip as string);
    await expect(tip).toHaveAttribute('target', '_blank');
    await expect(tip).toHaveAttribute('rel', 'noopener noreferrer');
    expect((await tip.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    // The only links out of drafter.dev in the page's own text are the two routes.
    const outside = await page
      .getByRole('main')
      .locator('a[href^="http"]')
      .evaluateAll((links) => links.map((a) => a.getAttribute('data-support')));
    expect(outside.every((mark) => mark === 'tip' || mark === 'sponsor')).toBe(true);
  });

  test('offers GitHub only as a sentence, and only when its address is set', async ({ page }) => {
    await page.goto('/docs/support/');
    const sponsor = page.locator('[data-support="sponsor"]');
    if (!SUPPORT_ROUTES.sponsor) {
      await expect(sponsor).toHaveCount(0);
      await expect(page.getByRole('main')).not.toContainText('GitHub account');
      return;
    }
    await expect(page.getByRole('main')).toContainText('Have a GitHub account?');
    await expect(sponsor).toHaveAttribute('href', SUPPORT_ROUTES.sponsor);
    await expect(sponsor).toHaveAttribute('target', '_blank');
    await expect(sponsor).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('asks nothing of any other site', async ({ page, baseURL }) => {
    const outside: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith('data:') && !url.startsWith('blob:') && !url.startsWith(baseURL ?? '')) {
        outside.push(url);
      }
    });
    await page.goto('/docs/support/');
    await page.waitForLoadState('networkidle');
    expect(outside).toEqual([]);
  });

  test('does not scroll sideways at 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/docs/support/');
    await expect(page.locator('[data-support="tip"]')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test('is nowhere on the writing screen', async ({ page }) => {
    await start(page);
    const html = await page.content();
    expect(html).not.toContain(SUPPORT_ROUTES.tip as string);
    expect(html).not.toMatch(/Leave a tip|ko-fi/i);
  });

  test('is found in the palette by "tip" and by "donate"', async ({ page }) => {
    await start(page);
    for (const word of ['tip jar', 'donate']) {
      await page.keyboard.press('ControlOrMeta+k');
      await expect(palette(page)).toBeVisible();
      await page.keyboard.insertText(word);
      await expect(
        palette(page).getByRole('option', { name: /Open the page: Support Drafter/ }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(palette(page)).toBeHidden();
    }
  });
});

test.describe('a build with no Ko-fi page', () => {
  test.skip(SUPPORT_ON, 'this build has the Support page');

  test('has no Support page', async ({ page }) => {
    const response = await page.goto('/docs/support/');
    expect(response?.status()).toBe(404);
    await expect(page.locator('[data-support]')).toHaveCount(0);
  });

  test('has no Support command in the palette', async ({ page }) => {
    await start(page);
    await page.keyboard.press('ControlOrMeta+k');
    await expect(palette(page)).toBeVisible();
    await page.keyboard.insertText('Support Drafter');
    await expect(palette(page).getByRole('option', { name: /Support Drafter/ })).toHaveCount(0);
  });
});
