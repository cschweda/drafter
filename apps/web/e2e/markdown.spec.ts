import { expect, type Page, test } from '@playwright/test';
import { files, nextFileName, picks, putFile, removePickers, stubPickers, textOf } from './fs-stub';

// Markdown is a document kind beside Fountain (Plan 4 Task 6). The accessibility test the plan
// names is in a11y.spec.ts.

const editor = (page: Page) => page.locator('.cm-content');
const preview = (page: Page) => page.getByRole('article', { name: 'Preview' });
const status = (page: Page) => page.locator('[data-tour="status"]');
const chip = (page: Page) => page.locator('.chip.template');
const chipMenu = (page: Page) => page.getByRole('menu');
const chipItem = (page: Page, name: string) =>
  chipMenu(page).getByRole('menuitemcheckbox', { name });
const openButton = (page: Page) => page.getByRole('button', { name: 'Open', exact: true });
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const paletteDialog = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const paletteOption = (page: Page, name: string) =>
  paletteDialog(page).getByRole('option', { name });
const question = (page: Page) =>
  page.getByRole('dialog', { name: 'Make this a Markdown document?' });

async function start(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toContainText('The Call');
}

/** Shows a tab: on a phone one pane shows at a time; on a wide screen both of these are already up. */
async function showTab(page: Page, name: 'Source' | 'Preview' | 'Script' | 'Problems') {
  const shown = page.locator('[role="tab"][aria-selected="true"]', { hasText: name });
  if ((await shown.count()) === 0) await page.getByRole('tab', { name }).first().click();
}

/** Each pane has all the tabs, so a wide screen has two of each; a phone has one. */
const tabs = (page: Page, name: string) => page.getByRole('tab', { name });

async function newMarkdown(page: Page) {
  await openButton(page).click();
  await scriptsMenu(page).getByRole('button', { name: 'New Markdown document' }).click();
  await expect(editor(page)).toContainText('# Untitled');
}

/** Runs a palette command by name. */
async function command(page: Page, name: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await paletteDialog(page).locator('input').fill(name);
  await paletteOption(page, name).click();
  await expect(paletteDialog(page)).toBeHidden();
}

async function typeAtEnd(page: Page, text: string) {
  await showTab(page, 'Source');
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(text);
}

