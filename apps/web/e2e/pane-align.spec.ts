import { expect, type Page, test } from '@playwright/test';
import { runCommand, setText, start, stored } from './modules';

// With two panes side by side, the first line of text in each starts at the same height (decided
// 2026-10-29): the panes share their bar rows, so the Source's two bars and the other pane's one
// end at the same line, and each pane's text starts the same distance below that line. "The top
// of a line of text" is the top of its glyphs' box (a Range's rectangle), not of the line box, so
// lines of different heights compare as they look. The Script's first line is on a page under a
// page's margin: there, the top of the page stands level with the Source's first line.

/** Within this many pixels, two lines look level. */
const LEVEL = 2;

type Probe = 'source' | 'page' | 'preview' | 'outline';

/** The top of the first text in each pane, for what each pane shows. */
function tops(page: Page, left: Probe, right: Probe) {
  return page.evaluate(
    ([left, right]) => {
      const textTop = (el: Element | null | undefined): number | null => {
        if (!el) return null;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
          acceptNode: (node) =>
            (node.textContent ?? '').trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
        });
        const node = walker.nextNode();
        if (!node) return null;
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getClientRects()[0]?.top ?? null;
      };
      const top = (pane: string, probe: string): number | null => {
        const root = document.querySelector(`[data-pane="${pane}"]`);
        if (probe === 'source') return textTop(root?.querySelector('.cm-line'));
        if (probe === 'preview') return textTop(root?.querySelector('.preview .body'));
        if (probe === 'outline') return textTop(root?.querySelector('[role="treeitem"] .line'));
        const sheet = root?.querySelector('.script-host .drafter-page');
        return sheet ? sheet.getBoundingClientRect().top : null;
      };
      return { left: top('left', left), right: top('right', right) };
    },
    [left, right] as const,
  );
}

/** Puts every pane's scrolling back at its top, and waits for the two to be level. */
async function expectLevel(page: Page, left: Probe, right: Probe) {
  await expect
    .poll(
      async () => {
        await page.evaluate(() => {
          for (const el of document.querySelectorAll(
            '.cm-scroller, .script-host, .preview, .panel, .tree',
          )) {
            el.scrollTop = 0;
          }
        });
        const { left: a, right: b } = await tops(page, left, right);
        return a === null || b === null ? null : Math.round(Math.abs(a - b) * 10) / 10;
      },
      { timeout: 10_000 },
    )
    .toBeLessThanOrEqual(LEVEL);
}

/** Scroll sync is turned off, so neither pane moves the other while the tops are read. */
async function stopSync(page: Page) {
  const sync = page.getByRole('button', { name: 'Sync scrolling', exact: true });
  await sync.click();
  await expect(sync).toHaveAttribute('aria-pressed', 'false');
}

test.describe('side by side', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name.startsWith('phone'), 'a phone shows one pane');
    await page.setViewportSize({ width: 1600, height: 900 });
    await start(page);
    await expect(page.locator('[data-pane="right"] .drafter-page').first()).toBeVisible();
    await stopSync(page);
  });

  test('a screenplay: the Source and the Script, either way round', async ({ page }) => {
    await expectLevel(page, 'source', 'page');
    // The Script on the left, the Source on the right.
    await page.locator('#tab-left-script').click();
    await expect(page.locator('[data-pane="right"] .cm-line').first()).toBeVisible();
    await expectLevel(page, 'page', 'source');
  });

  test('a Markdown document: the Source and the Preview', async ({ page }) => {
    await runCommand(page, 'Open sample: Markdown');
    await page.locator('#tab-right-script').click();
    await expect(page.locator('[data-pane="right"] .preview .body h1').first()).toBeVisible();
    await expectLevel(page, 'source', 'preview');
  });

  test('with the element bar hidden', async ({ page }) => {
    await page.getByRole('button', { name: 'Element bar options' }).click();
    await page.getByRole('menuitem', { name: 'Hide the element bar' }).click();
    await expect(page.getByRole('toolbar', { name: 'Element bar' })).toHaveCount(0);
    await expect.poll(async () => (await stored(page)).elementBar).toBe(false);
    await expectLevel(page, 'source', 'page');
    await page.locator('#tab-right-outline').click();
    await expectLevel(page, 'source', 'outline');
  });

  test('the Outline on the right scrolls by the keys from its panel', async ({ page }) => {
    let text = 'Title: Long\n\n';
    for (let i = 1; i <= 80; i++) text += `INT. ROOM ${i} - DAY\n\nShe waits.\n\n`;
    await setText(page, text);
    await page.locator('#tab-right-outline').click();
    await expect(page.locator('[data-pane="right"] [role="treeitem"]').nth(79)).toBeAttached();
    const tree = page.locator('[data-pane="right"] .tree');
    // F6 from the Source puts focus on the other pane's panel.
    await page.locator('.cm-content').click();
    await page.keyboard.press('F6');
    await expect(page.locator('#panel-outline')).toBeFocused();
    await page.keyboard.press('PageDown');
    await expect.poll(() => tree.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
    await page.keyboard.press('End');
    await expect
      .poll(() => tree.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
      .toBeLessThan(2);
    await page.keyboard.press('Home');
    await expect.poll(() => tree.evaluate((el) => el.scrollTop)).toBe(0);
  });

  test('the Outline on the right: its first row', async ({ page }) => {
    await page.locator('#tab-right-outline').click();
    await expect(page.locator('[data-pane="right"] [role="treeitem"]').first()).toBeVisible();
    await expectLevel(page, 'source', 'outline');
  });
});

// A first visit opens the sample screenplay, title page first: the Source's first line sits at the
// top of its pane, under the editor's own padding, with no room above it for the title page the
// Script draws lower on its page; at the top, the Script shows its first page from the top.
test.describe('a first visit', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the Source starts at its top, and the Script at its first page', async ({ page }) => {
    test.skip(test.info().project.name.startsWith('phone'), 'a phone opens on the Script');
    await page.goto('/');
    await page.getByRole('button', { name: /No thanks/ }).click();
    await expect(page.locator('.cm-line').first()).toContainText('Title: The Call');
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+Home');
    // The first line is at most the editor's 12px of padding below the top of the pane (CodeMirror
    // may leave the pane scrolled a few pixels into that padding), never a band lower.
    const below = () =>
      page.evaluate(() => {
        const scroller = document.querySelector('.cm-scroller') as HTMLElement;
        const line = document.querySelector('.cm-line') as HTMLElement;
        return Math.round(line.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
      });
    await expect.poll(below).toBeLessThanOrEqual(16);
    expect(await below()).toBeGreaterThanOrEqual(0);
    const script = page.locator('.script-host');
    if (await script.isVisible()) {
      await expect.poll(() => script.evaluate((el) => el.scrollTop)).toBe(0);
    }
  });
});
