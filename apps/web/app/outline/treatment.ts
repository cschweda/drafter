import { treatment } from '@drafter/outline';
import { ref } from 'vue';
import { useEditor } from '../editor/session';
import { exportMarkdownFile } from '../storage/export';
import { useScript } from '../storage/script';
import { fileBaseName, fileNameFor, titleOf } from '../storage/text';
import { useOutline } from './use-outline';

// Export as treatment (Phase 2 design §6.4): the outline as Markdown, saved as a file or opened
// as a new Markdown document in Drafter.

/** The treatment dialog is open. */
export const treatmentOpen = ref(false);

function current(firstAction: boolean): { title: string; text: string } {
  const editor = useEditor();
  const fallback = fileBaseName(useScript().project.value?.fileName);
  const title = titleOf(editor.doc.value, fallback);
  return {
    title,
    text: treatment(editor.doc.value, useOutline().index.value, { firstAction }),
  };
}

/** Saves the treatment as `<title> — treatment.md`. */
export function saveTreatment(firstAction: boolean): Promise<'saved' | 'cancelled'> {
  const { title, text } = current(firstAction);
  return exportMarkdownFile(fileNameFor(`${title} — treatment`, '.md'), text);
}

/** Opens the treatment as a new Markdown document; the script stays as it is. */
export async function openTreatment(firstAction: boolean): Promise<void> {
  const { text } = current(firstAction);
  const script = useScript();
  const made = await script.addScript(text, { kind: 'markdown' });
  await script.open(made.id);
}
