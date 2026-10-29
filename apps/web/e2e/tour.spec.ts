import { expect, type Page, test } from '@playwright/test';

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
const menu = (page: Page) => page.getByRole('menu', { name: 'Drafter menu' });
const editor = (page: Page) => page.locator('.cm-content');
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });

const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

/** Each step's title and the `data-tour` value of what it lights, on a wide screen and a narrow one. */
function plan(isWide: boolean) {
  return [
    ['You write here', 'source'],
    ['The real pages', 'script'],
    ['Names and places come up', 'source'],
    ['Problems', 'problems'],
    ['Screenplay or stage play', isWide ? 'template' : 'menu'],
    ['Save', 'save'],
    ['The status bar', 'status'],
    ['Export', 'export'],
    ['Focus', 'focus'],
    ['Go anywhere', 'palette'],
  ] as const;
}

async function visit(page: Page) {
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
  await mark(page).click();
  await menu(page).getByRole('menuitem', { name: 'Take the tour' }).click();
  await expect(intro(page)).toBeVisible();
}

test.describe('the welcome and the tour', () => {
  test('welcomes a first visit and takes the tour with the keyboard', async ({ page }) => {
    await visit(page);
    await expect(
      welcome(page).getByRole('button', {
        name: "No thanks, I'll look around.",
      }),
    ).toBeVisible();
    await startTour(page);

    const steps = plan(wide(page));
    for (const [index, [title, target]] of steps.entries()) {
      await expect(step(page)).toContainText(`${index + 1} / 10`);
      await expect(step(page).getByRole('heading', { name: title })).toBeVisible();
      // The step's target, and only it, is lit, and it is on the screen.
      await expect(lit(page)).toHaveCount(1);
      await expect(lit(page)).toHaveAttribute('data-tour', target);
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
    // Focus is back where the writer asked for it: the Drafter menu's mark.
    await expect(mark(page)).toBeFocused();
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
    await page.getByRole('button', { name: 'Focus', exact: true }).click();
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
    await expect(page.getByRole('button', { name: 'Focus', exact: true })).toBeVisible();

    await intro(page).getByRole('button', { name: 'Start Guided Tour' }).click();
    const steps = plan(wide(page));
    for (const [index, [title, target]] of steps.entries()) {
      await expect(step(page)).toContainText(`${index + 1} / 10`);
      await expect(step(page).getByRole('heading', { name: title })).toBeVisible();
      await expect(lit(page)).toHaveAttribute('data-tour', target);
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
    const steps = plan(wide(page));
    for (const [index, [title]] of steps.entries()) {
      await expect(announcer(page)).toContainText(`Tour step ${index + 1} of 10: ${title}.`);
      if (index < steps.length - 1) await page.keyboard.press('ArrowRight');
    }
    await page.keyboard.press('Escape');
    // Drafter's own words for how to come back.
    await expect(announcer(page)).toContainText('Help, in the Drafter menu');
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
      await expect(lit(page)).toHaveAttribute('data-tour', target);
      await expect(lit(page)).toBeVisible();
      if (target === 'source') await expect(selected('Source')).toBeVisible();
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
    // The tab the phone was on (the Script, on a first visit) comes back.
    await expect(page.getByRole('tab', { name: 'Script', selected: true })).toBeVisible();
  });
});

test.describe('on a wide screen', () => {
  test.beforeEach(({ page }) => {
    test.skip(!wide(page), 'a wide screen only');
  });

  test('brings the Problems pane in for its step, and puts the writer’s panes back', async ({
    page,
  }) => {
    await visit(page);
    await startTour(page);
    // Problems isn't showing to begin with (Source and Script are).
    await expect(page.getByRole('tab', { name: 'Problems', selected: true })).toHaveCount(0);
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await expect(step(page)).toContainText('4 / 10');
    await expect(lit(page)).toHaveAttribute('data-tour', 'problems');
    await expect(lit(page)).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(lit(page)).toHaveAttribute('data-tour', 'source');
    await expect(lit(page)).toBeVisible();
    for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await expect(step(page)).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Problems', selected: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Source', selected: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Script', selected: true })).toBeVisible();
  });
});
