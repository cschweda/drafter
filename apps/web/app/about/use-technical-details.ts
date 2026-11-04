import { useEditor } from '~/editor/session';
import { useSettings } from '~/settings/settings';
import { useFiles } from '~/storage/files';
import { currentAbout } from './info';
import { currentSetup, technicalDetails } from './setup';

/**
 * The technical details as the app is now: About's version info, the page's setup, and the
 * settings and document kind that change how Drafter behaves (`setup.ts`). Read when asked, so a
 * report says how things were when it was written. Call it in a component's setup.
 */
export function useTechnicalDetails(): () => string {
  const { settings } = useSettings();
  const editor = useEditor();
  const colorMode = useColorMode();
  return () => {
    const markdown = editor.kind.value === 'markdown';
    const setup = currentSetup({
      saveInPlace: useFiles().canSaveInPlace,
      theme: colorMode.value === 'light' ? 'light' : 'dark',
      textSize: settings.value.textSize,
      ...(!markdown && { writingMode: settings.value.writingMode }),
      document: markdown
        ? editor.novel.value
          ? 'Novel'
          : 'Markdown document'
        : editor.template.value.name,
      spellcheck: settings.value.spellcheck,
    });
    return technicalDetails(currentAbout(), setup);
  };
}
