import type { Block, BlockKind, Doc, Line, TextChange } from '@drafter/fountain';
import { type Role, resolveRole, type Template } from '@drafter/templates';
import type { LintDiagnostic, Rule } from '../types';

// manual-contd (technical design §9): a typed (CONT'D) that the layout would add anyway (§5.4),
// so typing it is no use. The rule reports a typed one only where the layout adds one.

const CONTD = /\(\s*CONT['’]?D\s*\)/i;
const EACH_CONTD = new RegExp(CONTD, 'gi');

/** The blocks that follow a cue and belong to its speech. */
const SPEECH_PARTS: ReadonlySet<BlockKind> = new Set(['parenthetical', 'dialogue', 'lyric']);

/** Whether the block follows the one before it with no blank line between them. */
function adjacent(block: Block): boolean {
  const first = block.leading.indexOf('\n');
  return first !== -1 && block.leading.indexOf('\n', first + 1) === -1;
}

/**
 * The cues, by block index, of the speeches that the layout gives a continued-speech (CONT'D)
 * (technical design §5.4 and §5.5). This follows `#entries` in `@drafter/layout` step by step,
 * and a test lays generated scripts out to check that the two agree. A speech continues when
 * the template continues speeches after action and its cue names the speaker of the scene's
 * previous dialogue group, except that:
 * - the speaker is forgotten at each scene heading;
 * - a dual cue (`^`) that pairs with the speech before it gets none, and neither does that
 *   speech, and nobody has spoken last after the pair. A dual cue pairs only with a speech that
 *   is the latest thing the layout set down, not paired already, so a page break or a block that
 *   prints between them stops the pair. Then the dual cue is laid out like any other cue.
 */
function continuedCues(doc: Doc, template: Template): Set<number> {
  const { blocks } = doc;
  // A block's role depends on the one before it, so every block is resolved, in order.
  const roles: Role[] = [];
  for (const block of blocks) roles.push(resolveRole(template, block, roles.at(-1) ?? null));

  /** Whether a block that is no cue prints, which makes it something a dual cue can't pair across. */
  const prints = (i: number): boolean => {
    const role = roles[i] as Role;
    if (role === 'omit' || role === 'page_break') return false;
    if (role !== 'disabled') return true;
    // A disabled element prints the way action does, if the template prints action.
    const action = resolveRole(template, { kind: 'action' } as Block, roles[i - 1] ?? null);
    return template.roles[action] !== undefined;
  };

  const continued = new Set<number>();
  let speaker: string | null = null; // who spoke the last dialogue group in this scene
  // The latest thing the layout set down: a page break, a block that prints, or a speech.
  let last: { type: 'break' | 'block' } | { type: 'speech'; cue: number; paired: boolean } | null =
    null;
  for (let i = 0; i < blocks.length; ) {
    const block = blocks[i] as Block;
    if (block.kind === 'scene_heading') speaker = null;
    if (block.kind === 'page_break') {
      last = { type: 'break' };
      i++;
      continue;
    }
    if (block.kind !== 'character') {
      if (prints(i)) last = { type: 'block' };
      i++;
      continue;
    }
    let j = i + 1;
    while (
      j < blocks.length &&
      SPEECH_PARTS.has((blocks[j] as Block).kind) &&
      adjacent(blocks[j] as Block)
    ) {
      j++;
    }
    const cue = i;
    const name = block.sem.name.trim().toUpperCase();
    i = j;
    if (block.sem.dual && last?.type === 'speech' && !last.paired) {
      // Dual dialogue neither gets nor triggers a continued-speech (CONT'D).
      continued.delete(last.cue);
      last = { type: 'speech', cue, paired: true };
      speaker = null;
      continue;
    }
    if (template.dialogueSplit.contdAfterAction && speaker === name) continued.add(cue);
    speaker = name;
    last = { type: 'speech', cue, paired: false };
  }
  return continued;
}

const isSpaceOrTab = (ch: string) => ch === ' ' || ch === '\t';

/**
 * The changes that take every (CONT'D) out of a cue line, each with the spaces and tabs before
 * it. Null when they can't be made cleanly:
 * - The cue's printed text isn't one stretch of the source, because a note or a boneyard sits
 *   inside it. Positions in the text no longer match the source, and a cut could take the note.
 * - The cue holds a carriage return of its own. Cutting next to one can join it to a line feed
 *   and change the file's line endings.
 */
function removals(line: Line): TextChange[] | null {
  // A cue line prints as a single run, from its first printed character to its last.
  const [run, ...more] = line.inline;
  if (!run || more.length > 0 || run.span.to - run.span.from !== run.text.length) return null;
  if (run.text.includes('\r')) return null;
  const changes: TextChange[] = [];
  for (const match of run.text.matchAll(EACH_CONTD)) {
    let from = match.index;
    while (from > 0 && isSpaceOrTab(run.text.charAt(from - 1))) from--;
    changes.push({
      from: run.span.from + from,
      to: run.span.from + match.index + match[0].length,
      insert: '',
    });
  }
  return changes.length > 0 ? changes : null;
}

export const manualContd: Rule = {
  id: 'manual-contd',
  severity: 'info',
  run: ({ doc, template }) => {
    const found: LintDiagnostic[] = [];
    // The cues the layout continues. Worked out once, by the first cue with a typed (CONT'D).
    let continued: Set<number> | undefined;
    for (let i = 0; i < doc.blocks.length; i++) {
      const block = doc.blocks[i] as Block;
      if (block.kind !== 'character') continue;
      const { name, extension } = block.sem;
      if (extension === null || !CONTD.test(extension)) continue;
      continued ??= continuedCues(doc, template);
      if (!continued.has(i)) continue;
      const line = block.lines[0] as Line;
      const diagnostic: LintDiagnostic = {
        ruleId: manualContd.id,
        severity: manualContd.severity,
        span: { ...line.span },
        message: `Drafter adds (CONT'D) itself when a speech continues, so there's no need to type it after ${name}.`,
      };
      const changes = removals(line);
      if (changes) diagnostic.fix = { title: "Remove (CONT'D)", changes };
      found.push(diagnostic);
    }
    return found;
  },
};
