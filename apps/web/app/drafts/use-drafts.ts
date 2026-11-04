import type { EditorState } from '@codemirror/state';
import { savedText } from '@drafter/cm-fountain';
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
import { replaceText } from '../editor/replace-text';
import { useEditor } from '../editor/session';
import type { DocumentKind } from '../markdown/kind';
import { sayOutline } from '../outline/notice';
import { historyReadOnly } from '../snapshots/restore';
import { useSnapshots } from '../snapshots/use-snapshots';
import { useGuard } from '../storage/guard';
import { hashText } from '../storage/hash';
import { useScript } from '../storage/script';
import {
  beforeRestoreNote,
  DRAFT_GONE,
  NO_SCRIPT,
  NOT_KEPT_SAMPLE,
  restoredLine,
  startedLine,
} from './labels';
import {
  type DraftFrom,
  type DraftRow,
  type DraftWhich,
  draftFrom,
  draftRow,
  draftText,
  freezeDraft,
  listDrafts,
  setDraftFrom,
  setDraftNote,
} from './store';
import { closeTempTab, showTempTab, tempTabShown } from './tabs';

// The drafts session (drafts-and-cuts design §2): the open script's drafts, the draft being
// written (the last number + 1, or 1: a work in progress opened from any file is in Draft 1),
// Start new draft, Restore as a new draft, and Read. Drafter never starts a draft by itself (Call 1).
// The Drafts list and the draft being read are tabs that exist only while open (`tabs.ts`).

/** The Drafts list's tab. */
export const DRAFTS_TAB = { id: 'drafts', label: 'Drafts' } as const;
/** The tab of the draft being read, beside the Source. */
export const READER_TAB = { id: 'draft', label: 'Draft' } as const;

/** What the session reads and drives, so it can be tested without the app. */
export interface DraftsDeps {
  projectId(): string | null;
  /** The editor's text now. */
  text(): string;
  /** What the editor holds: a Markdown document's draft counts only its prose's words. */
  kind?(): DocumentKind;
  /** Why the script can't be changed here now (another tab is editing it), or null. */
  readOnly(): string | null;
  /** Why drafts aren't kept for this script (none open, a sample), or null. */
  notKept(): string | null;
  /** Puts `text` in the editor as one change one undo takes back; false when it can't. */
  replace(text: string): boolean;
  /**
   * Keeps a snapshot of the text now, in the background, before a draft is frozen (`before-draft`)
   * or a draft restored (`before-restore`), so the cuts made so far are dated with the draft they
   * were made in (drafts-and-cuts design §3.1).
   */
  before(reason: 'before-draft' | 'before-restore'): void;
  /** The text was replaced whole: the cuts recorder moves its comparison point (Task 4). */
  replaced(): void;
  say(message: string): void;
  /** Shows the reader's tab. */
  showReader(): void;
}

export interface DraftReading {
  row: DraftRow;
  text: string;
}

export interface DraftsSession {
  /** The draft being written: the last number + 1, or 1. */
  current: Readonly<ComputedRef<number>>;
  /** The open script's frozen drafts, newest first. */
  rows: Readonly<ShallowRef<DraftRow[]>>;
  /** Where the draft being written came from (Restore as a new draft), or null. */
  from: Readonly<Ref<DraftFrom | null>>;
  /** Bumped after every change to the drafts, so the lists read again. */
  version: Readonly<Ref<number>>;
  /** Reads the open script's drafts again. */
  load(): Promise<void>;
  /** The last draft, when the editor's text is the same as it (Call 2); else null. */
  sameAs(): Promise<DraftRow | null>;
  /** Freezes the editor's text as Draft `current` with `note`; false (and why said) when it can't. */
  start(note: string): Promise<boolean>;
  /**
   * Restore as a new draft (Call 4): freezes the text now, then puts Draft `n`'s in as one undo.
   * `which` is a number (the script's own Draft n) or a row's key (an outside draft too).
   */
  restore(which: DraftWhich): Promise<boolean>;
  /** Opens Draft `n` (or the draft keyed `which`) read-only beside the Source. */
  read(which: DraftWhich): Promise<void>;
  /** The draft being read, or null. */
  reading: Readonly<ShallowRef<DraftReading | null>>;
  closeReader(): void;
  /** Changes draft `n`'s note. */
  setNote(which: DraftWhich, note: string): Promise<void>;
  /** Draft `n`'s text, or null. */
  textOf(which: DraftWhich): Promise<string | null>;
}

