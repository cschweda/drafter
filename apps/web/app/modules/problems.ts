import type { ChangeSet } from '@codemirror/state';
import type { TextChange } from '@drafter/fountain';
import { shallowRef } from 'vue';
import type { ModuleProblem } from './types';

/** A module's problem as the host keeps it: the module's own positions, mapped through every edit. */
export interface StoredModuleProblem {
  moduleId: string;
  moduleName: string;
  message: string;
  from: number;
  to: number;
  severity: 'info' | 'warning';
  fix?: { title: string; changes: TextChange[] };
}

/** Every module's problems, in the order the modules set them. */
export const moduleProblems = shallowRef<readonly StoredModuleProblem[]>([]);

const whole = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * Replaces `moduleId`'s items with `items`. Positions are kept inside the text (`length`
 * characters) and in order; an item that is no object, has no message, or has a position that is
 * no number is left out, and an unknown severity reads as info. The module's items keep their
 * place among the others.
 */
export function setModuleProblems(
  moduleId: string,
  moduleName: string,
  items: readonly ModuleProblem[],
  length: number,
): void {
  const clamp = (n: number) => Math.min(length, Math.max(0, Math.trunc(n)));
  const mine: StoredModuleProblem[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    if (typeof item.message !== 'string' || item.message === '') continue;
    if (!whole(item.from) || !whole(item.to)) continue;
    const a = clamp(item.from);
    const b = clamp(item.to);
    const fix =
      item.fix &&
      typeof item.fix.title === 'string' &&
      item.fix.title !== '' &&
      Array.isArray(item.fix.changes)
        ? { title: item.fix.title, changes: item.fix.changes.map((c) => ({ ...c })) }
        : undefined;
    mine.push({
      moduleId,
      moduleName,
      message: item.message,
      from: Math.min(a, b),
      to: Math.max(a, b),
      severity: item.severity === 'warning' ? 'warning' : 'info',
      ...(fix && { fix }),
    });
  }
  const current = moduleProblems.value;
  const at = current.findIndex((p) => p.moduleId === moduleId);
  if (at === -1) moduleProblems.value = [...current, ...mine];
  else {
    const before = current.slice(0, at).filter((p) => p.moduleId !== moduleId);
    const after = current.slice(at).filter((p) => p.moduleId !== moduleId);
    moduleProblems.value = [...before, ...mine, ...after];
  }
}

/** Takes away `moduleId`'s items (it was turned off). */
export function clearModuleProblems(moduleId: string): void {
  if (!moduleProblems.value.some((p) => p.moduleId === moduleId)) return;
  moduleProblems.value = moduleProblems.value.filter((p) => p.moduleId !== moduleId);
}

/** Takes away every module's items (another script was opened). */
export function clearAllModuleProblems(): void {
  if (moduleProblems.value.length > 0) moduleProblems.value = [];
}

/**
 * Moves every item to where its text now is, after an edit. An item whose whole text the edit
 * replaced is gone. One whose text the edit touched keeps its place but loses its fix, which was
 * written for the text as it was; a fix the edit didn't touch moves along with its text.
 */
export function mapModuleProblems(changes: ChangeSet): void {
  // With no module problems nothing changes, and nothing that watches the list is woken for every keystroke.
  if (moduleProblems.value.length === 0) return;
  const next: StoredModuleProblem[] = [];
  for (const p of moduleProblems.value) {
    // A change that covers the item's text from edge to edge, with the text not empty.
    if (p.from < p.to && changes.touchesRange(p.from, p.to) === 'cover') continue;
    const from = changes.mapPos(p.from, 1);
    const to = Math.max(from, changes.mapPos(p.to, -1));
    let fix = p.fix;
    if (fix) {
      const untouched = fix.changes.every((c) => !changes.touchesRange(c.from, c.to));
      fix = untouched
        ? {
            title: fix.title,
            changes: fix.changes.map((c) => ({
              ...c,
              from: changes.mapPos(c.from, 1),
              to: changes.mapPos(c.to, -1),
            })),
          }
        : undefined;
    }
    const { fix: _old, ...rest } = p;
    next.push({ ...rest, from, to, ...(fix && { fix }) });
  }
  // Always a new list, so what reads line numbers from it reads them again.
  moduleProblems.value = next;
}
