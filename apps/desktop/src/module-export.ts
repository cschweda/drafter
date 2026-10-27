// What a folder module's index.js default-exports, as its frame's runtime (module-runtime.ts)
// checks it before telling the page what the module offers. Pure, so it is unit-tested; the page
// checks the parts again (readParts) when they arrive.
import { type Parts, readParts } from '../../web/app/modules/folder-protocol';

/** The asynchronous context a folder module is given in its frame (the README describes it). */
export interface FolderContext {
  source(): Promise<string>;
  doc(): Promise<unknown>;
  layout(): Promise<unknown>;
  layoutFailed(): Promise<boolean>;
  template(): Promise<unknown>;
  title(): Promise<string>;
  kind(): Promise<'fountain' | 'markdown'>;
  cursor(): Promise<number>;
  applyChanges(changes: unknown): Promise<boolean>;
  setProblems(items: unknown): Promise<boolean>;
  goto(offset: number): Promise<void>;
  confirm(
    message: string,
    options?: { confirmLabel?: string; cancelLabel?: string },
  ): Promise<boolean>;
  openTab(): Promise<void>;
  storage: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    remove(key: string): Promise<void>;
  };
  notify(message: string): Promise<void>;
  /** Calls `listener` when the script, its pages, or the open script change. Returns the function that stops it. */
  onChange(listener: () => void): () => void;
}

type Run = (ctx: FolderContext) => unknown;
type Mount = (root: HTMLElement, ctx: FolderContext) => unknown;

/** A folder module, as its index.js default-exports it. */
export interface FolderModule {
  id: string;
  action?: { label: string; run: Run };
  commands?: Array<{ id: string; title: string; run: Run }>;
  tab?: { id: string; label: string; mount: Mount };
  settings?: { mount: Mount };
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const fn = (value: unknown) => typeof value === 'function';

/**
 * The module `imported` (what importing index.js gave) default-exports, with the parts it offers;
 * or why it isn't a module. Its id must be `expectedId`, the one its module.json declares.
 */
export function readExport(
  imported: unknown,
  expectedId: string,
): { module: FolderModule; parts: Parts } | string {
  const value = record(imported) ? imported.default : undefined;
  if (value === undefined) return 'its index.js has no default export';
  if (!record(value)) return 'its index.js’s default export is not an object';
  if (value.id !== expectedId) {
    return `its index.js says its id is “${String(value.id)}”, but its module.json says “${expectedId}”`;
  }
  const { action, commands, tab, settings } = value;
  if (action !== undefined && !(record(action) && fn(action.run))) {
    return 'its action needs a label and a run function';
  }
  if (commands !== undefined) {
    if (!Array.isArray(commands)) return 'its commands must be a list';
    if (!commands.every((c) => record(c) && fn(c.run))) {
      return 'each command needs an id, a title, and a run function';
    }
  }
  if (tab !== undefined && !(record(tab) && fn(tab.mount))) {
    return 'its tab needs an id, a label, and a mount function';
  }
  if (settings !== undefined && !(record(settings) && fn(settings.mount))) {
    return 'its settings need a mount function';
  }
  const parts = readParts({
    ...(record(action) && { action: { label: action.label } }),
    ...(Array.isArray(commands) && {
      commands: commands.map((c: Record<string, unknown>) => ({ id: c.id, title: c.title })),
    }),
    ...(record(tab) && { tab: { id: tab.id, label: tab.label } }),
    settings: settings !== undefined,
  });
  if (typeof parts === 'string') return parts;
  return { module: value as unknown as FolderModule, parts };
}
