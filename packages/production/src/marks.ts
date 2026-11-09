import { changesOf, diffWords, lineSimilarity, PAIR_MIN, splitLines } from '@drafter/compare';
import { fingerprintLines } from './fingerprint';
import type { ProductionSet } from './types';

/** A stretch of the current text that carries a revision mark; offsets are into the current text. */
export interface MarkedSpan {
  from: number;
  to: number;
  set: string;
}

/** A removal's mark: the offset of the line that follows the gap, or the text's end. */
export interface MarkedGap {
  at: number;
  set: string;
}

interface OpenMarks {
  spans: { from: number; to: number }[];
  gaps: number[];
  /** Indexes of the current lines that carry a span (blank ones too, though they draw nothing). */
  lines: Set<number>;
  /** Indexes of the lines that carry a gap; -1 for a gap at the very end. */
  gapLines: number[];
}

/** The marks of everything changed since the baseline, word by word within a changed line. */
function openMarks(baseline: string, current: string): OpenMarks {
  const { lines, starts } = splitLines(current);
  const out: OpenMarks = { spans: [], gaps: [], lines: new Set(), gapLines: [] };
  const wholeLine = (i: number) => {
    out.lines.add(i);
    out.spans.push({ from: starts[i], to: starts[i] + lines[i].length });
  };
  for (const change of changesOf(baseline, current)) {
    if (change.kind === 'removed') {
      out.gaps.push(change.span.from);
      out.gapLines.push(change.new[0] < lines.length ? change.new[0] : -1);
      continue;
    }
    for (let i = change.new[0]; i < change.new[1]; i++) {
      const old = change.kind === 'changed' ? change.removed[i - change.new[0]] : undefined;
      const words =
        old !== undefined && lineSimilarity(old, lines[i]) >= PAIR_MIN
          ? diffWords(old, lines[i])
          : null;
      if (!words) {
        wholeLine(i);
        continue;
      }
      // The parts run end to end over the line, so walking them gives each one's offset.
      let pos = starts[i];
      let marked = false;
      for (const part of words.added) {
        if (part.kind === 'added') {
          out.spans.push({ from: pos, to: pos + part.text.length });
          marked = true;
        }
        pos += part.text.length;
      }
      if (marked) out.lines.add(i);
    }
  }
  return out;
}

/**
 * Every revision mark in the current text. The open set's marks come from the baseline: an added
 * line whole, a changed line only in its new words, a removal as a gap on the next line. Lines
 * that an earlier, closed set marked keep that set's mark, whole, through their fingerprints; the
 * newest closed set wins, and the open set wins over any closed one. Sorted by offset.
 */
export async function productionMarks(input: {
  current: string;
  baseline: string;
  open: string;
  closed: readonly ProductionSet[];
}): Promise<{ spans: MarkedSpan[]; gaps: MarkedGap[] }> {
  const { current, baseline, open, closed } = input;
  const mine = openMarks(baseline, current);
  const spans: MarkedSpan[] = mine.spans
    .filter((s) => s.to > s.from)
    .map((s) => ({ ...s, set: open }));
  const gaps: MarkedGap[] = mine.gaps.map((at) => ({ at, set: open }));

  if (closed.length > 0) {
    const { lines, starts } = splitLines(current);
    const prints = await fingerprintLines(current);
    const gapsTaken = new Set(mine.gaps);
    for (let i = 0; i < lines.length; i++) {
      // Walk from the newest closed set back.
      for (let k = closed.length - 1; k >= 0; k--) {
        const set = closed[k];
        if (!mine.lines.has(i) && lines[i].length > 0 && set.lines?.includes(prints[i])) {
          spans.push({ from: starts[i], to: starts[i] + lines[i].length, set: set.name });
          break;
        }
      }
      for (let k = closed.length - 1; k >= 0; k--) {
        if (!gapsTaken.has(starts[i]) && closed[k].gaps?.includes(prints[i])) {
          gaps.push({ at: starts[i], set: closed[k].name });
          gapsTaken.add(starts[i]);
          break;
        }
      }
    }
  }
  spans.sort((a, b) => a.from - b.from);
  gaps.sort((a, b) => a.at - b.at);
  return { spans, gaps };
}

/**
 * A copy of a set that remembers its marks without a baseline: `lines` holds the fingerprints of
 * the lines the set marked, `gaps` those of the lines that carry a removal. A removal at the very
 * end has no line to remember and is left out.
 */
export async function closeSet(
  baseline: string,
  current: string,
  set: ProductionSet,
): Promise<ProductionSet> {
  const marks = openMarks(baseline, current);
  const prints = await fingerprintLines(current);
  const lines = [...marks.lines].sort((a, b) => a - b).map((i) => prints[i]);
  const gaps = marks.gapLines.filter((i) => i >= 0).map((i) => prints[i]);
  return { ...set, lines, gaps };
}
