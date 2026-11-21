import { test as base, type CDPSession, type Page, type TestInfo } from '@playwright/test';

export * from '@playwright/test';

type Frame = {
  functionName: string;
  url: string;
  location: { lineNumber: number; columnNumber?: number };
};

const within = <T>(work: Promise<T>, ms: number) =>
  Promise.race([work, new Promise<null>((done) => setTimeout(() => done(null), ms))]);

/**
 * What a page that stopped answering was doing. Now and then (about one run of `checks.yml` in
 * fifty since 2026-11-02) a test times out on a click or a key that never returns, a second or two
 * after the page loaded, and the report's snapshot of the page comes back empty: the page's main
 * thread is busy and stays busy. It has never happened on a writer's machine or in 400 tries
 * here, so the next one has to say where it was.
 *
 * With `HANG_REPORT=1` (set in `checks.yml`), each Chromium page has its debugger on from the
 * start: a page that is spinning can be paused only if it was, since turning it on is itself work
 * for the busy thread. When a test times out the page is paused and the stack is kept with the
 * test's results (`page-stack`) and printed. Three answers are possible: a stack in the app's own
 * files (it was spinning there); a stack of one nameless frame (the page was idle, and the pause
 * caught the next thing to run: the test waited for something that never came); or no pause (the
 * thread is busy outside JavaScript, in layout or the browser itself).
 */
async function reportHang(session: CDPSession, info: TestInfo) {
  let text = 'no pause in 4 seconds: busy outside JavaScript';
  try {
    const paused = new Promise<{ callFrames: Frame[] }>((done) =>
      session.once('Debugger.paused', done),
    );
    void session.send('Debugger.pause').catch(() => {});
    const event = await within(paused, 4000);
    if (event) {
      text = event.callFrames
        .slice(0, 30)
        .map(
          (f) =>
            `${f.functionName || '(anonymous)'} ${f.url.split('/').pop()}:${f.location.lineNumber + 1}:${(f.location.columnNumber ?? 0) + 1}`,
        )
        .join('\n');
      void session.send('Debugger.resume').catch(() => {});
    }
  } catch (error) {
    text = `could not ask: ${String(error).slice(0, 200)}`;
  }
  console.log(`[page-stack] ${info.titlePath.slice(1).join(' › ')}\n${text}`);
  await info.attach('page-stack', { body: text, contentType: 'text/plain' });
}

const reporting = (page: Page, browserName: string) =>
  process.env.HANG_REPORT === '1' && browserName === 'chromium'
    ? page.context().newCDPSession(page)
    : null;

export const test = base.extend({
  page: async ({ page, browserName }, use, info) => {
    const session = await reporting(page, browserName);
    await session?.send('Debugger.enable');
    await use(page);
    if (session && info.status === 'timedOut') await reportHang(session, info);
  },
});