interface Row {
  title: string;
  kind?: string;
  source: string;
  fileName?: string;
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

test.describe('a Markdown document', () => {
  test('starts a Markdown document from the New menu', async ({ page }) => {
    await start(page);
    await newMarkdown(page);

    // The text is a heading and a blank line, the project is Markdown, and it is called by its heading.
    await expect
      .poll(async () => (await stored(page)).find((p) => p.kind === 'markdown'))
      .toMatchObject({ source: '# Untitled\n\n', title: 'Untitled' });
    // The Script tab is the Preview, and it shows the heading as one.
    await expect(tabs(page, 'Preview').first()).toBeVisible();
    await expect(tabs(page, 'Script')).toHaveCount(0);
    await showTab(page, 'Preview');
    await expect(preview(page).getByRole('heading', { level: 1, name: 'Untitled' })).toBeVisible();
    // The bar counts words where a script counts pages and problems.
    await expect(status(page)).toContainText('1 word');
    await expect(status(page)).not.toContainText(/Page \d|problem/);
    await expect(status(page)).toContainText('Markdown (plain text)');
    await expect(page).toHaveTitle('Untitled — Drafter');
  });

  test('keeps being Markdown after a reload', async ({ page }) => {
    await start(page);
    await newMarkdown(page);
    await typeAtEnd(page, 'Some *words*.');
    await expect
      .poll(async () => (await stored(page)).some((p) => p.source.includes('words')))
      .toBe(true);
    await page.reload();
    await expect(editor(page)).toContainText('# Untitled');
    await expect(tabs(page, 'Preview').first()).toBeVisible();
    await showTab(page, 'Preview');
    await expect(preview(page).locator('em')).toHaveText('words');
  });

  test('previews as you type', async ({ page }) => {
    await start(page);
    await newMarkdown(page);
    await typeAtEnd(
      page,
      '## Second\n\nSome *slanted* and **bold** words.\n\n- one\n- two\n\n> quoted\n\n`code`',
    );
    await showTab(page, 'Preview');
    await expect(preview(page).getByRole('heading', { level: 2, name: 'Second' })).toBeVisible();
    await expect(preview(page).locator('em')).toHaveText('slanted');
    await expect(preview(page).locator('strong')).toHaveText('bold');
    await expect(preview(page).locator('ul > li')).toHaveText(['one', 'two']);
    await expect(preview(page).locator('blockquote')).toHaveText('quoted');
    await expect(preview(page).locator('code')).toHaveText('code');
    // Untitled, Second, Some slanted and bold words, one, two, quoted, code.
    await expect(status(page)).toContainText('11 words');
    // More typing shows at once.
    await typeAtEnd(page, ' more');
    await showTab(page, 'Preview');
    await expect(preview(page).locator('code')).toHaveText('code');
    await expect(status(page)).toContainText('12 words');
  });

  test('draws a long document in the background, and the editor stays editable', async ({
    page,
  }) => {
    await start(page);
    await newMarkdown(page);
    // About 30,000 characters: past the size a key's preview is drawn for at once.
    const paragraph = 'A paragraph of *prose* that goes on for a while, word after word.\n\n';
    await typeAtEnd(page, `${paragraph.repeat(450)}## The End\n\nLast words.`);
    await showTab(page, 'Preview');
    await expect(preview(page).getByRole('heading', { level: 2, name: 'The End' })).toBeAttached({
      timeout: 15_000,
    });
    // 1 (Untitled) + 450 paragraphs of 13 words + 2 + 2.
    await expect(status(page)).toContainText('5,855 words');
    // Typing goes on, and the preview follows after a pause.
    await typeAtEnd(page, ' Even more.');
    await expect(status(page)).toContainText('5,857 words', { timeout: 15_000 });
  });

  test('parses a long document in its worker, entities and all', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the worker is checked in Chromium');
    const failures: string[] = [];
    page.on('console', (message) => {
      if (/Markdown preview failed/.test(message.text())) failures.push(message.text());
    });
    const workers: string[] = [];
    page.on('worker', (worker) => workers.push(worker.url()));
    await start(page);
    await newMarkdown(page);
    // About 30,000 characters, past the size a key's preview is drawn for at once; the last
    // heading has a character reference, which the worker's parser decodes.
    const paragraph = 'A paragraph of *prose* that goes on for a while, word after word.\n\n';
    await typeAtEnd(page, `${paragraph.repeat(450)}## The End &amp; After`);
    await showTab(page, 'Preview');
    await expect(
      preview(page).getByRole('heading', { level: 2, name: 'The End & After', exact: true }),
    ).toBeAttached({ timeout: 15_000 });
    // An edit near the end comes back from the worker too.
    await typeAtEnd(page, ' Again');
    await showTab(page, 'Preview');
    await expect(
      preview(page).getByRole('heading', { level: 2, name: 'The End & After Again' }),
    ).toBeAttached({ timeout: 15_000 });
    expect(workers.filter((url) => /markdown\.worker/.test(url))).toHaveLength(1);
    expect(failures).toEqual([]);
  });

  test('says calmly when a document is nested too deeply to preview', async ({
    page,
    isMobile,
  }) => {
    // Five thousand quote marks on one line are slow for the editor, in every browser, and slower
    // still on a phone, whose Preview is the same code the desktop projects check.
    test.skip(!!isMobile, 'the desktop projects check the same Preview, faster');
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await start(page);
    await newMarkdown(page);
    await showTab(page, 'Source');
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+A');
    // A quote inside a quote, five thousand deep.
    await page.keyboard.insertText(`${'>'.repeat(5_000)} x`);
    await expect(editor(page)).not.toContainText('Untitled');
    await showTab(page, 'Preview');
    // Deeper than a document may nest (MAX_NESTING), it isn't parsed: every browser says so at once.
    await expect(preview(page).getByRole('status')).toHaveText(
      'This document is nested too deeply to preview. Your text is safe in the Source.',
      { timeout: 15_000 },
    );
    // Its words are counted as plain text: the five thousand marks are one, and x another.
    await expect(status(page)).toContainText('2 words');
    // A document that can be drawn is drawn again. (Focused, not clicked: the editor finds a
    // click's place slowly on a line of five thousand marks.)
    await showTab(page, 'Source');
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText('# Shallow again\n');
    await showTab(page, 'Preview');
    await expect(preview(page).getByRole('heading', { name: 'Shallow again' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(preview(page).getByRole('status')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('shows raw HTML and links as text, and runs nothing', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });
    await start(page);
    await newMarkdown(page);
    await typeAtEnd(
      page,
      '<img src=x onerror=alert(1)>\n\n[click me](javascript:alert(2)) and ![a cat](http://example.com/cat.png)\n\n<script>alert(3)</script>',
    );
    await showTab(page, 'Preview');
    await expect(preview(page)).toContainText('<img src=x onerror=alert(1)>');
    await expect(preview(page)).toContainText('click me');
    await expect(preview(page)).toContainText('a cat');
    await expect(preview(page).locator('img, a, script')).toHaveCount(0);
    // Give any error handler its time.
    await page.waitForTimeout(500);
    expect(dialogs).toEqual([]);
  });

  test('numbers footnotes, lists them at the end, and goes from a reference to its note and back', async ({
    page,
  }) => {
    await start(page);
    await newMarkdown(page);
    await typeAtEnd(
      page,
      'One[^later] and two[^1], and one again[^later].\n\n[^1]: The second note.\n[^later]: The first note.\n',
    );
    // The Source marks each reference and label quietly.
    await expect(page.locator('.cm-md-footnote').first()).toHaveText('[^later]');
    await showTab(page, 'Preview');
    const refs = preview(page).locator('sup.md-fnref button');
    await expect(refs).toHaveText(['1', '2', '1']);
    await expect(refs.nth(1)).toHaveAccessibleName('Footnote 2');
    const notes = preview(page).getByRole('region', { name: 'Notes' });
    await expect(notes.getByRole('heading', { name: 'Notes' })).toBeVisible();
    await expect(notes.locator('li')).toHaveText([/The first note\./, /The second note\./]);
    await refs.nth(1).click();
    await expect(notes.locator('li').nth(1)).toBeFocused();
    await notes.getByRole('button', { name: 'Back to footnote 2’s reference' }).click();
    await expect(refs.nth(1)).toBeFocused();
    // Untitled, the six words of the paragraph (a reference's mark is no word), and the notes' six.
    await expect(status(page)).toContainText('13 words');
  });

  test('says there are no checks, and lists no problems', async ({ page }) => {
    await start(page);
    await newMarkdown(page);
    await typeAtEnd(page, 'INT. HOUSE\n\n');
    await showTab(page, 'Problems');
    // Spellcheck is on (the default), and a Markdown document is checked: its Spelling group
    // follows.
    await expect(page.locator('#panel-problems')).toContainText(
      'No script checks for Markdown documents.',
    );
    await expect(page.locator('#panel-problems')).toContainText(/Spelling: /);
    // Fountain's lint would flag this scene heading, in the gutter and the list.
    await page.waitForTimeout(800);
    await showTab(page, 'Source');
    await expect(page.locator('.cm-lint-marker, .cm-diagnostic')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /^Problems/ }).first()).toHaveText('Problems');
  });

  test('turns Fountain’s keys, completion, and lint off', async ({ page }) => {
    await start(page);
    await newMarkdown(page);
    await showTab(page, 'Source');
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    // In Fountain, Tab on a blank line starts a character cue: an @ and the list of names.
    await page.keyboard.press('Tab');
    await expect(page.locator('.cm-tooltip-autocomplete')).toHaveCount(0);
    await expect(editor(page)).not.toContainText('@');
    // Tab is the browser's here (it moves on), so the editor is picked up again.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('INT. KITCHEN - NIGHT');
    // Element: Character, Element: Scene heading: neither acts.
    await page.keyboard.press('ControlOrMeta+Alt+3');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ControlOrMeta+Alt+1');
    await expect(editor(page)).toContainText('INT. KITCHEN - NIGHT');
    await expect(editor(page)).not.toContainText('@');
    // No Fountain highlighting; the Markdown heading is highlighted as one.
    await expect(page.locator('[class*="cm-f-"]')).toHaveCount(0);
    await expect(page.locator('.cm-md-heading')).toContainText('# Untitled');
    // The palette leaves the Fountain commands and the problem keys out, and the scenes.
    await page.keyboard.press('ControlOrMeta+k');
    await paletteDialog(page).locator('input').fill('Force');
    await expect(paletteOption(page, 'Force scene heading (.)')).toHaveCount(0);
    await paletteDialog(page).locator('input').fill('Element');
    await expect(paletteOption(page, 'Element: Character')).toHaveCount(0);
    await paletteDialog(page).locator('input').fill('problem');
    await expect(paletteOption(page, 'Next problem')).toHaveCount(0);
    await paletteDialog(page).locator('input').fill('');
    await expect(paletteDialog(page).getByText('Scenes', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('offers the PDF, the Markdown file, and plain text to export, and writes the text ones', async ({
    page,
    browserName,
    isMobile,
  }) => {
    test.skip(browserName !== 'chromium' || !!isMobile, 'the stand-in file system is Chromium’s');
    await stubPickers(page);
    await start(page);
    await newMarkdown(page);
    await typeAtEnd(page, 'Body text.');
    await page.getByRole('button', { name: 'Export' }).click();
    const menu = page.getByRole('group', { name: 'Export' });
    // Export options… ends the menu, off for a Markdown document (export.spec.ts says why).
    await expect(menu.getByRole('button')).toHaveText([
      'PDF',
      'HTML (.html)',
      'Markdown (.md)',
      'Plain text (.txt)',
      'Export options…',
    ]);
    await menu.getByRole('button', { name: 'Markdown (.md)' }).click();
    await expect.poll(() => files(page)).toContain('Untitled.md');
    expect(await textOf(page, 'Untitled.md')).toBe('# Untitled\n\nBody text.');
    await page.getByRole('button', { name: 'Export' }).click();
    await menu.getByRole('button', { name: 'Plain text (.txt)' }).click();
    await expect.poll(() => files(page)).toContain('Untitled.txt');
    expect(await textOf(page, 'Untitled.txt')).toBe('# Untitled\n\nBody text.');
  });
});

// Markdown's editor mode (a Lezer grammar and its HTML, CSS, and JavaScript neighbors) and its
// parser are big, and a Fountain-only visitor never needs them: they are lazy chunks.
const MODE_MARKER = ['ATXHeading', 'KeyframeList'];
const PARSER_MARKER = ['codeFenced', 'htmlFlow'];

test.describe('the Markdown code is loaded only when needed', () => {
  test('is not in the page a Fountain script loads, and arrives with the first Markdown document', async ({
    page,
  }) => {
    const seen = { mode: [] as string[], parser: [] as string[] };
    page.on('response', async (response) => {
      if (!/\.js(\?|$)/.test(response.url())) return;
      const body = await response.text().catch(() => '');
      if (MODE_MARKER.some((m) => body.includes(m))) seen.mode.push(response.url());
      if (PARSER_MARKER.some((m) => body.includes(m))) seen.parser.push(response.url());
    });
    await start(page);
    await page.waitForLoadState('networkidle');
    expect(seen).toEqual({ mode: [], parser: [] });

    await newMarkdown(page);
    await expect(page.locator('.cm-md-heading')).toContainText('# Untitled');
    await showTab(page, 'Preview');
    await expect(preview(page).getByRole('heading', { name: 'Untitled' })).toBeVisible();
    expect(seen.mode.length).toBeGreaterThan(0);
    expect(seen.parser.length).toBeGreaterThan(0);
  });

  test('never puts the Markdown mode on a Fountain script that was Markdown a moment ago', async ({
    page,
  }) => {
    // The chunk with the mode is held back until the document is Fountain again.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
      setTimeout(resolve, 15_000);
    });
    await page.route('**/*.js', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (MODE_MARKER.some((m) => body.includes(m))) await gate;
      await route.fulfill({ response, body });
    });
    await start(page);
    await newMarkdown(page);
    await command(page, 'Template: Screenplay');
    await expect(status(page)).toContainText('Screenplay');
    release();
    // Give the chunk time to arrive and be (wrongly) applied.
    await page.waitForTimeout(1000);
    await expect(editor(page)).not.toHaveAttribute('data-language', 'markdown');
    await expect(page.locator('.cm-md-heading')).toHaveCount(0);
    // Fountain's own mode is the one on the editor: its keys work.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('Tab');
    await expect(editor(page)).toContainText('@');
  });
});

test.describe('Markdown files without a file picker', () => {
  test('opens a .md file from a file input as Markdown, and downloads a new one as .md', async ({
    page,
  }) => {
    await removePickers(page);
    await start(page);
    await openButton(page).click();
    const chooser = page.waitForEvent('filechooser');
    await scriptsMenu(page).getByRole('button', { name: 'Open a file…' }).click();
    await (await chooser).setFiles({
      name: 'notes.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# From a file\n\nBody.\n'),
    });
    await expect(editor(page)).toContainText('# From a file');
    await expect(tabs(page, 'Preview').first()).toBeVisible();
    await expect
      .poll(async () => (await stored(page)).find((p) => p.fileName === 'notes.md'))
      .toMatchObject({ kind: 'markdown', title: 'From a file' });

    await newMarkdown(page);
    const download = page.waitForEvent('download');
    await page.keyboard.press('ControlOrMeta+s');
    expect((await download).suggestedFilename()).toBe('Untitled.md');
  });
});

test.describe('Markdown files, dropped or from the file input', () => {
  /** A file dropped on the window. */
  async function drop(page: Page, name: string, text: string) {
    await page.evaluate(
      ({ n, t }) => {
        const dt = new DataTransfer();
        dt.items.add(new File([t], n, { type: 'text/markdown' }));
        for (const type of ['dragenter', 'dragover', 'drop']) {
          document.body.dispatchEvent(
            new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }),
          );
        }
      },
      { n: name, t: text },
    );
  }

