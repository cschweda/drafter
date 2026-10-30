import type { Block, Doc, Region, Span } from '@drafter/fountain';
import type { Layout } from '@drafter/layout';
import { bodyEnd, contentEnd, normalizeLabel, readKeyedNote, readNote } from '@drafter/notes';
import { resolveRole, type Template } from '@drafter/templates';
import { TimingTally, wordsIn } from './timing';
import type {
  Opening,
  OutlineItem,
  OutlineNode,
  Scene,
  SceneIndex,
  Section,
  Speech,
  Synopsis,
} from './types';

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

/** What a scene's notes say (`regions` are the ones inside it, in order): its fields, storylines, and marks. */
export function sceneNotes(
  source: string,
  regions: readonly Region[],
): Pick<Scene, 'fields' | 'storylines' | 'marks'> {
  const fields: Scene['fields'] = {};
  const storylines: string[] = [];
  const seen = new Set<string>();
  const marks: Scene['marks'] = [];
  for (const region of regions) {
    if (region.kind !== 'note' || !region.closed) continue;
    const note = readNote(source.slice(region.span.from + 2, region.span.to - 2));
    const head = note.head;
    if (head?.kind === 'mark' && note.body !== '') {
      marks.push({ key: head.key, label: note.body, span: { ...region.span } });
    }
    if (head?.kind !== 'field' || note.body === '') continue;
    fields[head.key] ??= { body: note.body, span: { ...region.span } };
    if (head.key !== 'storyline') continue;
    for (const part of note.body.split(',')) {
      const label = part.trim();
      if (label === '' || seen.has(normalizeLabel(label))) continue;
      seen.add(normalizeLabel(label));
      storylines.push(label);
    }
  }
  return { fields, storylines, marks };
}

/** The speakers' names by the cue's name in capitals: as first typed in the unit. */
type Names = Map<string, string>;

function noteSpeaker(names: Names, block: Block): void {
  if (block.kind !== 'character') return;
  const key = block.sem.name.toUpperCase();
  if (!names.has(key)) names.set(key, block.sem.name);
}

/** A unit's tally, named: its speeches and the words each speaker says, by `names`. */
function spoken(tally: TimingTally, names: Names): Pick<Scene, 'speeches' | 'spokenBy'> {
  const speeches: Speech[] = tally
    .speeches()
    .map(({ key, block, words }) => ({ name: names.get(key) ?? key, block, words }));
  const by = tally.spokenBy();
  // Made with fromEntries, so a name such as `__proto__` is a key like any other.
  const spokenBy = Object.fromEntries([...names].map(([key, name]) => [name, by.get(key) ?? 0]));
  return { speeches, spokenBy };
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
  // Before the first scene, the blocks are tallied as the opening's.
  let opener: TimingTally | null = new TimingTally(template);
  const openerNames: Names = new Map();
  let opening: Opening | null = null;
  for (let i = 0; i < end; i++) {
    const block = blocks[i] as Block;
    const scene = startsScene(template, block);
    if (scene || block.kind === 'section') structural.push(i);
    if (!opener) continue;
    if (scene) {
      opening = openingOf(opener, openerNames);
      opener = null;
      continue;
    }
    noteSpeaker(openerNames, block);
    opener.add(block, i);
  }
  if (opener) opening = openingOf(opener, openerNames);

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
      const speakers: Names = new Map();
      let words = 0;
      const tally = new TimingTally(template);
      for (let i = index; i < next; i++) {
        const b = blocks[i] as Block;
        if (b.kind === 'synopsis')
          synopses.push({ text: b.sem.text, block: i, span: { ...b.span } });
        noteSpeaker(speakers, b);
        words += printedWords(b);
        tally.add(b, i);
      }
      const timing = tally.timing();
      const { speeches, spokenBy } = spoken(tally, speakers);
      // The notes inside the scene. Regions are in source order, as scenes are.
      while (region < regions.length && (regions[region]?.span.from ?? 0) < span.from) region++;
      let past = region;
      while (past < regions.length && (regions[past]?.span.from ?? 0) < span.to) past++;
      const inside = regions.slice(region, past);
      let color: Scene['color'] = null;
      for (const found of inside) {
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
        ...sceneNotes(source, inside),
        speakers: [...speakers.values()],
        words,
        timing,
        spokenBy,
        speeches,
        pages: scenePages,
      };
      for (const o of open) {
        o.section.span.to = unitEnd;
        o.section.scenes++;
        o.section.timing.spoken += timing.spoken;
        o.section.timing.actionLines += timing.actionLines;
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
      timing: { spoken: 0, actionLines: 0 },
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

  return { preamble, items, scenes, sections, tree, opening };
}

/** The opening from its tally, or null when no one speaks in it. */
function openingOf(tally: TimingTally, names: Names): Opening | null {
  if (tally.speeches().length === 0) return null;
  return { ...spoken(tally, names), timing: tally.timing() };
}
