import { expect, type Page, test } from '@playwright/test';
import type { HistoryProbe, ProbeScan } from '../app/history/probe';
import { LONG_SCENES, longScript, newScreenplay, seedLongHistory } from './bulk-snapshot';
import { editor, start } from './modules';

// The history worker (version-history design §3.4) on a long history: 300 snapshots of a 120-page
// script. The budgets are Chromium's on the maintainer's machine; these log the times and fail only
// past ten times the budget, as a guard against a hang (DECISIONS 2026-10-29, the plan's Call 42).
// A test build puts `drafterHistoryProbe` on the page to drive the worker (app/history/probe.ts).

const SNAPSHOTS = 300;
/** Scenes the script no longer has: every snapshot has them, so each is listed. */
const CUT = [20, 75, 130];
const NOW = longScript(LONG_SCENES.filter((_, n) => !CUT.includes(n)));

type ProbeWindow = Window & { drafterHistoryProbe: HistoryProbe; scanning?: Promise<ProbeScan> };

/** A new screenplay with a long history, the cache empty; returns its id. */
async function longHistory(page: Page): Promise<string> {
  await start(page);
  await newScreenplay(page);
  await page.waitForFunction(() => 'drafterHistoryProbe' in window);
  const projectId = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const all = db.transaction('projects').objectStore('projects').getAll();
          all.onsuccess = () => {
            db.close();
            const mine = (all.result as Array<{ id: string; sample?: string }>).find(
              (p) => !p.sample,
            );
            if (mine) resolve(mine.id);
            else reject(new Error('no script of the writer’s own'));
          };
        };
      }),
  );
  await seedLongHistory(page, projectId, SNAPSHOTS);
  await page.evaluate(
    (id) => (window as unknown as ProbeWindow).drafterHistoryProbe.clearCache(id),
    projectId,
  );
  return projectId;
}

const scan = (page: Page, projectId: string, now: string) =>
  page.evaluate(
    ({ projectId, now }) =>
      (window as unknown as ProbeWindow).drafterHistoryProbe.scan({
        kind: 'deleted',
        projectId,
        now,
      }),
    { projectId, now },
  );

const release = (page: Page) =>
  page.evaluate(() => (window as unknown as ProbeWindow).drafterHistoryProbe.release());

/** The three cut scenes are listed, and all 300 snapshots were read. */
function expectFound(result: ProbeScan) {
  expect(result.error).toBeNull();
  expect(result.rows).toBe(CUT.length);
  expect(result.progress).toMatchObject({
    read: SNAPSHOTS,
    total: SNAPSHOTS,
    unreadable: 0,
    capped: false,
  });
}

test.describe('the history worker on a long history', () => {
  test.setTimeout(240_000);

  test('a cold scan of 300 snapshots of a 120-page script lists its first rows quickly and finishes', async ({
    page,
    browserName,
  }, testInfo) => {
    const projectId = await longHistory(page);
    const cold = await scan(page, projectId, NOW);
    console.log(
      `[${testInfo.project.name}] cold scan of ${SNAPSHOTS}: first rows ${cold.firstRowsMs?.toFixed(0)} ms, done ${cold.doneMs.toFixed(0)} ms, ${cold.updates} updates (${browserName})`,
    );
    expectFound(cold);
    // Budgets: first rows 1 s, the whole scan 10 s.
    expect(cold.firstRowsMs).not.toBeNull();
    expect(cold.firstRowsMs as number).toBeLessThan(10_000);
    expect(cold.doneMs).toBeLessThan(100_000);
    // The list streamed while it read.
    expect(cold.updates).toBeGreaterThan(1);
  });

  test('a warm scan is fast', async ({ page, browserName }, testInfo) => {
    const projectId = await longHistory(page);
    expectFound(await scan(page, projectId, NOW));
    // A new worker: every print is in the cache, and no snapshot is read.
    await release(page);
    const warm = await scan(page, projectId, NOW);
    // The same worker, the script changed: matching again from what it holds.
    const changed = longScript(LONG_SCENES.filter((_, n) => !CUT.includes(n) && n !== 40));
    const again = await scan(page, projectId, changed);
    console.log(
      `[${testInfo.project.name}] warm scan of ${SNAPSHOTS}: ${warm.doneMs.toFixed(0)} ms; matching again after an edit: ${again.doneMs.toFixed(0)} ms (${browserName})`,
    );
    expectFound(warm);
    expect(again.rows).toBe(CUT.length + 1);
    // Budgets: a warm scan 500 ms, matching now 50 ms.
    expect(warm.doneMs).toBeLessThan(5_000);
    expect(again.doneMs).toBeLessThan(500);
  });

  test.describe('in Chromium', () => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'long tasks are a Chromium API');

    test('typing during a scan makes no long task', async ({ page }) => {
      const projectId = await longHistory(page);
      await page.evaluate(() => {
        const long: number[] = [];
        (window as unknown as { longTasks: number[] }).longTasks = long;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) long.push(entry.duration);
        }).observe({ type: 'longtask', buffered: false });
      });
      const longTasks = () =>
        page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks);
      // Proof the observer sees a task of about 80 ms; then only the typing is judged.
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

      await editor(page).click();
      await page.keyboard.press('ControlOrMeta+End');
      await page.evaluate(
        ({ projectId, now }) => {
          const w = window as unknown as ProbeWindow;
          w.scanning = w.drafterHistoryProbe.scan({ kind: 'deleted', projectId, now });
        },
        { projectId, now: NOW },
      );
      await page.keyboard.type('\nTyping while the history is read, a letter at a time.', {
        delay: 40,
      });
      const result = await page.evaluate(() => (window as unknown as ProbeWindow).scanning);
      expectFound(result as ProbeScan);
      await page.waitForTimeout(500);
      expect(await longTasks()).toEqual([]);
    });
  });
});
