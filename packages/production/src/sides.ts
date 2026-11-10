import { castOf } from '@drafter/cast';
import type { Doc } from '@drafter/fountain';
import type { Layout, LayoutLine, Page } from '@drafter/layout';
import { type Scene, sceneIndex } from '@drafter/outline';
import type { Template } from '@drafter/templates';

// Sides (production design §10): one actor's pages. The pages any ticked scene is on, in order, at
// their own labels, with each stretch of the other scenes' lines on them crossed out.

/** A scene that was cut and kept as a number: `.OMITTED #5#`. Nobody is cast in it. */
const omitted = (scene: Scene) =>
  scene.heading.trim().toUpperCase() === 'OMITTED' && scene.number !== null;

/**
 * A locked screenplay's scene numbers by block index (`productionLayout`'s `sceneNumbers`): a new
 * scene's A-number among them. Absent for any other script.
 */
type Numbers = ReadonlyMap<number, string> | null | undefined;

/** What a scene is called in a header and a list: its locked number or A-number, else its ordinal. */
const labelOf = (scene: Scene, numbers: Numbers) =>
  numbers?.get(scene.block) ?? scene.number ?? String(scene.ordinal);

/**
 * The scenes (by ordinal, in script order) any of `characters` speak in or are named in. Names are
 * compared in capitals; a name nobody has a cue for finds no scene.
 */
export function scenesFor(doc: Doc, template: Template, characters: readonly string[]): number[] {
  const index = sceneIndex(doc, template);
  const cast = castOf(index, doc, template, null, () => undefined);
  const wanted = new Set(characters.map((name) => name.trim().toUpperCase()));
  const found = new Set<number>();
  cast.characters.forEach((character, row) => {
    if (!wanted.has(character.key)) return;
    for (const presence of cast.byScene[row] ?? []) {
      const scene = index.scenes[presence.scene];
      if (scene && !omitted(scene)) found.add(scene.ordinal);
    }
  });
  return [...found].sort((a, b) => a - b);
}

/** What the Sides dialog offers: each character with their scenes, and every scene that can be ticked. */
export interface SidesChoices {
  characters: Array<{ key: string; name: string; scenes: number[] }>;
  scenes: Array<{ ordinal: number; label: string; heading: string }>;
}

/** The characters (the cast's order) and the scenes (script order, omitted ones left out) to choose from. */
export function sidesChoices(doc: Doc, template: Template, numbers?: Numbers): SidesChoices {
  const index = sceneIndex(doc, template);
  const cast = castOf(index, doc, template, null, () => undefined);
  return {
    characters: cast.characters.map((character, row) => ({
      key: character.key,
      name: character.name,
      scenes: (cast.byScene[row] ?? [])
        .map((presence) => index.scenes[presence.scene])
        .filter((scene): scene is Scene => scene !== undefined && !omitted(scene))
        .map((scene) => scene.ordinal),
    })),
    scenes: index.scenes
      .filter((scene) => !omitted(scene))
      .map((scene) => ({
        ordinal: scene.ordinal,
        label: labelOf(scene, numbers),
        heading: scene.heading,
      })),
  };
}

/** The scene list for a header: `4, 12, 12A`, by number else ordinal, in script order. */
export function sceneList(
  doc: Doc,
  template: Template,
  scenes: readonly number[],
  numbers?: Numbers,
): string {
  const wanted = new Set(scenes);
  return sceneIndex(doc, template)
    .scenes.filter((scene) => wanted.has(scene.ordinal))
    .map((scene) => labelOf(scene, numbers))
    .join(', ');
}

/** A crossed-out stretch: body lines `from` to `to` (inclusive) of the page numbered `page`. */
export interface CrossOut {
  page: number;
  from: number;
  to: number;
}

/** Block kinds that print nothing of a scene: a section heading may follow them into the next scene. */
const NOT_PRINTED = new Set(['section', 'synopsis', 'note', 'page_break']);

/**
 * The scene ordinal each block belongs to (one pass; 0 before the first scene). A block belongs to
 * the scene that starts at or before it, except that a section heading (an act's `#`) in a scene's
 * tail, and everything after it up to the next scene, go with the scene it opens: the tail is the
 * run of blocks at the end of the scene that are all section, synopsis, note, or page break, so
 * nothing printable of the scene follows the heading. A section between two speeches stays put.
 */
