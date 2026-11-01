// The guided tour (Phase 1 design §4.4): the welcome's words, the "Fountain in 30 seconds" card, and
// the ten steps. The steps point at the `data-tour` attributes on the toolbar, the status bar, the
// app menu's mark, and each pane's panel (`AppPane.vue` sets a panel's to its tab's id).
import type { IntroSlide, TourStep } from 'nuxt-guided-tour/types';

/** Raise this when the tour changes enough to show again to people who have seen it. */
export const TOUR_VERSION = 1;
/** The module stores "seen" in localStorage as `drafter-tour-v1`: this prefix, then `-v` and the version. */
export const TOUR_STORAGE_PREFIX = 'drafter-tour';

export const WELCOME = {
  // Drafter™ at its first prominent use; the name is a trademark (the About dialog says so).
  title: 'Welcome to Drafter™',
  description:
    'A Fountain-first writing app: screenplays and stage plays in Fountain, and anything else, from a treatment to a novel, in Markdown. Want a two-minute tour?',
  // What Drafter promises, as the README's "Free, no login, private" says it, in two short lines.
  subdescription:
    'Free, with no catch, and no login, ever. Private (no cookies, no tracking), it works offline, and Final Draft files go in and out.',
  startLabel: 'Take the tour',
  skipLabel: "No thanks, I'll look around.",
} as const;

export const INTRO_SLIDES: IntroSlide[] = [
  {
    title: 'Fountain in 30 seconds',
    icon: 'i-heroicons-pencil-square',
    content: [
      'A Drafter script is plain text, written in a simple format called Fountain. Type it like this, and Drafter lays out the page.',
      'Fountain is the heart of Drafter. You write in it, and the script goes out in the formats the industry uses.',
    ],
    examples: [
      { label: 'Scene heading', syntax: 'INT. KITCHEN - NIGHT', result: 'A scene heading' },
      {
        label: 'Dialogue',
        syntax: 'JOHN\nWhere were you?',
        result: 'A character, and what they say',
      },
      { label: 'Parenthetical', syntax: '(quietly)', result: 'How a line is said, under the name' },
      { label: 'Transition', syntax: 'CUT TO:', result: 'A transition' },
      { label: 'Note', syntax: '[[a note]]', result: 'A note to yourself that never prints' },
    ],
    footer: 'That is all you need to start. The tour shows where everything is.',
  },
];

/** The part of the screen a step's target is, from its `data-tour` value. */
const target = (name: string) => `[data-tour="${name}"]`;

/** Where a top-bar button folded into More actions now is (AppToolbar.vue, Task 9). */
const FOLDED_TARGET = target('toolbar-more');

/**
 * The ten steps. The template step points at the Drafter menu's mark on every screen (fresh-look
 * design §10): the template chip has left the top bar, and the menu's Template section chooses it.
 * `wide` is kept for the steps that will differ by screen. The status step points at the status bar
 * from 640px up and, below that (where there is none, Task 6), at the title, whose red dot says
 * there are unsaved changes. A top-bar button that is `folded` into More actions (a phone's full top
 * bar, Task 9) isn't on screen: its step points at More actions, where it went, and says so; no
 * step is dropped.
 */
export function buildSteps(
  _wide: boolean,
  statusBar = true,
  folded: ReadonlySet<string> = new Set(),
): TourStep[] {
  const at = (name: string) => (folded.has(name) ? FOLDED_TARGET : target(name));
  const where = (name: string) =>
    folded.has(name) ? ' It is under More actions, at the right.' : '';
  return [
    {
      id: 'source-write',
      target: target('source'),
      title: 'You write here',
      content: 'This is plain text, and any app can open the file.',
    },
    {
      id: 'script-pages',
      target: target('script'),
      title: 'The real pages',
      content:
        "The pages exactly as they'll print. Type, and they update. Click a line to jump to it.",
    },
    {
      id: 'source-typing',
      target: target('source'),
      title: 'Names and places come up',
      content:
        'Tab on a blank line starts a character, and names you have used come up as you type. After INT. or EXT., so do your locations. Enter moves on.',
    },
    {
      id: 'problems',
      target: target('problems'),
      title: 'Problems',
      content:
        'Like spell-check for format: a note left open, a name with no dialogue under it. Click one to jump there. Many have a fix.',
    },
    {
      id: 'template',
      target: target('menu'),
      title: 'Screenplay or stage play',
      content:
        'The same text, in two formats. Choose it in the Drafter menu’s Template section, or from the palette: Template: Stage play.',
    },
    {
      id: 'save',
      target: at('save'),
      title: 'Save',
      // Below 640px the status step says what the red dot means; from 640px up, this step does.
      content: `Saves a .fountain file. In Chrome and Edge on a computer it saves straight back to the file, so a script in a Dropbox or Google Drive folder syncs. Other browsers, and phones, download a copy.${
        statusBar ? ' A red dot by the title means unsaved changes; click it to save.' : ''
      }${where('save')}`,
    },
    statusBar
      ? {
          id: 'status',
          target: target('status'),
          title: 'The status bar',
          content:
            'The file’s name (it opens History), the pages and running time, words, problems, and the template. A warning shows here if this browser may clear its recovery copy.',
        }
      : {
          id: 'status',
          target: target('title'),
          title: 'Saved or not',
          content:
            'A red dot by the title means changes that aren’t in a file yet: tap it to save. The pages, words, and running time are in Stats.',
        },
    {
      id: 'export',
      target: at('export'),
      title: 'Export, and open almost anything',
      // Folded, the card says where it went in place of the last clause, to fit the card.
      content: `Export a PDF, a Final Draft file (.fdx), Markdown, plain text, a web page, or an e-book. Open, in the Drafter menu, reads Final Draft, Highland, Fade In, Markdown, and plain text${
        folded.has('export')
          ? `.${where('export')}`
          : ', so a script can come from the apps people use and go back to them.'
      }`,
    },
    {
      id: 'focus',
      target: at('focus'),
      title: 'Focus',
      content: `Focus mode, for when you only want the page. Typewriter scrolling, which keeps your line in the middle, is the Typewriter button on the Source pane’s bar.${where('focus')}`,
    },
    {
      id: 'palette',
      target: target('palette'),
      title: 'Go anywhere',
      content: 'Every command, and every scene by name: ⌘K or Ctrl+K.',
    },
  ];
}

/** The tab a step points at, when its target is a pane (`source`, `script`, `problems`). */
export function paneOf(step: TourStep | null | undefined): string | null {
  const name = /^\[data-tour="([a-z-]+)"\]$/.exec(step?.target ?? '')?.[1];
  return name === 'source' || name === 'script' || name === 'problems' ? name : null;
}
