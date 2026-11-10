import {
  type Block,
  type Doc,
  type DrafterMeta,
  metadataSpan,
  parse,
  setMeta,
  type TextChange,
} from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { resolveRole, type Template } from '@drafter/templates';
import { rebaseAnchors } from './anchors';
import { decodeBaseline, encodeBaseline } from './baseline';
import { headerOf, MAX_HEADER, productionMeta, readProduction } from './block';
import { closeSet } from './marks';
import { compareSceneNumbers, provisionalNumbers } from './numbers';
import { pageMapOf } from './pages';
import { nextSetName, REVISION_COLORS } from './sets';
import type { Production, ProductionSet } from './types';

// The writer's production actions (design §6.4, §7). Each returns the changes to the original
// text, sorted and not overlapping, for the caller to apply as one undo step: scene numbers written
// into headings, and the `/* drafter */` block rewritten. Nothing else in the text is touched,
// except by Omit scene, which replaces the one scene it is asked to.

/**
 * The script without its `/* drafter *\/` block, so the block (which holds the baseline itself)
 * never takes part in a baseline, a fingerprint, a mark, or a page's line index. The blank lines
 * around the block stay; only the block goes.
 */
export function scriptText(text: string): string {
  const span = metadataSpan(parse(text));
  return span ? text.slice(0, span.from) + text.slice(span.to) : text;
}

/** Whether `template` prints a scene heading as one: a screenplay, not a play (design §3). */
export function numbersScenes(template: Template): boolean {
  const probe = {
    kind: 'scene_heading',
    forced: false,
    sem: { text: '', prefix: null, location: '', time: null, number: null },
  } as unknown as Block;
  return resolveRole(template, probe, null) === 'scene_heading';
}

type Heading = Extract<Block, { kind: 'scene_heading' }>;

const headingsOf = (doc: Doc): Heading[] =>
  doc.blocks.filter((b): b is Heading => b.kind === 'scene_heading');

function lineBreakOf(source: string): string {
  const at = source.indexOf('\n');
  return at > 0 && source[at - 1] === '\r' ? '\r\n' : '\n';
}

/** The change that ends a heading's line with ` #number#`, in place of any trailing spaces. */
function numberEdit(heading: Heading, number: string): TextChange {
  const line = heading.lines[0] as Heading['lines'][number];
  const raw = line.raw.endsWith('\r') ? line.raw.slice(0, -1) : line.raw;
  const content = raw.replace(/\s+$/, '');
  return {
    from: line.span.from + content.length,
    to: line.span.from + raw.length,
    insert: ` #${number}#`,
  };
}

function applyChanges(text: string, changes: readonly TextChange[]): string {
  let out = '';
  let at = 0;
  for (const c of changes) {
    out += text.slice(at, c.from) + c.insert;
    at = c.to;
  }
  return out + text.slice(at);
}

/**
 * Numbers for the headings that have none, after the lock: their A-numbers between the written
 * ones. Returns the heading edits and every issued number merged into `issued` in script order.
 */
function aNumbers(doc: Doc, issued: readonly string[]): { edits: TextChange[]; numbers: string[] } {
  const heads = headingsOf(doc);
  const written = heads.map((h) => h.sem.number);
  // Once issued, a number never revives, even when its scene was deleted (design §7.1).
  const filled = provisionalNumbers(written, new Set(issued));
  const edits: TextChange[] = [];
  const numbers = [...issued];
  const inScript = new Set(filled);
  for (let i = 0; i < heads.length; i++) {
    if (written[i] !== null) continue;
    const number = filled[i] as string;
    edits.push(numberEdit(heads[i] as Heading, number));
    if (numbers.includes(number)) continue;
    // Just after the scene before it, which is already in the list, and after any deleted scene's
    // number there that sorts before it.
    const previous = i > 0 ? filled[i - 1] : undefined;
    let at = (previous === undefined ? -1 : numbers.indexOf(previous)) + 1;
    while (
      at < numbers.length &&
      !inScript.has(numbers[at] as string) &&
      compareSceneNumbers(numbers[at] as string, number) < 0
    ) {
      at++;
    }
    numbers.splice(at, 0, number);
  }
  return { edits, numbers };
}

/**
 * The heading edits plus the block's change, both against `text`. `build` is given the script text
 * the result will have (block left out) and returns the production to write, or null to remove it.
 * An unclosed `/*` gets nothing, since `setMeta` won't write a block past it.
 */
