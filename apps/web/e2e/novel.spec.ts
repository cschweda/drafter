import { expect, type Page, test } from '@playwright/test';

// Novel is a choice beside Screenplay and Stage play (the Novel plan, Task 4): a Markdown document
// whose trailing comment names `"template":"novel"`. The chip is hidden on a phone, so these read
// the status bar, which names the document type on every screen, and use the palette for choices.

const editor = (page: Page) => page.locator('.cm-content');
const status = (page: Page) => page.locator('[data-tour="status"]');
const openButton = (page: Page) => page.getByRole('button', { name: 'File', exact: true });
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const paletteDialog = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const paletteOption = (page: Page, name: string) =>
  paletteDialog(page).getByRole('option', { name });

async function start(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toContainText('The Call');
}

/** Runs a palette command by name. */
async function command(page: Page, name: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await paletteDialog(page).locator('input').fill(name);
  await paletteOption(page, name).click();
  await expect(paletteDialog(page)).toBeHidden();
}

interface Row {
  title: string;
  kind?: string;
  source: string;
  sample?: string;
}

function stored(page: Page): Promise<Row[]> {
  return page.evaluate(
    () =>
      new Promise<Row[]>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('projects')) {
            db.close();
            resolve([]);
            return;
          }
          const request = db.transaction('projects').objectStore('projects').getAll();
          request.onsuccess = () => {
            db.close();
            resolve(request.result as Row[]);
          };
          request.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      }),
  );
}

const NEW_NOVEL = '# Chapter One\n\n\n\n<!-- drafter {"template":"novel"} -->\n';

test.describe('a novel', () => {
  test('New novel in the Scripts menu opens a novel, named Novel on the status bar', async ({
    page,
  }) => {
    await start(page);
    await openButton(page).click();
    await scriptsMenu(page).getByRole('button', { name: 'New novel' }).click();
    await expect(editor(page)).toContainText('# Chapter One');
    await expect(status(page)).toContainText('Novel');
    await expect(status(page)).not.toContainText('Markdown (plain text)');
    await expect
      .poll(async () => (await stored(page)).find((p) => p.kind === 'markdown'))
      .toMatchObject({ source: NEW_NOVEL, title: 'Chapter One' });
  });

  test('New novel in the palette does the same', async ({ page }) => {
    await start(page);
    await command(page, 'New novel');
    await expect(editor(page)).toContainText('# Chapter One');
    await expect(status(page)).toContainText('Novel');
    await expect
      .poll(async () => (await stored(page)).some((p) => p.source === NEW_NOVEL))
      .toBe(true);
  });

  test('typing under the heading starts on the empty line', async ({ page }) => {
    await start(page);
    await command(page, 'New novel');
    await expect(status(page)).toContainText('Novel');
    await page.keyboard.insertText('It began.');
    await expect
      .poll(async () =>
        (await stored(page)).some((p) => p.source.startsWith('# Chapter One\n\nIt began.\n')),
      )
      .toBe(true);
  });

  test('Help → Sample scripts has a novel, the writer’s own', async ({ page }) => {
    await start(page);
    await command(page, 'Sample script: Novel');
    await expect(editor(page)).toContainText('The Station');
    await expect(status(page)).toContainText('Novel');
    const made = (await stored(page)).find((p) => p.title === 'Chapter One');
    expect(made?.kind).toBe('markdown');
    expect(made?.sample).toBeUndefined();
  });

  test('the Novel sample is in the Scripts menu’s Samples', async ({ page }) => {
    await start(page);
    await openButton(page).click();
    await scriptsMenu(page).getByRole('button', { name: 'Novel', exact: true }).click();
    await expect(editor(page)).toContainText('Low Tide');
    await expect(status(page)).toContainText('Novel');
    await expect
      .poll(async () => (await stored(page)).find((p) => p.sample === 'novel')?.kind)
      .toBe('markdown');
  });

  test('Novel on a Markdown document writes the comment, and Markdown takes it away', async ({
    page,
  }) => {
    await start(page);
    await openButton(page).click();
    await scriptsMenu(page).getByRole('button', { name: 'New Markdown document' }).click();
    await expect(editor(page)).toContainText('# Untitled');
    await expect(status(page)).toContainText('Markdown (plain text)');

    await command(page, 'Document: Novel');
    await expect(status(page)).toContainText('Novel');
    await expect
      .poll(async () => (await stored(page)).find((p) => p.title === 'Untitled')?.source)
      .toContain('<!-- drafter {"template":"novel"} -->');

    // Back: only the template goes, and with nothing else in the comment the comment goes too.
    await command(page, 'Document: Markdown (plain text)');
    await expect(status(page)).toContainText('Markdown (plain text)');
    await expect
      .poll(async () => (await stored(page)).find((p) => p.title === 'Untitled')?.source)
      .toBe('# Untitled\n\n');

    // And one undo brings the novel back.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(status(page)).toContainText('Novel');
  });

  test('the palette offers Novel only where it is not already the document', async ({ page }) => {
    await start(page);
    await page.keyboard.press('ControlOrMeta+k');
    await paletteDialog(page).locator('input').fill('Document');
    await expect(paletteOption(page, 'Document: Novel')).toBeVisible();
    await page.keyboard.press('Escape');
    await command(page, 'New novel');
    await expect(status(page)).toContainText('Novel');
    await page.keyboard.press('ControlOrMeta+k');
    await paletteDialog(page).locator('input').fill('Document');
    await expect(paletteOption(page, 'Document: Novel')).toHaveCount(0);
    await expect(paletteOption(page, 'Document: Markdown (plain text)')).toBeVisible();
    await page.keyboard.press('Escape');
  });
});
