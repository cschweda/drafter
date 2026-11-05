import type { EditorView } from '@codemirror/view';
import { savedText } from '@drafter/cm-fountain';
import type { Ref, ShallowRef } from 'vue';
import { db } from './db';
import { checkRecovery, type RecoveryState } from './health';
import { type Project, writeSource } from './projects';
import { clearStash, stash } from './unwritten';
import type { Writer } from './writer';

/** How long a failing recovery copy waits before it tries again on its own. */
export const RETRY_MS = 30_000;

/** What the recovery copy needs from the script session (`script.ts`). */
export interface RecoveryCopyDeps {
  /** The open project, which a write replaces with its stored copy. */
  project: ShallowRef<Project | null>;
  /** What the status bar says of the recovery copy; "unavailable" while writes fail. */
  recovery: Ref<RecoveryState>;
  view: EditorView;
  /** The open script's writer, if this tab may write it (another tab may hold it). */
  writer(): Writer | undefined;
  /** Opens the database and the most recent script again: for a database that never opened. */
  reopen(): Promise<void>;
}

export interface RecoveryCopy {
  /** A write failed: "unavailable", and a try again in `RETRY_MS`. */
  fail(): void;
  /** The session opened, so the storage works: no failure stands, and no try again is due. */
  recovered(): void;
  /** Runs `run` after every change to the stored project already asked for. */
  exclusive<T>(run: () => Promise<T>): Promise<T>;
  /** Writes `source` as the recovery copy of project `id`; a failure is the "unavailable" state. */
  persist(id: string, source: string): Promise<void>;
  /** For a page being hidden or closed: keeps the pending text where a closing page can, and writes it. */
  flushQuietly(): void;
}

/**
 * The recovery copy of the open script (out of `script.ts`'s session, 2026-11-04): the writes, one
 * at a time; "unavailable" when one fails, and a try again every `RETRY_MS` until the storage
 * works; and the text a closing page leaves behind.
 */
export function createRecoveryCopy({
  project,
  recovery,
  view,
  writer: currentWriter,
  reopen,
}: RecoveryCopyDeps): RecoveryCopy {
  let failing = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  function fail() {
    failing = true;
    recovery.value = 'unavailable';
    armRetry();
  }

  function armRetry() {
    if (retry !== undefined) return;
    retry = setTimeout(() => {
      retry = undefined;
      void tryAgain();
    }, RETRY_MS);
  }

  async function tryAgain() {
    if (!failing) return;
    if (!project.value) {
      // A database that failed to open stays failed until it is closed.
      db.close({ disableAutoOpen: false });
      await reopen();
      return;
    }
    await currentWriter()
      ?.flush()
      .catch(() => {});
    if (failing && !currentWriter()?.pending) {
      // Nothing was waiting to be written, so only the storage itself can say.
      const state = await checkRecovery();
      if (state !== 'unavailable') {
        failing = false;
        recovery.value = state;
      }
    }
    if (failing) armRetry();
  }

  /**
   * Changes to the stored project go one at a time, each starting from the copy the session holds
   * when it runs: a recovery write and a save's bookkeeping can't overwrite each other.
   */
  let exclusiveTail: Promise<unknown> = Promise.resolve();
  function exclusive<T>(run: () => Promise<T>): Promise<T> {
    const result = exclusiveTail.then(run);
    exclusiveTail = result.catch(() => {});
    return result;
  }

  /** Writes `source` as the recovery copy of project `id`; a failure is the "unavailable" state. */
  async function persist(id: string, source: string) {
    let gone = false;
    try {
      await exclusive(async () => {
        const current = project.value;
        if (!current || current.id !== id) {
          gone = true;
          return;
        }
        // The title is a cache of the text. The first edit to a first document's sample text
        // ends Start blank's offer for good: from here the text is the writer's work.
        const edited = current.blank !== undefined && source !== current.baseline;
        project.value = await writeSource(current, source, edited ? { blank: undefined } : {});
      });
    } catch (error) {
      fail();
      throw error;
    }
    // The script was switched away from: `open` flushed it first, so nothing is lost here.
    // Not a success: the text was not written, and the writer must keep it.
    if (gone) throw new Error(`There is no script ${id} to write to.`);
    // What a closing page left behind is written, unless newer text has been typed since.
    if (savedText(view.state).toString() === source) clearStash(id);
    if (failing) {
      failing = false;
      clearTimeout(retry);
      retry = undefined;
      recovery.value = await checkRecovery();
    }
  }

  /** For a page being hidden or closed: keep the pending text where a closing page can, and write it. */
  const flushQuietly = () => {
    const writer = currentWriter();
    // No writer: another tab keeps this script, and nothing here is its to write. A tab that is
    // handing the script over is read-only but still has its writer, and the text it hasn't
    // written yet is still its to leave.
    if (!writer) return;
    if (writer.pending && project.value) stash(project.value.id, savedText(view.state).toString());
    void writer.flush().catch(() => {});
  };

  function recovered() {
    failing = false;
    clearTimeout(retry);
    retry = undefined;
  }

  return { fail, recovered, exclusive, persist, flushQuietly };
}