  test('opens a dropped .md and a dropped .markdown file as Markdown', async ({ page }) => {
    await removePickers(page);
    await start(page);
    for (const [name, text] of [
      ['notes.md', '# Dropped notes\n\nBody.\n'],
      ['plan.markdown', '# Dropped plan\n\nSteps.\n'],
    ] as const) {
      await drop(page, name, text);
      await expect(editor(page), name).toContainText(text.split('\n')[0] as string);
      await expect(tabs(page, 'Preview').first(), name).toBeVisible();
    }
    await expect
      .poll(async () =>
        (await stored(page)).filter((p) => !p.sample).map((p) => [p.fileName, p.kind, p.title]),
      )
      .toEqual(
        expect.arrayContaining([
          ['notes.md', 'markdown', 'Dropped notes'],
          ['plan.markdown', 'markdown', 'Dropped plan'],
        ]),
      );
  });

  test('the picker and the file input offer .md and .markdown', async ({ page }) => {
    // A picker that keeps what it was asked to accept, and is then cancelled.
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown> & { __accepted: string[] };
      w.__accepted = [];
      w.showOpenFilePicker = async (options?: {
        types?: { accept: Record<string, string[]> }[];
      }) => {
        for (const type of options?.types ?? []) {
          w.__accepted.push(...Object.values(type.accept).flat());
        }
        throw new DOMException('The user aborted a request.', 'AbortError');
      };
    });
    await start(page);
    await openButton(page).click();
    await scriptsMenu(page).getByRole('button', { name: 'Open a file…' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __accepted: string[] }).__accepted))
      .toEqual(expect.arrayContaining(['.md', '.markdown', '.fountain', '.fdx']));

    // Where there is no picker, the file input offers the same.
    await page.evaluate(() => {
      Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true });
    });
    await openButton(page).click();
    const chooser = page.waitForEvent('filechooser');
    await scriptsMenu(page).getByRole('button', { name: 'Open a file…' }).click();
    const accept = ((await (await chooser).element().getAttribute('accept')) ?? '').split(',');
    expect(accept).toEqual(expect.arrayContaining(['.md', '.markdown', 'text/markdown']));
  });

  test('turns an opened Markdown outline into a screenplay with New screenplay from this outline', async ({
    page,
  }) => {
    const OUTLINE =
      '# The Night Ferry\n\n## Act One\n\n- The ferry leaves.\n\n## Act Two\n\n- The engine fails.\n\n## Act Three\n\n- They reach the shore.\n';
    await removePickers(page);
    await start(page);
    await openButton(page).click();
    const chooser = page.waitForEvent('filechooser');
    await scriptsMenu(page).getByRole('button', { name: 'Open a file…' }).click();
    await (await chooser).setFiles({
      name: 'ferry.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(OUTLINE),
    });
    await expect(editor(page)).toContainText('## Act Three');

    await command(page, 'New screenplay from this outline');
    await expect(tabs(page, 'Script').first()).toBeVisible();
    await expect
      .poll(async () => {
        const made = (await stored(page)).find(
          (p) => !p.sample && p.kind !== 'markdown' && p.title === 'The Night Ferry',
        );
        return made?.source.match(/^INT\. LOCATION - DAY$/gm)?.length ?? 0;
      })
      .toBe(3);
    // A new script with no file; the Markdown document is unchanged.
    const rows = (await stored(page)).filter((p) => !p.sample);
    const made = rows.find((p) => p.kind !== 'markdown' && p.title === 'The Night Ferry');
    expect(made?.fileName).toBeUndefined();
    for (const stub of ['= The ferry leaves.', '= The engine fails.', '= They reach the shore.']) {
      expect(made?.source, stub).toContain(stub);
    }
    expect(rows.find((p) => p.fileName === 'ferry.md')).toMatchObject({
      kind: 'markdown',
      source: OUTLINE,
    });
  });
});

