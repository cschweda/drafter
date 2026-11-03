import { expect, type Page, test } from '@playwright/test';
import type { CastProbe } from '../app/cast/probe';
import { longScript } from './long-script';
import { editor, runCommand, setText, start, wholeText } from './modules';

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

/** Into the first scene's action: every later offset moves, and the cast is worked out again. */
async function intoFirstScene(page: Page) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
}

/**
 * Types into the first scene of the long script, which a view of the cast shows, three times at
 * most, and gives the fewest long tasks a run saw: a busy test machine can give one run a long task
 * that isn't Drafter's.
 */
async function longTasksWhileTyping(
  page: Page,
  place: (page: Page) => Promise<void> = intoFirstScene,
): Promise<number[]> {
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
    await place(page);
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

// Classic Mode's budgets (Classic Mode design §13): with Classic Mode on, a keystroke on line 3,000
// of the 120-page script makes no long task, and adds under 1 ms at p95 against Fountain Mode; a
// switch of mode is one frame's work, plus CodeMirror's measure; scrolling doesn't jump; and the
// metadata block's guard costs a cursor move next to nothing. The editor's work for a key is timed
// around `view.dispatch`, where every change and every filter of both modes runs.

type TimedWindow = Window & { spent: number[]; spending: number };

/** The editor's view, from its content element (as `wholeText` in modules.ts reads it), kept on the window. */
type ViewWindow = Window & { drafterView: unknown };
const exposeView = (page: Page) =>
  page.evaluate(() => {
    type Linked = { view?: unknown };
    const content = document.querySelector('.cm-content') as
      | (Element & { cmTile?: Linked; cmView?: Linked })
      | null;
    (window as unknown as ViewWindow).drafterView = (content?.cmTile ?? content?.cmView)?.view;
  });

/** Times the editor's work for each key: every dispatch from one keydown to the next, summed. */
async function timeKeys(page: Page) {
  await exposeView(page);
  await page.evaluate(() => {
    const w = window as unknown as TimedWindow;
    const view = (window as unknown as ViewWindow).drafterView as {
      dispatch: (...args: unknown[]) => void;
    };
    w.spent = [];
    w.spending = 0;
    const own = view.dispatch;
    view.dispatch = function (this: unknown, ...args: unknown[]) {
      const start = performance.now();
      try {
        own.apply(this, args);
      } finally {
        w.spending += performance.now() - start;
      }
    };
    window.addEventListener(
      'keydown',
      () => {
        w.spent.push(w.spending);
        w.spending = 0;
      },
      { capture: true },
    );
  });
}

/** The times so far (the first key's is the time before it, dropped), and a fresh start. */
const spent = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as TimedWindow;
    const out = [...w.spent.slice(1), w.spending];
    w.spent = [];
    w.spending = 0;
    return out;
  });

const p95 = (times: number[]) => {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
};

/** The first line of dialogue at line 3,000 or after, 1-based. */
function dialogueFrom(text: string, from: number): number {
  const lines = text.split('\n');
  for (let n = from; n < lines.length; n++) {
    const above = lines[n - 2] ?? '';
    const line = lines[n - 1] ?? '';
    if (
      line &&
      /[a-z]/.test(line) &&
      above &&
      above === above.toUpperCase() &&
      /[A-Z]/.test(above)
    ) {
      return n;
    }
  }
  throw new Error('no dialogue past the line');
}

