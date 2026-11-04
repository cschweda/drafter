import { aboutOpen } from '~/about/dialog';
import { useTechnicalDetails } from '~/about/use-technical-details';
import { firstSceneStart } from '~/editor/first-scene';
import { SAMPLE_SCRIPTS } from '~/editor/sample-scripts';
import { useEditor } from '~/editor/session';
import { STARTERS } from '~/editor/starters';
import { reportOpen } from '~/report/dialog';
import { sayInToast } from '~/storage/export';
import { useScript } from '~/storage/script';
import { requestTour } from '~/tour/state';
import { updateCheckOpen } from '~/update/use-check';
import { writeClipboard } from '~/utils/clipboard';
import { type Behavior, quietly, type When } from './behavior';
import { DOWNLOAD_PAGE, HELP_PAGES, helpHref } from './data';

/**
 * The Help group's commands (out of `builtin.ts`, 2026-11-04): the tour, the help pages, the sample
 * scripts and guided starters, Check for updates, About, Report a problem, and Copy technical
 * details. Called from `registerBuiltinCommands`, in the page's setup, where the composables work.
 */
export function helpBehaviors({ canStart }: When): Record<string, Behavior> {
  const script = useScript();
  const editor = useEditor();
  const technicalDetails = useTechnicalDetails();
  return {
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
    // Help → Download the desktop app: the Download page, in a new tab like the help pages. Web only.
    [DOWNLOAD_PAGE.id]: { run: () => void window.open(helpHref(DOWNLOAD_PAGE), '_blank') },
    // Help → Sample scripts: a tiny sample of each kind, as a new script of the writer's own with no file, opened
    // unchanged (its text is where "changed" is measured from). The script that was open is kept, as for any switch.
    ...Object.fromEntries(
      SAMPLE_SCRIPTS.map((sample): [string, Behavior] => [
        `sample-script-${sample.kind}`,
        {
          enabled: canStart,
          run: quietly(async () => {
            const made = await script.addScript(sample.text, {
              kind: sample.kind === 'markdown' || sample.kind === 'novel' ? 'markdown' : 'fountain',
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
    // Help → Report a problem… and Suggest an idea…: the dialog that fills in GitHub's page.
    'report-problem': {
      run: () => {
        reportOpen.value = 'problem';
      },
    },
    'suggest-idea': {
      run: () => {
        reportOpen.value = 'idea';
      },
    },
    // Help → Copy technical details: for a GitHub issue, read as the command runs (in its click).
    'copy-technical-details': {
      run: async () => {
        const ok = await writeClipboard(technicalDetails());
        await sayInToast(
          ok
            ? 'Copied the technical details. Paste them into your GitHub issue.'
            : 'Couldn’t copy. Help → Report a problem… shows the technical details, to select and copy.',
        );
      },
    },
  };
}
