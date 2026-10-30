/**
 * How far an export is, as the export worker tells the page (the toast's bar): one fraction for
 * the whole export, from 0 to 1, or null while it is in a stage that can't say how far it is
 * (fetching the fonts and parsing, or pdf-lib saving the file), when the bar moves without a
 * number. The fraction is the stages' shares added up, each share weighted by the time that stage
 * takes (`WEIGHTS`).
 */

/** An export's stages, in order. */
export type ExportStage = 'prepare' | 'layout' | 'draw' | 'save';
const ORDER: readonly ExportStage[] = ['prepare', 'layout', 'draw', 'save'];

export type StageWeights = Readonly<Partial<Record<ExportStage, number>>>;

/**
 * Each stage's share of a PDF export, from timings of long ones (2026-10-29, in Node): a 100-page
 * Markdown document spent about 4% parsing, 52% laying out, 43% drawing, and 1.5% saving; a
 * 600-page screenplay about 10% parsing and laying out (one step here, which can't say how far it
 * is), 69% drawing, and 21% saving. An HTML file or an EPUB takes its kind's (`markdown` for a
 * Markdown document's, `script` for a script's): it says only that it is under way, then 1.
 */
export const WEIGHTS = {
  markdown: { prepare: 5, layout: 50, draw: 40, save: 5 },
  script: { prepare: 10, draw: 70, save: 20 },
} as const satisfies Record<string, StageWeights>;

/** At most one progress message in this long, so a long export sends some ten a second. */
export const PROGRESS_EVERY_MS = 100;

/** The whole export's fraction, `done` of `total` through `stage`: never under 0 or over 1. */
export function overall(
  weights: StageWeights,
  stage: ExportStage,
  done: number,
  total: number,
): number {
  const sum = ORDER.reduce((n, s) => n + (weights[s] ?? 0), 0);
  if (sum <= 0) return 0;
  const before = ORDER.slice(0, ORDER.indexOf(stage)).reduce((n, s) => n + (weights[s] ?? 0), 0);
  // A stage with nothing in it (no blocks to lay out) is done.
  const part = total > 0 ? Math.min(1, Math.max(0, done / total)) : 1;
  return Math.min(1, Math.max(0, (before + (weights[stage] ?? 0) * part) / sum));
}

export interface ProgressReporter {
  /** In a stage that can't say how far it is: the bar moves without a number until the next step. */
  unknown(): void;
  /** `done` of `total` through `stage`. */
  step(stage: ExportStage, done: number, total: number): void;
  /** The export is done: 1. */
  done(): void;
}

/**
 * Turns an export's steps into messages for `send`, throttled: at most one each
 * `PROGRESS_EVERY_MS`, except that a switch between knowing and not knowing how far it is, and the
 * last message (1), are always sent, and the same value is never sent twice running.
 */
export function progressReporter(
  weights: StageWeights,
  send: (fraction: number | null) => void,
  opts: { now?: () => number; every?: number } = {},
): ProgressReporter {
  const now = opts.now ?? (() => performance.now());
  const every = opts.every ?? PROGRESS_EVERY_MS;
  let sent: number | null | undefined;
  let last = Number.NEGATIVE_INFINITY;
  const post = (value: number | null, always: boolean) => {
    if (value === sent) return;
    const at = now();
    if (!always && at - last < every) return;
    sent = value;
    last = at;
    send(value);
  };
  return {
    unknown: () => post(null, sent !== null),
    step: (stage, done, total) => post(overall(weights, stage, done, total), sent === null),
    done: () => post(1, true),
  };
}