async function finish(
  text: string,
  edits: TextChange[],
  build: (script: string, meta: DrafterMeta | null) => Promise<Production | null>,
): Promise<TextChange[]> {
  const mid = applyChanges(text, edits);
  const midDoc = parse(mid);
  if (midDoc.regions.some((r) => !r.closed)) return [];
  // The script text doesn't depend on what the block holds, only on whether there is one; a probe
  // key makes setMeta write (or add) a block, so the text around it is what the result will be.
  const probe = { ...midDoc.meta, v: midDoc.meta?.v ?? 1, __probe: true };
  const script = scriptText(applyChanges(mid, setMeta(midDoc, probe)));
  const production = await build(script, midDoc.meta);
  const block = setMeta(midDoc, productionMeta(midDoc.meta, production));
  if (block.length === 0) return edits;
  // The block is the last thing in the text, after every heading, so it only moves by what the
  // heading edits added.
  const delta = edits.reduce((d, c) => d + c.insert.length - (c.to - c.from), 0);
  const moved = block.map((c) => ({ ...c, from: c.from - delta, to: c.to - delta }));
  const lastEnd = edits.at(-1)?.to ?? 0;
  if ((moved[0]?.from ?? 0) < lastEnd) {
    // Not expected; correctness first: one change for the whole text.
    return [{ from: 0, to: text.length, insert: applyChanges(mid, block) }];
  }
  return [...edits, ...moved];
}

/**
 * A set's draft id: given as is, or worked out from the script text the action leaves (block left
 * out), which is the text the caller freezes as that draft (its hash).
 */
export type DraftId = string | ((script: string) => string | Promise<string>);

const idOf = async (draftId: DraftId, script: string): Promise<string> =>
  typeof draftId === 'string' ? draftId : draftId(script);

const setOf = (name: string, today: string, draftId: string): ProductionSet => ({
  name,
  color: REVISION_COLORS[name.replace(/^Double /, '')] ?? (REVISION_COLORS.White as string),
  date: today,
  draft: draftId,
});

/** The locked White draft, closed with no marks, and an open Blue set. */
const freshSets = (today: string, draftId: string): ProductionSet[] => [
  { ...setOf('White', today, draftId), lines: [], gaps: [] },
  setOf('Blue', today, draftId),
];

/**
 * Locks pages and scene numbers (design §7). In a screenplay, every heading without a number gets
 * the next unused integer past the heading before it, from `firstScene` up; written numbers are
 * kept (unnumbered, #7#, unnumbered gives 1, 7, 8). Records the issued numbers,
 * the page map of the text as now laid out, White closed and Blue open, and the baseline.
 * An already locked script gets no changes. A template that can't be laid out throws, as paginate
 * does.
 */
export async function lock(
  text: string,
  template: Template,
  opts: { today: string; draftId: DraftId; firstScene: number },
): Promise<TextChange[]> {
  const doc = parse(text);
  if (readProduction(doc.meta)) return [];
  const edits: TextChange[] = [];
  const numbers: string[] = [];
  if (numbersScenes(template)) {
    const heads = headingsOf(doc);
    const used = new Set(heads.map((h) => h.sem.number).filter((n): n is string => n !== null));
    // The next number is past the heading before it (a written #7# is followed by 8), never
    // below firstScene, and never one already written.
    let next = opts.firstScene;
    for (const heading of heads) {
      let number = heading.sem.number;
      if (number === null) {
        while (used.has(String(next))) next++;
        number = String(next);
        used.add(number);
        edits.push(numberEdit(heading, number));
      }
      const digits = /\d+/.exec(number);
      next = Math.max(next, digits ? Number(digits[0]) + 1 : next);
      numbers.push(number);
    }
  }
  return finish(text, edits, async (script) => ({
    lockedAt: opts.today,
    firstScene: opts.firstScene,
    numbers,
    pages: pageMapOf(paginate(parse(script), template), script),
    sets: freshSets(opts.today, await idOf(opts.draftId, script)),
    baseline: await encodeBaseline(script),
  }));
}

/** Whether to write A-numbers: the template says, else whether the lock numbered any scene. */
const writesNumbers = (production: Production, template?: Template) =>
  template ? numbersScenes(template) : production.numbers.length > 0;

/**
 * Closes the open set, keeping its marks as fingerprints, and opens the next (design §6.4). In a
 * screenplay, new scenes get their A-numbers first, so the closed set's marks and the new
 * baseline both see them. The pages are re-based onto the new baseline. No changes when the
 * script isn't locked or its baseline can't be read.
 *
 * `template` decides whether scenes are numbered; without it, a lock that numbered scenes did.
 */
