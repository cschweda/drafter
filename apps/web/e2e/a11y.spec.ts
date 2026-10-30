import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { removePickers } from './fs-stub';
import {
  chooseTab,
  closeSettings,
  consentDialog,
  editor,
  fixtureSwitch,
  openSettings,
  palette,
  paletteInput,
  setText,
  settingsDialog,
  showSource,
  start,
} from './modules';

// The accessibility suite (Phase 1 design §1 item 5, §16; Plan 5 Task 9): axe on every major state,
// in both themes, in every project (so at desktop and at phone width), and the accessibility tree a
// screen reader reads: the landmarks, the Script region's headings, the controls' labels, and what
// the live regions say. The states other specs already check with axe (the palette, the Scripts
// menu, the drop zone, the changed-file bar, the recovery warnings, the tabs' guard, a save) stay
// there; this file has the rest. The keyboard-only journey is keyboard.spec.ts.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`);
}

/**
 * Expects axe to find nothing, naming the state in the failure. A fade that is still running (focus
 * mode's, a dialog's) is waited out first: axe measures the colors on the screen, and halfway through
 * a fade they are the fade's, not the state's.
 */
async function clean(page: Page, state: string) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  expect(await violations(page), state).toEqual([]);
}

type Theme = 'dark' | 'light';
const THEMES: Theme[] = ['dark', 'light'];

/** Starts every page load in `theme`, the way a returning writer's choice does. */
async function useTheme(page: Page, theme: Theme) {
  await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
}

async function inTheme(page: Page, theme: Theme) {
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
}

const status = (page: Page) => page.locator('[data-tour="status"]');
const countsButton = (page: Page) => status(page).locator('.counts-button');
const countsPanel = (page: Page) => page.getByRole('dialog', { name: 'Counts' });
const mark = (page: Page) => page.getByRole('button', { name: 'Drafter menu' });
const appMenu = (page: Page) => page.getByRole('menu', { name: 'Drafter menu' });
const openButton = (page: Page) => page.getByRole('button', { name: 'Open', exact: true });
const scriptsMenu = (page: Page) => page.getByRole('group', { name: 'Scripts', exact: true });
const elementBar = (page: Page) => page.getByRole('toolbar', { name: 'Element bar' });
const problemsList = (page: Page) => page.getByRole('tabpanel', { name: /^Problems/ });
const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

/** Shows a tab ("Script", "Problems", "Preview") where it isn't already showing. */
async function showTab(page: Page, name: string) {
  const panel = page.getByRole('tabpanel', { name: new RegExp(`^${name}`) });
  if (!(await panel.isVisible())) {
    await page
      .getByRole('tab', { name: new RegExp(`^${name}`) })
      .first()
      .click();
  }
  await expect(panel).toBeVisible();
}

/** Runs a palette command by its title. */
async function command(page: Page, title: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeVisible();
  await paletteInput(page).fill(title);
  await palette(page).getByRole('option', { name: title, exact: true }).click();
  await expect(palette(page)).toBeHidden();
}

async function newFromMenu(page: Page, name: string) {
  await openButton(page).click();
  await scriptsMenu(page).getByRole('button', { name }).click();
  await expect(scriptsMenu(page)).toBeHidden();
}

/** Turns a module on in Settings (with its question, if it asks one) and closes Settings. */
async function turnOnModule(page: Page, name: string) {
  await openSettings(page);
  await settingsDialog(page).getByRole('switch', { name, exact: true }).click();
  await expect(settingsDialog(page).getByRole('switch', { name, exact: true })).toBeChecked();
  await closeSettings(page);
}

const PROBLEM = "INT. HALL - DAY\n\nANN\nHello.\n\nANN (CONT'D)\nStill here.\n";