export function createDrafts(deps: DraftsDeps): DraftsSession {
  const rows = shallowRef<DraftRow[]>([]);
  const from = ref<DraftFrom | null>(null);
  const version = ref(0);
  const reading = shallowRef<DraftReading | null>(null);
  const current = computed(() => (rows.value[0]?.n ?? 0) + 1);
  let loads = 0;
  /** One start or restore at a time. */
  let busy = false;

  async function load() {
    const projectId = deps.projectId();
    const mine = ++loads;
    let listed: DraftRow[] = [];
    let came: DraftFrom | null = null;
    if (projectId !== null) {
      try {
        [listed, came] = await Promise.all([listDrafts(projectId), draftFrom(projectId)]);
      } catch {
        listed = [];
      }
    }
    if (mine !== loads) return;
    rows.value = listed;
    from.value = came;
    if (reading.value && reading.value.row.projectId !== projectId) reading.value = null;
    version.value++;
  }

  async function sameAs(): Promise<DraftRow | null> {
    const last = rows.value[0];
    if (!last) return null;
    return (await hashText(deps.text())) === last.id ? last : null;
  }

  const refused = (): boolean => {
    const why = deps.notKept() ?? deps.readOnly();
    if (why) deps.say(why);
    return why !== null;
  };

  async function start(note: string): Promise<boolean> {
    if (busy || refused()) return false;
    const projectId = deps.projectId();
    if (projectId === null) return false;
    busy = true;
    try {
      deps.before('before-draft');
      const out = await freezeDraft(projectId, deps.text(), note, undefined, deps.kind?.());
      if (out.result === 'failed') {
        deps.say(out.why);
        return false;
      }
      await load();
      deps.say(startedLine(out.row.n));
      return true;
    } finally {
      busy = false;
    }
  }

  async function restore(which: DraftWhich): Promise<boolean> {
    if (busy || refused()) return false;
    const projectId = deps.projectId();
    if (projectId === null) return false;
    busy = true;
    try {
      const target = await draftText(projectId, which);
      const row = await draftRow(projectId, which);
      if (target === null || !row) {
        deps.say(DRAFT_GONE);
        return false;
      }
      const n = row.n;
      // The reads took a moment: the script and the tab are checked again before anything changes.
      if (deps.projectId() !== projectId || refused()) return false;
      const now = deps.text();
      // A snapshot of it first, before any draft moves the number on: its cuts are this draft's.
      deps.before('before-restore');
      // The text now is kept first, as a draft, unless it is the last draft already (it is safe).
      const last = (await listDrafts(projectId))[0];
      if (!last || (await hashText(now)) !== last.id) {
        const kept = await freezeDraft(
          projectId,
          now,
          beforeRestoreNote(n),
          undefined,
          deps.kind?.(),
        );
        if (kept.result === 'failed') {
          deps.say(kept.why);
          await load();
          return false;
        }
      }
      if (deps.projectId() !== projectId || deps.text() !== now) {
        await load();
        deps.say('The script changed meanwhile, so its text was kept as a draft and not replaced.');
        return false;
      }
      if (!deps.replace(target)) {
        await load();
        deps.say('The script can’t be changed now.');
        return false;
      }
      deps.replaced();
      await setDraftFrom(projectId, { n, id: row.id }).catch(() => undefined);
      await load();
      deps.say(restoredLine(n, current.value));
      return true;
    } finally {
      busy = false;
    }
  }

  async function read(which: DraftWhich): Promise<void> {
    const projectId = deps.projectId();
    if (projectId === null) return;
    // By its key: the row and the text are this script's Draft n, whatever `rows` holds meanwhile.
    const row = await draftRow(projectId, which);
    const text = row ? await draftText(projectId, row.key) : null;
    if (!row || text === null) {
      deps.say('That draft can’t be read.');
      return;
    }
    if (deps.projectId() !== projectId) return;
    reading.value = { row, text };
    deps.showReader();
  }

  async function setNote(which: DraftWhich, note: string) {
    const projectId = deps.projectId();
    if (projectId === null) return;
    await setDraftNote(projectId, which, note);
    await load();
  }

  async function textOf(which: DraftWhich): Promise<string | null> {
    const projectId = deps.projectId();
    return projectId === null ? null : draftText(projectId, which);
  }

  return {
    current,
    rows,
    from,
    version,
    load,
    sameAs,
    start,
    restore,
    read,
    reading,
    closeReader: () => {
      reading.value = null;
    },
    setNote,
    textOf,
  };
}

