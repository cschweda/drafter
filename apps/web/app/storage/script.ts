import { Text } from '@codemirror/state';
import {
  type ComputedRef,
  computed,
  effectScope,
  type Ref,
  ref,
  type ShallowRef,
  shallowRef,
  watch,
} from 'vue';
import { SAMPLE_SCREENPLAY } from '../editor/samples';
import { useEditor } from '../editor/session';
import { db } from './db';
import { guardControl, useGuard } from './guard';
import { hashText } from './hash';
import { checkRecovery, type RecoveryState, requestPersistence } from './health';
import {
  createProject,
  getProject,
  getSavedText,
  listProjects,
  type Project,
  writeSource,
} from './projects';
import { allStashes, clearStash, readStash, stash } from './unwritten';
import { createWriter, type Writer } from './writer';

export type { RecoveryState } from './health';

export interface ScriptSession {
  project: Readonly<ShallowRef<Project | null>>;
  /** The text differs from what was last saved to the file. A new script that hasn't been typed in has no changes. */
  dirty: Readonly<ComputedRef<boolean>>;
  recovery: Readonly<Ref<RecoveryState>>;
  /** The first project is open and the recovery copy has been checked once. */
  ready: Readonly<Ref<boolean>>;
  /** The storage warning to show, if any: "may be cleared" until it is dismissed, "unavailable" until a write succeeds. */
  warning: Readonly<ComputedRef<'not-persistent' | 'unavailable' | null>>;
  /** Hides the "may be cleared" warning for the rest of the visit. */
  dismissWarning(): void;
  /** Flushes the current script's recovery copy, then loads `id` into the editor as a fresh state (its own undo history). */
  open(id: string): Promise<void>;
}

/** How long a failing recovery copy waits before it tries again on its own. */
export const RETRY_MS = 30_000;

const text = (source: string) => Text.of(source.split('\n'));

/**
 * What "unchanged" means for a script (technical design §8.2): the text last saved to its file, or,
 * for a script with no file yet, nothing (a sample: its own text). Null when the file's text is
 * unknown, so the script counts as changed.
 */
async function baselineOf(project: Project): Promise<Text | null> {
  if (project.savedHash !== undefined) {
    const saved = await getSavedText(project.id);
    if (saved !== undefined) return text(saved);
    return (await hashText(project.source)) === project.savedHash ? text(project.source) : null;
  }
  return text(project.sample === 'screenplay' ? SAMPLE_SCREENPLAY : '');
}

let session: ScriptSession | undefined;

