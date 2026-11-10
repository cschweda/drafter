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

/** What a scene is called in a header and a list: its locked number, else its ordinal. */
const labelOf = (scene: Scene) => scene.number ?? String(scene.ordinal);

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
export function sidesChoices(doc: Doc, template: Template): SidesChoices {
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
      .map((scene) => ({ ordinal: scene.ordinal, label: labelOf(scene), heading: scene.heading })),
  };
}

/** The scene list for a header: `4, 12, 12A`, by number else ordinal, in script order. */
export function sceneList(doc: Doc, template: Template, scenes: readonly number[]): string {
  const wanted = new Set(scenes);
  return sceneIndex(doc, template)
    .scenes.filter((scene) => wanted.has(scene.ordinal))
    .map(labelOf)
    .join(', ');
}

/** A crossed-out stretch: body lines `from` to `to` (inclusive) of the page numbered `page`. */
export interface CrossOut {
  page: number;
  from: number;
  to: number;
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
  const starts = index.scenes.map((scene) => scene.block);
  const ticked = new Set(scenes);
  /** The scene ordinal a block belongs to; 0 before the first scene. */
  const ownerOf = (block: number): number => {
    let owner = 0;
    for (let i = 0; i < starts.length; i++) {
      if ((starts[i] as number) <= block) owner = (index.scenes[i] as Scene).ordinal;
      else break;
    }
    return owner;
  };
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
