// The element bar's buttons and words (docs/drafter-element-bar-design.md §3, §5). Each button
// runs a command in `commands/data.ts`, so the bar, the palette, the menus, and the Keyboard
// shortcuts page are one list, and its key comes from there. This file imports only plain data,
// by relative paths, so a test can read it.

import type { CursorElement } from '@drafter/cm-fountain';
import { COMMAND_DATA } from '../commands/data';
import { formatKeys } from '../commands/keys';

type Kind = CursorElement['kind'];

export interface BarButton {
  label: string;
  /** The mark it writes, shown dimmed after the label in the monospace face. */
  mark: string;
  /** The id of the command it runs. */
  command: string;
  /** The element it makes: the button is shown pressed while the cursor's line is one. */
  kind?: Kind;
  /** One sentence: the element's rule and its mark. `tipFor` adds the command's key. */
  tip: string;
}

/** The buttons on the bar for a Fountain script, in order. */
export const FOUNTAIN_BUTTONS: readonly BarButton[] = [
  {
    label: 'Scene',
    mark: 'INT.',
    command: 'element-scene-heading',
    kind: 'scene_heading',
    tip: 'A scene heading says where and when: a line starting INT., EXT., EST., INT./EXT. or I/E, with a blank line before and after it. One that names no place starts with a dot instead.',
  },
  {
    label: 'Action',
    mark: '!',
    command: 'element-action',
    kind: 'action',
    tip: 'Action is what we see and hear: any paragraph that isn’t another element. Drafter adds ! only when the line would read as something else.',
  },
  {
    label: 'Character',
    mark: '@',
    command: 'element-character',
    kind: 'character',
    tip: 'A name in capitals on its own line, after a blank line, with dialogue under it. Drafter adds @ only when capitals alone won’t do.',
  },
  {
    label: 'Dialogue',
    mark: '',
    command: 'element-dialogue',
    kind: 'dialogue',
    tip: 'Dialogue is the lines just under a character name, with no blank line between. Anywhere else, Drafter starts a name above the line for you to fill in.',
  },
  {
    label: 'Parenthetical',
    mark: '( )',
    command: 'element-parenthetical',
    kind: 'parenthetical',
    tip: 'A short direction in parentheses, on its own line under a character name or in their dialogue.',
  },
  {
    label: 'Transition',
    mark: '>',
    command: 'element-transition',
    kind: 'transition',
    tip: 'A transition, such as CUT TO:, in capitals with a blank line before and after it. One that ends in TO: needs no mark, and any other starts with >.',
  },
];

/** The rest, in the bar's More menu. */
export const FOUNTAIN_MORE: readonly BarButton[] = [
  {
    label: 'Centered',
    mark: '> <',
    command: 'element-centered',
    kind: 'centered',
    tip: 'Text between > and < is centered on the page, such as THE END.',
  },
  {
    label: 'Lyric',
    mark: '~',
    command: 'element-lyric',
    kind: 'lyric',
    tip: 'A line starting with ~ is a lyric, printed in italics, on its own or in dialogue.',
  },
  {
    label: 'Dual dialogue',
    mark: '^',
    command: 'dual-dialogue',
    tip: 'A ^ after the second of two names puts the two speeches side by side. Use it in the second speech; press again to take it off.',
  },
  {
    label: 'Note',
    mark: '[[ ]]',
    command: 'wrap-in-note',
    kind: 'note',
    tip: 'Text between [[ and ]] is a note to yourself, and never prints. It wraps the selection.',
  },
  {
    label: 'Boneyard',
    mark: '/* */',
    command: 'cut-to-boneyard',
    kind: 'boneyard',
    tip: 'Text between /* and */ is cut but kept: it never prints, and you can bring it back. It wraps the selection.',
  },
  {
    label: 'Section',
    mark: '#',
    command: 'element-section',
    kind: 'section',
    tip: 'A line starting with # names a part of the script, such as an act, and ## a part inside it. Sections help you find your way, and never print.',
  },
  {
    label: 'Synopsis',
    mark: '=',
    command: 'element-synopsis',
    kind: 'synopsis',
    tip: 'A line starting with = sums up a scene or a section for you, and never prints.',
  },
  {
    label: 'Page break',
    mark: '===',
    command: 'element-page-break',
    kind: 'page_break',
    tip: 'A line of three or more = starts a new page.',
  },
  {
    label: 'Bold',
    mark: '**',
    command: 'emphasis-bold',
    tip: 'Text between ** and ** prints in bold.',
  },
  {
    label: 'Italic',
    mark: '*',
    command: 'emphasis-italic',
    tip: 'Text between * and * prints in italics.',
  },
  {
    label: 'Underline',
    mark: '_',
    command: 'emphasis-underline',
    tip: 'Text between _ and _ prints underlined.',
  },
];

