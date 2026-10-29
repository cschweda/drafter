import {
  categoriesOf,
  type KeyedNote,
  type NoteEntry,
  nestReplies,
  STARTING_CATEGORIES,
} from '@drafter/notes';
import type { Scene, SceneIndex } from '@drafter/outline';

// What the Notes tab lists (Phase 2 design §8): every note and boneyard but the scene fields and
// Beat Board cards, in a group, narrowed by category, person, status, scene, and text. Pure.

export type NoteGroup = 'all' | 'mine' | 'readers' | 'setups' | 'boneyard';

export interface NoteFilter {
  group: NoteGroup;
  /** A category name, lowercased: a category head or a tag. */
  category: string | null;
  /** A person's name, matched without regard to case. */
  person: string | null;
  /** A note's status; boneyards and marks have none, so they show only with `all`. */
  status: 'open' | 'resolved' | 'all';
  /** A scene's ordinal. */
  scene: number | null;
  text: string;
}

export const NO_FILTER: NoteFilter = {
  group: 'all',
  category: null,
  person: null,
  status: 'all',
  scene: null,
  text: '',
};

export interface NoteRowModel {
  entry: NoteEntry;
  /** `Name re Name` replies, nested under the note they answer (`nestReplies`). */
  replies: NoteEntry[];
  /** The scene holding it; null before the first scene. */
  scene: Scene | null;
  categories: string[];
  person: string | null;
  /** Its first line's number in the script, from 1. */
  line: number;
}

/** Whether a note has a status to resolve (controller ruling 2): the writer's own, or a person's. */
export function hasStatus(note: KeyedNote | null): note is KeyedNote {
  const kind = note?.head?.kind;
  return note !== null && (kind === undefined || kind === 'category' || kind === 'person');
}

/** A note the writer acts on: open, in My notes or Readers. */
export const isOpen = (entry: NoteEntry): boolean => hasStatus(entry.note) && !entry.note.resolved;

/** Listed at all: never a scene field or a Card (design §8, Call). */
const listed = (entry: NoteEntry) => {
  const kind = entry.note?.head?.kind;
  return kind !== 'field' && kind !== 'card';
};

const inGroup = (entry: NoteEntry, group: NoteGroup): boolean => {
  const kind = entry.note?.head?.kind;
  switch (group) {
    case 'all':
      return true;
    case 'mine':
      return entry.kind === 'note' && (kind === undefined || kind === 'category');
    case 'readers':
      return kind === 'person';
    case 'setups':
      return kind === 'mark';
    case 'boneyard':
      return entry.kind === 'boneyard';
  }
};

export const personOf = (entry: NoteEntry): string | null =>
  entry.note?.head?.kind === 'person' ? entry.note.head.name : null;

export const categoriesOfEntry = (entry: NoteEntry): string[] =>
  hasStatus(entry.note) ? categoriesOf(entry.note) : [];

/** The scene each entry sits in, walking both lists once (both are in source order). */
function scenesOf(entries: readonly NoteEntry[], index: SceneIndex): Map<NoteEntry, Scene | null> {
  const out = new Map<NoteEntry, Scene | null>();
  const scenes = index.scenes;
  let at = 0;
  for (const entry of entries) {
    const from = entry.span.from;
    while (at < scenes.length && (scenes[at] as Scene).span.to <= from) at++;
    const scene = scenes[at];
    out.set(entry, scene && scene.span.from <= from ? scene : null);
  }
  return out;
}

/**
 * The rows the Notes tab shows for `filter`. A thread (a note and the replies to it) shows when
 * its note or any reply matches, with every reply under it, so a person's reply is found in
 * context. `setups` holds the marks, `boneyard` the boneyards; the Setups & payoffs group draws
 * them by label (`setupsAndPayoffs`).
 */
export function notesShown(
  entries: readonly NoteEntry[],
  index: SceneIndex,
  filter: NoteFilter,
  lineOf: (offset: number) => number,
): NoteRowModel[] {
  const list = entries.filter(listed);
  const scenes = scenesOf(list, index);
  const text = filter.text.trim().toLowerCase();
  const person = filter.person?.toLowerCase() ?? null;
  const matches = (entry: NoteEntry) => {
    if (!inGroup(entry, filter.group)) return false;
    if (filter.category !== null && !categoriesOfEntry(entry).includes(filter.category)) {
      return false;
    }
    if (person !== null && personOf(entry)?.toLowerCase() !== person) return false;
    if (filter.status !== 'all') {
      if (!hasStatus(entry.note)) return false;
      if (entry.note.resolved !== (filter.status === 'resolved')) return false;
    }
    if (filter.scene !== null && scenes.get(entry)?.ordinal !== filter.scene) return false;
    if (text !== '' && !entry.text.toLowerCase().includes(text)) return false;
    return true;
  };
  const rows: NoteRowModel[] = [];
  for (const { entry, replies } of nestReplies(list)) {
    if (!matches(entry) && !replies.some(matches)) continue;
    rows.push({
      entry,
      replies,
      scene: scenes.get(entry) ?? null,
      categories: categoriesOfEntry(entry),
      person: personOf(entry),
      line: lineOf(entry.span.from),
    });
  }
  return rows;
}

/** Open notes in My notes and Readers (Call 15): the tab's badge. */
export function openCount(entries: readonly NoteEntry[]): number {
  let count = 0;
  for (const entry of entries) if (isOpen(entry)) count++;
  return count;
}

/** The categories in use, as first used, then the starting set's that aren't (design §8). */
export function categoriesInUse(entries: readonly NoteEntry[]): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    for (const name of categoriesOfEntry(entry)) if (!out.includes(name)) out.push(name);
  }
  for (const name of STARTING_CATEGORIES) if (!out.includes(name)) out.push(name);
  return out;
}

/** The people with notes, as first named, once each without regard to case. */
export function peopleInUse(entries: readonly NoteEntry[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of entries) {
    const name = personOf(entry);
    if (name === null || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}
