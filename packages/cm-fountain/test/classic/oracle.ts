// The byte promise's oracle (Classic Mode design §15.1): a list of elements, each a kind and the
// words a writer means, turned into the Fountain a writer would type by hand, by the spec's rules
// alone. It imports nothing from `src/classic`, so it can't share a mistake with the code it
// checks. Its rules, each from the spec:
//
// - §4.1: a blank line between elements; one break between a name and its speech and inside it,
//   and between the lines of a lyric (§6.1's table: Lyric to Lyric is one break).
// - §4.1: a heading, a name, a transition, and a play's act and scene arrive in capitals.
// - §4.2: a line gets its element's mark only when the parser alone wouldn't read it as that
//   element printing those words. A name and a heading compare only the kind, as a typed `@` or
//   `.` is the same mark. A name is read with a line under it, as it will have one (rule 12).
// - §4.2's last row: Lyric, Centered, Section, Synopsis, and a play's Act and Scene always carry
//   their marks (`~`, `>…<`, `# `, `= `, `#`, `##`), with a mark's own space (Global Constraints).
// - Parenthetical is its `()` (§4.1), and Dialogue and a page break (`===`) have no mark.
// - A page break moves on to the Action line under it (the ruling on Task 9), so a script that
//   ends in one ends in that empty line, which §4.4 leaves at the end of the file.
import { type Block, blockAt, type Doc, parse } from '@drafter/fountain';

/** The elements of §5, as Classic Mode names them: in a play `scene_heading` is a Scene and `action` a stage direction. */
export type ClassicKind =
  | 'act'
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'centered'
  | 'lyric'
  | 'section'
  | 'synopsis'
  | 'page_break';

/** One element as a writer means it: its kind and the words they type, with no marks. */
export interface Spoken {
  kind: ClassicKind;
  words: string;
}

export type OracleTemplate = 'screenplay' | 'stage';

/** The elements typed in capitals (§4.1). */
const CAPITALS: ReadonlySet<ClassicKind> = new Set([
  'scene_heading',
  'character',
  'transition',
  'act',
]);

/** The elements of a speech, which follow a name or each other with one break. */
const SPEECH: ReadonlySet<ClassicKind> = new Set(['character', 'dialogue', 'parenthetical']);

/** What separates an element from the one before it (§4.1, §6.1). */
function between(before: ClassicKind, kind: ClassicKind): string {
  if (SPEECH.has(before) && (kind === 'dialogue' || kind === 'parenthetical')) return '\n';
  if (before === 'lyric' && kind === 'lyric') return '\n';
  return '\n\n';
}

/** The words as they arrive: in capitals where the element is typed in capitals. */
export const arriving = ({ kind, words }: Spoken): string =>
  CAPITALS.has(kind) ? words.toUpperCase() : words;

/** Whether a parsed block is the element `kind` in the template, as the template's role map reads it. */
function isKind(block: Block, kind: ClassicKind, template: OracleTemplate): boolean {
  if (block.kind === 'section') {
    const { depth } = block.sem;
    if (template === 'stage') {
      if (kind === 'act') return depth === 1;
      if (kind === 'scene_heading') return depth === 2;
      return false;
    }
    return kind === 'section';
  }
  if (template === 'stage' && kind === 'scene_heading') return false;
  return block.kind === kind;
}

