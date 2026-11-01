import { expect, type Page, test } from '@playwright/test';
import { pressToolbarButton } from './modules';

// The welcome dialog and the guided tour (Phase 1 design §4.4). playwright.config.ts marks the tour
// as seen for every other test; these start with an empty storage, so each is a true first visit.
// The accessibility check of each step is in a11y.spec.ts.
test.use({ storageState: { cookies: [], origins: [] } });

const welcome = (page: Page) => page.getByRole('alertdialog', { name: 'Welcome to Drafter' });
const intro = (page: Page) => page.getByRole('dialog', { name: 'Fountain in 30 seconds' });
const step = (page: Page) => page.locator('.tour-dialog');
const lit = (page: Page) => page.locator('[data-tour-active="true"]');
const announcer = (page: Page) => page.locator('#nuxt-guided-tour-announcer');
const mark = (page: Page) => page.getByRole('button', { name: 'Drafter menu' });
// Help is its own menu in the top bar (fresh-look Task 3b).
const helpButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Help' });
const helpMenu = (page: Page) => page.getByRole('menu', { name: 'Help' });
const editor = (page: Page) => page.locator('.cm-content');
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });

const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

/** From 640px up there is a status bar (fresh-look Task 6). */
const statusBar = (page: Page) => (page.viewportSize()?.width ?? 0) >= 640;

/**
 * Each step's title and the `data-tour` value of what it lights, with a status bar and without one
 * (below 640px the status step lights the title, whose red dot says there are unsaved changes).
 */
function plan(bar: boolean) {
  return [
    ['You write here', 'source'],
    ['The real pages', 'script'],
    ['Names and places come up', 'source'],
    ['Problems', 'problems'],
    // The template is chosen in the Drafter menu on every screen (fresh look, design §10).
    ['Screenplay or stage play', 'menu'],
    ['Save', 'save'],
    bar ? ['The status bar', 'status'] : ['Saved or not', 'title'],
    ['Export, and open almost anything', 'export'],
    ['Focus', 'focus'],
    ['Go anywhere', 'palette'],
  ] as const;
}

/**
 * What a step lights: its target, or More actions when a full top bar below 1024px has folded the
 * target's button into it (Task 9; the title keeps a few letters, so a phone folds Focus).
 */
async function litTarget(page: Page, target: string) {
  if (!['save', 'export', 'focus'].includes(target)) return target;
  const button = page.locator(`header.toolbar [data-tour="${target}"]`);
  return (await button.isVisible()) ? target : 'toolbar-more';
}

async function visit(page: Page) {
  // A first visit follows the system's appearance (fresh-look design §9), and Firefox here ignores
  // the config's dark colorScheme, so the theme is stored: Drafter's default, dark. The tour still
  // sees a first visit, as it asks only whether there are scripts and whether it has been seen.
  await page.addInitScript(() => {
    if (!localStorage.getItem('nuxt-color-mode')) localStorage.setItem('nuxt-color-mode', 'dark');
  });
  await page.goto('/');
  await expect(welcome(page)).toBeVisible();
}

/** Takes the tour from the welcome with the keyboard, to the first step. */
async function startTour(page: Page) {
  await welcome(page).getByRole('button', { name: 'Take the tour' }).focus();
  await page.keyboard.press('Enter');
  await expect(intro(page)).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(step(page)).toBeVisible();
}

/** A returning visit: the tour was skipped, so it is asked for from the menu. */
async function skipWelcome(page: Page) {
  await visit(page);
  await welcome(page).getByRole('button', { name: "No thanks, I'll look around." }).click();
  await expect(welcome(page)).toBeHidden();
}

async function takeTourFromHelp(page: Page) {
  await helpButton(page).click();
  await helpMenu(page).getByRole('menuitem', { name: 'Take the tour' }).click();
  await expect(intro(page)).toBeVisible();
}

