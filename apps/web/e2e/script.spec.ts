import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { drafterDatabase, sampleSeenRows } from './seed';

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

  test('draws the pages in the theme’s paper and ink', async ({ page }) => {
    const colors = () =>
      pages(page)
        .first()
        .evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
    const dark = await colors();
    await useLightTheme(page);
    const light = await colors();
    expect(dark).not.toEqual(light);
    // The page token's own color, which the light theme makes white.
    expect(light[0]).toBe('rgb(255, 255, 255)');
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
    // Fit width: the page fills the pane (less its margins), so it is narrower than 8.5 in.
    await expect.poll(async () => Math.abs((await width()) - (await paneWidth()))).toBeLessThan(40);
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
              localStorage: [{ name: 'drafter-tour-v1', value: 'true' }],
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
    const cue = (name: string) =>
      page.getByRole('button', { name, exact: true }).evaluate((el) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--heading)';
        document.body.append(probe);
        const heading = getComputedStyle(probe).color;
        probe.remove();
        const style = getComputedStyle(el);
        return {
          width: style.borderBottomWidth,
          line: style.borderBottomStyle,
          color: style.borderBottomColor,
          heading,
        };
      });
    const pressed = await cue('Fit width');
    expect(pressed).toMatchObject({ width: '1px', line: 'solid' });
    expect(pressed.color).toBe(pressed.heading);
    // The other button keeps the room but not the color.
    const other = await cue('100%');
    expect(other.width).toBe('1px');
    expect(other.color).not.toBe(other.heading);
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
