import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { removePickers } from './fs-stub';
import { chooseExport, editor, palette, runCommand, settled, showSource, start } from './modules';

// Export a novel as a manuscript (manuscript plan, Task 6): the Manuscript details dialog, opened
// from the Export menu, the Drafter menu, and the palette for a novel only; the PDF and the Word
// file it exports; the details it keeps in the book's comment (one undo step), and a read-only
// tab that exports without keeping them.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const NOT_KEPT = 'These details weren’t saved: this tab only shows the book.';

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Manuscript details' });
const field = (page: Page, name: string) =>
  dialog(page).getByRole('textbox', { name, exact: true });
const toast = (page: Page) => page.locator('.toast [role="status"]');

/** The whole book, from the editor's state (the page draws only the lines in view). */
const bookText = (page: Page) =>
  page.evaluate(() => {
    type Linked = { view?: { state: { doc: { toString(): string } } } };
    const content = document.querySelector('.cm-content') as
      | (Element & { cmTile?: Linked; cmView?: Linked })
      | null;
    return (content?.cmTile ?? content?.cmView)?.view?.state.doc.toString() ?? '';
  });

/** The sources of the projects stored in Drafter's database. */
function storedSources(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('projects').objectStore('projects').getAll();
          request.onsuccess = () => {
            db.close();
            resolve((request.result as Array<{ source: string }>).map((p) => p.source));
          };
          request.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      }),
  );
}

/** The dialog's fades done, so axe sees the dialog as it stays. */
const still = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
        .filter((a) => !(a instanceof CSSAnimation && a.animationName.startsWith('cm-blink')))
        .map((a) => a.finished.catch(() => {})),
    ),
  );

