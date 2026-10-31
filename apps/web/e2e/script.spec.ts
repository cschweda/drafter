import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { removePickers } from './fs-stub';
import { drafterDatabase, sampleSeenRows, stateWithSettings } from './seed';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SAMPLE = readFileSync(
  new URL('../../../samples/screenplay.fountain', import.meta.url),
  'utf8',
);

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`);
}

const script = (page: Page) => page.getByRole('region', { name: 'Script' });
const pages = (page: Page) => script(page).locator('.drafter-page');
const lineOf = (page: Page, text: string) =>
  script(page).locator('.drafter-line', { hasText: text }).first();
/** The Script tab's bar, which holds the zoom buttons. */
const slim = (page: Page) =>
  page.locator('.slim').filter({ has: page.getByRole('group', { name: 'Zoom' }) });
const status = (page: Page) => page.locator('[data-tour="status"]');

async function useLightTheme(page: Page) {
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
}

/** Chooses a Page colour in Settings (fresh-look design §4). */
async function choosePageColor(page: Page, color: 'paper' | 'dark') {
  await page.keyboard.press('ControlOrMeta+,');
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await settings.getByLabel('Page colour').selectOption(color);
  await settings.getByRole('button', { name: 'Done' }).click();
  await expect(settings).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-page-color', color);
}

/** A token's color, as the page's root computes it. */
const tokenColor = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);

/** The first page's paper and type, and the desk around it. */
const pageColors = (page: Page) =>
  pages(page)
    .first()
    .evaluate((el) => ({
      paper: getComputedStyle(el).backgroundColor,
      ink: getComputedStyle(el).color,
      desk: getComputedStyle(el.closest('.script-host') as Element).backgroundColor,
    }));

/**
 * Types a phrase, a letter at a time, at the start of a 120-page script, and expects no long task
 * (Chromium's API). The observer is proved first with a task of its own.
 */
async function typesWithoutLongTask(page: Page) {
  test.setTimeout(90_000);
  const body = SAMPLE.slice(SAMPLE.indexOf('# Act One'));
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(`${body}\n`.repeat(85));
  await expect.poll(() => pages(page).count(), { timeout: 30_000 }).toBeGreaterThan(110);
  // Settled: nothing is still updating.
  await expect(slim(page)).not.toContainText('Updating');

  await page.evaluate(() => {
    const long: number[] = [];
    (window as unknown as { longTasks: number[] }).longTasks = long;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) long.push(entry.duration);
    }).observe({ type: 'longtask', buffered: false });
  });
  const longTasks = () =>
    page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks);
  // Proof the observer sees what it should: a task of about 80 ms is reported once. Then the
  // list is emptied, so only the typing is judged below.
  // (A timer's task: the long-task API doesn't count the evaluation itself.)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          const end = performance.now() + 80;
          while (performance.now() < end);
          resolve();
        }),
      ),
  );
  await expect.poll(async () => (await longTasks()).length).toBe(1);
  await page.evaluate(() => {
    (window as unknown as { longTasks: number[] }).longTasks.length = 0;
  });

  // The start of the script is the worst place to type: every later offset moves.
  const phrase = 'Typing into a long script, one letter at a time.';
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.type(phrase, { delay: 60 });
  await expect(slim(page)).not.toContainText('Updating');
  // Layout kept up: the first page shows what was typed.
  await expect(pages(page).first().locator('.drafter-line', { hasText: phrase })).toBeVisible();
  // Let any task still queued run before reading the observer.
  await page.waitForTimeout(500);
  expect(await longTasks()).toEqual([]);
}

test.describe('the Script pane on a desktop', () => {
  test.skip(({ isMobile }) => !!isMobile, 'two panes need a wide screen');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(pages(page).first()).toBeVisible();
    // The first visit has opened the sample and put the cursor on its first scene heading (page 1):
    // the session is ready. A jump made before then is not what these tests are about.
    await expect(status(page)).toContainText('Page 1 of');
  });

  test('shows the sample’s pages', async ({ page }) => {
    // `node packages/cli/dist/index.js build samples/screenplay.fountain --txt`
    // gives the title page and two numbered pages.
    await expect(pages(page)).toHaveCount(3);
    await expect(
      pages(page).evaluateAll((els) => els.map((el) => el.getAttribute('data-page'))),
    ).resolves.toEqual(['0', '1', '2']);
    const headings = script(page).getByRole('heading', { level: 2 });
    await expect(headings).toHaveText(['INT. KITCHEN - NIGHT', 'EXT. BACK PORCH - LATER']);
  });

  test('the page is paper on the desk in both themes', async ({ page }) => {
    for (const theme of ['dark', 'light'] as const) {
      if (theme === 'light') await useLightTheme(page);
      const colors = await pageColors(page);
      expect(colors.paper, theme).toBe(await tokenColor(page, '--paper'));
      expect(colors.ink, theme).toBe(await tokenColor(page, '--paper-ink'));
      expect(colors.desk, theme).toBe(await tokenColor(page, '--desk'));
      expect(colors.paper, theme).not.toBe(colors.desk);
    }
    // Dark mode's paper is dim, not white (design §4); the light theme's is white.
    await expect.poll(async () => (await pageColors(page)).paper).toBe('rgb(255, 255, 255)');
    // A hairline and a soft two-layer shadow on each sheet.
    const shadow = await pages(page)
      .first()
      .evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow.match(/rgba?\(/g)).toHaveLength(3);
    expect(shadow).toMatch(/0px 0px 0px 1px/);
    // 24px of desk between the pages, whatever the zoom. Above the first page, side by side, the
    // page's top stands level with the Source's first line (pane-align.spec.ts, decided
    // 2026-10-29); a phone's one pane has 24px there (the short script below).
    for (const zoom of ['Fit width', '100%']) {
      await page.getByRole('button', { name: zoom, exact: true }).click();
      const gaps = await script(page).evaluate((el) => {
        const host = el.closest('.script-host') as HTMLElement;
        const [a, b] = [...el.querySelectorAll('.drafter-page')].map((p) =>
          p.getBoundingClientRect(),
        );
        return {
          top: (a as DOMRect).top - host.getBoundingClientRect().top + host.scrollTop,
          between: (b as DOMRect).top - (a as DOMRect).bottom,
        };
      });
      expect(gaps.top, `${zoom} top`).toBeGreaterThanOrEqual(12);
      expect(Math.abs(gaps.between - 24), `${zoom} gap ${gaps.between}`).toBeLessThan(1.5);
    }
  });

  test("Page colour Dark gives today's dark page", async ({ page }) => {
    // Paper by default, with no setting stored.
    await expect
      .poll(async () => (await pageColors(page)).paper)
      .toBe(await tokenColor(page, '--paper'));
    await choosePageColor(page, 'dark');
    // The page the dark theme drew before the paper, in both themes.
    const dark = { paper: 'rgb(27, 30, 37)', ink: 'rgb(232, 234, 238)' };
    await expect.poll(() => pageColors(page)).toMatchObject(dark);
    await useLightTheme(page);
    await expect.poll(() => pageColors(page)).toMatchObject(dark);
    // Kept with the other settings.
    await page.reload();
    await expect(pages(page).first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-page-color', 'dark');
    await expect.poll(() => pageColors(page)).toMatchObject(dark);
    await choosePageColor(page, 'paper');
    await expect.poll(async () => (await pageColors(page)).paper).toBe('rgb(255, 255, 255)');
  });

  test('print and the PDF are unchanged', async ({ page }) => {
    test.setTimeout(120_000);
    // Every browser downloads (no save picker), from the next load on.
    await removePickers(page);
    await page.reload();
    await expect(pages(page).first()).toBeVisible();
    // Every export of the sample, as bytes, under one page colour and theme.
    const exports = async () => {
      const files: string[] = [];
      for (const name of ['PDF', 'HTML (.html)', 'Plain text (.txt)']) {
        const menu = page.getByRole('group', { name: 'Export' });
        // Opened, and seen open, before an item is chosen.
        await expect(async () => {
          if (!(await menu.isVisible()))
            await page.getByRole('button', { name: 'Export', exact: true }).click();
          await expect(menu).toBeVisible({ timeout: 1000 });
        }).toPass();
        const download = page.waitForEvent('download');
        await menu.getByRole('button', { name }).click();
        files.push((await readFile(await (await download).path())).toString('base64'));
        await expect(menu).toBeHidden();
      }
      return files;
    };
    /** The first page's paper and type when printed. */
    const printed = async () => {
      await page.emulateMedia({ media: 'print' });
      const colors = await pageColors(page);
      await page.emulateMedia({ media: 'screen' });
      return [colors.paper, colors.ink];
    };
    const paper = await exports();
    expect(await printed()).toEqual(['rgb(255, 255, 255)', 'rgb(0, 0, 0)']);
    await choosePageColor(page, 'dark');
    expect(await exports()).toEqual(paper);
    expect(await printed()).toEqual(['rgb(255, 255, 255)', 'rgb(0, 0, 0)']);
    await useLightTheme(page);
    expect(await exports()).toEqual(paper);
    expect(await printed()).toEqual(['rgb(255, 255, 255)', 'rgb(0, 0, 0)']);
  });

  test('updates the pages as you type', async ({ page }) => {
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\n\nINT. THE NEW ROOM - DAY\n');
    await expect(script(page).getByRole('heading', { level: 2 })).toHaveText([
      'INT. KITCHEN - NIGHT',
      'EXT. BACK PORCH - LATER',
      'INT. THE NEW ROOM - DAY',
    ]);
  });

  test('jumps to the source when a line is clicked', async ({ page }) => {
    await lineOf(page, 'EXT. BACK PORCH - LATER').click();
    // The click selected the start of the line and focused the editor.
    await page.keyboard.insertText('ZZ');
    await expect(page.locator('.cm-line', { hasText: 'ZZEXT. BACK PORCH - LATER' })).toBeVisible();
  });

  test('follows the cursor', async ({ page }) => {
    const last = lineOf(page, 'END OF SAMPLE');
    await expect(last).not.toBeInViewport();
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await expect(last).toBeInViewport();
  });

  // At the text's end (the empty line after the last line) the Script keeps the last line in view,
  // not the blank lower half of the last page, even in a short window; and typing at the end of
  // the last line keeps it there too.
  test('follows the cursor to the end in a short window', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    const last = lineOf(page, 'END OF SAMPLE');
    await expect(last).not.toBeInViewport();
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await expect(last).toBeInViewport({ ratio: 1 });
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('End');
    await page.keyboard.insertText(' ZZ');
    await expect(lineOf(page, 'ZZ')).toBeInViewport({ ratio: 1 });
  });

  test('shows the current page in the slim bar and the status bar', async ({ page }) => {
    // A first visit starts on the first scene heading, which is on page 1 (not the title page).
    await expect(slim(page).filter({ hasText: 'Page 1 of 2' })).toBeVisible();
    await expect(status(page)).toContainText('Page 1 of 2');
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await expect(slim(page).filter({ hasText: 'Page 2 of 2' })).toBeVisible();
    await expect(status(page)).toContainText('Page 2 of 2');
    // A blank line keeps the page it was on.
    await page.keyboard.insertText('\n\n');
    await expect(status(page)).toContainText('Page 2 of 2');
    // Typing says it is updating, then settles.
    await expect(slim(page)).not.toContainText('Updating');
  });

  test('switches between Fit width and 100%', async ({ page }) => {
    const fit = page.getByRole('button', { name: 'Fit width' });
    const full = page.getByRole('button', { name: '100%' });
    const first = pages(page).first();
    const width = () => first.evaluate((el) => el.getBoundingClientRect().width);
    const paneWidth = () => script(page).evaluate((el) => el.parentElement?.clientWidth ?? 0);

    await expect(fit).toHaveAttribute('aria-pressed', 'true');
    await expect(full).toHaveAttribute('aria-pressed', 'false');
    // Fit width: the page fills the pane (less its 24px of desk each side), so it is narrower
    // than 8.5 in.
    await expect.poll(async () => Math.abs((await width()) - (await paneWidth()))).toBeLessThan(56);
    expect(await width()).toBeLessThan(8.5 * 96);

    // The buttons work from the keyboard.
    await full.focus();
    await page.keyboard.press('Enter');
    await expect(full).toHaveAttribute('aria-pressed', 'true');
    await expect(fit).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(width).toBeCloseTo(8.5 * 96, -1);

    await fit.focus();
    await page.keyboard.press('Space');
    await expect(fit).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(width).toBeLessThan(8.5 * 96);
  });

  test('stays at the same size when the pane is resized in Fit width', async ({ page }) => {
    const first = pages(page).first();
    const before = await first.evaluate((el) => el.getBoundingClientRect().width);
    await page.setViewportSize({ width: 1700, height: 900 });
    await expect
      .poll(() => first.evaluate((el) => el.getBoundingClientRect().width))
      .toBeGreaterThan(before + 100);
  });

  test('clamps a jump to a shorter text', async ({ page }) => {
    // A layout that lags the text can name an offset past its end: the editor must not throw.
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.evaluate(() => {
      const event = new CustomEvent('drafter:goto', {
        detail: { offset: 10_000_000 },
        bubbles: true,
      });
      document.querySelector('section.drafter-script')?.dispatchEvent(event);
    });
    await page.keyboard.insertText('END');
    // The cursor went to the end of the text.
    await expect(page.locator('.cm-line').last()).toHaveText('END');
    expect(errors).toEqual([]);
  });

  test.describe('in Chromium', () => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'long tasks are a Chromium API');

    test('types into a 120-page script without a long task', async ({ page }) => {
      await typesWithoutLongTask(page);
    });

    test.describe('with the structure strip on', () => {
      test.use({
        storageState: {
          cookies: [],
          origins: [
            {
              origin: `http://localhost:${Number(process.env.E2E_PORT ?? 4173)}`,
              localStorage: [
                { name: 'drafter-tour-v1', value: 'true' },
                { name: 'drafter-storage-toast-v1', value: 'true' },
              ],
              indexedDB: [
                drafterDatabase([...sampleSeenRows, { key: 'structureStrip', value: true }]),
              ],
            },
          ],
        },
      });

      test('types into a 120-page script with the structure strip on without a long task', async ({
        page,
      }) => {
        await expect(page.getByRole('group', { name: 'Structure strip' })).toBeVisible();
        await typesWithoutLongTask(page);
        // The strip kept up: one block a scene.
        await expect(
          page
            .getByRole('group', { name: 'Structure strip' })
            .getByRole('group', { name: 'Scenes', exact: true })
            .getByRole('button'),
        ).toHaveCount(85 * 2);
      });
    });
  });

  test('marks the pressed zoom button with a line in the heading color', async ({ page }) => {
    // Fit · 100% is a segmented control in the Inspector's header (fresh-look design §3.3): the
    // pressed one is filled, and has a line in the heading colour under it, a cue beyond the fill.
    const cue = (name: string) =>
      page.getByRole('button', { name, exact: true }).evaluate((el) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--heading)';
        document.body.append(probe);
        const heading = getComputedStyle(probe).color;
        probe.remove();
        return { shadow: getComputedStyle(el).boxShadow, heading };
      });
    const pressed = await cue('Fit width');
    expect(pressed.shadow).toContain(pressed.heading);
    expect(pressed.shadow).toMatch(/inset/);
    const other = await cue('100%');
    expect(other.shadow).toBe('none');
  });

  test('has no accessibility violations in the Script pane in the dark theme', async ({ page }) => {
    expect(await violations(page)).toEqual([]);
  });

  test('has no accessibility violations in the Script pane in the light theme', async ({
    page,
  }) => {
    await useLightTheme(page);
    expect(await violations(page)).toEqual([]);
  });
});

