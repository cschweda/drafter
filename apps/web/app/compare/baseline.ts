import { type ChangeStop, stepChange } from '@drafter/compare';
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
import { useLayout } from '../editor/layout';
import { useEditor } from '../editor/session';
import type { DocumentKind } from '../markdown/kind';
import { sayOutline } from '../outline/notice';
import { useSnapshots } from '../snapshots/use-snapshots';
import { useScript } from '../storage/script';
import { listSnapshots, type SnapshotInfo, snapshotText } from '../storage/snapshots';

// Show changes on the Script pane (version-history design §4.1): what the pages are compared with.
// It starts off on every visit and every script, and nothing of it is remembered (Call 14). The
// baseline is the last save, read again after every save, so saving clears the marks; a script
// never saved to a file is compared with its first version (Call 15); with neither, and for a
// Markdown document (Call 16), it stays off and says why. The writer may choose a labelled
// snapshot, or any version from History; one that is deleted or thinned meanwhile falls back to
// the default and says so once. The baseline's text goes to the layout worker, with a new id
// whenever it changes, and the worker answers each layout's marks (§4.2).

export type Baseline =
  | { kind: 'saved' }
  | { kind: 'first' }
  | { kind: 'snapshot'; id: string; label: string };

export const MARKDOWN_WHY = 'A Markdown document’s changes are in Compare.';
export const NOTHING_WHY = 'Nothing to compare with yet: save, or take a snapshot.';
export const FALLBACK_SAVED =
  'The version Show changes was using is gone. It now shows changes since the last save.';
export const FALLBACK_FIRST =
  'The version Show changes was using is gone. It now shows changes since the first version.';

/** What a baseline is called on the slim bar ("since: Last save") and in its menu. */
export function baselineLabel(baseline: Baseline): string {
  if (baseline.kind === 'saved') return 'Last save';
  if (baseline.kind === 'first') return 'First version';
  return baseline.label;
}

export interface ShowChanges {
  on: Ref<boolean>;
  baseline: Ref<Baseline>;
  /** Why it can't be on, or null. */
  why: ComputedRef<string | null>;
  /** The baseline menu: Last save (or First version), the labelled snapshots, and the one picked. */
  choices: ComputedRef<{ baseline: Baseline; label: string }[]>;
  /** On or off; off with its reason said when it can't be on. */
  toggle(): void;
  /** Turns it on, compared with `b`. */
  since(b: Baseline): void;
  /** Next (1) or Previous (-1) mark on the pages, wrapping. */
  step(direction: 1 | -1): void;
  /** The mark stepped to, for the Script pane to focus. */
  at: Ref<number | null>;
  /** Set by `step` until the Script pane has focused the mark. */
  pendingFocus: Ref<boolean>;
  /** Reads the baseline again (a snapshot was deleted): one that is gone falls back. */
  check(): void;
}

/** What Show changes reads and drives, so it can be tested without the app. */
export interface ShowChangesDeps {
  kind: Readonly<Ref<DocumentKind>>;
  projectId: Readonly<Ref<string | null>>;
  /** The text last saved to the script's file; null when there is none. */
  savedText: Readonly<Ref<string | null>>;
  /** Bumped when snapshots are taken or thinned. */
  snapshotsVersion: Readonly<Ref<number>>;
  list(projectId: string): Promise<SnapshotInfo[]>;
  /** A snapshot's text; null when it is gone or can't be read. */
  read(id: string): Promise<string | null>;
  /** Hands the layout the baseline (a new id when its text changed), or null while off. */
  setBaseline(baseline: { id: number; text: string } | null): void;
  say(message: string): void;
  /** The marks' stops on the pages drawn now. */
  stops(): readonly ChangeStop[];
}

