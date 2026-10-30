import { redo, undo } from '@codemirror/commands';
import { foldAll, foldable, foldEffect, unfoldAll } from '@codemirror/language';
import { nextDiagnostic, previousDiagnostic } from '@codemirror/lint';
import { openSearchPanel } from '@codemirror/search';
import type { StateCommand } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
  canMakeParenthetical,
  type ElementKind,
  elementHint,
  forceKind,
  insertMark,
  insertPageBreak,
  MARK_REFUSED,
  makeElement,
  type SpellMark,
  spellMarkAt,
  spellMarksOf,
  structureOf,
  toggleDual,
  withCompletion,
  wrapInBold,
  wrapInBoneyard,
  wrapInItalic,
  wrapInNote,
  wrapInUnderline,
} from '@drafter/cm-fountain';
import { downTarget, expandOutline, upTarget } from '@drafter/outline';
import { nextTick } from 'vue';
import { aboutOpen } from '~/about/dialog';
import { MARKDOWN_WHY, useShowChanges } from '~/compare/baseline';
import { useCompare } from '~/compare/use-compare';
import { useFocusMode } from '~/composables/useFocusMode';
import { usePanes } from '~/composables/usePanes';
import { applyTextChanges } from '~/editor/apply-changes';
import { sayElement } from '~/editor/element-notice';
import { firstSceneStart } from '~/editor/first-scene';
import { SAMPLE_SCRIPTS } from '~/editor/sample-scripts';
import { SAMPLES } from '~/editor/samples';
import { useEditor } from '~/editor/session';
import { STARTERS } from '~/editor/starters';
import { DOCUMENT_TYPES } from '~/editor/template';
import { useTemplate } from '~/editor/use-template';
import { useDeleted } from '~/history/deleted';
import { openSceneHistory } from '~/history/scene-history';
import { MARKDOWN_COMMANDS } from '~/markdown/commands';
import { openNewNote } from '~/notes/use-notes';
import { runMove } from '~/outline/move';
import { sayOutline } from '~/outline/notice';
import { openSceneDetails } from '~/outline/scene-details';
import { treatmentOpen } from '~/outline/treatment';
import { useOutline } from '~/outline/use-outline';
import { settingsOpen } from '~/settings/dialog';
import { useSettings } from '~/settings/settings';
import { historyOpen } from '~/snapshots/history';
import { useSnapshots } from '~/snapshots/use-snapshots';
import { addToMine, ignoreWordHere, stepMisspelling, tryAddToScript } from '~/spell/actions';
import { makeCheckSpelling } from '~/spell/check';
import { openSpellMenu } from '~/spell/menu';
import { NO_MARK_HERE, NO_MARKS, SPELLCHECK_OFF, saySpell } from '~/spell/notice';
import { SPELLING_HEADING_ID } from '~/spell/rows';
import { useSpell } from '~/spell/use-spell';
import { SPRINT_MINUTES, useSprint } from '~/stats/sprint';
import { showStats } from '~/stats/tab';
import { type ExportKind, exportApplies, exportScript } from '~/storage/export';
import { exportOptionsOpen, OPTIONS_NOT_FOR_MARKDOWN } from '~/storage/export-options';
import { useGuard } from '~/storage/guard';
import { screenplayFromOutline } from '~/storage/new-script';
import { pickAndOpen, pickAndOpenAs } from '~/storage/open';
import { canRevert, revertToSaved, revertWhy, save, saveAs } from '~/storage/save';
import { useScript } from '~/storage/script';
import { NOT_FOR_MARKDOWN } from '~/strip/labels';
import { requestTour } from '~/tour/state';
import { updateCheckOpen } from '~/update/use-check';
import { type PaneId, revealTab, type TabId, WIDE_QUERY } from '~/utils/panes';
import { COMMAND_DATA, HELP_PAGES, helpHref, MARKDOWN_ACTIONS } from './data';
import { openPalette, togglePalette } from './palette';
import { type Command, registerCommands } from './registry';
import { removing } from './remove';

/** What a command does and when it applies; the rest of a `Command` is in `data.ts`. */
type Behavior = Pick<Command, 'run' | 'enabled' | 'why'> & {
  /** A title that follows the script, in place of the data's: a stage play's Scene and Stage direction. */
  liveTitle?: () => string;
};

const quietly = (action: () => Promise<unknown>) => () => void action().catch(() => {});

let registered = false;

