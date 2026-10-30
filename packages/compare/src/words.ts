import { diffLines } from './myers';

/** A piece of one side of a changed line: unchanged, or what that side took out or put in. */
export interface WordPart {
  text: string;
  kind: 'same' | 'added' | 'removed';
}

/** The least word similarity at which a removed line and an added line are paired (Call 23). */
export const PAIR_MIN = 0.4;

/** A side with more tokens than this gets no word marks (Call 24). */
export const MAX_TOKENS = 2000;

/** A run of letters, digits, `'` and `’`; a run of whitespace; or any other single character. */
const TOKEN = /[\p{L}\p{N}'’]+|\s+|./gsu;
const WORD = /[\p{L}\p{N}'’]+/gu;

/** One stretch of the two lines: the same on both, or a change of `removed` into `added`. */
type Stretch = { same: true; text: string } | { same: false; removed: string; added: string };

/**
 * The words that changed between two versions of a line, as each side's parts in order (Call 24).
 * The lines are split into tokens and diffed with `diffLines`; an unchanged run of only whitespace,
 * or of one or two characters, between two changes is folded into them, so that a line rewritten
 * word by word reads as one change. Null when either side has more than `MAX_TOKENS` tokens.
 */
export function diffWords(
  older: string,
  newer: string,
): { removed: WordPart[]; added: WordPart[] } | null {
  const a = older.match(TOKEN) ?? [];
  const b = newer.match(TOKEN) ?? [];
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) return null;

  // Runs as stretches, a removal and the addition after it making one change.
  const stretches: Stretch[] = [];
  for (const run of diffLines(a, b)) {
    if (run.kind === 'same') {
      stretches.push({ same: true, text: a.slice(run.old[0], run.old[1]).join('') });
      continue;
    }
    const last = stretches[stretches.length - 1];
    const change = last && !last.same ? last : { same: false as const, removed: '', added: '' };
    if (change !== last) stretches.push(change);
    if (run.kind === 'removed') change.removed += a.slice(run.old[0], run.old[1]).join('');
    else change.added += b.slice(run.new[0], run.new[1]).join('');
  }

  // Fold small unchanged runs between two changes into one change.
  const folded: Stretch[] = [];
  // Stretches alternate, so a same stretch with a stretch after it lies between two changes.
  for (let i = 0; i < stretches.length; i++) {
    const s = stretches[i];
    const prev = folded[folded.length - 1];
    if (prev && !prev.same) {
      if (!s.same) {
        prev.removed += s.removed;
        prev.added += s.added;
        continue;
      }
      if (i + 1 < stretches.length && (/^\s+$/.test(s.text) || [...s.text].length <= 2)) {
        prev.removed += s.text;
        prev.added += s.text;
        continue;
      }
    }
    folded.push(s);
  }

  const removed: WordPart[] = [];
  const added: WordPart[] = [];
  for (const s of folded) {
    if (s.same) {
      removed.push({ text: s.text, kind: 'same' });
      added.push({ text: s.text, kind: 'same' });
    } else {
      if (s.removed) removed.push({ text: s.removed, kind: 'removed' });
      if (s.added) added.push({ text: s.added, kind: 'added' });
    }
  }
  return { removed: merge(removed), added: merge(added) };
}

/** Joins neighbouring parts of one kind. */
function merge(parts: WordPart[]): WordPart[] {
  const out: WordPart[] = [];
  for (const part of parts) {
    const last = out[out.length - 1];
    if (last?.kind === part.kind) last.text += part.text;
    else out.push(part);
  }
  return out;
}

/**
 * How alike two lines are by their words, from 0 to 1: the Dice coefficient, twice the words they
 * share (counting a repeated word as often as both have it) over the words in both. Spaces and
 * punctuation don't count; two lines with no words are alike only when equal.
 */
export function lineSimilarity(a: string, b: string): number {
  const wa = a.match(WORD) ?? [];
  const wb = b.match(WORD) ?? [];
  if (wa.length + wb.length === 0) return a === b ? 1 : 0;
  const counts = new Map<string, number>();
  for (const w of wa) counts.set(w, (counts.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of wb) {
    const n = counts.get(w) ?? 0;
    if (n > 0) {
      shared++;
      counts.set(w, n - 1);
    }
  }
  return (2 * shared) / (wa.length + wb.length);
}
