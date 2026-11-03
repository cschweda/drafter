import { expect, type Page, test } from '@playwright/test';
import { editor, setText, showSource, start } from './modules';

// Saying where you are in Classic Mode (design §9, §12): the chip, the key line, the live region,
// the words that say how to leave, and the first-run hint.

const SCRIPT = 'INT. DINER - DAY\n\nThe lights hum.\n';
const HINT =
  'Classic Mode. Press Enter and Tab to move through the script, and Enter on an empty line to choose an element. Your file stays Fountain. To leave the text, press Esc, then Tab; if a list is open, press Esc twice.';

const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
const hint = (page: Page) => page.locator('[data-classic-hint]');
const chip = (page: Page) => page.locator('[data-here]').first();
const keys = (page: Page) => page.locator('[data-item="keys"]');

async function classic(page: Page, seen = true) {
  await start(page);
  await setText(page, SCRIPT);
  if (wide(page)) {
    await page
      .getByRole('group', { name: 'Writing mode' })
      .getByRole('button', { name: 'Classic' })
      .click();
  } else {
    await page.getByRole('button', { name: /^Writing mode: Fountain\./ }).click();
  }
  await expect(editor(page)).toHaveAttribute('aria-label', 'Source, Classic Mode');
  await showSource(page);
  if (seen) await hint(page).getByRole('button', { name: 'Got it' }).click();
}

/** A setting as IndexedDB holds it, as classic-switch.spec.ts reads `writingMode`. */
const stored = (page: Page, key: string) =>
  page.evaluate(
    (name) =>
      new Promise((done) => {
        const open = indexedDB.open('drafter');
        open.onsuccess = () => {
          const get = open.result.transaction('settings').objectStore('settings').get(name);
          get.onsuccess = () => done(get.result?.value);
        };
      }),
    key,
  );

/** To the end of the line of action. */
async function toAction(page: Page) {
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('End');
}

test.describe('on a wide screen', () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 1024,
    'the chip and key line are side by side',
  );

  test('the chip names a pending element, presses its button, and the key line follows', async ({
    page,
  }) => {
    await classic(page);
    await toAction(page);
    await expect(chip(page)).toContainText('Action');
    await expect(keys(page)).toHaveText('Enter: Action · Tab: Character');
    await page.keyboard.press('Tab');
    await expect(chip(page)).toContainText('Character');
    await expect(page.locator('[data-bar-item="element-character"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(keys(page)).toHaveText('Enter: Choose an element · Tab: Transition');
    await expect(chip(page)).toHaveAttribute(
      'aria-description',
      'Enter: Choose an element · Tab: Transition. Opens the Classic Mode help.',
    );
  });

  test('the key line isn’t a live region, and says nothing in Fountain Mode', async ({ page }) => {
    await start(page);
    await setText(page, SCRIPT);
    await expect(keys(page)).toHaveCount(0);
    await page
      .getByRole('group', { name: 'Writing mode' })
      .getByRole('button', { name: 'Classic' })
      .click();
    await expect(keys(page)).toBeVisible();
    await expect(page.locator('[aria-live] [data-item="keys"]')).toHaveCount(0);
    await expect(keys(page)).not.toHaveAttribute('aria-live', /.*/);
  });

  test('bar tooltips and More hold no marks', async ({ page }) => {
    await classic(page);
    const tip = page.locator('#element-bar-element-character-tip');
    await expect(tip).toContainText('The name above a speech. Tab goes here from Action.');
    await page.locator('[data-bar-item="element-character"]').hover();
    const shown = page.getByRole('tooltip').first();
    await expect(shown).toContainText('The name above a speech');
    await expect(shown).not.toContainText('Mark:');
    await page.locator('[data-bar-item="more"]').click();
    await expect(page.getByRole('menuitem', { name: 'Classic Mode help' })).toBeVisible();
    await expect(page.locator('[role="menu"] kbd')).toHaveCount(0);
  });

  test('the chip opens the Classic Mode help', async ({ page, context }) => {
    await classic(page);
    const opened = context.waitForEvent('page');
    await chip(page).click();
    expect(new URL((await opened).url()).pathname).toBe('/docs/classic-mode/');
  });
});

