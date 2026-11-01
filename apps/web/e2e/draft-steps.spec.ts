import { createHash } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { palette, runCommand, setText, showSource, start, wholeText } from './modules';

// Draft by draft (drafts-and-cuts design §2.4): the drafts in order, Draft 01 → 02 → … → now, each
// step with its marker and what changed in numbers; a step opens in Compare's Changes view with
// Previous step and Next step, and the cuts made while writing it listed beside it, linking to
// Cuts grouped by draft; and axe in both themes.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const startDialog = (page: Page) => page.getByRole('dialog', { name: 'Start new draft' });
const history = (page: Page) => page.getByRole('dialog', { name: 'History' });
const options = (page: Page) =>
  history(page).getByRole('listbox', { name: 'Snapshots' }).getByRole('option');
const drafts = (page: Page) => page.locator('#panel-drafts');
const steps = (page: Page) => page.locator('#panel-draft-steps');
const stepItem = (page: Page, from: number) => steps(page).locator(`[data-step="${from}"]`);
const compare = (page: Page) => page.locator('#panel-compare');
const comparePane = (page: Page) => page.locator('[data-pane]', { has: compare(page) });
const cutsPanel = (page: Page) => page.locator('#panel-cuts');
const announcer = (page: Page) => page.locator('.outline-announcer');

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const short = (text: string) => sha(text).slice(0, 7);

const HALL =
  'INT. HALL - DAY\n\nMarra waits by the door, turning the brass key over in her hands while the clock ticks.\n';
const HALL_LONGER =
  'INT. HALL - DAY\n\nMarra waits by the door, turning the brass key over in her hands while the clock ticks.\n\nShe sighs.\n';
const CELLAR =
  'INT. CELLAR - NIGHT\n\nA lamp swings from a hook and the shelves of jars tilt with it, one by one.\n';
const YARD =
  'EXT. COAL YARD - DAWN\n\nTwo carts wait under a tarpaulin, their wheels chocked against the frost.\n';
const ROOF =
  'EXT. ROOF - NIGHT\n\nWind drags the washing lines across the wet slates and the gutters overflow.\n';
const script = (...scenes: string[]) => `Title: The Weir\n\n${scenes.join('\n')}`;

const ONE = script(HALL, CELLAR, YARD);
const TWO = script(HALL_LONGER, YARD, ROOF);
const NOW = script(HALL_LONGER, ROOF);

/** A palette command, run again if Firefox lets an Enter go by (DEFERRED, as in drafts.spec). */
async function command(page: Page, title: string) {
  await expect(async () => {
    if (await palette(page).isVisible()) {
      await page.keyboard.press('Escape');
      await expect(palette(page)).toBeHidden({ timeout: 1000 });
    }
    await runCommand(page, title);
  }).toPass({ timeout: 15_000 });
}

async function takeSnapshot(page: Page) {
  await command(page, 'Take snapshot…');
  await expect(history(page).getByRole('textbox', { name: 'Label' })).toBeFocused();
  const before = await options(page).count();
  await page.keyboard.press('Enter');
  await expect(options(page)).toHaveCount(before + 1);
  await history(page).getByRole('button', { name: 'Close' }).click();
  await expect(history(page)).toBeHidden();
}

async function startDraft(page: Page, note = '') {
  await command(page, 'Start new draft…');
  await expect(startDialog(page)).toBeVisible();
  await expect(startDialog(page).getByRole('textbox', { name: /^Note for Draft/ })).toBeFocused();
  if (note) await page.keyboard.insertText(note);
  await page.keyboard.press('Enter');
  await expect(startDialog(page)).toBeHidden();
}

async function write(page: Page, text: string) {
  await setText(page, text);
  await expect.poll(() => wholeText(page)).toBe(text);
}

/**
 * Draft 01 (three scenes), then Draft 02 (the cellar cut, the hall grown, the roof added), kept
 * with a snapshot between so the cellar is in Cuts as cut while writing Draft 02; and now the yard
 * cut too.
 */
async function twoDrafts(page: Page) {
  await start(page);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
  await expect(scriptsMenu(page)).toBeHidden();
  await showSource(page);
  await write(page, ONE);
  await takeSnapshot(page);
  await startDraft(page, 'first pass');
  await write(page, TWO);
  await takeSnapshot(page);
  await startDraft(page, 'for Sam');
  await write(page, NOW);
}

async function openSteps(page: Page) {
  if (await steps(page).isVisible()) return;
  await command(page, 'Draft by draft…');
  await expect(steps(page)).toBeVisible();
}

