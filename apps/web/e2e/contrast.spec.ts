import { expect, type Locator, type Page, test } from '@playwright/test';
import { editor, pressToolbarButton, stored } from './modules';

// The contrast sliders (the maintainer, 2026-11-03): behind the top bar's Contrast button, one for
// the Source and one for the Script, each moving its own pane's colours live, in the light and
// the dark theme, and both in Settings. Higher is further from the background in either theme.

/** A colour as sRGB numbers, through a canvas, whatever form the browser computes it in. */
async function rgbOf(
  target: Locator,
  property: 'color' | 'backgroundColor' = 'color',
): Promise<[number, number, number]> {
  return target.evaluate((el, which) => {
    const color = getComputedStyle(el)[which];
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r as number, g as number, b as number];
  }, property);
}

/** WCAG's relative luminance. */
const luminance = ([r, g, b]: [number, number, number]) => {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

async function start(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toContainText('The Call');
}

const sourceSlider = (page: Page) =>
  page.getByRole('slider', { name: 'Source contrast', exact: true }).first();
const scriptSlider = (page: Page) =>
  page.getByRole('slider', { name: 'Script contrast', exact: true }).first();
/** Opens the top bar's Contrast panel, with both sliders. */
async function openContrast(page: Page) {
  await pressToolbarButton(page, 'Contrast');
  await expect(page.getByRole('group', { name: 'Contrast' })).toBeVisible();
}
/** A note in the Source: the green that started this. */
const note = (page: Page) => editor(page).locator('.cm-f-note').first();

/** Moves a slider to its lowest or its highest with the keyboard, as a writer can. */
async function slide(slider: Locator, to: 'Home' | 'End') {
  await slider.focus();
  await slider.press(to);
}

test.describe('the contrast sliders', () => {
  test.skip(({ isMobile }) => isMobile, 'a phone shows one pane at a time; Settings has both');
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`the Source's slider moves the Source's colours, and only those (${theme})`, async ({
      page,
    }) => {
      await start(page);
      if (theme === 'light') await pressToolbarButton(page, 'Switch to light theme');
      await expect(page.locator('html')).toHaveClass(new RegExp(theme));
      await openContrast(page);
      const slider = sourceSlider(page);
      await expect(slider).toBeVisible();
      // Nearly the highest, by default.
      await expect(slider).toHaveValue('90');
      await expect(slider).toHaveAttribute('aria-valuetext', '90%');
      const ground = luminance(await rgbOf(page.locator('.cm-editor').first(), 'backgroundColor'));
      const page1 = page.locator('.drafter-page').first();
      const inkBefore = await rgbOf(page1);
      const distance = async () => Math.abs(luminance(await rgbOf(note(page))) - ground);

      const atDefault = await distance();
      await slide(slider, 'Home');
      await expect(slider).toHaveValue('40');
      await expect.poll(distance).toBeLessThan(atDefault);
      const atLowest = await distance();
      await slide(slider, 'End');
      await expect(slider).toHaveValue('100');
      await expect.poll(distance).toBeGreaterThan(atDefault);
      expect(atLowest).toBeLessThan(atDefault);
      // The Script's pages didn't move.
      expect(await rgbOf(page1)).toEqual(inkBefore);
    });

    test(`the Script's slider moves the pages' ink, and only that (${theme})`, async ({ page }) => {
      await start(page);
      if (theme === 'light') await pressToolbarButton(page, 'Switch to light theme');
      await openContrast(page);
      const slider = scriptSlider(page);
      await expect(slider).toBeVisible();
      await expect(slider).toHaveValue('90');
      const page1 = page.locator('.drafter-page').first();
      const noteBefore = await rgbOf(note(page));
      // Paper is light in both themes, so its ink is darker the higher the slider.
      const ink = async () => luminance(await rgbOf(page1));
      const atDefault = await ink();
      await slide(slider, 'Home');
      await expect.poll(ink).toBeGreaterThan(atDefault);
      await slide(slider, 'End');
      await expect.poll(ink).toBeLessThanOrEqual(atDefault);
      expect(await rgbOf(note(page))).toEqual(noteBefore);
    });
  }

  for (const theme of ['dark', 'light'] as const) {
    test(`says each pane's WCAG 2.1 contrast ratio, and how it moves (${theme})`, async ({
      page,
    }) => {
      await start(page);
      if (theme === 'light') await pressToolbarButton(page, 'Switch to light theme');
      await openContrast(page);
      const ratios = page.getByRole('group', { name: 'Contrast' }).locator('[data-contrast-ratio]');
      await expect(ratios).toHaveCount(2);
      const ratioOf = async (n: number) =>
        Number((await ratios.nth(n).locator('strong').first().textContent())?.split(':')[0]);
      // At the default, the text of both panes passes AA for normal text, and the Source names
      // its weakest colour.
      await expect.poll(() => ratioOf(0)).toBeGreaterThanOrEqual(4.5);
      await expect.poll(() => ratioOf(1)).toBeGreaterThanOrEqual(4.5);
      await expect(ratios.nth(0)).toContainText(/AAA|AA/);
      await expect(ratios.nth(0)).toContainText('weakest');
      // The slider is described by them, for a screen reader.
      const slider = sourceSlider(page);
      const described = await slider.getAttribute('aria-describedby');
      expect(described).toBeTruthy();
      await expect(page.locator(`[id="${described}"]`)).toContainText(/Text \d+\.\d:1, WCAG/);
      // Lower, the ratio falls; higher, it rises.
      const atDefault = await ratioOf(0);
      await slide(slider, 'Home');
      await expect.poll(() => ratioOf(0)).toBeLessThan(atDefault);
      await slide(slider, 'End');
      await expect.poll(() => ratioOf(0)).toBeGreaterThan(atDefault);
    });
  }

  test('both are in Settings, and a value is kept after a reload', async ({ page }) => {
    await start(page);
    await page.keyboard.press('ControlOrMeta+,');
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();
    const inSettings = dialog.getByRole('slider', { name: 'Source contrast' });
    await expect(inSettings).toBeVisible();
    await expect(dialog.getByRole('slider', { name: 'Script contrast' })).toBeVisible();
    await inSettings.focus();
    await inSettings.press('ArrowLeft');
    await expect(inSettings).toHaveValue('85');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await stored(page)).sourceContrast).toBe(85);
    await page.reload();
    await expect(editor(page)).toContainText('The Call');
    await openContrast(page);
    await expect(sourceSlider(page)).toHaveValue('85');
    await expect(scriptSlider(page)).toHaveValue('90');
  });
});
