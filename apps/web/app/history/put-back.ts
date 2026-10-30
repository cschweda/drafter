import type { TextChange } from '@drafter/fountain';
import { type DeletedScene, type Place, putBackChanges } from '@drafter/history';
import type { ApplyOptions } from '../editor/apply-changes';
import { useEditor } from '../editor/session';
import { sayOutline } from '../outline/notice';
import { useOutline } from '../outline/use-outline';
import { useScript } from '../storage/script';
import { sceneText, useHistoryClient } from './client';

// Put back (version-history design §3.5, Calls 11 and 12): a deleted scene's text, from the
// snapshot it was last in, goes back where the history worker says (`putBackPlace`, which knows that
// snapshot's scenes and their prints), as one change through the Outline's `apply`, so Undo takes
// it out; refused, with the Outline's reason, in a read-only tab or with an unclosed `/*`. No
// snapshot is taken first. It says where it went, and puts the editor's cursor on the scene's
// heading (the Script pane follows), leaving focus where it is: in the list, so several can be put
// back in turn.

/** What Put back reads and drives, so it can be tested without the app. */
export interface PutBackDeps {
  /** Why the script can't be changed from a view now (the Outline's), or null. */
  readOnly(): string | null;
  projectId(): string | null;
  /** The script's text now. */
  text(): string;
  sceneText(snapshot: string, slot: { from: number; to: number }): Promise<string | null>;
  /** Where the scene at index `slot` of `snapshot` goes back in `now`; null when it can't say. */
  place(projectId: string, now: string, snapshot: string, slot: number): Promise<Place | null>;
  /** One transaction, one undo; false when nothing could change. */
  apply(changes: readonly TextChange[], options?: ApplyOptions): boolean;
  say(message: string): void;
}

/** "Put back INT. HALL - NIGHT after INT. KITCHEN - DAY. Undo takes it out." */
export function putBackSaid(heading: string, place: Place): string {
  const where = place.side === 'end' ? 'at the end of the script' : `${place.side} ${place.anchor}`;
  return `Put back ${heading} ${where}. Undo takes it out.`;
}

/** How many times the place is asked for again when the script changed while it was found. */
const TRIES = 3;

export function createPutBack(deps: PutBackDeps): (entry: DeletedScene) => Promise<boolean> {
  return async (entry) => {
    const heading = entry.newest.print.heading || 'the untitled scene';
    const refused = () => {
      const why = deps.readOnly();
      if (why) deps.say(why);
      return why !== null;
    };
    if (refused()) return false;
    const projectId = deps.projectId();
    if (projectId === null) return false;
    const { snapshot, slot } = entry.newest;
    const text = await deps.sceneText(snapshot, slot);
    if (text === null) {
      deps.say(`That version of ${heading} can’t be read.`);
      return false;
    }
    for (let i = 0; i < TRIES; i++) {
      const now = deps.text();
      const place = await deps.place(projectId, now, snapshot, slot.ordinal - 1);
      if (deps.projectId() !== projectId) return false;
      // The text changed while the place was found: it is found again for the text as it is.
      if (deps.text() !== now) continue;
      if (!place) {
        deps.say(`Couldn’t find where ${heading} goes back.`);
        return false;
      }
      if (refused()) return false;
      const changes = putBackChanges(now, place, text);
      const insert = changes[0];
      const anchor = insert ? insert.from + Math.max(0, insert.insert.search(/[^\r\n]/)) : 0;
      if (!deps.apply(changes, { selection: { anchor } })) {
        deps.say('Nothing was changed: this tab can’t edit the script now.');
        return false;
      }
      deps.say(putBackSaid(heading, place));
      return true;
    }
    deps.say('The script kept changing, so nothing was put back. Try again.');
    return false;
  };
}

let shared: ((entry: DeletedScene) => Promise<boolean>) | undefined;

/** Puts `entry`'s newest version back in the open script (design §3.5); says what it did. */
export function putBack(entry: DeletedScene): Promise<boolean> {
  if (!shared) {
    const editor = useEditor();
    const outline = useOutline();
    const script = useScript();
    shared = createPutBack({
      readOnly: () => outline.readOnly.value,
      projectId: () => script.project.value?.id ?? null,
      text: () => editor.view.state.doc.toString(),
      sceneText,
      // A client of its own for the one request, so the worker ends with the views using it.
      place: (projectId, now, snapshot, slot) =>
        new Promise((resolve) => {
          const client = useHistoryClient();
          client.request({ kind: 'place', projectId, now, snapshot, slot }, (reply) => {
            if (reply.kind !== 'place' && reply.kind !== 'error') return;
            client.release();
            resolve(reply.kind === 'place' ? reply.place : null);
          });
        }),
      apply: (changes, options) => outline.apply(changes, options),
      say: (message) => void sayOutline(message),
    });
  }
  return shared(entry);
}
