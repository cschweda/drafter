import {
  type Change,
  type ChangeStop,
  changesOf,
  markPages,
  type PageMarks,
  splitLines,
  stepChange,
} from '@drafter/compare';
import { type Doc, parse } from '@drafter/fountain';
import type { Layout } from '@drafter/layout';
import { type Scene, sceneIndex } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
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
import { createLayoutClient, type LayoutClient } from '../editor/layout-client';
import { useEditor } from '../editor/session';
import { templateIdOf } from '../editor/template';
import type { DocumentKind } from '../markdown/kind';
import { snapshotTime } from '../snapshots/history';
import { useScript } from '../storage/script';
import {
  COMPARE_TAB,
  dropTab,
  openCompare,
  PHONE_DEFAULT_TAB,
  type TabId,
  WIDE_QUERY,
} from '../utils/panes';
import { type LineStop, stopLabel } from './labels';

// Compare (Phase 2 design §11.2): two versions of the open script, the newer drawn as pages with
// what changed marked. "Now" is the editor's text when Compare opened, so the marks hold still
// while the writer reads; Update takes it again (Call 15). The newer version is laid out by a
// layout worker of Compare's own, made when a comparison opens and ended when it closes, so the
// Script pane's layout is untouched (Call 17). A Markdown document, or a layout that failed, is
// drawn as marked source lines (Call 20). The tab exists only while a comparison is open (Call 16).

export interface Version {
  /** What the slim bar calls it: "10:42", "now (10:58)". */
  label: string;
  /** When it was taken; null for now. */
  at: number | null;
  text: string;
}

export interface Comparison {
  older: Version;
  newer: Version;
  kind: DocumentKind;
  changes: Change[];
}

/** A pages layout of a comparison's newer text, and what was read from the same parse. */
export interface ComparePages {
  comparison: Comparison;
  layout: Layout;
  template: Template;
  marks: PageMarks;
  scenes: Scene[];
}

/** A row of the Changes list: where Next change goes, and what it says. */
export interface CompareStop {
  stop: ChangeStop | LineStop;
  label: string;
}

export interface CompareSession {
  current: Readonly<ShallowRef<Comparison | null>>;
  /** Orders the two by time (now is newest), diffs them, and shows the tab. */
  open(a: Version, b: Version): void;
  /** Takes the editor's text as "now" again, when one side is now. */
  update(): void;
  /**
   * Ends the comparison and takes the tab away. Focus in its pane, or with `refocus` (its Close
   * comparison button, which Safari doesn't focus on a click), goes to the tab that replaces it.
   */
  close(refocus?: boolean): void;
  /** The change focused, for Next and Previous change. */
  at: Ref<number | null>;
  /** The newer version laid out as pages, once its layout has come; null in line mode. */
  pages: Readonly<ShallowRef<ComparePages | null>>;
  /** Drawn as source lines: a Markdown document, or a layout that failed. */
  lines: Readonly<ComputedRef<boolean>>;
  /** One per change, in order, for the comparison as drawn. */
  stops: Readonly<ComputedRef<CompareStop[]>>;
  /** Goes to stop `index`: the pane focuses it and says its label once it is drawn. */
  go(index: number): void;
  /** Next change (1) or Previous change (-1), wrapping. */
  step(direction: 1 | -1): void;
  /** Set by `go` and `step` until the pane has focused the stop. */
  pendingFocus: Ref<boolean>;
  /** Shows the tab, if it isn't showing; `focus` puts focus on its panel. */
  show(focus?: boolean): void;
}

/** The two by time: now (`at` null) is the newest; else the later is the newer. */
export function orderVersions(a: Version, b: Version): { older: Version; newer: Version } {
  const later = (v: Version) => (v.at === null ? Number.POSITIVE_INFINITY : v.at);
  return later(a) > later(b) ? { older: b, newer: a } : { older: a, newer: b };
}

/** "now (10:58)". */
export const nowLabel = (at: number): string => `now (${snapshotTime(at)})`;

/**
 * The scene a change is in, by where it is in the newer text: the last scene starting at or before
 * it; for a removal, strictly before it, since the lines it took out were after the line before its
 * place (a removal at a scene heading's start was the end of the scene before). By source, not by
 * the stop's block, which for a removal is the next printed line's (another scene's heading, or -1
 * on the title page). None before the first scene.
 */
function sceneOf(scenes: readonly Scene[], change: Change): Scene | undefined {
  const at = change.span.from;
  return scenes.findLast((scene) =>
    change.kind === 'removed' ? scene.span.from < at : scene.span.from <= at,
  );
}

let session: CompareSession | undefined;

