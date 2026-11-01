import { watch } from 'vue';
import { useDrafts } from '../drafts/use-drafts';
import { useEditor } from '../editor/session';
import { useHistoryClient } from '../history/client';
import { useScript } from '../storage/script';
import { type BackfillDeps, runBackfill, storageBackfill } from './backfill';
import { sayRecorded, setDraftNow, useCutRecorder } from './use-recorder';

// Cuts in the app (drafts-and-cuts design §3.1): the recorder hears every whole-text replacement
// (Restore as a new draft here; Restore from a snapshot, reload and Revert to Saved tell it
// themselves), and a few seconds after the page opens the first-run backfill starts in the history
// worker, once per script, carrying on where a closed tab left it.

/** How long after the page opens the backfill starts, so it never competes with opening a script. */
export const BACKFILL_DELAY_MS = 4000;

/** Runs a backfill in the history worker, with a client of its own. */
const workerRun: BackfillDeps['run'] = (request, on) => {
  const client = useHistoryClient();
  client.request(request, (reply) => {
    on(reply);
    if (reply.kind === 'error' || (reply.kind === 'backfill' && reply.done)) client.release();
  });
};

let installed = false;

export function installCuts(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  // v0.24.0's first run is marked at once, before any snapshot the recorder compares: snapshots
  // after it are the recorder's, never the backfill's (or a cut would be dated twice).
  const backfill = { ...storageBackfill(), run: workerRun, recorded: sayRecorded };
  const since = backfill.since().catch(() => undefined);
  const recorder = useCutRecorder();
  const editor = useEditor();
  const script = useScript();
  const drafts = useDrafts();
  // The draft being written, read as each snapshot is taken: once the open script's drafts have
  // been listed (each load bumps `version`), its number; before then, the recorder reads it later.
  let listedFor: string | null = null;
  watch(drafts.version, () => {
    listedFor = script.project.value?.id ?? null;
  });
  watch(
    () => script.project.value?.id,
    () => {
      listedFor = null;
    },
    { flush: 'sync' },
  );
  setDraftNow((projectId) =>
    projectId === listedFor && projectId === script.project.value?.id ? drafts.current.value : null,
  );
  drafts.onReplaced(() => {
    const id = script.project.value?.id;
    if (id) void recorder.replaced(id, editor.view.state.doc.toString());
  });
  setTimeout(() => {
    void since.then(() => runBackfill(backfill));
  }, BACKFILL_DELAY_MS);
}
