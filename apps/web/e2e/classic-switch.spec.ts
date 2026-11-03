import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import {
  closeSettings,
  editor,
  openSettings,
  palette,
  paletteInput,
  runCommand,
  setText,
  settingsDialog,
  showSource,
  start,
  textOf,
} from './modules';

// The Fountain | Classic switch (Classic Mode design §3): always in sight while a script is written,
// Fountain to start, and nothing in the file changes by using it.

const SCRIPT = 'INT. DINER - DAY\n\nThe lights hum.\n';
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
const group = (page: Page) => page.getByRole('group', { name: 'Writing mode' });
const one = (page: Page, now: string) =>
  page.getByRole('button', { name: new RegExp(`^Writing mode: ${now}\\.`) });
const classicOn = (page: Page) =>
  expect(editor(page)).toHaveAttribute('aria-label', 'Source, Classic Mode');
const fountainOn = (page: Page) => expect(editor(page)).toHaveAttribute('aria-label', 'Source');
const switchMod = 'ControlOrMeta+Alt+Digit0';

async function chooseClassic(page: Page) {
  if (wide(page)) await group(page).getByRole('button', { name: 'Classic' }).click();
  else await one(page, 'Fountain').click();
  await classicOn(page);
}

test('Fountain to start, one click to Classic and back, and the text never changes', async ({
  page,
}) => {
  await start(page);
  await setText(page, SCRIPT);
  await fountainOn(page);
  if (wide(page)) {
    await expect(group(page).getByRole('button', { name: 'Fountain' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  } else {
    await expect(one(page, 'Fountain')).toBeVisible();
  }

  await chooseClassic(page);
  await expect(editor(page)).toBeFocused();
  await expect(page.locator('[data-classic-notice]')).toHaveText(
    'Classic Mode. Enter and Tab move between elements.',
  );
  expect(await textOf(page)).toBe(SCRIPT);

  if (wide(page)) await group(page).getByRole('button', { name: 'Fountain' }).click();
  else await one(page, 'Classic').click();
  await fountainOn(page);
  await expect(editor(page)).toBeFocused();
  await expect(page.locator('[data-classic-notice]')).toHaveText(
    'Fountain Mode. You type the marks.',
  );
  expect(await textOf(page)).toBe(SCRIPT);
});

test('Enter and Tab work the moment Classic is on', async ({ page }) => {
  await start(page);
  await setText(page, SCRIPT);
  await chooseClassic(page);
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  await page.keyboard.type('june');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Still open?');
  expect(await textOf(page)).toContain('JUNE\nStill open?');
});

test('the mode lasts over a reload', async ({ page }) => {
  await start(page);
  await chooseClassic(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise((done) => {
            const open = indexedDB.open('drafter');
            open.onsuccess = () => {
              const get = open.result
                .transaction('settings')
                .objectStore('settings')
                .get('writingMode');
              get.onsuccess = () => done(get.result?.value);
            };
          }),
      ),
    )
    .toBe('classic');
  await page.reload();
  await classicOn(page);
});

test('a list open at a switch closes, in both directions, and nothing of it is written', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('phone'), 'A phone has no such key.');
  const list = page.locator('.cm-tooltip-autocomplete');
  const script = 'INT. DINER - DAY\n\nJUNE\nStill open?\n\n';
  await start(page);

  // Fountain to Classic: a name's list from Fountain's own completion.
  await setText(page, script);
  await page.keyboard.press('ControlOrMeta+ArrowDown');
  await page.keyboard.type('JU');
  await expect(list).toBeVisible();
  await page.keyboard.press(switchMod);
  await classicOn(page);
  await expect(list).toBeHidden();
  expect(await textOf(page)).toBe(`${script}JU`);

  // Classic to Fountain: the same line, Classic's own list.
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(script.trimEnd());
  await page.keyboard.press('Enter');
  await page.keyboard.type('JU');
  await expect(list).toBeVisible();
  const typed = await textOf(page);
  await page.keyboard.press(switchMod);
  await fountainOn(page);
  await expect(list).toBeHidden();
  expect(await textOf(page)).toBe(typed);
});

test('Mod+Alt+0 switches either way, from the text', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('phone'), 'A phone has no such key.');
  await start(page);
  await setText(page, SCRIPT);
  await page.keyboard.press(switchMod);
  await classicOn(page);
  await page.keyboard.press(switchMod);
  await fountainOn(page);
  expect(await textOf(page)).toBe(SCRIPT);
});

test('the palette offers the switch that would do something, and keeps focus in the text', async ({
  page,
}) => {
  await start(page);
  await setText(page, SCRIPT);
  await page.keyboard.press('ControlOrMeta+k');
  await expect(paletteInput(page)).toBeFocused();
  await paletteInput(page).fill('final draft');
  await expect(palette(page).getByRole('option', { name: 'Switch to Classic Mode' })).toBeVisible();
  await expect(palette(page).getByRole('option', { name: 'Switch to Fountain Mode' })).toHaveCount(
    0,
  );
  await page.keyboard.press('Escape');
  await showSource(page);
  await runCommand(page, 'Switch to Classic Mode');
  await classicOn(page);
  await expect(editor(page)).toBeFocused();
  await runCommand(page, 'Switch to Fountain Mode');
  await fountainOn(page);
});

