<script setup lang="ts">
import { structureOf } from '@drafter/cm-fountain';
import { commandById } from '~/commands/registry';
import { draftName } from '~/drafts/labels';
import { useDrafts } from '~/drafts/use-drafts';
import { keyLine } from '~/editor/classic-key-line';
import { useLayout } from '~/editor/layout';
import { pageLabel } from '~/editor/pages';
import { problemsLabel, useProblems } from '~/editor/problems';
import { useEditor } from '~/editor/session';
import { wordsLabel } from '~/markdown/preview';
import { useMarkdown } from '~/markdown/use-markdown';
import { historyOpen } from '~/snapshots/history';
import { snapshotProblem } from '~/snapshots/use-snapshots';
import { useSpell } from '~/spell/use-spell';
import { runningTime } from '~/stats/count';
import { useCounts } from '~/stats/counts';
import { countsOpen } from '~/stats/counts-panel';
import { progressLabel, useGoal } from '~/stats/goal';
import { timeTodayLabel, wordsTodayLabel } from '~/stats/history';
import { useSprint } from '~/stats/sprint';
import { showStats } from '~/stats/tab';
import { useRates } from '~/stats/timing';
import { useWritingStats } from '~/stats/writing';
import { openError } from '~/storage/open';
import { readOnlyHint, saveError } from '~/storage/save';
import { blankError, kindError, type RecoveryState, useScript } from '~/storage/script';
import { useStorageNotice } from '~/storage/storage-notice';

// The status bar (fresh-look design §3.4, Task 6): one quiet 24px row of borderless buttons. Left,
// the file's name, which opens History, and the recovery copy's state when it is a warning. Right,
// pages · running time (which opens the Counts panel), words, problems (which opens Problems), and
// the template. Nothing here repeats the top bar or the Inspector: the save state is the top bar's
// (SaveState), and a sample is the top bar's chip. The page the cursor is on is the Script's header,
// so the bar says it only while the Script is out of sight.
// Below 640px the bar is hidden, but for what can't wait: the recovery copy's warning, an error,
// a running sprint, and the Counts panel opened from the palette.
const { element, kind, template } = useEditor();
const { project, ready } = useScript();
const { count } = useProblems();
const { steady } = useCounts();
const { words: markdownWords } = useMarkdown();
const rates = useRates();
// A dictionary that couldn't load, said once per visit (Plan D, Call 20).
const { problem: spellProblem } = useSpell();
const { progress, goal } = useGoal();
const sprint = useSprint();
const { chip } = useStorageNotice();
// Words and time today (docs/drafter-stats-design.md §3): from the day's first edit, never for a
// sample or in a read-only tab (`today` is null there). A goal in words already says the words.
const { today } = useWritingStats();
const writtenToday = computed(() => (today.value && today.value.ms > 0 ? today.value : null));
const showWords = computed(
  () => writtenToday.value?.words != null && !(progress.value && goal.value?.unit === 'words'),
);
const markdown = computed(() => kind.value === 'markdown');
/** What Enter and Tab do here, in Classic Mode (design §9.3). It changes with the element, not with each letter. */
const keys = computed(() => keyLine(element.value, structureOf(template.value)));

// ---- The file -------------------------------------------------------------------------------

// "Saved 4 min ago", in the file item's tooltip, is worked out from this, which moves every 30
// seconds (and when a save lands).
const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  tick = setInterval(() => {
    now.value = Date.now();
  }, 30_000);
});
onBeforeUnmount(() => clearInterval(tick));
watch(
  () => project.value?.savedAt,
  () => {
    now.value = Date.now();
  },
);

function savedAgo(savedAt: number): string {
  const minutes = Math.floor((now.value - savedAt) / 60_000);
  if (minutes < 1) return 'Saved just now';
  if (minutes < 60) return `Saved ${minutes} min ago`;
  const time = new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `Saved at ${time}`;
}

/** The file's name, or that there is none yet (a sample, a new script, one that came from no file). */
const file = computed(() => project.value?.fileName ?? 'Not saved to a file yet');
const fileTitle = computed(() => {
  const savedAt = project.value?.savedAt;
  return savedAt === undefined ? 'History' : `History · ${savedAgo(savedAt)}`;
});

