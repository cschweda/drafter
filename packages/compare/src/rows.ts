import { type Change, changesOf } from './changes';
import { splitLines } from './lines';
import { lineSimilarity, PAIR_MIN } from './words';

/** One line of a diff view, in unified order: unchanged, or removed from the older text or added. */
export interface DiffRow {
  kind: 'same' | 'added' | 'removed';
  /** The line's number in the older text, from 0; null when added. */
  old: number | null;
  /** The line's number in the newer text, from 0; null when removed. */
  new: number | null;
  text: string;
  /** The index of the change it belongs to; null when unchanged. */
  change: number | null;
  /** The index of the row it is paired with for word marks (Call 23), or null. */
  pair: number | null;
}

/**
 * The rows of a diff of two texts, and its changes: each unchanged line once, and each change's
 * removed lines then its added ones. In a change that replaces lines, removed line i is paired with
 * added line i when their words are alike enough (`PAIR_MIN`). `\r\n` and `\n` read the same.
 *
 * Given the anchors `groupRows` will cut at, a change that crosses one is laid out a section at a
 * time, so each line lands in the group of its own heading: the removed and added lines before the
 * first anchor, then each removed section beside the added section whose heading it is paired with
 * (a renamed heading), and a section whose heading isn't paired on its own, removed before added.
 */
export function diffRows(
  older: string,
  newer: string,
  anchors?: { old: readonly Anchor[]; new: readonly Anchor[] },
): { rows: DiffRow[]; changes: Change[] } {
  const a = splitLines(older).lines;
  const changes = changesOf(older, newer);
  const oldAnchor = new Set(anchors?.old.map((x) => x.line));
  const newAnchor = new Set(anchors?.new.map((x) => x.line));
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  const sameTo = (end: number) => {
    for (; i < end; i++, j++) {
      rows.push({ kind: 'same', old: i, new: j, text: a[i], change: null, pair: null });
    }
  };
  changes.forEach((change, c) => {
    sameTo(change.old[0]);
    const { removed, added } = change;
    const paired = Array.from(
      { length: Math.min(removed.length, added.length) },
      (_, k) => lineSimilarity(removed[k], added[k]) >= PAIR_MIN,
    );
    const removedRow: number[] = [];
    const addedRow: number[] = [];
    const emitRemoved = ([from, to]: Section) => {
      for (let k = from; k < to; k++) {
        removedRow[k] = rows.length;
        const old = change.old[0] + k;
        rows.push({ kind: 'removed', old, new: null, text: removed[k], change: c, pair: null });
      }
    };
    const emitAdded = ([from, to]: Section) => {
      for (let k = from; k < to; k++) {
        addedRow[k] = rows.length;
        const at = change.new[0] + k;
        rows.push({ kind: 'added', old: null, new: at, text: added[k], change: c, pair: null });
      }
    };
    const rs = sections(removed.length, (k) => oldAnchor.has(change.old[0] + k));
    const as = sections(added.length, (k) => newAnchor.has(change.new[0] + k));
    // The lines before the change's first anchor on each side.
    let r = 0;
    let s = 0;
    if (rs.length > 0 && !oldAnchor.has(change.old[0])) emitRemoved(rs[r++]);
    if (as.length > 0 && !newAnchor.has(change.new[0])) emitAdded(as[s++]);
    while (r < rs.length || s < as.length) {
      if (r === rs.length) {
        emitAdded(as[s++]);
        continue;
      }
      // A removed heading paired with an added heading: a renamed one, laid out together.
      const k = rs[r][0];
      const partner = paired[k] && newAnchor.has(change.new[0] + k) ? k : null;
      if (partner === null || s === as.length) emitRemoved(rs[r++]);
      else if (as[s][0] === partner) {
        emitRemoved(rs[r++]);
        emitAdded(as[s++]);
      } else emitAdded(as[s++]); // an added section before the renamed one
    }
    paired.forEach((alike, k) => {
      if (!alike) return;
      rows[removedRow[k]].pair = addedRow[k];
      rows[addedRow[k]].pair = removedRow[k];
    });
    i = change.old[1];
    j = change.new[1];
  });
  sameTo(a.length);
  return { rows, changes };
}

/** A half-open range of a change's lines on one side. */
type Section = [number, number];

