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

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * The same question asked from outside, with nothing turned on beforehand (`HANG_REPORT=late`).
 * Three hunts of the hang (2026-11-21): 120 runs of the suite with each page's debugger on from
 * the start and no page stopped; 80 with it off, and one did. So the debugger may be what keeps
 * the fault away, and the page has to be looked at only once it has stopped:
 *
 * 1. how much processor each of the browser's processes used over two seconds (a page that is
 *    spinning uses all of one; a page that is waiting for something uses none);
 * 2. on Linux, each thread of the renderers: its name, its state, the processor it used in that
 *    time, and the system call it is in, from /proc;
 * 3. the debugger, turned on now: a page spinning in its own JavaScript still answers it, and gives
 *    its stack; one stuck anywhere else doesn't.
 */
async function reportLate(page: Page, info: TestInfo) {
  const lines: string[] = [];
  const { readFileSync, readdirSync } = await import('node:fs');
  type Proc = { type: string; id: number; cpuTime: number };
  const threads = (pid: number) => {
    const out = new Map<string, { name: string; state: string; ticks: number; call: string }>();
    try {
      for (const tid of readdirSync(`/proc/${pid}/task`)) {
        const stat = readFileSync(`/proc/${pid}/task/${tid}/stat`, 'utf8');
        const name = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'));
        const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        let call = '';
        try {
          call = readFileSync(`/proc/${pid}/task/${tid}/syscall`, 'utf8').split(' ')[0] ?? '';
        } catch {
          // Not readable: goes without.
        }
        out.set(tid, {
          name,
          state: rest[0] ?? '?',
          ticks: Number(rest[11]) + Number(rest[12]),
          call: call.trim(),
        });
      }
    } catch {
      // Not Linux, or the process has gone.
    }
    return out;
  };
  try {
    const browser = page.context().browser();
    const session = browser ? await within(browser.newBrowserCDPSession(), 3000) : null;
    const sample = async (): Promise<Proc[]> =>
      (session
        ? ((await within(session.send('SystemInfo.getProcessInfo'), 3000)) as {
            processInfo: Proc[];
          } | null)
        : null
      )?.processInfo ?? [];
    const first = await sample();
    const before = new Map(first.map((p) => [p.id, threads(p.id)]));
    await pause(2000);
    const second = await sample();
    if (second.length === 0) lines.push('the browser gave no account of its processes');
    for (const p of second) {
      const was = first.find((q) => q.id === p.id);
      const used = was ? (p.cpuTime - was.cpuTime).toFixed(2) : '?';
      lines.push(`${p.type} ${p.id}: ${used} s of processor in 2 s`);
      if (p.type !== 'renderer') continue;
      const then = before.get(p.id);
      for (const [tid, t] of threads(p.id)) {
        const ticks = t.ticks - (then?.get(tid)?.ticks ?? t.ticks);
        // The main thread always; any other only if it ran.
        if (tid !== String(p.id) && ticks === 0 && t.state !== 'R') continue;
        lines.push(
          `    ${t.name.padEnd(16)} state ${t.state}, ${ticks} ticks, system call ${t.call || '?'}`,
        );
      }
    }
  } catch (error) {
    lines.push(`could not ask the browser: ${String(error).slice(0, 200)}`);
  }
  try {
    const session = await within(page.context().newCDPSession(page), 3000);
    if (!session) lines.push('no session with the page in 3 seconds');
    else {
      const paused = new Promise<{ callFrames: Frame[] }>((done) =>
        session.once('Debugger.paused', done),
      );
      const enabled = await within(
        session.send('Debugger.enable').then(
          () => 'on',
          (error) => `refused: ${String(error).slice(0, 120)}`,
        ),
        4000,
      );
      lines.push(`debugger, turned on now: ${enabled ?? 'no answer in 4 seconds'}`);
      void session.send('Debugger.pause').catch(() => {});
      const event = await within(paused, 4000);
      if (!event) lines.push('no pause in 4 seconds');
      else {
        for (const f of event.callFrames.slice(0, 30)) {
          lines.push(
            `  ${f.functionName || '(anonymous)'} ${f.url.split('/').pop()}:${f.location.lineNumber + 1}:${(f.location.columnNumber ?? 0) + 1}`,
          );
        }
        void session.send('Debugger.resume').catch(() => {});
      }
    }
  } catch (error) {
    lines.push(`could not ask the page: ${String(error).slice(0, 200)}`);
  }
  const text = lines.join('\n');
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
    // A page with JavaScript off ("without JavaScript" in docs.spec.ts) refuses the debugger, and
    // has nothing to spin in: it goes without.
    const on = session
      ? await session.send('Debugger.enable').then(
          () => true,
          () => false,
        )
      : false;
    await use(page);
    if (session && on && info.status === 'timedOut') await reportHang(session, info);
    if (
      process.env.HANG_REPORT === 'late' &&
      browserName === 'chromium' &&
      info.status === 'timedOut'
    ) {
      await reportLate(page, info);
    }
  },
});
