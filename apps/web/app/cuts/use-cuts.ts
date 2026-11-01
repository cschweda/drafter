import { draftName } from '@drafter/history';
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
import { closeTempTab, showTempTab, tempTabShown } from '../drafts/tabs';
import { useDrafts } from '../drafts/use-drafts';
import { applyTextChanges } from '../editor/apply-changes';
import { useEditor } from '../editor/session';
import { sayOutline } from '../outline/notice';
import { useOutline } from '../outline/use-outline';
import { historyReadOnly } from '../snapshots/restore';
import { useScript } from '../storage/script';
import { createCutInsert } from './insert';
import { cutName, type GroupBy, NOT_KEPT_SAMPLE } from './labels';
import { type CutRow, cutRow, listCuts, markPutBack } from './store';
import { cutsRecorded } from './use-recorder';

// The Cuts list's session (drafts-and-cuts design §3.2): the open script's cuts, a tab that exists
// only while open (placed as the Drafts list is), the filter, and the actions: Put back, Insert at
// cursor, and Copy. It replaces Deleted scenes; Find in Cuts (from a Compare group) opens it on a
// heading. Cuts are read from storage, never scanned here: the recorder keeps them as they happen.

export const CUTS_TAB = { id: 'cuts', label: 'Cuts' } as const;

export interface CutsSession {
  /** The open script's cuts, newest first. */
  rows: Readonly<ShallowRef<CutRow[]>>;
  /** They have been read for the open script. */
  loaded: Readonly<Ref<boolean>>;
  filter: Ref<string>;
  /** How the list groups them: by scene or chapter (the default), or by draft. */
  groupBy: Ref<GroupBy>;
  /** Where they are kept: in this browser until Task 7 writes them beside the work. */
  where: Readonly<Ref<'beside' | 'browser'>>;
  /** Why no cuts are kept here (none open, a sample), or null. */
  notKept: Readonly<ComputedRef<string | null>>;
  /** Why the text can't be changed from the list now, or null. */
  readOnly: Readonly<ComputedRef<string | null>>;
  isOpen: Readonly<Ref<boolean>>;
  open(focusPanel?: boolean): void;
  close(refocus?: boolean): void;
  /** Whether a pane shows the list now. */
  shown(): boolean;
  /** Opens the list filtered to `heading` (Find in Cuts, from a Compare group). */
  find(heading: string): void;
  /**
   * Opens the list on the cuts made while writing Draft `n`, grouped by draft (from a step of
   * Draft by draft).
   */
  showDraft(n: number): void;
  /** The cut to focus once it is listed (Find in Cuts); the list clears it. */
  pendingFind: Ref<string | null>;
  load(): Promise<void>;
  putBack(id: string): Promise<boolean>;
  insertAtCursor(id: string): Promise<boolean>;
  copy(id: string): Promise<void>;
}

let shared: CutsSession | undefined;

function create(): CutsSession {
  const editor = useEditor();
  const script = useScript();
  const outline = useOutline();
  const drafts = useDrafts();
  const rows = shallowRef<CutRow[]>([]);
  const loaded = ref(false);
  const filter = ref('');
  const groupBy = ref<GroupBy>('scene');
  const where = ref<'beside' | 'browser'>('browser');
  const isOpen = ref(false);
  const pendingFind = ref<string | null>(null);
  const notKept = computed(() => {
    const open = script.project.value;
    if (!open) return 'No script is open yet.';
    if (open.sample) return NOT_KEPT_SAMPLE;
    return null;
  });
  const readOnly = computed(() => {
    if (editor.kind.value === 'fountain') return outline.readOnly.value;
    return historyReadOnly() ?? (editor.locked.value ? 'The script can’t be changed now.' : null);
  });
  const say = (message: string) => void sayOutline(message);

  let reads = 0;
  async function load() {
    const mine = ++reads;
    const projectId = script.project.value?.id ?? null;
    if (projectId === null || notKept.value !== null) {
      rows.value = [];
      loaded.value = true;
      return;
    }
    let found: CutRow[] = [];
    try {
      found = await listCuts(projectId);
    } catch {
      found = [];
    }
    if (mine !== reads || script.project.value?.id !== projectId) return;
    rows.value = found;
    loaded.value = true;
  }

  const inserts = createCutInsert({
    readOnly: () => readOnly.value,
    text: () => editor.view.state.doc.toString(),
    cursor: () => editor.view.state.selection.main.head,
    kind: () => (editor.kind.value === 'markdown' ? 'markdown' : 'fountain'),
    apply: (changes, options) =>
      !editor.view.state.readOnly && applyTextChanges(editor.view, changes, options),
    say,
    async mark(id) {
      const projectId = script.project.value?.id;
      if (projectId) await markPutBack(projectId, id, Date.now());
      await load();
    },
  });

  /** The cut, read again: the list may be a moment behind. */
  async function rowOf(id: string): Promise<CutRow | null> {
    const projectId = script.project.value?.id;
    if (!projectId) return null;
    const row = await cutRow(projectId, id).catch(() => null);
    if (!row) say('That cut isn’t here any more.');
    return row;
  }

  effectScope(true).run(() => {
    // Another script: its own cuts; and the list again when cuts are recorded for this one.
    watch(
      () => script.project.value?.id,
      () => {
        loaded.value = false;
        rows.value = [];
        void load();
      },
    );
    watch(cutsRecorded, (recorded) => {
      if (recorded && recorded.projectId === script.project.value?.id) void load();
    });
    // A restored draft: its list again (drafts and cuts design, Review Focus 5).
    watch(drafts.version, () => void load());
  });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && isOpen.value) void load();
    });
  }

  return {
    rows,
    loaded,
    filter,
    groupBy,
    where,
    notKept,
    readOnly,
    isOpen,
    open(focusPanel = true) {
      if (!isOpen.value) filter.value = '';
      isOpen.value = true;
      void load();
      showTempTab(CUTS_TAB.id, focusPanel);
    },
    close(refocus = false) {
      if (!isOpen.value) return;
      closeTempTab(CUTS_TAB.id, refocus);
      isOpen.value = false;
      pendingFind.value = null;
    },
    shown: () => isOpen.value && tempTabShown(CUTS_TAB.id),
    find(heading) {
      isOpen.value = true;
      filter.value = heading.trim();
      pendingFind.value = heading.trim();
      void load();
      showTempTab(CUTS_TAB.id, false);
    },
    showDraft(n) {
      isOpen.value = true;
      filter.value = draftName(n);
      groupBy.value = 'draft';
      void load();
      showTempTab(CUTS_TAB.id, true);
    },
    pendingFind,
    load,
    async putBack(id) {
      const row = await rowOf(id);
      return row ? inserts.putBack(row) : false;
    },
    async insertAtCursor(id) {
      const row = await rowOf(id);
      return row ? inserts.insertAtCursor(row) : false;
    },
    async copy(id) {
      const row = await rowOf(id);
      if (!row) return;
      try {
        await navigator.clipboard.writeText(row.text);
        say(`Copied ${cutName(row)}.`);
      } catch {
        say('Couldn’t copy the cut.');
      }
    },
  };
}

/** The open script's cuts: made on first use in the browser and kept for the visit. */
export function useCuts(): CutsSession {
  shared ??= create();
  return shared;
}
