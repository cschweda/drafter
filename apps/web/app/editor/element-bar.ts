// The element bar's buttons and words (docs/drafter-element-bar-design.md §3, §5). Each button
// runs a command in `commands/data.ts`, so the bar, the palette, the menus, and the Keyboard
// shortcuts page are one list, and its key comes from there. This file imports only plain data,
// by relative paths, so a test can read it.

import type { CursorElement, ElementStructure } from '@drafter/cm-fountain';
import { COMMAND_DATA } from '../commands/data';
import { formatKeys } from '../commands/keys';
import { ELEMENT_NAMES } from './element-names';

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

/**
 * The main buttons for a stage play (docs/drafter-element-bar-design.md, review fix): its acts and
 * scenes are `#` and `##` sections, its action is stage direction, and it has no INT. headings or
 * transitions. Scene and Stage direction run the same commands as a screenplay's Scene and Action,
 * which follow the template.
 */
export const STAGE_BUTTONS: readonly BarButton[] = [
  {
    label: 'Act',
    mark: '#',
    command: 'element-act',
    tip: 'In a stage play, a line starting with # starts an act, and prints as its heading.',
  },
  {
    label: 'Scene',
    mark: '##',
    command: 'element-scene-heading',
    tip: 'In a stage play, a line starting with ## starts a scene, and prints as its heading.',
  },
  {
    label: 'Stage direction',
    mark: '!',
    command: 'element-action',
    kind: 'action',
    tip: 'A stage direction is what the audience sees and hears: any paragraph that isn’t another element. Drafter adds ! only when the line would read as something else.',
  },
  ...FOUNTAIN_BUTTONS.filter((button) =>
    ['element-character', 'element-dialogue', 'element-parenthetical'].includes(button.command),
  ),
];

/** More, for a stage play: no Section, which Act and Scene are. */
const STAGE_MORE = FOUNTAIN_MORE.filter((button) => button.command !== 'element-section');

/** The bar's buttons and More for a script's structure: a stage play's, or a screenplay's. */
export function barFor(structure: ElementStructure): {
  buttons: readonly BarButton[];
  more: readonly BarButton[];
} {
  return structure.headings
    ? { buttons: FOUNTAIN_BUTTONS, more: FOUNTAIN_MORE }
    : { buttons: STAGE_BUTTONS, more: STAGE_MORE };
}

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
export function reasonFor(
  kind: Kind | null,
  forced: boolean,
  context?: 'name' | 'speech',
  role?: string | null,
): string {
  const byRole = role ? ROLE_REASONS[role] : undefined;
  if (byRole) return (forced && byRole.forced) || byRole.plain;
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

/** What a stage play's roles are called, and why a line is one. */
const ROLE_NAMES: Record<string, string> = {
  act_heading: 'Act',
  scene_heading_play: 'Scene',
  stage_direction: 'Stage direction',
};
const ROLE_REASONS: Record<string, { plain: string; forced?: string }> = {
  act_heading: { plain: 'a line starting with # in a stage play' },
  scene_heading_play: { plain: 'a line starting with ## in a stage play' },
  stage_direction: {
    plain: 'a paragraph that isn’t any other element',
    forced: 'forced by the ! at its start',
  },
};
const ROLE_ANCHORS: Record<string, string> = {
  act_heading: 'act',
  scene_heading_play: 'scene',
  stage_direction: 'stage-direction',
};
const ROLE_COMMANDS: Record<string, string> = {
  act_heading: 'element-act',
  scene_heading_play: 'element-scene-heading',
  stage_direction: 'element-action',
};
/** The command whose button stands for each kind of line. */
const KIND_COMMANDS: Record<Kind, string | null> = {
  scene_heading: 'element-scene-heading',
  action: 'element-action',
  character: 'element-character',
  dialogue: 'element-dialogue',
  parenthetical: 'element-parenthetical',
  transition: 'element-transition',
  centered: 'element-centered',
  lyric: 'element-lyric',
  section: 'element-section',
  synopsis: 'element-synopsis',
  note: 'wrap-in-note',
  boneyard: 'cut-to-boneyard',
  page_break: 'element-page-break',
  title_page: null,
};

/**
 * What the bar makes of the cursor's line: what it's called, the command of the button shown
 * pressed, and its section of the cheat sheet. `role` is the line's role in the script's template,
 * which names a stage play's acts, scenes, and stage directions.
 */
export function currentOf(
  kind: Kind | null,
  role: string | null,
): { name: string | null; command: string | null; anchor: string | null } {
  if (!kind) return { name: null, command: null, anchor: null };
  if (role && ROLE_NAMES[role]) {
    return {
      name: ROLE_NAMES[role] as string,
      command: ROLE_COMMANDS[role] ?? null,
      anchor: ROLE_ANCHORS[role] ?? null,
    };
  }
  return {
    name: ELEMENT_NAMES[kind],
    command: KIND_COMMANDS[kind],
    anchor: CHEAT_SHEET_ANCHORS[kind],
  };
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