function create(): ScriptSession {
  const editor = useEditor();
  const { view } = editor;
  const project = shallowRef<Project | null>(null);
  const recovery = ref<RecoveryState>('not-persistent');
  const ready = ref(false);
  const dismissed = ref(false);
  // Before a project is open the editor holds the sample, in memory.
  const baseline = shallowRef<Text | null>(text(SAMPLE_SCREENPLAY));
  let writer: Writer | undefined;
  let lastDoc = view.state.doc;
  let loading = false;
  let failing = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const guard = useGuard();

  const dirty = computed(() => {
    editor.doc.value; // the text changed
    return baseline.value === null || !view.state.doc.eq(baseline.value);
  });

  // ---- The recovery copy -------------------------------------------------------------------

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
      await begin();
      return;
    }
    await writer?.flush().catch(() => {});
    if (failing && !writer?.pending) {
      // Nothing was waiting to be written, so only the storage itself can say.
      const state = await checkRecovery();
      if (state !== 'unavailable') {
        failing = false;
        recovery.value = state;
      }
    }
    if (failing) armRetry();
  }

  /** Writes `source` as the recovery copy of project `id`; a failure is the "unavailable" state. */
  async function persist(id: string, source: string) {
    const current = project.value;
    // The script was switched away from: `open` flushed it first, so nothing is lost here.
    // Not a success: the text was not written, and the writer must keep it.
    if (!current || current.id !== id) throw new Error(`There is no script ${id} to write to.`);
    try {
      const next = await writeSource(current, source);
      // The title is a cache of the text.
      if (project.value?.id === id) project.value = next;
    } catch (error) {
      fail();
      throw error;
    }
    // What a closing page left behind is written, unless newer text has been typed since.
    if (view.state.doc.toString() === source) clearStash(id);
    if (failing) {
      failing = false;
      clearTimeout(retry);
      retry = undefined;
      recovery.value = await checkRecovery();
    }
  }

  /** For a page being hidden or closed: keep the pending text where a closing page can, and write it. */
  const flushQuietly = () => {
    // No writer: another tab keeps this script, and nothing here is its to write. A tab that is
    // handing the script over is read-only but still has its writer, and the text it hasn't
    // written yet is still its to leave.
    if (!writer) return;
    if (writer.pending && project.value) stash(project.value.id, view.state.doc.toString());
    void writer.flush().catch(() => {});
  };

  // ---- Opening scripts ---------------------------------------------------------------------

  /**
   * Makes `next` the current script. Puts its text in the editor when `fromEditor` is false. A
   * script this tab may not edit (`writable` false: another tab holds it) gets no writer.
   */
  function attach(next: Project, from: Text | null, fromEditor: boolean, writable: boolean) {
    if (!fromEditor) {
      loading = true;
      try {
        editor.load(next.source);
      } finally {
        loading = false;
      }
    }
    lastDoc = view.state.doc;
    baseline.value = from;
    project.value = next;
    const id = next.id;
    writer = writable ? createWriter((source) => persist(id, source)) : undefined;
    // Text typed while the script was being read.
    if (writer && fromEditor && view.state.doc.toString() !== next.source) {
      writer.schedule(view.state.doc.toString());
    }
  }

  /**
   * Asks the browser to keep the storage. Firefox answers with a prompt, which may wait for ever,
   * so nothing waits for it: the state is read now, and again when (if) the answer comes.
   */
  function askBrowserToKeep() {
    void requestPersistence().then(async () => {
      if (recovery.value !== 'unavailable') recovery.value = await checkRecovery();
    });
  }

  /**
   * Writes the text closing pages left in the stash, for each script that is still there and whose
   * stored copy is older. A stash for a script that is gone, or older than its copy, is cleared.
   */
  async function restoreUnwritten(projects: Project[]) {
    for (const left of allStashes()) {
      const index = projects.findIndex((p) => p.id === left.id);
      const found = projects[index];
      if (found && found.source !== left.source && left.at >= found.updatedAt) {
        let written: Project | undefined;
        await guardControl.whileFree(found.id, async () => {
          written = await writeSource(found, left.source);
        });
        // Another tab has the script open: the stash is that tab's, and it clears it.
        if (!written) continue;
        projects.splice(index, 1);
        projects.unshift(written);
      }
      clearStash(left.id);
    }
  }

  /** Opens the most recent script, or the sample's on a first visit. */
  async function begin() {
    try {
      const projects = await listProjects();
      await restoreUnwritten(projects);
      const first = projects.length === 0;
      const newest = projects[0];
      const from = newest ? await baselineOf(newest) : null;
      // Anything typed since the page opened is kept, as a script of its own: nothing replaces it.
      const typed = view.state.doc.toString();
      if (typed !== SAMPLE_SCREENPLAY) {
        if (first) askBrowserToKeep();
        const created = await createProject({ source: typed });
        await guardControl.claim(created.id);
        attach(created, text(''), true, true);
        guardControl.finish();
      } else if (newest) {
        attach(newest, from, false, await guardControl.claim(newest.id));
        guardControl.finish();
      } else {
        askBrowserToKeep();
        const created = await createProject({ source: SAMPLE_SCREENPLAY, sample: 'screenplay' });
        await guardControl.claim(created.id);
        attach(created, text(SAMPLE_SCREENPLAY), true, true);
        guardControl.finish();
      }
      failing = false;
      clearTimeout(retry);
      retry = undefined;
    } catch {
      // IndexedDB won't open, or can't be written: the editor goes on with the text it has.
      fail();
      ready.value = true;
      return;
    }
    recovery.value = await checkRecovery();
    if (recovery.value === 'unavailable') fail();
    ready.value = true;
  }

  /**
   * The editor can't be typed in while a switch is under way: from the first flush until the new
   * script is shown, the old one is flushed and then left alone, and its lock is let go only
   * after the new one is shown.
   */
  const switching = ref(false);

  async function open(id: string) {
    if (project.value?.id === id) return;
    switching.value = true;
    try {
      // A failed flush stops here: the text it couldn't keep must not be replaced.
      await writer?.flush();
      const next = await getProject(id);
      if (!next) throw new Error(`There is no script ${id}.`);
      const from = await baselineOf(next);
      attach(next, from, false, await guardControl.claim(next.id));
      guardControl.finish();
    } finally {
      switching.value = false;
    }
  }

  // ---- Two tabs ------------------------------------------------------------------------------

  // The editor follows the guard: read-only while another tab holds the script.
  effectScope(true).run(() => {
    watch(
      () => guard.readOnly.value || switching.value,
      (on) => editor.setReadOnly(on),
      { immediate: true, flush: 'sync' },
    );
  });
  guardControl.bind({
    async giveUp() {
      try {
        await writer?.flush();
        return true;
      } catch {
        return false;
      }
    },
    /** The other tab's last text is in IndexedDB now; a stash only counts if it is newer than that. */
    async takeOver() {
      const id = project.value?.id;
      let next = id ? await getProject(id) : undefined;
      if (!next) throw new Error('The script is gone.');
      const left = readStash(next.id);
      if (left) {
        if (left.source !== next.source && left.at > next.updatedAt) {
          next = await writeSource(next, left.source);
        }
        clearStash(next.id);
      }
      attach(next, await baselineOf(next), false, true);
    },
    taken() {
      view.focus();
    },
  });

  // ---- Wiring ------------------------------------------------------------------------------

  editor.onState((state) => {
    if (loading || state.doc === lastDoc) return;
    if (guard.readOnly.value) return;
    lastDoc = state.doc;
    writer?.schedule(state.doc.toString());
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushQuietly();
  });
  window.addEventListener('pagehide', flushQuietly);

  // Leaving (technical design §8.2): a handler only while there is something to lose.
  const asking = computed(() => {
    const kept = project.value ? !project.value.sample : false;
    // A read-only tab holds nothing the other tab doesn't.
    if (guard.readOnly.value) return false;
    return dirty.value && (kept || recovery.value === 'unavailable');
  });
  const ask = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    // Older browsers show their dialog only when this is set.
    event.returnValue = '';
  };
  // The session lives for the visit, so its watchers belong to no component.
  effectScope(true).run(() => {
    watch(
      asking,
      (on) => {
        if (on) window.addEventListener('beforeunload', ask);
        else window.removeEventListener('beforeunload', ask);
      },
      { immediate: true, flush: 'sync' },
    );
  });

  void begin();

  return {
    project,
    dirty,
    recovery,
    ready,
    warning: computed(() => {
      // Until the first check has answered, `recovery` is only a guess.
      if (!ready.value) return null;
      if (recovery.value === 'unavailable') return 'unavailable';
      return recovery.value === 'not-persistent' && !dismissed.value ? 'not-persistent' : null;
    }),
    dismissWarning() {
      dismissed.value = true;
    },
    open,
  };
}

/** The current script and its recovery copy: created on first use in the browser and kept for the visit. */
export function useScript(): ScriptSession {
  session ??= create();
  return session;
}
