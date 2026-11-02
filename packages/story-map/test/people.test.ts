import { describe, expect, it } from 'vitest';
import type { StoryMap } from '../src';
import { chip } from '../src/render/people';
import { docOf, generatedPlay, text } from './charts';
import { build, generated, HARBOUR, NO_ACTS } from './scripts';

// The characters (story-map design §2.6, §4, §5.1): the screen-time ranking, the cards, the rest
// of the cast, and who shares scenes (a half-matrix for a screenplay, ranked pairs for a play).

const BIG = build(generated(120, 110, 30), { title: 'Long Shore' }).map;
const TINY = build(HARBOUR).map;
const PLAY = build(generatedPlay(2, 6, 14), { title: 'The Long Porch' }).map;

const people = (map: StoryMap) => docOf(map).querySelector('section#people');

describe('the ranking', () => {
  it('the ranking shows twelve and N more', () => {
    const section = people(BIG);
    const rows = [...(section?.querySelectorAll('ol.rank > li:not(.more)') ?? [])];
    expect(rows).toHaveLength(12);
    expect(text(section?.querySelector('ol.rank > li.more'))).toBe(
      `and ${BIG.characters.length - 12} more`,
    );
    // Most first, each with its name and its minutes, the first bar full width.
    expect(text(rows[0]?.querySelector('.rn'))).toBe(BIG.characters[0]?.first);
    expect(text(rows[0]?.querySelector('.rv'))).toMatch(/^\d+ min$/);
    expect(rows[0]?.querySelector('svg rect')?.getAttribute('width')).toBe('100%');
    expect(rows[0]?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    // Its table holds everyone.
    const table = section?.querySelector('ol.rank ~ details.tbl table');
    expect(table?.querySelectorAll('tbody tr')).toHaveLength(BIG.characters.length);
    expect([...(table?.querySelectorAll('thead th') ?? [])].map((th) => text(th))).toEqual([
      'Character',
      'Minutes',
      'Scenes',
      'Share of the talking',
    ]);
  });

  it('a short cast has no "more" line', () => {
    expect(people(TINY)?.querySelector('ol.rank > li.more')).toBeNull();
  });
});

describe('the cards', () => {
  it('eight cards, each with an h3, numbers, and presence', () => {
    const section = people(BIG);
    const cards = [...(section?.querySelectorAll('div.cards > article.card') ?? [])];
    expect(cards).toHaveLength(8);
    cards.forEach((card, i) => {
      const c = BIG.characters[i];
      expect(text(card.querySelector('h3'))).toBe(c?.name);
      expect(card.querySelectorAll('dl.nums > div')).toHaveLength(3);
      expect(text(card.querySelector('dl.nums'))).toContain(`${c?.scenes}`);
      const pres = card.querySelector('svg.pres');
      expect(pres?.getAttribute('aria-hidden')).toBe('true');
      // One mark per scene they are in, filled where they speak.
      const marks = pres?.querySelectorAll('rect.on, rect.mute') ?? [];
      expect(marks.length).toBe(c?.presence.length);
      expect(pres?.querySelectorAll('rect.on').length).toBe(
        c?.presence.filter((p) => p.speaking).length,
      );
    });
  });

  it('a card with no hook or signature leaves them out', () => {
    const map: StoryMap = structuredClone(TINY);
    for (const c of map.characters) {
      c.hook = null;
      c.age = null;
      c.signature = null;
    }
    const section = people(map);
    expect(section?.querySelector('.card .hook')).toBeNull();
    expect(section?.querySelector('.card q')).toBeNull();
    // With them, they show.
    const full = people(TINY);
    const mara = [...(full?.querySelectorAll('.card') ?? [])].find((c) =>
      text(c.querySelector('h3')).startsWith('Mara'),
    );
    expect(text(mara?.querySelector('.hook'))).toContain('harbour pilot');
    expect(mara?.querySelector('q')).not.toBeNull();
  });

  it('the card row is a focusable labelled region', () => {
    const row = people(BIG)?.querySelector('div.cards');
    expect(row?.getAttribute('role')).toBe('region');
    expect(row?.getAttribute('aria-label')).toBe('Leading characters');
    expect(row?.getAttribute('tabindex')).toBe('0');
    expect(text(people(BIG)?.querySelector('.swipe'))).toMatch(/Swipe/);
  });

  it('the rest of the cast: the next eight and N more', () => {
    const section = people(BIG);
    const rest = [...(section?.querySelectorAll('ul.minor > li:not(.more)') ?? [])];
    expect(rest).toHaveLength(8);
    expect(text(rest[0]?.querySelector('b'))).toBe(BIG.characters[8]?.name);
    expect(text(section?.querySelector('ul.minor > li.more'))).toBe(
      `and ${BIG.characters.length - 16} more`,
    );
  });

  it('a play says on stage, not on screen', () => {
    const section = people(PLAY);
    expect(text(section?.querySelector('.card dl.nums'))).toContain('on stage');
    expect(text(people(BIG)?.querySelector('.card dl.nums'))).toContain('on screen');
  });
});

describe('who shares scenes', () => {
  it('the half-matrix fits the leads and its table matches', () => {
    const section = people(BIG);
    const mat = section?.querySelector('svg.mat');
    expect(mat?.getAttribute('role')).toBe('img');
    expect(text(mat?.querySelector('title'))).not.toBe('');
    const leads = BIG.characters.filter((c) => c.lead).length;
    const cells = mat?.querySelectorAll('rect.m') ?? [];
    expect(cells.length).toBe((leads * (leads - 1)) / 2);
    expect(cells.length).toBe(BIG.pairs.length);
    // Fits: a viewBox, as wide as the panel.
    expect(mat?.getAttribute('viewBox')).toMatch(/^0 0 \d+ \d+$/);
    expect(mat?.getAttribute('width')).toBe('100%');
    expect(text(section?.querySelector('.mpanel .cap'))).toBe(
      'Brighter squares: more scenes together.',
    );
    const rows = [...(section?.querySelectorAll('.mpanel details.tbl tbody tr') ?? [])];
    expect(rows).toHaveLength(BIG.pairs.length);
    BIG.pairs.forEach((p, i) => {
      const a = BIG.characters[p.a]?.name;
      const b = BIG.characters[p.b]?.name;
      expect(text(rows[i]?.querySelector('th'))).toBe(`${a} and ${b}`);
      expect(text(rows[i]?.querySelector('td'))).toBe(String(p.scenes));
    });
  });

  it('a play ranks pairs instead of a matrix', () => {
    const section = people(PLAY);
    expect(section?.querySelector('svg.mat')).toBeNull();
    const shares = section?.querySelector('div.shares');
    expect(text(shares?.querySelector('.lbl'))).toBe('Who shares the stage most');
    const items = [...(shares?.querySelectorAll('ol > li') ?? [])];
    expect(items).toHaveLength(PLAY.pairs.length);
    const first = PLAY.pairs[0];
    const a = PLAY.characters[first?.a ?? 0]?.name;
    const b = PLAY.characters[first?.b ?? 0]?.name;
    expect(text(items[0]?.querySelector('.sr'))).toBe(
      `${a} and ${b} share the stage in ${first?.scenes} scenes.`,
    );
    expect(items[0]?.querySelectorAll('.chip')).toHaveLength(2);
  });

  it('one lead: no pairs to show', () => {
    const map = build(NO_ACTS, { title: 'Garage' }).map;
    const section = people(map);
    expect(section?.querySelector('svg.mat, div.shares')).toBeNull();
  });
});

describe('chips', () => {
  it('colour is never alone: every chip has its initial and its name for screen readers', () => {
    const doc = docOf(BIG);
    const chips = [...doc.querySelectorAll('.chip')];
    expect(chips.length).toBeGreaterThan(100);
    for (const c of chips) {
      const initial = c.querySelector('[aria-hidden="true"]');
      expect(text(initial)).toMatch(/^\S$/u);
      // Either the name beside it for screen readers, or the chip is decoration beside the name.
      const sr = c.querySelector('.sr');
      if (sr) expect(c.getAttribute('title')).toBe(text(sr));
      else expect(c.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('leads take their colour, a voice the ring, the rest grey', () => {
    const tiny = TINY.characters;
    const voice = tiny.findIndex((c) => c.voice);
    const lead = tiny.findIndex((c) => c.lead && !c.voice);
    const rest = tiny.findIndex((c) => !c.lead);
    expect(chip(tiny[voice] ?? null, voice)).toMatch(/class="chip voice"/);
    expect(chip(tiny[lead] ?? null, lead)).toMatch(
      new RegExp(`class="chip k${tiny[lead]?.color}"`),
    );
    expect(chip(tiny[rest] ?? null, rest)).toMatch(/class="chip lesser"/);
    // A name is text, never markup.
    const hostile = { ...(tiny[lead] as (typeof tiny)[number]), name: '<b>x</b>', initial: '<' };
    const html = chip(hostile, lead);
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
