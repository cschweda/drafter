import { expect, type Page, test } from '@playwright/test';
import { editor, openSettings, palette, paletteInput, setText, showSource, start } from './modules';

// Sprints (Plan 5 Task 4), on Playwright's clock: it is stopped at the start of each test, and a
// test moves it with `runFor` (every timer in between runs, as in a tab being used) or
// `fastForward` (a jump that fires each due timer once, as in a tab that was in the background).
// The accessibility test the brief names is deferred to the project's final stage (decided
// 2026-10-26); the controls' keyboard use is tested here.

const MINUTE = 60_000;
const status = (page: Page) => page.locator('[data-tour="status"]');
const countsButton = (page: Page) => status(page).locator('.counts-button');
const panel = (page: Page) => page.getByRole('dialog', { name: 'Counts' });
const inBar = (page: Page) => status(page).locator('[data-sprint]');
const inMarker = (page: Page) => page.locator('[data-focus-marker] [data-sprint]');
const notice = (page: Page) => page.locator('[data-sprint-notice]');
const noticeText = (page: Page) => notice(page).getByRole('status');
const control = (group: ReturnType<typeof inBar>, name: string) =>
  group.getByRole('button', { name, exact: true });

/** Loads the app with the clock stopped, so the countdown shows what the test made of it. */
async function begin(page: Page) {
  await page.clock.install({ time: new Date('2026-10-26T10:00:00') });
  await start(page);
  await page.clock.pauseAt(new Date('2026-10-26T10:00:05'));
}

/** Starts a sprint from the Counts panel, with one of its length buttons. */
async function startFromPanel(page: Page, name: string) {
  await countsButton(page).click();
  await expect(panel(page)).toBeVisible();
  await panel(page).getByRole('button', { name, exact: true }).click();
  await expect(panel(page)).toBeHidden();
}

/**
 * Runs a palette command with the clock stopped: the palette waits on timers and frames to
 * highlight a row, so the clock is moved a little (100 ms) where it needs them, and the row is clicked.
 */
async function runCommand(page: Page, title: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeVisible();
  await page.clock.runFor(100);
  await expect(paletteInput(page)).toBeFocused();
  await page.keyboard.insertText(title);
  const row = palette(page).getByRole('option', { name: title, exact: true });
  await expect(row).toBeVisible();
  await row.click();
  await expect(palette(page)).toBeHidden();
}

/** Types at the end of the script, in the Source pane. */
async function typeAtEnd(page: Page, text: string) {
  await showSource(page);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(text);
}

/**
 * Records every text that appears in a live region (a status, an alert, or `aria-live`), as a
 * screen reader would be told it. What was there already is not recorded.
 */
async function watchLiveRegions(page: Page) {
  await page.evaluate(() => {
    const heard: string[] = [];
    const last = new Map<Element, string>();
    const scan = () => {
      for (const el of document.querySelectorAll(
        '[role="status"], [role="alert"], [aria-live]:not([aria-live="off"])',
      )) {
        const text = (el.textContent ?? '').trim();
        if (last.get(el) === text) continue;
        last.set(el, text);
        if (text) heard.push(text);
      }
    };
    scan();
    heard.length = 0;
    new MutationObserver(scan).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    (window as unknown as { __heard: string[] }).__heard = heard;
  });
}

const heard = (page: Page) =>
  page.evaluate(() => (window as unknown as { __heard: string[] }).__heard);

