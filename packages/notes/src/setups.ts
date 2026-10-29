import type { Doc } from '@drafter/fountain';
import { type NoteEntry, noteEntries } from './entries';
import { normalizeLabel } from './keyed';

// Setups and payoffs (Phase 2 design §10): `[[Setup: label]]` and `[[Payoff: label]]` with the
// same label, matched without regard to case or spacing.

export interface SetupThread {
  /** The label as first typed. */
  label: string;
  setups: NoteEntry[];
  payoffs: NoteEntry[];
  /** A setup has no payoff after it: only a later payoff pays a setup off. */
  unpaid: boolean;
  /** Payoffs before every setup (all of them, with no setup): out of order. */
  early: NoteEntry[];
}

/** Each setup or payoff mark with its label; an empty label marks nothing. */
function marks(entries: readonly NoteEntry[]) {
  const out: Array<{ entry: NoteEntry; key: 'setup' | 'payoff'; label: string }> = [];
  for (const entry of entries) {
    const head = entry.note?.head;
    if (head?.kind !== 'mark' || entry.note?.body === '') continue;
    out.push({ entry, key: head.key, label: entry.note?.body ?? '' });
  }
  return out;
}

/**
 * Each label's setups and payoffs. A setup is paid only by a later payoff, so a label is unpaid
 * when its last setup has no payoff after it; `early` holds the payoffs before every setup. Unpaid
 * labels first, then by first offset.
 */
export function setupsAndPayoffs(entries: readonly NoteEntry[]): SetupThread[] {
  const threads = new Map<string, SetupThread & { first: number }>();
  for (const { entry, key, label } of marks(entries)) {
    const id = normalizeLabel(label);
    let thread = threads.get(id);
    if (!thread) {
      thread = { label, setups: [], payoffs: [], unpaid: false, early: [], first: entry.span.from };
      threads.set(id, thread);
    }
    (key === 'setup' ? thread.setups : thread.payoffs).push(entry);
  }
  const out = [...threads.values()].map(({ first, ...thread }) => {
    const firstSetup = thread.setups[0]?.span.from ?? Number.POSITIVE_INFINITY;
    const lastSetup = thread.setups.at(-1)?.span.from ?? Number.NEGATIVE_INFINITY;
    const lastPayoff = thread.payoffs.at(-1)?.span.from ?? Number.NEGATIVE_INFINITY;
    return {
      first,
      thread: {
        ...thread,
        unpaid: thread.setups.length > 0 && lastPayoff < lastSetup,
        early: thread.payoffs.filter((p) => p.span.from < firstSetup),
      },
    };
  });
  out.sort((a, b) => Number(b.thread.unpaid) - Number(a.thread.unpaid) || a.first - b.first);
  return out.map((t) => t.thread);
}

/** Setup and payoff labels in use, once each, as first typed, for the element bar's completion. */
export function markLabels(doc: Doc): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { label } of marks(noteEntries(doc))) {
    const id = normalizeLabel(label);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(label);
  }
  return out;
}
