import { expect, type Page, test } from '@playwright/test';

// The first New of a kind opens with that kind's annotated sample, as the writer's own document,
// with Start blank above it; every later New of the kind is blank (decided 2026-10-27). The other
// test files start with the samples met (playwright.config.ts); these start without, as a new
// browser does, with only the tour's "seen" key set.

const port = Number(process.env.E2E_PORT ?? 4173);
test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: `http://localhost:${port}`,
        localStorage: [{ name: 'drafter-tour-v1', value: 'true' }],
      },
    ],
  },
});

const editor = (page: Page) => page.locator('.cm-content');
const bar = (page: Page) => page.getByRole('region', { name: 'Starting text' });
const startBlank = (page: Page) => bar(page).getByRole('button', { name: 'Start blank' });
const sampleBar = (page: Page) => page.getByRole('region', { name: 'Sample', exact: true });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const preview = (page: Page) => page.getByRole('article', { name: 'Preview' });
const mark = (page: Page) => page.getByRole('button', { name: 'Drafter menu' });
const menu = (page: Page) => page.getByRole('menu', { name: 'Drafter menu' });

/** The text in the editor, even while a phone shows another tab (only the lines drawn). */
const text = (page: Page) => editor(page).evaluate((el) => el.textContent ?? '');

async function start(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toContainText('The Call');
}

/** Runs a palette command by name, by keyboard. */
async function command(page: Page, name: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeVisible();
  await palette(page).locator('input').fill(name);
  // An option's name ends with its keys, where it has some.
  const option = palette(page).getByRole('option', { name: new RegExp(`^${name}`) });
  await expect(option).toBeVisible();
  await option.click();
  await expect(palette(page)).toBeHidden();
}

async function showTab(page: Page, name: 'Source' | 'Preview' | 'Script') {
  const shown = page.locator('[role="tab"][aria-selected="true"]', { hasText: name });
  if ((await shown.count()) === 0) await page.getByRole('tab', { name }).first().click();
}

function seenRows(page: Page): Promise<Array<{ key: string; value: unknown }>> {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('drafter');
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('settings').objectStore('settings').getAll();
          request.onsuccess = () => {
            db.close();
            resolve(
              (request.result as Array<{ key: string; value: unknown }>).filter((row) =>
                row.key.startsWith('sample-seen:'),
              ),
            );
          };
        };
      }),
  );
}

test.describe('the first New of a kind', () => {
  test('a first stage play opens with the sample; Start blank empties it and one Undo brings it back', async ({
    page,
  }) => {
    await start(page);
    await command(page, 'New stage play');
    await showTab(page, 'Source');
    await expect(editor(page)).toContainText('This is a short sample stage play');
    // The writer's own document: not the shared sample, so the sample bar isn't up.
    await expect(sampleBar(page)).toHaveCount(0);
    await expect(bar(page)).toBeVisible();

    // Some typing of the writer's own, which Start blank replaces and Undo brings back.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.insertText('MINE ');

    // By keyboard: the button is a tab stop, and Enter presses it.
    await startBlank(page).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => text(page)).toContain('Title: Untitled Play');
    expect(await text(page)).not.toContain('This is a short sample stage play');
    await expect(bar(page)).toHaveCount(0);
    // The editor has the focus, ready to type.
    await expect(editor(page)).toBeFocused();

    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => text(page)).toContain('This is a short sample stage play');
    expect(await text(page)).toContain('MINE Title: The Call');

    // The second New stage play is the usual blank one.
    await command(page, 'New stage play');
    await expect.poll(() => text(page)).toContain('Title: Untitled Play');
    expect(await text(page)).not.toContain('sample');
    await expect(bar(page)).toHaveCount(0);
  });

  test('a first Markdown document opens with the Markdown sample, and its Preview draws it', async ({
    page,
  }) => {
    await start(page);
    await command(page, 'New Markdown document');
    await showTab(page, 'Source');
    await expect(editor(page)).toContainText('# Writing in Markdown');
    await expect(bar(page)).toBeVisible();

    await showTab(page, 'Preview');
    await expect(preview(page).getByRole('heading', { name: 'Writing in Markdown' })).toBeVisible();
    await expect(preview(page).locator('blockquote').first()).toBeAttached();
    await expect(preview(page).locator('li').first()).toBeAttached();
    await expect(preview(page).locator('pre code')).toContainText('You said you');
    // A link is its text, and nothing to follow.
    await expect(preview(page)).toContainText('the Fountain syntax guide');
    await expect(preview(page).locator('a')).toHaveCount(0);

    await command(page, 'Start blank');
    await expect.poll(() => text(page)).toContain('# Untitled');
    await expect(bar(page)).toHaveCount(0);

    await command(page, 'New Markdown document');
    await expect.poll(() => text(page)).toContain('# Untitled');
    expect(await text(page)).not.toContain('Writing in Markdown');
    await expect(bar(page)).toHaveCount(0);
  });

  test('a first New screenplay is blank: the first visit showed the screenplay sample', async ({
    page,
  }) => {
    await start(page);
    await command(page, 'New screenplay');
    await expect.poll(() => text(page)).toContain('Title: Untitled Screenplay');
    await expect(bar(page)).toHaveCount(0);
  });

  test('remembers each kind after a reload', async ({ page }) => {
    await start(page);
    await command(page, 'New stage play');
    await expect.poll(() => text(page)).toContain('This is a short sample stage play');
    await expect
      .poll(async () => (await seenRows(page)).map((r) => r.key))
      .toEqual(['sample-seen:stage-play']);

    await page.reload();
    // A returning visit opens the document it was on, still offering Start blank.
    await expect.poll(() => text(page)).toContain('This is a short sample stage play');
    await expect(bar(page)).toBeVisible();
    await command(page, 'New stage play');
    await expect.poll(() => text(page)).toContain('Title: Untitled Play');
    await expect(bar(page)).toHaveCount(0);
  });

  test('opens the Markdown sample from the palette and the app menu', async ({ page }) => {
    await start(page);
    await command(page, 'Open sample: Markdown');
    await expect(sampleBar(page)).toBeVisible();
    await expect.poll(() => text(page)).toContain('# Writing in Markdown');

    await command(page, 'Open sample: Screenplay');
    await expect.poll(() => text(page)).toContain('Title: The Call');
    await mark(page).click();
    await menu(page).getByRole('menuitem', { name: 'Open sample: Markdown' }).click();
    await expect.poll(() => text(page)).toContain('# Writing in Markdown');
  });
});