test.describe('when the pages cannot be laid out', () => {
  const MESSAGE = "Couldn't lay out the pages.";

  test('says so when the layout worker fails to load', async ({ page }) => {
    await page.route(/layout\.worker.*\.js/, (route) => route.abort());
    await page.goto('/');
    await expect(page.getByText(MESSAGE)).toBeVisible();
    await expect(pages(page)).toHaveCount(0);
    // The editor still works.
    if (!(await page.locator('.cm-content').isVisible())) {
      await page.getByRole('tab', { name: 'Source' }).click();
    }
    await page.locator('.cm-content').click();
    await page.keyboard.insertText('still typing');
    await expect(page.locator('.cm-line', { hasText: 'still typing' })).toBeVisible();
    // The message is not an accessibility problem.
    if (process.env.A11Y) expect(await violations(page)).toEqual([]);
  });

  test('says so when a worker cannot be created at all', async ({ page }) => {
    await page.addInitScript(() => {
      window.Worker = class {
        constructor() {
          throw new Error('workers are not available');
        }
      } as unknown as typeof Worker;
    });
    await page.goto('/');
    await expect(page.getByText(MESSAGE)).toBeVisible();
    // The page loads and the editor is there.
    await expect(page.locator('.cm-content')).toBeAttached();
  });
});

