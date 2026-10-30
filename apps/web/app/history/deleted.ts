import { type DeletedScene, headingKey } from '@drafter/history';
import {
  type ComputedRef,
  computed,
  effectScope,
  nextTick,
  type Ref,
  ref,
  type ShallowRef,
  shallowRef,
  watch,
} from 'vue';
import { useFocusMode } from '../composables/useFocusMode';
import { usePanes } from '../composables/usePanes';
import { useTabSlot } from '../composables/useTabSlot';
import { useEditor } from '../editor/session';
import { sayOutline } from '../outline/notice';
import { useSnapshots } from '../snapshots/use-snapshots';
import { useScript } from '../storage/script';
import { listSnapshots, type SnapshotInfo } from '../storage/snapshots';
import { NOT_FOR_MARKDOWN } from '../strip/labels';
import {
  DELETED_TAB,
  dropTab,
  openBeside,
  PHONE_DEFAULT_TAB,
  type TabId,
  WIDE_QUERY,
} from '../utils/panes';
import { type HistoryClient, useHistoryClient } from './client';
import { filterDeleted } from './labels';

// The Deleted scenes tab's session (version-history design §3.3, §9, Call 34): a tab that exists
// only while it is open, placed as Compare is. While open it asks the history worker for the
// script's deleted scenes, which stream in newest first, and asks again 1 second after the text
// stops changing, when a snapshot is taken or deleted, and for another script (whose list starts
// empty: never another script's scenes). Nothing is scanned for a Markdown document or a sample,
// and the tab says why.

export interface ScanProgress {
  read: number;
  total: number;
  unreadable: number;
  capped: boolean;
}

export interface DeletedSession {
  /** Opens the tab (or shows it), and focuses its panel unless `focusPanel` is false. */
  open(focusPanel?: boolean): void;
  /** Takes the tab away. Focus in it (or with `refocus`) goes to the tab that replaces it. */
  close(refocus?: boolean): void;
  isOpen: Readonly<Ref<boolean>>;
  /** The deleted scenes as the worker last listed them, newest deleted first. */
  rows: Readonly<ShallowRef<DeletedScene[]>>;
  progress: Readonly<Ref<ScanProgress | null>>;
  /** The last list of this scan has come. */
  done: Readonly<Ref<boolean>>;
  /** The worker's error, if the scan failed. */
  failed: Readonly<Ref<string | null>>;
  filter: Ref<string>;
  /** `rows` that match the filter. */
  shown: ComputedRef<DeletedScene[]>;
  /** Why nothing is listed here: a Markdown document, or a sample; else null. */
  why: ComputedRef<string | null>;
  /** The script's snapshots as last listed, by id, for each entry's "Last in" words. */
  snapshots: Readonly<ShallowRef<ReadonlyMap<string, SnapshotInfo>>>;
  /**
   * The entry to focus once it is listed, by its heading's key (Find in Deleted scenes, from a
   * Compare group); the tab clears it once focused.
   */
  pendingFind: Ref<string | null>;
  /** Opens the tab at the entry whose heading is `heading`. */
  find(heading: string): void;
}

/** How long after the last change to the text the list is asked for again (§3.4). */
export const RESCAN_MS = 1000;

let session: DeletedSession | undefined;