for (const theme of THEMES) {
  test.describe(`every state in the ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await useTheme(page, theme);
      await start(page);
      await inTheme(page, theme);
    });

    test(`has no accessibility violations while editing a screenplay (${theme})`, async ({
      page,
    }) => {
      await showSource(page);
      await expect(elementBar(page)).toBeVisible();
      await clean(page, 'the sample, in the Source');
      await showTab(page, 'Script');
      await expect(page.locator('[data-page]').first()).toBeVisible();
      await clean(page, 'the sample, in the Script');
    });

    test(`has no accessibility violations while editing a stage play (${theme})`, async ({
      page,
    }) => {
      await newFromMenu(page, 'New stage play');
      await expect(status(page)).toContainText('Stage play');
      await setText(page, 'ACT ONE\n\n= SCENE ONE\n\nA bare stage.\n\n@ANN\nHello?\n');
      await clean(page, 'a stage play, in the Source');
      await showTab(page, 'Script');
      await clean(page, 'a stage play, in the Script');
    });

    test(`has no accessibility violations while editing Markdown (${theme})`, async ({ page }) => {
      await newFromMenu(page, 'New Markdown document');
      await expect(editor(page)).toContainText('# Untitled');
      await expect(page.getByRole('toolbar', { name: 'Markdown bar' })).toBeVisible();
      await setText(page, '# Notes\n\nSome *words* and a [link](https://example.com).\n\n- one\n');
      await clean(page, 'a Markdown document, in the Source');
      await showTab(page, 'Preview');
      await expect(page.getByRole('article', { name: 'Preview' })).toContainText('Some words');
      await clean(page, 'a Markdown document, in the Preview');
      // Its Export menu, with Export options… off and the reason under it.
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      await expect(
        page
          .getByRole('group', { name: 'Export' })
          .getByRole('button', { name: 'Export options…' }),
      ).toHaveAttribute('aria-disabled', 'true');
      await clean(page, 'a Markdown document’s Export menu');
    });

    test(`has no accessibility violations with the element bar's menus open (${theme})`, async ({
      page,
    }) => {
      await showSource(page);
      await elementBar(page).getByRole('button', { name: 'More elements' }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await clean(page, "the element bar's More menu");
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toBeHidden();
      await elementBar(page).getByRole('button', { name: 'Element bar options' }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await clean(page, "the element bar's options menu");
      await page.keyboard.press('Escape');
      // A button that does nothing says why, in the bar's toast.
      await setText(page, 'MARGARET\n');
      await elementBar(page).getByRole('button', { name: 'Dialogue', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'already dialogue' })).toBeVisible();
      await clean(page, "the element bar's notice");
    });

    test(`has no accessibility violations with Problems showing (${theme})`, async ({ page }) => {
      await setText(page, PROBLEM);
      await showTab(page, 'Problems');
      await expect(
        problemsList(page).getByRole('button', { name: "Remove (CONT'D)" }),
      ).toBeVisible();
      await clean(page, 'the Problems list');
    });

    test(`has no accessibility violations in focus mode, with typewriter scrolling and a sprint (${theme})`, async ({
      page,
    }) => {
      // Typewriter scrolling, from Settings.
      await openSettings(page);
      await settingsDialog(page).getByRole('switch', { name: 'Typewriter scrolling' }).check();
      await closeSettings(page);
      await showSource(page);
      await clean(page, 'typewriter scrolling');

      // A sprint, from the Counts panel.
      await countsButton(page).click();
      await expect(countsPanel(page)).toBeVisible();
      await clean(page, 'the Counts panel');
      await countsPanel(page).getByRole('button', { name: '15 minutes', exact: true }).click();
      await expect(countsPanel(page)).toBeHidden();
      await expect(status(page).locator('[data-sprint]')).toBeVisible();
      await clean(page, 'a sprint in the status bar');

      // Focus mode, with the sprint in its marker.
      await page.getByRole('button', { name: 'Focus', exact: true }).click();
      await expect(page.getByRole('group', { name: 'Focus mode' })).toBeVisible();
      await clean(page, 'focus mode');
    });

    test(`has no accessibility violations in the Stats window (${theme})`, async ({ page }) => {
      await countsButton(page).click();
      await countsPanel(page).getByRole('button', { name: 'Stats…' }).click();
      const stats = page.getByRole('dialog', { name: 'Stats' });
      await expect(stats).toBeVisible();
      await expect(stats.getByRole('table', { name: 'Characters' })).toBeVisible();
      await clean(page, 'the Stats window');
    });

    test(`has no accessibility violations in the Export options dialog (${theme})`, async ({
      page,
    }) => {
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      await page
        .getByRole('group', { name: 'Export' })
        .getByRole('button', { name: 'Export options…' })
        .click();
      const options = page.getByRole('dialog', { name: 'Export options' });
      await expect(options).toBeVisible();
      await expect(options.getByRole('group', { name: 'Title page' })).toBeVisible();
      await clean(page, 'the Export options dialog');
    });

    test(`has no accessibility violations in Settings and its modules (${theme})`, async ({
      page,
    }) => {
      await openSettings(page);
      await expect(settingsDialog(page).getByRole('region', { name: 'Modules' })).toBeVisible();
      await clean(page, 'Settings');
      await fixtureSwitch(page).click();
      await expect(consentDialog(page)).toBeVisible();
      await clean(page, "a module's question about the network");
      await consentDialog(page).getByRole('button', { name: 'Turn on' }).click();
      await expect(fixtureSwitch(page)).toBeChecked();
      await clean(page, 'Settings with a module on');
      await closeSettings(page);
      // The module's button, and its tab.
      await page.getByRole('button', { name: 'Count scenes' }).click();
      await chooseTab(page, 'Fixture');
      await expect(page.getByRole('tabpanel', { name: 'Fixture' })).toBeVisible();
      await clean(page, "a module's button and tab");
    });

    test(`has no accessibility violations with a sample module's question open (${theme})`, async ({
      page,
    }) => {
      await setText(page, 'INT. HALL - DAY\n\nRain. [[check the rain]]\n');
      await turnOnModule(page, 'Notes');
      const question = page.getByRole('dialog', { name: 'Notes', exact: true });
      await expect(async () => {
        if (await palette(page).isVisible()) await page.keyboard.press('Escape');
        await command(page, 'Notes: remove all notes').catch(() => {});
        await expect(question).toBeVisible({ timeout: 2000 });
      }).toPass();
      await clean(page, "the Notes module's question");
    });

    test(`has no accessibility violations with each menu open (${theme})`, async ({ page }) => {
      await mark(page).click();
      await expect(appMenu(page)).toBeVisible();
      await clean(page, 'the app menu');
      await page.keyboard.press('Escape');
      await expect(appMenu(page)).toBeHidden();

      await page.getByRole('button', { name: 'Export', exact: true }).click();
      await expect(page.getByRole('group', { name: 'Export' })).toBeVisible();
      await clean(page, 'the Export menu');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('group', { name: 'Export' })).toBeHidden();

      if (wide(page)) {
        // The template chip, which a phone has in the app menu instead.
        await page.getByRole('button', { name: /^Template:/ }).click();
        await expect(page.getByRole('menu')).toBeVisible();
        await clean(page, 'the template menu');
        await page.keyboard.press('Escape');
        await expect(page.getByRole('menu')).toBeHidden();
      }

      const more = page
        .getByRole('region', { name: 'Sample' })
        .getByRole('button', { name: 'More' });
      if (await more.isVisible()) {
        await more.click();
        await expect(page.getByRole('menu')).toBeVisible();
        await clean(page, "the sample bar's More menu");
        await page.keyboard.press('Escape');
      }
    });

    test(`has no accessibility violations with each question open (${theme})`, async ({ page }) => {
      // Making a screenplay a Markdown document asks first.
      await newFromMenu(page, 'New screenplay');
      await page.keyboard.press('ControlOrMeta+k');
      await paletteInput(page).fill('Document: Markdown (plain text)');
      await palette(page)
        .getByRole('option', { name: 'Document: Markdown (plain text)', exact: true })
        .click();
      const toMarkdown = page.getByRole('dialog', { name: 'Make this a Markdown document?' });
      await expect(toMarkdown).toBeVisible();
      await clean(page, 'the question before Markdown');
      await toMarkdown.getByRole('button', { name: 'Cancel' }).click();
      await expect(toMarkdown).toBeHidden();

      // Removing a script from this browser asks first.
      await openButton(page).click();
      await scriptsMenu(page)
        .locator('li', { hasText: 'Untitled Screenplay' })
        .getByRole('button', { name: 'Remove from this browser' })
        .click();
      const remove = page.getByRole('dialog', { name: /Remove “Untitled Screenplay”/ });
      await expect(remove).toBeVisible();
      await clean(page, 'the question before removing');
    });
  });

  test.describe(`the first visit and the tour in the ${theme} theme`, () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test(`has no accessibility violations on the first visit and each tour step (${theme})`, async ({
      page,
    }) => {
      await useTheme(page, theme);
      await page.goto('/');
      const welcome = page.getByRole('alertdialog', { name: 'Welcome to Drafter' });
      await expect(welcome).toBeVisible();
      await inTheme(page, theme);
      await clean(page, 'the welcome');
      await welcome.getByRole('button', { name: 'Take the tour' }).focus();
      await page.keyboard.press('Enter');
      const intro = page.getByRole('dialog', { name: 'Fountain in 30 seconds' });
      await expect(intro).toBeVisible();
      await clean(page, 'Fountain in 30 seconds');
      await page.keyboard.press('Enter');
      const step = page.locator('.tour-dialog');
      await expect(step).toBeVisible();
      // The intro card fades out over the first step; it is measured once it has gone.
      await expect(intro).toBeHidden();
      for (let index = 1; index <= 10; index++) {
        await expect(step).toContainText(`${index} / 10`);
        // The step's own fade has settled before it is measured.
        await expect(step).toHaveCSS('opacity', '1');
        await clean(page, `tour step ${index}`);
        await page.keyboard.press('ArrowRight');
      }
      await expect(step).toBeHidden();
      await clean(page, 'the first visit, after the tour');
    });
  });

  test.describe(`the help pages in the ${theme} theme`, () => {
    for (const path of [
      '/docs/',
      '/docs/fountain/',
      '/docs/saving/',
      '/docs/privacy/',
      '/docs/shortcuts/',
      '/docs/technical/',
    ]) {
      test(`has no accessibility violations on ${path} (${theme})`, async ({ page }) => {
        await useTheme(page, theme);
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await inTheme(page, theme);
        await clean(page, path);
      });
    }
  });
}

