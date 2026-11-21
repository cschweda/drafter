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
 * Four hunts of the hang (2026-11-21): 120 runs of the suite with each page's debugger on from
 * the start and no page stopped; 80 with it off, and one did; 120 looked at only once stopped,
 * and three did. Those three were not spinning: the renderer used no processor at all, its main
 * thread asleep in a futex, and the debugger turned on then got no answer. So the page is waiting
 * for something that never comes, and this asks what:
 *
 * 1. how much processor each of the browser's processes used over two seconds, and on Linux each
 *    renderer thread's state, system call, and how often it woke (a thread that is idle wakes for
 *    its timers; one that is blocked doesn't wake at all);
 * 2. the main thread's stack, by gdb (Linux; the workflow installs it). The browser has no
 *    symbols, so each frame is given as a place in its file, to set beside the same stack of a
 *    page that works;
 * 3. whether the page answers anything (`1+1`);
 * 4. a second page of the same context, opened now: whether it loads, whether the storage answers
 *    it, and which locks are held and waited for. Then its main thread's stack, for comparison.
 */
async function reportLate(page: Page, info: TestInfo) {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { execFile } = await import('node:child_process');
  const all: string[] = [];
  // Said at once as well as kept: the time a stopped test has left may run out part way.
  const say = (...lines: string[]) => {
    all.push(...lines);
    console.log(lines.join('\n'));
  };
  say(`[page-stack] ${info.titlePath.slice(1).join(' › ')}`);
  type Proc = { type: string; id: number; cpuTime: number };
  type Thread = { name: string; state: string; ticks: number; call: string; woke: number };
  const threads = (pid: number) => {
    const out = new Map<string, Thread>();
    try {
      for (const tid of readdirSync(`/proc/${pid}/task`)) {
        const stat = readFileSync(`/proc/${pid}/task/${tid}/stat`, 'utf8');
        const name = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'));
        const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        let call = '';
        let woke = 0;
        try {
          call = readFileSync(`/proc/${pid}/task/${tid}/syscall`, 'utf8').split(' ')[0] ?? '';
          const status = readFileSync(`/proc/${pid}/task/${tid}/status`, 'utf8');
          for (const m of status.matchAll(/ctxt_switches:\s+(\d+)/g)) woke += Number(m[1]);
        } catch {
          // Not readable: goes without.
        }
        out.set(tid, {
          name,
          state: rest[0] ?? '?',
          ticks: Number(rest[11]) + Number(rest[12]),
          call: call.trim(),
          woke,
        });
      }
    } catch {
      // Not Linux, or the process has gone.
    }
    return out;
  };
  /** The main thread's stack, each frame as a place in the file it is in. */
  const stack = (pid: number) =>
    new Promise<string[]>((done) => {
      const maps: Array<{ from: bigint; to: bigint; at: bigint; file: string }> = [];
      try {
        for (const line of readFileSync(`/proc/${pid}/maps`, 'utf8').split('\n')) {
          const m = /^([0-9a-f]+)-([0-9a-f]+) \S+ ([0-9a-f]+) \S+ \S+\s*(.*)$/.exec(line);
          if (!m) continue;
          maps.push({
            from: BigInt(`0x${m[1]}`),
            to: BigInt(`0x${m[2]}`),
            at: BigInt(`0x${m[3]}`),
            file: (m[4] ?? '').split('/').pop() || '(memory)',
          });
        }
      } catch {
        // Not Linux, or not readable: the addresses go as they are.
      }
      execFile(
        'sudo',
        [
          ...['-n', 'timeout', '10', 'gdb', '-nx', '-batch'],
          ...[
            '-iex',
            'set debuginfod enabled off',
            '-p',
            String(pid),
            '-ex',
            'bt 70',
            '-ex',
            'thread apply all bt 12',
          ],
        ],
        { timeout: 12_000, maxBuffer: 4_000_000 },
        (error, out) => {
          const frames: string[] = [];
          for (const line of String(out).split('\n')) {
            if (line.startsWith('Thread ')) frames.push(`  ${line.slice(0, 80)}`);
            const m = /^#(\d+)\s+(?:0x([0-9a-f]+) in )?(\S+)/.exec(line);
            if (!m) continue;
            let where = '';
            if (m[2]) {
              const at = BigInt(`0x${m[2]}`);
              const map = maps.find((r) => at >= r.from && at < r.to);
              where = map ? `${map.file}+0x${(at - map.from + map.at).toString(16)}` : `0x${m[2]}`;
            }
            frames.push(`    #${m[1]} ${m[3]} ${where}`);
          }
          if (frames.length === 0)
            frames.push(
              `    no stack: ${String(error).slice(0, 160)} ${String(out).slice(0, 600)}`,
            );
          done(frames);
        },
      );
    });
  let session: CDPSession | null = null;
  const sample = async (): Promise<Proc[]> =>
    (session
      ? ((await within(session.send('SystemInfo.getProcessInfo'), 3000)) as {
          processInfo: Proc[];
        } | null)
      : null
    )?.processInfo ?? [];
  const renderers = (procs: Proc[]) => procs.filter((p) => p.type === 'renderer').map((p) => p.id);
  let stopped: number[] = [];
  try {
    const browser = page.context().browser();
    session = browser ? await within(browser.newBrowserCDPSession(), 3000) : null;
    const first = await sample();
    const before = new Map(first.map((p) => [p.id, threads(p.id)]));
    await pause(2000);
    const second = await sample();
    stopped = renderers(second);
    if (second.length === 0) say('the browser gave no account of its processes');
    for (const p of second) {
      const was = first.find((q) => q.id === p.id);
      const used = was ? (p.cpuTime - was.cpuTime).toFixed(2) : '?';
      say(`${p.type} ${p.id}: ${used} s of processor in 2 s`);
      if (p.type !== 'renderer') continue;
      const then = before.get(p.id);
      for (const [tid, t] of threads(p.id)) {
        const old = then?.get(tid);
        const ticks = t.ticks - (old?.ticks ?? t.ticks);
        const woke = t.woke - (old?.woke ?? t.woke);
        // The main thread always; any other only if it ran.
        if (tid !== String(p.id) && ticks === 0 && t.state !== 'R') continue;
        say(
          `    ${t.name.padEnd(16)} state ${t.state}, ${ticks} ticks, woke ${woke} times, system call ${t.call || '?'}`,
        );
      }
    }
  } catch (error) {
    say(`could not ask the browser: ${String(error).slice(0, 200)}`);
  }
  const stacks = Promise.all(stopped.map(async (pid) => [pid, await stack(pid)] as const));
  try {
    const own = await within(page.context().newCDPSession(page), 3000);
    const answer = own
      ? await within(
          own.send('Runtime.evaluate', { expression: '1+1' }).then(
            () => 'answered',
            (error) => `refused: ${String(error).slice(0, 120)}`,
          ),
          3000,
        )
      : 'no session in 3 seconds';
    say(`the page, asked for 1+1: ${answer ?? 'no answer in 3 seconds'}`);
  } catch (error) {
    say(`could not ask the page: ${String(error).slice(0, 200)}`);
  }
  let second: Page | null = null;
  try {
    second = await within(page.context().newPage(), 4000);
    if (!second) say('a second page: none in 4 seconds');
    else {
      const loaded = await second
        .goto(page.url(), { waitUntil: 'domcontentloaded', timeout: 6000 })
        .then(
          () => 'loaded',
          (error) => `did not load: ${String(error).slice(0, 120)}`,
        );
      const told = await within(
        second.evaluate(async () => {
          const soon = <T>(work: Promise<T>) =>
            Promise.race([
              work,
              new Promise<string>((done) => setTimeout(() => done('no answer in 2 s'), 2000)),
            ]).catch((error) => `refused: ${String(error)}`);
          let stored: number | string;
          try {
            stored = localStorage.length;
          } catch (error) {
            stored = String(error);
          }
          return {
            stored,
            locks: await soon(navigator.locks.query()),
            databases: await soon(indexedDB.databases().then((list) => list.map((d) => d.name))),
          };
        }),
        5000,
      );
      say(`a second page of the same context: ${loaded}`, `    ${JSON.stringify(told)}`);
    }
  } catch (error) {
    say(`a second page: ${String(error).slice(0, 200)}`);
  }
  for (const [pid, frames] of await stacks)
    say(`main thread of renderer ${pid}, stopped:`, ...frames);
  try {
    const fresh = renderers(await sample()).filter((pid) => !stopped.includes(pid));
    if (second && fresh.length === 0) say('the second page has no process of its own');
    for (const pid of fresh.slice(0, 1)) {
      say(`main thread of renderer ${pid}, the second page's:`, ...(await stack(pid)));
    }
    if (second) void second.close().catch(() => {});
  } catch (error) {
    say(`could not compare: ${String(error).slice(0, 200)}`);
  }
  await info.attach('page-stack', { body: all.join('\n'), contentType: 'text/plain' });
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
