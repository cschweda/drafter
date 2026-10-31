import { expect, type Locator, type Page, test } from '@playwright/test';
import { editor, palette, paletteInput, setText, start } from './modules';

// One dialog style (fresh-look design §5, Task 7): every dialog is a DDialog, a native <dialog> on
// --raised with a 12px radius, 24px padding, a real backdrop, the one motion (none with reduced
// motion), and focus back where it was when it closes.

type Theme = 'dark' | 'light';

/** --raised, as the browser reports it. */
const RAISED: Record<Theme, string> = {
  dark: 'rgb(28, 31, 36)',
  light: 'rgb(240, 239, 235)',
};
/** The backdrop: black at half in the dark theme, a quarter in the light. */
const BACKDROP: Record<Theme, RegExp> = {
  dark: /^rgba\(0, 0, 0, 0\.5\)$/,
  light: /^rgba\(0, 0, 0, 0\.25\)$/,
};

const SCRIPT = 'INT. HALL - DAY\n\nAnn waits.\n\nANN\nHello.\n';

/** Each dialog a palette command opens, by the command's title and the dialog's name. */
const FROM_PALETTE: Array<[command: string, name: string | RegExp]> = [
  ['Settings…', 'Settings'],
  ['Export options…', 'Export options'],
  ['Export as treatment…', 'Export as treatment'],
  ['New note…', 'New note'],
  ['Scene details…', /^Scene details for /],
  ['History…', 'History'],
  ['About Drafter', 'Drafter'],
  ['Check for updates…', 'Check for updates'],
];

async function useTheme(page: Page, theme: Theme) {
  await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
}

/** Runs a palette command by its title (its row's name may end with its shortcut). */
async function runCommand(page: Page, title: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(paletteInput(page)).toBeFocused();
  await page.keyboard.insertText(title);
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const row = palette(page).getByRole('option', { name: new RegExp(`^${escaped}( |$)`) });
  await expect(row).toHaveAttribute('data-highlighted', '');
  await page.keyboard.press('Enter');
  await expect(palette(page)).toBeHidden();
}

const dialogNamed = (page: Page, name: string | RegExp) =>
  page.getByRole('dialog', { name, exact: typeof name === 'string' });

/** Waits for the dialog's own motion to end, so what is measured is the dialog at rest. */
async function settled(dialog: Locator) {
  await dialog.evaluate((el) =>
    Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {}))),
  );
}

async function look(dialog: Locator) {
  return dialog.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      modal: el.matches(':modal'),
      background: style.backgroundColor,
      radius: style.borderTopLeftRadius,
      padding: style.paddingTop,
      backdrop: getComputedStyle(el, '::backdrop').backgroundColor,
      fills: el.getBoundingClientRect().width >= window.innerWidth - 1,
      title: (() => {
        const id = el.getAttribute('aria-labelledby');
        const heading = id ? document.getElementById(id) : null;
        if (!heading) return null;
        const h = getComputedStyle(heading);
        return { size: h.fontSize, weight: h.fontWeight };
      })(),
    };
  });
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`every dialog in the ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await useTheme(page, theme);
      await start(page);
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
      await setText(page, SCRIPT);
    });

    test(`every dialog uses one style (${theme})`, async ({ page }) => {
      for (const [command, name] of FROM_PALETTE) {
        await editor(page).getByText('Hello.').click();
        await runCommand(page, command);
        const dialog = dialogNamed(page, name);
        await expect(dialog, command).toBeVisible();
        await settled(dialog);
        const seen = await look(dialog);
        expect(seen.tag, command).toBe('dialog');
        expect(seen.modal, command).toBe(true);
        expect(seen.background, command).toBe(RAISED[theme]);
        // A dialog that fills a phone's screen (History, below 1024px) has no corners to round.
        expect(seen.radius, command).toBe(seen.fills ? '0px' : '12px');
        expect(seen.padding, command).toBe('24px');
        expect(seen.backdrop, command).toMatch(BACKDROP[theme]);
        expect(seen.title, command).toEqual({ size: '18px', weight: '600' });
        await page.keyboard.press('Escape');
        await expect(dialog, command).toBeHidden();
      }
    });
  });
}

test.describe('closing', () => {
  test.beforeEach(async ({ page }) => {
    await start(page);
    await setText(page, SCRIPT);
  });

  test('Escape closes and focus returns to the opener', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'a phone has no keyboard to open them from');
    for (const [command, name] of FROM_PALETTE) {
      await editor(page).getByText('Hello.').click();
      await expect(editor(page)).toBeFocused();
      await runCommand(page, command);
      const dialog = dialogNamed(page, name);
      await expect(dialog, command).toBeVisible();
      await expect
        .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)), command)
        .toBe(true);
      await page.keyboard.press('Escape');
      await expect(dialog, command).toBeHidden();
      await expect(editor(page), command).toBeFocused();
    }
  });

  test('a dialog opened from a menu gives focus to something real when it closes', async ({
    page,
  }) => {
    // The menu's row had focus when Settings opened, and is gone by the time it closes, so the
    // browser can't put focus back on it: the dialog falls back to the editor, or the Drafter menu.
    await page.getByRole('button', { name: 'Drafter menu' }).click();
    const menu = page.getByRole('menu', { name: 'Drafter menu' });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: /^Settings/ }).click();
    const dialog = dialogNamed(page, 'Settings');
    await expect(dialog).toBeVisible();
    await expect
      .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const active = document.activeElement;
          if (!active || active === document.body) return 'body';
          if (active.matches('.cm-content')) return 'editor';
          if (active.matches('[data-tour="menu"]')) return 'menu';
          return active.outerHTML.slice(0, 80);
        }),
      )
      .toMatch(/^(editor|menu)$/);
  });
});

test.describe('the motion', () => {
  test('a dialog fades in as it rises', async ({ page }) => {
    await start(page);
    await page.keyboard.press('ControlOrMeta+,');
    const dialog = dialogNamed(page, 'Settings');
    await expect(dialog).toBeVisible();
    const animation = await dialog.evaluate((el) => {
      const style = getComputedStyle(el);
      return { name: style.animationName, duration: style.animationDuration };
    });
    expect(animation).toEqual({ name: 'motion-in', duration: '0.14s' });
  });

  test('with reduced motion, nothing moves', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start(page);
    await page.keyboard.press('ControlOrMeta+,');
    const dialog = dialogNamed(page, 'Settings');
    await expect(dialog).toBeVisible();
    const moving = await dialog.evaluate((el) => ({
      animation: getComputedStyle(el).animationName,
      backdrop: getComputedStyle(el, '::backdrop').animationName,
      running: el.getAnimations().length,
    }));
    expect(moving).toEqual({ animation: 'none', backdrop: 'none', running: 0 });
  });
});