/**
 * Registers the commands this app has. It runs in the page's setup, where the composables the
 * commands use are available, and once only: a second call (a hot reload) changes nothing.
 */
export function registerBuiltinCommands(): void {
  if (registered) return;
  registered = true;

  const editor = useEditor();
  const { view } = editor;
  const script = useScript();
  const guard = useGuard();
  const panes = usePanes();
  const focus = useFocusMode();
  const colorMode = useColorMode();
  const { settings, set } = useSettings();
  const template = useTemplate();
  const sprint = useSprint();
  const sprintOn = () => sprint.state.value.status !== 'idle';
  const compare = useCompare();
  const comparing = () => compare.current.value !== null;
  const showChanges = useShowChanges();
  const deleted = useDeleted();
  /** Whether a pane shows the Deleted scenes tab. */
  const deletedShown = () =>
    window.matchMedia(WIDE_QUERY).matches
      ? panes.tabs.value.left === 'deleted' || panes.tabs.value.right === 'deleted'
      : panes.phoneTab.value === 'deleted';
  /**
   * Next or Previous change: the Compare tab shows (where it isn't), and the change gets focus; with
   * no comparison open, Show changes' marks on the Script pane, which shows.
   */
  const stepChange = (direction: 1 | -1) => () => {
    if (comparing()) {
      compare.show(false);
      compare.step(direction);
      return;
    }
    showTab('script', false);
    showChanges.step(direction);
  };
  const stepsChanges = () => comparing() || (showChanges.on.value && isFountain());

  // ---- When a command applies -------------------------------------------------------------

  const hasScript = () => !!script.project.value;
  const idle = () => hasScript() && !script.busy.value && !guard.taking.value;
  /** Starting a script needs a tab that can edit, and no switch under way. */
  const canStart = () => idle() && !guard.readOnly.value;
  const canEdit = () => !view.state.readOnly;
  /** Fountain's own commands, checks, and scenes mean nothing in a Markdown document. */
  const isFountain = () => editor.kind.value === 'fountain';
  const isMarkdown = () => editor.kind.value === 'markdown';
  const exportsHere = (kind: ExportKind) => exportApplies(kind, editor.kind.value);

  // ---- Showing the editor, and the other tabs ---------------------------------------------

  /** Shows `tab`; `focusPanel` false leaves focus to the caller (Next change puts it on a mark). */
  function showTab(tab: TabId, focusPanel = true) {
    // Focus mode shows only the Source: any other tab is for the writer to see.
    if (tab !== 'source') focus.leave();
    if (window.matchMedia(WIDE_QUERY).matches) {
      const held = document.activeElement?.closest<HTMLElement>('[data-pane]')?.dataset.pane;
      const from: PaneId | undefined = held === 'left' || held === 'right' ? held : undefined;
      panes.tabs.value = revealTab(panes.tabs.value, tab, from);
    } else {
      panes.phoneTab.value = tab;
    }
    if (!focusPanel) return;
    void nextTick().then(() => {
      if (tab === 'source') view.focus();
      else document.getElementById(`panel-${tab}`)?.focus();
    });
  }

  /**
   * Runs `act` on the editor, with the Source tab showing and the editor focused first. `goto`
   * does both and keeps the cursor where it is; `act` runs after its focus, so a command that
   * moves focus (the search panel) is not undone by it.
   */
  function onEditor(act: (view: EditorView) => void): () => void {
    return () => {
      editor.goto(view.state.selection.main.head);
      void nextTick().then(() => act(view));
    };
  }

  /** One of the Fountain commands (technical design §3.3): on when the tab can edit a Fountain script. */
  const fountain = (act: (view: EditorView) => unknown): Behavior => ({
    enabled: () => canEdit() && isFountain(),
    run: onEditor((v) => void act(v)),
  });

  /**
   * The element bar's commands (docs/drafter-element-bar-design.md §4), which the bar and the palette
   * both run: the Source shows and has focus, and the command acts on the selection the editor has,
   * which `onEditor` would collapse to the cursor. It opens completion where it begins a heading or a
   * cue. Where an element command would do nothing (the title page, a note, a line that is already
   * dialogue), the bar's notice says why.
   */
  const inEditor = (
    applies: () => boolean,
    act: StateCommand,
    kind?: ElementKind | 'page_break',
  ): Behavior => ({
    enabled: () => canEdit() && applies(),
    run: () => {
      const hint = kind && elementHint(kind, view.state);
      if (hint) void sayElement(hint);
      showTab('source');
      void nextTick().then(() => withCompletion(act)(view));
    },
  });
  const element = (kind: ElementKind) => inEditor(isFountain, makeElement(kind), kind);
  /** What the script's template makes of its structure: a stage play's acts and scenes. */
  const structure = () => structureOf(editor.template.value);
  const isStage = () => !structure().headings;

  /** Setup and Payoff (Phase 2 design §10): a mark at the end of the cursor's line, labels offered. */
  const mark = (head: 'Setup' | 'Payoff'): Behavior => ({
    enabled: () => canEdit() && isFountain(),
    run: () => {
      showTab('source');
      void nextTick().then(() => {
        if (!withCompletion(insertMark(head))(view)) void sayElement(MARK_REFUSED);
      });
    },
  });

  /** The scene holding the cursor, in the Outline's index. */
  const sceneAtCursor = () => {
    const head = view.state.selection.main.head;
    return useOutline().index.value.scenes.find((s) => head >= s.span.from && head <= s.span.to);
  };
  /** Move scene up or down (Phase 2 design §6.2): the cursor goes with the scene. */
  const moveScene = (direction: 'up' | 'down'): Behavior => ({
    enabled: () => canEdit() && isFountain() && !!sceneAtCursor(),
    run: () => {
      const scene = sceneAtCursor();
      if (!scene) return;
      const index = useOutline().index.value;
      const target =
        direction === 'up' ? upTarget(index, scene.block) : downTarget(index, scene.block);
      runMove(scene.block, target, { keepCursor: true, direction });
      editor.goto(view.state.selection.main.head);
    },
  });

  // ---- The spellcheck's commands (Plan D) ---------------------------------------------------

  const spellOn = () => settings.value.spellcheck;
  const spellWhy = () => (spellOn() ? undefined : SPELLCHECK_OFF);
  /**
   * On the misspelled word at the cursor, with the Source showing and the editor focused first;
   * said, when there is none.
   */
  const onMisspelling = (act: (mark: SpellMark) => unknown): Behavior => ({
    enabled: spellOn,
    why: spellWhy,
    run: onEditor((v) => {
      const mark = spellMarkAt(v.state, v.state.selection.main.head);
      if (mark) act(mark);
      else void saySpell(NO_MARK_HERE);
    }),
  });
  /**
   * Check spelling (Call 13): once the check under way has come back, Problems shows with focus
   * on its Spelling heading, and the count is said. With spellcheck off it says so and changes
   * nothing.
   */
  const checkSpelling = makeCheckSpelling({
    on: spellOn,
    settled: () => useSpell().settled(),
    state: () => useSpell().state.value,
    count: () => spellMarksOf(view.state).length,
    show: async () => {
      showTab('problems');
      // After showTab's own focus (the panel), once the pane has drawn the group.
      await nextTick();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      document.getElementById(SPELLING_HEADING_ID)?.focus();
    },
    say: (message) => void saySpell(message),
  });
  /** Next or Previous misspelling: selects the word, and says it with its first suggestion. */
  const stepSpelling = (direction: 1 | -1): Behavior => ({
    enabled: spellOn,
    why: spellWhy,
    run: onEditor((v) => {
      void stepMisspelling(v, direction).then((moved) => {
        if (!moved) void saySpell(NO_MARKS);
      });
    }),
  });

  // ---- What the commands do ---------------------------------------------------------------
  // Each command's id, title, group, and keys are in `data.ts` (the Keyboard shortcuts page reads
  // them without an editor); this is the rest, by id, in the same order.

  const behaviors: Record<string, Behavior> = {
    palette: { run: togglePalette },

    // File
    // One New command for each document type (the chip and the Scripts menu read the same list).
    ...Object.fromEntries(
      DOCUMENT_TYPES.map((type): [string, Behavior] => [
        `new-${type.newKind}`,
        { enabled: canStart, run: quietly(() => script.newScript(type.newKind)) },
      ]),
    ),
    // Switch the Fountain template (the toolbar's chip is hidden below 1024px, so the palette is how a phone does it).
    // Like show/hide line numbers, only the ones that apply are listed: not the current one, and none in a read-only
    // tab or with an unclosed `/*` that the choice would write after. In a Markdown document they are the way back
    // to Fountain (the text is kept). Each runs on the editor, so Mod+Z undoes the block it writes.
    ...Object.fromEntries(
      DOCUMENT_TYPES.filter((type) => type.kind === 'fountain').map((type): [string, Behavior] => [
        `template-${type.id}`,
        {
          // Not the current one: a script that names a template Drafter doesn't have is none of them.
          enabled: () => template.canChooseType(type) && !template.isCurrent(type),
          run: onEditor(() => void template.chooseType(type)),
        },
      ]),
    ),
    // Markdown is a kind of document, not a template: it is listed in a Fountain script (after asking, because
    // Fountain's formatting stops applying and undo doesn't bring it back), and not in a Markdown document.
    ...Object.fromEntries(
      DOCUMENT_TYPES.filter((type) => type.kind === 'markdown').map((type): [string, Behavior] => [
        'document-markdown',
        {
          enabled: () => isFountain() && template.canChooseType(type),
          run: onEditor(() => void template.chooseType(type)),
        },
      ]),
    ),
    open: {
      // A tab that only shows a script says why it can't open one, so this isn't `canStart`.
      enabled: idle,
      run: quietly(pickAndOpen),
    },
    'open-as-screenplay': {
      enabled: idle,
      run: quietly(() => pickAndOpenAs('fountain')),
    },
    // A tab that can't save says so when it's asked to.
    save: { run: quietly(save) },
    'save-as': { run: quietly(saveAs) },
    'revert-to-saved': {
      // Only while there are changes and a saved file to go back to; it says what it did, and undo reverses it.
      enabled: canRevert,
      why: revertWhy,
      run: () => {
        revertToSaved();
        editor.goto(view.state.selection.main.head);
      },
    },
    // History (§11.1): the script's snapshots, opened from here, the app menu, and the status bar's save item.
    // Take snapshot… opens it on its label field (Call 13); a read-only tab's says why it can't take one.
    history: {
      enabled: hasScript,
      run: () => {
        historyOpen.value = { focusLabel: false };
      },
    },
    // Deleted scenes (version-history design §8, §9): opens the tab, or shows it; shown, it closes.
    'deleted-scenes': {
      enabled: () => hasScript() && isFountain(),
      why: () => (isMarkdown() ? NOT_FOR_MARKDOWN : undefined),
      liveTitle: () =>
        deleted.isOpen.value && deletedShown() ? 'Close Deleted scenes' : 'Deleted scenes',
      run: () => {
        if (deleted.isOpen.value && deletedShown()) deleted.close(true);
        else deleted.open();
      },
    },
    'take-snapshot': {
      enabled: hasScript,
      run: () => {
        historyOpen.value = { focusLabel: true };
      },
    },
    // The samples (the Scripts menu lists them too).
    ...Object.fromEntries(
      SAMPLES.map((sample): [string, Behavior] => [
        `open-sample-${sample.kind}`,
        { enabled: idle, run: quietly(() => script.openSample(sample.kind)) },
      ]),
    ),
    // Back to the sample's own text, as one change Undo reverses; only while a sample is open and editable. The Help
    // section of the app menu lists it too.
    'reset-sample': {
      enabled: () => script.canResetSample.value,
      run: () => {
        if (script.resetSample()) editor.goto(view.state.selection.main.head);
      },
    },
    // A writer's first document of a kind opens with the sample's text (the bar above it offers this too): the
    // new-document text instead, as one change Undo reverses.
    'start-blank': {
      enabled: () => script.canStartBlank.value,
      run: () => {
        if (script.startBlank()) editor.goto(view.state.selection.main.head);
      },
    },
    // The guided tour (Phase 1 design §4.4): offered once on a first visit, and from here after that. The Help
    // section of the app menu lists it too. It waits for any dialog or the palette to close.
    'take-the-tour': { run: requestTour },
    // The help pages (§4.5), prerendered. Each opens in a new tab, so the writer's script and what is typed stay
    // as they are (a command runs from a click or a key, which lets a page open one). The tab keeps this one as
    // its opener (same-origin, so nothing is exposed), and its Back to Drafter closes it and comes back here,
    // rather than open a second editor, which the two-tab guard would make read-only (`layouts/docs.vue`).
    ...Object.fromEntries(
      HELP_PAGES.map((page): [string, Behavior] => [
        page.id,
        { run: () => void window.open(helpHref(page), '_blank') },
      ]),
    ),
    // Help → Sample scripts: a tiny sample of each kind, as a new script of the writer's own with no file, opened
    // unchanged (its text is where "changed" is measured from). The script that was open is kept, as for any switch.
    ...Object.fromEntries(
      SAMPLE_SCRIPTS.map((sample): [string, Behavior] => [
        `sample-script-${sample.kind}`,
        {
          enabled: canStart,
          run: quietly(async () => {
            const made = await script.addScript(sample.text, {
              kind: sample.kind === 'markdown' ? 'markdown' : 'fountain',
              baseline: sample.text,
              sampleScript: sample.kind,
            });
            await script.open(made.id);
            // A screenplay starts where the story does, as the first visit does; the others at the top.
            editor.goto(sample.kind === 'screenplay' ? firstSceneStart(sample.text) : 0);
          }),
        },
      ]),
    ),
    // The guided starters (out-the-door design §1.5), from File's New items and Help → Sample scripts:
    // as a sample script is, a new script of the writer's own with no file, opened unchanged. Each
    // starts at the top, on its title page, where the lesson does.
    ...Object.fromEntries(
      STARTERS.map((starter): [string, Behavior] => [
        starter.command,
        {
          enabled: canStart,
          run: quietly(async () => {
            const made = await script.addScript(starter.text, {
              kind: 'fountain',
              baseline: starter.text,
              starter: starter.kind,
            });
            await script.open(made.id);
            editor.goto(0);
          }),
        },
      ]),
    ),
    // Help → Check for updates (the service worker's check on the web, the updater's in the desktop app), and
    // About Drafter (the version, for a bug report, and the links). The desktop app's About Drafter runs this too.
    'check-for-updates': {
      run: () => {
        updateCheckOpen.value = true;
      },
    },
    'about-drafter': {
      run: () => {
        aboutOpen.value = true;
      },
    },
    // Export: the toolbar's Export menu, the app menu, and the palette run these. What the open kind
    // exports (`EXPORTS`): a PDF for both, a Markdown document's drawn in Inter Tight (Markdown PDF
    // design §10); Final Draft for a script; and a Markdown file for both, a script's the whole script
    // written in the export worker, a document's its own text (Call 24).
    'export-pdf': { enabled: () => exportsHere('pdf'), run: () => void exportScript('pdf') },
    'export-fdx': { enabled: () => exportsHere('fdx'), run: () => void exportScript('fdx') },
    'export-md': { enabled: () => exportsHere('md'), run: () => void exportScript('md') },
    'export-txt': { run: () => void exportScript('txt') },
    'export-treatment': {
      enabled: isFountain,
      run: () => {
        treatmentOpen.value = true;
      },
    },
    // How the open script's exports come out (out-the-door design §2.4): scene numbers and the title
    // page for its PDF, plain text, Final Draft file, and Markdown, and notes for its Markdown alone
    // (Call 28). At the end of the Export menu. On in a read-only tab, whose dialog shows the choices
    // it can't change; off for a Markdown document, which has none of them.
    'export-options': {
      enabled: () => hasScript() && isFountain(),
      why: () => (isMarkdown() ? OPTIONS_NOT_FOR_MARKDOWN : undefined),
      run: () => {
        exportOptionsOpen.value = true;
      },
    },
    // A Markdown outline as a new screenplay (design §6.5): its headings as sections, its items as stubs.
    'screenplay-from-outline': {
      enabled: () => isMarkdown() && canStart(),
      run: quietly(async () => {
        const text = screenplayFromOutline(view.state.doc.toString(), new Date());
        const made = await script.addScript(text, { kind: 'fountain' });
        await script.open(made.id);
        const stubs = useOutline().index.value.scenes.length;
        void sayOutline(
          `Made a screenplay with ${stubs} scene ${stubs === 1 ? 'stub' : 'stubs'}. Problems lists them.`,
        );
      }),
    },
    remove: {
      enabled: () => idle() && !script.project.value?.sample,
      run: () => {
        removing.value = script.project.value;
      },
    },
    settings: {
      run: () => {
        settingsOpen.value = true;
      },
    },

    // Go
    'go-to-scene': { enabled: isFountain, run: () => openPalette('scene') },
    'go-to-line': { run: () => openPalette('line') },
    // History of this scene (version-history design §6): the scene holding the cursor.
    'scene-history': {
      enabled: () => hasScript() && isFountain() && !!sceneAtCursor(),
      why: () =>
        isMarkdown()
          ? NOT_FOR_MARKDOWN
          : !sceneAtCursor()
            ? 'The cursor isn’t in a scene.'
            : undefined,
      run: () => {
        const scene = sceneAtCursor();
        if (!scene) return;
        openSceneHistory({
          id: useOutline().idOf(scene),
          from: scene.span.from,
          to: scene.span.to,
          heading: scene.heading,
        });
      },
    },
    'next-problem': { enabled: isFountain, run: onEditor((v) => nextDiagnostic(v)) },
    'previous-problem': { enabled: isFountain, run: onEditor((v) => previousDiagnostic(v)) },
    'next-misspelling': stepSpelling(1),
    'previous-misspelling': stepSpelling(-1),
    'next-change': { enabled: stepsChanges, run: stepChange(1) },
    'previous-change': { enabled: stepsChanges, run: stepChange(-1) },

    // View
    'show-source': { run: () => showTab('source') },
    'show-script': { enabled: isFountain, run: () => showTab('script') },
    // The Script tab is the Preview in a Markdown document.
    'show-preview': { enabled: isMarkdown, run: () => showTab('script') },
    'show-problems': { run: () => showTab('problems') },
    'show-outline': { enabled: isFountain, run: () => showTab('outline') },
    // Not core tabs (design §5.8): showing one puts it in its pane's slot. None for Markdown.
    'show-cards': { enabled: isFountain, run: () => showTab('cards') },
    'show-notes': { enabled: isFountain, run: () => showTab('notes') },
    // Show changes (version-history design §4.1): the Script pane shows, marked or clean.
    'show-changes': {
      enabled: () => hasScript() && isFountain(),
      why: () => (isMarkdown() ? MARKDOWN_WHY : undefined),
      liveTitle: () => (showChanges.on.value ? 'Hide changes' : 'Show changes'),
      run: () => {
        showChanges.toggle();
        if (showChanges.on.value) showTab('script', false);
      },
    },
    // Compare's tab goes with the comparison (Call 16).
    'compare-changes-view': {
      enabled: comparing,
      run: () => {
        compare.setView('changes');
        compare.show();
      },
    },
    // A Markdown document has only the Changes view.
    'compare-pages-view': {
      enabled: () => comparing() && compare.hasPages.value,
      run: () => {
        compare.setView('pages');
        compare.show();
      },
    },
    'close-compare': { enabled: comparing, run: () => compare.close() },
    'focus-mode': {
      // The key is bound on the window, so it leaves focus mode from anywhere, the editor included.
      // Not under a native dialog (the page is the dialog's while it is open), nor while an input method is composing.
      enabled: () => !document.querySelector('dialog[open]') && !view.composing,
      run: focus.toggle,
    },
    // Sprints (Phase 1 design §7.3): the three lengths here; any length from the Counts panel.
    ...Object.fromEntries(
      SPRINT_MINUTES.map((minutes): [string, Behavior] => [
        `sprint-${minutes}`,
        { enabled: () => !sprintOn(), run: () => sprint.start(minutes) },
      ]),
    ),
    'sprint-pause': {
      enabled: () => sprint.state.value.status === 'running',
      run: sprint.pause,
    },
    'sprint-resume': {
      enabled: () => sprint.state.value.status === 'paused',
      run: sprint.resume,
    },
    'sprint-stop': { enabled: sprintOn, run: sprint.stop },
    'sprint-hide': {
      enabled: () => sprintOn() && !sprint.hidden.value,
      run: () => {
        sprint.hidden.value = true;
      },
    },
    'sprint-show': {
      enabled: () => sprintOn() && sprint.hidden.value,
      run: () => {
        sprint.hidden.value = false;
      },
    },
    // The Stats tab (seeing-the-script design §4.1), beside the Source: the Counts panel's Stats…
    // and the Drafter menu open it too.
    'show-stats': {
      run: () => showStats(),
    },
    'switch-theme': {
      run: () => {
        colorMode.preference = colorMode.value === 'light' ? 'dark' : 'light';
      },
    },
    'show-line-numbers': {
      enabled: () => !settings.value.lineNumbers,
      run: () => void set('lineNumbers', true),
    },
    'hide-line-numbers': {
      enabled: () => settings.value.lineNumbers,
      run: () => void set('lineNumbers', false),
    },
    'turn-on-typewriter': {
      enabled: () => !settings.value.typewriter,
      run: () => void set('typewriter', true),
    },
    'turn-off-typewriter': {
      enabled: () => settings.value.typewriter,
      run: () => void set('typewriter', false),
    },
    // Scroll sync (decided 2026-10-27): the Source bar's Sync scrolling button and Settings set the same row.
    'turn-on-scroll-sync': {
      enabled: () => !settings.value.scrollSync,
      run: () => void set('scrollSync', true),
    },
    'turn-off-scroll-sync': {
      enabled: () => settings.value.scrollSync,
      run: () => void set('scrollSync', false),
    },
    // The element bar (decided 2026-10-27): its ⋯ menu and Settings set the same row.
    'show-element-bar': {
      enabled: () => !settings.value.elementBar,
      run: () => void set('elementBar', true),
    },
    'hide-element-bar': {
      enabled: () => settings.value.elementBar,
      run: () => void set('elementBar', false),
    },
    // The Structure strip (structure strip design §5): the toolbar's Structure button and Settings
    // set the same row. A Fountain script on a wide screen only: a phone never draws it (Call 16).
    'toggle-structure-strip': {
      enabled: () => isFountain() && window.matchMedia(WIDE_QUERY).matches,
      why: () => (isMarkdown() ? NOT_FOR_MARKDOWN : undefined),
      run: () => void set('structureStrip', !settings.value.structureStrip),
    },
    'fold-all': { run: onEditor((v) => foldAll(v)) },
    'unfold-all': { run: onEditor((v) => unfoldAll(v)) },
    condense: {
      enabled: isFountain,
      run: () => {
        // Every scene folds to its heading and synopsis; the sections stay open, so the Source
        // reads as the outline does.
        const effects = useOutline().index.value.scenes.flatMap((scene) => {
          const line = view.state.doc.lineAt(scene.span.from);
          const range = foldable(view.state, line.from, line.to);
          return range ? [foldEffect.of(range)] : [];
        });
        if (effects.length > 0) view.dispatch({ effects });
        focus.leave();
        if (window.matchMedia(WIDE_QUERY).matches) {
          // The Source in one pane (where it is, or the left) and the Outline in the other.
          const source: PaneId = panes.tabs.value.right === 'source' ? 'right' : 'left';
          panes.tabs.value = {
            ...panes.tabs.value,
            [source]: 'source',
            [source === 'left' ? 'right' : 'left']: 'outline',
          };
        } else {
          panes.phoneTab.value = 'outline';
        }
        void sayOutline(
          'Condensed to the outline: every scene is folded to its heading and synopsis.',
        );
        void nextTick().then(() => document.getElementById('panel-outline')?.focus());
      },
    },
    'expand-all': {
      run: onEditor((v) => {
        unfoldAll(v);
        void sayOutline('Expanded every scene and section.');
      }),
    },

    // Edit
    undo: { enabled: canEdit, run: onEditor((v) => undo(v)) },
    redo: { enabled: canEdit, run: onEditor((v) => redo(v)) },
    find: { run: onEditor((v) => openSearchPanel(v)) },
    // On with spellcheck off too, so that it can say so.
    'check-spelling': { run: checkSpelling },
    'spelling-suggestions': {
      enabled: spellOn,
      why: spellWhy,
      run: onEditor((v) => {
        if (!openSpellMenu(v)) void saySpell(NO_MARK_HERE);
      }),
    },
    // A suggestion and the script's dictionary edit the file; My dictionary and Ignore here don't,
    // so a read-only tab can use them (Call 19).
    'add-to-script-dictionary': onMisspelling((mark) =>
      tryAddToScript(view, mark.word, editor.kind.value, useOutline().locked.value),
    ),
    'add-to-my-dictionary': onMisspelling((mark) => void addToMine(view, mark.word)),
    'ignore-misspelling': onMisspelling((mark) => {
      ignoreWordHere(view, mark);
      void saySpell(`Ignored “${mark.word}” here.`);
    }),
    // Expand outline (design §6.5): the selection's outline lines as scene stubs.
    'expand-outline': {
      enabled: () => canEdit() && isFountain(),
      run: () => {
        const { from, to } = view.state.selection.main;
        if (from === to) {
          void sayOutline('Select the outline lines to expand first: = lines and - lists.');
          return;
        }
        const blocked = useOutline().readOnly.value;
        if (blocked) {
          void sayOutline(blocked);
          return;
        }
        const range = { from, to };
        const before = useOutline().index.value.scenes.length;
        const changes = expandOutline(editor.doc.value, editor.template.value, range);
        if (changes.length === 0) {
          void sayOutline('Nothing to expand: no = lines or - lists outside a scene.');
          return;
        }
        useSnapshots().before('before-expand');
        applyTextChanges(view, changes);
        const made = useOutline().index.value.scenes.length - before;
        void sayOutline(
          `Made ${made} scene ${made === 1 ? 'stub' : 'stubs'}. Problems lists them.`,
        );
        editor.goto(view.state.selection.main.head);
      },
    },
    'move-scene-up': moveScene('up'),
    'move-scene-down': moveScene('down'),
    'new-note': {
      enabled: () => isFountain() && useOutline().readOnly.value === null,
      why: () => useOutline().readOnly.value ?? undefined,
      run: () => openNewNote(),
    },
    'scene-details': {
      // On in a read-only tab too: the form opens read-only (Save says why).
      enabled: () => isFountain() && !!sceneAtCursor(),
      run: () => {
        const scene = sceneAtCursor();
        if (scene) openSceneDetails(useOutline().idOf(scene));
      },
    },

    // Edit, the element bar's commands
    // On a stage play Scene writes a `##` section and Action is a stage direction (the template's
    // roles), so their titles say so; Act is there only, and Transition only where the template has one.
    'element-scene-heading': {
      ...element('scene_heading'),
      liveTitle: () => (isStage() ? 'Element: Scene (##)' : 'Element: Scene heading'),
    },
    'element-act': inEditor(
      () => isFountain() && structure().actDepth !== null,
      makeElement('act'),
      'act',
    ),
    'element-action': {
      ...element('action'),
      liveTitle: () => (isStage() ? 'Element: Stage direction' : 'Element: Action'),
    },
    'element-character': element('character'),
    'element-dialogue': element('dialogue'),
    // Off where it doesn't apply, so the palette doesn't offer it (the bar's button says why).
    'element-parenthetical': inEditor(
      () => isFountain() && canMakeParenthetical(view.state),
      makeElement('parenthetical'),
      'parenthetical',
    ),
    'element-transition': inEditor(
      () => isFountain() && structure().transitions,
      makeElement('transition'),
      'transition',
    ),
    'element-centered': element('centered'),
    'element-lyric': element('lyric'),
    'element-section': element('section'),
    'element-synopsis': element('synopsis'),
    'element-page-break': inEditor(isFountain, insertPageBreak, 'page_break'),
    'emphasis-bold': inEditor(isFountain, wrapInBold),
    'emphasis-italic': inEditor(isFountain, wrapInItalic),
    'emphasis-underline': inEditor(isFountain, wrapInUnderline),

    // Edit, the Fountain commands (technical design §3.3)
    'make-scene-heading': {
      ...fountain(forceKind('scene_heading')),
      enabled: () => canEdit() && isFountain() && structure().headings,
    },
    'make-action': fountain(forceKind('action')),
    'make-character': fountain(forceKind('character')),
    'make-parenthetical': fountain(forceKind('parenthetical')),
    'make-transition': {
      ...fountain(forceKind('transition')),
      enabled: () => canEdit() && isFountain() && structure().transitions,
    },
    'make-centered': fountain(forceKind('centered')),
    'make-lyric': fountain(forceKind('lyric')),
    'mark-setup': mark('Setup'),
    'mark-payoff': mark('Payoff'),
    'dual-dialogue': fountain(toggleDual),
    'wrap-in-note': fountain(wrapInNote),
    'cut-to-boneyard': fountain(wrapInBoneyard),

    // Edit, the element bar's buttons for a Markdown document
    ...Object.fromEntries(
      MARKDOWN_ACTIONS.map(([action]): [string, Behavior] => [
        `markdown-${action}`,
        inEditor(isMarkdown, MARKDOWN_COMMANDS[action]),
      ]),
    ),
  };

  // The data and the behavior must name the same commands: one without the other is a mistake in
  // this file, found the first time the app starts.
  const known = new Set(COMMAND_DATA.map((c) => c.id));
  for (const id of Object.keys(behaviors)) {
    if (!known.has(id)) throw new Error(`The command “${id}” has behavior but no data (data.ts).`);
  }
  registerCommands(
    COMMAND_DATA.map((data): Command => {
      const behavior = behaviors[data.id];
      if (!behavior) throw new Error(`The command “${data.id}” has data but no behavior.`);
      const { liveTitle, ...rest } = behavior;
      const command: Command = { ...data, ...rest };
      // The palette and the desktop menu read the title when they draw, so a getter follows the script.
      if (liveTitle) Object.defineProperty(command, 'title', { get: liveTitle, enumerable: true });
      return command;
    }),
  );
}
