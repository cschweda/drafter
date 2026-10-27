// The messages between the editor's page and a folder module's frame (the desktop app's modules
// folder: docs/plans/2026-10-27-desktop-modules-folder.md §4). Pure, and free of Vue and the
// editor: the desktop app's frame runtime (apps/desktop/src/module-runtime.ts) imports it too.

/** Every message carries this, so a stray message from elsewhere is never read as one of ours. */
export const PROTOCOL = 1;

/** The app page's origin, the only one a frame's runtime listens to. */
export const APP_ORIGIN = 'app://drafter';

/** Where a frame runs the module: hidden (its button and commands), its tab, or its settings. */
export type Surface = 'background' | 'tab' | 'settings';
export const SURFACES: readonly Surface[] = ['background', 'tab', 'settings'];

/** What a module's frame may ask of its context: `ModuleContext`'s calls, and no others. */
export const METHODS = [
  'source',
  'doc',
  'layout',
  'layoutFailed',
  'template',
  'title',
  'kind',
  'cursor',
  'applyChanges',
  'setProblems',
  'goto',
  'confirm',
  'openTab',
  'storage.get',
  'storage.set',
  'storage.remove',
  'notify',
] as const;
export type Method = (typeof METHODS)[number];

export const LIMITS = {
  /** The largest message a frame may send (its JSON). */
  message: 4 * 1024 * 1024,
  /** Calls that may wait for an answer at once, per frame. */
  inFlight: 64,
  changes: 10_000,
  problems: 5_000,
  /** A `notify` or `confirm` message. */
  text: 2_000,
  /** A button's or a confirm button's label, a tab's or a command's title. */
  label: 80,
  key: 200,
  /** A stored value (its JSON). */
  value: 1024 * 1024,
  commands: 50,
  /** How long a frame has to say it is ready. */
  startMs: 15_000,
  /** How long a button's or a command's run may take. */
  runMs: 5 * 60_000,
  /** The tallest a settings frame is drawn. */
  height: 800,
} as const;

/** What a module offers, as its frame reports it once loaded. */
export interface Parts {
  action?: { label: string };
  tab?: { id: string; label: string };
  commands: Array<{ id: string; title: string }>;
  settings: boolean;
}

/** The colors and font a frame draws with, from the page's theme. */
export type Theme = Record<string, string>;

export type FrameMessage =
  | { drafter: 1; kind: 'ready'; parts: unknown }
  | { drafter: 1; kind: 'call'; id: number; run?: number; method: string; args: unknown[] }
  | { drafter: 1; kind: 'done'; run: number; error?: string }
  | { drafter: 1; kind: 'failed'; error: string }
  | { drafter: 1; kind: 'size'; height: number };

export type HostMessage =
  | { drafter: 1; kind: 'init'; surface: Surface; theme: Theme }
  | { drafter: 1; kind: 'reply'; id: number; ok: true; value: unknown }
  | { drafter: 1; kind: 'reply'; id: number; ok: false; error: string }
  | { drafter: 1; kind: 'run'; run: number; what: 'action' | 'command'; command?: string }
  | { drafter: 1; kind: 'changed' };

const whole = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A message from a frame, if it is one: the right shape, with nothing taken but its known fields. */
export function readFrameMessage(data: unknown): FrameMessage | null {
  if (!record(data) || data.drafter !== PROTOCOL) return null;
  switch (data.kind) {
    case 'ready':
      return { drafter: 1, kind: 'ready', parts: data.parts };
    case 'call': {
      const { id, run, method, args } = data;
      if (!whole(id) || typeof method !== 'string' || !Array.isArray(args)) return null;
      if (run !== undefined && !whole(run)) return null;
      return { drafter: 1, kind: 'call', id, ...(run !== undefined && { run }), method, args };
    }
    case 'done': {
      if (!whole(data.run)) return null;
      const error = data.error === undefined ? undefined : String(data.error);
      return { drafter: 1, kind: 'done', run: data.run, ...(error !== undefined && { error }) };
    }
    case 'failed':
      return { drafter: 1, kind: 'failed', error: String(data.error ?? 'it failed') };
    case 'size':
      return typeof data.height === 'number' && Number.isFinite(data.height)
        ? { drafter: 1, kind: 'size', height: data.height }
        : null;
    default:
      return null;
  }
}

/** Lowercase letters and digits joined by single hyphens, as a compiled-in module's ids are. */
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const label = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '' && value.length <= LIMITS.label;

/** A module's parts, checked and copied; or why they aren't right. */
export function readParts(value: unknown): Parts | string {
  if (!record(value)) return 'what it offers is not an object';
  const parts: Parts = { commands: [], settings: value.settings === true };
  if (value.action !== undefined) {
    if (!record(value.action) || !label(value.action.label)) {
      return `its action needs a label of at most ${LIMITS.label} characters`;
    }
    parts.action = { label: value.action.label.trim() };
  }
  if (value.tab !== undefined) {
    const tab = value.tab;
    if (
      !record(tab) ||
      typeof tab.id !== 'string' ||
      !NAME.test(tab.id) ||
      tab.id.length > LIMITS.label ||
      !label(tab.label)
    ) {
      return 'its tab needs an id (lowercase letters, digits, and hyphens) and a label';
    }
    parts.tab = { id: tab.id, label: tab.label.trim() };
  }
  if (value.commands !== undefined) {
    if (!Array.isArray(value.commands)) return 'its commands must be a list';
    if (value.commands.length > LIMITS.commands) {
      return `it may have at most ${LIMITS.commands} commands`;
    }
    const seen = new Set<string>();
    for (const command of value.commands as unknown[]) {
      if (
        !record(command) ||
        typeof command.id !== 'string' ||
        !NAME.test(command.id) ||
        command.id.length > LIMITS.label ||
        !label(command.title)
      ) {
        return 'each command needs an id (lowercase letters, digits, and hyphens) and a title';
      }
      if (seen.has(command.id)) return `it has the command “${command.id}” twice`;
      seen.add(command.id);
      parts.commands.push({ id: command.id, title: command.title.trim() });
    }
  }
  return parts;
}

/** The size of a message as JSON, or Infinity for one that can't be written as JSON. */
export function messageSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
