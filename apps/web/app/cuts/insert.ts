import type { TextChange } from '@drafter/fountain';
import type { CutEntry, WorkKind } from '@drafter/history';
import type { ApplyOptions } from '../editor/apply-changes';
import { cutName } from './labels';
import { cutChanges, insertPlace, putBackPlace } from './place';

// Put back and Insert at cursor (drafts-and-cuts design §3.2, Calls 9 and 10): a cut's text goes
// into the script as one change, so one undo takes it out, with a blank line either side. Put back
// puts it between its old neighbours (`putBackPlace`); Insert at cursor at the next scene (a whole
// scene of a script) or the next paragraph after the cursor. Either way the cut stays listed,
// marked "put back on <date>": Cuts is a record, not a clipboard. Refused, with the reason, in a
// read-only tab. The editor's cursor goes to what was put in; focus stays in the list.

export interface InsertDeps {
  /** Why the text can't be changed from a view now, or null. */
  readOnly(): string | null;
  text(): string;
  cursor(): number;
  kind(): WorkKind;
  /** One transaction, one undo; false when nothing could change. */
  apply(changes: readonly TextChange[], options?: ApplyOptions): boolean;
  say(message: string): void;
  /** Marks the cut put back. */
  mark(id: string): Promise<void>;
}

export interface CutInsert {
  putBack(row: CutEntry): Promise<boolean>;
  insertAtCursor(row: CutEntry): Promise<boolean>;
}

export function createCutInsert(deps: InsertDeps): CutInsert {
  async function put(row: CutEntry, how: 'back' | 'cursor'): Promise<boolean> {
    const why = deps.readOnly();
    if (why) {
      deps.say(why);
      return false;
    }
    const now = deps.text();
    const kind = deps.kind();
    const place =
      how === 'back'
        ? putBackPlace(row.where, now, kind)
        : insertPlace(now, deps.cursor(), kind, kind === 'fountain' && !row.where.within);
    const changes = cutChanges(now, place, row.text, kind);
    const insert = changes[0];
    const anchor = insert ? insert.from + Math.max(0, insert.insert.search(/[^\r\n]/)) : 0;
    if (!deps.apply(changes, { selection: { anchor } })) {
      deps.say('Nothing was changed: this tab can’t edit the script now.');
      return false;
    }
    await deps.mark(row.id).catch(() => undefined);
    deps.say(
      how === 'back'
        ? `Put back ${cutName(row)} ${place.said}. Undo takes it out.`
        : `Inserted ${cutName(row)} ${place.said}. Undo takes it out.`,
    );
    return true;
  }
  return {
    putBack: (row) => put(row, 'back'),
    insertAtCursor: (row) => put(row, 'cursor'),
  };
}
