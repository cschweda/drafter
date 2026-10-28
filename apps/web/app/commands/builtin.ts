import { redo, undo } from '@codemirror/commands';
import { foldAll, unfoldAll } from '@codemirror/language';
import { nextDiagnostic, previousDiagnostic } from '@codemirror/lint';
import { openSearchPanel } from '@codemirror/search';
import type { StateCommand } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
  canMakeParenthetical,
  type ElementKind,
  elementHint,
  forceKind,
  insertPageBreak,
  makeElement,
  structureOf,
  toggleDual,
  withCompletion,
  wrapInBold,
  wrapInBoneyard,
  wrapInItalic,
  wrapInNote,
  wrapInUnderline,
} from '@drafter/cm-fountain';
import { downTarget, upTarget } from '@drafter/outline';
import { nextTick } from 'vue';
import { useFocusMode } from '~/composables/useFocusMode';
import { usePanes } from '~/composables/usePanes';
import { sayElement } from '~/editor/element-notice';
import { SAMPLES } from '~/editor/samples';
import { useEditor } from '~/editor/session';
import { DOCUMENT_TYPES } from '~/editor/template';
import { useTemplate } from '~/editor/use-template';
import { MARKDOWN_COMMANDS } from '~/markdown/commands';
import { runMove } from '~/outline/move';
import { useOutline } from '~/outline/use-outline';
import { settingsOpen } from '~/settings/dialog';
import { useSettings } from '~/settings/settings';
import { statsOpen } from '~/stats/dialog';
import { SPRINT_MINUTES, useSprint } from '~/stats/sprint';
import { exportScript } from '~/storage/export';
import { useGuard } from '~/storage/guard';
import { pickAndOpen } from '~/storage/open';
import { canRevert, revertToSaved, revertWhy, save, saveAs } from '~/storage/save';
import { useScript } from '~/storage/script';
import { requestTour } from '~/tour/state';
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

  // ---- When a command applies -------------------------------------------------------------

  const hasScript = () => !!script.project.value;
  const idle = () => hasScript() && !script.busy.value && !guard.taking.value;
  /** Starting a script needs a tab that can edit, and no switch under way. */
  const canStart = () => idle() && !guard.readOnly.value;
  const canEdit = () => !view.state.readOnly;
  /** Fountain's own commands, checks, and scenes mean nothing in a Markdown document. */
  const isFountain = () => editor.kind.value === 'fountain';
  const isMarkdown = () => editor.kind.value === 'markdown';

  // ---- Showing the editor, and the other tabs ---------------------------------------------

  function showTab(tab: TabId) {
    // Focus mode shows only the Source: any other tab is for the writer to see.
    if (tab !== 'source') focus.leave();
    if (window.matchMedia(WIDE_QUERY).matches) {
      const held = document.activeElement?.closest<HTMLElement>('[data-pane]')?.dataset.pane;
      const from: PaneId | undefined = held === 'left' || held === 'right' ? held : undefined;
      panes.tabs.value = revealTab(panes.tabs.value, tab, from);
    } else {
      panes.phoneTab.value = tab;
    }
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
    // Export: the toolbar's Export menu, the app menu, and the palette run these. A Fountain script exports as a
    // PDF or plain text; a Markdown document as its Markdown file or plain text (a PDF of one is deferred).
    'export-pdf': { enabled: isFountain, run: () => void exportScript('pdf') },
    'export-md': { enabled: isMarkdown, run: () => void exportScript('md') },
    'export-txt': { run: () => void exportScript('txt') },
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
    'next-problem': { enabled: isFountain, run: onEditor((v) => nextDiagnostic(v)) },
    'previous-problem': { enabled: isFountain, run: onEditor((v) => previousDiagnostic(v)) },

    // View
    'show-source': { run: () => showTab('source') },
    'show-script': { enabled: isFountain, run: () => showTab('script') },
    // The Script tab is the Preview in a Markdown document.
    'show-preview': { enabled: isMarkdown, run: () => showTab('script') },
    'show-problems': { run: () => showTab('problems') },
    'show-outline': { enabled: isFountain, run: () => showTab('outline') },
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
    // Writing stats (docs/drafter-stats-design.md §4): the Counts panel and the Drafter menu open it too.
    'show-stats': {
      run: () => {
        statsOpen.value = true;
      },
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
    'fold-all': { run: onEditor((v) => foldAll(v)) },
    'unfold-all': { run: onEditor((v) => unfoldAll(v)) },

    // Edit
    undo: { enabled: canEdit, run: onEditor((v) => undo(v)) },
    redo: { enabled: canEdit, run: onEditor((v) => redo(v)) },
    find: { run: onEditor((v) => openSearchPanel(v)) },
    'move-scene-up': moveScene('up'),
    'move-scene-down': moveScene('down'),

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