function blockOwners(doc: Doc, scenes: readonly Scene[]): number[] {
  const owners: number[] = new Array(doc.blocks.length).fill(0);
  for (let i = -1; i < scenes.length; i++) {
    const start = i < 0 ? 0 : (scenes[i] as Scene).block;
    const end = scenes[i + 1]?.block ?? doc.blocks.length;
    const mine = i < 0 ? 0 : (scenes[i] as Scene).ordinal;
    const next = scenes[i + 1]?.ordinal;
    // The tail's first section heading, scanning back over the unprinted blocks at the end.
    let moves = end;
    for (let b = end - 1; b > start || (i < 0 && b >= start); b--) {
      const kind = doc.blocks[b]?.kind;
      if (!kind || !NOT_PRINTED.has(kind)) break;
      if (kind === 'section') moves = b;
    }
    for (let b = start; b < end; b++) {
      owners[b] = next !== undefined && b >= moves ? next : mine;
    }
  }
  return owners;
}

const rowBlock = (line: LayoutLine) =>
  line.blockIndex >= 0 ? line.blockIndex : (line.right?.blockIndex ?? -1);
const isBlank = (line: LayoutLine) =>
  !line.right && line.runs.every((run) => run.text.trim() === '');

/**
 * The pages of `layout` holding any line of the ticked `scenes` (ordinals), in order with their
 * labels, and the stretches to cross out: each maximal run of lines on those pages that belong to
 * other scenes (or to nothing before the first scene). A line the layout made (a blank, `(MORE)`,
 * `(CONT'D)`) goes with the line before it, or the one after it at the top of a page; blank lines
 * at the ends of a run are left uncrossed. The result's block index is empty.
 */
export function sides(
  layout: Layout,
  doc: Doc,
  template: Template,
  scenes: readonly number[],
): { layout: Layout; crossOut: CrossOut[] } {
  const index = sceneIndex(doc, template);
  const ticked = new Set(scenes);
  const owners = blockOwners(doc, index.scenes);
  const ownerOf = (block: number): number => owners[block] ?? 0;
  const pages: Page[] = [];
  const crossOut: CrossOut[] = [];
  for (const page of layout.pages) {
    if (page.number === 0) continue;
    const owners: Array<number | null> = page.lines.map((line) => {
      const block = rowBlock(line);
      return block >= 0 ? ownerOf(block) : null;
    });
    // Lines the layout made take the owner before them, or after, at the top of a page.
    let last: number | null = null;
    for (let k = 0; k < owners.length; k++) {
      if (owners[k] === null) owners[k] = last;
      else last = owners[k] as number;
    }
    let next: number | null = null;
    for (let k = owners.length - 1; k >= 0; k--) {
      if (owners[k] === null) owners[k] = next;
      else next = owners[k] as number;
    }
    const real = page.lines.some(
      (line, k) => rowBlock(line) >= 0 && ticked.has(owners[k] as number),
    );
    if (!real) continue;
    pages.push(page);
    let from = -1;
    const close = (end: number) => {
      if (from < 0) return;
      let a = from;
      let b = end;
      while (a <= b && isBlank(page.lines[a] as LayoutLine)) a++;
      while (b >= a && isBlank(page.lines[b] as LayoutLine)) b--;
      if (a <= b) crossOut.push({ page: page.number, from: a, to: b });
      from = -1;
    };
    for (let k = 0; k < page.lines.length; k++) {
      const crossed = owners[k] !== null && !ticked.has(owners[k] as number);
      if (crossed && from < 0) from = k;
      if (!crossed) close(k - 1);
    }
    close(page.lines.length - 1);
  }
  return { layout: { pages, index: [], diagnostics: layout.diagnostics }, crossOut };
}

/** `SIDES — MARGARET & JON — Scenes 4, 12, 12A — 12 November 2026` (`date` already long). */
export function sidesHeader(names: readonly string[], list: string, date: string): string {
  const who = names.map((name) => name.trim().toUpperCase()).filter(Boolean);
  const scenes = list.includes(',') ? 'Scenes' : 'Scene';
  return ['SIDES', who.join(' & '), `${scenes} ${list}`, date].filter(Boolean).join(' — ');
}