test.describe('the Script pane on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'one pane on a narrow screen');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(pages(page).first()).toBeVisible();
    // The first visit has opened the sample and put the cursor on its first scene heading (page 1):
    // the session is ready. A jump made before then is not what these tests are about.
    await expect(status(page)).toContainText('Page 1 of');
  });

  test('opens on the script, fitted to the screen', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Script' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const width = await pages(page)
      .first()
      .evaluate((el) => el.getBoundingClientRect().width);
    const viewport = page.viewportSize()?.width ?? 0;
    expect(width).toBeLessThanOrEqual(viewport);
    expect(width).toBeGreaterThan(viewport * 0.8);
    // The first scene heading is on page 1; the cursor starts there.
    await expect(slim(page)).toContainText('Page 1 of 2');
    await expect(status(page)).toContainText('Page 1 of 2');
  });

  test('jumps to the Source tab when a line is clicked', async ({ page }) => {
    await lineOf(page, 'EXT. BACK PORCH - LATER').click();
    await expect(page.getByRole('tab', { name: 'Source' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.insertText('ZZ');
    await expect(page.locator('.cm-line', { hasText: 'ZZEXT. BACK PORCH - LATER' })).toBeVisible();
    // Back on the Script tab, the page that line is on shows in the bar.
    await page.getByRole('tab', { name: 'Script' }).click();
    await expect(slim(page)).toContainText('Page 2 of 2');
    await expect(lineOf(page, 'EXT. BACK PORCH - LATER')).toBeInViewport();
  });

  test('has no accessibility violations in the Script tab, in both themes', async ({ page }) => {
    expect(await violations(page)).toEqual([]);
    await useLightTheme(page);
    expect(await violations(page)).toEqual([]);
  });
});

// The paper runs to the bottom (design §4, the maintainer: "extend the script all the way to the
// bottom … It's a page of paper — even if it's not full, that's fine"): no desk under a short script.
test.describe('a short script', () => {
  const lastPageReachesBottom = (page: Page) =>
    script(page).evaluate((el) => {
      const host = el.closest('.script-host') as HTMLElement;
      const last = [...el.querySelectorAll('.drafter-page')].at(-1) as HTMLElement;
      const box = host.getBoundingClientRect();
      return {
        under: box.top + host.clientTop + host.clientHeight - last.getBoundingClientRect().bottom,
        scrolls: host.scrollHeight - host.clientHeight,
      };
    });

  test('is drawn on paper that runs to the bottom of the pane', async ({ page, isMobile }) => {
    // Tall enough that one whole page, even at 100%, ends above the pane's bottom.
    const width = isMobile ? (page.viewportSize()?.width ?? 390) : 1440;
    await page.setViewportSize({ width, height: isMobile ? 900 : 1500 });
    await page.goto('/');
    await expect(pages(page).first()).toBeVisible();
    if (!(await page.locator('.cm-content').isVisible()))
      await page.getByRole('tab', { name: 'Source' }).click();
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText('INT. HALL - DAY\n\nShe waits.\n');
    if (!(await script(page).isVisible())) await page.getByRole('tab', { name: 'Script' }).click();
    await expect(pages(page)).toHaveCount(1);
    if (isMobile) {
      // One pane: 24px of desk above the first page.
      const top = await pages(page)
        .first()
        .evaluate(
          (el) =>
            el.getBoundingClientRect().top -
            (el.closest('.script-host') as HTMLElement).getBoundingClientRect().top,
        );
      expect(Math.abs(top - 24)).toBeLessThan(1.5);
    }
    for (const zoom of isMobile ? ['Fit width'] : ['100%', 'Fit width']) {
      await page.getByRole('button', { name: zoom, exact: true }).click();
      await expect
        .poll(async () => Math.abs((await lastPageReachesBottom(page)).under), zoom)
        .toBeLessThan(1.5);
      expect((await lastPageReachesBottom(page)).scrolls, zoom).toBeLessThanOrEqual(1);
    }
    // A longer script is whole sheets again: its last page ends where a page ends.
    if (!isMobile) {
      await page.locator('.cm-content').click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText(SAMPLE);
      await expect(pages(page)).toHaveCount(3);
      const heights = await pages(page).evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().height)),
      );
      expect(new Set(heights).size).toBe(1);
    }
  });
});

test.describe('with Page colour Dark stored', () => {
  test.use({ storageState: stateWithSettings([{ key: 'pageColor', value: 'dark' }]) });

  test('opens on the dark page, with no accessibility violations in either theme', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(pages(page).first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-page-color', 'dark');
    await expect.poll(async () => (await pageColors(page)).paper).toBe('rgb(27, 30, 37)');
    expect(await violations(page)).toEqual([]);
    await useLightTheme(page);
    expect(await violations(page)).toEqual([]);
  });
});
