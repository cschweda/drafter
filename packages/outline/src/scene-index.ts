import type { Block, Doc, Span } from '@drafter/fountain';
import type { Layout } from '@drafter/layout';
import { resolveRole, type Template } from '@drafter/templates';
import { readKeyedNote } from './keyed';
import type { OutlineItem, OutlineNode, Scene, SceneIndex, Section, Synopsis } from './types';

// The scene index (Phase 2 design §5.1): a pure function of the parse, the template, and the
// layout when it matches the parse, recomputed after every parse. Nothing is cached between
// calls, so it can never drift from the text.

/** The roles that begin a scene: a screenplay's heading, and a play's (a `##` section). */
const SCENE_ROLES = new Set(['scene_heading', 'scene_heading_play']);

/** Whether `block` begins a scene in `template` (a screenplay's section is an outline marker only). */
export function startsScene(template: Template, block: Block): boolean {
  return (
    (block.kind === 'scene_heading' || block.kind === 'section') &&
    SCENE_ROLES.has(resolveRole(template, block, null))
  );
}

const firstLine = (block: Block) => block.lines[0]?.raw.trimStart() ?? '';

/**
 * The number of blocks that belong to the script's body: the metadata block (the last block, a
 * `/* drafter` boneyard) and a Beat Board block just before it (`/* beat board`) are left out,
 * so no scene or section ever holds them (§5.5, §5.6).
 */
export function bodyEnd(doc: Doc): number {
  const { blocks } = doc;
  let end = blocks.length;
  const last = blocks[end - 1];
  if (last?.kind === 'boneyard' && firstLine(last).startsWith('/* drafter')) end--;
  const board = blocks[end - 1];
  if (board?.kind === 'boneyard' && firstLine(board).startsWith('/* beat board')) end--;
  return end;
}

/**
 * `to` moved back before a CRLF's `\r`: a block's span ends with its last line, `\r` and all, and
 * what Drafter writes goes before the line break, never inside it.
 */
export function contentEnd(source: string, to: number): number {
  return to > 0 && source[to - 1] === '\r' ? to - 1 : to;
}

/**
 * Whether a `/*` in the script isn't closed by a `*\/` of its own: it runs to the end unclosed, or
 * it is closed only by a later boneyard's `*\/` (its text holds another `/*`, such as the metadata
 * block's opener). Either way a scene's span may hold what should never move, so Drafter changes
 * nothing structural until the writer closes it.
 */
export function hasStrayBoneyard(doc: Doc): boolean {
  return doc.regions.some(
    (region) =>
      !region.closed ||
      (region.kind === 'boneyard' &&
        doc.source.slice(region.span.from + 2, region.span.to - 2).includes('/*')),
  );
}

/** The whole lines inside a gap between two blocks (a gap starts and ends inside a line). */
const gapLines = (gap: string) =>
  gap
    .split('\n')
    .slice(1, -1)
    .map((line) => line.replace(/\r$/, ''));

/**
 * Whether a gap between blocks holds a blank line, as Fountain reads one: empty or spaces only, but
 * not exactly two spaces (which joins lines). A heading needs one before it.
 */
export function hasBlankLine(gap: string): boolean {
  return gapLines(gap).some((line) => line.trim() === '' && line !== '  ');
}

/** Whether every line inside a gap is blank as Fountain reads it: nothing in it joins anything. */
export function isPlainGap(gap: string): boolean {
  return gapLines(gap).every((line) => line.trim() === '' && line !== '  ');
}

