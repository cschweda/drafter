import { type Doc, parse } from '@drafter/fountain';
import { applyTextChanges } from '../editor/apply-changes';
import { useLayout } from '../editor/layout';
import { useEditor } from '../editor/session';
import { markdownTitle } from '../markdown/title';
import { useScript } from '../storage/script';
import { fileBaseName, titleOf } from '../storage/text';
import { setModuleProblems } from './problems';
import { announceNotice } from './registry';
import { moduleStorage } from './storage';
import type { ModuleContext, ScriptModule } from './types';

/** What `doc()` gives for a Markdown document: it has no Fountain, so it has no blocks. */
let emptyDoc: Doc | undefined;

const contexts = new Map<string, ModuleContext>();

/**
 * The context a module is given: read-only views of the script, and the few things a module may do
 * (change the text, set its problems, go somewhere, keep a value, say something). One for each
 * module, made on first use and kept.
 *
 * The views read the editor's reactive state, so a component that calls them while it draws is
 * drawn again when the script changes.
 */
export function contextFor(module: ScriptModule): ModuleContext {
  const known = contexts.get(module.id);
  if (known) return known;

  const editor = useEditor();
  const { view } = editor;
  const script = useScript();
  const markdown = () => editor.kind.value === 'markdown';

  const context: ModuleContext = {
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
      if (!applyTextChanges(view, changes)) {
        void announceNotice(
          'This script can’t be changed here: it is open for editing in another tab.',
        );
      }
    },
    setProblems(items) {
      setModuleProblems(module.id, module.name, items, view.state.doc.length);
    },
    goto(offset) {
      editor.goto(offset);
    },
    storage: moduleStorage(module.id),
    notify(message) {
      void announceNotice(String(message));
    },
  };
  contexts.set(module.id, context);
  return context;
}
