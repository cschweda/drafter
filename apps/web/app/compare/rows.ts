import {
  type Anchor,
  type Change,
  type DiffRow,
  diffRows,
  groupRows,
  LARGE_GROUP,
  markdownAnchors,
  type RowGroup,
  splitLines,
} from '@drafter/compare';
import {
  type ScenePrint,
  sameScene,
  sceneAnchors,
  scenePrints,
  similarity,
} from '@drafter/history';
import type { DocumentKind } from '../markdown/kind';
import type { CompareView } from '../settings/settings';
import { type LineStop, stopLabel } from './labels';

// Compare's Changes view as a model (version-history design §5.2): the two texts' rows, laid out
// and cut into groups with the same anchors (a script's scene headings, a Markdown document's
// headings of levels 1 to 3), so a line is in the group of its own heading; the summary over the
// top; each change's name for the Changes list and Next change; and where Go to scene goes.

export interface DiffSummary {
  /** Scenes (a Markdown document's sections) in both versions that changed. */
  scenes: number;
  /** New ones, and deleted ones. */
  added: number;
  deleted: number;
  linesAdded: number;
  linesRemoved: number;
}

export interface DiffModel {
  rows: DiffRow[];
  /** Every group, tiling the rows; the view shows `shownGroups`. */
  groups: RowGroup[];
  /** The changes, as `changesOf` gives them, which the rows' `change` index. */
  changes: Change[];
  /** The anchors both the rows and the groups were cut at. */
  anchors: { old: Anchor[]; new: Anchor[] };
  /** Each change's first row: where Next change puts focus. */
  firstRow: number[];
  summary: DiffSummary;
}

/** The headings a document's groups start at. */
function anchorsOf(text: string, kind: DocumentKind): Anchor[] {
  return kind === 'markdown' ? markdownAnchors(text) : sceneAnchors(text);
}

/**
 * The diff of `older` and `newer` as the Changes view draws it. The same anchors go to `diffRows`
 * and `groupRows`, so a change that crosses a heading is cut there.
 */
export function diffModel(older: string, newer: string, kind: DocumentKind): DiffModel {
  const anchors = { old: anchorsOf(older, kind), new: anchorsOf(newer, kind) };
  const { rows, changes } = diffRows(older, newer, anchors);
  const groups = groupRows(rows, anchors.old, anchors.new);
  const firstRow: number[] = [];
  rows.forEach((row, r) => {
    if (row.change !== null && firstRow[row.change] === undefined) firstRow[row.change] = r;
  });
  const summary: DiffSummary = { scenes: 0, added: 0, deleted: 0, linesAdded: 0, linesRemoved: 0 };
  for (const group of groups) {
    summary.linesAdded += group.added;
    summary.linesRemoved += group.removed;
    if (group.changes.length === 0) continue;
    if (group.tag === 'new') summary.added++;
    else if (group.tag === 'deleted') summary.deleted++;
    else if (group.tag !== 'opening') summary.scenes++;
  }
  return { rows, groups, changes, anchors, firstRow, summary };
}