/** Words in a line of printed text: runs of letters or digits. */
function wordsIn(text: string): number {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

const UNPRINTED = new Set(['section', 'synopsis', 'note', 'boneyard', 'page_break']);

function printedWords(block: Block): number {
  if (UNPRINTED.has(block.kind)) return 0;
  let words = 0;
  for (const line of block.lines) {
    if (line.transparent) continue;
    words += wordsIn(line.inline.map((run) => run.text).join(''));
  }
  return words;
}

function headingText(block: Block): string {
  if (block.kind === 'scene_heading') return block.sem.text || (block.lines[0]?.raw.trim() ?? '');
  if (block.kind === 'section') return block.sem.text;
  return block.lines[0]?.raw.trim() ?? '';
}

/** Where each block starts on the pages, in lines from the top of the first page; null without a matching layout. */
function pageLines(doc: Doc, layout: Layout | null | undefined) {
  if (!layout || layout.index.length !== doc.blocks.length) return null;
  const starts = new Map<number, number>();
  let total = 0;
  for (const page of layout.pages) {
    starts.set(page.number, total);
    total += page.lines.length;
  }
  const body = layout.pages.find((page) => page.number > 0) ?? layout.pages[0];
  const perPage = body?.lines.length ?? 0;
  if (perPage === 0) return null;
  // The line just past the last one that prints anything.
  let end = 0;
  for (const page of [...layout.pages].reverse()) {
    const last = page.lines.findLastIndex((line) => line.runs.length > 0 || line.right);
    if (last >= 0) {
      end = (starts.get(page.number) ?? 0) + last + 1;
      break;
    }
  }
  const at = (index: number) => {
    const found = layout.index[index];
    const start = found ? starts.get(found.page) : undefined;
    return found && start !== undefined
      ? { page: found.page, line: found.line, abs: start + found.line }
      : null;
  };
  return { at, end, perPage };
}

/** The scene index of `doc` (Phase 2 design §5.1). Pages are filled in only from a layout of this same parse. */
export function sceneIndex(doc: Doc, template: Template, layout?: Layout | null): SceneIndex {
  const { blocks, source } = doc;
  const end = bodyEnd(doc);
  const structural: number[] = [];
  for (let i = 0; i < end; i++) {
    const block = blocks[i] as Block;
    if (block.kind === 'section' || startsScene(template, block)) structural.push(i);
  }

  // The preamble: the title page and whatever comes before the first scene or section.
  const firstStructural = structural[0] ?? end;
  const lastPreamble = blocks[firstStructural - 1];
  const preambleFrom = doc.titlePage?.span.from ?? blocks[0]?.span.from;
  const preambleEnd = lastPreamble?.span.to ?? doc.titlePage?.span.to;
  const preambleTo = preambleEnd === undefined ? undefined : contentEnd(source, preambleEnd);
  const preamble: Span | null =
    preambleFrom !== undefined && preambleTo !== undefined && (doc.titlePage || firstStructural > 0)
      ? { from: preambleFrom, to: preambleTo }
      : null;

  const pages = pageLines(doc, layout);
  const regions = doc.regions;
  let region = 0;

  const items: OutlineItem[] = [];
  const scenes: Scene[] = [];
  const sections: Section[] = [];
  const tree: OutlineNode[] = [];
  /** The open sections, outermost first, with their nodes. */
  const open: Array<{ section: Section; node: { item: Section; children: OutlineNode[] } }> = [];

  const close = (depth: number) => {
    while (open.length > 0 && (open[open.length - 1]?.section.depth ?? 0) >= depth) open.pop();
  };
  const place = (node: OutlineNode) => {
    const parent = open[open.length - 1];
    (parent ? parent.node.children : tree).push(node);
  };

  structural.forEach((index, n) => {
    const block = blocks[index] as Block;
    const next = structural[n + 1] ?? end;
    const unitEnd = contentEnd(source, (blocks[next - 1] as Block).span.to);

    if (startsScene(template, block)) {
      if (block.kind === 'section') close(block.sem.depth);
      const span = { from: block.span.from, to: unitEnd };
      const synopses: Synopsis[] = [];
      const speakers = new Map<string, string>();
      let words = 0;
      for (let i = index; i < next; i++) {
        const b = blocks[i] as Block;
        if (b.kind === 'synopsis')
          synopses.push({ text: b.sem.text, block: i, span: { ...b.span } });
        if (b.kind === 'character' && !speakers.has(b.sem.name.toUpperCase())) {
          speakers.set(b.sem.name.toUpperCase(), b.sem.name);
        }
        words += printedWords(b);
      }
      // The first color note inside the scene. Regions are in source order, as scenes are.
      while (region < regions.length && (regions[region]?.span.from ?? 0) < span.from) region++;
      let color: Scene['color'] = null;
      for (let r = region; r < regions.length; r++) {
        const found = regions[r];
        if (!found || found.span.from >= span.to) break;
        if (found.kind !== 'note' || !found.closed || color) continue;
        const keyed = readKeyedNote(source.slice(found.span.from + 2, found.span.to - 2));
        if (keyed?.key === 'color' && keyed.body !== '') {
          color = { value: keyed.body.toLowerCase(), span: { ...found.span } };
        }
      }
      let scenePages: Scene['pages'] = null;
      if (pages) {
        const from = pages.at(index);
        const to = next < end ? pages.at(next) : { abs: pages.end };
        if (from && to) {
          const lines = to.abs - from.abs;
          scenePages = {
            page: from.page,
            line: from.line + 1,
            eighths: Math.max(1, Math.round((lines * 8) / pages.perPage)),
          };
        }
      }
      const scene: Scene = {
        kind: 'scene',
        ordinal: scenes.length + 1,
        number: block.kind === 'scene_heading' ? block.sem.number : null,
        block: index,
        heading: headingText(block),
        span,
        sections: open.map((o) => o.section.block),
        synopses,
        color,
        speakers: [...speakers.values()],
        words,
        pages: scenePages,
      };
      for (const o of open) {
        o.section.span.to = unitEnd;
        o.section.scenes++;
        o.section.eighths =
          o.section.eighths === null || scene.pages === null
            ? null
            : o.section.eighths + scene.pages.eighths;
      }
      place({ item: scene });
      scenes.push(scene);
      items.push(scene);
      return;
    }

    if (block.kind !== 'section') return;
    close(block.sem.depth);
    const section: Section = {
      kind: 'section',
      block: index,
      depth: block.sem.depth,
      title: headingText(block),
      span: { from: block.span.from, to: unitEnd },
      introEnd: unitEnd,
      parent: open[open.length - 1]?.section.block ?? null,
      scenes: 0,
      eighths: pages ? 0 : null,
    };
    for (const o of open) o.section.span.to = unitEnd;
    const node = { item: section, children: [] as OutlineNode[] };
    place(node);
    open.push({ section, node });
    sections.push(section);
    items.push(section);
  });

  // A section with no scenes has no length to show.
  for (const section of sections) if (section.scenes === 0) section.eighths = null;

  return { preamble, items, scenes, sections, tree };
}