function openHistory() {
  historyOpen.value = { focusLabel: false };
}

// ---- The draft ------------------------------------------------------------------------------

// The draft being written, quietly (drafts-and-cuts design §2.6): a button that opens the Drafts
// list. Not for a sample, which keeps no drafts; never in focus mode, where the bar is hidden.
const drafts = useDrafts();
const draftLabel = computed(() =>
  project.value && !project.value.sample ? draftName(drafts.current.value) : '',
);
function openDrafts() {
  drafts.open();
}

// ---- The recovery copy ------------------------------------------------------------------------

const RECOVERY: Record<RecoveryState, { label: string; why: string }> = {
  persistent: {
    label: 'Recovery copy: kept in this browser',
    why: 'Drafter keeps a copy of your script in this browser as you type, and the browser has agreed to keep it. Close the page or restart the browser and your script comes back. Saving it to a file is still the way to have a copy of your own.',
  },
  'not-persistent': {
    label: 'Recovery copy: may be cleared',
    why: 'Drafter keeps a copy of your script in this browser as you type, but the browser has not promised to keep it. It may clear the copy when space runs low, in a private window, or when site data is cleared. Save the script to a file to be safe.',
  },
  unavailable: {
    label: 'Recovery copy: unavailable',
    why: 'The browser won’t let Drafter keep a copy right now, so your changes exist only in memory. Save the script to a file to keep them. Drafter tries again every 30 seconds.',
  },
};

/** The warning chip's state: only when the copy may be cleared or can't be kept. */
const warning = computed(() => (ready.value ? chip.value : null));
const open = ref(false);
watch(warning, (now) => {
  if (!now) open.value = false;
});
const explanation = computed(() => (warning.value ? RECOVERY[warning.value].why : ''));

// ---- The counts -------------------------------------------------------------------------------

// The cursor's page ("Page 2 of 5", "Title page"): the Script's header says it, so the bar does only
// while no Script is shown (the Inspector on another view, or the one pane on another tab).
const { page } = useLayout();
const { tabs, phoneTab } = usePanes();
const wide = useWideScreen();
const scriptShown = computed(() =>
  wide.value ? tabs.value.right === 'script' : phoneTab.value === 'script',
);
const cursorPage = computed(() =>
  markdown.value || scriptShown.value ? '' : pageLabel(page.value),
);

/** "1.4 pages · About 1 min" for a script, "1,204 words" for a Markdown document. */
const countsLabel = computed(() => {
  // A Markdown document's words as the Markdown session counts them (a document too deep to preview
  // still has them).
  if (markdown.value) return wordsLabel(markdownWords.value);
  const { pages } = steady.value;
  if (pages === null) return 'Counting…';
  const minutes = Math.round(pages * rates.value.minutesPerPage);
  return `${pages === 1 ? '1 page' : `${pages} pages`} · ${runningTime(minutes)}`;
});
const scriptWords = computed(() => {
  const { words } = steady.value;
  return markdown.value || words === null ? null : wordsLabel(words);
});

// The counts panel opens from the counts item (or the palette), and Esc or a click elsewhere closes it.
const countsWrap = ref<HTMLElement>();
const countsButton = ref<HTMLButtonElement>();

function closeCounts(refocus = true) {
  if (!countsOpen.value) return;
  countsOpen.value = false;
  if (!refocus) return;
  // Where the bar is hidden (a phone), focus goes back to the editor instead.
  const button = countsButton.value;
  if (button && button.offsetParent !== null) button.focus();
  else useEditor().view.focus();
}

/** The panel's Stats… button: the panel closes, and the Stats tab opens with focus on its heading. */
function openStats() {
  closeCounts(false);
  showStats();
}

function onPointerDown(event: PointerEvent) {
  if (countsOpen.value && !countsWrap.value?.contains(event.target as Node)) closeCounts(false);
}
// Tabbing out of the panel closes it. A click elsewhere is `onPointerDown`'s: a button may not take focus on click.
function onFocusOut(event: FocusEvent) {
  const to = event.relatedTarget as Node | null;
  if (to && !countsWrap.value?.contains(to)) closeCounts(false);
}
onMounted(() => document.addEventListener('pointerdown', onPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown));