/** Opens one of the File menu's samples. */
async function openSample(page: Page, name: 'Novel', text: string) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page
    .getByRole('group', { name: 'Scripts', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
  await expect(editor(page)).toContainText(text);
  await expect(page.getByRole('group', { name: 'Scripts', exact: true })).toBeHidden();
  await settled(page);
}

async function startNovel(page: Page) {
  await start(page);
  await openSample(page, 'Novel', 'Low Tide');
}

/** The items the Export menu lists (or More actions' Export submenu, where a phone folds it). */
async function exportItems(page: Page): Promise<string[]> {
  const bar = page.locator('header.toolbar');
  const button = bar.getByRole('button', { name: 'Export', exact: true });
  const more = bar.getByRole('button', { name: 'More actions', exact: true });
  await expect(button.or(more).first()).toBeVisible();
  await settled(page);
  if (await button.isVisible()) {
    await button.click();
    const group = page.getByRole('group', { name: 'Export' });
    await expect(group).toBeVisible();
    const names = (await group.getByRole('button').allInnerTexts()).map((t) => t.trim());
    await page.keyboard.press('Escape');
    await expect(group).toBeHidden();
    return names;
  }
  await more.click();
  const item = page
    .getByRole('menu', { name: 'More actions' })
    .getByRole('menuitem', { name: 'Export', exact: true });
  await item.focus();
  await page.keyboard.press('ArrowRight');
  const submenu = page.getByRole('menu').last();
  await expect(submenu.getByRole('menuitem').first()).toBeVisible();
  const names = (await submenu.getByRole('menuitem').allInnerTexts()).map((t) => t.trim());
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  return names;
}

/** Whether the palette offers a command called `title`. */
async function paletteOffers(page: Page, title: string): Promise<boolean> {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeVisible();
  await palette(page).locator('input').fill(title);
  // The list follows the query a frame later.
  await expect(palette(page).getByRole('option').first()).toBeVisible();
  const offered = await palette(page).getByRole('option', { name: title, exact: true }).count();
  await page.keyboard.press('Escape');
  await expect(palette(page)).toBeHidden();
  return offered > 0;
}

/** Runs `go`, which starts the download, and answers the file's name and bytes. */
async function downloaded(page: Page, go: () => Promise<void>) {
  const download = page.waitForEvent('download');
  await go();
  const file = await download;
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}

test.beforeEach(async ({ page }) => {
  await removePickers(page);
});

test.describe('manuscript export', () => {
  test('is offered for a novel only, in the Export menu and the palette', async ({ page }) => {
    await start(page);
    // The screenplay sample.
    let items = await exportItems(page);
    expect(items.some((t) => t.startsWith('Manuscript') || t.includes('Manuscript ('))).toBe(false);
    expect(await paletteOffers(page, 'Export as Manuscript (PDF)…')).toBe(false);
    expect(await paletteOffers(page, 'Export as Manuscript (Word)…')).toBe(false);

    // A plain Markdown document.
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'New Markdown document' })
      .click();
    await expect(editor(page)).toContainText('# Untitled');
    items = await exportItems(page);
    expect(items.some((t) => t.includes('Manuscript'))).toBe(false);
    expect(await paletteOffers(page, 'Export as Manuscript (PDF)…')).toBe(false);
    expect(await paletteOffers(page, 'Export as Manuscript (Word)…')).toBe(false);

    // The Novel sample.
    await openSample(page, 'Novel', 'Low Tide');
    items = await exportItems(page);
    const pdf = items.findIndex((t) => /Manuscript \(PDF\)…$/.test(t));
    const word = items.findIndex((t) => /Manuscript \(Word\)…$/.test(t));
    expect(pdf).toBeGreaterThan(-1);
    expect(word).toBe(pdf + 1);
    expect(await paletteOffers(page, 'Export as Manuscript (PDF)…')).toBe(true);
    expect(await paletteOffers(page, 'Export as Manuscript (Word)…')).toBe(true);
  });

  test('the dialog opens prefilled, a byline fills the legal name and surname, and the PDF keeps the details', async ({
    page,
  }) => {
    await startNovel(page);
    const before = await bookText(page);
    await chooseExport(page, 'Manuscript (PDF)…');
    await expect(dialog(page)).toBeVisible();
    await expect(field(page, 'Title')).toBeFocused();
    await expect(dialog(page)).toHaveAttribute('aria-describedby', 'manuscript-what');
    await expect(field(page, 'Title')).toHaveValue('The Salt Road');
    await expect(field(page, 'Short title')).toHaveValue('THE SALT ROAD');
    await expect(dialog(page).getByRole('radio', { name: 'Times-style serif' })).toBeChecked();
    await expect(dialog(page)).toContainText(/Word count: about [\d,]+ words/);
    await expect(dialog(page)).toContainText(
      'Saved in this book’s file, so anyone you send the Markdown file to can read it.',
    );
    await expect(dialog(page)).toContainText(
      'So can anyone you send an HTML or EPUB export made with “Let Drafter reopen this file”',
    );

    // The byline fills the legal name and the surname, until the writer edits them.
    await field(page, 'Byline').fill('Rosa Vale');
    await expect(field(page, 'Legal name')).toHaveValue('Rosa Vale');
    await expect(field(page, 'Surname for the header')).toHaveValue('Vale');
    await field(page, 'Legal name').fill('Rosalind Vale');
    await field(page, 'Byline').fill('R. Vale-Hart');
    await expect(field(page, 'Legal name')).toHaveValue('Rosalind Vale');
    await expect(field(page, 'Surname for the header')).toHaveValue('Vale-Hart');
    await field(page, 'Surname for the header').fill('Hart');
    await field(page, 'Byline').fill('R. Vale');
    await expect(field(page, 'Surname for the header')).toHaveValue('Hart');
    await field(page, 'Contact').fill('1 Quay Lane\nrosa@vale.example');

    const pdf = await downloaded(page, async () => {
      await dialog(page).getByRole('button', { name: 'Export PDF' }).click();
    });
    await expect(dialog(page)).toBeHidden();
    expect(pdf.name).toBe('The Salt Road – manuscript.pdf');
    expect(pdf.bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
    await expect(toast(page)).toHaveText('Exported The Salt Road – manuscript.pdf.');

    // The details are in the comment, and only what isn't the book's own default.
    await expect
      .poll(() => bookText(page))
      .toContain(
        '"manuscript":{"byline":"R. Vale","legalName":"Rosalind Vale","surname":"Hart","contact":["1 Quay Lane","rosa@vale.example"]}',
      );
    expect((await bookText(page)).startsWith(before.slice(0, before.indexOf('<!--')))).toBe(true);

    // One undo takes them away, and redo puts them back.
    await showSource(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => bookText(page)).not.toContain('"manuscript"');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(() => bookText(page)).toContain('"legalName":"Rosalind Vale"');

    // They survive a reload: the dialog reopens with them.
    await expect
      .poll(async () => (await storedSources(page)).some((s) => s.includes('Rosalind Vale')))
      .toBe(true);
    await page.reload();
    await expect(editor(page)).toContainText('Low Tide');
    await runCommand(page, 'Export as Manuscript (PDF)…');
    await expect(dialog(page)).toBeVisible();
    await expect(field(page, 'Byline')).toHaveValue('R. Vale');
    await expect(field(page, 'Legal name')).toHaveValue('Rosalind Vale');
    await expect(field(page, 'Contact')).toHaveValue('1 Quay Lane\nrosa@vale.example');
    await expect(field(page, 'Surname for the header')).toHaveValue('Hart');
    // An edited field the byline no longer fills.
    await field(page, 'Byline').fill('Someone Else');
    await expect(field(page, 'Legal name')).toHaveValue('Rosalind Vale');
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog(page)).toBeHidden();
    // Cancel keeps nothing.
    expect(await bookText(page)).toContain('"byline":"R. Vale"');
  });

  test('the Word file downloads as … – manuscript.docx', async ({ page }) => {
    await startNovel(page);
    await chooseExport(page, 'Manuscript (Word)…');
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Export PDF' })).toHaveCount(0);
    await dialog(page).getByRole('radio', { name: 'Courier' }).check();
    const docx = await downloaded(page, async () => {
      await dialog(page).getByRole('button', { name: 'Export Word file' }).click();
    });
    expect(docx.name).toBe('The Salt Road – manuscript.docx');
    expect(docx.bytes.subarray(0, 2).toString('latin1')).toBe('PK');
    await expect(toast(page)).toHaveText('Exported The Salt Road – manuscript.docx.');
    await expect.poll(() => bookText(page)).toContain('"manuscript":{"font":"courier"}');
  });

  test('the Drafter menu and the palette open the same dialog', async ({ page }) => {
    await startNovel(page);
    for (const [title, button] of [
      ['Export as Manuscript (PDF)…', 'Export PDF'],
      ['Export as Manuscript (Word)…', 'Export Word file'],
    ] as const) {
      await page.getByRole('button', { name: 'Drafter menu' }).click();
      await page
        .getByRole('menu', { name: 'Drafter menu' })
        .getByRole('menuitem', { name: title })
        .click();
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(page).getByRole('button', { name: button })).toBeVisible();
      await dialog(page).getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog(page)).toBeHidden();

      await runCommand(page, title);
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(page).getByRole('button', { name: button })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toBeHidden();
    }
  });

  test('a read-only tab exports with the details typed, and says they weren’t saved', async ({
    context,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'two browser tabs are the same on a phone');
    const first = await context.newPage();
    await removePickers(first);
    await startNovel(first);
    const second = await context.newPage();
    await removePickers(second);
    await second.goto('/');
    await expect(
      second.getByText('You can’t type here because this script is open in another Drafter tab.'),
    ).toBeVisible();
    await expect(editor(second)).toContainText('Low Tide');
    const before = await bookText(second);
    await runCommand(second, 'Export as Manuscript (PDF)…');
    await expect(dialog(second)).toBeVisible();
    // The why is announced with the dialog, after what it is for.
    await expect(dialog(second)).toHaveAttribute(
      'aria-describedby',
      'manuscript-what manuscript-why',
    );
    await expect(dialog(second)).toHaveAccessibleDescription(
      /^The title page and the header on every page.*These details won’t be kept, but you can still export\.$/,
    );
    await field(second, 'Byline').fill('Rosa Vale');
    const pdf = await downloaded(second, async () => {
      await dialog(second).getByRole('button', { name: 'Export PDF' }).click();
    });
    expect(pdf.name).toBe('The Salt Road – manuscript.pdf');
    expect(pdf.bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
    await expect(toast(second)).toContainText(NOT_KEPT);
    expect(await bookText(second)).toBe(before);
    expect(await bookText(first)).not.toContain('"manuscript"');
  });

  test('the dialog is reached and left by keyboard: focus on Title, Tab stays in, Escape gives focus back', async ({
    page,
    isMobile,
    browserName,
  }) => {
    test.skip(!!isMobile, 'a phone has no keyboard to start from');
    await startNovel(page);
    const bar = page.locator('header.toolbar');
    const exportButton = bar.getByRole('button', { name: 'Export', exact: true });
    await exportButton.click();
    await page
      .getByRole('group', { name: 'Export' })
      .getByRole('button', { name: /Manuscript \(PDF\)/ })
      .click();
    await expect(dialog(page)).toBeVisible();
    await expect(field(page, 'Title')).toBeFocused();
    const inside = () => dialog(page).evaluate((d) => d.contains(document.activeElement));
    // WebKit's Tab skips buttons and radios unless the system asks otherwise.
    if (browserName !== 'webkit') {
      // Title, Byline, Legal name, Contact, Surname, Short title, the font's radios (one stop),
      // Cancel, and Export PDF.
      for (let i = 1; i < 9; i++) {
        await page.keyboard.press('Tab');
        expect(await inside()).toBe(true);
      }
      await expect(dialog(page).getByRole('button', { name: 'Export PDF' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
    }
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(exportButton).toBeFocused();
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`the dialog passes axe (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
      await startNovel(page);
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
      await runCommand(page, 'Export as Manuscript (Word)…');
      await expect(dialog(page)).toBeVisible();
      await still(page);
      const { violations } = await new AxeBuilder({ page })
        .withTags(WCAG)
        .include('.manuscript-dialog')
        .analyze();
      expect(
        violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`),
      ).toEqual([]);
    });
  }
});