test.describe('Markdown files', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'the stand-in file system is Chromium’s',
  );

  test('opens a .md file as Markdown, and saves it as .md', async ({ page }) => {
    await stubPickers(page);
    await start(page);
    await putFile(page, 'notes.md', '# Field notes\n\nThe *door* creaks.\n');
    await page.evaluate(() => {
      (window as unknown as { __nextFileName: string }).__nextFileName = 'notes.md';
    });
    await openButton(page).click();
    await scriptsMenu(page).getByRole('button', { name: 'Open a file…' }).click();
    await expect(editor(page)).toContainText('# Field notes');
    await expect
      .poll(async () => (await stored(page)).find((p) => p.fileName === 'notes.md'))
      .toMatchObject({
        kind: 'markdown',
        title: 'Field notes',
      });
    await showTab(page, 'Preview');
    await expect(preview(page).getByRole('heading', { name: 'Field notes' })).toBeVisible();
    // Save writes the file it came from.
    await typeAtEnd(page, 'More.\n');
    await page.keyboard.press('ControlOrMeta+s');
    await expect
      .poll(() => textOf(page, 'notes.md'))
      .toBe('# Field notes\n\nThe *door* creaks.\nMore.\n');

    // A new document asks for a .md name.
    await newMarkdown(page);
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => picks(page)).toContain('Untitled.md');
    await expect.poll(() => textOf(page, 'Untitled.md')).toBe('# Untitled\n\n');
  });

  test('opens a .markdown file as Markdown, and a .fountain file as Fountain', async ({ page }) => {
    await stubPickers(page);
    await start(page);
    for (const [name, text] of [
      ['plan.markdown', '## Plan\n'],
      ['door.fountain', 'Title: The Door\n\nINT. HALL - DAY\n\nHi.\n'],
    ] as const) {
      await putFile(page, name, text);
      await page.evaluate((n) => {
        (window as unknown as { __nextFileName: string }).__nextFileName = n;
      }, name);
      await openButton(page).click();
      await scriptsMenu(page).getByRole('button', { name: 'Open a file…' }).click();
      await expect(editor(page)).toContainText(text.split('\n')[0] as string);
    }
    await expect
      .poll(async () =>
        (await stored(page)).filter((p) => !p.sample).map((p) => [p.fileName, p.kind]),
      )
      .toEqual(
        expect.arrayContaining([
          ['plan.markdown', 'markdown'],
          ['door.fountain', 'fountain'],
        ]),
      );
    await expect(tabs(page, 'Script').first()).toBeVisible();
  });
});

