import type { Block, InlineRun, Span, TextChange } from '@drafter/fountain';
import { courierPrimeHas, titleKeyPrints } from '@drafter/layout';
import { type Role, resolveRole } from '@drafter/templates';
import type { LintDiagnostic, Rule } from '../types';

// The rules in this file are about text that is read correctly, by the spec, and still isn't
// what the writer meant: words that don't print, or print as something else, with nothing on the
// page to say so. Each says what happened and, where one edit settles it, offers the edit.

/** Blocks whose words print in a script: a section or synopsis line among them is likely text. */
const PRINTED: ReadonlySet<Block['kind']> = new Set([
  'action',
  'character',
  'dialogue',
  'parenthetical',
  'lyric',
  'centered',
  'transition',
]);

/** How many line breaks a block's leading holds: one means it sits right under the line before. */
function breaksIn(leading: string): number {
  let n = 0;
  for (let i = 0; i < leading.length; i++) if (leading.charCodeAt(i) === 10) n++;
  return n;
}

/**
 * marker-in-paragraph: a line that starts with `#` or `=` is a section or a synopsis wherever it
 * is, and neither prints. Right under a line of a speech or a paragraph ("#1 is the best.", "= 4,
 * she says.") it was almost certainly meant as words, and it cuts the speech in two. So is a `#`
 * with a number straight after it ("#1 DAD mug"). The fix puts a backslash first, which prints
 * the mark.
 */
export const markerInParagraph: Rule = {
  id: 'marker-in-paragraph',
  severity: 'warning',
  run: ({ doc }) => {
    const found: LintDiagnostic[] = [];
    doc.blocks.forEach((block, i) => {
      if (block.kind !== 'section' && block.kind !== 'synopsis') return;
      const line = block.lines[0];
      if (!line) return;
      const before = doc.blocks[i - 1];
      const inside =
        before !== undefined && PRINTED.has(before.kind) && breaksIn(block.leading) === 1;
      const numbered = block.kind === 'section' && /^\s*#+\d/.test(line.raw);
      if (!inside && !numbered) return;
      const mark = block.kind === 'section' ? '#' : '=';
      const what = block.kind === 'section' ? 'a section' : 'a synopsis';
      const at = line.span.from + (line.raw.length - line.raw.trimStart().length);
      found.push({
        ruleId: markerInParagraph.id,
        severity: markerInParagraph.severity,
        span: { ...block.span },
        message: `This line starts with "${mark}", so it is read as ${what} and doesn't print. To print it, put a backslash first: \\${mark}`,
        fix: {
          title: `Put a backslash before the ${mark}`,
          changes: [{ from: at, to: at, insert: '\\' }],
        },
      });
    });
    return found;
  },
};

const HAS_UPPER = /\p{Lu}/u;
const HAS_LOWER = /\p{Ll}/u;

/**
 * transition-trailing-space: `CUT TO:` with a space after the colon is action, which is the
 * spec's way to write such a line as action, and a space nobody can see is easy to leave behind.
 * Advice, since it may be meant; the fix takes the space away.
 */
export const transitionTrailingSpace: Rule = {
  id: 'transition-trailing-space',
  severity: 'info',
  run: ({ doc }) => {
    const found: LintDiagnostic[] = [];
    for (const block of doc.blocks) {
      if (block.kind !== 'action' || block.forced || block.lines.length !== 1) continue;
      const line = block.lines[0];
      if (!line || line.transparent) continue;
      const raw = line.raw.endsWith('\r') ? line.raw.slice(0, -1) : line.raw;
      // Spaces and tabs only: a stray carriage return is a line ending, and not this rule's.
      // Walked back from the end: a pattern for the trailing run started again from every space
      // of a long run in the middle of the line (red/blue audit of 23 November 2026, W3).
      let end = raw.length;
      while (end > 0 && (raw[end - 1] === ' ' || raw[end - 1] === '\t')) end--;
      const kept = raw.slice(0, end);
      if (kept.length === raw.length || !kept.endsWith('TO:')) continue;
      if (!HAS_UPPER.test(kept) || HAS_LOWER.test(kept)) continue;
      const change: TextChange = {
        from: line.span.from + kept.length,
        to: line.span.from + raw.length,
        insert: '',
      };
      found.push({
        ruleId: transitionTrailingSpace.id,
        severity: transitionTrailingSpace.severity,
        span: { ...block.span },
        message: `"${kept.trim()}" has a space after it, so it prints as action. Take the space away to make it a transition.`,
        fix: { title: 'Remove the space after the colon', changes: [change] },
      });
    }
    return found;
  },
};