test.describe('the welcome and the tour', () => {
  test('the welcome marks the name and says what Drafter promises', async ({ page }) => {
    await page.goto('/');
    await expect(welcome(page)).toBeVisible();
    await expect(welcome(page).getByRole('heading')).toHaveText('Welcome to Drafter™');
    await expect(welcome(page)).toContainText(
      'Free, with no catch, and no login, ever. Private (no cookies, no tracking), it works offline, and Final Draft files go in and out.',
    );
  });

  test('welcomes a first visit and takes the tour with the keyboard', async ({ page }) => {
    await visit(page);
    await expect(
      welcome(page).getByRole('button', {
        name: "No thanks, I'll look around.",
      }),
    ).toBeVisible();
    await startTour(page);

    const steps = plan(statusBar(page));
    for (const [index, [title, target]] of steps.entries()) {
      await expect(step(page)).toContainText(`${index + 1} / 10`);
      await expect(step(page).getByRole('heading', { name: title })).toBeVisible();
      // The step's target, and only it, is lit, and it is on the screen.
      await expect(lit(page)).toHaveCount(1);
      await expect(lit(page)).toHaveAttribute('data-tour', await litTarget(page, target));
      await expect(lit(page)).toBeVisible();
      if (index < steps.length - 1) await page.keyboard.press('ArrowRight');
    }
    // The last step's Next is Finish; ArrowRight finishes it.
    await page.keyboard.press('ArrowRight');
    await expect(step(page)).toBeHidden();
    await expect(lit(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('drafter-tour-v1'))).toBe('true');
  });

  test('goes back a step with ArrowLeft, and leaves with Escape', async ({ page }) => {
    await visit(page);
    await startTour(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(step(page)).toContainText('3 / 10');
    await page.keyboard.press('ArrowLeft');
    await expect(step(page)).toContainText('2 / 10');
    await page.keyboard.press('Escape');
    await expect(step(page)).toBeHidden();
    await expect(lit(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('drafter-tour-v1'))).toBe('true');
  });

  test('skips the tour from the welcome, and never shows it again', async ({ page }) => {
    await skipWelcome(page);
    expect(await page.evaluate(() => localStorage.getItem('drafter-tour-v1'))).toBe('true');
    await expect(step(page)).toBeHidden();

    // A returning visit: the editor is back from its recovery copy, with no dialog.
    await page.reload();
    await expect(editor(page)).toBeAttached();
    await expect(mark(page)).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(welcome(page)).toBeHidden();
    await expect(intro(page)).toBeHidden();
    await expect(step(page)).toBeHidden();
  });

  test('skips from the welcome with Escape', async ({ page }) => {
    await visit(page);
    await page.keyboard.press('Escape');
    await expect(welcome(page)).toBeHidden();
    await page.reload();
    await expect(mark(page)).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(welcome(page)).toBeHidden();
  });

  test('shows the intro card’s five examples and skips from it, with Enter on Skip', async ({
    page,
  }) => {
    await visit(page);
    await welcome(page).getByRole('button', { name: 'Take the tour' }).click();
    await expect(intro(page)).toBeVisible();
    for (const example of ['INT. KITCHEN - NIGHT', '(quietly)', 'CUT TO:', '[[a note]]']) {
      await expect(intro(page).getByText(example, { exact: true })).toBeVisible();
    }
    await expect(intro(page).getByText('Where were you?')).toBeVisible();
    // Enter on the Skip button skips; it is not "next" because it is pressed anywhere.
    await intro(page).getByRole('button', { name: 'Skip tour' }).focus();
    await page.keyboard.press('Enter');
    await expect(intro(page)).toBeHidden();
    await expect(step(page)).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('drafter-tour-v1'))).toBe('true');
  });

  test('replays the tour from Help', async ({ page }) => {
    await skipWelcome(page);
    await takeTourFromHelp(page);
    await intro(page).getByRole('button', { name: 'Start Guided Tour' }).click();
    for (let index = 1; index <= 10; index++) {
      await expect(step(page)).toContainText(`${index} / 10`);
      await step(page)
        .getByRole('button', { name: index === 10 ? 'Finish' : 'Next' })
        .click();
    }
    await expect(step(page)).toBeHidden();
    // Focus is back where the writer asked for it: the Help menu's button.
    await expect(helpButton(page)).toBeFocused();
  });

  test('replays the tour from the palette’s Take the tour', async ({ page }) => {
    await skipWelcome(page);
    await page.keyboard.press('ControlOrMeta+k');
    await expect(palette(page)).toBeVisible();
    await page.keyboard.type('Take the tour');
    // Take snapshot… is listed first while only "Take" is typed: Enter waits for the filter to catch up.
    await expect(
      palette(page).getByRole('option', { name: 'Take the tour', exact: true }),
    ).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('Enter');
    await expect(palette(page)).toBeHidden();
    await expect(intro(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(intro(page)).toBeHidden();
  });

  test('leaves focus mode for the tour, and the tour lights its targets', async ({ page }) => {
    await skipWelcome(page);
    // Focus mode has no toolbar or status bar, which most of the steps point at.
    await pressToolbarButton(page, 'Focus');
    await expect(page.getByRole('group', { name: 'Focus mode' })).toBeVisible();

    await page.keyboard.press('ControlOrMeta+k');
    await expect(palette(page)).toBeVisible();
    await page.keyboard.type('Take the tour');
    // Take snapshot… is listed first while only "Take" is typed: Enter waits for the filter to catch up.
    await expect(
      palette(page).getByRole('option', { name: 'Take the tour', exact: true }),
    ).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('Enter');
    await expect(palette(page)).toBeHidden();
    await expect(intro(page)).toBeVisible();
    await expect(page.getByRole('group', { name: 'Focus mode' })).toBeHidden();
    await expect(
      page
        .getByRole('button', { name: 'Focus', exact: true })
        .or(page.getByRole('button', { name: 'More actions', exact: true }))
        .first(),
    ).toBeVisible();

    await intro(page).getByRole('button', { name: 'Start Guided Tour' }).click();
    const steps = plan(statusBar(page));
    for (const [index, [title, target]] of steps.entries()) {
      await expect(step(page)).toContainText(`${index + 1} / 10`);
      await expect(step(page).getByRole('heading', { name: title })).toBeVisible();
      await expect(lit(page)).toHaveAttribute('data-tour', await litTarget(page, target));
      await expect(lit(page)).toBeVisible();
      await step(page)
        .getByRole('button', {
          name: index === steps.length - 1 ? 'Finish' : 'Next',
        })
        .click();
    }
    await expect(step(page)).toBeHidden();
  });

  test('Escape in a step closes only the tour, and not focus mode', async ({ page }) => {
    await skipWelcome(page);
    await takeTourFromHelp(page);
    await intro(page).getByRole('button', { name: 'Start Guided Tour' }).click();
    await expect(step(page)).toBeVisible();
    // The tour's backdrop covers the page, and the app's keys are held, so the writer can't turn
    // focus mode on from a step. Something else could (a second tab's setting, a future command):
    // the app's own state is set here, and Escape must still be the tour's alone.
    await page.evaluate(() => {
      const root = document.querySelector('#__nuxt') as unknown as {
        __vue_app__: {
          config: {
            globalProperties: {
              $nuxt: { payload: { state: Record<string, unknown> } };
            };
          };
        };
      };
      root.__vue_app__.config.globalProperties.$nuxt.payload.state['$sfocus-mode'] = true;
    });
    await expect(page.getByRole('group', { name: 'Focus mode' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(step(page)).toBeHidden();
    // That one Escape ended the tour; focus mode is still on (it would have been left, too, if the
    // tour's dialog had been gone by the time the page's own Escape listener looked).
    await expect(page.getByRole('group', { name: 'Focus mode' })).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.getByRole('group', { name: 'Focus mode' })).toBeVisible();
  });

  test('holds the app’s own keys while the tour is up', async ({ page }) => {
    await visit(page);
    await page.keyboard.press('ControlOrMeta+k');
    await page.waitForTimeout(300);
    await expect(palette(page)).toBeHidden();
    await startTour(page);
    await page.keyboard.press('ControlOrMeta+k');
    await page.waitForTimeout(300);
    await expect(palette(page)).toBeHidden();
    await expect(step(page)).toBeVisible();
  });

  test('announces each step to screen readers', async ({ page }) => {
    await visit(page);
    await startTour(page);
    await expect(announcer(page)).toHaveAttribute('role', 'status');
    await expect(announcer(page)).toHaveAttribute('aria-live', 'polite');
    const steps = plan(statusBar(page));
    for (const [index, [title]] of steps.entries()) {
      await expect(announcer(page)).toContainText(`Tour step ${index + 1} of 10: ${title}.`);
      if (index < steps.length - 1) await page.keyboard.press('ArrowRight');
    }
    await page.keyboard.press('Escape');
    // Drafter's own words for how to come back.
    await expect(announcer(page)).toContainText('the Help menu');
  });

  test('does not start over a dialog, and starts when it closes', async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const dialog = document.createElement('dialog');
        dialog.id = 'other-dialog';
        dialog.setAttribute('open', '');
        document.body.append(dialog);
      });
    });
    await page.goto('/');
    await expect(mark(page)).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(welcome(page)).toBeHidden();
    await page.evaluate(() => document.getElementById('other-dialog')?.removeAttribute('open'));
    await expect(welcome(page)).toBeVisible();
  });

  test('does not nag a writer who has a script already', async ({ page, context }) => {
    // The first visit stored the sample, so a second tab with the same storage is a returning visit
    // even when its tour key was cleared.
    await visit(page);
    await page.keyboard.press('Escape');
    await page.evaluate(() => localStorage.removeItem('drafter-tour-v1'));
    await page.reload();
    await expect(mark(page)).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(welcome(page)).toBeHidden();
    expect(context).toBeDefined();
  });

  test('stops the highlight pulsing under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await visit(page);
    await startTour(page);
    // A pane (its overflow is hidden: a second pulse, on the element) and a toolbar button.
    for (const index of [0, 5]) {
      while ((await step(page).textContent())?.includes(`${index + 1} / 10`) === false) {
        await page.keyboard.press('ArrowRight');
      }
      await expect(lit(page)).toHaveCount(1);
      const animations = await lit(page).evaluate((el) => [
        getComputedStyle(el).animationName,
        getComputedStyle(el, '::before').animationName,
      ]);
      expect(animations).toEqual(['none', 'none']);
    }
  });

  test('pulses the highlight when motion is allowed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await visit(page);
    await startTour(page);
    await expect(lit(page)).toHaveCount(1);
    const animations = await lit(page).evaluate((el) => [
      getComputedStyle(el).animationName,
      getComputedStyle(el, '::before').animationName,
    ]);
    // The pane pulses itself (hidden overflow), or its ring does.
    expect(animations.some((name) => name !== 'none')).toBe(true);
  });

  // The cards are the one dialog style (fresh-look design §5): --raised, no slate gradient, and
  // the goldenrod primary button, not the tour module's blue one.
  test('the tour’s buttons are the primary button, not blue', async ({ page }) => {
    await visit(page);
    const ACCENT = 'rgb(229, 176, 74)';
    const ON_ACCENT = 'rgb(17, 18, 22)';
    const RAISED = 'rgb(28, 31, 36)';
    const card = page.locator('.welcome-card');
    await expect(card).toHaveCSS('background-color', RAISED);
    await expect(card).toHaveCSS('background-image', 'none');
    const take = welcome(page).getByRole('button', { name: 'Take the tour' });
    await expect(take).toHaveCSS('background-color', ACCENT);
    await expect(take).toHaveCSS('color', ON_ACCENT);
    await take.click();
    await expect(page.locator('.intro-card')).toHaveCSS('background-image', 'none');
    const next = intro(page).getByRole('button', { name: 'Start Guided Tour' });
    await expect(next).toHaveCSS('background-color', ACCENT);
    await expect(next).toHaveCSS('color', ON_ACCENT);
    await page.keyboard.press('Enter');
    await expect(step(page)).toBeVisible();
    await expect(page.locator('.tour-card')).toHaveCSS('background-color', RAISED);
    await expect(page.locator('.tour-card')).toHaveCSS('background-image', 'none');
    const stepNext = step(page).getByRole('button', { name: 'Next' });
    await expect(stepNext).toHaveCSS('background-color', ACCENT);
    await expect(stepNext).toHaveCSS('background-image', 'none');
    await expect(stepNext).toHaveCSS('color', ON_ACCENT);
    // The badge is a quiet chip on the card, not a slate pill.
    await expect(step(page).locator('.tour-progress-badge')).toHaveCSS('background-image', 'none');
  });

  test('the welcome card is 440px and sized to its content', async ({ page }) => {
    await visit(page);
    const card = page.locator('.welcome-card');
    const box = await card.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport).toBeTruthy();
    if (!box || !viewport) return;
    expect(Math.round(box.width)).toBe(Math.min(440, viewport.width - 32));
    // Sized to its content: nothing scrolls inside it, and it is shorter than the window.
    expect(await card.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    expect(box.height).toBeLessThan(viewport.height);
    await expect(card).toHaveCSS('border-top-left-radius', '12px');
  });

  test('lights the targets in the brand’s goldenrod', async ({ page }) => {
    await visit(page);
    await startTour(page);
    const color = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--tour-highlight').trim(),
    );
    expect(color.toLowerCase()).toBe('#e5b04a');
  });
});