export async function startNextSet(
  text: string,
  today: string,
  draftId: DraftId,
  template?: Template,
): Promise<TextChange[]> {
  const doc = parse(text);
  const production = readProduction(doc.meta);
  if (!production) return [];
  const oldBaseline = await decodeBaseline(production.baseline);
  if (oldBaseline === null) return [];
  const { edits, numbers } = writesNumbers(production, template)
    ? aNumbers(doc, production.numbers)
    : { edits: [], numbers: production.numbers };
  return finish(text, edits, async (script) => {
    const open = production.sets.at(-1);
    const closed = open ? [await closeSet(oldBaseline, script, open)] : [];
    const earlier = production.sets.slice(0, -1);
    const name = nextSetName(production.sets);
    return {
      ...production,
      numbers,
      pages: rebaseAnchors(production.pages, oldBaseline, script),
      sets: [...earlier, ...closed, setOf(name, today, await idOf(draftId, script))],
      baseline: await encodeBaseline(script),
    };
  });
}

/** Writes the A-numbers of new scenes into their headings and records them (design §7.1). */
export async function writeSceneNumbers(text: string, template?: Template): Promise<TextChange[]> {
  const doc = parse(text);
  const production = readProduction(doc.meta);
  if (!production || !writesNumbers(production, template)) return [];
  const { edits, numbers } = aNumbers(doc, production.numbers);
  if (edits.length === 0) return [];
  return finish(text, edits, async () => ({ ...production, numbers }));
}

const NONE = { changes: [] as TextChange[], removed: '' };

/**
 * Replaces scene `sceneIndex` (0-based, counting scene headings) with `.OMITTED #n#` and a blank
 * line, keeping its number (design §7.1). The scene runs from its heading through the line before
 * the next heading, or the block, or the end. `removed` is the scene's text, for the caller to keep
 * as a cut. Nothing for an unlocked script, a stage play, a scene without a number, or one already
 * omitted.
 */
export async function omitScene(
  text: string,
  sceneIndex: number,
  template: Template,
): Promise<{ changes: TextChange[]; removed: string }> {
  // A play's scenes are sections, never omitted, even a heading numbered by hand (design §3).
  if (!numbersScenes(template)) return NONE;
  const doc = parse(text);
  if (!readProduction(doc.meta)) return NONE;
  const heads = headingsOf(doc);
  const heading = heads[sceneIndex];
  const number = heading?.sem.number;
  if (!heading || !number) return NONE;
  const from = heading.span.from;
  const to = heads[sceneIndex + 1]?.span.from ?? metadataSpan(doc)?.from ?? text.length;
  const nl = lineBreakOf(text);
  const insert = `.OMITTED #${number}#${nl}${to === text.length ? '' : nl}`;
  const removed = text.slice(from, to);
  if (removed === insert) return NONE;
  return { changes: [{ from, to, insert }], removed };
}

/**
 * Empties every set's marks and keeps the lock (design §6.4): a fresh White closed and Blue open,
 * the current text as the baseline, the pages re-based onto it. Nothing when the script isn't
 * locked or its baseline can't be read (the pages couldn't follow).
 */
export async function clearMarks(
  text: string,
  today: string,
  draftId: DraftId,
): Promise<TextChange[]> {
  const production = readProduction(parse(text).meta);
  if (!production) return [];
  const oldBaseline = await decodeBaseline(production.baseline);
  if (oldBaseline === null) return [];
  return finish(text, [], async (script) => ({
    ...production,
    pages: rebaseAnchors(production.pages, oldBaseline, script),
    sets: freshSets(today, await idOf(draftId, script)),
    baseline: await encodeBaseline(script),
  }));
}

/**
 * Keeps `header` in the block as the production's own revision header (design §8), trimmed; null
 * or blank removes it, so the default ("Blue Revision — 12 November 2026") prints again. Nothing
 * for an unlocked script, or when the block already says so. A header the block wouldn't read
 * back (past `MAX_HEADER` characters, or with a control character) throws, so it is never written
 * only to be ignored.
 */
export async function setHeader(text: string, header: string | null): Promise<TextChange[]> {
  const production = readProduction(parse(text).meta);
  if (!production) return [];
  const wanted = header === null || header.trim() === '' ? undefined : headerOf(header);
  if (header !== null && header.trim() !== '' && wanted === undefined) {
    throw new Error(
      `A revision header is one line of up to ${MAX_HEADER} characters, with no control characters.`,
    );
  }
  if (wanted === production.header) return [];
  const { header: _, ...rest } = production;
  return finish(text, [], async () => (wanted === undefined ? rest : { ...rest, header: wanted }));
}

/**
 * Removes the production block and nothing else (design §6.4): written scene numbers and
 * `.OMITTED` headings stay in the text. A production block that can't be read is removed too.
 */
export async function unlock(text: string): Promise<TextChange[]> {
  const meta = parse(text).meta;
  // Even a block that can't be read is removed: unlocking is the way out of it.
  if (!meta || !Object.hasOwn(meta, 'production')) return [];
  return finish(text, [], async () => null);
}
