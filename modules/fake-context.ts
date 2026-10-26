import { readFileSync } from 'node:fs';
import { type Doc, parse, type TextChange } from '@drafter/fountain';
import { type Layout, paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import type { ModuleContext, ModuleProblem } from '~/modules/types';

// For the tests of the modules in this folder (it is not a module, and the build never reads it):
// a `ModuleContext` made from a script's text, the way the app's own is made from the editor's.
// It records what a module did, so a test can say what it did.

/** `samples/screenplay.fountain`, the script the app opens first. */
export const SAMPLE = readFileSync(
  new URL('../samples/screenplay.fountain', import.meta.url),
  'utf8',
);

export interface FakeOptions {
  /** The script's text; the sample screenplay when left out. */
  source?: string;
  /** `markdown`: no Fountain, no pages, as in the app. */
  kind?: 'fountain' | 'markdown';
  cursor?: number;
  /** `pending`: the first layout hasn't arrived, so `layout()` is null. */
  layout?: 'ready' | 'pending' | 'failed';
  /** What `confirm` answers; true when left out. */
  confirm?: boolean;
  /** The editor refuses changes (the run is stale, or the script is read-only). */
  stale?: boolean;
}

export interface FakeContext extends ModuleContext {
  /** The script's text now (changes apply to it). */
  text: string;
  stale: boolean;
  layoutReady: boolean;
  layoutIsFailed: boolean;
  /** Set to lay the pages out from this text, not the script's (a layout that lags an edit). */
  layoutOf?: string;
  confirmAnswer: boolean;
  readonly calls: {
    goto: number[];
    /** How many times the module asked for its tab to be shown. */
    openedTab: number;
    /** The questions asked, with the options given. */
    confirms: Array<{ message: string; options?: { confirmLabel?: string; cancelLabel?: string } }>;
    notices: string[];
    problems: ModuleProblem[][];
    changes: TextChange[][];
  };
}

const EMPTY: Doc = parse('');

export function fakeContext(options: FakeOptions = {}): FakeContext {
  const kind = options.kind ?? 'fountain';
  const template: Template = builtins['us-screenplay'] as Template;
  let parsedText: string | undefined;
  let parsed: Doc = EMPTY;
  let laidOut: Layout | undefined;
  const fresh = () => {
    if (parsedText !== context.text) {
      parsedText = context.text;
      parsed = parse(context.text);
      laidOut = undefined;
    }
  };
  const stored = new Map<string, unknown>();

  const context: FakeContext = {
    text: options.source ?? SAMPLE,
    stale: options.stale ?? false,
    layoutReady: (options.layout ?? 'ready') === 'ready',
    layoutIsFailed: options.layout === 'failed',
    confirmAnswer: options.confirm ?? true,
    calls: { goto: [], openedTab: 0, confirms: [], notices: [], problems: [], changes: [] },
    source: () => context.text,
    doc() {
      if (kind === 'markdown') return EMPTY;
      fresh();
      return parsed;
    },
    layout() {
      if (kind === 'markdown' || !context.layoutReady) return null;
      fresh();
      if (context.layoutOf !== undefined) return paginate(parse(context.layoutOf), template);
      laidOut ??= paginate(parsed, template);
      return laidOut;
    },
    layoutFailed: () => context.layoutIsFailed,
    async confirm(message, confirmOptions) {
      context.calls.confirms.push({ message, options: confirmOptions });
      return context.confirmAnswer;
    },
    template: () => template,
    title: () => 'The Call',
    kind: () => kind,
    cursor: () => options.cursor ?? 0,
    applyChanges(changes) {
      if (context.stale) return false;
      context.calls.changes.push([...changes]);
      // Offsets are in the old text, so apply from the end.
      for (const change of [...changes].sort((a, b) => b.from - a.from)) {
        context.text =
          context.text.slice(0, change.from) + change.insert + context.text.slice(change.to);
      }
      return true;
    },
    setProblems(items) {
      if (context.stale) return false;
      context.calls.problems.push([...items]);
      return true;
    },
    goto: (offset) => void context.calls.goto.push(offset),
    openTab() {
      context.calls.openedTab += 1;
    },
    storage: {
      get: async <T>(key: string) => stored.get(key) as T | undefined,
      set: async <T>(key: string, value: T) => void stored.set(key, value),
      remove: async (key: string) => void stored.delete(key),
    },
    notify: (message) => void context.calls.notices.push(message),
  };
  return context;
}
