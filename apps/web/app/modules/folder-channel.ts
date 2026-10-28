import {
  type HostMessage,
  jsonShaped,
  LIMITS,
  messageSize,
  type Parts,
  PROTOCOL,
  readFrameMessage,
  readParts,
  type Surface,
  type Theme,
} from './folder-protocol';
import { answerCall } from './folder-rpc';
import type { ModuleContext } from './types';

/** The calls a background frame may make only inside a run the writer started (minor 5). */
const RUN_ONLY = new Set(['goto', 'confirm', 'applyChanges', 'openTab']);

// The page's end of one folder module frame (folder-protocol.ts): it hears that frame alone,
// answers its calls with the module's own context (or, in a run, the run's), runs the module's
// button and commands, and passes on what the module offers. Pure: the component that draws the
// frame (FolderModuleFrame.vue) hands it the frame's messages and posts what it says.

export interface ChannelOptions {
  /** The module's name: it heads the module's questions and prefixes its notices. */
  name: string;
  /** Which frame this is: a background frame may act only inside a run (minor 5). */
  surface?: 'background' | 'tab' | 'settings';
  /** The frame's window (`iframe.contentWindow`): only its messages are heard. */
  frame(): unknown;
  /** Posts a message to the frame. */
  post(message: HostMessage): void;
  /** The context that answers calls made outside a run (a tab, settings, a run that is over). */
  context(): ModuleContext;
  /** The module has loaded, and offers these. */
  onReady?(parts: Parts): void;
  /** The module couldn't load, or offered parts that aren't right (`why` is a phrase). */
  onFailed?(why: string): void;
  /** The frame's content is this tall. */
  onSize?(height: number): void;
}

interface Run {
  context: ModuleContext;
  resolve(): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export interface FrameChannel {
  /** A `message` event from the window: only the frame's, from its opaque origin, is heard. */
  receive(event: { data: unknown; source: unknown; origin: string }): void;
  /** The frame has loaded its page: tell it where it is and how to look, and start the clock. */
  start(surface?: Surface, theme?: Theme): void;
  /** Runs the module's button, or a command by its id, with `context`. Settles when it is done. */
  run(what: 'action' | 'command', context: ModuleContext, command?: string): Promise<void>;
  /** The script, or the open script, changed: a tab or settings may draw again. */
  changed(): void;
  /** The frame is gone: runs end, and nothing more is heard or said. */
  dispose(): void;
}

/** The context, with the module's name on everything it shows the writer (minor 1). */
function withName(ctx: ModuleContext, name: string): ModuleContext {
  return {
    ...ctx,
    notify: (message: string) => ctx.notify(`${name}: ${message}`),
  };
}

export function frameChannel(options: ChannelOptions): FrameChannel {
  const runs = new Map<number, Run>();
  let lastRun = 0;
  let waiting = 0;
  let ready = false;
  let gone = false;
  let startTimer: ReturnType<typeof setTimeout> | undefined;

  const post = (message: HostMessage) => {
    if (!gone) options.post(message);
  };
  const reply = (id: number, result: { ok: true; value: unknown } | { ok: false; error: string }) =>
    post({ drafter: PROTOCOL, kind: 'reply', id, ...result } as HostMessage);
  const failed = (why: string) => {
    clearTimeout(startTimer);
    options.onFailed?.(why);
  };
  const finish = (id: number, error?: Error) => {
    const run = runs.get(id);
    if (!run) return;
    runs.delete(id);
    clearTimeout(run.timer);
    if (error) run.reject(error);
    else run.resolve();
  };

  async function call(id: number, run: number | undefined, method: string, args: unknown[]) {
    let context: ModuleContext;
    if (run === undefined) {
      // A background frame acts only while the writer has it running (minor 5).
      if (options.surface === 'background' && RUN_ONLY.has(method)) {
        return reply(id, {
          ok: false,
          error: `Drafter runs “${method}” only while it is running.`,
        });
      }
      context = options.context();
    } else {
      const known = runs.get(run);
      if (!known) return reply(id, { ok: false, error: 'That run has ended.' });
      context = known.context;
    }
    waiting++;
    try {
      const value = await answerCall(withName(context, options.name), method, args);
      reply(id, { ok: true, value });
    } catch (error) {
      reply(id, { ok: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      waiting--;
    }
  }

  return {
    receive(event) {
      if (gone || event.source === null || event.source !== options.frame()) return;
      // A frame sandboxed without allow-same-origin has an opaque origin, which reads 'null'.
      if (event.origin !== 'null') return;
      const message = readFrameMessage(event.data);
      if (!message) return;
      if (!jsonShaped(event.data) || messageSize(event.data) > LIMITS.message) {
        if (message.kind === 'call') {
          reply(message.id, {
            ok: false,
            error: 'The message must be plain data, no larger than 4 MB.',
          });
        }
        return;
      }
      switch (message.kind) {
        case 'ready': {
          if (ready) return; // The first `ready` per frame load is the module's; ignore a flood.
          const parts = readParts(message.parts);
          if (typeof parts === 'string') return failed(parts);
          clearTimeout(startTimer);
          ready = true;
          options.onReady?.(parts);
          return;
        }
        case 'failed':
          return failed(message.error);
        case 'size':
          options.onSize?.(Math.min(LIMITS.height, Math.max(0, message.height)));
          return;
        case 'done':
          return finish(
            message.run,
            message.error === undefined ? undefined : new Error(message.error),
          );
        case 'call':
          if (waiting >= LIMITS.inFlight) {
            return reply(message.id, {
              ok: false,
              error: `There are too many calls waiting (at most ${LIMITS.inFlight}).`,
            });
          }
          void call(message.id, message.run, message.method, message.args);
      }
    },
    start(surface, theme) {
      if (surface) post({ drafter: PROTOCOL, kind: 'init', surface, theme: theme ?? {} });
      clearTimeout(startTimer);
      if (!ready) startTimer = setTimeout(() => failed('it didn’t answer'), LIMITS.startMs);
    },
    run(what, context, command) {
      if (gone) return Promise.reject(new Error('it was turned off'));
      if (!ready) return Promise.reject(new Error('it hasn’t started yet'));
      const id = ++lastRun;
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => finish(id, new Error('it took longer than 5 minutes')),
          LIMITS.runMs,
        );
        runs.set(id, { context, resolve, reject, timer });
        post({
          drafter: PROTOCOL,
          kind: 'run',
          run: id,
          what,
          ...(command !== undefined && { command }),
        });
      });
    },
    changed() {
      post({ drafter: PROTOCOL, kind: 'changed' });
    },
    dispose() {
      for (const id of [...runs.keys()]) finish(id, new Error('it was turned off'));
      clearTimeout(startTimer);
      gone = true;
    },
  };
}
