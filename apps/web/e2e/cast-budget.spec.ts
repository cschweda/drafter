import { expect, type Page, test } from '@playwright/test';
import type { CastProbe } from '../app/cast/probe';
import { editor, setText, start } from './modules';

// The cast's budgets (seeing-the-script design §11): `castOf` within 15 ms for a 120-page script,
// and no long task while typing with a view holding the cast. These log the times and fail only
// past ten times the budget, as a guard against a hang (the plan's Call 51). A test build puts
// `drafterCastProbe` on the page (app/cast/probe.ts) to time `castOf` and to hold the cast as the
// Stats tab and Scaffold will; Task 6 adds Scaffold itself to the typing test.

type ProbeWindow = Window & { drafterCastProbe: CastProbe; longTasks: number[] };

/** A seeded generator of invented words (Marsaglia's xorshift), so every run types the same text. */
function generator(seed: number) {
  let state = seed;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  const syllables = ['bra', 'tol', 'mev', 'ska', 'rin', 'dou', 'pel', 'vax', 'quo', 'ten', 'lir'];
  const word = (parts = 1 + (next() % 3)) => {
    let w = '';
    for (let i = 0; i < parts; i++) w += syllables[next() % syllables.length];
    return w;
  };
  return { next, word };
}

/**
 * About 120 pages: 185 scenes among 60 invented characters (a third of them two words long), each
 * scene naming three in its action, one capitalised and possessive, with four speeches.
 */
function longScript(): string {
  const { next, word } = generator(2026);
  const names = Array.from({ length: 60 }, (_, i) =>
    `${word(2)}${i % 3 === 0 ? ` ${word(2)}` : ''}`.toUpperCase(),
  );
  const pick = () => names[next() % names.length] as string;
  const capitalised = (name: string) =>
    name
      .toLowerCase()
      .split(' ')
      .map((w) => (w[0] ?? '').toUpperCase() + w.slice(1))
      .join(' ');
  const sentence = (n: number) => Array.from({ length: n }, () => word()).join(' ');
  let text = '';
  for (let s = 0; s < 185; s++) {
    text += `${next() % 2 ? 'INT.' : 'EXT.'} ${word(2).toUpperCase()} - ${next() % 2 ? 'DAY' : 'NIGHT'}\n\n`;
    text += `${sentence(6)} ${pick()} ${sentence(10)} ${capitalised(pick())}'s ${sentence(12)}.\n${sentence(14)}.\n\n`;
    for (let k = 0; k < 4; k++) text += `${pick()}\n${sentence(5 + (next() % 15))}.\n\n`;
    text += `${sentence(20)} ${pick()} ${sentence(9)}.\n\n`;
  }
  return text;
}

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

test.describe('in Chromium', () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile,
    'long tasks are a Chromium API; two panes need a wide screen',
  );

  test('typing while a view needs the cast makes no long task', async ({ page }) => {
    test.setTimeout(120_000);
    await long(page);
    await probe(page, 'need');
    await expect.poll(() => probe(page, 'characters')).toBeGreaterThan(50);

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
    expect(best).toEqual([]);
    await probe(page, 'release');
  });
});