test.describe('Open as screenplay', () => {
  const TYPED = 'Title: The Night Train\n\nINT. TRAIN - NIGHT\n\nRain on the glass.\n';

  test('Open as screenplay from the palette opens a .md as a screenplay, and Save asks for a .fountain and the .md is unchanged', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'the stand-in file system is Chromium’s');
    await stubPickers(page);
    await start(page);
    await putFile(page, 'train.md', TYPED);
    await nextFileName(page, 'train.md');
    await command(page, 'Open as screenplay…');
    await expect(editor(page)).toContainText('INT. TRAIN - NIGHT');
    await expect(page.locator('.toast [role="status"]')).toHaveText(
      'Opened “train.md” as a screenplay.',
    );
    // A Fountain script: the Script tab, not the Preview.
    await expect(tabs(page, 'Script').first()).toBeVisible();
    await expect
      .poll(async () => (await stored(page)).filter((p) => !p.sample))
      .toEqual([expect.objectContaining({ kind: 'fountain', title: 'The Night Train' })]);
    expect((await stored(page)).find((p) => !p.sample)?.fileName).toBeUndefined();

    // Save asks for a .fountain, and never writes the .md.
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => picks(page)).toContain('The Night Train.fountain');
    await expect.poll(() => textOf(page, 'The Night Train.fountain')).toBe(TYPED);
    expect(await textOf(page, 'train.md')).toBe(TYPED);
  });

  test('the app menu lists Open as screenplay after Open', async ({ page }) => {
    await start(page);
    await page.getByRole('button', { name: 'Drafter menu' }).click();
    const menu = page.getByRole('menu', { name: 'Drafter menu' });
    await expect(menu).toBeVisible();
    const shown = (await menu.getByRole('menuitem').allTextContents()).map((n) => n.trim());
    const at = (label: string) => shown.findIndex((n) => n.startsWith(label));
    expect(at('Open as screenplay…')).toBe(at('Open…') + 1);
  });
});

