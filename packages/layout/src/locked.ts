import type { LockedPages } from './types';

/** The `n`th A-page suffix, counting like spreadsheet columns: 1 is A, 26 is Z, 27 is AA. */
export function suffix(n: number): string {
  let out = '';
  for (let k = n; k > 0; k = Math.floor(k / 26)) {
    k--;
    out = String.fromCharCode(65 + (k % 26)) + out;
  }
  return out;
}

/** Orders page labels: the number, then the A-suffix (shorter first, then alphabetical). */
export function compareLabels(a: string, b: string): number {
  const [, an = '', as = ''] = /^(\d*)(.*)$/.exec(a) ?? [];
  const [, bn = '', bs = ''] = /^(\d*)(.*)$/.exec(b) ?? [];
  const n = (an === '' ? -1 : Number(an)) - (bn === '' ? -1 : Number(bn));
  if (n !== 0) return n;
  if (as.length !== bs.length) return as.length - bs.length;
  return as < bs ? -1 : as > bs ? 1 : 0;
}

/** What each kept label prints as: itself, or a range to the last label folded into it (`13-14`). */
export function printedLabels(locked: LockedPages): (label: string) => string {
  const last = new Map<string, string>();
  for (const { into, label } of locked.folded) {
    const prev = last.get(into);
    if (prev === undefined || compareLabels(label, prev) > 0) last.set(into, label);
  }
  return (label) => {
    const end = last.get(label);
    return end === undefined ? label : `${label}-${end}`;
  };
}