test.describe('Draft by draft', () => {
  test('Draft by draft lists each step with its marker and numbers', async ({ page }) => {
    await twoDrafts(page);
    // From the Drafts list's header.
    await command(page, 'Drafts…');
    await expect(drafts(page)).toBeVisible();
    await drafts(page).getByRole('button', { name: 'Draft by draft' }).click();
    await expect(steps(page)).toBeVisible();
    // Drawn "Draft 01 → Draft 02", named "Draft 01 to Draft 02".
    await expect(steps(page).getByRole('listitem')).toHaveText([
      /^Draft 01 →\s*to Draft 02/,
      /^Draft 02 →\s*to now/,
    ]);
    await expect(
      steps(page).getByRole('listitem', { name: 'Draft 01 to Draft 02', exact: true }),
    ).toBeVisible();
    const first = stepItem(page, 1);
    await expect(first).toContainText(`Draft 02 begins — builds on Draft 01 (${short(ONE)})`);
    await expect(first).toContainText('for Sam');
    await expect(first.locator('.numbers')).toHaveText(
      /^[+−]\d+ words · 1 scene added · 1 scene cut · 1 changed · \d+% new$/,
    );
    const last = stepItem(page, 2);
    await expect(last).toContainText(`Draft 03 begins — builds on Draft 02 (${short(TWO)})`);
    await expect(last).toContainText('Draft 03, being written now');
    await expect(last.locator('.numbers')).toHaveText(
      /^−\d+ words · 0 scenes added · 1 scene cut · 0 changed · 0% new$/,
    );
    // Its name, for the Open button.
    await expect(
      first.getByRole('button', { name: 'Open the step from Draft 01 to Draft 02' }),
    ).toBeVisible();
  });

  test('opening a step shows its changes and Next step walks on', async ({ page, browserName }) => {
    await twoDrafts(page);
    await openSteps(page);
    await stepItem(page, 1)
      .getByRole('button', { name: /^Open the step/ })
      .click();
    await expect(compare(page)).toBeVisible();
    await expect(comparePane(page)).toContainText(
      `Comparing Draft 01 · ${short(ONE)} with Draft 02 · ${short(TWO)}`,
    );
    // The Changes view, grouped by scene: the cellar went, the roof came.
    await expect(compare(page)).toContainText('INT. CELLAR - NIGHT');
    await expect(compare(page)).toContainText('EXT. ROOF - NIGHT');
    // The step's own bar, in the pane: the step, its numbers, Previous step and Next step.
    const bar = compare(page).getByRole('group', { name: 'Draft 01 to Draft 02' });
    await expect(bar).toContainText('1 scene added · 1 scene cut · 1 changed');
    await expect(bar.getByRole('button', { name: 'Previous step' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    const next = compare(page).getByRole('button', { name: 'Next step' });
    await next.click();
    await expect(comparePane(page)).toContainText(
      new RegExp(`Comparing Draft 02 · ${short(TWO)} with now \\(.+\\)`),
    );
    await expect(announcer(page)).toContainText('Draft 02 to now:');
    await expect(compare(page).getByRole('group', { name: 'Draft 02 to now' })).toBeVisible();
    // Focus stays on Next step (Safari doesn't focus a button on a click), now the last.
    if (browserName !== 'webkit') await expect(next).toBeFocused();
    await expect(next).toHaveAttribute('aria-disabled', 'true');
    // At the last step, Next step says so and stays (Playwright won't click an aria-disabled one).
    await next.dispatchEvent('click');
    await expect(announcer(page)).toContainText('This is the last step');
    await compare(page).getByRole('button', { name: 'Previous step' }).click();
    await expect(comparePane(page)).toContainText(
      `Comparing Draft 01 · ${short(ONE)} with Draft 02 · ${short(TWO)}`,
    );
  });

  test('a step lists the cuts made while writing it', async ({ page, isMobile }) => {
    await twoDrafts(page);
    await openSteps(page);
    await stepItem(page, 1)
      .getByRole('button', { name: /^Open the step/ })
      .click();
    await expect(compare(page)).toBeVisible();
    const beside = compare(page).locator('.step-cuts');
    // On a phone the list is folded, as the Changes list is.
    if (isMobile) await beside.locator('summary').click();
    await expect(beside).toContainText('Cut while writing Draft 02 (1)');
    await expect(beside.locator('.cut')).toHaveText([/^INT. CELLAR - NIGHT\s*Whole scene$/]);
    // Show in Cuts: the list, grouped by draft, on Draft 02's.
    await beside.getByRole('button', { name: 'Show in Cuts' }).click();
    await expect(cutsPanel(page)).toBeVisible();
    await expect(cutsPanel(page).getByRole('searchbox', { name: 'Filter' })).toHaveValue(
      'Draft 02',
    );
    await expect(cutsPanel(page).getByRole('button', { name: 'Group by draft' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(cutsPanel(page).locator('.group-title .group-name')).toHaveText([
      `Draft 02 (${short(TWO)})`,
    ]);
  });

  test('a script with no drafts has no steps yet', async ({ page }) => {
    await start(page);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await scriptsMenu(page).getByRole('button', { name: 'New screenplay' }).click();
    await expect(scriptsMenu(page)).toBeHidden();
    await openSteps(page);
    await expect(steps(page)).toContainText('No drafts yet.');
    // The palette closes it again.
    await command(page, 'Close Draft by draft');
    await expect(steps(page)).toBeHidden();
  });
});

test.describe("Draft by draft's accessibility", () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`has no accessibility violations (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
      await twoDrafts(page);
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
      await openSteps(page);
      await expect(steps(page).locator('li.item')).toHaveCount(2);
      const scan = async () => {
        const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
        expect(
          violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`),
        ).toEqual([]);
      };
      await scan();
      // A step open in Compare, with its cuts beside it.
      await stepItem(page, 1)
        .getByRole('button', { name: /^Open the step/ })
        .click();
      await expect(compare(page).locator('.step-cuts')).toBeVisible();
      await scan();
    });
  }
});