function create(): CompareSession {
  const editor = useEditor();
  const script = useScript();
  const panes = usePanes();
  const slot = useTabSlot();
  const focus = useFocusMode();

  const current = shallowRef<Comparison | null>(null);
  const pages = shallowRef<ComparePages | null>(null);
  const failed = ref(false);
  const at = ref<number | null>(null);
  const pendingFocus = ref(false);

  let client: LayoutClient | null = null;
  /** What each layout request was for, so a layout is marked with its own comparison. */
  const requests = new Map<number, { comparison: Comparison; template: Template; doc: Doc }>();
  let newest = 0;

  function endWorker() {
    client?.destroy();
    client = null;
    requests.clear();
  }

  // A browser without module workers, or one that blocks them, throws here: Compare draws lines.
  function makeWorker(): LayoutClient | null {
    try {
      return createLayoutClient(
        new Worker(new URL('../workers/layout.worker.ts', import.meta.url), { type: 'module' }),
        (layout, seq) => {
          const asked = requests.get(seq);
          for (const key of requests.keys()) if (key <= seq) requests.delete(key);
          if (!asked || asked.comparison !== current.value) return;
          pages.value = {
            comparison: asked.comparison,
            layout,
            template: asked.template,
            marks: markPages(layout, asked.comparison.changes),
            scenes: sceneIndex(asked.doc, asked.template).scenes,
          };
          failed.value = false;
        },
        (message, seq) => {
          console.error(`Compare’s layout failed: ${message}`);
          if (seq >= newest) failed.value = true;
        },
      );
    } catch (error) {
      console.error(
        `Compare’s layout failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /** Lays out the newer text of `comparison`, a Fountain script's. */
  function layOut(comparison: Comparison) {
    if (comparison.kind === 'markdown') return;
    client ??= makeWorker();
    if (!client) {
      failed.value = true;
      return;
    }
    // One parse: the template it names, and the scenes the Changes list names.
    const doc = parse(comparison.newer.text);
    const template = builtins[templateIdOf(doc)] as Template;
    newest = client.request(comparison.newer.text, template);
    requests.set(newest, { comparison, template, doc });
  }

  function compare(older: Version, newer: Version) {
    const comparison: Comparison = {
      older,
      newer,
      kind: editor.kind.value,
      changes: changesOf(older.text, newer.text),
    };
    current.value = comparison;
    pages.value = null;
    failed.value = false;
    at.value = null;
    pendingFocus.value = false;
    layOut(comparison);
  }

  const wide = () => window.matchMedia(WIDE_QUERY).matches;

  function show(focusPanel = true) {
    focus.leave();
    if (wide()) panes.tabs.value = openCompare(panes.tabs.value);
    else panes.phoneTab.value = COMPARE_TAB.id;
    if (focusPanel) {
      void nextTick().then(() => document.getElementById(`panel-${COMPARE_TAB.id}`)?.focus());
    }
  }

  function close(refocus = false) {
    if (!current.value) return;
    // Focus in Compare's pane (its panel, or its slim bar's Close comparison) would be lost with it.
    const shownIn = document.getElementById(`panel-${COMPARE_TAB.id}`)?.closest('[data-pane]');
    const held = refocus || (!!shownIn && shownIn.contains(document.activeElement));
    endWorker();
    current.value = null;
    pages.value = null;
    failed.value = false;
    at.value = null;
    pendingFocus.value = false;
    // The pane that showed it shows a core tab; focus, if it was in Compare, goes to that tab's panel.
    let after: TabId | null = null;
    const tabs = panes.tabs.value;
    if (tabs.left === COMPARE_TAB.id || tabs.right === COMPARE_TAB.id) {
      const pane = tabs.left === COMPARE_TAB.id ? 'left' : 'right';
      panes.tabs.value = dropTab(tabs, COMPARE_TAB.id);
      if (wide()) after = panes.tabs.value[pane];
    }
    if (panes.phoneTab.value === COMPARE_TAB.id) {
      panes.phoneTab.value = PHONE_DEFAULT_TAB;
      if (!wide()) after = PHONE_DEFAULT_TAB;
    }
    if (slot.value === COMPARE_TAB.id) slot.value = null;
    if (held && after) {
      const panel = after;
      void nextTick().then(() => {
        if (panel === 'source') editor.view.focus();
        else document.getElementById(`panel-${panel}`)?.focus();
      });
    }
  }

  const lines = computed(() => current.value?.kind === 'markdown' || failed.value);

  const stops = computed<CompareStop[]>(() => {
    const comparison = current.value;
    if (!comparison) return [];
    if (lines.value) {
      const count = splitLines(comparison.newer.text).lines.length;
      return comparison.changes.map((change, i) => {
        const stop: LineStop = {
          change: i,
          kind: change.kind,
          // A removal sits before the line it names; at the end, after the last.
          line: Math.max(1, Math.min(change.new[0] + 1, count)),
          lines: change.kind === 'removed' ? change.removed.length : change.added.length,
        };
        return { stop, label: stopLabel(stop, null) };
      });
    }
    const drawn = pages.value;
    if (!drawn || drawn.comparison !== comparison) return [];
    return drawn.marks.stops.map((stop) => {
      const change = comparison.changes[stop.change] as Change;
      return { stop, label: stopLabel(stop, sceneOf(drawn.scenes, change)?.heading ?? null) };
    });
  });

  function go(index: number) {
    if (index < 0 || index >= stops.value.length) return;
    at.value = index;
    pendingFocus.value = true;
  }

  function step(direction: 1 | -1) {
    // `stepChange` reads only how many there are.
    const next = stepChange(
      stops.value.map((s) => s.stop as ChangeStop),
      at.value,
      direction,
    );
    if (next !== null) go(next);
  }

  // A switch of script, or a change of kind, ends the comparison: its versions are another's.
  effectScope(true).run(() => {
    watch(
      () => script.project.value?.id,
      (id, was) => {
        if (id !== was) close();
      },
    );
    watch(editor.kind, () => close());
  });

  return {
    current,
    open(a, b) {
      const { older, newer } = orderVersions(a, b);
      compare(older, newer);
      show();
    },
    update() {
      const comparison = current.value;
      if (!comparison || comparison.newer.at !== null) return;
      compare(comparison.older, {
        label: nowLabel(Date.now()),
        at: null,
        text: editor.view.state.doc.toString(),
      });
    },
    close,
    at,
    pages,
    lines,
    stops,
    go,
    step,
    pendingFocus,
    show,
  };
}

/** The comparison open now, if any: created on first use in the browser and kept for the visit. */
export function useCompare(): CompareSession {
  session ??= create();
  return session;
}