/**
 * title-key-not-printed: the title page prints Title, Credit, Author, Source, Contact, and Draft
 * date. Any other key (Copyright, Notes, Revision, one of the writer's own) is kept in the file
 * and printed nowhere. `Logline` is Drafter's own, for the Story Atlas, so it is left alone.
 */
export const titleKeyNotPrinted: Rule = {
  id: 'title-key-not-printed',
  severity: 'info',
  run: ({ doc }) => {
    const found: LintDiagnostic[] = [];
    for (const field of doc.titlePage?.fields ?? []) {
      const key = field.key.trim();
      if (titleKeyPrints(key) || key.toLowerCase() === 'logline') continue;
      if (field.value.every((value) => value.trim() === '')) continue;
      found.push({
        ruleId: titleKeyNotPrinted.id,
        severity: titleKeyNotPrinted.severity,
        span: { ...field.span },
        message: `"${key}" doesn't print on the title page. Title, Credit, Author, Source, Contact, and Draft date do.`,
      });
    }
    return found;
  },
};

/** How many of the characters the message names. */
const NAMED = 5;

/** Characters the page never draws: they become a space, or nothing, whatever the font. */
function drawn(codePoint: number): boolean {
  if (codePoint <= 0x20 || codePoint === 0x7f || codePoint === 0x85 || codePoint === 0xa0) {
    return false;
  }
  if (codePoint === 0x2028 || codePoint === 0x2029 || codePoint === 0xfeff) return false;
  // Half of a surrogate pair prints as the replacement mark, which says so by itself.
  return codePoint < 0xd800 || codePoint > 0xdfff;
}

/**
 * not-in-font: a script page is set in Courier Prime, which has Latin letters with their accents
 * and little else. A character it has no shape for (Cyrillic, Greek, Hebrew, Arabic, Chinese,
 * Japanese, Korean, an emoji) prints as an empty box in the PDF, though the screen shows it. One
 * report for the script, at the first such character, with how many there are and a few of them.
 */
export const notInFont: Rule = {
  id: 'not-in-font',
  severity: 'warning',
  run: ({ doc, template }) => {
    let count = 0;
    let first: Span | null = null;
    const named = new Set<string>();
    const scan = (runs: readonly InlineRun[]) => {
      for (const run of runs) {
        const { text } = run;
        for (let i = 0; i < text.length; ) {
          const codePoint = text.codePointAt(i) as number;
          const size = codePoint > 0xffff ? 2 : 1;
          if (drawn(codePoint) && !courierPrimeHas(codePoint)) {
            count++;
            first ??= { from: run.span.from + i, to: run.span.from + i + size };
            if (named.size < NAMED) named.add(text.slice(i, i + size));
          }
          i += size;
        }
      }
    };
    for (const field of doc.titlePage?.fields ?? []) {
      if (titleKeyPrints(field.key)) for (const runs of field.runs) scan(runs);
    }
    let prev: Role | null = null;
    for (const block of doc.blocks) {
      const role = resolveRole(template, block, prev);
      prev = role;
      if (role === 'omit' || role === 'page_break') continue;
      for (const line of block.lines) if (!line.transparent) scan(line.inline);
    }
    if (first === null) return [];
    const some = [...named].join(' ');
    const many = count === 1 ? '1 character' : `${count} characters`;
    return [
      {
        ruleId: notInFont.id,
        severity: notInFont.severity,
        span: first,
        message: `Drafter's script font, Courier Prime, has no shape for ${many} in this script (${some}${count > named.size ? ' …' : ''}). They show on screen, but print as empty boxes in the PDF.`,
      },
    ];
  },
};
