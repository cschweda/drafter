import { redo, undo } from '@codemirror/commands';
import { foldAll, unfoldAll } from '@codemirror/language';
import { nextDiagnostic, previousDiagnostic } from '@codemirror/lint';
import { openSearchPanel } from '@codemirror/search';
import type { EditorView } from '@codemirror/view';
import { forceKind, toggleDual, wrapInBoneyard, wrapInNote } from '@drafter/cm-fountain';
import { nextTick } from 'vue';
import { usePanes } from '~/composables/usePanes';
import { useEditor } from '~/editor/session';
import { useGuard } from '~/storage/guard';
import { pickAndOpen } from '~/storage/open';
import { save, saveAs } from '~/storage/save';
import { useScript } from '~/storage/script';
import { type PaneId, revealTab, type TabId, WIDE_QUERY } from '~/utils/panes';
import { openPalette, togglePalette } from './palette';
import { type Command, registerCommands } from './registry';
import { removing } from './remove';

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
  const colorMode = useColorMode();

  // ---- When a command applies -------------------------------------------------------------

  const hasScript = () => !!script.project.value;
  const idle = () => hasScript() && !script.busy.value && !guard.taking.value;
  /** Starting a script needs a tab that can edit, and no switch under way. */
  const canStart = () => idle() && !guard.readOnly.value;
  const canEdit = () => !view.state.readOnly;

  // ---- Showing the editor, and the other tabs ---------------------------------------------

  function showTab(tab: TabId) {
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

  const fountain = (
    id: string,
    title: string,
    keys: string,
    act: (view: EditorView) => unknown,
  ): Command => ({
    id,
    title,
    group: 'Edit',
    keys,
    enabled: canEdit,
    run: onEditor((v) => void act(v)),
  });

  // ---- The commands -----------------------------------------------------------------------

  const commands: Command[] = [
    {
      id: 'palette',
      title: 'Go to scene or command',
      group: 'Go',
      keys: 'Mod-k',
      global: true,
      run: togglePalette,
    },

    // File
    {
      id: 'new-screenplay',
      title: 'New screenplay',
      group: 'File',
      keys: 'Mod-Alt-n',
      global: true,
      enabled: canStart,
      run: quietly(() => script.newScript('screenplay')),
    },
    {
      id: 'new-stage-play',
      title: 'New stage play',
      group: 'File',
      enabled: canStart,
      run: quietly(() => script.newScript('stage-play')),
    },
    {
      id: 'open',
      title: 'Open…',
      group: 'File',
      keys: 'Mod-o',
      global: true,
      // A tab that only shows a script says why it can't open one, so this isn't `canStart`.
      enabled: idle,
      run: quietly(pickAndOpen),
    },
    {
      id: 'save',
      title: 'Save',
      group: 'File',
      keys: 'Mod-s',
      global: true,
      // A tab that can't save says so when it's asked to.
      run: quietly(save),
    },
    {
      id: 'save-as',
      title: 'Save As…',
      group: 'File',
      keys: 'Mod-Shift-s',
      global: true,
      run: quietly(saveAs),
    },
    {
      id: 'remove',
      title: 'Remove from this browser',
      group: 'File',
      enabled: () => idle() && !script.project.value?.sample,
      run: () => {
        removing.value = script.project.value;
      },
    },

    // Go
    { id: 'go-to-scene', title: 'Go to scene…', group: 'Go', run: () => openPalette('scene') },
    { id: 'go-to-line', title: 'Go to line…', group: 'Go', run: () => openPalette('line') },
    {
      id: 'next-problem',
      title: 'Next problem',
      group: 'Go',
      keys: 'F8',
      run: onEditor((v) => nextDiagnostic(v)),
    },
    {
      id: 'previous-problem',
      title: 'Previous problem',
      group: 'Go',
      keys: 'Shift-F8',
      run: onEditor((v) => previousDiagnostic(v)),
    },

    // View
    { id: 'show-source', title: 'Show Source', group: 'View', run: () => showTab('source') },
    { id: 'show-script', title: 'Show Script', group: 'View', run: () => showTab('script') },
    { id: 'show-problems', title: 'Show Problems', group: 'View', run: () => showTab('problems') },
    {
      id: 'switch-theme',
      title: 'Switch theme',
      group: 'View',
      run: () => {
        colorMode.preference = colorMode.value === 'light' ? 'dark' : 'light';
      },
    },
    {
      id: 'fold-all',
      title: 'Fold all',
      group: 'View',
      keys: 'Ctrl-Alt-[',
      run: onEditor((v) => foldAll(v)),
    },
    {
      id: 'unfold-all',
      title: 'Unfold all',
      group: 'View',
      keys: 'Ctrl-Alt-]',
      run: onEditor((v) => unfoldAll(v)),
    },

    // Edit
    {
      id: 'undo',
      title: 'Undo',
      group: 'Edit',
      keys: 'Mod-z',
      enabled: canEdit,
      run: onEditor((v) => undo(v)),
    },
    {
      id: 'redo',
      title: 'Redo',
      group: 'Edit',
      keys: 'Mod-Shift-z',
      enabled: canEdit,
      run: onEditor((v) => redo(v)),
    },
    {
      id: 'find',
      title: 'Find',
      group: 'Edit',
      keys: 'Mod-f',
      run: onEditor((v) => openSearchPanel(v)),
    },

    // Edit, the Fountain commands (technical design §3.3)
    fountain('make-scene-heading', 'Make scene heading', 'Mod-Alt-1', forceKind('scene_heading')),
    fountain('make-action', 'Make action', 'Mod-Alt-2', forceKind('action')),
    fountain('make-character', 'Make character', 'Mod-Alt-3', forceKind('character')),
    fountain('make-parenthetical', 'Make parenthetical', 'Mod-Alt-4', forceKind('parenthetical')),
    fountain('make-transition', 'Make transition', 'Mod-Alt-5', forceKind('transition')),
    fountain('make-centered', 'Make centered text', 'Mod-Alt-6', forceKind('centered')),
    fountain('make-lyric', 'Make lyric', 'Mod-Alt-7', forceKind('lyric')),
    fountain('dual-dialogue', 'Dual dialogue', 'Mod-Shift-d', toggleDual),
    fountain('wrap-in-note', 'Wrap in a note', 'Mod-/', wrapInNote),
    fountain('cut-to-boneyard', 'Cut to the boneyard', 'Mod-Shift-/', wrapInBoneyard),
  ];

  registerCommands(commands);
}