test('Settings sets the same mode, and the switch shows it', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('phone'), 'The word is shown; the wide test is enough.');
  await start(page);
  await openSettings(page);
  await settingsDialog(page).getByLabel('Writing mode').selectOption('classic');
  await closeSettings(page);
  await classicOn(page);
  await expect(group(page).getByRole('button', { name: 'Classic' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('focus mode shows the mode, and Esc leaves a chooser before it leaves focus mode', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('phone'), 'A physical Esc.');
  await start(page);
  await setText(page, SCRIPT);
  await chooseClassic(page);
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  const marker = page.getByRole('group', { name: 'Focus mode' });
  await expect(one(page, 'Classic')).toBeVisible();
  await expect(marker.getByRole('button', { name: /^Writing mode/ })).toBeVisible();

  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox', { name: 'Choose an element' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox', { name: 'Choose an element' })).toBeHidden();
  await expect(marker).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(marker).toBeHidden();

  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await one(page, 'Classic').click();
  await fountainOn(page);
  await expect(one(page, 'Fountain')).toBeVisible();
  await expect(editor(page)).toBeFocused();
});

test('a Markdown document shows no switch and gets no Classic keys, and the next script does', async ({
  page,
}, info) => {
  await start(page);
  await chooseClassic(page);
  await runCommand(page, 'New Markdown document');
  await fountainOn(page);
  await expect(page.getByRole('button', { name: /^Writing mode/ })).toHaveCount(0);
  await expect(group(page)).toHaveCount(0);
  await expect(page.locator('.cm-classic')).toHaveCount(0);
  // Enter is one line break, where Classic's would be a blank line; Tab makes no Character.
  if (!info.project.name.startsWith('phone')) {
    await setText(page, 'one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    expect(await textOf(page)).toBe('one\ntwo');
    await page.keyboard.press('Tab');
    await editor(page).focus();
    await page.keyboard.type(' june');
    expect(await textOf(page)).toContain('june');
    expect(await textOf(page)).not.toContain('JUNE');
  }
  await page.keyboard.press('ControlOrMeta+Alt+KeyN');
  await classicOn(page);
});

test('a bar button on a blank play that hasn’t had focus sets the element, in the right words', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('phone'), 'The bar is another task’s on a phone.');
  await start(page);
  await chooseClassic(page);
  await runCommand(page, 'New stage play');
  await classicOn(page);
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page
    .getByRole('toolbar', { name: 'Element bar' })
    .getByRole('button', { name: 'Character', exact: true })
    .click();
  await expect(editor(page)).toBeFocused();
  await expect(page.getByRole('status').filter({ hasText: 'inside a note' })).toHaveCount(0);
  await page.keyboard.type('june');
  expect(await textOf(page)).toContain('JUNE');
});

test('the switch is said on a phone’s Script tab, with the Source not on the page', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('phone'), 'One pane at a time.');
  await start(page);
  await page.getByRole('tab', { name: 'Script', exact: true }).click();
  await expect(page.locator('.cm-content')).toBeHidden();
  await one(page, 'Fountain').click();
  await expect(page.locator('[data-classic-notice]')).toHaveText(
    'Classic Mode. Enter and Tab move between elements.',
  );
});

test('under 1280px the search keeps its width, and gives way only when the title needs it', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('phone'), 'A wide bar.');
  await page.setViewportSize({ width: 1279, height: 720 });
  await start(page);
  const search = page.locator('header.toolbar .search');
  await expect.poll(async () => Math.round((await search.boundingBox())?.width ?? 0)).toBe(220);
  await page.setViewportSize({ width: 1024, height: 720 });
  await expect.poll(async () => (await search.boundingBox())?.width).toBeGreaterThanOrEqual(110);
  const width = await page.locator('header.toolbar .title').evaluate((el) => el.clientWidth);
  expect(width).toBeGreaterThan(0);
  const bar = await page
    .locator('header.toolbar')
    .evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(bar).toBe(0);
});

test('at 320px the bar doesn’t scroll sideways with the switch in it', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await start(page);
  await expect(one(page, 'Fountain')).toBeVisible();
  const box = await one(page, 'Fountain').boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(24);
  await one(page, 'Fountain').click();
  await expect(one(page, 'Classic')).toBeVisible();
  const scrolls = await page.evaluate(() => {
    const bar = document.querySelector('header.toolbar') as HTMLElement;
    return [
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bar.scrollWidth - bar.clientWidth,
    ];
  });
  expect(scrolls).toEqual([0, 0]);
});

for (const scheme of ['dark', 'light'] as const) {
  test(`the switch has no accessibility violations in ${scheme}`, async ({ page }) => {
    await start(page);
    if (scheme === 'light') {
      await page.evaluate(() => localStorage.setItem('nuxt-color-mode', 'light'));
      await page.reload();
      await expect(page.locator('html.light')).toHaveCount(1);
    }
    await chooseClassic(page);
    // Task 11 puts the words `aria-describedby` names on the page.
    const { violations } = await new AxeBuilder({ page })
      .withTags(WCAG)
      .disableRules(['aria-valid-attr-value'])
      .analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual(
      [],
    );
  });
}
