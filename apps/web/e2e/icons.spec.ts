import { expect, test } from '@playwright/test';

// The icons are bundled into the build (nothing is fetched), from a scan of the source: one the
// scan misses draws nothing, with no error to say so.
test('draws the icons the Scripts menu names in a .ts file', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.cm-content')).toBeAttached();
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  for (const name of ['New screenplay', 'New stage play', 'New Markdown document']) {
    const item = page.getByRole('group', { name: 'Scripts' }).getByRole('button', { name });
    await expect(item).toBeVisible();
    const mask = await item.locator('.iconify').evaluate((icon) => {
      const style = getComputedStyle(icon);
      return style.maskImage && style.maskImage !== 'none'
        ? style.maskImage
        : style.getPropertyValue('-webkit-mask-image');
    });
    expect(mask, `${name} has an icon`).toContain('data:image/svg+xml');
  }
});
