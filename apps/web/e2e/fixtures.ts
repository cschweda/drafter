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
            // Round 12: the unwinder gives up a few frames in (the browser has no unwind tables
            // it can read), so the stack's own words are read as well. Each that points into
            // the browser's file may be a return address: set beside the same build's file,
            // they say which functions the thread is inside.
            '-ex',
            'echo SCAN\\n',
            '-ex',
            'thread apply all x/700xg $sp',
          ],
        ],
        { timeout: 14_000, maxBuffer: 16_000_000 },
        (error, out) => {
          const frames: string[] = [];
          const [bt = '', scan = ''] = String(out).split('\nSCAN\n');
          const found: string[] = [];
          let whose = '';
          const flush = () => {
            // The main thread in full; a few words of each other.
            if (whose && found.length > 0)
              frames.push(
                `  scan ${whose}: ${found.slice(0, whose.startsWith('Thread 1 ') ? 320 : 40).join(' ')}`,
              );
            found.length = 0;
          };
          const exe = maps.find((r) => /chrom/.test(r.file))?.file;
          const scanned = () => {
            for (const line of scan.split('\n')) {
              if (line.startsWith('Thread ')) {
                flush();
                whose = line.slice(0, 60);
                continue;
              }
              const words = /^0x[0-9a-f]+[^:]*:\s+(.*)$/.exec(line)?.[1];
              if (!words) continue;
              for (const word of words.split(/\s+/)) {
                if (!/^0x[0-9a-f]{9,}$/.test(word)) continue;
                const at = BigInt(word);
                const map = maps.find((r) => at >= r.from && at < r.to);
                if (map && map.file === exe) found.push((at - map.from + map.at).toString(16));
              }
            }
            flush();
          };
          for (const line of bt.split('\n')) {
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
          scanned();
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
  /** Renderers whose main thread did not wake once in the two seconds. */
  const asleep: number[] = [];
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
        // The app's page has a worker (the spelling); an idle spare renderer has none. First.
        if (tid === String(p.id) && woke === 0 && old) {
          const app = [...threads(p.id).values()].some((x) => x.name.startsWith('DedicatedWorker'));
          if (app) asleep.unshift(p.id);
          else asleep.push(p.id);
        }
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
  const got = await stacks;
  // Round 8, in the browser that has symbols to be had (HUNT_CORE, a folder): the whole of each
  // renderer whose main thread never woke is written out, for the workflow to read with the
  // symbols once the tests are done. gdb has let go by now (`got`); two can't hold one process.
  if (process.env.HUNT_CORE && asleep.length > 0) {
    for (const pid of asleep.slice(0, 2)) {
      const began = Date.now();
      const out = await new Promise<string>((done) =>
        execFile(
          'sudo',
          ['-n', 'timeout', '90', 'gcore', '-o', `${process.env.HUNT_CORE}/core`, String(pid)],
          { timeout: 95_000, maxBuffer: 4_000_000 },
          (error, text, errors) =>
            done(
              `${error ? String(error).slice(0, 200) : 'written'} ${String(text).slice(-200)} ${String(errors).slice(-200)}`,
            ),
        ),
      );
      say(`core of renderer ${pid} in ${Date.now() - began} ms: ${out.replace(/\s+/g, ' ')}`);
    }
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
  for (const [pid, frames] of got) say(`main thread of renderer ${pid}, stopped:`, ...frames);
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

/**
 * The breadcrumbs of rounds 7 and 8 (`HANG_REPORT=crumbs`). Six rounds say a stopped page is asleep inside a
 * call into the browser that never returns, reached from the page's own JavaScript, and nothing
 * can be asked of the page once it has. So each page says what it is about to do before every
 * call of that kind (one that can wait on another process or thread), as a line on the console:
 * the last line before a page stops names the call it did not come back from.
 */
function crumbs() {
  const say = console.debug.bind(console);
  let n = 0;
  const crumb = (name: string) => say(`[crumb] ${++n} ${name}`);
  const wrap = (owner: object | undefined, method: string, name: string) => {
    if (!owner) return;
    const was = (owner as Record<string, unknown>)[method];
    if (typeof was !== 'function') return;
    (owner as Record<string, unknown>)[method] = function (this: unknown, ...args: unknown[]) {
      const first = typeof args[0] === 'string' ? ` ${args[0].slice(0, 40)}` : '';
      crumb(`${name}${first}`);
      const out = (was as (...a: unknown[]) => unknown).apply(this, args);
      crumb(`${name} back`);
      return out;
    };
  };
  const built = (name: string) => {
    const was = (globalThis as Record<string, unknown>)[name];
    if (typeof was !== 'function') return;
    (globalThis as Record<string, unknown>)[name] = new Proxy(was, {
      construct(target, args, self) {
        crumb(
          `new ${name} ${String(args[0] ?? '')
            .split('/')
            .pop()
            ?.slice(0, 40)}`,
        );
        const out = Reflect.construct(target, args, self) as object;
        crumb(`new ${name} back`);
        return out;
      },
    });
  };
  const proto = (name: string) =>
    ((globalThis as Record<string, unknown>)[name] as { prototype?: object } | undefined)
      ?.prototype;
  for (const m of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
    wrap(proto('Storage'), m, `storage.${m}`);
  }
  for (const m of ['measureText', 'getImageData', 'drawImage', 'fillText']) {
    wrap(proto('CanvasRenderingContext2D'), m, `canvas.${m}`);
  }
  for (const m of ['getContext', 'toDataURL', 'toBlob']) {
    wrap(proto('HTMLCanvasElement'), m, `canvas.${m}`);
  }
  for (const m of ['load', 'check']) wrap(proto('FontFaceSet'), m, `fonts.${m}`);
  for (const m of ['postMessage', 'terminate']) wrap(proto('Worker'), m, `worker.${m}`);
  wrap(proto('BroadcastChannel'), 'postMessage', 'channel.postMessage');
  wrap(proto('IDBFactory'), 'open', 'indexedDB.open');
  for (const m of ['request', 'query']) wrap(proto('LockManager'), m, `locks.${m}`);
  for (const m of ['pushState', 'replaceState']) wrap(proto('History'), m, `history.${m}`);
  for (const m of ['open', 'send']) wrap(proto('XMLHttpRequest'), m, `xhr.${m}`);
  for (const m of ['persist', 'persisted', 'estimate', 'getDirectory']) {
    wrap(proto('StorageManager'), m, `storage.${m}`);
  }
  for (const m of ['register', 'getRegistration', 'getRegistrations']) {
    wrap(proto('ServiceWorkerContainer'), m, `serviceWorker.${m}`);
  }
  for (const m of ['getVoices', 'speak']) wrap(proto('SpeechSynthesis'), m, `speech.${m}`);
  for (const m of ['createObjectURL', 'revokeObjectURL']) {
    wrap((globalThis as Record<string, unknown>).URL as object, m, `URL.${m}`);
  }
  wrap(globalThis, 'fetch', 'fetch');
  wrap(globalThis, 'matchMedia', 'matchMedia');
  for (const name of ['Worker', 'SharedWorker', 'AudioContext', 'BroadcastChannel', 'FontFace']) {
    built(name);
  }
  const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  if (cookie?.get) {
    const get = cookie.get;
    Object.defineProperty(Document.prototype, 'cookie', {
      ...cookie,
      get(this: Document) {
        crumb('document.cookie');
        return get.call(this);
      },
    });
  }
  // The page's own clock, so a stop shows as the lines ending. Set before the timers are wrapped.
  setInterval(() => crumb('tick'), 250);

  // Round 8. In round 7 two pages stopped with every call above returned: so the page was in a
  // call not listed, or in none (laying out, painting). These say which of the page's own
  // functions was running: each timer, frame, microtask, event listener, handler and observer
  // says `> kind, the start of its source` going in and `< kind` coming out. And the calls that
  // make the browser lay the page out say so too.
  type Fn = (...args: unknown[]) => unknown;
  const snip = (f: unknown) => String(f).replace(/\s+/g, ' ').slice(0, 70);
  const tasks = new WeakMap<object, Fn>();
  const task = (kind: string, f: unknown): unknown => {
    if (typeof f !== 'function') return f;
    const known = tasks.get(f);
    if (known) return known;
    const mine = function (this: unknown, ...args: unknown[]) {
      const type = kind === 'event' ? ` ${(args[0] as Event | undefined)?.type ?? ''}` : '';
      crumb(`> ${kind}${type} ${snip(f)}`);
      try {
        return (f as Fn).apply(this, args);
      } finally {
        crumb(`< ${kind}${type}`);
      }
    };
    tasks.set(f, mine);
    return mine;
  };
  const g = globalThis as Record<string, unknown>;
  for (const name of [
    'setTimeout',
    'setInterval',
    'requestAnimationFrame',
    'requestIdleCallback',
    'queueMicrotask',
  ]) {
    const was = g[name];
    if (typeof was !== 'function') continue;
    g[name] = function (this: unknown, f: unknown, ...rest: unknown[]) {
      return (was as Fn).call(globalThis, task(name, f), ...rest);
    };
  }
  const target = proto('EventTarget') as Record<string, Fn> | undefined;
  if (target) {
    const add = target.addEventListener as Fn;
    const remove = target.removeEventListener as Fn;
    target.addEventListener = function (this: unknown, type, f, ...rest) {
      return add.call(this, type, task('event', f), ...rest);
    };
    target.removeEventListener = function (this: unknown, type, f, ...rest) {
      return remove.call(this, type, (typeof f === 'function' && tasks.get(f)) || f, ...rest);
    };
  }
  const handler = (owner: string, prop: string) => {
    const at = proto(owner);
    const was = at && Object.getOwnPropertyDescriptor(at, prop);
    if (!at || !was?.set) return;
    const set = was.set;
    Object.defineProperty(at, prop, {
      ...was,
      set(this: unknown, f: unknown) {
        set.call(this, task(`${owner}.${prop}`, f));
      },
    });
  };
  for (const owner of ['Worker', 'MessagePort', 'BroadcastChannel']) handler(owner, 'onmessage');
  for (const prop of ['onsuccess', 'onerror']) handler('IDBRequest', prop);
  for (const prop of ['onupgradeneeded', 'onblocked']) handler('IDBOpenDBRequest', prop);
  for (const prop of ['oncomplete', 'onerror', 'onabort']) handler('IDBTransaction', prop);
  for (const name of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) {
    const was = g[name];
    if (typeof was !== 'function') continue;
    g[name] = new Proxy(was, {
      construct: (made, args, self) =>
        Reflect.construct(made, [task(name, args[0]), ...args.slice(1)], self) as object,
    });
  }
  wrap(proto('Element'), 'scrollIntoView', 'element.scrollIntoView');
  for (const m of ['focus', 'blur']) wrap(proto('HTMLElement'), m, `element.${m}`);
  for (const m of ['elementFromPoint', 'elementsFromPoint', 'caretRangeFromPoint', 'hasFocus']) {
    wrap(proto('Document'), m, `document.${m}`);
  }
  wrap(globalThis, 'getSelection', 'getSelection');
  const reads = (owner: string, props: string[]) => {
    const at = proto(owner);
    for (const prop of props) {
      const was = at && Object.getOwnPropertyDescriptor(at, prop);
      if (!at || !was?.get) continue;
      const get = was.get;
      Object.defineProperty(at, prop, {
        ...was,
        get(this: unknown) {
          crumb(`${owner}.${prop}`);
          const out: unknown = get.call(this);
          crumb(`${owner}.${prop} back`);
          return out;
        },
      });
    }
  };
  reads('ServiceWorkerContainer', ['controller', 'ready']);
  reads('Navigator', ['onLine', 'languages', 'userActivation']);
  reads('Notification', ['permission']);
}

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
    const leaving = process.env.HANG_REPORT === 'crumbs' && browserName === 'chromium';
    const said: string[] = [];
    if (leaving) {
      await page.addInitScript(crumbs);
      page.on('console', (message) => {
        const text = message.text();
        if (!text.startsWith('[crumb]')) return;
        said.push(`${(Date.now() % 100_000) / 1000} ${text.slice(8)}`);
        if (said.length > 3000) said.shift();
      });
    }
    await use(page);
    if (session && on && info.status === 'timedOut') await reportHang(session, info);
    if (leaving && info.status === 'timedOut') {
      // The lines up to the last one that isn't the clock's, and the clock's after it.
      const text = said.slice(-260).join('\n');
      console.log(
        `[page-crumbs] ${info.titlePath.slice(1).join(' › ')} at ${(Date.now() % 100_000) / 1000}\n${text}`,
      );
      await info.attach('page-crumbs', { body: said.join('\n'), contentType: 'text/plain' });
    }
    if (
      (leaving || process.env.HANG_REPORT === 'late') &&
      browserName === 'chromium' &&
      info.status === 'timedOut'
    ) {
      await reportLate(page, info);
    }
  },
});
