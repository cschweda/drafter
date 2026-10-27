import { redo, undo } from '@codemirror/commands';
import { foldAll, unfoldAll } from '@codemirror/language';
import { nextDiagnostic, previousDiagnostic } from '@codemirror/lint';
import { openSearchPanel } from '@codemirror/search';
import type { EditorView } from '@codemirror/view';
import { forceKind, toggleDual, wrapInBoneyard, wrapInNote } from '@drafter/cm-fountain';
import { nextTick } from 'vue';
import { useFocusMode } from '~/composables/useFocusMode';
import { usePanes } from '~/composables/usePanes';
import { SAMPLES } from '~/editor/samples';
import { useEditor } from '~/editor/session';
import { DOCUMENT_TYPES } from '~/editor/template';
import { useTemplate } from '~/editor/use-template';
import { settingsOpen } from '~/settings/dialog';
import { useSettings } from '~/settings/settings';
import { SPRINT_MINUTES, useSprint } from '~/stats/sprint';
import { exportScript } from '~/storage/export';
import { useGuard } from '~/storage/guard';
import { pickAndOpen } from '~/storage/open';
import { canRevert, revertToSaved, revertWhy, save, saveAs } from '~/storage/save';
import { useScript } from '~/storage/script';
import { requestTour } from '~/tour/state';
import { type PaneId, revealTab, type TabId, WIDE_QUERY } from '~/utils/panes';
import { COMMAND_DATA, HELP_PAGES, helpHref } from './data';
import { openPalette, togglePalette } from './palette';
import { type Command, registerCommands } from './registry';
import { removing } from './remove';

/** What a command does and when it applies; the rest of a `Command` is in `data.ts`. */
type Behavior = Pick<Command, 'run' | 'enabled' | 'why'>;

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
          enabled: () =>
            template.canChooseType(type) && !(isFountain() && template.id.value === type.id),
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
    // The guided tour (Phase 1 design §4.4): offered once on a first visit, and from here after that. The Help
    // section of the app menu lists it too. It waits for any dialog or the palette to close.
    'take-the-tour': { run: requestTour },
    // The help pages (§4.5), prerendered. Each opens in a new tab, so the writer's script and what is typed stay
    // as they are (a command runs from a click or a key, which lets a page open one). The page's own link back
    // to Drafter is a plain link, so there it opens a second editor, which the two-tab guard makes read-only for
    // the script that is open here.
    ...Object.fromEntries(
      HELP_PAGES.map((page): [string, Behavior] => [
        page.id,
        { run: () => void window.open(helpHref(page), '_blank', 'noopener') },
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
    'fold-all': { run: onEditor((v) => foldAll(v)) },
    'unfold-all': { run: onEditor((v) => unfoldAll(v)) },

    // Edit
    undo: { enabled: canEdit, run: onEditor((v) => undo(v)) },
    redo: { enabled: canEdit, run: onEditor((v) => redo(v)) },
    find: { run: onEditor((v) => openSearchPanel(v)) },

    // Edit, the Fountain commands (technical design §3.3)
    'make-scene-heading': fountain(forceKind('scene_heading')),
    'make-action': fountain(forceKind('action')),
    'make-character': fountain(forceKind('character')),
    'make-parenthetical': fountain(forceKind('parenthetical')),
    'make-transition': fountain(forceKind('transition')),
    'make-centered': fountain(forceKind('centered')),
    'make-lyric': fountain(forceKind('lyric')),
    'dual-dialogue': fountain(toggleDual),
    'wrap-in-note': fountain(wrapInNote),
    'cut-to-boneyard': fountain(wrapInBoneyard),
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
      return { ...data, ...behavior };
    }),
  );
}
