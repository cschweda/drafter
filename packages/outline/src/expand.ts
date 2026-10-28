import type { Block, Doc, Span, TextChange } from '@drafter/fountain';
import type { Template } from '@drafter/templates';
import { safeLine } from './keyed';
import { lineBreakOf } from './move';
import { bodyEnd, contentEnd, hasStrayBoneyard, sceneIndex, startsScene } from './scene-index';

// Expand outline (Phase 2 design §6.5): outline lines become scene stubs. A stub is a stand-in
// heading, a blank line, and the line as its synopsis. The heading is always the same, never a
// guess from the words, and the `stub-heading` lint rule lists the stubs still holding it.

/** A screenplay stub's heading. `@drafter/lint`'s `stub-heading` looks for it. */
export const STUB_HEADING = 'INT. LOCATION - DAY';
/** A play's stub heading: a scene is a `##` section there. */
export const STAGE_STUB = '## New scene';

const ITEM = /^\s*-\s+(.*\S)\s*$/;

/** Whether `template` makes a `##` section a scene: a play. */
function isPlay(template: Template): boolean {
  const probe = { kind: 'section', sem: { depth: 2, text: '' } } as unknown as Block;
  return startsScene(template, probe);
}

const stub = (heading: string, text: string, nl: string) => `${heading}${nl}${nl}= ${text}`;

/**
 * The changes that turn every `=` line and every `- ` list paragraph in `range` that isn't in a
 * scene into scene stubs. Sections stay, and so does a synopsis right under a section heading (the
 * section's own). A list paragraph only partly made of items is left as it is. The line's words go
 * in as they are, notes and boneyard included. Nothing while a `/*` is unclosed. One transaction's
 * worth of changes.
 */
export function expandOutline(doc: Doc, template: Template, range: Span): TextChange[] {
  if (hasStrayBoneyard(doc)) return [];
  const { source } = doc;
  const nl = lineBreakOf(source);
  const heading = isPlay(template) ? STAGE_STUB : STUB_HEADING;
  const index = sceneIndex(doc, template);
  const inScene = (block: Block) =>
    index.scenes.some((s) => block.span.from >= s.span.from && block.span.from < s.span.to);
  const changes: TextChange[] = [];
  const end = bodyEnd(doc);
  for (let i = 0; i < end; i++) {
    const block = doc.blocks[i] as Block;
    const to = contentEnd(source, block.span.to);
    if (to < range.from || block.span.from > range.to) continue;
    if (inScene(block)) continue;
    // A note or boneyard over more than one line would be split by the stubs: left alone.
    const spansLines = doc.regions.some(
      (r) =>
        r.span.from < to &&
        r.span.to > block.span.from &&
        source.slice(r.span.from, r.span.to).includes('\n'),
    );
    if (spansLines) continue;
    let texts: string[] | null = null;
    // A synopsis right under a section heading is the section's own, not a scene to be.
    if (block.kind === 'synopsis' && doc.blocks[i - 1]?.kind === 'section') continue;
    if (block.kind === 'synopsis') {
      texts = block.lines.map((line) => line.raw.replace(/^\s*=\s*/, '').trim());
    } else if (block.kind === 'action') {
      const items = block.lines.map((line) => ITEM.exec(line.raw.replace(/\r$/, ''))?.[1]);
      if (items.every((item) => item !== undefined)) texts = items as string[];
    }
    if (!texts) continue;
    const stubs = texts
      .filter((t) => t !== '')
      .map((t) => stub(heading, t, nl))
      .join(nl + nl);
    if (stubs === '') continue;
    // A heading needs a blank line before it, and the next block one after the synopsis if it had
    // none before (a note under the line stays in the stub's header).
    const before = i > 0 && block.leading === nl ? nl : '';
    changes.push({ from: block.span.from, to, insert: before + stubs });
  }
  return changes;
}

/** Markdown inline marks that aren't Fountain's: links and images keep their words, code its text. */
function plainInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1');
}

/**
 * A Markdown outline as a screenplay's body (design §6.5): a first-line `#` heading is the title;
 * headings become sections of the same depth; each list item a stub; each paragraph a synopsis.
 * Code blocks are skipped. Nothing from the writer's words can open a note or a boneyard.
 */
export function scriptFromMarkdown(markdown: string): { title: string | null; body: string } {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const parts: string[] = [];
  let title: string | null = null;
  let seenText = false;
  let fence: string | null = null;
  /** What the lines being read add up to: an item or a paragraph, still open. */
  let open: { kind: 'item' | 'para'; words: string[] } | null = null;

  const flush = () => {
    if (!open) return;
    const text = safeLine(plainInline(open.words.join(' ')));
    if (text !== '')
      parts.push(open.kind === 'item' ? stub(STUB_HEADING, text, '\n') : `= ${text}`);
    open = null;
  };

  for (const line of lines) {
    const fenceMark = /^\s*(```|~~~)/.exec(line)?.[1];
    if (fence) {
      if (fenceMark === fence) fence = null;
      continue;
    }
    if (fenceMark) {
      flush();
      fence = fenceMark;
      continue;
    }
    if (line.trim() === '') {
      flush();
      continue;
    }
    const headingMatch = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (headingMatch) {
      flush();
      const text = safeLine(plainInline(headingMatch[2] ?? ''));
      const depth = (headingMatch[1] ?? '#').length;
      if (!seenText && depth === 1 && title === null) title = text;
      else if (text !== '') parts.push(`${'#'.repeat(depth)} ${text}`);
      seenText = true;
      continue;
    }
    seenText = true;
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      flush();
      open = { kind: 'item', words: [item[1] ?? ''] };
      continue;
    }
    // An indented line goes on with the item above it; any other line goes on with a paragraph,
    // or starts one.
    const words = line.trim().replace(/^>\s?/, '');
    if (open?.kind === 'item' && /^\s/.test(line)) open.words.push(words);
    else if (open?.kind === 'para') open.words.push(words);
    else {
      flush();
      open = { kind: 'para', words: [words] };
    }
  }
  flush();
  return { title, body: parts.length > 0 ? `${parts.join('\n\n')}\n` : '' };
}
