import { SCENE_SWATCH } from '@drafter/notes';
import { linesPerPage, sceneIndex, structureStrip } from '@drafter/outline';
import { describe, expect, it } from 'vitest';
import { bandHtml } from '../src/band';
import { bandRules } from '../src/rules';
import { renderScriptHtml } from '../src/script';
import {
  BARE,
  dom,
  FONTS,
  type Laid,
  lay,
  SCREENPLAY,
  STAGE_PLAY,
  screenplay,
  stagePlay,
} from './scripts';

function band(laid: Laid) {
  const out = bandHtml(laid.doc, laid.template, laid.layout);
  return { out, host: dom(out.html) };
}

/** The strip the band is drawn from, as the Structure strip draws it. */
const stripOf = ({ doc, template, layout }: Laid) =>
  structureStrip(sceneIndex(doc, template, layout), linesPerPage(layout));

/** Screenplay scenes and no sections, each colored, two pages or so. */
const SCENES = `INT. BOATHOUSE - DAY [[Color: green]]

${'Oars. Nets. A radio playing to nobody.\n\n'.repeat(30)}
EXT. JETTY - DAY [[color: Purple]]

The water is very still.

INT. BOATHOUSE - NIGHT

${'The radio again, quieter.\n\n'.repeat(40)}`;

describe('bandHtml', () => {
  it('sections when the script has them, else scenes', () => {
    const acts = band(lay(SCREENPLAY)).host;
    expect([...acts.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
      'ACT ONE',
      'ACT TWO',
    ]);
    expect(acts.querySelector('nav')?.getAttribute('aria-label')).toBe('Sections');

    const play = band(lay(STAGE_PLAY, stagePlay)).host;
    expect([...play.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
      'ACT ONE',
      'ACT TWO',
    ]);

    const scenes = band(lay(SCENES)).host;
    expect([...scenes.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
      '1 INT. BOATHOUSE - DAY',
      '2 EXT. JETTY - DAY',
      '3 INT. BOATHOUSE - NIGHT',
    ]);
    expect(scenes.querySelector('nav')?.getAttribute('aria-label')).toBe('Scenes');
  });

  it("each block's flex-grow is its length", () => {
    for (const laid of [lay(SCREENPLAY), lay(SCENES), lay(STAGE_PLAY, stagePlay)]) {
      const { out, host } = band(laid);
      const row = stripOf(laid).rows[0];
      const lengths = (row?.blocks ?? []).map((b) => b.to - b.from);
      const expected = bandRules(lengths);
      const items = [...host.querySelectorAll('li')];
      expect(items.map((li) => li.className)).toEqual(expected.classes);
      expect(out.rules).toContain(expected.rules);
    }
    // A long scene is wider than a short one.
    const { host } = band(lay(SCENES));
    const shares = [...host.querySelectorAll('li')].map((li) => Number(li.className.slice(1)));
    expect(shares[2]).toBeGreaterThan(shares[1] as number);
    expect(shares[0]).toBeGreaterThan(shares[1] as number);
  });

  it('labels say the page range', () => {
    const laid = lay(SCENES);
    const { host } = band(laid);
    const labels = [...host.querySelectorAll('a')].map((a) => a.getAttribute('aria-label'));
    const blocks = stripOf(laid).rows[0]?.blocks ?? [];
    expect(labels).toEqual(
      blocks.map((b) => {
        const from = Math.floor(b.from) + 1;
        const to = Math.max(from, Math.ceil(b.to));
        return from === to ? `${b.label}, page ${from}` : `${b.label}, pages ${from} to ${to}`;
      }),
    );
    expect(labels[0]).toMatch(/^1 INT\. BOATHOUSE - DAY, pages 1 to \d$/);
    expect(labels[1]).toMatch(/, page \d$/);
    // The visible text is the label, and a hover shows it whole.
    for (const a of host.querySelectorAll('a')) {
      expect(a.getAttribute('title')).toBe(a.textContent);
    }
  });

  it('scene colors use SCENE_SWATCH', () => {
    const { out, host } = band(lay(SCENES));
    const links = [...host.querySelectorAll('a')];
    expect(links[0]?.className).toBe('s0');
    expect(links[1]?.className).toBe('s1');
    expect(links[2]?.className).toBe('');
    expect(out.rules).toContain(`.s0{--c:${SCENE_SWATCH.green}}`);
    expect(out.rules).toContain(`.s1{--c:${SCENE_SWATCH.purple}}`);
    // A color Drafter doesn't know is no color.
    const odd = band(lay('INT. A - DAY [[Color: __proto__]]\n\nX.\n\nINT. B - DAY\n\nY.\n'));
    expect(odd.host.querySelector('a')?.className).toBe('');
    // Sections have none: they take the accent.
    expect(band(lay(SCREENPLAY)).host.querySelector('a')?.className).toBe('');
  });

  it('no band for a script with no sections or scenes', () => {
    expect(bandHtml(lay(BARE).doc, screenplay, lay(BARE).layout)).toEqual({
      html: '',
      rules: '',
      blocks: [],
    });
    const empty = lay('');
    expect(bandHtml(empty.doc, screenplay, empty.layout).html).toBe('');
  });

  it('links each block to #b-<its block>', () => {
    const laid = lay(SCREENPLAY);
    const { out, host } = band(laid);
    const blocks = (stripOf(laid).rows[0]?.blocks ?? []).map((b) => b.block);
    expect(out.blocks).toEqual(blocks);
    expect([...host.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(
      blocks.map((b) => `#b-${b}`),
    );
    expect(out.html).not.toMatch(/style=/i);
  });

  it('every band link has a target in both views', () => {
    // Two sections in a row land on one printed line; each still has its own target.
    const stacked = `# PART ONE\n\n# PART TWO\n\nINT. A - DAY\n\nX.\n\n# PART THREE\n\nINT. B - DAY\n\nY.\n`;
    for (const laid of [
      lay(SCREENPLAY, screenplay, { sceneNumbers: 'all' }),
      lay(SCENES),
      lay(STAGE_PLAY, stagePlay),
      lay(stacked),
    ]) {
      const html = renderScriptHtml({
        ...laid,
        notes: 'include',
        fonts: FONTS,
        title: 'T',
        lang: 'en',
        generator: 'Drafter test',
        kindLine: 'Screenplay',
      });
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const links = [...doc.querySelectorAll('nav.band a')];
      expect(links.length).toBeGreaterThan(0);
      for (const a of links) {
        const id = (a.getAttribute('href') ?? '').slice(1);
        expect(doc.querySelectorAll(`#${id}`).length, id).toBe(1);
        expect(doc.querySelector(`.pages #${id}`), id).not.toBeNull();
        expect(doc.querySelector(`.reading #r-${id}`), `r-${id}`).not.toBeNull();
      }
      // No id twice anywhere.
      const ids = [...doc.querySelectorAll('[id]')].map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