function showProblems() {
  void commandById('show-problems')?.run();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.stopPropagation();
    open.value = false;
  }
}

// ---- Below 640px ---------------------------------------------------------------------------

const errors = computed(() =>
  [
    saveError.value,
    openError.value,
    readOnlyHint.value,
    kindError.value,
    blankError.value,
    snapshotProblem.value,
    spellProblem.value,
  ].some(Boolean),
);
/** Something that can't wait for a wider screen: the bar shows it, and only it, on a phone. (An
    error is said, and shown, by the errors' region, which is never hidden.) */
const urgent = computed(
  () => !!warning.value || sprint.state.value.status !== 'idle' || countsOpen.value,
);
</script>

<template>
  <div class="status-bar" data-tour="status" @keydown="onKeydown">
    <!-- Errors: each on a line of its own above the row, said at once. The region is always there,
         even on a phone where the bar is hidden, so a line added to it is announced. -->
    <div class="errors" :class="{ shown: errors }">
      <p v-if="saveError" role="alert" class="failed">{{ saveError }}</p>
      <p v-if="openError" role="alert" class="failed">{{ openError }}</p>
      <p v-if="readOnlyHint" role="alert" class="failed">{{ readOnlyHint }}</p>
      <p v-if="kindError" role="alert" class="failed">{{ kindError }}</p>
      <p v-if="blankError" role="alert" class="failed">{{ blankError }}</p>
      <p v-if="snapshotProblem" role="alert" class="failed">{{ snapshotProblem }}</p>
      <p v-if="spellProblem" role="alert" class="failed">{{ spellProblem }}</p>
    </div>
    <footer class="status" :class="{ urgent }">
      <div class="row">
        <!-- The file item opens History (§11.1, Call 14): "History, my-script.fountain". -->
        <button
          type="button"
          class="history-button item wide-only"
          aria-haspopup="dialog"
          :aria-label="`History, ${file}`"
          :title="fileTitle"
          @click="openHistory"
        >
          <span class="name">{{ file }}</span>
        </button>
        <button
          v-if="draftLabel"
          type="button"
          class="draft-button item wide-only"
          title="Drafts"
          :aria-label="`Drafts, writing ${draftLabel}`"
          data-item="draft"
          @click="openDrafts"
        >
          {{ draftLabel }}
        </button>
        <button
          v-if="warning"
          type="button"
          class="recovery item"
          :class="warning === 'unavailable' ? 'danger' : 'warn'"
          :aria-expanded="open ? 'true' : 'false'"
          aria-controls="recovery-why"
          @click="open = !open"
        >
          <UIcon name="i-lucide-triangle-alert" class="icon" />
          {{ RECOVERY[warning].label }}
        </button>
        <span class="spacer" />
        <span v-if="keys" class="keys wide-only" data-item="keys">{{ keys }}</span>
        <span v-if="progress" class="wide-only" data-item="goal">{{ progressLabel(progress) }}</span>
        <!-- Not live regions: a screen reader reads them when asked, not at every change. -->
        <template v-if="writtenToday">
          <span v-if="showWords" class="wide-only" data-stat="words-today">{{
            wordsTodayLabel(writtenToday.words ?? 0)
          }}</span>
          <span class="wide-only" data-stat="time-today">{{ timeTodayLabel(writtenToday.ms) }}</span>
        </template>
        <!-- A sprint's time left (not a live region: only its end is announced). -->
        <SprintTimer />
        <span v-if="cursorPage" class="wide-only" data-item="page">{{ cursorPage }}</span>
        <!-- The counts item opens the Counts panel. A Markdown document has words, no pages, and no checks. -->
        <span ref="countsWrap" class="counts-wrap" @focusout="onFocusOut">
          <button
            ref="countsButton"
            type="button"
            class="counts-button item wide-only"
            title="Counts and daily goal"
            aria-haspopup="dialog"
            :aria-expanded="countsOpen ? 'true' : 'false'"
            aria-controls="counts-panel"
            @click="countsOpen ? closeCounts(false) : (countsOpen = true)"
          >
            {{ countsLabel }}
          </button>
          <CountsPanel v-if="countsOpen" id="counts-panel" @close="closeCounts()" @stats="openStats" />
        </span>
        <span v-if="scriptWords" class="wide-only" data-item="words">{{ scriptWords }}</span>
        <button
          v-if="!markdown"
          type="button"
          class="problems-button item wide-only"
          title="Show Problems"
          @click="showProblems"
        >
          {{ problemsLabel(count) }}
        </button>
        <!-- The template, and its menu. -->
        <span class="wide-only template">
          <TemplateChip />
        </span>
      </div>
      <p v-show="open && warning" id="recovery-why" class="why">{{ explanation }}</p>
    </footer>
  </div>
