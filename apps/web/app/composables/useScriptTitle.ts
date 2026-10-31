import { useEditor } from '~/editor/session';
import { markdownTitle } from '~/markdown/title';
import { useScript } from '~/storage/script';
import { fileBaseName, titleOf } from '~/storage/text';

/**
 * The script's title, as its kind reads it: the Fountain title page's Title, a Markdown document's
 * first heading, or else the file's name. The browser tab and the top bar both show it.
 */
export function useScriptTitle() {
  const { view, doc, kind } = useEditor();
  const { project } = useScript();
  return computed(() => {
    const fallback = fileBaseName(project.value?.fileName);
    // The text changed: the Fountain parse is the signal, and the Markdown title is read from the text.
    doc.value;
    return kind.value === 'markdown'
      ? (markdownTitle(view.state.doc.toString()) ?? fallback)
      : titleOf(doc.value, fallback);
  });
}
