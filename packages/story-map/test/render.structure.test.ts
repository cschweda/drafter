import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { docOf, generatedPlay } from './charts';
import { build, generated, HARBOUR } from './scripts';

// The whole page's structure (story-map design §5, §10.7): its heading outline, every chart with
// its title and table, and none of the screenwriting words a non-writer wouldn't know.

const SAMPLES = fileURLToPath(
  new URL('../../../apps/web/app/editor/sample-scripts/', import.meta.url),
);
const sample = (name: string) => readFileSync(`${SAMPLES}${name}`, 'utf8');

const FIXTURES: Record<string, string> = {
  'sample screenplay': sample('screenplay.fountain'),
  'sample stage play': sample('stage-play.fountain'),
  harbour: HARBOUR,
  'two-act play': generatedPlay(2, 6, 14),
  'long screenplay': generated(60, 40, 10),
};

const CASES = Object.entries(FIXTURES).flatMap(([name, source]) =>
  (['in-progress', 'finished'] as const).map(
    (status) => [`${name}, ${status}`, build(source, { title: 'Test Title', status }).map] as const,
  ),
);

/** The heading outline as text: "h2 The shape", one heading a line, indented by level. */
function outline(doc: Document): string {
  return [...doc.querySelectorAll('h1, h2, h3, h4')]
    .map(
      (h) =>
        `${'  '.repeat(Number(h.tagName[1]) - 1)}${h.tagName.toLowerCase()} ${h.textContent?.replace(/\s+/g, ' ').trim()}`,
    )
    .join('\n');
}

/** Global Constraints: none of these on the page, its titles, or its labels. */
const WORDS =
  /\b(?:slugline|scene heading|INT\.|EXT\.|parenthetical|extension|V\.O\.|O\.S\.|CONT'D|transition|action|element|beat|eighths)/i;

describe('the page structure', () => {
  it.each(CASES)(
    'the heading outline is h1, then h2 per section and act, h3 per card and per scene (%s)',
    (_, map) => {
      const doc = docOf(map);
      expect(doc.querySelectorAll('h1')).toHaveLength(1);
      // Every h3 is a card's or a scene's, and there is no h4.
      for (const h of doc.querySelectorAll('h3')) {
        expect(h.closest('article.card, li.sc')).not.toBeNull();
      }
      expect(doc.querySelector('h4')).toBeNull();
      expect(doc.querySelectorAll('li.sc h3')).toHaveLength(
        map.scenes.length + doc.querySelectorAll('li.sc.gaprow').length,
      );
      // Every h2 is a section's or an act's.
      for (const h of doc.querySelectorAll('h2')) expect(h.closest('section')).not.toBeNull();
      expect(outline(doc)).toMatchSnapshot();
    },
  );

  it.each(CASES)('every chart has its title and its table (%s)', (_, map) => {
    const doc = docOf(map);
    for (const svg of doc.querySelectorAll('svg[role="img"]')) {
      expect(svg.querySelector(':scope > title')?.textContent?.trim()).not.toBe('');
      // Its table is in the same figure or panel.
      const holder = svg.closest('figure, .panel, .mpanel, section');
      expect(holder?.querySelector('details.tbl table')).not.toBeNull();
    }
    // Every other SVG is decoration.
    for (const svg of doc.querySelectorAll('svg:not([role="img"])')) {
      const hidden = svg.closest('[aria-hidden="true"]');
      expect(hidden).not.toBeNull();
    }
  });

  it.each(CASES)('no screenwriting words in the visible text (%s)', (_, map) => {
    const doc = docOf(map);
    const said = [
      doc.body.textContent ?? '',
      doc.title,
      ...[...doc.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')),
      ...[...doc.querySelectorAll('[title]')].map((e) => e.getAttribute('title')),
      ...[...doc.querySelectorAll('svg title')].map((e) => e.textContent),
    ].join('\n');
    expect(said).not.toMatch(WORDS);
  });
});
