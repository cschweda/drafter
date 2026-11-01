import type { WorkKind } from '@drafter/history';
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
import { nowLabel, useCompare } from '../compare/use-compare';
import { useCuts } from '../cuts/use-cuts';
import { useEditor } from '../editor/session';
import { useHistoryClient } from '../history/client';
import { sayOutline } from '../outline/notice';
import { useScript } from '../storage/script';
import { compareLabel, draftName } from './labels';
import {
  type DraftStep,
  draftSteps,
  type StepCounts,
  stepCounts,
  stepLine,
  stepName,
} from './steps';
import { draftText } from './store';
import { closeTempTab, showTempTab, tempTabShown } from './tabs';
import { useDrafts } from './use-drafts';

// Draft by draft's session (drafts-and-cuts design §2.4): the open script's steps, counted in the
// history worker, a tab that exists only while open (placed as the Drafts list is), and opening a
// step in Compare's Changes view with Previous step and Next step, the step's cuts beside it.

export const STEPS_TAB = { id: 'draft-steps', label: 'Draft by draft' } as const;

export type StepsState = 'counting' | 'ready' | 'failed';

export interface StepsSession {
  /** The steps, oldest first. */
  steps: Readonly<ShallowRef<DraftStep[]>>;
  state: Readonly<Ref<StepsState>>;
  /** The kind of the open document, for the words of a step. */
  kind: Readonly<ComputedRef<WorkKind>>;
  isOpen: Readonly<Ref<boolean>>;
  open(focusPanel?: boolean): void;
  close(refocus?: boolean): void;
  /** Whether a pane shows the list now. */
  shown(): boolean;
  /** Counts the steps again (only the new ones: the rest are kept by their IDs). */
  load(): Promise<void>;
  /** Opens step `index` in Compare; `focus` false leaves focus where it is. False if it can't. */
  openStep(index: number, focus?: boolean): Promise<boolean>;
  /** From the step Compare shows, the one before (-1) or after (1): Previous step, Next step. */
  walk(direction: 1 | -1): Promise<void>;
  /** The index of the step Compare shows, or null. */
  shownStep: Readonly<ComputedRef<number | null>>;
}

/** Counts a step in the history worker; where the worker can't run, here. */
function workerCount(before: string, after: string, kind: WorkKind): Promise<StepCounts> {
  return new Promise((resolve) => {
    const client = useHistoryClient();
    client.request({ kind: 'step', before, after, docKind: kind }, (reply) => {
      if (reply.kind === 'step') {
        client.release();
        resolve(reply.counts);
      } else if (reply.kind === 'error') {
        client.release();
        resolve(stepCounts(before, after, kind));
      }
    });
  });
}

let shared: StepsSession | undefined;

function create(): StepsSession {
  const editor = useEditor();
  const script = useScript();
  const drafts = useDrafts();
  const compare = useCompare();
  const cuts = useCuts();
  const steps = shallowRef<DraftStep[]>([]);
  const state = ref<StepsState>('counting');
  const isOpen = ref(false);
  const kind = computed<WorkKind>(() =>
    editor.kind.value === 'markdown' ? 'markdown' : 'fountain',
  );
  const say = (message: string) => void sayOutline(message);
  const text = () => editor.view.state.doc.toString();

  let reads = 0;
  async function load() {
    const mine = ++reads;
    const projectId = script.project.value?.id ?? null;
    if (projectId === null || drafts.notKept.value !== null) {
      steps.value = [];
      state.value = 'ready';
      return;
    }
    state.value = 'counting';
    // The script's own drafts only: an outside one (another computer's, or changed outside
    // Drafter) shares a number with one of them, and is no step.
    const rows = drafts.rows.value.filter((row) => row.projectId === projectId && !row.outside);
    try {
      const found = await draftSteps(
        rows,
        async (n) => {
          const read = await draftText(projectId, n);
          if (read === null) throw new Error(`${draftName(n)} can’t be read.`);
          return read;
        },
        kind.value,
        text(),
        workerCount,
      );
      if (mine !== reads || script.project.value?.id !== projectId) return;
      steps.value = found;
      state.value = 'ready';
    } catch {
      if (mine !== reads) return;
      steps.value = [];
      state.value = 'failed';
    }
  }

  async function openStep(index: number, focus = true): Promise<boolean> {
    const step = steps.value[index];
    const projectId = script.project.value?.id;
    if (!step || !projectId) return false;
    const before = await draftText(projectId, step.from.n);
    const after = step.to === 'now' ? text() : await draftText(projectId, step.to.n);
    if (before === null || after === null) {
      say(`The step from ${stepName(step)} can’t be read.`);
      return false;
    }
    // The cuts listed beside it: Cuts is read from storage, so read it now.
    void cuts.load();
    const to = step.to === 'now' ? drafts.current.value : step.to.n;
    compare.open(
      { label: compareLabel(step.from), at: step.from.frozenAt, text: before },
      step.to === 'now'
        ? { label: nowLabel(Date.now()), at: null, text: after }
        : { label: compareLabel(step.to), at: step.to.frozenAt, text: after },
      { step: { from: step.from.n, to }, focus },
    );
    return true;
  }

  /** The step Compare shows: both ends must agree (the last step's end is the draft being written). */
  const indexOf = (at: { from: number; to: number } | null): number => {
    if (!at) return -1;
    return steps.value.findIndex(
      (s) => s.from.n === at.from && (s.to === 'now' ? at.to > s.from.n : s.to.n === at.to),
    );
  };

  const shownStep = computed(() => {
    const index = indexOf(compare.draftStep.value);
    return index < 0 ? null : index;
  });

  async function walk(direction: 1 | -1) {
    const at = compare.draftStep.value;
    if (!at) return;
    if (state.value !== 'ready' || steps.value.length === 0) await load();
    const index = indexOf(at);
    if (index < 0) return;
    const next = index + direction;
    if (next < 0) return say('This is the first step.');
    if (next >= steps.value.length) return say('This is the last step: it ends at the text now.');
    const step = steps.value[next] as DraftStep;
    if (await openStep(next, false)) say(`${stepName(step)}: ${stepLine(step, kind.value)}.`);
  }

  effectScope(true).run(() => {
    // Another script, a new or restored draft, or the drafts read again: the steps again, while
    // the list is open (drafts-and-cuts design, Review Focus 5).
    watch(drafts.version, () => {
      if (isOpen.value) void load();
    });
    watch(
      () => script.project.value?.id,
      () => {
        steps.value = [];
        state.value = 'counting';
      },
    );
  });

  return {
    steps,
    state,
    kind,
    isOpen,
    open(focusPanel = true) {
      isOpen.value = true;
      void load();
      showTempTab(STEPS_TAB.id, focusPanel);
    },
    close(refocus = false) {
      if (!isOpen.value) return;
      closeTempTab(STEPS_TAB.id, refocus);
      isOpen.value = false;
    },
    shown: () => isOpen.value && tempTabShown(STEPS_TAB.id),
    load,
    openStep,
    walk,
    shownStep,
  };
}

/** Draft by draft: made on first use in the browser and kept for the visit. */
export function useDraftSteps(): StepsSession {
  shared ??= create();
  return shared;
}