/** Lines 0 to `n` cut before each line that is an anchor; a cut at 0 makes no empty section. */
function sections(n: number, isAnchor: (k: number) => boolean): Section[] {
  const out: Section[] = [];
  let from = 0;
  for (let k = 1; k < n; k++) {
    if (!isAnchor(k)) continue;
    out.push([from, k]);
    from = k;
  }
  if (n > 0) out.push([from, n]);
  return out;
}

/** Rows shown as they are, or folded behind a button; half-open ranges of row indices. */
export type Piece =
  | { kind: 'rows'; from: number; to: number }
  | { kind: 'fold'; from: number; to: number };

/** Unchanged lines kept next to a change (Call 26). */
export const CONTEXT = 3;
/** A fold longer than this opens this many lines at a time (Call 26). */
export const FOLD_STEP = 200;
/** A group with more changed lines than this starts collapsed. */
export const LARGE_GROUP = 400;

/**
 * Rows `from` to `to` as pieces: an unchanged stretch longer than 2 × `CONTEXT` folds, but for the
 * `CONTEXT` lines next to each change in the range and the range's first row (a group's heading).
 * The pieces tile the range, alternating.
 */
export function foldRows(rows: readonly DiffRow[], from: number, to: number): Piece[] {
  const pieces: Piece[] = [];
  const push = (kind: Piece['kind'], f: number, t: number) => {
    if (t <= f) return;
    const last = pieces[pieces.length - 1];
    if (last?.kind === kind) last.to = t;
    else pieces.push({ kind, from: f, to: t });
  };
  let i = from;
  while (i < to) {
    if (rows[i].kind !== 'same') {
      push('rows', i, i + 1);
      i++;
      continue;
    }
    let end = i;
    while (end < to && rows[end].kind === 'same') end++;
    if (end - i > 2 * CONTEXT) {
      const foldFrom = i > from ? i + CONTEXT : i + 1;
      const foldTo = end < to ? end - CONTEXT : end;
      push('rows', i, foldFrom);
      push('fold', foldFrom, foldTo);
      push('rows', foldTo, end);
    } else push('rows', i, end);
    i = end;
  }
  return pieces;
}

/** A fold opened: up to `FOLD_STEP` rows from its top, and a fold of the rest. */
export function openFold(fold: Piece): Piece[] {
  if (fold.to - fold.from <= FOLD_STEP) return [{ kind: 'rows', from: fold.from, to: fold.to }];
  const at = fold.from + FOLD_STEP;
  return [
    { kind: 'rows', from: fold.from, to: at },
    { kind: 'fold', from: at, to: fold.to },
  ];
}

/** A line that starts a group: a scene heading, or a Markdown heading. */
export interface Anchor {
  /** Its line number, from 0. */
  line: number;
  title: string;
}

/** A run of rows from one anchor to the next. */
export interface RowGroup {
  from: number;
  to: number;
  /** The anchor's title (the newer one when renamed); empty for the opening. */
  title: string;
  /** `opening`: the rows before the first anchor. */
  tag: 'same' | 'new' | 'deleted' | 'renamed' | 'opening';
  /** The older title of a renamed group. */
  renamedFrom: string | null;
  /** Its added and removed rows. A group with neither has nothing to show. */
  added: number;
  removed: number;
  /**
   * The changes it holds a row of, in order. A change that crosses an anchor is in each group it
   * has rows in, so a group lists a change exactly when it has added or removed rows.
   */
  changes: number[];
}

/**
 * The rows cut into groups at each row whose line is an anchor of its side: the older side for a
 * removed row, the newer for the others. A removed anchor paired with an added anchor is one renamed
 * group. Every group is kept, changed or not, so the groups tile the rows. Give `diffRows` the same
 * anchors, so a change that crosses one is cut there and each line is in its own heading's group.
 */
