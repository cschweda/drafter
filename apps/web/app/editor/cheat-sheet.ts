// The Fountain cheat sheet's entries (/docs/fountain/), written for Drafter from the Fountain syntax
// (fountain.io). They are in the order the element bar lists its buttons, and their ids are the
// ones the bar's "You're in" links to (`CHEAT_SHEET_ANCHORS`). A test parses each example with
// Drafter's parser, so the sheet can't teach a rule the parser reads differently. Plain data, so the
// prerendered page and a test can both read it.

import type { BlockKind } from '@drafter/fountain';

export interface CheatSheetEntry {
  id: string;
  name: string;
  /** The mark, or how the element is recognized, in a few words. */
  mark: string;
  /** The rule, in a sentence or two. */
  rule: string;
  example: string;
  /** The elements the parser reads in the example, in order. */
  reads: BlockKind[];
  /** Stage plays have a part of their own, after the elements every script has. */
  part?: 'stage';
}

export const CHEAT_SHEET: readonly CheatSheetEntry[] = [
  {
    id: 'scene-heading',
    name: 'Scene heading',
    mark: 'INT. or EXT., or a leading .',
    rule: 'A line that starts with INT., EXT., EST., INT./EXT. or I/E, with a blank line before and after it, starts a scene and says where and when. Any line that starts with a dot and then a letter or number is a heading too, which is how a heading that names no place is written. A stage play’s scenes are ## lines instead (see Stage plays, below).',
    example: 'INT. KITCHEN - NIGHT\n\n.FLASHBACK',
    reads: ['scene_heading', 'scene_heading'],
  },
  {
    id: 'action',
    name: 'Action',
    mark: 'none, or a leading !',
    rule: 'Any paragraph that isn’t another element is action: what we see and hear. Start it with ! when it would otherwise read as something else, such as a line in capitals with another line straight under it, which would read as a name and its dialogue.',
    example: 'Margaret sets down the phone.\n\n!SILENCE.\nThe clock ticks.',
    reads: ['action', 'action'],
  },
  {
    id: 'character',
    name: 'Character',
    mark: 'capitals, or a leading @',
    rule: 'A name in capitals on its own line, after a blank line and with dialogue straight under it, says who speaks. It can end with an extension such as (V.O.) for a voice over or (O.S.) for off screen. An @ makes a name a character even when it isn’t all capitals.',
    example: 'MARGARET (V.O.)\nYou said seven.\n\n@McCLANE\nI did.',
    reads: ['character', 'dialogue', 'character', 'dialogue'],
  },
  {
    id: 'dialogue',
    name: 'Dialogue',
    mark: 'none',
    rule: 'The lines straight under a character name, with no blank line between, are what they say. A blank line ends the speech.',
    example: 'MARGARET\nYou said seven.',
    reads: ['character', 'dialogue'],
  },
  {
    id: 'parenthetical',
    name: 'Parenthetical',
    mark: '( )',
    rule: 'A short direction in parentheses, on its own line under a character name or between lines of their dialogue.',
    example: 'MARGARET\n(quietly)\nYou said seven.',
    reads: ['character', 'parenthetical', 'dialogue'],
  },
  {
    id: 'transition',
    name: 'Transition',
    mark: 'ends in TO:, or a leading >',
    rule: 'A line in capitals that ends in TO:, with a blank line before and after it, is a transition. Any other transition starts with >.',
    example: 'CUT TO:\n\n>FADE OUT.',
    reads: ['transition', 'transition'],
  },
  {
    id: 'centered',
    name: 'Centered text',
    mark: '> <',
    rule: 'Text between > and < is centered on the page.',
    example: '>THE END<',
    reads: ['centered'],
  },
  {
    id: 'lyric',
    name: 'Lyric',
    mark: '~',
    rule: 'A line that starts with ~ is a lyric, printed in italics, on its own or within dialogue.',
    example: '~Happy birthday to you,\n~happy birthday to you.',
    reads: ['lyric'],
  },
  {
    id: 'dual-dialogue',
    name: 'Dual dialogue',
    mark: '^',
    rule: 'A ^ after the second of two character names prints the two speeches side by side, as when people talk at once.',
    example: 'MARGARET\nNo.\n\nDANNY ^\nYes.',
    reads: ['character', 'dialogue', 'character', 'dialogue'],
  },
  {
    id: 'notes',
    name: 'Note',
    mark: '[[ ]]',
    rule: 'Text between [[ and ]] is a note to yourself. It stays in your file and never prints.',
    example: 'She waits. [[Too long?]]\n\n[[Check the date.]]',
    reads: ['action', 'note'],
  },
  {
    id: 'keyed-notes',
    name: 'Keyed note',
    mark: '[[Key: text]]',
    rule: 'A word and a colon at the start of a note gives it a meaning. Goal, Conflict, Outcome, Shift, and Storyline describe a scene and show on its card; a category in capitals, such as TODO, sorts a note in the Notes tab; a name, such as Sam, marks a note from a reader. Ending a note with #resolved closes it, and other #tags are yours to use.',
    example:
      'INT. KITCHEN - NIGHT\n\n[[Goal: Margaret wants the call to end.]]\n[[TODO: Cut the second line. #resolved]]\n[[Sam: Does she know yet?]]',
    reads: ['scene_heading', 'note'],
  },
  {
    id: 'setups-payoffs',
    name: 'Setup and payoff',
    mark: '[[Setup: label]]',
    rule: 'A [[Setup: label]] where something is planted and a [[Payoff: label]] where it comes back are matched by their label. The Notes tab lists them under Setups & payoffs, and the Problems tab advises about any with no partner. They never print.',
    example: 'She hides the key. [[Setup: key]]\n\nShe opens the door. [[Payoff: key]]',
    reads: ['action', 'action'],
  },
  {
    id: 'boneyard',
    name: 'Boneyard',
    mark: '/* */',
    rule: 'Text between /* and */ is cut but kept, over as many lines as you like. It never prints, and taking the marks away brings it back.',
    example: '/*\nA scene you might want later.\n*/',
    reads: ['boneyard'],
  },
  {
    id: 'section',
    name: 'Section',
    mark: '#',
    rule: 'A line that starts with # names a part of the script, such as an act; ## is a part inside it, and so on. Sections build the outline and never print.',
    example: '# Act One\n## The phone call',
    reads: ['section', 'section'],
  },
  {
    id: 'synopsis',
    name: 'Synopsis',
    mark: '=',
    rule: 'A line that starts with = sums up the scene or section above it, for you. It never prints.',
    example: '# Act One\n= Margaret waits for a call.',
    reads: ['section', 'synopsis'],
  },
  {
    id: 'page-break',
    name: 'Page break',
    mark: '===',
    rule: 'A line of three or more = signs, and nothing else, starts a new page.',
    example: 'She hangs up.\n\n===',
    reads: ['action', 'page_break'],
  },
  {
    id: 'emphasis',
    name: 'Bold, italic, and underline',
    mark: '** * _',
    rule: 'Wrap words in two stars for bold, one star for italics, and underscores for underlining; they can be combined. They work in action and dialogue, not in a scene heading, a character name, or a transition, where the marks print as typed.',
    example: '**Never** again.\nShe *almost* says it. _Today._',
    reads: ['action'],
  },
  {
    id: 'title-page',
    name: 'Title page',
    mark: 'Key: value',
    rule: 'Lines of the form Key: value at the very top of the file make the title page, which ends at the first blank line. The usual keys are Title, Credit, Author, Source, Draft date, and Contact; a value can go on over lines indented by three spaces or a tab.',
    example: 'Title: The Call\nAuthor: A. Writer\nContact:\n    writer@example.com',
    reads: [],
  },
  {
    id: 'drafter-block',
    name: 'Drafter’s settings block',
    mark: '/* drafter */',
    rule: 'Drafter keeps what it needs to remember about a script, such as its template, in one boneyard at the very end of the file that starts /* drafter. Other Fountain programs skip a boneyard, so the file stays portable. Leave it as it is: Drafter writes it.',
    example: 'She waits.\n\n/* drafter\n{ "v": 1, "template": "us-screenplay" }\n*/',
    reads: ['action', 'boneyard'],
  },
  {
    id: 'act',
    name: 'Act',
    mark: '#',
    rule: 'In a stage play, a line that starts with # starts an act, and prints as its heading.',
    example: '# ACT ONE',
    reads: ['section'],
    part: 'stage',
  },
  {
    id: 'scene',
    name: 'Scene',
    mark: '##',
    rule: 'In a stage play, a line that starts with ## starts a scene, and prints as its heading. A play has no INT. or EXT. headings, and no transitions: one prints as a stage direction.',
    example: '# ACT ONE\n\n## Scene 1',
    reads: ['section', 'section'],
    part: 'stage',
  },
  {
    id: 'stage-direction',
    name: 'Stage direction',
    mark: 'none, or a leading !',
    rule: 'In a stage play, a paragraph that isn’t another element is a stage direction: what the audience sees and hears. It follows the same rules as action.',
    example: 'Margaret crosses to the window.\n\nMARGARET\nStill raining.',
    reads: ['action', 'character', 'dialogue'],
    part: 'stage',
  },
  {
    id: 'stage-template',
    name: 'Which template',
    mark: '/* drafter */',
    rule: 'A script is laid out as a stage play when the settings block at the end of its file names the stage-play template. Drafter writes it when you choose Stage play; Fountain itself has no stage play.',
    example:
      'MARGARET\nStill raining.\n\n/* drafter\n{ "v": 1, "template": "stage-play-standard" }\n*/',
    reads: ['character', 'dialogue', 'boneyard'],
    part: 'stage',
  },
];
