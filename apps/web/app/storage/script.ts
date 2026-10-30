import { isolateHistory } from '@codemirror/commands';
import { Text, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
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
import { desktop } from '../desktop';
import { firstSceneStart } from '../editor/first-scene';
import { SAMPLE_SCREENPLAY, SAMPLE_TEXT, type SampleKind } from '../editor/samples';
import { useEditor } from '../editor/session';
import type { StarterKind } from '../editor/starter-kinds';
import type { NewKind } from '../editor/template';
import { appChange } from '../editor/typewriter';
import type { DocumentKind } from '../markdown/kind';
import { useSnapshots } from '../snapshots/use-snapshots';
import { db } from './db';
import type { FileRef } from './files';
import { metSample, rememberSample } from './first-samples';
import { guardControl, useGuard } from './guard';
import { hashText } from './hash';
import { checkRecovery, type RecoveryState, requestPersistence } from './health';
import { leaveAllowed } from './leaving';
import { newScriptText } from './new-script';
import {
  createProject,
  derive,
  getProject,
  getSavedText,
  kindOf,
  listProjects,
  type Project,
  putHandle,
  removeProject,
  setSavedText,
  updateProject,
  writeSource,
} from './projects';
import { say } from './say';
import { type LineBreak, titleFileOf } from './text';
import { allStashes, clearStash, readStash, stash } from './unwritten';
import { createWriter, type Writer } from './writer';

export type { RecoveryState } from './health';

const firstVisit = ref(false);

/**
 * Whether this visit is a first one: the browser had no projects (scripts or samples) when the
 * page opened, so a first project was made for it (the screenplay sample, or a script of its own
 * when the writer typed before it was ready). The welcome dialog (`AppTour.vue`) reads this, and
 * only a first visit gets it.
 *
 * Contract:
 * - It is reactive (a watcher or computed that reads it is run again when the answer arrives).
 * - It is false until the first project is open, which is when `ready` turns true; a caller that
 *   needs the answer waits for `useScript().ready`. It is also false if the database can't be
 *   listed or written (`listProjects` or `createProject` rejects), since nothing then says the
 *   browser is a new one, and no project is made. It is set only after the first project exists.
 * - It is true when the writer typed before the session was ready: that is still the browser's
 *   first visit, and what they typed is kept as their own script (not the sample).
 * - It does not change for the rest of the visit: opening or making a script doesn't end the
 *   first visit. A reload is a returning visit, because the first one stored the sample.
 */
export function isFirstVisit(): boolean {
  return firstVisit.value;
}

/** Why the last change of document type did nothing, for the status bar; empty after one that worked. */
export const kindError = ref('');

/** Why Start blank's offer couldn't be put away in the stored copy, for the status bar; empty otherwise. */
export const blankError = ref('');

export interface ScriptSession {
  project: Readonly<ShallowRef<Project | null>>;
  /** The text differs from what was last saved to the file. A new script that hasn't been typed in has no changes. */
  dirty: Readonly<ComputedRef<boolean>>;
  /**
   * Closing the page now would lose text that is in no file and not in a recovery copy that is
   * known to work: changes to a script of the writer's own (a sample's edits are in its recovery
   * copy), or to anything while the recovery copy can't be written. Never in a read-only tab. The
   * browser's "leave this page?" question and the desktop app's close dialog both ask this.
   */
  wouldLose: Readonly<ComputedRef<boolean>>;
  recovery: Readonly<Ref<RecoveryState>>;
  /** The first project is open and the recovery copy has been checked once. */
  ready: Readonly<Ref<boolean>>;
  /** The storage warning to show, if any: "may be cleared" until it is dismissed, "unavailable" until a write succeeds. */
  warning: Readonly<ComputedRef<'not-persistent' | 'unavailable' | null>>;
  /** Hides the "may be cleared" warning for the rest of the visit. */
  dismissWarning(): void;
  /**
   * The text last saved to the script's file, as the session holds it; null for a sample or a
   * script with no file yet, or when that text is unknown. What Revert to Saved goes back to.
   */
  savedText: Readonly<ComputedRef<string | null>>;
  /** Writes the recovery copy's pending text now. A failure is swallowed: the recovery warning says so. */
  flush(): Promise<void>;
  /** Flushes the current script's recovery copy, then loads `id` into the editor as a fresh state (its own undo history). */
  open(id: string): Promise<void>;
  /**
   * Keeps the current script's recovery copy, then opens a new script: a title page to fill in,
   * with the cursor ready to type. The writer's first of a kind opens with that kind's sample text
   * instead, as a document of their own, which Start blank empties (`startBlank`); the kind is then
   * remembered (`storage/first-samples.ts`), and every later one is blank.
   */
  newScript(kind: NewKind): Promise<void>;
  /**
   * The open document opened with a sample's text, still has it untouched, and can be emptied:
   * Start blank would do something. The first edit the recovery copy keeps ends the offer for good.
   */
  canStartBlank: Readonly<ComputedRef<boolean>>;
  /** Ends Start blank's offer on the open document (its template or kind was changed). */
  forgetBlank(): void;
  /**
   * Puts the new-document text in place of a first document's sample text, as one undoable change
   * (one Undo brings back everything it replaced, and typing afterward isn't joined to it). The
   * blank text becomes what "changed" is measured from, and the offer is spent. Returns false,
   * changing nothing, unless `canStartBlank`.
   */
  startBlank(): boolean;
  /**
   * Makes the open script a `kind` document: Markdown, or Fountain again. The text and its undo
   * history stay; the editor's language and the project's `kind` change, and the title is read
   * again the way that kind reads it. Not an edit, so undo does not reverse it. Does nothing in a
   * tab that only shows the script, while a switch is under way, for a sample, or when it is that
   * kind already.
   */
  setKind(kind: DocumentKind): Promise<void>;
  /**
   * Keeps the fields `change` makes from the project, the open script's own settings that are not
   * its text (its export options), on its project: the copy held here and the stored one together.
   * `change` runs in its turn among the session's other writes, on the copy as it is then, so two
   * quick changes can't undo each other. Nothing in the text changes, so the script isn't changed
   * and Undo has nothing new. Does nothing in a tab that only shows the script, or with no script
   * open.
   */
  keepOnProject(
    change: (project: Project) => Pick<Partial<Project>, 'exportOptions' | 'timing'>,
  ): Promise<void>;
  /** Opens a sample: this browser's copy of it, with any edits made to it, or a fresh one. */
  openSample(kind: SampleKind): Promise<void>;
  /** A sample is open and the editor can change it: Reset sample would do something. */
  canResetSample: Readonly<ComputedRef<boolean>>;
  /**
   * Puts the open sample's original text back, as one undoable change: one Undo brings back
   * everything it replaced, and typing afterward isn't joined to it. The cursor goes to the
   * first scene heading. Returns false, changing nothing, unless `canResetSample` and the text
   * differs from the sample's (a text that is already the sample's has nothing to reset).
   */
  resetSample(): boolean;
  /** This browser's scripts, most recently updated first. Samples are not among them. */
  scripts(): Promise<Project[]>;
  /**
   * The editor's `text` was just written to a file called `fileName` (`ref`: where, unless it was
   * downloaded). Records it: the saved text and hash, the time, and the file, in the database and
   * in the copy the session holds, and the text becomes what "changed" is measured from. A sample
   * becomes a new script of the writer's own, which the editor then shows (the sample is left as
   * it was). Failing to record it is not failing to save: the file has the text.
   */
  saved(info: {
    text: string;
    fileName: string;
    ref: FileRef | null;
    /** The script the save started on. If another is open now, the record goes to this one. */
    id?: string;
    lineBreak?: LineBreak;
    bom?: boolean;
  }): Promise<void>;
  /**
   * Opens a file's text as a script of its own: its line break, BOM and name, its handle if it has
   * one, and its text as the saved text, so it opens clean. Resolves false if another switch was
   * under way (nothing is made then). The script that was open is kept first, as for any switch.
   */
  openedFile(file: OpenedFile): Promise<boolean>;
  /**
   * Opens Fountain `text` imported from the file named `importedFrom` (the Final Draft, Highland,
   * or Fade In file, or the Markdown file opened as a screenplay) as a new script with no file: not
   * saved, so Save asks for a `.fountain`, and never writes the file it came from. A script with no
   * title is called after the file. Resolves false if another switch was under way
   * (nothing is made then).
   */
  openImported(text: string, importedFrom: string): Promise<boolean>;
  /**
   * Puts a file's text in script `id`, in place of what it holds: one undoable change in the
   * editor, and the script counts as saved to that file. `'held'`: another tab has the script
   * (it is shown here, and nothing changed); `'busy'`: another switch was under way.
   */
  replaceWith(id: string, file: OpenedFile): Promise<'replaced' | 'held' | 'busy'>;
  /** Whether `p`'s text differs from what was last saved to its file (or from where it started). */
  changed(p: Project): Promise<boolean>;
  /** A switch of scripts is under way: further requests to switch are ignored until it ends. */
  readonly busy: Readonly<ComputedRef<boolean>>;
  /**
   * The editor is read-only until the script's file can be checked (the browser has not given
   * Drafter permission to read it). Whoever sets it clears it; showing another script clears it.
   */
  readonly fileLocked: Ref<boolean>;
  /**
   * Keeps `source` as a script of its own, without opening it: the version a changed file or this
   * browser's text had when the writer chose the other (Phase 1 design §9.6).
   */
  addScript(
    source: string,
    format?: {
      lineBreak?: LineBreak;
      bom?: boolean;
      kind?: DocumentKind;
      /** What "changed" is measured from until it has a file (so it can open unchanged). */
      baseline?: string;
      /** Made from one of Help's sample scripts (`Project.sampleScript`). */
      sampleScript?: SampleKind;
      /** Made from one of the guided starters (`Project.starter`). */
      starter?: StarterKind;
    },
  ): Promise<Project>;
  /** Script `id` is no longer bound to its file: its handle is let go (the file is untouched). */
  unbindFile(id: string): Promise<void>;
  /**
   * Calls `listener` after a save is recorded (`saved`, on the script it was recorded on, with the
   * text written, whose hash is that script's `savedHash`) and after `openedFile` opens a file as
   * a new script (`opened`). The snapshots hear of them (`snapshots/use-snapshots.ts`). A listener
   * that throws costs nothing: the save has happened. Returns a function that removes it.
   */
  onRecorded(listener: (event: Recorded) => void): () => void;
  /**
   * Removes script `id` from this browser (never its file). Removing the open script opens the most
   * recent other one, or the screenplay sample. A script another tab has open is not removed:
   * the answer is `'held'`.
   */
  remove(id: string): Promise<'removed' | 'held'>;
}

/** A save recorded, or a file opened as a script: what `onRecorded` hears. */
export interface Recorded {
  kind: 'saved' | 'opened';
  /** The script it was recorded on (a sample's save is the new script's). */
  id: string;
  /** The text written to the file, or read from it. */
  text: string;
  fileName: string;
}

/** A file's contents as `openedFile` and `replaceWith` take them: `text` has `\n` line breaks. */
export interface OpenedFile {
  text: string;
  lineBreak: LineBreak;
  bom: boolean;
  fileName: string;
  ref: FileRef | null;
  /** What the file is: by its name when it is opened, the script's own when it is read again. */
  kind?: DocumentKind;
}

/** How long a failing recovery copy waits before it tries again on its own. */
export const RETRY_MS = 30_000;

const text = (source: string) => Text.of(source.split('\n'));

/**
 * What "unchanged" means for a script (technical design §8.2): the text last saved to its file, or,
 * for a script with no file yet, the text it started from (a sample's own text, a new script's
 * template), else nothing. Null when the file's text is
 * unknown, so the script counts as changed.
 */
async function baselineOf(project: Project): Promise<Text | null> {
  if (project.savedHash !== undefined) {
    const saved = await getSavedText(project.id);
    if (saved !== undefined) return text(saved);
    return (await hashText(project.source)) === project.savedHash ? text(project.source) : null;
  }
  if (project.baseline !== undefined) return text(project.baseline);
  return text(project.sample ? SAMPLE_TEXT[project.sample] : '');
}

/** A save found, when its turn came, that the script it started on is no longer the open one. */
class MovedOn extends Error {}

let session: ScriptSession | undefined;

function create(): ScriptSession {
  const editor = useEditor();
  const { view } = editor;
  const project = shallowRef<Project | null>(null);
  const recovery = ref<RecoveryState>('not-persistent');
  const ready = ref(false);
  const dismissed = ref(false);
  const fileLocked = ref(false);
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

  const lastSaved = computed(() => {
    const current = project.value;
    // A new script's baseline is the template it started from, not a file's text.
    if (!current || current.sample || current.fileName === undefined) return null;
    return baseline.value?.toString() ?? null;
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
        editor.load(next.source, kindOf(next));
      } finally {
        loading = false;
      }
    }
    lastDoc = view.state.doc;
    baseline.value = from;
    project.value = next;
    // The new script's file has not been checked yet.
    fileLocked.value = false;
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

  /**
   * Puts the cursor at the start of `source`'s first scene heading and scrolls so that line is
   * near the top of the Source pane. Not an undo step, and not an edit: the text is untouched.
   * (The Script pane follows the cursor, so it shows the same place.) It happens after several
   * awaits, so it applies only to an untouched sample: the text is still `source` and the cursor
   * is still the empty one at 0. A writer who has typed, clicked, or jumped meanwhile (or a
   * `drafter:goto`) is not moved.
   */
  function cursorAtFirstScene(source: string) {
    const now = view.state.selection.main;
    if (view.state.doc.toString() !== source || !now.empty || now.head !== 0) return;
    const at = Math.min(firstSceneStart(source), view.state.doc.length);
    view.dispatch({
      selection: { anchor: at },
      effects: EditorView.scrollIntoView(at, { y: 'start', yMargin: 24 }),
      annotations: Transaction.addToHistory.of(false),
    });
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
        // The first project exists (it is the writer's own, from what they typed): a first visit.
        firstVisit.value = first;
      } else if (newest) {
        attach(newest, from, false, await guardControl.claim(newest.id));
        guardControl.finish();
      } else {
        askBrowserToKeep();
        const created = await createProject({ source: SAMPLE_SCREENPLAY, sample: 'screenplay' });
        await guardControl.claim(created.id);
        attach(created, text(SAMPLE_SCREENPLAY), true, true);
        guardControl.finish();
        firstVisit.value = true;
        // The writer has met the screenplay sample: a first New screenplay starts blank.
        void rememberSample('screenplay');
        // A first visit starts where the story does, not on the title page's metadata.
        cursorAtFirstScene(SAMPLE_SCREENPLAY);
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
   * `p` with the text a closed page left in the stash, when that is newer than the stored copy
   * and differs from it (it is written, so the stored copy has it); the stash goes either way. Only
   * for a script this tab holds the lock of. If the write fails it throws, and the stash stays.
   */
  async function withStash(p: Project): Promise<Project> {
    const left = readStash(p.id);
    if (!left) return p;
    const current =
      left.source !== p.source && left.at > p.updatedAt ? await writeSource(p, left.source) : p;
    clearStash(p.id);
    return current;
  }

  /**
   * The editor can't be typed in while a switch is under way: from the first flush until the new
   * script is shown, the old one is flushed and then left alone, and its lock is let go only
   * after the new one is shown. Switches are counted, not flagged, so one ending can never make
   * the editor editable under another.
   */
  const switches = ref(0);
  const switching = computed(() => switches.value > 0);

  let running: Promise<unknown> = Promise.resolve();

  /**
   * Makes the script `resolve` returns the current one, and says whether it did. A request that
   * comes while a switch is under way is ignored (a double click on New is one new script, and a
   * second switch can't load over text typed after the first), unless it `wait`s its turn.
   * `removing` is the current script's id when it is being removed: it goes once the replacement
   * exists, and a failure anywhere leaves it open. `keep` shows the new script with the editor's
   * own state, undo history and cursor included, for a script made from the text already there.
   * `shown` runs in the same step as the swap (a new script shows its editor and places its cursor).
   */
  async function switchTo(
    resolve: () => Promise<Project>,
    options: { removing?: string; keep?: boolean; wait?: boolean; shown?: () => void } = {},
  ): Promise<boolean> {
    while (switching.value) {
      if (!options.wait) return false;
      await running;
    }
    const run = (async () => {
      switches.value++;
      try {
        // A failed flush stops here: the text it couldn't keep must not be replaced.
        await writer?.flush();
        const next = await resolve();
        if (next.id === project.value?.id) return false;
        const from = await baselineOf(next);
        if (options.removing) {
          // Nothing is pending (the flush wrote it, and the editor is read-only), so what the writer
          // would write next can't bring the script back.
          await removeProject(options.removing);
          writer?.discard();
          clearStash(options.removing);
        }
        const writable = await guardControl.claim(next.id);
        // A tab that closed on this script right after typing left its newest text in the stash.
        // This tab holds the lock now, so the stash is its to apply (a tab that only shows the
        // script leaves it for the holder).
        let shown = next;
        if (writable) {
          try {
            shown = await withStash(next);
          } catch {
            // The database won't take the write: the stash stays for the next launch, and the
            // stored copy is shown.
          }
        }
        attach(
          shown,
          shown === next ? from : await baselineOf(shown),
          options.keep ?? false,
          writable,
        );
        guardControl.finish();
        // In the same step as the swap, so the page changes once: a phone that showed another tab
        // would otherwise show the new script with that tab for a moment, and a tap on the Source
        // tab in that moment would take the focus the script then put in the editor.
        options.shown?.();
        return true;
      } finally {
        switches.value--;
      }
    })();
    running = run.catch(() => {});
    return run;
  }

  async function open(id: string) {
    if (project.value?.id === id) return;
    // A request made while a switch is under way is ignored (see `switchTo`).
    await switchTo(async () => {
      const next = await getProject(id);
      if (!next) throw new Error(`There is no script ${id}.`);
      return next;
    });
  }

  async function newScript(kind: NewKind) {
    // A tab that only shows a script may show old text; it starts nothing (Phase 1 design §9.3).
    if (guard.readOnly.value) throw new Error('This tab is read-only.');
    const blank = newScriptText(kind, new Date());
    const made: DocumentKind = kind === 'markdown' ? 'markdown' : 'fountain';
    let cursor = blank.cursor;
    await switchTo(
      async () => {
        // The writer's first of this kind opens with its sample, as a document of their own.
        const first = !(await metSample(kind, await listProjects()));
        if (!first) {
          return createProject({ source: blank.text, baseline: blank.text, kind: made });
        }
        const source = SAMPLE_TEXT[kind];
        // A screenplay starts where the story does, as the first visit does; the stage play and
        // the Markdown document at the top, where they begin explaining.
        cursor = kind === 'screenplay' ? firstSceneStart(source) : 0;
        const created = await createProject({
          source,
          baseline: source,
          kind: made,
          blank: { text: blank.text, cursor: blank.cursor },
        });
        await rememberSample(kind);
        return created;
      },
      { shown: () => editor.goto(cursor) },
    );
  }

  const canStartBlank = computed(
    () =>
      !!project.value?.blank &&
      // Saved to a file, the document is plainly the writer's: the offer ends there.
      project.value.fileName === undefined &&
      // Only on the sample's own text: once the writer has changed it, emptying it would wipe their work.
      !dirty.value &&
      !guard.readOnly.value &&
      !switching.value &&
      !fileLocked.value,
  );

  function startBlank(): boolean {
    const current = project.value;
    const blank = current?.blank;
    if (!current || !blank || !canStartBlank.value) return false;
    // One transaction for the whole text, so one undo brings the sample back; an undo step of its
    // own, so typing just after it isn't joined to it (as Reset sample does).
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: blank.text },
      selection: { anchor: Math.min(blank.cursor, blank.text.length) },
      scrollIntoView: true,
      userEvent: 'input.replace',
      // Drafter's change, not the writer's: no writing time for it (stats/writing.ts).
      annotations: [isolateHistory.of('full'), appChange.of(true)],
    });
    // A new blank document is unchanged, as one made by New is; the offer goes with it.
    // The copy held here changes at once (the bar goes now); the stored one when its turn comes.
    baseline.value = text(blank.text);
    dropBlank(current, { baseline: blank.text });
    return true;
  }

  /**
   * Clears `blank` (with `more`) in the copy held here at once, so the offer goes now, and in the
   * stored copy in turn. If that write fails the offer is gone for this visit only, and the status
   * bar says so.
   */
  function dropBlank(current: Project, more: Partial<Project> = {}) {
    const fields = { blank: undefined, ...more };
    project.value = { ...current, ...fields };
    blankError.value = '';
    void patch(current.id, fields).catch(() =>
      say(blankError, 'Couldn’t update this browser’s copy. Start blank may be offered again.'),
    );
  }

  function forgetBlank() {
    const current = project.value;
    if (current?.blank) dropBlank(current);
  }

  async function setKind(kind: DocumentKind) {
    const current = project.value;
    // A sample is the example it is: it stays a screenplay or a stage play.
    if (!current || current.sample) return;
    if (guard.readOnly.value || switching.value || writer === undefined) return;
    if (kindOf(current) === kind) return;
    const id = current.id;
    kindError.value = '';
    // The editor first, so the text is never shown in the wrong mode longer than this call.
    editor.setKind(kind);
    try {
      await patch(id, {
        kind,
        // The blank text was the other kind's: the offer ends with the change.
        blank: undefined,
        ...derive(view.state.doc.toString(), titleFileOf(current), kind),
      });
    } catch {
      // The kind could not be stored: the editor goes back to the one that is, so the two agree.
      editor.setKind(kindOf(current));
      if (project.value?.id === id) {
        project.value = {
          ...project.value,
          kind: current.kind,
          title: current.title,
          templateId: current.templateId,
          meta: current.meta,
        };
      }
      await say(kindError, 'Couldn’t change the document type. Nothing was changed.');
    }
  }

  async function keepOnProject(
    change: (project: Project) => Pick<Partial<Project>, 'exportOptions' | 'timing'>,
  ) {
    const current = project.value;
    if (!current || guard.readOnly.value) return;
    await patch(current.id, change);
  }

  async function sampleProject(kind: SampleKind): Promise<Project> {
    const existing = (await listProjects()).find((p) => p.sample === kind);
    return (
      existing ??
      createProject({
        source: SAMPLE_TEXT[kind],
        sample: kind,
        kind: kind === 'markdown' ? 'markdown' : 'fountain',
      })
    );
  }

  const openSample = async (kind: SampleKind) => {
    await switchTo(() => sampleProject(kind));
  };

  const canResetSample = computed(
    () => !!project.value?.sample && !guard.readOnly.value && !switching.value && !fileLocked.value,
  );

  function resetSample(): boolean {
    const kind = project.value?.sample;
    if (!kind || !canResetSample.value) return false;
    const original = SAMPLE_TEXT[kind];
    if (view.state.doc.toString() === original) return false;
    // One transaction for the whole text, so one undo brings the edits back; an undo step of its
    // own, so typing just after it isn't joined to it (as `replaceWith` does).
    // A Markdown document has no scenes: its cursor goes to the top.
    const at = kind === 'markdown' ? 0 : firstSceneStart(original);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: original },
      selection: { anchor: at },
      effects: EditorView.scrollIntoView(at, { y: 'start', yMargin: 24 }),
      userEvent: 'input.replace',
      // Drafter's change, not the writer's: no writing time for it (stats/writing.ts).
      annotations: [isolateHistory.of('full'), appChange.of(true)],
    });
    return true;
  }

  // ---- Saving to a file --------------------------------------------------------------------

  const recordedListeners = new Set<(event: Recorded) => void>();
  function recorded(event: Recorded) {
    for (const listener of recordedListeners) {
      try {
        listener(event);
      } catch {
        // The file has the text; a listener's failure is its own.
      }
    }
  }

  /**
   * Changes the open script's stored fields and the copy held here together. `fields` can be made
   * from the held copy in this change's turn, so it starts from the writes before it.
   */
  function patch(
    id: string,
    change: Partial<Project> | ((held: Project) => Partial<Project>),
  ): Promise<void> {
    return exclusive(async () => {
      const held = project.value;
      let fields: Partial<Project>;
      if (typeof change !== 'function') fields = change;
      else if (held?.id === id) fields = change(held);
      else {
        // Another script opened while this write waited its turn: the choice is still kept, made
        // from the stored copy.
        const stored = await getProject(id);
        if (!stored) return;
        fields = change(stored);
      }
      if (held?.id === id && writer && !guard.readOnly.value) {
        // This tab writes the script, and the copy it holds is the stored one.
        const next: Project = { ...held, ...fields, updatedAt: Date.now() };
        project.value = next;
        await db.projects.put(next);
      } else {
        // Not this tab's to overwrite: change those fields in the stored copy only.
        await updateProject(id, fields);
        if (held?.id === id) project.value = { ...held, ...fields };
      }
    });
  }

  async function saved({
    text: savedText,
    fileName,
    ref,
    id,
    lineBreak,
    bom,
  }: {
    text: string;
    fileName: string;
    ref: FileRef | null;
    id?: string;
    lineBreak?: LineBreak;
    bom?: boolean;
  }) {
    // The writer switched scripts while the file was being written: the record is the starting
    // script's, and the open one is left as it is.
    if (id !== undefined && project.value?.id !== id)
      return savedElsewhere(id, savedText, fileName, ref);
    const format = {
      ...(lineBreak === undefined ? {} : { lineBreak }),
      ...(bom === undefined ? {} : { bom }),
    };
    // The file has this text, whatever happens to the record of it.
    baseline.value = text(savedText);
    const current = project.value;
    // No script is kept in this browser (the database is down): the file is all there is.
    if (!current) return;
    try {
      // The text that was written is kept as the recovery copy too, before the record points at it.
      await writer?.flush().catch(() => {});
      const hash = await hashText(savedText);
      const savedAt = Date.now();
      if (current.sample) {
        const handleId = ref ? await putHandle(crypto.randomUUID(), ref) : undefined;
        // The sample stays as it was; a script of the writer's own takes the text.
        let moved = false;
        let made: string | undefined;
        await switchTo(
          async () => {
            // Another switch ran first (this one waited its turn), and a different script is
            // open now: showing the new one with "the editor's own state" would put that other
            // script's text in it. The record is made without opening it.
            if (project.value?.id !== current.id) {
              moved = true;
              throw new MovedOn();
            }
            // The export options and rates chosen on the sample are the writer's choices: they go
            // with the text.
            const { exportOptions, timing } = project.value;
            const created = await createProject({
              source: savedText,
              fileName,
              savedHash: hash,
              savedAt,
              ...format,
              ...(handleId ? { fsHandleId: handleId } : {}),
              ...(exportOptions ? { exportOptions } : {}),
              ...(timing ? { timing } : {}),
            });
            await setSavedText(created.id, savedText);
            made = created.id;
            return created;
          },
          { keep: true, wait: true },
        ).catch((error) => {
          if (!(error instanceof MovedOn)) throw error;
        });
        if (moved) {
          if (handleId) await db.handles.delete(handleId).catch(() => {});
          await savedElsewhere(current.id, savedText, fileName, ref);
        } else if (made) recorded({ kind: 'saved', id: made, text: savedText, fileName });
        return;
      }
      const fsHandleId = ref
        ? await putHandle(current.fsHandleId ?? crypto.randomUUID(), ref)
        : current.fsHandleId;
      await setSavedText(current.id, savedText);
      await patch(current.id, {
        savedHash: hash,
        savedAt,
        fileName,
        ...format,
        ...(fsHandleId ? { fsHandleId } : {}),
      });
      recorded({ kind: 'saved', id: current.id, text: savedText, fileName });
    } catch {
      // The file was written; the recovery copy's state says if the database is the problem.
    }
  }

  /** Records a save against script `id`, which is not the one open. */
  async function savedElsewhere(
    id: string,
    savedText: string,
    fileName: string,
    ref: FileRef | null,
  ) {
    try {
      const hash = await hashText(savedText);
      const savedAt = Date.now();
      const on = await exclusive(async (): Promise<string | null> => {
        const stored = await getProject(id);
        // Removed meanwhile: the file has the text, and there is no record to make.
        if (!stored) return null;
        if (stored.sample) {
          // The sample stays as it was; a script of the writer's own takes the text, without being opened.
          const handleId = ref ? await putHandle(crypto.randomUUID(), ref) : undefined;
          const created = await createProject({
            source: savedText,
            fileName,
            savedHash: hash,
            savedAt,
            ...(handleId ? { fsHandleId: handleId } : {}),
            ...(stored.exportOptions ? { exportOptions: stored.exportOptions } : {}),
            ...(stored.timing ? { timing: stored.timing } : {}),
          });
          await setSavedText(created.id, savedText);
          return created.id;
        }
        const fsHandleId = ref
          ? await putHandle(stored.fsHandleId ?? crypto.randomUUID(), ref)
          : stored.fsHandleId;
        await setSavedText(id, savedText);
        await updateProject(id, {
          savedHash: hash,
          savedAt,
          fileName,
          ...(fsHandleId ? { fsHandleId } : {}),
        });
        return id;
      });
      if (on !== null) recorded({ kind: 'saved', id: on, text: savedText, fileName });
    } catch {
      // The file was written; the recovery copy's state says if the database is the problem.
    }
  }

  async function openedFile(file: OpenedFile): Promise<boolean> {
    const hash = await hashText(file.text);
    let made: string | undefined;
    const opened = await switchTo(async () => {
      const handleId = file.ref ? await putHandle(crypto.randomUUID(), file.ref) : undefined;
      try {
        const created = await createProject({
          source: file.text,
          baseline: file.text,
          kind: file.kind ?? 'fountain',
          lineBreak: file.lineBreak,
          bom: file.bom,
          fileName: file.fileName,
          savedHash: hash,
          savedAt: Date.now(),
          ...(handleId ? { fsHandleId: handleId } : {}),
        });
        await setSavedText(created.id, file.text);
        made = created.id;
        return created;
      } catch (error) {
        if (handleId) await db.handles.delete(handleId).catch(() => {});
        throw error;
      }
    });
    // The opened text is the saved text, so History starts at the file as it opened (Call 3).
    if (opened && made) {
      recorded({ kind: 'opened', id: made, text: file.text, fileName: file.fileName });
    }
    return opened;
  }

  function openImported(text: string, importedFrom: string): Promise<boolean> {
    return switchTo(() => createProject({ source: text, kind: 'fountain', importedFrom }));
  }

  async function replaceWith(id: string, file: OpenedFile): Promise<'replaced' | 'held' | 'busy'> {
    await open(id);
    if (project.value?.id !== id) return 'busy';
    if (guard.readOnly.value || !writer) return 'held';
    useSnapshots().before('before-reload');
    // One transaction for the whole text, so one undo brings the old text back; an undo step of
    // its own, so typing just after it isn't joined to it.
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: file.text },
      selection: { anchor: 0 },
      scrollIntoView: true,
      userEvent: 'input.replace',
      // Drafter's change, not the writer's: no writing time for it (stats/writing.ts).
      annotations: [isolateHistory.of('full'), appChange.of(true)],
    });
    await saved(file);
    return 'replaced';
  }

  async function addScript(
    source: string,
    format: {
      lineBreak?: LineBreak;
      bom?: boolean;
      kind?: DocumentKind;
      baseline?: string;
      sampleScript?: SampleKind;
      starter?: StarterKind;
    } = {},
  ): Promise<Project> {
    return createProject({
      source,
      ...(format.kind === undefined ? {} : { kind: format.kind }),
      ...(format.baseline === undefined ? {} : { baseline: format.baseline }),
      ...(format.sampleScript === undefined ? {} : { sampleScript: format.sampleScript }),
      ...(format.starter === undefined ? {} : { starter: format.starter }),
      ...(format.lineBreak === undefined ? {} : { lineBreak: format.lineBreak }),
      ...(format.bom === undefined ? {} : { bom: format.bom }),
    });
  }

  async function unbindFile(id: string): Promise<void> {
    const handleId = (await getProject(id))?.fsHandleId;
    await patch(id, { fsHandleId: undefined });
    if (handleId) await db.handles.delete(handleId);
  }

  async function changed(p: Project): Promise<boolean> {
    const from = await baselineOf(p);
    return from === null || !text(p.source).eq(from);
  }

  async function scripts(): Promise<Project[]> {
    // The title in the list is the text's, so the text is written first.
    await writer?.flush().catch(() => {});
    return (await listProjects()).filter((p) => !p.sample);
  }

  async function remove(id: string): Promise<'removed' | 'held'> {
    if (project.value?.id !== id) {
      const removed = await guardControl.whileFree(id, () => removeProject(id));
      if (removed) clearStash(id);
      return removed ? 'removed' : 'held';
    }
    // Another tab has it, and this one only shows it.
    if (guard.readOnly.value) return 'held';
    const switched = await switchTo(
      async () => {
        const others = (await listProjects()).filter((p) => p.id !== id);
        return others.find((p) => !p.sample) ?? (await sampleProject('screenplay'));
      },
      { removing: id },
    );
    // Ignored: another switch was under way, and nothing was removed.
    if (!switched) throw new Error('Another script is being opened.');
    return 'removed';
  }

  // ---- Two tabs ------------------------------------------------------------------------------

  // The editor follows the guard: read-only while another tab holds the script.
  effectScope(true).run(() => {
    watch(
      () => guard.readOnly.value || switching.value || fileLocked.value,
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
    async takeOver(id) {
      let next = await getProject(id);
      if (!next) throw new Error('The script is gone.');
      next = await withStash(next);
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
    if (leaveAllowed()) return;
    // The desktop app asks in its own dialog before it closes the window (see below). A page that
    // vetoes the unload would only keep the window from closing.
    if (desktop()) return;
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
    wouldLose: asking,
    savedText: lastSaved,
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
    newScript,
    canStartBlank,
    forgetBlank,
    startBlank,
    setKind,
    keepOnProject,
    openSample,
    canResetSample,
    resetSample,
    scripts,
    saved,
    openedFile,
    openImported,
    replaceWith,
    changed,
    busy: switching,
    fileLocked,
    flush: async () => {
      await writer?.flush().catch(() => {});
    },
    addScript,
    unbindFile,
    remove,
    onRecorded(listener) {
      recordedListeners.add(listener);
      return () => recordedListeners.delete(listener);
    },
  };
}

/** The current script and its recovery copy: created on first use in the browser and kept for the visit. */
export function useScript(): ScriptSession {
  session ??= create();
  return session;
}