/** The words a line of a block prints: its text without the mark that made it its kind. */
export function printedAt(block: Block, from: number): string {
  const line = block.lines.find((one) => one.span.from === from);
  const text = (line?.raw ?? '').trim();
  switch (block.kind) {
    case 'lyric':
      return text.slice(1);
    case 'centered':
      return text.slice(1, -1).trim();
    case 'section':
      return text.replace(/^#+/, '').trimStart();
    case 'synopsis':
      return text.slice(1).trimStart();
    default:
      return block.forced && line === block.lines[0] ? text.slice(1) : text;
  }
}

/** What the parser alone reads at `from` in `text`: the block, or null for none (a title page). */
function blockIn(doc: Doc, from: number): Block | null {
  return blockAt(doc, from)?.block ?? null;
}

/**
 * Whether the parser reads `line`, after `before`, as `kind` printing `words`. A name is a cue only
 * with a line under it, and its speech will be under it.
 */
function reads(before: string, line: string, spoken: Spoken, template: OracleTemplate): boolean {
  const under = spoken.kind === 'character' ? '\nx' : '';
  const doc = parse(before + line + under);
  const block = blockIn(doc, before.length);
  if (!block || !isKind(block, spoken.kind, template)) return false;
  if (spoken.kind === 'character' || spoken.kind === 'scene_heading') return true;
  return printedAt(block, before.length) === arriving(spoken);
}

/** The mark that forces each element, where the parser can be asked to read a line some way. */
const FORCING: Partial<Record<ClassicKind, string>> = {
  scene_heading: '.',
  action: '!',
  character: '@',
  transition: '>',
};

/** The line an element is written as, after the text before it. */
function lineFor(before: string, spoken: Spoken, template: OracleTemplate): string {
  const words = arriving(spoken);
  switch (spoken.kind) {
    case 'page_break':
      return '===';
    case 'dialogue':
      return words;
    case 'parenthetical':
      return `(${words})`;
    case 'centered':
      return `>${words}<`;
    case 'lyric':
      return `~${words}`;
    case 'section':
      return `# ${words}`;
    case 'synopsis':
      return `= ${words}`;
    case 'act':
      return `# ${words}`;
    case 'scene_heading':
      if (template === 'stage') return `## ${words}`;
      break;
    default:
      break;
  }
  if (reads(before, words, spoken, template)) return words;
  return `${FORCING[spoken.kind] ?? ''}${words}`;
}

/** Each element's line, where it starts, and the whole text. */
export function layoutOf(
  elements: readonly Spoken[],
  template: OracleTemplate,
): { text: string; lines: { from: number; text: string }[] } {
  let text = '';
  const lines: { from: number; text: string }[] = [];
  elements.forEach((spoken, i) => {
    const before = i === 0 ? '' : text + between((elements[i - 1] as Spoken).kind, spoken.kind);
    const line = lineFor(before, spoken, template);
    lines.push({ from: before.length, text: line });
    text = before + line;
  });
  if (elements.at(-1)?.kind === 'page_break') text += '\n\n';
  return { text, lines };
}

/** The canonical Fountain for a list of elements, by the spec's rules (§4.1, §4.2, §6.1). */
export function fountainOf(elements: readonly Spoken[], template: OracleTemplate): string {
  return layoutOf(elements, template).text;
}

/**
 * What the parser reads back at each element's line: its kind, as the template names it, and the
 * words it prints. A `@` on a name and a `.` on a heading are the mark itself (§4.2).
 */
export function readBack(
  elements: readonly Spoken[],
  template: OracleTemplate,
  text = fountainOf(elements, template),
): { kind: ClassicKind | 'none'; words: string }[] {
  const { lines } = layoutOf(elements, template);
  const doc = parse(text);
  return lines.map(({ from }, i) => {
    const spoken = elements[i] as Spoken;
    const block = blockIn(doc, from);
    if (!block) return { kind: 'none', words: '' };
    const kind = isKind(block, spoken.kind, template) ? spoken.kind : 'none';
    if (block.kind === 'page_break') return { kind, words: '' };
    if (block.kind === 'parenthetical') {
      return { kind, words: printedAt(block, from).replace(/^\(|\)$/g, '') };
    }
    return { kind, words: printedAt(block, from) };
  });
}

/** The words an element should read back as: as they arrive, less a typed `@` or `.` that is the mark. */
export function meant(spoken: Spoken, template: OracleTemplate): string {
  const words = arriving(spoken);
  if (spoken.kind === 'page_break') return '';
  if (spoken.kind === 'character' && words.startsWith('@')) return words.slice(1);
  if (spoken.kind === 'scene_heading' && template === 'screenplay' && words.startsWith('.')) {
    return words.slice(1);
  }
  return words;
}
