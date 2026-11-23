import { castOf, placeOf } from '@drafter/cast';
import type { Doc } from '@drafter/fountain';
import type { Layout } from '@drafter/layout';
import { linesPerPage, type Scene, sceneIndex } from '@drafter/outline';
import type { Template } from '@drafter/templates';

/** The breakdown report's columns (production design §9), in order. */
export const BREAKDOWN_COLUMNS: readonly string[] = [
  'Scene',
  'INT/EXT',
  'Location',
  'Time',
  'Pages',
  'Page',
  'Cast',
  'Synopsis',
];

const INSIDE = { inside: 'INT', outside: 'EXT', both: 'INT/EXT', none: '' } as const;

/** A scene's length in eighths of a page as pages are said: `1 3/8`, `3/8`, `2`. */
function eighthsText(eighths: number): string {
  const whole = Math.floor(eighths / 8);
  const part = eighths % 8;
  if (part === 0) return String(whole);
  return whole === 0 ? `${part}/8` : `${whole} ${part}/8`;
}

/**
 * One row per scene, in script order, with `BREAKDOWN_COLUMNS` (production design §9). `layout` is
 * the script's pages (locked pages for a locked script): Pages is the scene's length, Page the
 * label of the page it starts on. Cast is who speaks, in the order of their first cue, then who is
 * only named in the action, in the order named. An `.OMITTED #n#` scene is its number and OMITTED.
 * Scene is `numbers`' number for the heading's block (a locked script's, `productionLayout`'s
 * `sceneNumbers`, so a new scene shows its A-number), else the written number, else the ordinal.
 */
export function breakdownRows(
  doc: Doc,
  template: Template,
  layout: Layout,
  numbers?: ReadonlyMap<number, string> | null,
): string[][] {
  const index = sceneIndex(doc, template, layout);
  const cast = castOf(index, doc, template, linesPerPage(layout), () => undefined);
  const nameOf = new Map(cast.characters.map((c) => [c.key, c.name]));
  const labels = new Map(layout.pages.map((page) => [page.number, page.label]));
  // Who is in each scene, gathered once, in the cast's order. Asking each character's whole list of
  // scenes for every scene took the scenes times every appearance: a script of 0.4 MB, 25 seconds
  // (red/blue audit of 23 November 2026, W9).
  const inScene: Array<Array<{ key: string; name: string; firstMention: number | null }>> =
    index.scenes.map(() => []);
  cast.characters.forEach((character, row) => {
    for (const presence of cast.byScene[row] ?? []) {
      inScene[presence.scene]?.push({
        key: character.key,
        name: character.name,
        firstMention: presence.firstMention,
      });
    }
  });
  return index.scenes.map((scene: Scene, i) => {
    const number = numbers?.get(scene.block) ?? scene.number ?? String(scene.ordinal);
    if (scene.heading.trim().toUpperCase() === 'OMITTED' && scene.number !== null) {
      return [number, 'OMITTED', '', '', '', '', '', ''];
    }
    const place = placeOf(scene, doc, template);
    const named: string[] = [];
    const seen = new Set<string>();
    for (const speech of scene.speeches) {
      const key = speech.name.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      named.push(nameOf.get(key) ?? speech.name);
    }
    const mentioned: Array<{ at: number; name: string }> = [];
    for (const here of inScene[i] ?? []) {
      if (seen.has(here.key) || here.firstMention === null) continue;
      mentioned.push({ at: here.firstMention, name: here.name });
    }
    mentioned.sort((a, b) => a.at - b.at);
    named.push(...mentioned.map((m) => m.name));
    return [
      number,
      INSIDE[place.inside],
      place.location ?? '',
      place.time ?? '',
      scene.pages ? eighthsText(scene.pages.eighths) : '',
      scene.pages ? (labels.get(scene.pages.page) ?? String(scene.pages.page)) : '',
      named.join(', '),
      scene.synopses.map((s) => s.text).join(' '),
    ];
  });
}

/** A semicolon and a tab too: where either is the list separator, an unquoted one splits the field. */
const needsQuotes = /[",;\t\r\n]/;
/**
 * A field a spreadsheet would run as a formula (OWASP): it starts with = + - @ tab or CR, or has
 * one of the first four after a semicolon or a tab, where a spreadsheet that splits on those
 * would start a cell with it (red/blue audit of 23 November 2026, W15).
 */
const formulaStart = /^[=+\-@\t\r]|[;\t][ ]*[=+\-@]/;

/**
 * Rows as CSV (RFC 4180): a field with a comma, a semicolon, a tab, a quote (doubled), or a line
 * break is quoted;
 * lines end `\r\n`, the last too. Text, UTF-8 without a byte order mark. A field that starts with
 * `=`, `+`, `-`, `@`, a tab, or a carriage return gets a `'` in front first, so a spreadsheet shows
 * it as text and never runs a formula a script planted in a heading, a cue, or a synopsis.
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
  const field = (raw: string) => {
    const f = formulaStart.test(raw) ? `'${raw}` : raw;
    return needsQuotes.test(f) ? `"${f.replaceAll('"', '""')}"` : f;
  };
  return rows.map((row) => `${row.map(field).join(',')}\r\n`).join('');
}
