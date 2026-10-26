import { redo, undo } from '@codemirror/commands';
import { foldAll, unfoldAll } from '@codemirror/language';
import { nextDiagnostic, previousDiagnostic } from '@codemirror/lint';
import { openSearchPanel } from '@codemirror/search';
import type { EditorView } from '@codemirror/view';
import { forceKind, toggleDual, wrapInBoneyard, wrapInNote } from '@drafter/cm-fountain';
import { nextTick } from 'vue';
import { usePanes } from '~/composables/usePanes';
import { useEditor } from '~/editor/session';
import { DOCUMENT_TYPES } from '~/editor/template';
import { useTemplate } from '~/editor/use-template';
import { settingsOpen } from '~/settings/dialog';
import { useSettings } from '~/settings/settings';
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
  const { settings, set } = useSettings();
  const template = useTemplate();

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
    enabled: () => canEdit() && isFountain(),
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
    // One New command for each document type, in `DOCUMENT_TYPES` order (the chip and the Scripts menu read the same list).
    ...DOCUMENT_TYPES.map(
      (type): Command => ({
        id: `new-${type.newKind}`,
        title: type.newTitle,
        group: 'File',
        ...(type.newKeys && { keys: type.newKeys, global: true }),
        enabled: canStart,
        run: quietly(() => script.newScript(type.newKind)),
      }),
    ),
    // Switch the Fountain template (the toolbar's chip is hidden below 1024px, so the palette is how a phone does it).
    // Like show/hide line numbers, only the ones that apply are listed: not the current one, and none in a read-only
    // tab or with an unclosed `/*` that the choice would write after. In a Markdown document they are the way back
    // to Fountain (the text is kept). Each runs on the editor, so Mod+Z undoes the block it writes.
    ...DOCUMENT_TYPES.filter((type) => type.kind === 'fountain').map(
      (type): Command => ({
        id: `template-${type.id}`,
        title: `Template: ${type.name}`,
        group: 'File',
        enabled: () =>
          template.canChooseType(type) && !(isFountain() && template.id.value === type.id),
        run: onEditor(() => void template.chooseType(type)),
      }),
    ),
    // Markdown is a kind of document, not a template: it is listed in a Fountain script (after asking, because
    // Fountain's formatting stops applying and undo doesn't bring it back), and not in a Markdown document.
    ...DOCUMENT_TYPES.filter((type) => type.kind === 'markdown').map(
      (type): Command => ({
        id: 'document-markdown',
        title: `Document: ${type.name}`,
        group: 'File',
        enabled: () => isFountain() && template.canChooseType(type),
        run: onEditor(() => void template.chooseType(type)),
      }),
    ),
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

    {
      id: 'settings',
      title: 'Settings…',
      group: 'File',
      keys: 'Mod-,',
      global: true,
      run: () => {
        settingsOpen.value = true;
      },
    },

    // Go
    {
      id: 'go-to-scene',
      title: 'Go to scene…',
      group: 'Go',
      enabled: isFountain,
      run: () => openPalette('scene'),
    },
    { id: 'go-to-line', title: 'Go to line…', group: 'Go', run: () => openPalette('line') },
    {
      id: 'next-problem',
      title: 'Next problem',
      group: 'Go',
      keys: 'F8',
      enabled: isFountain,
      run: onEditor((v) => nextDiagnostic(v)),
    },
    {
      id: 'previous-problem',
      title: 'Previous problem',
      group: 'Go',
      keys: 'Shift-F8',
      enabled: isFountain,
      run: onEditor((v) => previousDiagnostic(v)),
    },

    // View
    { id: 'show-source', title: 'Show Source', group: 'View', run: () => showTab('source') },
    {
      id: 'show-script',
      title: 'Show Script',
      group: 'View',
      enabled: isFountain,
      run: () => showTab('script'),
    },
    // The Script tab is the Preview in a Markdown document.
    {
      id: 'show-preview',
      title: 'Show Preview',
      group: 'View',
      enabled: isMarkdown,
      run: () => showTab('script'),
    },
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
      id: 'show-line-numbers',
      title: 'Show line numbers',
      group: 'View',
      enabled: () => !settings.value.lineNumbers,
      run: () => void set('lineNumbers', true),
    },
    {
      id: 'hide-line-numbers',
      title: 'Hide line numbers',
      group: 'View',
      enabled: () => settings.value.lineNumbers,
      run: () => void set('lineNumbers', false),
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
