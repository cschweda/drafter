import { type ComputedRef, computed, effectScope, type Ref, ref, shallowRef, watch } from 'vue';
import { useEditor } from '../editor/session';
import { writersEdit } from '../stats/writing';
import { useGuard } from '../storage/guard';
import { useScript } from '../storage/script';
import { type SnapshotReason, type TakeResult, takeSnapshot } from '../storage/snapshots';
import { createSnapshotSchedule } from './schedule';

// Taking snapshots as the writer works (Phase 2 design §11.1, technical design §8.4): every 10
// minutes of active writing (Call 7), on every save to a file, on opening a file (Call 3), on Take
// snapshot, and before a bulk operation. Each take captures the text at once and is written in the
// background through the store's queue (`storage/snapshots.ts`), so a save on the 10-minute mark is
// one snapshot. Nothing for a sample, in a read-only tab, or before a script is open. A failed write
// is said once per visit, and never reaches the editor or the save.

export interface SnapshotSession {
  /** Takes one of the open script now ('manual', with an optional label); 'failed' when nothing is kept here (a sample, a read-only tab). */
  take(label?: string): Promise<TakeResult>;
  /** Captures the text now, synchronously, and keeps it in the background as `reason`; the caller doesn't wait. Nothing for a sample or a read-only tab. */
  before(reason: Extract<SnapshotReason, `before-${string}`>): void;
  /** Bumped after every take or change, so History can list again. */
  version: Readonly<Ref<number>>;
  /** Why snapshots aren't kept here, or null: a sample, a read-only tab. */
  notKept: Readonly<ComputedRef<string | null>>;
}

/** The status bar's line after a failed write, once per visit; empty after a take works. */
export const snapshotProblem: Ref<string> = ref('');

const PROBLEM =
  'Couldn’t keep a snapshot: this browser’s storage is full. Your script is safe, and saving still works.';
const NO_SCRIPT = 'No script is open yet.';
const SAMPLE =
  'Snapshots aren’t kept for a sample. Save it to a file, and it becomes a script of your own that keeps them.';
const READ_ONLY = 'This script is open for editing in another tab, which keeps its snapshots.';

/** Whether this visit has said a snapshot failed: it says so once. */
let said = false;
let shared: SnapshotSession | undefined;

function create(): SnapshotSession {
  const editor = useEditor();
  const script = useScript();
  const guard = useGuard();
  const version = shallowRef(0);
  /** The open script's schedule: a switch of script starts the count again. */
  let schedule = createSnapshotSchedule();

  const notKept = computed(() => {
    const open = script.project.value;
    if (!open) return NO_SCRIPT;
    if (open.sample) return SAMPLE;
    if (guard.readOnly.value) return READ_ONLY;
    return null;
  });
  /** The open script's id, when this tab keeps its snapshots. */
  const kept = () => (notKept.value === null ? (script.project.value?.id ?? null) : null);
  const text = () => editor.view.state.doc.toString();

  /** Keeps `text` (already captured) in the background; resolves with what the store did. */
  function keep(
    id: string,
    captured: string,
    reason: SnapshotReason,
    extra: { label?: string; detail?: string } = {},
  ): Promise<TakeResult> {
    // Any snapshot of the open script starts the count again, so no timed one follows a save.
    if (id === script.project.value?.id) schedule.taken();
    return takeSnapshot(id, captured, reason, extra)
      .catch((): TakeResult => 'failed')
      .then((result) => {
        if (result === 'failed') {
          if (!said) snapshotProblem.value = PROBLEM;
          said = true;
        } else if (result === 'taken') snapshotProblem.value = '';
        version.value++;
        return result;
      });
  }

  // Only the writer's own edits count, as for the writing time: not a template block, a fix, or a reload.
  editor.onEdit((transactions) => {
    if (!transactions.some(writersEdit)) return;
    const id = kept();
    if (id === null) return;
    schedule.edit(Date.now());
    if (schedule.due()) void keep(id, text(), 'timed');
  });

  // A save is recorded with the text written, so the snapshot's hash is the script's `savedHash`.
  script.onRecorded((event) => {
    // A save recorded on another script (it finished after a switch) is that script's; the open
    // one is checked for what this tab keeps.
    if (event.id === script.project.value?.id && notKept.value !== null) return;
    void keep(
      event.id,
      event.text,
      event.kind,
      event.kind === 'opened' ? { detail: event.fileName } : {},
    );
  });

  effectScope(true).run(() => {
    watch(
      () => script.project.value?.id,
      () => {
        schedule.end();
        schedule = createSnapshotSchedule();
        version.value++;
      },
      { flush: 'sync' },
    );
  });
  // Hiding or closing the page ends the stretch at its last edit.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) schedule.end();
    });
    window.addEventListener('pagehide', () => schedule.end());
  }

  return {
    take(label) {
      const id = kept();
      if (id === null) return Promise.resolve('failed');
      const named = label?.trim();
      return keep(id, text(), 'manual', named ? { label: named } : {});
    },
    before(reason) {
      const id = kept();
      if (id !== null) void keep(id, text(), reason);
    },
    version,
    notKept,
  };
}

/** The open script's snapshots: created on first use in the browser, kept for the visit. */
export function useSnapshots(): SnapshotSession {
  shared ??= create();
  return shared;
}
