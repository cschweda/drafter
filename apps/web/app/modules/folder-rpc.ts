import { type TextChange, toJSON } from '@drafter/fountain';
import { LIMITS, METHODS, type Method } from './folder-protocol';
import type { ModuleContext, ModuleProblem } from './types';

// The page's answer to a folder module's call (folder-protocol.ts): the module's own
// `ModuleContext` does the work, after its arguments are checked and copied. Nothing a frame sends
// reaches the context as it was sent, and only `METHODS` can be called. What comes back crosses
// postMessage, so the parse is given as plain data (`DocJSON`).

const isMethod = (name: string): name is Method => (METHODS as readonly string[]).includes(name);
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function text(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new Error(`${what} must be text.`);
  if (value.length > LIMITS.text) {
    throw new Error(`${what} is longer than ${LIMITS.text} characters.`);
  }
  return value;
}

function key(value: unknown): string {
  if (typeof value !== 'string' || value === '' || value.length > LIMITS.key) {
    throw new Error(`A storage key must be text of 1 to ${LIMITS.key} characters.`);
  }
  return value;
}

function changes(value: unknown): TextChange[] {
  if (!Array.isArray(value)) throw new Error('applyChanges needs a list of changes.');
  if (value.length > LIMITS.changes) {
    throw new Error(`applyChanges takes at most ${LIMITS.changes} changes at once.`);
  }
  return value.map((change: unknown) => {
    const { from, to, insert } = (change ?? {}) as Record<string, unknown>;
    if (!finite(from) || !finite(to) || typeof insert !== 'string') {
      throw new Error('applyChanges needs a list of changes: { from, to, insert }.');
    }
    return { from, to, insert };
  });
}

function problems(value: unknown): ModuleProblem[] {
  if (!Array.isArray(value)) throw new Error('setProblems needs a list of problems.');
  if (value.length > LIMITS.problems) {
    throw new Error(`setProblems takes at most ${LIMITS.problems} problems.`);
  }
  // Only the known fields, copied; the host checks each (and drops a fix that doesn't fit).
  return value.map((item: unknown) => {
    const { message, from, to, severity, fix } = (item ?? {}) as Record<string, unknown>;
    const copy = { message, from, to, severity } as ModuleProblem;
    if (typeof fix === 'object' && fix !== null) {
      const { title, changes: list } = fix as Record<string, unknown>;
      copy.fix = {
        title: title as string,
        changes: Array.isArray(list)
          ? list.slice(0, LIMITS.changes).map((c: unknown) => {
              const { from: a, to: b, insert } = (c ?? {}) as Record<string, unknown>;
              return { from: a, to: b, insert } as TextChange;
            })
          : [],
      };
    }
    return copy;
  });
}

function confirmOptions(value: unknown): { confirmLabel?: string; cancelLabel?: string } {
  if (value === undefined) return {};
  const { confirmLabel, cancelLabel } = (value ?? {}) as Record<string, unknown>;
  const ok = (l: unknown) => l === undefined || (typeof l === 'string' && l.length <= LIMITS.label);
  if (typeof value !== 'object' || value === null || !ok(confirmLabel) || !ok(cancelLabel)) {
    throw new Error(`confirm’s labels must be text of at most ${LIMITS.label} characters.`);
  }
  return {
    ...(confirmLabel !== undefined && { confirmLabel: confirmLabel as string }),
    ...(cancelLabel !== undefined && { cancelLabel: cancelLabel as string }),
  };
}

/** A copy of a value to store, which must be JSON and not too large. */
function storable(value: unknown): unknown {
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    json = undefined;
  }
  if (json === undefined || typeof value === 'function') {
    throw new Error('A stored value must be JSON (text, numbers, true or false, lists, objects).');
  }
  if (json.length > LIMITS.value) throw new Error('A stored value is larger than 1 MB.');
  return JSON.parse(json);
}

/**
 * Answers `method(...args)` from a module's frame with `ctx`. Rejects with a plain sentence for a
 * call it doesn't know, arguments of the wrong kind, or the context's own refusal (a change outside
 * the text).
 */
export async function answerCall(
  ctx: ModuleContext,
  method: string,
  args: readonly unknown[],
): Promise<unknown> {
  if (!isMethod(method)) throw new Error(`Drafter has no “${method}”.`);
  switch (method) {
    case 'source':
      return ctx.source();
    case 'doc':
      return toJSON(ctx.doc());
    case 'layout':
      return ctx.layout();
    case 'layoutFailed':
      return ctx.layoutFailed();
    case 'template':
      return ctx.template();
    case 'title':
      return ctx.title();
    case 'kind':
      return ctx.kind();
    case 'cursor':
      return ctx.cursor();
    case 'applyChanges':
      return ctx.applyChanges(changes(args[0]));
    case 'setProblems':
      return ctx.setProblems(problems(args[0]));
    case 'goto': {
      if (!finite(args[0])) throw new Error('goto needs a number: an offset in the text.');
      if (!Number.isInteger(args[0])) throw new Error('goto needs a whole number.');
      ctx.goto(args[0]);
      return undefined;
    }
    case 'confirm':
      return ctx.confirm(text(args[0], 'confirm’s message'), confirmOptions(args[1]));
    case 'openTab':
      ctx.openTab();
      return undefined;
    case 'storage.get':
      return ctx.storage.get(key(args[0]));
    case 'storage.set':
      await ctx.storage.set(key(args[0]), storable(args[1]));
      return undefined;
    case 'storage.remove':
      await ctx.storage.remove(key(args[0]));
      return undefined;
    case 'notify':
      ctx.notify(text(args[0], 'notify’s message'));
      return undefined;
  }
}