test.describe('on a phone', () => {
  test.beforeEach(({ page }) => {
    test.skip(wide(page), 'a phone-width screen only');
  });

  test('shows each step’s target on a phone', async ({ page }) => {
    await visit(page);
    await welcome(page).getByRole('button', { name: 'Take the tour' }).click();
    await intro(page).getByRole('button', { name: 'Start Guided Tour' }).click();
    const selected = (name: string) => page.getByRole('tab', { name, selected: true });

    const steps = plan(false);
    for (const [index, [title, target]] of steps.entries()) {
      await expect(step(page).getByRole('heading', { name: title })).toBeVisible();
      await expect(lit(page)).toHaveCount(1);
      await expect(lit(page)).toHaveAttribute('data-tour', await litTarget(page, target));
      await expect(lit(page)).toBeVisible();
      // Below 1024px the bottom tab bar calls the Source "Write" (Task 9).
      if (target === 'source') await expect(selected('Write')).toBeVisible();
      if (target === 'script') await expect(selected('Script')).toBeVisible();
      if (target === 'problems') await expect(selected('Problems')).toBeVisible();
      if (index === 4) {
        // The template chip is hidden here: the step says where the template is chosen instead.
        await expect(step(page)).toContainText('Drafter menu');
        await expect(step(page)).toContainText('Template: Stage play');
      }
      await step(page)
        .getByRole('button', { name: index === 9 ? 'Finish' : 'Next' })
        .click();
    }
    await expect(step(page)).toBeHidden();
    // The tab the phone was on (Write, on a first visit: fresh-look design §6) comes back.
    await expect(page.getByRole('tab', { name: 'Write', selected: true })).toBeVisible();
  });
});