// What a screen reader reads, in the dark theme alone (the tree is the same in both).
test.describe('the accessibility tree', () => {
  test.beforeEach(async ({ page }) => {
    await start(page);
  });

  test('has one banner, one main, and one contentinfo', async ({ page }) => {
    await expect(page.getByRole('banner')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('contentinfo')).toHaveCount(1);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
  });

  test("gives the Script region its scenes' headings", async ({ page }) => {
    await showTab(page, 'Script');
    await expect(page.getByRole('region', { name: 'Script' })).toMatchAriaSnapshot(`
      - region "Script":
        - heading "INT. KITCHEN - NIGHT" [level=2]
        - heading "EXT. BACK PORCH - LATER" [level=2]
    `);
  });

  test('labels every control', async ({ page }) => {
    const unlabelled: string[] = [];
    const checked: Record<string, number> = {};
    /** Checks every visible control in `scope`, once it shows; each state must have some. */
    const check = async (where: string, scope: Locator) => {
      await expect(scope).toBeVisible();
      checked[where] = 0;
      for (const role of [
        'button',
        'link',
        'textbox',
        'switch',
        'checkbox',
        'combobox',
        'tab',
        'menuitem',
        'menuitemcheckbox',
        'menuitemradio',
        'option',
        'spinbutton',
        'slider',
      ] as const) {
        for (const control of await scope.getByRole(role).all()) {
          if (!(await control.isVisible())) continue;
          checked[where]++;
          const name = await control.evaluate(
            (el) => el.getAttribute('aria-label') ?? el.textContent ?? '',
          );
          try {
            await expect(control).toHaveAccessibleName(/\S/, { timeout: 100 });
          } catch {
            unlabelled.push(`${where}: ${role} ${JSON.stringify(name)}`);
          }
        }
      }
    };
    await showSource(page);
    await check('the page', page.locator('body'));
    await openSettings(page);
    await check('Settings', settingsDialog(page));
    await closeSettings(page);
    await countsButton(page).click();
    await check('the Counts panel', countsPanel(page));
    await page.keyboard.press('Escape');
    await expect(countsPanel(page)).toBeHidden();
    await mark(page).click();
    await check('the app menu', appMenu(page));
    await page.keyboard.press('Escape');
    await expect(appMenu(page)).toHaveCount(0);
    await openButton(page).click();
    await check('the Scripts menu', scriptsMenu(page));
    await page.keyboard.press('Escape');
    await expect(scriptsMenu(page)).toBeHidden();
    await page.keyboard.press('ControlOrMeta+k');
    await check('the palette', palette(page));
    expect(unlabelled).toEqual([]);
    for (const [where, count] of Object.entries(checked)) {
      expect(count, `controls checked in ${where}`).toBeGreaterThan(0);
    }
    expect(Object.keys(checked)).toHaveLength(6);
  });

  test('names the toolbar’s controls', async ({ page }) => {
    test.skip(!wide(page), 'a phone folds some of these into the app menu');
    await expect(page.getByRole('banner')).toMatchAriaSnapshot(`
      - banner:
        - heading "Drafter" [level=1]
        - button "Drafter menu"
        - button "Open"
        - button "Save"
        - button "Export"
        - button "Focus"
        - 'button "Template: Screenplay"'
        - button /^Go to scene or command/
        - button "Switch to light theme"
    `);
  });

  test('says which element the cursor is in', async ({ page }) => {
    await setText(page, 'INT. HALL - DAY\n\nShe waits.');
    const announcer = page.locator('[aria-live="polite"][aria-atomic="true"]').filter({
      hasText: /\S/,
    });
    await expect(announcer).toHaveText('Action');
    await page.keyboard.press('ControlOrMeta+Home');
    await expect(announcer).toHaveText('Scene heading');
  });

  test('says why an element button did nothing', async ({ page }) => {
    await setText(page, 'MARGARET\n');
    await elementBar(page).getByRole('button', { name: 'Dialogue', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'already dialogue' })).toContainText(
      'type what they say here',
    );
  });

  test('announces a save in the status bar', async ({ page }) => {
    // With no file picker, a save downloads, so nothing waits on a dialog.
    await removePickers(page);
    await page.reload();
    await expect(editor(page)).toBeAttached();
    await newFromMenu(page, 'New screenplay');
    // The announcement is there for a moment, so what the region says is recorded as it changes.
    await page.evaluate(() => {
      const w = window as unknown as { heard: string[] };
      w.heard = [];
      const region = document.querySelector('[data-tour="status"] > [role="status"]');
      new MutationObserver(() => {
        if (region?.textContent) w.heard.push(region.textContent);
      }).observe(region as Node, { childList: true, characterData: true, subtree: true });
    });
    await page.keyboard.insertText('ONE');
    await page.keyboard.press('ControlOrMeta+s');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { heard: string[] }).heard))
      .toContain('Saved');
  });

  test('says what a sprint added when it ends', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-26T10:00:00') });
    await page.reload();
    await expect(editor(page)).toBeAttached();
    await countsButton(page).click();
    await countsPanel(page).getByRole('button', { name: '15 minutes', exact: true }).click();
    await expect(countsPanel(page)).toBeHidden();
    await page.clock.runFor(15 * 60_000 + 1000);
    await expect(page.locator('[data-sprint-notice]').getByRole('status')).toHaveText(/\S/);
  });
});

