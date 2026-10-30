import type { Doc } from '@drafter/fountain';
import type { Layout } from '@drafter/layout';
import { SCENE_COLORS, SCENE_SWATCH, type SceneColor } from '@drafter/notes';
import { linesPerPage, type StripBlock, sceneIndex, structureStrip } from '@drafter/outline';
import type { Template } from '@drafter/templates';
import { el, escapeHtml } from './escape';
import { bandRules, colorRules } from './rules';

/**
 * The band's markup (a whole `<nav>`, or '' when there is none), the generated rules for its
 * blocks' widths and colors, which go into the file's one `<style>` (`ShellInput.rules`), and the
 * blocks it links to, which the Pages and Reading views give their targets.
 */
export interface BandHtml {
  html: string;
  rules: string;
  blocks: number[];
}

const KNOWN = new Set<string>(SCENE_COLORS);

/** A scene's color note as a swatch, or undefined: only Drafter's own colors are drawn. */
const swatchOf = (color: string | null) =>
  color !== null && KNOWN.has(color) ? SCENE_SWATCH[color as SceneColor] : undefined;

/**
 * What a block's link says to a screen reader: its label and the pages it covers ("ACT ONE, pages
 * 1 to 32"; "page 4" when it is on one). The strip's axis counts pages from the top of page 1, so
 * a block starts on the page its start falls in and ends on the page its end falls in. Measured in
 * words (no layout), it has no pages to say, and says its label.
 */
function labelOf(block: StripBlock, paged: boolean): string {
  if (!paged) return block.label;
  const from = Math.floor(block.from) + 1;
  const to = Math.max(from, Math.ceil(block.to));
  return from === to ? `${block.label}, page ${from}` : `${block.label}, pages ${from} to ${to}`;
}

/**
 * The scene band (design §2 and §4.1): the Structure strip, printed. From `structureStrip` of the
 * script's scene index, its top row: the sections (a play's acts) if the script has any, else the
 * scenes. Each block is a link to `#b-<block>`, as wide as its share of the pages (a `gN` class,
 * `bandRules`) and edged in its scene color when it has one (an `sN` class, `colorRules`, from
 * `SCENE_SWATCH`; a section, or a scene with no color, takes the accent). A script with no
 * sections and no scenes has no band.
 */
export function bandHtml(doc: Doc, template: Template, layout: Layout): BandHtml {
  const strip = structureStrip(sceneIndex(doc, template, layout), linesPerPage(layout));
  const row = strip.rows[0];
  if (!row || row.blocks.length === 0) return { html: '', rules: '', blocks: [] };

  const sizes = bandRules(row.blocks.map((block) => block.to - block.from));
  const swatches: string[] = [];
  const items = row.blocks.map((block, k) => {
    const swatch = swatchOf(block.color);
    let color: string | undefined;
    if (swatch) {
      if (!swatches.includes(swatch)) swatches.push(swatch);
      color = `s${swatches.indexOf(swatch)}`;
    }
    return el(
      'li',
      { class: sizes.classes[k] },
      el(
        'a',
        {
          href: `#b-${block.block}`,
          class: color,
          title: block.label,
          'aria-label': labelOf(block, strip.unit === 'pages'),
        },
        escapeHtml(block.label),
      ),
    );
  });

  return {
    html: el(
      'nav',
      { class: 'band', 'aria-label': row.kind === 'section' ? 'Sections' : 'Scenes' },
      el('ol', {}, items.join('')),
    ),
    rules: [sizes.rules, colorRules(swatches, 's')].filter(Boolean).join('\n'),
    blocks: row.blocks.map((block) => block.block),
  };
}
