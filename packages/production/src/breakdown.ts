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
 */
export function breakdownRows(doc: Doc, template: Template, layout: Layout): string[][] {
  const index = sceneIndex(doc, template, layout);
  const cast = castOf(index, doc, template, linesPerPage(layout), () => undefined);
  const nameOf = new Map(cast.characters.map((c) => [c.key, c.name]));
  const labels = new Map(layout.pages.map((page) => [page.number, page.label]));
  return index.scenes.map((scene: Scene, i) => {
    const number = scene.number ?? String(scene.ordinal);
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
    cast.characters.forEach((character, row) => {
      const here = cast.byScene[row]?.find((p) => p.scene === i);
      if (!here || seen.has(character.key) || here.firstMention === null) return;
      mentioned.push({ at: here.firstMention, name: character.name });
    });
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

const needsQuotes = /[",\r\n]/;

/**
 * Rows as CSV (RFC 4180): a field with a comma, a quote (doubled), or a line break is quoted;
 * lines end `\r\n`, the last too. Text, UTF-8 without a byte order mark.
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map(
      (row) =>
        row.map((f) => (needsQuotes.test(f) ? `"${f.replaceAll('"', '""')}"` : f)).join(',') +
        '\r\n',
    )
    .join('');
}