// ---- The app's session ----------------------------------------------------------------------

/** The app's session, with the Drafts list's tab. */
export interface AppDrafts extends DraftsSession {
  /** Whether the Drafts list's tab is open. */
  isOpen: Readonly<Ref<boolean>>;
  /** Opens the Drafts list (or shows it), focusing its panel unless `focusPanel` is false. */
  open(focusPanel?: boolean): void;
  /** Takes the Drafts list's tab away. */
  close(refocus?: boolean): void;
  /** Whether a pane shows the Drafts list now. */
  shown(): boolean;
  /** Takes the reader's tab away. */
  closeReading(refocus?: boolean): void;
  /** Whether Start new draft is waiting for its dialog. */
  asking: Ref<boolean>;
  /** Opens Start new draft's dialog, or says why it can't. */
  ask(): void;
  /** Why drafts aren't kept here, or null. */
  notKept: Readonly<ComputedRef<string | null>>;
  /** Listens for whole-text replacements (Restore as a new draft): the cuts recorder (Task 4). */
  onReplaced(listener: () => void): () => void;
}

/**
 * The text a draft keeps, and the one an unchanged-since-the-last-draft check compares: what a save
 * would write, so a line Classic Mode just made inside a speech isn't frozen into the draft.
 */
export const draftSource = (state: EditorState): string => savedText(state).toString();

let shared: AppDrafts | undefined;

function createApp(): AppDrafts {
  const editor = useEditor();
  const script = useScript();
  const snapshots = useSnapshots();
  const guard = useGuard();
  const replacedListeners = new Set<() => void>();
  const notKept = computed(() => {
    const open = script.project.value;
    if (!open) return NO_SCRIPT;
    if (open.sample) return NOT_KEPT_SAMPLE;
    return null;
  });
  const session = createDrafts({
    projectId: () => script.project.value?.id ?? null,
    text: () => draftSource(editor.view.state),
    kind: () => editor.kind.value,
    readOnly: () =>
      historyReadOnly() ?? (editor.view.state.readOnly ? 'The script can’t be changed now.' : null),
    notKept: () => notKept.value,
    replace: (text) => replaceText(editor.view, text),
    before: (reason) => snapshots.before(reason),
    replaced: () => {
      for (const listener of replacedListeners) listener();
    },
    say: (message) => void sayOutline(message),
    showReader: () => showTempTab(READER_TAB.id),
  });
  const isOpen = ref(false);
  const asking = ref(false);

  function closeReading(refocus = false) {
    if (!session.reading.value) return;
    closeTempTab(READER_TAB.id, refocus);
    session.closeReader();
  }

  effectScope(true).run(() => {
    // Another script: its own drafts, and the reader and the list of the last one close.
    watch(
      () => script.project.value?.id,
      (id, was) => {
        if (id === was) return;
        closeReading();
        void session.load();
      },
    );
    // Another tab may have started drafts meanwhile: read again when this tab is handed the
    // editing, and when the page is shown again.
    watch(guard.readOnly, () => void session.load());
  });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void session.load();
    });
  }
  void session.load();

  return {
    ...session,
    isOpen,
    open(focusPanel = true) {
      isOpen.value = true;
      void session.load();
      showTempTab(DRAFTS_TAB.id, focusPanel);
    },
    close(refocus = false) {
      if (!isOpen.value) return;
      closeTempTab(DRAFTS_TAB.id, refocus);
      isOpen.value = false;
    },
    shown: () => isOpen.value && tempTabShown(DRAFTS_TAB.id),
    closeReading,
    asking,
    ask() {
      const why = notKept.value ?? historyReadOnly();
      if (why) {
        void sayOutline(why);
        return;
      }
      asking.value = true;
    },
    notKept,
    onReplaced(listener) {
      replacedListeners.add(listener);
      return () => replacedListeners.delete(listener);
    },
  };
}

/** The open script's drafts: made on first use in the browser and kept for the visit. */
export function useDrafts(): AppDrafts {
  shared ??= createApp();
  return shared;
}
