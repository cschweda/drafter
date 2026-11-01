import { cutText, findCuts, type WorkKind } from '@drafter/history';
import { cutOrdinal, passageLine, type Unit, unitsOf } from '../cuts/place';
import type { FoundCutAt } from '../cuts/store';
import type { HistoryReply, HistoryRequest } from '../history/protocol';
import type { SnapshotSource } from './history-compute';

// The history worker's cuts (drafts-and-cuts design §3.1): what left a text between two kept
// versions, for the recorder, and the first-run backfill over a script's old snapshots, so the page
// never runs `findCuts` on a long text itself.

/** The cuts between two texts, each with its own place (`where.ordinal`) and, for a passage, the line it followed. */
export function foundCuts(before: string, after: string, kind: WorkKind): FoundCutAt[] {
  const lf = cutText(before);
  let units: Unit[] | null = null;
  return findCuts(before, after, kind).map((cut) => {
    const within = cut.where.within;
    const ordinal = within ? within.ordinal : cutOrdinal(before, cut.text, kind);
    let lineAfter: string | undefined;
    if (within) {
      units ??= unitsOf(lf, kind);
      lineAfter = passageLine(lf, cut.text, kind, within.ordinal, units);
    }
    return {
      title: cut.title,
      text: cut.text,
      where: {
        ...cut.where,
        ...(ordinal === undefined ? {} : { ordinal }),
        ...(lineAfter === undefined ? {} : { lineAfter }),
      },
    };
  });
}

type Backfill = Extract<HistoryRequest, { kind: 'backfill' }>;

/**
 * Runs a backfill, posting one reply per pair, until done or `live` says it was stopped. A
 * snapshot that can't be read is passed over: the pair spans it. A comparison that throws stops
 * the run (the worker replies with the error), so the page never stores progress past it. With nothing to compare (no old
 * snapshots), the one reply is the last.
 */
export async function backfill(
  request: Backfill,
  source: SnapshotSource,
  post: (reply: HistoryReply) => void,
  live: () => boolean,
): Promise<void> {
  const { seq, projectId, docKind, since, upTo, end } = request;
  const old = (await source.list(projectId)).filter((ref) => ref.at < since).reverse();
  if (!live()) return;
  // Pairs: each snapshot with the one before it, then the newest with `end`.
  const total = Math.max(0, old.length - 1) + (end !== null && old.length > 0 ? 1 : 0);
  let read = 0;
  let previous: string | null = null;
  const reply = (at: number, cuts: FoundCutAt[], done: boolean) =>
    post({ seq, kind: 'backfill', at, cuts, read, total, done });
  for (const [i, ref] of old.entries()) {
    // Pairs done before the tab closed are passed over: only the text the next pair starts from is read.
    const next = old[i + 1];
    const needed = upTo === null || ref.at > upTo || !next || next.at > upTo;
    const text = needed ? await source.read(ref.id) : undefined;
    if (!live()) return;
    if (i > 0) read++;
    if (typeof text !== 'string') {
      if (upTo === null || ref.at > upTo) reply(ref.at, [], false);
      continue;
    }
    if (previous !== null && (upTo === null || ref.at > upTo)) {
      // A pair that can't be compared throws: the run stops there, and its progress stays.
      reply(ref.at, foundCuts(previous, text, docKind), false);
    }
    previous = text;
  }
  if (end !== null && previous !== null) {
    read++;
    reply(since, foundCuts(previous, end, docKind), true);
    return;
  }
  reply(since, [], true);
}