/** The cursor at the end of line `number`, scrolled to and focused, with no pointer. */
async function toLineEnd(page: Page, number: number) {
  await exposeView(page);
  await page.evaluate((n) => {
    const view = (window as unknown as ViewWindow).drafterView as {
      state: { doc: { line(n: number): { to: number } } };
      dispatch(spec: unknown): void;
      focus(): void;
    };
    const { to } = view.state.doc.line(n);
    view.dispatch({ selection: { anchor: to }, scrollIntoView: true, userEvent: 'select' });
    view.focus();
  }, number);
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

/** Classic Mode on from the keys, with its hint put away. */
async function classicOn(page: Page) {
  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+Alt+Digit0');
  await expect(editor(page)).toHaveAttribute('aria-label', 'Source, Classic Mode');
  const hint = page.locator('[data-classic-hint]');
  if (await hint.isVisible()) await hint.getByRole('button', { name: 'Got it' }).click();
}

test.describe('Classic Mode in Chromium', () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile,
    'long tasks are a Chromium API; a wide screen',
  );

  const LINE = dialogueFrom(longScript(), 3000);

  test('Classic Mode typing budget at 120 pages', async ({ page }) => {
    test.setTimeout(120_000);
    await long(page);
    // As "typing with the Stats tab shown" does: the cast is worked out again after the typing.
    await runCommand(page, 'Show stats');
    const stats = page.getByRole('tabpanel', { name: 'Stats', exact: true });
    await expect(stats.getByRole('rowheader')).not.toHaveCount(0);
    await classicOn(page);
    await expect(editor(page)).toBeVisible();
    expect(await longTasksWhileTyping(page, (p) => toLineEnd(p, LINE))).toEqual([]);
  });

  test('Classic Mode adds under 1 ms a keystroke at p95: budget', async ({ page }) => {
    test.setTimeout(180_000);
    await long(page);
    await timeKeys(page);
    const words = 'and still the lights hum over the counter ';
    let counted = Number.POSITIVE_INFINITY;
    const run = async () => {
      await toLineEnd(page, LINE);
      await spent(page);
      await page.keyboard.type(words.repeat(2), { delay: 25 });
      await page.waitForTimeout(300);
      // Each run types on at the same line's end, one mode then the other.
      const times = await spent(page);
      counted = Math.min(counted, times.filter((t) => t > 0).length);
      return times;
    };
    // Best of three each, one mode then the other, so a busy moment doesn't count against either.
    const fountain: number[] = [];
    for (let i = 0; i < 3; i++) fountain.push(p95(await run()));
    await classicOn(page);
    const classic: number[] = [];
    for (let i = 0; i < 3; i++) classic.push(p95(await run()));
    expect(counted, 'every key was timed').toBeGreaterThan(80);
    const f = Math.min(...fountain);
    const c = Math.min(...classic);
    console.log(
      `a keystroke on line ${LINE} at p95, Fountain ${fountain.map((t) => t.toFixed(2)).join(', ')} ms, Classic ${classic.map((t) => t.toFixed(2)).join(', ')} ms: Classic adds ${(c - f).toFixed(2)} ms`,
    );
    expect(c - f).toBeLessThan(1);
  });

  test('a switch at 120 pages: budget', async ({ page }) => {
    test.setTimeout(120_000);
    await long(page);
    await toLineEnd(page, LINE);
    await timeKeys(page);
    const times: number[] = [];
    for (let i = 0; i < 4; i++) {
      await spent(page);
      await page.keyboard.press('ControlOrMeta+Alt+Digit0');
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
      // Mod+Alt+0 is three keydowns; the switch is all the editor did after them.
      times.push((await spent(page)).reduce((a, b) => a + b, 0));
      const hint = page.locator('[data-classic-hint]');
      if (await hint.isVisible()) await hint.getByRole('button', { name: 'Got it' }).click();
      await editor(page).focus();
    }
    console.log(`a switch at 120 pages: ${times.map((t) => t.toFixed(1)).join(', ')} ms`);
    // One frame's worth of main-thread work; CodeMirror's measure comes after, in the frame.
    expect(Math.max(...times)).toBeLessThan(16);
  });

  test('scrolling at 120 pages doesn’t jump in Classic Mode: budget', async ({ page }) => {
    test.setTimeout(120_000);
    await long(page);
    await classicOn(page);
    await page.keyboard.press('ControlOrMeta+Home');
    const scroller = page.locator('.cm-scroller');
    const box = await scroller.boundingBox();
    await page.mouse.move((box?.x ?? 0) + 200, (box?.y ?? 0) + 200);
    /** The offset of the line at the top of the pane. */
    await exposeView(page);
    const top = () =>
      page.evaluate(() => {
        const view = (window as unknown as ViewWindow).drafterView as {
          scrollDOM: HTMLElement;
          documentTop: number;
          lineBlockAtHeight(h: number): { from: number };
        };
        const rect = view.scrollDOM.getBoundingClientRect();
        return view.lineBlockAtHeight(rect.top - view.documentTop + 1).from;
      });
    const height = box?.height ?? 600;
    const tops: number[] = [await top()];
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, 600);
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
      tops.push(await top());
    }
    // Every step goes on down, by about what a wheel moves: never back, never pages ahead.
    const steps = tops.slice(1).map((t, i) => t - (tops[i] as number));
    const chars = await page.evaluate(() => {
      const view = (window as unknown as ViewWindow).drafterView as {
        state: { doc: { length: number } };
        contentHeight: number;
      };
      return view.state.doc.length / view.contentHeight;
    });
    console.log(
      `scrolling in Classic Mode at 120 pages, characters per step: ${steps.join(', ')} (about ${Math.round(chars * 600)} each)`,
    );
    for (const [i, step] of steps.entries()) {
      expect(step, `step ${i + 1}`).toBeGreaterThan(0);
      expect(step, `step ${i + 1}`).toBeLessThan(chars * Math.max(600, height) * 4);
    }
  });

  test('a cursor move beside the metadata block at 120 pages: budget', async ({ page }) => {
    test.setTimeout(120_000);
    await start(page);
    await page.waitForFunction(() => 'drafterCastProbe' in window);
    const play = `${longScript()}/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/\n`;
    await setText(page, play);
    await expect.poll(() => wholeText(page), { timeout: 60_000 }).toBe(play);
    await timeKeys(page);
    const moves = async () => {
      await toLineEnd(page, LINE);
      await spent(page);
      for (let i = 0; i < 60; i++) await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(200);
      return p95(await spent(page));
    };
    const fountain = Math.min(await moves(), await moves());
    await classicOn(page);
    const classic = Math.min(await moves(), await moves());
    console.log(
      `a cursor move at 120 pages with the block, p95: Fountain ${fountain.toFixed(2)} ms, Classic ${classic.toFixed(2)} ms`,
    );
    expect(classic - fountain).toBeLessThan(1);
  });
});
