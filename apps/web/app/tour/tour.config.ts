// The guided tour (Phase 1 design §4.4): the welcome's words, the "Fountain in 30 seconds" card, and
// the ten steps. The steps point at the `data-tour` attributes on the toolbar, the status bar, the
// app menu's mark, and each pane's panel (`AppPane.vue` sets a panel's to its tab's id).
import type { IntroSlide, TourStep } from 'nuxt-guided-tour/types';

/** Raise this when the tour changes enough to show again to people who have seen it. */
export const TOUR_VERSION = 1;
/** The module stores "seen" in localStorage as `drafter-tour-v1`: this prefix, then `-v` and the version. */
export const TOUR_STORAGE_PREFIX = 'drafter-tour';

export const WELCOME = {
  title: 'Welcome to Drafter',
  description:
    'A Fountain-first writing app: screenplays and stage plays in Fountain, and anything else, from a treatment to a novel, in Markdown. Want a two-minute tour?',
  subdescription: 'Your scripts stay on this device.',
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

/**
 * The ten steps. The template step depends on the screen: below 1024px the template chip is hidden
 * (the toolbar is icons), so it points at the app menu's mark and says where the template is chosen.
 */
export function buildSteps(wide: boolean): TourStep[] {
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
    wide
      ? {
          id: 'template',
          target: target('template'),
          title: 'Screenplay or stage play',
          content: 'The same text, in two formats. Choose the template here.',
        }
      : {
          id: 'template',
          target: target('menu'),
          title: 'Screenplay or stage play',
          content:
            'The same text, in two formats. On a small screen, choose it in the Drafter menu’s Template section, or from the palette: Template: Stage play.',
        },
    {
      id: 'save',
      target: target('save'),
      title: 'Save',
      content:
        'Saves a .fountain file. In Chrome and Edge on a computer it saves straight back to the file, so a script in a Dropbox or Google Drive folder syncs. Other browsers, and phones, download a copy.',
    },
    {
      id: 'status',
      target: target('status'),
      title: 'The status bar',
      content:
        'Whether the script is saved, the recovery copy this browser keeps as you type, and the page count.',
    },
    {
      id: 'export',
      target: target('export'),
      title: 'Export, and open almost anything',
      content:
        'Export a PDF, a Final Draft file (.fdx), Markdown, or plain text. Open, in the Drafter menu, reads Final Draft, Highland, Fade In, Markdown, and plain text, so a script can come from the apps people use and go back to them.',
    },
    {
      id: 'focus',
      target: target('focus'),
      title: 'Focus',
      content:
        'Focus mode, for when you only want the page. Typewriter scrolling, which keeps your line in the middle, is the Typewriter button on the Source pane’s bar.',
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