export function groupRows(
  rows: readonly DiffRow[],
  oldAnchors: readonly Anchor[],
  newAnchors: readonly Anchor[],
): RowGroup[] {
  const oldAt = new Map(oldAnchors.map((a) => [a.line, a.title]));
  const newAt = new Map(newAnchors.map((a) => [a.line, a.title]));
  const titleOf = (row: DiffRow) =>
    row.kind === 'removed' ? oldAt.get(row.old as number) : newAt.get(row.new as number);

  const groups: RowGroup[] = [];
  let group: RowGroup | null = null;
  const renamedTo = new Set<number>(); // the added rows renamed groups' headings became
  rows.forEach((row, r) => {
    const title = titleOf(row);
    if (r === 0 || (title !== undefined && !renamedTo.has(r))) {
      let tag: RowGroup['tag'] = 'opening';
      let name = '';
      let renamedFrom: string | null = null;
      if (title !== undefined) {
        name = title;
        tag = row.kind === 'same' ? 'same' : row.kind === 'added' ? 'new' : 'deleted';
        const pairTitle =
          row.kind === 'removed' && row.pair !== null ? titleOf(rows[row.pair]) : undefined;
        if (pairTitle !== undefined) {
          tag = 'renamed';
          name = pairTitle;
          renamedFrom = title;
          renamedTo.add(row.pair as number);
        }
      }
      if (group) group.to = r;
      group = {
        from: r,
        to: rows.length,
        title: name,
        tag,
        renamedFrom,
        added: 0,
        removed: 0,
        changes: [],
      };
      groups.push(group);
    }
    const g = group as RowGroup;
    if (row.kind === 'added') g.added++;
    else if (row.kind === 'removed') g.removed++;
    if (row.change !== null && g.changes[g.changes.length - 1] !== row.change) {
      g.changes.push(row.change);
    }
  });
  return groups;
}

/** A row of a side-by-side view: indices into the rows, null for a blank cell. */
export interface SplitRow {
  left: number | null;
  right: number | null;
}

/**
 * Rows `from` to `to` side by side: an unchanged row on both sides, and in each change its removed
 * rows on the left and its added rows on the right. A row paired with one in the range is beside its
 * pair; between pairs, unpaired rows go side by side by position, blanks filling the shorter side.
 */
export function pairRows(rows: readonly DiffRow[], from: number, to: number): SplitRow[] {
  const out: SplitRow[] = [];
  let i = from;
  while (i < to) {
    if (rows[i].kind === 'same') {
      out.push({ left: i, right: i });
      i++;
      continue;
    }
    const left: number[] = [];
    const right: number[] = [];
    const change = rows[i].change;
    for (; i < to && rows[i].kind !== 'same' && rows[i].change === change; i++) {
      (rows[i].kind === 'removed' ? left : right).push(i);
    }
    // Paired with a row in the range (pairs are in order, so a pair's rows meet as both lists are walked).
    const pairedHere = (r: number) => {
      const p = rows[r].pair;
      return p !== null && p >= from && p < to;
    };
    let x = 0;
    let y = 0;
    while (x < left.length || y < right.length) {
      const l = left[x];
      const r = right[y];
      if (
        l !== undefined &&
        r !== undefined &&
        (rows[l].pair === r || (!pairedHere(l) && !pairedHere(r)))
      ) {
        out.push({ left: l, right: r });
        x++;
        y++;
      } else if (l !== undefined && (r === undefined || !pairedHere(l))) {
        out.push({ left: l, right: null });
        x++;
      } else {
        out.push({ left: null, right: r });
        y++;
      }
    }
  }
  return out;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,3})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;

/**
 * The lines of a Markdown text that start a heading of level 1 to 3, with its text, skipping fenced
 * code (Call 21). A deeper heading is an ordinary line.
 */
export function markdownAnchors(text: string): Anchor[] {
  const anchors: Anchor[] = [];
  let fence: string | null = null;
  splitLines(text).lines.forEach((line, i) => {
    const open = FENCE.exec(line);
    if (fence !== null) {
      // A fence closes with a run of its own character at least as long, and nothing after it.
      if (
        open &&
        open[1][0] === fence[0] &&
        open[1].length >= fence.length &&
        !line.slice(open[0].length).trim()
      ) {
        fence = null;
      }
      return;
    }
    if (open) {
      fence = open[1];
      return;
    }
    const heading = HEADING.exec(line);
    if (!heading) return;
    // An empty heading has an empty title; `### ###` is all closing marks.
    const title = (heading[2] ?? '').trim();
    anchors.push({ line: i, title: /^#+$/.test(title) ? '' : title });
  });
  return anchors;
}
