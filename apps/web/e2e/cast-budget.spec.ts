import { expect, type Page, test } from '@playwright/test';
import type { CastProbe } from '../app/cast/probe';
import { longScript } from './long-script';
import { editor, runCommand, setText, start } from './modules';

// The cast's budgets (seeing-the-script design §11): `castOf` within 15 ms for a 120-page script,
// the Stats tab opened with Characters and the grid drawn within 300 ms, Scaffold's scene page
// within 4 ms after the cursor rests, and no long task while typing with the Stats tab or Scaffold
// shown. These log the times and fail only past ten times the budget, as a guard against a hang
// (the plan's Call 51). A test build puts `drafterCastProbe` on the page (app/cast/probe.ts) to time
// `castOf` and to count the casts worked out.

type ProbeWindow = Window & {
  drafterCastProbe: CastProbe;
  longTasks: number[];
  statsOpen?: { start: number | null; drawn: Promise<number> };
  followed?: Promise<number>;
};

/** Calls one of the probe's methods on the page. */
const probe = <K extends keyof CastProbe>(
  page: Page,
  method: K,
  ...args: Parameters<CastProbe[K]>
) =>
  page.evaluate(
    ([name, rest]) => {
      const it = (window as unknown as ProbeWindow).drafterCastProbe;
      return (it[name] as (...a: unknown[]) => unknown)(...rest);
    },
    [method, args] as const,
  ) as Promise<ReturnType<CastProbe[K]>>;

/** The long script in the editor, laid out. */
async function long(page: Page) {
  await start(page);
  await page.waitForFunction(() => 'drafterCastProbe' in window);
  await setText(page, longScript());
  await expect.poll(() => probe(page, 'pages'), { timeout: 60_000 }).toBeGreaterThanOrEqual(120);
}

test('castOf on a 120-page script is within budget', async ({ page, browserName }, info) => {
  test.setTimeout(120_000);
  await long(page);
  const ms = await probe(page, 'time', 5);
  const pages = await probe(page, 'pages');
  console.log(`castOf, ${pages} pages, ${info.project.name} (${browserName}): ${ms.toFixed(2)} ms`);
  expect(ms).toBeLessThan(150);
});

test('opening the Stats tab with Characters and the grid is within budget', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await long(page);
  // Timed in the page, from the palette's Enter to the frame after the Characters table and the
  // grid are both drawn, with the cast worked out for the first time in between.
  await page.evaluate(() => {
    const w = window as unknown as ProbeWindow;
    let start: number | null = null;
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Enter' && start === null) {
          start = performance.now();
          if (w.statsOpen) w.statsOpen.start = start;
        }
      },
      { capture: true },
    );
    const drawn = new Promise<number>((resolve) => {
      const look = () => {
        const panel = document.getElementById('panel-stats');
        const table = panel?.querySelector('table tbody tr');
        const cell = panel?.querySelector('[role="grid"] [role="gridcell"]');
        if (start !== null && table && cell) setTimeout(() => resolve(performance.now()));
        else requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    w.statsOpen = { start: null, drawn };
  });
  await runCommand(page, 'Show stats');
  const ms = await page.evaluate(async () => {
    const open = (window as unknown as ProbeWindow).statsOpen;
    const end = await open?.drawn;
    return (end ?? 0) - (open?.start ?? 0);
  });
  const pages = await probe(page, 'pages');
  console.log(`Stats tab opened, ${pages} pages, ${info.project.name}: ${ms.toFixed(1)} ms`);
  expect(ms).toBeGreaterThan(0);
  expect(ms).toBeLessThan(3000);
});

/**
 * Types into the first scene of the long script, which a view of the cast shows, three times at
 * most, and gives the fewest long tasks a run saw: a busy test machine can give one run a long task
 * that isn't Drafter's.
 */
