import { findCuts, type WorkKind } from '@drafter/history';
import { cutOrdinal } from '../cuts/place';
import type { FoundCutAt } from '../cuts/store';
import type { HistoryReply, HistoryRequest } from '../history/protocol';
import type { SnapshotSource } from './history-compute';

// The history worker's cuts (drafts-and-cuts design §3.1): what left a text between two kept
// versions, for the recorder, and the first-run backfill over a script's old snapshots, so the page
// never runs `findCuts` on a long text itself.

/** The cuts between two texts, each with its own place (`where.ordinal`). */
export function foundCuts(before: string, after: string, kind: WorkKind): FoundCutAt[] {
  return findCuts(before, after, kind).map((cut) => {
    const ordinal = cut.where.within
      ? cut.where.within.ordinal
      : cutOrdinal(before, cut.text, kind);
    return {
      title: cut.title,
      text: cut.text,
      where: { ...cut.where, ...(ordinal === undefined ? {} : { ordinal }) },
    };
  });
}

type Backfill = Extract<HistoryRequest, { kind: 'backfill' }>;

/**
 * Runs a backfill, posting one reply per pair, until done or `live` says it was stopped. A
 * snapshot that can't be read is passed over: the pair spans it. With nothing to compare (no old
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
      let cuts: FoundCutAt[] = [];
      try {
        cuts = foundCuts(previous, text, docKind);
      } catch {
        cuts = [];
      }
      reply(ref.at, cuts, false);
    }
    previous = text;
  }
  if (end !== null && previous !== null) {
    read++;
    let cuts: FoundCutAt[] = [];
    try {
      cuts = foundCuts(previous, end, docKind);
    } catch {
      cuts = [];
    }
    reply(since, cuts, true);
    return;
  }
  reply(since, [], true);
}