test.describe('the tour cards and the help pages', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('darkens the light card’s button on hover, so its text keeps 4.5:1', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'a phone has no hover');
    await useTheme(page, 'light');
    await page.goto('/');
    const welcome = page.getByRole('alertdialog', { name: 'Welcome to Drafter' });
    const start = welcome.getByRole('button', { name: 'Take the tour' });
    await expect(start).toBeVisible();
    await start.hover();
    // tour.css's --tour-primary-hover for the light theme, #6b4500.
    await expect(start).toHaveCSS('background-color', 'rgb(107, 69, 0)');
  });

  test('scrolls the intro’s text in its own box on a wide screen, and the whole card on a phone', async ({
    page,
  }) => {
    await page.goto('/');
    const welcome = page.getByRole('alertdialog', { name: 'Welcome to Drafter' });
    await welcome.getByRole('button', { name: 'Take the tour' }).focus();
    await page.keyboard.press('Enter');
    const text = page.locator('#intro-description');
    await expect(text).toBeVisible();
    const phone = (page.viewportSize()?.width ?? 0) <= 640;
    await expect(text).toHaveCSS('overflow-y', phone ? 'visible' : 'auto');
    if (phone) await expect(text).toHaveCSS('max-height', 'none');
    else await expect(text).not.toHaveCSS('max-height', 'none');
  });

  test('gives each cheat-sheet example a group with its name', async ({ page }) => {
    await page.goto('/docs/fountain/');
    const examples = page.locator('pre');
    const count = await examples.count();
    expect(count).toBeGreaterThan(0);
    await expect(page.getByRole('group', { name: /example$/ })).toHaveCount(count);
  });
});