test('the same word is said twice, and an arrow onto the same element says nothing', async ({
  page,
}) => {
  await classic(page);
  await toAction(page);
  await page.evaluate(() => {
    const region = document.querySelector('.announcer') as HTMLElement;
    const heard: string[] = [];
    (window as unknown as { heard: string[] }).heard = heard;
    new MutationObserver(() => heard.push(region.textContent ?? '')).observe(region, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  const heard = () => page.evaluate(() => (window as unknown as { heard: string[] }).heard);
  await page.keyboard.press('Enter');
  await expect.poll(heard).toContain('Action');
  await page.keyboard.type('More.');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await heard()).filter((w) => w === 'Action').length).toBe(2);
  await page.keyboard.type('Last.');
  const before = (await heard()).length;
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  // Then a key that does speak: what's heard after the arrows is that key's word alone.
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await heard()).slice(before).filter(Boolean)).toEqual(['Action']);
});

test('a switch says one thing: the hint the first time, the notice after', async ({ page }) => {
  await start(page);
  await setText(page, SCRIPT);
  await showSource(page);
  await page.evaluate(() => {
    const changed: string[] = [];
    (window as unknown as { changed: string[] }).changed = changed;
    for (const [name, selector] of [
      ['announcer', '.announcer'],
      ['notice', '[data-classic-notice]'],
      ['hint', '[data-classic-hint-said]'],
    ]) {
      const region = document.querySelector(selector as string) as HTMLElement;
      new MutationObserver(() => {
        if (region.textContent?.trim()) changed.push(name as string);
      }).observe(region, { childList: true, characterData: true, subtree: true });
    }
  });
  const changed = () => page.evaluate(() => (window as unknown as { changed: string[] }).changed);
  const toggle = async (now: 'Fountain' | 'Classic', to: 'Fountain' | 'Classic') => {
    if (wide(page)) {
      await page
        .getByRole('group', { name: 'Writing mode' })
        .getByRole('button', { name: to })
        .click();
    } else {
      await page.getByRole('button', { name: new RegExp(`^Writing mode: ${now}\\.`) }).click();
    }
  };
  await toggle('Fountain', 'Classic');
  await expect(hint(page)).toBeVisible();
  await expect.poll(changed).toEqual(['hint']);
  await hint(page).getByRole('button', { name: 'Got it' }).click();
  await page.evaluate(() => {
    (window as unknown as { changed: string[] }).changed.length = 0;
  });
  await toggle('Classic', 'Fountain');
  await expect.poll(changed).toEqual(['notice']);
  await toggle('Fountain', 'Classic');
  await expect.poll(changed).toEqual(['notice', 'notice']);
  await expect(page.locator('[data-classic-notice]')).toContainText('Classic Mode. Enter and Tab');
});

test('the text box says how to leave, always on the page', async ({ page }) => {
  await start(page);
  await showSource(page);
  const words = page.locator('#classic-leave');
  await expect(words).toBeAttached();
  await expect(words).toHaveText(
    'To leave the text, press Escape, then Tab. If a list is open, press Escape twice.',
  );
});

test('the hint shows once, and takes no focus', async ({ page }) => {
  await classic(page, false);
  await expect(hint(page)).toContainText(HINT);
  await expect(editor(page)).toBeFocused();
  await expect(page.locator('[data-classic-hint-said]')).toHaveText(HINT);
  await page.keyboard.type('x');
  await expect(hint(page)).toBeVisible();
  await hint(page).getByRole('button', { name: 'Got it' }).click();
  await expect(hint(page)).toHaveCount(0);
  await expect(page.locator('[data-classic-hint-said]')).toHaveText('');
  await expect.poll(() => stored(page, 'classicHintSeen')).toBe(true);
  await page.reload();
  await expect(editor(page)).toHaveAttribute('aria-label', 'Source, Classic Mode');
  await expect(hint(page)).toHaveCount(0);
});

test('Learn more opens the help and the hint goes', async ({ page, context }) => {
  await classic(page, false);
  const opened = context.waitForEvent('page');
  await hint(page).getByRole('button', { name: 'Learn more' }).click();
  expect(new URL((await opened).url()).pathname).toBe('/docs/classic-mode/');
  await expect(hint(page)).toHaveCount(0);
});