async function longTasksWhileTyping(page: Page): Promise<number[]> {
  await page.evaluate(() => {
    const long: number[] = [];
    (window as unknown as ProbeWindow).longTasks = long;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) long.push(entry.duration);
    }).observe({ type: 'longtask', buffered: false });
  });
  const longTasks = () => page.evaluate(() => (window as unknown as ProbeWindow).longTasks);
  // Proof the observer sees what it should: a task of about 80 ms is reported once.
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

  // Best of three: a busy test machine can give one run a long task that isn't Drafter's.
  let best: number[] | undefined;
  for (let run = 0; run < 3 && (best === undefined || best.length > 0); run++) {
    await page.evaluate(() => {
      (window as unknown as ProbeWindow).longTasks.length = 0;
    });
    const before = await probe(page, 'computed');
    await editor(page).click();
    // Into the first scene's action: every later offset moves, and the cast is worked out again.
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.type('Typing into a long script, one letter at a time. ', { delay: 60 });
    // The pause, the layout, and the cast after it.
    await expect.poll(() => probe(page, 'computed'), { timeout: 10_000 }).toBeGreaterThan(before);
    await page.waitForTimeout(500);
    const seen = await longTasks();
    if (best === undefined || seen.length < best.length) best = seen;
  }
  return best ?? [];
}

test.describe('in Chromium', () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile,
    'long tasks are a Chromium API; two panes need a wide screen',
  );

  test('typing with the Stats tab shown makes no long task', async ({ page }) => {
    test.setTimeout(120_000);
    await long(page);
    await runCommand(page, 'Show stats');
    const stats = page.getByRole('tabpanel', { name: 'Stats', exact: true });
    await expect(stats.getByRole('rowheader')).not.toHaveCount(0);
    await expect(stats.getByRole('grid', { name: 'Character by scene' })).toBeVisible();
    await expect(editor(page)).toBeVisible();
    expect(await longTasksWhileTyping(page)).toEqual([]);
  });

  test('typing with Scaffold shown makes no long task', async ({ page }) => {
    test.setTimeout(120_000);
    await long(page);
    await runCommand(page, 'Show Scaffold');
    const scaffold = page.getByRole('tabpanel', { name: 'Scaffold', exact: true });
    await expect(scaffold.getByRole('table', { name: /^In this scene/ })).toBeVisible();
    await expect(editor(page)).toBeVisible();
    expect(await longTasksWhileTyping(page)).toEqual([]);
  });

  test('the scene page updates within budget', async ({ page }) => {
    test.setTimeout(120_000);
    await long(page);
    await runCommand(page, 'Show Scaffold');
    const scaffold = page.getByRole('tabpanel', { name: 'Scaffold', exact: true });
    const heading = scaffold.getByRole('heading', { level: 2 });
    await expect(scaffold.getByRole('table', { name: /^In this scene/ })).toBeVisible();
    await editor(page).click();
    // Timed in the page, from the rest's mark (FOLLOW_MARK, as the follow reads the cursor's
    // scene) to the moment the new heading and its rows are in the page.
    const times: number[] = [];
    for (const key of ['ControlOrMeta+Home', 'ControlOrMeta+End', 'ControlOrMeta+Home']) {
      const before = await heading.textContent();
      await page.evaluate(() => {
        const w = window as unknown as ProbeWindow;
        const h2 = document.querySelector('#panel-scaffold h2');
        w.followed = new Promise<number>((resolve) => {
          const watcher = new MutationObserver(() => {
            watcher.disconnect();
            const marks = performance.getEntriesByName('drafter-scaffold-follow');
            resolve(performance.now() - (marks.at(-1)?.startTime ?? 0));
          });
          if (h2) watcher.observe(h2, { childList: true, characterData: true, subtree: true });
        });
      });
      await page.keyboard.press(key);
      await expect(heading).not.toHaveText(before ?? '');
      times.push(
        await page.evaluate(() => (window as unknown as ProbeWindow).followed as Promise<number>),
      );
    }
    const sorted = [...times].sort((a, b) => a - b);
    const median = sorted[1] as number;
    console.log(
      `Scaffold's scene page after the rest, ${test.info().project.name}: ${times.map((t) => t.toFixed(1)).join(', ')} ms (median ${median.toFixed(1)})`,
    );
    expect(median).toBeLessThan(40);
  });
});
