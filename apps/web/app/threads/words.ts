import { isThreadLabel, THREAD_LIMITS } from '@drafter/notes';

// The words of the thread dialogs (Threads design §7.4, §7.5): why a label is refused, the
// limit, the merge question, and what is announced after an edit. One place, so a dialog and its
// announcement never say it two ways.

type Noun = 'scene' | 'passage';

const BREAK = /[\r\n\u2028\u2029]/u;

const count = (n: number, noun: Noun) => `${n} ${n === 1 ? noun : `${noun}s`}`;

/** Why `text` can't be a thread's label, in plain words, or null when it can. */
export function labelRefusal(text: string): string | null {
  if (isThreadLabel(text)) return null;
  const label = text.trim();
  if (label === '') return 'A thread needs a label.';
  if (label.length > THREAD_LIMITS.label) {
    return `A label is at most ${THREAD_LIMITS.label} characters.`;
  }
  if (BREAK.test(label)) return 'A label is one line.';
  if (label.includes(',')) return 'A label can’t have a comma, because a comma splits labels.';
  return 'A label can’t have [[ or ]], because they open and close a note.';
}

/** The most threads one scene or passage may be in. */
export function limitMessage(noun: Noun): string {
  return `A ${noun} has at most ${THREAD_LIMITS.perUnit} threads.`;
}

export function renamedMessage(from: string, to: string, units: number, noun: Noun): string {
  return `Renamed thread ${from} to ${to} in ${count(units, noun)}.`;
}

export function mergeQuestion(from: string, to: string): string {
  return `${to} is already a thread. Merge ${from} into it?`;
}

export function removeQuestion(label: string, units: number, noun: Noun): string {
  return `Remove thread ${label} from ${count(units, noun)}?`;
}

export function removedMessage(label: string, units: number, noun: Noun): string {
  return `Removed thread ${label} from ${count(units, noun)}.`;
}

export const REFUSED = 'Nothing was changed.';

/**
 * Why Save from Threads… can't write `labels` (the scene's or passage's own, hand-typed, with what
 * was checked), naming the label at fault or saying there are too many; null when it can.
 */
export function saveRefusal(labels: readonly string[], noun: Noun): string | null {
  if (labels.length > THREAD_LIMITS.perUnit) {
    return `This ${noun} is in more than ${THREAD_LIMITS.perUnit} threads. Uncheck some to save.`;
  }
  for (const label of labels) {
    const why = labelRefusal(label);
    if (!why) continue;
    const reason = `${why.charAt(0).toLowerCase()}${why.slice(1)}`.replace(/\.$/u, '');
    return `Thread ${label.trim()} can’t be saved: ${reason}. Uncheck it to save.`;
  }
  return null;
}