/** The bar for a Markdown document. */
export const MARKDOWN_BUTTONS: readonly BarButton[] = [
  {
    label: 'Heading',
    mark: '#',
    command: 'markdown-heading',
    tip: 'A line starting with # is a heading, and ## and ### smaller ones. Press again for the next level.',
  },
  {
    label: 'Bold',
    mark: '**',
    command: 'markdown-bold',
    tip: 'Text between ** and ** is bold.',
  },
  {
    label: 'Italic',
    mark: '*',
    command: 'markdown-italic',
    tip: 'Text between * and * is in italics.',
  },
  {
    label: 'List',
    mark: '-',
    command: 'markdown-list',
    tip: 'A line starting with - is an item in a list. Press again to take the mark off.',
  },
  {
    label: 'Numbered',
    mark: '1.',
    command: 'markdown-numbered',
    tip: 'A line starting with a number and a dot is an item in a numbered list.',
  },
  {
    label: 'Quote',
    mark: '>',
    command: 'markdown-quote',
    tip: 'A line starting with > is a quotation.',
  },
  {
    label: 'Link',
    mark: '[ ]( )',
    command: 'markdown-link',
    tip: 'A link’s words go between [ and ], and the address between ( and ) after them.',
  },
  {
    label: 'Code',
    mark: '`',
    command: 'markdown-code',
    tip: 'Text between backticks is code, shown just as it is typed.',
  },
];

/** The tooltip, and the button's description: its sentence, and its key for this keyboard. */
export function tipFor(button: BarButton, apple: boolean): string {
  const keys = COMMAND_DATA.find((c) => c.id === button.command)?.keys;
  return keys ? `${button.tip} Shortcut: ${formatKeys(keys, apple)}.` : button.tip;
}

/**
 * Why a line is the element it is: `plain` for one the parser recognized by its shape, and
 * `forced` for one a mark decided (only the kinds a forcing mark can make have one).
 */
export const ELEMENT_REASONS: Record<Kind, { plain: string; forced?: string }> = {
  scene_heading: {
    plain: 'a line starting INT., EXT., EST., INT./EXT. or I/E',
    forced: 'forced by the . at its start',
  },
  action: {
    plain: 'a paragraph that isn’t any other element',
    forced: 'forced by the ! at its start',
  },
  character: {
    plain: 'a name in capitals after a blank line, with dialogue under it',
    forced: 'forced by the @ at its start',
  },
  dialogue: { plain: 'the lines just under a character name' },
  parenthetical: { plain: 'a line in ( ) under a character name or in dialogue' },
  transition: {
    plain: 'a line in capitals ending in TO:',
    forced: 'forced by the > at its start',
  },
  centered: { plain: 'a line between > and <' },
  lyric: { plain: 'a line starting with ~' },
  section: { plain: 'a line starting with #' },
  synopsis: { plain: 'a line starting with =' },
  note: { plain: 'text between [[ and ]]' },
  boneyard: { plain: 'text between /* and */' },
  page_break: { plain: 'a line of three or more =' },
  title_page: { plain: 'the Key: value lines at the very top of the script' },
};

/**
 * Why the cursor's line is what it is; null is a blank line. `context` is what the parse alone
 * can't say: a name with no speech under it yet (`name`), or the empty line under one (`speech`).
 */
export function reasonFor(kind: Kind | null, forced: boolean, context?: 'name' | 'speech'): string {
  if (context === 'name') {
    return 'a name in capitals after a blank line: its dialogue goes on the line under it';
  }
  if (context === 'speech') {
    return 'the line under a character name: what you type here is their dialogue';
  }
  if (!kind) return 'a blank line, which separates one element from the next';
  const reason = ELEMENT_REASONS[kind];
  return (forced && reason.forced) || reason.plain;
}

/** The words at the bar's left. */
export const hereLabel = (name: string | null): string =>
  name ? `You’re in: ${name}` : 'You’re on a blank line';

/** Where each element is on the Fountain cheat sheet (`/docs/fountain/#…`). */
export const CHEAT_SHEET_ANCHORS: Record<Kind, string> = {
  scene_heading: 'scene-heading',
  action: 'action',
  character: 'character',
  dialogue: 'dialogue',
  parenthetical: 'parenthetical',
  transition: 'transition',
  centered: 'centered',
  lyric: 'lyric',
  section: 'section',
  synopsis: 'synopsis',
  note: 'notes',
  boneyard: 'boneyard',
  page_break: 'page-break',
  title_page: 'title-page',
};