test.describe('on a phone, ten steps', () => {
  // Fresh-look Task 9: the tour keeps its ten steps on a phone, and each lights something that is
  // on the screen, inside the window, at 320px too (a folded top-bar button's step lights More
  // actions, where it went; tour.config.ts).
  for (const width of [320, 390]) {
    test(`the tour keeps ten steps on a phone, each pointing at something on screen (${width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 700 });
      await visit(page);
      await welcome(page).getByRole('button', { name: 'Take the tour' }).click();
      await intro(page).getByRole('button', { name: 'Start Guided Tour' }).click();
      for (let index = 0; index < 10; index++) {
        await expect(step(page)).toContainText(`${index + 1} / 10`);
        await expect(lit(page)).toHaveCount(1);
        await expect(lit(page)).toBeVisible();
        const box = await lit(page).boundingBox();
        expect(box, `step ${index + 1}`).toBeTruthy();
        expect(box?.x ?? -1, `step ${index + 1} left`).toBeGreaterThanOrEqual(0);
        expect((box?.x ?? 0) + (box?.width ?? 0), `step ${index + 1} right`).toBeLessThanOrEqual(
          width + 1,
        );
        await step(page)
          .getByRole('button', { name: index === 9 ? 'Finish' : 'Next' })
          .click();
      }
      await expect(step(page)).toBeHidden();
    });
  }
});

test.describe('on a wide screen', () => {
  test.beforeEach(({ page }) => {
    test.skip(!wide(page), 'a wide screen only');
  });

  test('brings the Problems pane in and puts the layout back', async ({ page }) => {
    await visit(page);
    await startTour(page);
    // Problems isn't showing to begin with (the editor and the Script are).
    await expect(page.getByRole('tab', { name: 'Problems', selected: true })).toHaveCount(0);
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await expect(step(page)).toContainText('4 / 10');
    await expect(lit(page)).toHaveAttribute('data-tour', 'problems');
    await expect(lit(page)).toBeVisible();
    // It shows in the Inspector; the editor stays on the left.
    await expect(page.locator('[data-pane="right"] [data-tour="problems"]')).toBeVisible();
    await expect(page.locator('[data-pane="left"] .cm-content')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(lit(page)).toHaveAttribute('data-tour', 'source');
    await expect(lit(page)).toBeVisible();
    await expect(page.locator('[data-pane="left"] [data-tour="source"]')).toBeVisible();
    for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await expect(step(page)).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Problems', selected: true })).toHaveCount(0);
    await expect(page.locator('[data-pane="left"] .cm-content')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Script', selected: true })).toBeVisible();
  });
});