</template>

<style scoped>
.status {
  box-sizing: border-box;
  background: var(--surface);
  border-top: 1px solid var(--border);
  color: var(--muted);
  font: 400 12px/16px var(--font-sans);
}
/* One row, 24px with its edge: it never wraps; the file's name gives way first. */
.row {
  display: flex;
  align-items: center;
  gap: 2px;
  box-sizing: border-box;
  height: 23px;
  padding: 0 8px;
  white-space: nowrap;
}
.spacer {
  flex: 1 1 0;
  min-width: 8px;
}
.row > span:not(.spacer, .counts-wrap, .template) {
  padding: 0 6px;
}
.keys {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Borderless buttons that fill on hover (design §3.4, §5). */
.item {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  height: 20px;
  min-height: 20px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--r-sm);
  background: none;
  color: inherit;
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.item:hover,
.item[aria-expanded="true"] {
  background: var(--raised);
  color: var(--text);
}
.history-button {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 40%;
}
.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* The recovery copy's warning: a quiet chip in its tone (Task 3b's tokens). */
.recovery {
  color: var(--text);
}
.recovery.warn {
  background: var(--warn-bg);
}
.recovery.warn:hover,
.recovery.warn[aria-expanded="true"] {
  background: var(--warn-hover);
}
.recovery.warn .icon {
  color: var(--warn);
}
.recovery.danger {
  background: var(--danger-bg);
}
.recovery.danger:hover,
.recovery.danger[aria-expanded="true"] {
  background: var(--danger-hover);
}
.recovery.danger .icon {
  color: var(--danger);
}
.icon {
  flex: none;
  width: 13px;
  height: 13px;
}
.counts-wrap {
  display: inline-flex;
}
.row :deep([data-sprint] button) {
  min-height: 20px;
}
.template {
  display: inline-flex;
}
/* The recovery copy's explanation opens above the whole bar, errors and all. */
.status-bar {
  position: relative;
  min-width: 0;
}
/* Empty, it takes no room. With a line in it, it sits on the bar's surface above the row. */
.errors {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--muted);
  font: 400 12px/16px var(--font-sans);
}
.errors.shown {
  padding: 4px 8px 2px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.errors.shown + .status {
  border-top: 0;
}
.failed {
  margin: 0;
  padding-left: 8px;
  box-shadow: inset 3px 0 0 var(--danger-border);
  color: var(--text);
  white-space: normal;
}
.why {
  position: absolute;
  left: 8px;
  bottom: calc(100% + 4px);
  z-index: 5;
  max-width: min(34rem, calc(100vw - 16px));
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--raised);
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
}

/* A phone (below 640px): no status bar (§6), but for what can't wait. Its counts are in Stats, and
   the template is in the Drafter menu. */
@media (max-width: 639.98px) {
  .status:not(.urgent) {
    display: none;
  }
  .wide-only {
    display: none;
  }
  /* The row holds the warning and a sprint; with neither (the Counts panel opened from the palette,
     or an error alone) it takes no room. */
  .row {
    height: 32px;
  }
  .row:not(:has(.recovery, [data-sprint])) {
    height: 0;
  }
  .item,
  .row :deep([data-sprint] button) {
    height: 24px;
    min-height: 24px;
  }
}
/* Under the on-screen keyboard (useOnScreenKeyboard) the row gives way, as the bottom tab bar
   does, unless something can't wait. The errors' region above it stays, to be announced. */
:root.keyboard-open .status:not(.urgent) {
  display: none;
}
</style>