/** The groups the view shows: those with a change (one with none has nothing to show). */
export function shownGroups(model: DiffModel): RowGroup[] {
  return model.groups.filter((group) => group.changes.length > 0);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * "12 scenes changed, 2 new, 1 deleted · 140 lines added, 62 removed" (a Markdown document's are
 * sections), or "No changes: the two versions are the same."
 */
export function summaryText(summary: DiffSummary, kind: DocumentKind): string {
  const { scenes, added, deleted, linesAdded, linesRemoved } = summary;
  if (linesAdded + linesRemoved === 0) return 'No changes: the two versions are the same.';
  const [one, many] = kind === 'markdown' ? ['section', 'sections'] : ['scene', 'scenes'];
  // The first part names what is counted; the ones after it say only how.
  const parts: string[] = [];
  const noun = (n: number) => (parts.length === 0 ? ` ${n === 1 ? one : many}` : '');
  if (scenes > 0) parts.push(`${scenes}${noun(scenes)} changed`);
  if (added > 0) parts.push(parts.length === 0 ? `${added} new${noun(added)}` : `${added} new`);
  if (deleted > 0) parts.push(`${deleted}${noun(deleted)} deleted`);
  const lines: string[] = [];
  if (linesAdded > 0) lines.push(`${plural(linesAdded, 'line', 'lines')} added`);
  if (linesRemoved > 0)
    lines.push(
      lines.length === 0
        ? `${plural(linesRemoved, 'line', 'lines')} removed`
        : `${linesRemoved} removed`,
    );
  return [parts.join(', '), lines.join(', ')].filter(Boolean).join(' · ');
}

/** A change as the Changes list and Next change name it in the Changes view. */
export interface TextStop {
  stop: LineStop;
  /** "INT. HALL: 2 lines changed"; "Line 40: 1 line added" before the first heading. */
  label: string;
}

/** One per change, in order (version-history design §5.6). */
export function changeStops(model: DiffModel): TextStop[] {
  const headingOf = new Map<number, string>();
  for (const group of model.groups)
    for (const c of group.changes)
      if (!headingOf.has(c) && group.title) headingOf.set(c, group.title);
  // The newer text's line count, by a loop: a spread of every row overflows the stack.
  let newerLines = 1;
  for (const row of model.rows)
    if (row.new !== null && row.new + 1 > newerLines) newerLines = row.new + 1;
  return model.changes.map((change, c) => {
    const row = model.rows[model.firstRow[c] as number] as DiffRow;
    // A removal sits before the newer line it names; at the end, after the last.
    const line =
      row.new !== null ? row.new + 1 : Math.max(1, Math.min(change.new[0] + 1, newerLines));
    const stop: LineStop = {
      change: c,
      kind: change.kind,
      line,
      lines: change.kind === 'removed' ? change.removed.length : change.added.length,
    };
    return { stop, label: stopLabel(stop, headingOf.get(c) ?? null) };
  });
}

/** A group's name: its heading, "OLD → NEW" when renamed, or what comes before the first heading. */
export function groupTitle(group: RowGroup, kind: DocumentKind): string {
  if (group.tag === 'opening')
    return kind === 'markdown' ? 'Before the first heading' : 'Title page and opening';
  if (group.tag === 'renamed') return `${group.renamedFrom} → ${group.title}`;
  return group.title || (kind === 'markdown' ? 'Untitled heading' : 'Untitled scene');
}

/** A shown group as the Changes view's list names it. */
export interface GroupStop {
  /** Its place among `shownGroups`. */
  group: number;
  /** Its first change. */
  change: number;
  /** "INT. HALL - DAY: 3 changes". */
  label: string;
}

/**
 * Next (1) or Previous (-1) change from a Changes list entry, whose group's first change is `first`
 * of `count`: Next lands on that change, Previous on the one before it (wrapping); null with none.
 */
export function stepFromGroup(count: number, first: number, direction: 1 | -1): number | null {
  if (count === 0) return null;
  return direction === 1 ? first % count : (first - 1 + count) % count;
}

/**
 * The Changes view's list: one entry per shown group, not per change, so a rename across a long
 * script lists its scenes, not each line. Next change still steps change by change (`changeStops`).
 */
export function groupStops(model: DiffModel, kind: DocumentKind): GroupStop[] {
  return shownGroups(model).map((group, g) => {
    const n = group.changes.length;
    return {
      group: g,
      change: group.changes[0] as number,
      label: `${groupTitle(group, kind)}: ${n} ${n === 1 ? 'change' : 'changes'}`,
    };
  });
}

/** About how many rows the Changes view draws when it opens; the groups past it wait, closed. */
export const ROW_BUDGET = 1500;

/** A group with more changed lines than `LARGE_GROUP` starts closed. */
export const isLarge = (group: RowGroup): boolean => group.added + group.removed > LARGE_GROUP;

/**
 * Which of the shown `groups` open when the view is drawn: in order, while the rows they draw
 * (`drawn`) stay within `budget`; the first always opens. A large group starts closed and draws
 * nothing. Once one doesn't fit, it and every group after it wait, closed (`waiting`), so the view
 * opens at the same speed however many scenes changed.
 */
export function openGroups(
  groups: readonly RowGroup[],
  drawn: (group: RowGroup) => number,
  budget = ROW_BUDGET,
): { open: Set<number>; waiting: Set<number> } {
  const open = new Set<number>();
  const waiting = new Set<number>();
  let used = 0;
  let full = false;
  for (const group of groups) {
    if (isLarge(group)) continue;
    if (full) {
      waiting.add(group.from);
      continue;
    }
    const rows = drawn(group);
    if (open.size > 0 && used + rows > budget) {
      full = true;
      waiting.add(group.from);
      continue;
    }
    used += rows;
    open.add(group.from);
  }
  return { open, waiting };
}

/**
 * The view Compare shows: a Markdown document's is always Changes; else the one a caller asked
 * for this comparison (`openAt`), else the one remembered.
 */
export function shownView(
  kind: DocumentKind,
  asked: CompareView | null,
  remembered: CompareView,
): CompareView {
  if (kind === 'markdown') return 'changes';
  return asked ?? remembered;
}

/** What Go to scene needs of a comparison. */
export interface ComparedTexts {
  older: { text: string };
  /** `at` null: the newer side is now, the editor's text when Compare opened. */
  newer: { text: string; at: number | null };
  kind: DocumentKind;
  model: DiffModel;
}

/** The offset of line `line` (from 0) in `text`. */
function lineOffset(text: string, line: number): number {
  return splitLines(text).starts[line] ?? text.length;
}

/**
 * Where Go to scene puts the cursor in the script now (design §5.2): the group's heading by its
 * offset, when the newer side is now and the text hasn't changed since Compare opened; else the
 * scene now that matches it (`sameScene`: the same version first, then the same heading, then the
 * most alike); else it is gone. A deleted group's scene is looked for the same way (a scene moved
 * reads as deleted where it was). The opening goes to the top.
 */
export function goToScene(
  group: RowGroup,
  comparison: ComparedTexts,
  now: string,
): { offset: number } | { gone: true } {
  if (group.tag === 'opening') return { offset: 0 };
  const { model } = comparison;
  const first = model.rows[group.from] as DiffRow;
  // The heading's line in the version it is from: the older for a deleted scene, else the newer.
  const deleted = group.tag === 'deleted';
  const text = deleted ? comparison.older.text : comparison.newer.text;
  let line: number;
  if (deleted) line = first.old as number;
  else if (first.kind === 'removed') line = model.rows[first.pair as number]?.new as number;
  else line = first.new as number;
  if (!deleted && comparison.newer.at === null && now === comparison.newer.text)
    return { offset: lineOffset(now, line) };

  if (comparison.kind === 'markdown') {
    const title = group.title;
    const found = markdownAnchors(now).find((a) => a.title === title);
    return found ? { offset: lineOffset(now, found.line) } : { gone: true };
  }
  const anchors = deleted ? model.anchors.old : model.anchors.new;
  const k = anchors.findIndex((a) => a.line === line);
  const then = scenePrints(text);
  const slot = then.slots[k];
  const print = slot && then.prints.find((p) => p.hash === slot.hash);
  if (!slot || !print) return { gone: true };
  const found = matchNow(print, slot.ordinal, now);
  return found === null ? { gone: true } : { offset: found };
}

/** The start of the scene in `now` that is `print`'s, or null. */
function matchNow(print: ScenePrint, ordinal: number, now: string): number | null {
  const { slots, prints } = scenePrints(now);
  const byHash = new Map(prints.map((p) => [p.hash, p]));
  let best: { from: number; rank: [number, number, number] } | null = null;
  for (const slot of slots) {
    const other = byHash.get(slot.hash) as ScenePrint;
    if (slot.hash !== print.hash && !sameScene(print, other)) continue;
    // The same version first, then the same heading, then the most alike, then the nearest.
    const rank: [number, number, number] = [
      slot.hash === print.hash ? 1 : 0,
      other.headingKey === print.headingKey ? 1 : 0,
      similarity(print, other).jaccard - Math.abs(slot.ordinal - ordinal) * 1e-6,
    ];
    if (
      !best ||
      rank[0] > best.rank[0] ||
      (rank[0] === best.rank[0] &&
        (rank[1] > best.rank[1] || (rank[1] === best.rank[1] && rank[2] > best.rank[2])))
    )
      best = { from: slot.from, rank };
  }
  return best?.from ?? null;
}