function create(): DeletedSession {
  const editor = useEditor();
  const script = useScript();
  const snapshotsSession = useSnapshots();
  const panes = usePanes();
  const slot = useTabSlot();
  const focus = useFocusMode();

  const isOpen = ref(false);
  const rows = shallowRef<DeletedScene[]>([]);
  const progress = ref<ScanProgress | null>(null);
  const done = ref(false);
  const failed = ref<string | null>(null);
  const filter = ref('');
  const shown = computed(() => filterDeleted(rows.value, filter.value));
  const snapshots = shallowRef<ReadonlyMap<string, SnapshotInfo>>(new Map());
  const pendingFind = ref<string | null>(null);
  const why = computed(() => {
    if (editor.kind.value === 'markdown') return NOT_FOR_MARKDOWN;
    return snapshotsSession.notKept.value;
  });

  let client: HistoryClient | null = null;
  /** The script the rows are of. */
  let listedFor: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lists = 0;

  function reset() {
    rows.value = [];
    progress.value = null;
    done.value = false;
    failed.value = null;
    snapshots.value = new Map();
    listedFor = null;
  }

  function stop() {
    clearTimeout(timer);
    timer = undefined;
    client?.release();
    client = null;
  }

  async function listInfo(projectId: string) {
    const mine = ++lists;
    let found: SnapshotInfo[] = [];
    try {
      found = await listSnapshots(projectId);
    } catch {
      found = [];
    }
    if (mine === lists && script.project.value?.id === projectId)
      snapshots.value = new Map(found.map((s) => [s.id, s]));
  }

  /** Asks the worker for the list, for the script and its text as they are now. */
  function scan() {
    clearTimeout(timer);
    timer = undefined;
    const projectId = script.project.value?.id ?? null;
    if (!isOpen.value || why.value !== null || projectId === null) {
      stop();
      reset();
      return;
    }
    if (listedFor !== projectId) reset();
    listedFor = projectId;
    done.value = false;
    failed.value = null;
    void listInfo(projectId);
    client ??= useHistoryClient();
    client.request(
      { kind: 'deleted', projectId, now: editor.view.state.doc.toString() },
      (reply) => {
        if (listedFor !== projectId) return;
        if (reply.kind === 'progress') {
          progress.value = {
            read: reply.read,
            total: reply.total,
            unreadable: reply.unreadable,
            capped: reply.capped,
          };
        } else if (reply.kind === 'deleted') {
          rows.value = reply.scenes;
          if (reply.done) done.value = true;
        } else if (reply.kind === 'error') {
          failed.value = reply.message;
          done.value = true;
        }
      },
    );
  }

  const wide = () => window.matchMedia(WIDE_QUERY).matches;

  function show(focusPanel: boolean) {
    focus.leave();
    if (wide()) panes.tabs.value = openBeside(panes.tabs.value, DELETED_TAB.id);
    else panes.phoneTab.value = DELETED_TAB.id;
    if (focusPanel)
      void nextTick().then(() => document.getElementById(`panel-${DELETED_TAB.id}`)?.focus());
  }

  function open(focusPanel = true) {
    if (!isOpen.value) {
      isOpen.value = true;
      filter.value = '';
      scan();
    }
    show(focusPanel);
  }

  function close(refocus = false) {
    if (!isOpen.value) return;
    const shownIn = document.getElementById(`panel-${DELETED_TAB.id}`)?.closest('[data-pane]');
    const held = refocus || (!!shownIn && shownIn.contains(document.activeElement));
    isOpen.value = false;
    stop();
    reset();
    pendingFind.value = null;
    filter.value = '';
    let after: TabId | null = null;
    const tabs = panes.tabs.value;
    if (tabs.left === DELETED_TAB.id || tabs.right === DELETED_TAB.id) {
      const pane = tabs.left === DELETED_TAB.id ? 'left' : 'right';
      panes.tabs.value = dropTab(tabs, DELETED_TAB.id);
      if (wide()) after = panes.tabs.value[pane];
    }
    if (panes.phoneTab.value === DELETED_TAB.id) {
      panes.phoneTab.value = PHONE_DEFAULT_TAB;
      if (!wide()) after = PHONE_DEFAULT_TAB;
    }
    if (slot.value === DELETED_TAB.id) slot.value = null;
    if (held && after) {
      const panel = after;
      void nextTick().then(() => {
        if (panel === 'source') editor.view.focus();
        else document.getElementById(`panel-${panel}`)?.focus();
      });
    }
  }

  function find(heading: string) {
    pendingFind.value = headingKey(heading);
    open(false);
  }

  effectScope(true).run(() => {
    // The text changed: asked again once it has rested.
    watch(editor.doc, () => {
      if (!isOpen.value) return;
      clearTimeout(timer);
      timer = setTimeout(scan, RESCAN_MS);
    });
    // Another script, another kind, or the snapshots changed: asked again now.
    watch([() => script.project.value?.id, editor.kind, snapshotsSession.version, why], () => {
      if (isOpen.value) scan();
    });
    // A Find whose scene isn't listed once the scan is done says so.
    watch([done, pendingFind], ([finished, key]) => {
      if (!finished || key === null) return;
      if (rows.value.some((r) => headingKey(r.newest.print.heading) === key)) return;
      pendingFind.value = null;
      void sayOutline('That scene isn’t among the deleted scenes.');
    });
  });

  return {
    open,
    close,
    isOpen,
    rows,
    progress,
    done,
    failed,
    filter,
    shown,
    why,
    snapshots,
    pendingFind,
    find,
  };
}

/** The Deleted scenes tab's session: made on first use in the browser and kept for the visit. */
export function useDeleted(): DeletedSession {
  session ??= create();
  return session;
}