export function createShowChanges(deps: ShowChangesDeps): ShowChanges {
  const on = ref(false);
  /** The writer's choice; null: the default. */
  const chosen = shallowRef<Baseline | null>(null);
  /** The script's snapshots, newest first, as last listed; null until listed. */
  const listed: ShallowRef<SnapshotInfo[] | null> = shallowRef(null);
  const at = ref<number | null>(null);
  const pendingFocus = ref(false);
  /** The text last handed to the layout, and its id. */
  let sent: { id: number; text: string } | null = null;
  let ids = 0;
  /** Each read of the baseline, so an older one that finishes late is dropped. */
  let reads = 0;
  const checks = ref(0);

  const readable = computed(() => (listed.value ?? []).filter((s) => s.readable));
  const fallback = computed<Baseline>(() =>
    deps.savedText.value !== null || readable.value.length === 0
      ? { kind: 'saved' }
      : { kind: 'first' },
  );
  const baseline = computed<Baseline>(() => chosen.value ?? fallback.value);

  const why = computed(() => {
    if (deps.kind.value === 'markdown') return MARKDOWN_WHY;
    if (listed.value !== null && deps.savedText.value === null && readable.value.length === 0)
      return NOTHING_WHY;
    return null;
  });

  const choices = computed(() => {
    const list: { baseline: Baseline; label: string }[] = [];
    if (deps.savedText.value !== null)
      list.push({ baseline: { kind: 'saved' }, label: 'Last save' });
    else if (readable.value.length > 0)
      list.push({ baseline: { kind: 'first' }, label: 'First version' });
    for (const s of readable.value)
      if (s.label)
        list.push({ baseline: { kind: 'snapshot', id: s.id, label: s.label }, label: s.label });
    const picked = chosen.value;
    if (
      picked?.kind === 'snapshot' &&
      !list.some((c) => c.baseline.kind === 'snapshot' && c.baseline.id === picked.id)
    )
      list.push({ baseline: picked, label: picked.label });
    return list;
  });

  function hand(text: string | null) {
    if (text === null) {
      if (sent !== null) deps.setBaseline(null);
      sent = null;
      return;
    }
    if (sent?.text === text) return;
    sent = { id: ++ids, text };
    deps.setBaseline(sent);
  }

  async function relist(projectId: string | null) {
    listed.value = projectId === null ? [] : await deps.list(projectId).catch(() => []);
  }

  /** The baseline's text now; null when a chosen snapshot is gone (it falls back). */
  async function textOf(b: Baseline): Promise<string | null | 'gone'> {
    if (b.kind === 'saved') return deps.savedText.value;
    if (b.kind === 'first') {
      const oldest = readable.value.at(-1);
      return oldest ? deps.read(oldest.id) : null;
    }
    const text = await deps.read(b.id);
    return text === null ? 'gone' : text;
  }

  async function resolve() {
    const mine = ++reads;
    if (!on.value || why.value !== null) {
      hand(null);
      return;
    }
    const b = baseline.value;
    const text = await textOf(b);
    if (mine !== reads) return;
    if (text === 'gone') {
      chosen.value = null;
      deps.say(fallback.value.kind === 'saved' ? FALLBACK_SAVED : FALLBACK_FIRST);
      return; // The change of baseline reads again.
    }
    hand(text);
  }

  effectScope(true).run(() => {
    // Another script, or this one's snapshots changed: list them again, then read the baseline.
    watch(
      [deps.projectId, deps.snapshotsVersion, checks],
      async ([id], [was]) => {
        if (id !== was) {
          on.value = false;
          chosen.value = null;
          at.value = null;
        }
        await relist(id);
        void resolve();
      },
      { immediate: true },
    );
    watch(deps.kind, (kind) => {
      if (kind === 'markdown') on.value = false;
    });
    watch([on, baseline, deps.savedText, why], () => void resolve());
  });

  return {
    on,
    baseline,
    why,
    choices,
    toggle() {
      if (on.value) {
        on.value = false;
        return;
      }
      if (why.value !== null) {
        deps.say(why.value);
        return;
      }
      on.value = true;
    },
    since(b) {
      chosen.value = b.kind === fallback.value.kind && b.kind !== 'snapshot' ? null : b;
      if (why.value === null) on.value = true;
    },
    step(direction) {
      if (!on.value) return;
      const next = stepChange(deps.stops(), at.value, direction);
      if (next === null) return;
      at.value = next;
      pendingFocus.value = true;
    },
    at,
    pendingFocus,
    check() {
      checks.value++;
    },
  };
}

let session: ShowChanges | undefined;

/** Show changes for the open script: created on first use in the browser and kept for the visit. */
export function useShowChanges(): ShowChanges {
  if (session) return session;
  const editor = useEditor();
  const script = useScript();
  const layout = useLayout();
  session = createShowChanges({
    kind: editor.kind,
    projectId: computed(() => script.project.value?.id ?? null),
    savedText: script.savedText,
    snapshotsVersion: useSnapshots().version,
    list: listSnapshots,
    read: snapshotText,
    setBaseline: layout.setBaseline,
    say: (message) => void sayOutline(message),
    stops: () => {
      const shown = layout.marks.value;
      return shown && shown.seq === layout.shownSeq.value ? shown.marks.stops : [];
    },
  });
  return session;
}