test.describe('sprints', () => {
  test('runs a 15-minute sprint and reports what it added', async ({ page }) => {
    await begin(page);
    await startFromPanel(page, '15 minutes');
    await expect(inBar(page)).toContainText('15:00 left');

    // Sixty words, typed in the first minute.
    await typeAtEnd(page, `\n\n${'alpha beta '.repeat(30).trim()}`);
    await page.clock.runFor(1000);
    await expect(inBar(page)).toContainText('14:59 left');

    await page.clock.fastForward(13 * MINUTE + 59_000);
    await expect(inBar(page)).toContainText('1:00 left');
    await expect(noticeText(page)).toHaveText('');

    await page.clock.runFor(MINUTE);
    await expect(inBar(page)).toHaveCount(0);
    await expect(noticeText(page)).toHaveText(/^Sprint done: 60 words( \(\d+(\.\d)? pages?\))?\.$/);
    // The notice is also drawn, as a toast.
    await expect(notice(page)).toHaveClass(/shown/);

    // And it goes away by itself.
    await page.clock.runFor(30_000);
    await expect(noticeText(page)).toHaveText('');
    await expect(notice(page)).not.toHaveClass(/shown/);
  });

  test('starts any whole number of minutes from 1 to 180, and says what is wrong with others', async ({
    page,
  }) => {
    await begin(page);
    await countsButton(page).click();
    const minutes = panel(page).getByLabel('Minutes');
    const submit = panel(page).getByRole('button', { name: 'Start sprint', exact: true });

    for (const bad of ['', '0', '181', '12.5', 'ten']) {
      await minutes.fill(bad);
      await submit.click();
      await expect(panel(page).getByRole('alert')).toHaveText(
        'Enter a whole number of minutes, from 1 to 180.',
      );
      await expect(minutes).toHaveAttribute('aria-invalid', 'true');
    }
    await minutes.fill('90');
    await minutes.press('Enter');
    await expect(panel(page)).toBeHidden();
    await expect(inBar(page)).toContainText('1:30:00 left');
  });

  test('announces only the end', async ({ page }) => {
    await begin(page);
    await watchLiveRegions(page);
    await countsButton(page).click();
    await panel(page).getByLabel('Minutes').fill('3');
    await panel(page).getByRole('button', { name: 'Start sprint', exact: true }).click();
    await expect(inBar(page)).toContainText('3:00 left');

    // Every second of the three minutes goes by, and a screen reader hears none of them.
    for (let second = 0; second < 150; second++) await page.clock.runFor(1000);
    await expect(inBar(page)).toContainText('0:30 left');
    expect(await heard(page)).toEqual([]);
    // The countdown is in no live region, and is not a timer role either.
    expect(
      await inBar(page).evaluate((el) =>
        el.closest(
          '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="timer"], [role="log"]',
        ),
      ),
    ).toBeNull();

    await page.clock.runFor(30_000);
    await expect(inBar(page)).toHaveCount(0);
    await expect(noticeText(page)).toHaveText('Sprint done: no words added.');
    // A minute more: nothing else was said, and the end was said once.
    await page.clock.runFor(MINUTE);
    expect(await heard(page)).toEqual(['Sprint done: no words added.']);
  });

  test('keeps time while the page is in the background, and ends once', async ({ page }) => {
    await begin(page);
    await watchLiveRegions(page);
    await startFromPanel(page, '15 minutes');
    await typeAtEnd(page, '\n\none two three');
    // A jump: timers that were due fire once, as when a throttled tab wakes.
    await page.clock.fastForward(14 * MINUTE + 30_000);
    await expect(inBar(page)).toContainText('0:30 left');
    await page.clock.fastForward(3 * 60 * MINUTE);
    await expect(inBar(page)).toHaveCount(0);
    await expect(noticeText(page)).toHaveText(/^Sprint done: 3 words/);
    await page.clock.runFor(MINUTE);
    // (The editor's own announcer says what kind of line the cursor is on; that is not the sprint's.)
    expect((await heard(page)).filter((text) => text.startsWith('Sprint'))).toHaveLength(1);
  });

  test('can be paused, stopped, and hidden', async ({ page }) => {
    await begin(page);
    await showSource(page);
    await watchLiveRegions(page);
    await startFromPanel(page, '25 minutes');
    await expect(inBar(page)).toContainText('25:00 left');
    await page.clock.fastForward(5 * MINUTE);
    await expect(inBar(page)).toContainText('20:00 left');

    // Pause from the keyboard; the same button then resumes, and keeps focus.
    const pause = control(inBar(page), 'Pause');
    await pause.focus();
    await page.keyboard.press('Enter');
    await expect(inBar(page)).toContainText('Paused');
    await expect(inBar(page)).toContainText('20:00');
    const resume = control(inBar(page), 'Resume');
    await expect(resume).toBeFocused();
    await page.clock.fastForward(10 * MINUTE);
    await expect(inBar(page)).toContainText('20:00');
    await page.keyboard.press('Space');
    await expect(inBar(page)).not.toContainText('Paused');
    await expect(control(inBar(page), 'Pause')).toBeFocused();
    await page.clock.runFor(MINUTE);
    await expect(inBar(page)).toContainText('19:00 left');

    // Hide: the countdown goes, the sprint does not, and Show brings it back with the time moved on.
    await control(inBar(page), 'Hide').focus();
    await page.keyboard.press('Enter');
    await expect(inBar(page).locator('[data-sprint-time]')).toHaveCount(0);
    const show = status(page).getByRole('button', { name: 'Show sprint', exact: true });
    await expect(show).toBeFocused();
    await page.clock.fastForward(4 * MINUTE);
    await page.keyboard.press('Enter');
    await expect(inBar(page)).toContainText('15:00 left');
    await expect(control(inBar(page), 'Pause')).toBeFocused();

    // Stop: no announcement, and focus goes back to the script.
    await control(inBar(page), 'Stop').focus();
    await page.keyboard.press('Enter');
    await expect(inBar(page)).toHaveCount(0);
    await expect(editor(page)).toBeFocused();
    await page.clock.fastForward(30 * MINUTE);
    await expect(noticeText(page)).toHaveText('');
    expect(await heard(page)).toEqual([]);
  });

  test('is started, paused, resumed, and stopped from the palette', async ({ page }) => {
    await begin(page);
    await runCommand(page, 'Start a 45-minute sprint');
    await expect(inBar(page)).toContainText('45:00 left');
    await runCommand(page, 'Pause sprint');
    await expect(inBar(page)).toContainText('Paused');
    await runCommand(page, 'Resume sprint');
    await expect(inBar(page)).not.toContainText('Paused');
    await runCommand(page, 'Hide sprint countdown');
    await expect(inBar(page).locator('[data-sprint-time]')).toHaveCount(0);
    await runCommand(page, 'Show sprint countdown');
    await expect(inBar(page)).toContainText('45:00 left');
    await runCommand(page, 'Stop sprint');
    await expect(inBar(page)).toHaveCount(0);
  });

  test('shows the time left in the focus mode marker', async ({ page, isMobile }) => {
    test.skip(
      !!isMobile,
      'the shortcut is the same on a phone; the marker is tested on the desktop',
    );
    await begin(page);
    await startFromPanel(page, '25 minutes');
    await showSource(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await expect(inMarker(page)).toContainText('25:00 left');
    await page.clock.runFor(MINUTE);
    await expect(inMarker(page)).toContainText('24:00 left');

    // Its controls are here too.
    await control(inMarker(page), 'Pause').click();
    await expect(inMarker(page)).toContainText('Paused');
    await control(inMarker(page), 'Resume').click();

    // The end is told in focus mode as well, once.
    await page.clock.fastForward(24 * MINUTE);
    await expect(inMarker(page)).toHaveCount(0);
    await expect(noticeText(page)).toHaveText(/^Sprint done: no words added\.$/);
  });

  test('keeps running through focus mode and back', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'same on a phone');
    await begin(page);
    await startFromPanel(page, '15 minutes');
    await showSource(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await expect(inMarker(page)).toBeVisible();
    await page.clock.runFor(2 * MINUTE);
    await page.keyboard.press('Escape');
    await expect(inBar(page)).toContainText('13:00 left');
  });

  test('counts a Markdown document in words only', async ({ page }) => {
    await begin(page);
    await runCommand(page, 'New Markdown document');
    await setText(page, '# A title\n\nSome words here.\n');
    await page.clock.runFor(1000);
    await startFromPanel(page, '15 minutes');
    await typeAtEnd(page, '\nNine more words come to this page, in all.\n');
    await page.clock.fastForward(15 * MINUTE);
    await expect(noticeText(page)).toHaveText('Sprint done: 9 words.');
  });

  test('says there is no count when another script is open at the end', async ({ page }) => {
    await begin(page);
    await startFromPanel(page, '15 minutes');
    await typeAtEnd(page, '\n\nA few words typed in the first script.');
    await runCommand(page, 'New Markdown document');
    await expect(inBar(page)).toContainText('left');
    await page.clock.fastForward(15 * MINUTE);
    await expect(noticeText(page)).toHaveText(
      'Sprint done. The script changed while it ran, so there is no count.',
    );
  });

  test('shows whole minutes, and nothing that moves, when motion is reduced', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await begin(page);
    await startFromPanel(page, '15 minutes');
    await expect(inBar(page)).toContainText('15 min left');
    await page.clock.runFor(30_000);
    await expect(inBar(page)).toContainText('15 min left');
    await page.clock.runFor(60_000);
    await expect(inBar(page)).toContainText('14 min left');
    const animated = await inBar(page).evaluate((el) =>
      [el, ...el.querySelectorAll('*')].some((node) => {
        const style = getComputedStyle(node);
        return style.animationName !== 'none' || parseFloat(style.transitionDuration) > 0;
      }),
    );
    expect(animated).toBe(false);
  });

  test('makes no sound unless it is turned on in Settings', async ({ page }) => {
    // A stand-in for the browser's audio, which counts the contexts made and the notes played. (A
    // real context left open can hold a WebKit page from closing, and a test needs no sound.)
    await page.addInitScript(() => {
      const log = { contexts: 0, notes: 0 };
      (window as unknown as { __audio: typeof log }).__audio = log;
      const param = () => ({
        value: 0,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
      });
      class Counting {
        state = 'running';
        currentTime = 0;
        destination = {};
        constructor() {
          log.contexts++;
        }
        resume() {
          return Promise.resolve();
        }
        close() {
          return Promise.resolve();
        }
        createGain() {
          return { gain: param(), connect() {} };
        }
        createOscillator() {
          return {
            type: 'sine',
            frequency: param(),
            connect() {},
            start() {
              log.notes++;
            },
            stop() {},
          };
        }
      }
      (window as unknown as { AudioContext: typeof Counting }).AudioContext = Counting;
    });
    const audioMade = () =>
      page.evaluate(
        () => (window as unknown as { __audio: { contexts: number } }).__audio.contexts,
      );
    const notesPlayed = () =>
      page.evaluate(() => (window as unknown as { __audio: { notes: number } }).__audio.notes);
    await begin(page);

    // Off to begin with: a whole sprint, and no audio context.
    await startFromPanel(page, '15 minutes');
    await page.clock.fastForward(15 * MINUTE);
    await expect(noticeText(page)).toContainText('Sprint done');
    expect(await audioMade()).toBe(0);
    expect(await notesPlayed()).toBe(0);

    // The setting is in Settings, off.
    await openSettings(page);
    const sound = page.getByRole('dialog', { name: 'Settings' }).getByRole('switch', {
      name: 'Sprint sound',
    });
    await expect(sound).not.toBeChecked();
    await sound.click();
    await expect(sound).toBeChecked();
    await page.keyboard.press('Escape');

    // On: the tone is made when the sprint ends (the context is made when it starts, in the click).
    await startFromPanel(page, '15 minutes');
    await page.clock.fastForward(15 * MINUTE);
    await expect(noticeText(page)).toContainText('Sprint done');
    expect(await audioMade()).toBeGreaterThan(0);
    expect(await notesPlayed()).toBeGreaterThan(0);
  });
});
