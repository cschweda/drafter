// The runtime in each folder module's frame (drafter-module://<id>/, module-folder.ts): it loads the
// module's index.js, tells the editor's page what the module offers, and gives the module its
// context, whose every call is a message to the page (docs/plans/2026-10-27-desktop-modules-folder.md
// §2, §4). It runs in a frame sandboxed with scripts only, on an opaque origin: it has no storage,
// no network but what the writer agreed to, and no way into the page but these messages. Built by
// tsdown to dist/module-runtime.js and served at RUNTIME_PATH.
import {
  APP_ORIGIN,
  type HostMessage,
  type Method,
  PROTOCOL,
  SURFACES,
  type Surface,
} from '../../web/app/modules/folder-protocol';
import { type FolderContext, type FolderModule, readExport } from './module-export';

const query = new URLSearchParams(location.search).get('surface');
const surface: Surface = (SURFACES as readonly string[]).includes(query ?? '')
  ? (query as Surface)
  : 'background';
/** The module's id is its origin's host. */
const id = location.host;

/** To the editor's page, and nowhere else. */
const send = (message: unknown) => window.parent.postMessage(message, APP_ORIGIN);

let lastCall = 0;
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();

function call(run: number | undefined, method: Method, ...args: unknown[]): Promise<unknown> {
  const callId = ++lastCall;
  return new Promise((resolve, reject) => {
    pending.set(callId, { resolve, reject });
    send({
      drafter: PROTOCOL,
      kind: 'call',
      id: callId,
      ...(run !== undefined && { run }),
      method,
      args,
    });
  });
}

const listeners = new Set<() => void>();

/** A context: outside a run (a tab, settings) or for one run of the button or a command. */
function contextFor(run?: number): FolderContext {
  const ask = <T>(method: Method, ...args: unknown[]) => call(run, method, ...args) as Promise<T>;
  return Object.freeze({
    source: () => ask<string>('source'),
    doc: () => ask('doc'),
    layout: () => ask('layout'),
    layoutFailed: () => ask<boolean>('layoutFailed'),
    template: () => ask('template'),
    title: () => ask<string>('title'),
    kind: () => ask<'fountain' | 'markdown'>('kind'),
    cursor: () => ask<number>('cursor'),
    applyChanges: (changes: unknown) => ask<boolean>('applyChanges', changes),
    setProblems: (items: unknown) => ask<boolean>('setProblems', items),
    goto: (offset: number) => ask<void>('goto', offset),
    confirm: (message: string, options?: unknown) =>
      ask<boolean>('confirm', message, ...(options === undefined ? [] : [options])),
    openTab: () => ask<void>('openTab'),
    storage: Object.freeze({
      get: (key: string) => ask('storage.get', key),
      set: (key: string, value: unknown) => ask<void>('storage.set', key, value),
      remove: (key: string) => ask<void>('storage.remove', key),
    }),
    notify: (message: string) => ask<void>('notify', message),
    onChange(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  });
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The page's colors and fonts, and the frame's base styles. */
function applyTheme(theme: Record<string, unknown>) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(theme)) {
    if (typeof value !== 'string') continue;
    if (name === 'color-scheme') root.style.colorScheme = value;
    else if (name.startsWith('--')) root.style.setProperty(name, value);
  }
  const style = document.createElement('style');
  style.textContent = [
    'html, body { margin: 0; background: transparent; color: var(--text); }',
    'body { font: 13px/1.4 var(--font-sans, system-ui, sans-serif); }',
    'button, input, select, textarea { font: inherit; color: inherit; }',
  ].join('\n');
  document.head.append(style);
}

let loaded: FolderModule | undefined;
let initialised: (() => void) | undefined;
const init = new Promise<void>((resolve) => {
  initialised = resolve;
});

async function runPart(run: number, what: 'action' | 'command', command?: string) {
  try {
    const part =
      what === 'action' ? loaded?.action : loaded?.commands?.find((c) => c.id === command);
    if (!part)
      throw new Error(what === 'action' ? 'it has no button' : `it has no command “${command}”`);
    await part.run(contextFor(run));
    send({ drafter: PROTOCOL, kind: 'done', run });
  } catch (error) {
    send({ drafter: PROTOCOL, kind: 'done', run, error: reason(error) });
  }
}

window.addEventListener('message', (event) => {
  // Only the editor's page speaks for Drafter: another module's frame can post here too.
  if (event.source !== window.parent || event.origin !== APP_ORIGIN) return;
  const message = event.data as HostMessage;
  if (typeof message !== 'object' || message === null || message.drafter !== PROTOCOL) return;
  switch (message.kind) {
    case 'init':
      applyTheme(message.theme ?? {});
      initialised?.();
      return;
    case 'reply': {
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      if (message.ok) waiting.resolve(message.value);
      else waiting.reject(new Error(message.error));
      return;
    }
    case 'run':
      if (surface === 'background') void runPart(message.run, message.what, message.command);
      return;
    case 'changed':
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch (error) {
          console.error(error);
        }
      }
      return;
  }
});

async function start() {
  let imported: unknown;
  try {
    imported = await import(/* @vite-ignore */ new URL('/index.js', location.href).href);
  } catch (error) {
    send({
      drafter: PROTOCOL,
      kind: 'failed',
      error: `its index.js couldn’t be loaded (${reason(error)})`,
    });
    return;
  }
  const read = readExport(imported, id);
  if (typeof read === 'string') {
    send({ drafter: PROTOCOL, kind: 'failed', error: read });
    return;
  }
  loaded = read.module;
  send({ drafter: PROTOCOL, kind: 'ready', parts: read.parts });
  if (surface === 'background') return;
  await init;
  const root = document.getElementById('drafter-module-root') as HTMLElement;
  const part = surface === 'tab' ? loaded.tab : loaded.settings;
  try {
    await part?.mount(root, contextFor());
  } catch (error) {
    send({ drafter: PROTOCOL, kind: 'failed', error: reason(error) });
  }
  if (surface === 'settings') {
    const tell = () =>
      send({ drafter: PROTOCOL, kind: 'size', height: Math.ceil(document.body.scrollHeight) });
    new ResizeObserver(tell).observe(document.body);
    tell();
  }
}

void start();
