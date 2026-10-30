import type { Absence, Presence } from '@drafter/cast';

// What the character-by-scene grid says (seeing-the-script design §4.4): each cell's name, each
// long absence, and the List's line for each character.

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A cell's name: "TOM, scene 12, 4 speeches", "…, silent", or "…, not in it". */
export function cellName(
  name: string,
  sceneNumber: string,
  cell: { speeches: number; silent: boolean } | null,
): string {
  const what = !cell
    ? 'not in it'
    : cell.silent
      ? 'silent'
      : count(cell.speeches, 'speech', 'speeches');
  return `${name}, scene ${sceneNumber}, ${what}`;
}

/** "TOM: absent from page 31 to page 72 (41 pages)." The pages are whole: the page numbers' difference. */
export function absenceLine(name: string, a: Absence): string {
  const pages = a.to.page - a.from.page;
  return `${name}: absent from page ${a.from.page} to page ${a.to.page} (${count(pages, 'page', 'pages')}).`;
}

/** Scenes by number, runs of three or more in a row folded: "1, 2, 5 to 9, 14". */
function folded(scenes: readonly number[], numberOf: (scene: number) => string): string {
  const parts: string[] = [];
  for (let i = 0; i < scenes.length; ) {
    let j = i;
    while (j + 1 < scenes.length && (scenes[j + 1] as number) === (scenes[j] as number) + 1) j++;
    const first = scenes[i] as number;
    const last = scenes[j] as number;
    if (j - i >= 2) parts.push(`${numberOf(first)} to ${numberOf(last)}`);
    else for (let k = i; k <= j; k++) parts.push(numberOf(scenes[k] as number));
    i = j + 1;
  }
  return parts.join(', ');
}

/** The List's line: "TOM: in 23 scenes. Speaks in 1, 2, 5 to 9, 14. Silent in 6, 31." */
export function listLine(
  name: string,
  presence: readonly Presence[],
  numberOf: (scene: number) => string,
): string {
  if (presence.length === 0) return `${name}: in no scenes.`;
  const speaks = presence.filter((p) => p.speaking).map((p) => p.scene);
  const silent = presence.filter((p) => !p.speaking).map((p) => p.scene);
  let line = `${name}: in ${count(presence.length, 'scene', 'scenes')}.`;
  if (speaks.length > 0) line += ` Speaks in ${folded(speaks, numberOf)}.`;
  if (silent.length > 0) line += ` Silent in ${folded(silent, numberOf)}.`;
  return line;
}
