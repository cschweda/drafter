import { type Doc, parse } from '@drafter/fountain';
import { nextTick, ref } from 'vue';
import { usePanes } from '~/composables/usePanes';
import { applyTextChanges } from '../editor/apply-changes';
import { useLayout } from '../editor/layout';
import { useEditor } from '../editor/session';
import { markdownTitle } from '../markdown/title';
import { useScript } from '../storage/script';
import { fileBaseName, titleOf } from '../storage/text';
import { revealTab, WIDE_QUERY } from '../utils/panes';
import { setModuleProblems } from './problems';
import { announceNotice, moduleTabId, useModules } from './registry';
import { runScope } from './scope';
import { moduleStorage } from './storage';
import type { ModuleContext, ScriptModule } from './types';

/** What `doc()` gives for a Markdown document: it has no Fountain, so it has no blocks. */
let emptyDoc: Doc | undefined;

/**
 * Bumped when another script is opened. A context made before then no longer reports problems or
 * changes the text, and the ones the app hands to tabs and settings are made again (they read this,
 * so what draws them is drawn again).
 */
const generation = ref(0);
/** Bumped when a module is turned off: the contexts it was given stop working for good. */
const epochs = new Map<string, number>();
const contexts = new Map<string, ModuleContext>();

/** Another script was opened. */
export function scriptChanged(): void {
  generation.value++;
  contexts.clear();
}

/** The module was turned off. */
export function moduleTurnedOff(id: string): void {
  epochs.set(id, (epochs.get(id) ?? 0) + 1);
  contexts.delete(id);
}

/**
 * A context for `module`: read-only views of the script, and the few things a module may do
 * (change the text, set its problems, go somewhere, keep a value, say something).
 *
 * The views read the editor's reactive state, so a component that calls them while it draws is
 * drawn again when the script changes.
 *
 * What it does is for the script and the module's being on as they were when the context was made:
 * `applyChanges` and `setProblems` do nothing, and return false, once another script has been
 * opened or the module has been turned off. With `checkText` (a run) `applyChanges` also refuses
 * once the text has been edited by anyone but this context since it started, so a run that waited
 * (for a network answer, say) doesn't change text it never saw.
 */
function createContext(module: ScriptModule, checkText: boolean): ModuleContext {
  const editor = useEditor();
  const { view } = editor;
  const script = useScript();
  const markdown = () => editor.kind.value === 'markdown';
  const modules = useModules();
  const scope = runScope(
    {
      generation: () => generation.value,
      epoch: () => epochs.get(module.id) ?? 0,
      on: () => modules.enabled.value.includes(module.id),
      doc: () => view.state.doc,
    },
    { checkText },
  );

  return {
    source() {
      // Read for its reactivity: the parse is replaced with every change to the text.
      editor.doc.value;
      return view.state.doc.toString();
    },
    doc() {
      if (!markdown()) return editor.doc.value;
      emptyDoc ??= parse('');
      return emptyDoc;
    },
    layout() {
      return markdown() ? null : useLayout().layout.value;
    },
    template() {
      return editor.template.value;
    },
    title() {
      const fallback = fileBaseName(script.project.value?.fileName);
      editor.doc.value;
      return markdown()
        ? (markdownTitle(view.state.doc.toString()) ?? fallback)
        : titleOf(editor.doc.value, fallback);
    },
    kind() {
      return editor.kind.value;
    },
    cursor() {
      return view.state.selection.main.head;
    },
    applyChanges(changes) {
      if (!scope.mayChange()) return false;
      if (!applyTextChanges(view, changes)) {
        void announceNotice('This script can’t be edited right now.');
        return false;
      }
      scope.changed();
      return true;
    },
    setProblems(items) {
      if (!scope.live()) return false;
      setModuleProblems(module.id, module.name, items, view.state.doc.length);
      return true;
    },
    goto(offset) {
      if (scope.live()) editor.goto(offset);
    },
    openTab() {
      if (!module.tab || !scope.live()) return;
      const tab = moduleTabId(module.id, module.tab.id);
      const panes = usePanes();
      if (window.matchMedia(WIDE_QUERY).matches) {
        // The Source pane stays: the tab takes the other one, unless Source is in neither.
        const { left, right } = panes.tabs.value;
        const source = left === 'source' ? 'left' : right === 'source' ? 'right' : undefined;
        panes.tabs.value = revealTab(panes.tabs.value, tab, source);
      } else {
        panes.phoneTab.value = tab;
      }
      // The panel may have only just been drawn: focus it once it is.
      void nextTick().then(() => document.getElementById(`panel-${tab}`)?.focus());
    },
    storage: moduleStorage(module.id),
    notify(message) {
      void announceNotice(String(message));
    },
  };
}

/**
 * The context a module's tab and settings are given, and its commands are made with: one for each
 * module, kept until another script opens or the module is turned off.
 */
export function contextFor(module: ScriptModule): ModuleContext {
  generation.value; // Read, so what calls this is called again when a new script opens.
  const known = contexts.get(module.id);
  if (known) return known;
  const made = createContext(module, false);
  contexts.set(module.id, made);
  return made;
}

/** A new context for one run of a module's button or command, which checks the text as well. */
export function runContextFor(module: ScriptModule): ModuleContext {
  return createContext(module, true);
}