test.describe('switching between Markdown and Fountain', () => {
  test('lists the document types in the palette, each where it applies', async ({ page }) => {
    await start(page);
    // A Fountain script of the writer's own: Markdown is offered.
    await openButton(page).click();
    await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
    await expect(editor(page)).toContainText('Untitled Screenplay');
    await page.keyboard.press('ControlOrMeta+k');
    await paletteDialog(page).locator('input').fill('Document');
    await expect(paletteOption(page, 'Document: Markdown (plain text)')).toBeVisible();
    await page.keyboard.press('Escape');
    // A Markdown document: both templates are offered, and Markdown is not.
    await newMarkdown(page);
    await page.keyboard.press('ControlOrMeta+k');
    await paletteDialog(page).locator('input').fill('Template');
    await expect(paletteOption(page, 'Template: Screenplay')).toBeVisible();
    await expect(paletteOption(page, 'Template: Stage play')).toBeVisible();
    await paletteDialog(page).locator('input').fill('Document');
    await expect(paletteOption(page, 'Document: Markdown (plain text)')).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('switches to Screenplay and back, keeping the text', async ({ page }) => {
    await start(page);
    await newMarkdown(page);
    await typeAtEnd(page, 'Some notes, zzkeep.');
    const text = '# Untitled\n\nSome notes, zzkeep.';

    // The phone route: the palette.
    await command(page, 'Template: Screenplay');
    await expect(tabs(page, 'Script').first()).toBeVisible();
    await expect(tabs(page, 'Preview')).toHaveCount(0);
    await expect(status(page)).toContainText('Screenplay');
    await expect(editor(page)).toContainText('Some notes, zzkeep.');
    await expect
      .poll(async () => (await stored(page)).find((p) => p.source.includes('zzkeep'))?.kind)
      .toBe('fountain');
    // Fountain's lint is back (a heading with no time of day), and its parse of this text.
    await expect(page.locator('[class*="cm-f-"]').first()).toBeAttached();

    // And back, after asking. Cancel changes nothing.
    await command(page, 'Document: Markdown (plain text)');
    await expect(question(page)).toBeVisible();
    await question(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(question(page)).toBeHidden();
    await expect(tabs(page, 'Script').first()).toBeVisible();
    await command(page, 'Document: Markdown (plain text)');
    await question(page).getByRole('button', { name: 'Make it Markdown' }).click();
    await expect(tabs(page, 'Preview').first()).toBeVisible();
    await expect
      .poll(async () => (await stored(page)).find((p) => p.source.includes('zzkeep'))?.kind)
      .toBe('markdown');
    await expect
      .poll(async () => (await stored(page)).find((p) => p.source.includes('zzkeep'))?.source)
      .toBe(text);

    // Undo does not reverse the change of kind.
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(tabs(page, 'Preview').first()).toBeVisible();
  });

  test('switches from the toolbar’s chip, asking first, from the keyboard', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'the chip is hidden on a phone');
    await start(page);
    await newMarkdown(page);
    await expect(chip(page)).toHaveText('Markdown (plain text)');
    await expect(chip(page)).toHaveAttribute('aria-label', 'Document: Markdown (plain text)');

    // Stage play from Markdown: Fountain is on again, and the block is written (one undo step).
    await chip(page).click();
    await expect(chipItem(page, 'Markdown (plain text)')).toHaveAttribute('aria-checked', 'true');
    await expect(chipItem(page, 'Screenplay')).toHaveAttribute('aria-checked', 'false');
    await chipItem(page, 'Stage play').click();
    await expect(chip(page)).toHaveText('Stage play');
    await expect(tabs(page, 'Script').first()).toBeVisible();
    // The rest is from the keyboard. Take the mouse off where the menu was, and let the menu finish
    // closing: until it has gone, a pointer resting over it focuses its items, and its going puts
    // focus back in the editor, whatever has focus by then.
    await page.mouse.move(0, 0);
    await expect(chipMenu(page)).toHaveCount(0);
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+End');
    await expect(editor(page)).toContainText('"template":"stage-play-standard"');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor(page)).not.toContainText('"template":"stage-play-standard"');
    // Undo took the block back; the script is still Fountain.
    await expect(chip(page)).toHaveText('Screenplay');

    // Markdown again, by keyboard: Escape cancels, Enter on the other button agrees.
    await chip(page).focus();
    await page.keyboard.press('Enter');
    await chipItem(page, 'Markdown (plain text)').focus();
    await page.keyboard.press('Enter');
    await expect(question(page)).toBeVisible();
    await expect(question(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(question(page)).toBeHidden();
    await expect(chip(page)).toHaveText('Screenplay');
    await chip(page).click();
    await chipItem(page, 'Markdown (plain text)').click();
    await question(page).getByRole('button', { name: 'Make it Markdown' }).focus();
    await page.keyboard.press('Enter');
    await expect(chip(page)).toHaveText('Markdown (plain text)');
  });

  test('drops the question when another script opens while it is asked', async ({ page }) => {
    await start(page);
    await openButton(page).click();
    await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
    await expect(editor(page)).toContainText('Untitled Screenplay');
    await expect.poll(async () => (await stored(page)).filter((p) => !p.sample).length).toBe(1);
    await command(page, 'Document: Markdown (plain text)');
    await expect(question(page)).toBeVisible();

    // The app's keys still work under the question: one opens another script.
    await page.keyboard.press('ControlOrMeta+Alt+n');
    await expect.poll(async () => (await stored(page)).filter((p) => !p.sample).length).toBe(2);
    // The question was about the script that was open: it goes, and nothing became Markdown.
    await expect(question(page)).toBeHidden();
    await expect(tabs(page, 'Script').first()).toBeVisible();
    expect((await stored(page)).filter((p) => p.kind === 'markdown')).toEqual([]);
  });

  test('on a sample, opens the Markdown sample, and the sample stays a screenplay', async ({
    page,
    isMobile,
  }) => {
    await start(page);
    if (isMobile) {
      await page.keyboard.press('ControlOrMeta+k');
      await paletteDialog(page).locator('input').fill('Document');
      await paletteOption(page, 'Document: Markdown (plain text)').click();
    } else {
      await chip(page).click();
      await expect(chipItem(page, 'Markdown (plain text)')).not.toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await chipItem(page, 'Markdown (plain text)').click();
    }
    // No question: nothing of the writer's changes kind. The Markdown sample opens instead.
    await expect(question(page)).toBeHidden();
    await expect(tabs(page, 'Preview').first()).toBeVisible();
    await expect(editor(page)).toContainText('Markdown');
    await expect
      .poll(async () =>
        (await stored(page))
          .filter((p) => p.sample)
          .map((p) => [p.sample, p.kind])
          .sort(),
      )
      .toEqual([
        ['markdown', 'markdown'],
        ['screenplay', 'fountain'],
      ]);

    // And back: Screenplay on the Markdown sample opens the screenplay sample.
    if (isMobile) {
      await page.keyboard.press('ControlOrMeta+k');
      await paletteDialog(page).locator('input').fill('Template');
      await paletteOption(page, 'Template: Screenplay').click();
    } else {
      await chip(page).click();
      await chipItem(page, 'Screenplay').click();
    }
    await expect(tabs(page, 'Script').first()).toBeVisible();
    await expect(editor(page)).toContainText('Title:');
    expect((await stored(page)).filter((p) => p.sample === 'markdown')[0]?.kind).toBe('markdown');
  });
});
