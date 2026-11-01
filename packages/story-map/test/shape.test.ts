import { describe, expect, it } from 'vitest';
import { EARLY_DRAFT, placeLabels } from '../src/render/axis';
import {
  docOf,
  generatedPlay,
  num,
  PLAY_META,
  page,
  scenesOnlyPlay,
  text,
  withGaps,
} from './charts';
import { BOATHOUSE, build, generated, HARBOUR, NO_ACTS } from './scripts';

// The shape of the story (story-map design §2.5, §5.1, §5.2, §6, §10.4): the act band, the strip
// of every scene, the donuts, and how long each scene runs, each with a table.

const BIG = build(generated(120, 110, 30), { title: 'Long Shore' }).map;
const LONG = build(generated(300, 200, 60), { title: 'Long Shore' }).map;
const GAPS = build(withGaps(), { title: 'Long Shore', status: 'in-progress', plannedPages: 150 });
const PLAY = build(generatedPlay(2, 6, 14), { title: 'The Long Porch' }).map;

const shape = (doc: Document) => doc.querySelector('section#shape');
const blocks = (doc: Document) => [...doc.querySelectorAll('svg.strip rect.b')];

describe('the act band', () => {
  it('the band has one block per act sized by pages', () => {
    const doc = docOf(BIG);
    const acts = [...doc.querySelectorAll('.band a.ab')];
    expect(acts).toHaveLength(3);
    expect(acts.map((a) => a.getAttribute('href'))).toEqual(['#act1', '#act2', '#act3']);
    expect(text(acts[0]?.querySelector('.p'))).toBe(`${Math.round(BIG.acts[0]?.pages ?? 0)} pages`);
    // Each block's grow class has its rule, and the rules follow the acts' pages.
    const style = doc.querySelector('style')?.textContent ?? '';
    const grow = acts.map((a) => {
      const g = [...a.classList].find((c) => /^g\d+$/.test(c)) as string;
      return Number(style.match(new RegExp(`\\.band \\.${g}\\{flex-grow:(\\d+)\\}`))?.[1]);
    });
    const pages = BIG.acts.map((a) => a.pages);
    const total = pages.reduce((a, b) => a + b, 0);
    grow.forEach((g, i) => {
      expect(g).toBe(Math.round(((pages[i] as number) / total) * 1000));
    });
  });

  it('no acts, no band', () => {
    for (const map of [build(NO_ACTS, { title: 'Garage' }).map]) {
      const doc = docOf(map);
      expect(doc.querySelector('.band')).toBeNull();
      expect(doc.querySelector('svg.strip rect.actline')).toBeNull();
      expect(doc.querySelector('svg.marks')).toBeNull();
    }
  });

  it('a one-act play is one run of scenes: no band, no interval, no act words', () => {
    const one = build(generatedPlay(1, 5, 16), { title: 'The Long Porch' }).map;
    const none = build(scenesOnlyPlay(5, 16), { title: 'The Long Porch' }).map;
    for (const map of [one, none]) {
      expect(map.scenes).toHaveLength(5);
      const doc = docOf(map);
      const section = shape(doc);
      expect(doc.querySelector('.band')).toBeNull();
      expect(doc.querySelector('.iv, rect.iv')).toBeNull();
      expect(blocks(doc)).toHaveLength(5);
      // No act anywhere in the shape: not its words, labels, legend, or table.
      const said = [
        text(section),
        ...[...(section?.querySelectorAll('[aria-label]') ?? [])].map(
          (e) => e.getAttribute('aria-label') ?? '',
        ),
      ].join(' ');
      expect(said).not.toMatch(/\bact\b|interval/i);
    }
  });

  it('a one-act play shows its interval where [[Interval]] marks it', () => {
    const map = build(generatedPlay(1, 5, 16, { 2: '[[Interval]]' }), {
      title: 'The Long Porch',
    }).map;
    expect(map.interval).toEqual({ afterAct: null, afterScene: 3 });
    const doc = docOf(map);
    expect(doc.querySelector('.band')).toBeNull();
    const iv = doc.querySelector('svg.strip rect.iv');
    const rects = blocks(doc);
    expect(num(iv, 'x')).toBeGreaterThanOrEqual(num(rects[2], 'x') + num(rects[2], 'width'));
    expect(num(rects[3], 'x')).toBeGreaterThanOrEqual(num(iv, 'x') + num(iv, 'width') - 0.001);
    const ruler = doc.querySelector('#shape svg.ruler');
    expect([...(ruler?.querySelectorAll('text') ?? [])].map(text)).toContain('Interval');
    expect(text(doc.querySelector('svg.strip > title'))).toContain('an interval after scene 3');
    expect(text(shape(doc))).not.toMatch(/\bact\b/i);
  });

  it('a script with acts the writer set, long enough, draws the band', () => {
    expect(docOf(PLAY).querySelectorAll('.band a.ab')).toHaveLength(2);
  });

  it('a tiny draft with acts keeps the simple form: small markers, no band', () => {
    const map = build(HARBOUR).map;
    expect(map.acts).toHaveLength(3);
    expect(map.facts.pages).toBeLessThan(EARLY_DRAFT.pages);
    const doc = docOf(map);
    expect(doc.querySelector('.band')).toBeNull();
    const marks = doc.querySelector('svg.marks');
    expect(marks?.getAttribute('aria-hidden')).toBe('true');
    expect(marks?.querySelectorAll('text').length).toBeGreaterThan(0);
    // The strip still marks where each act after the first starts.
    expect(doc.querySelectorAll('svg.strip rect.actline')).toHaveLength(2);
  });

  it('an empty act and an act under way look unfinished, not broken', () => {
    const doc = docOf(GAPS.map);
    const acts = [...doc.querySelectorAll('.band a.ab')];
    expect(acts).toHaveLength(4);
    expect(acts[2]?.classList.contains('open')).toBe(true);
    expect(acts[3]?.classList.contains('empty')).toBe(true);
    expect(text(acts[3]?.querySelector('.p'))).toBe('Not written yet');
    expect(text(acts[2]?.querySelector('.p'))).toMatch(/pages so far$/);
    const style = doc.querySelector('style')?.textContent ?? '';
    expect(style).toMatch(/\.ab\.empty\{[^}]*dashed/);
  });
});

describe('the strip', () => {
  it('every scene has one block, at least 0.15% wide', () => {
    expect(LONG.scenes).toHaveLength(200);
    const doc = docOf(LONG);
    const rects = blocks(doc);
    expect(rects).toHaveLength(200);
    for (const r of rects) expect(num(r, 'width')).toBeGreaterThanOrEqual(0.15);
    // In order, left to right, inside the chart.
    const xs = rects.map((r) => num(r, 'x'));
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] as number).toBeGreaterThan(xs[i - 1] as number);
    }
    expect(Math.max(...rects.map((r) => num(r, 'x') + num(r, 'width')))).toBeLessThanOrEqual(
      100.001,
    );
    // And the pace chart keeps one bar per scene, none over 96 px.
    const bars = [...doc.querySelectorAll('svg.pace rect.b')];
    expect(bars).toHaveLength(200);
    for (const b of bars) {
      expect(num(b, 'height')).toBeLessThanOrEqual(96);
      expect(num(b, 'height')).toBeGreaterThan(0);
    }
  });

  it('two lanes for a screenplay, one for a play with few times', () => {
    const two = docOf(BIG);
    expect(BIG.lanes).toBe('two');
    expect(two.querySelector('svg.strip')?.classList.contains('two')).toBe(true);
    expect([...two.querySelectorAll('.ll span')].map(text)).toEqual(['Outside', 'Inside']);
    const ys = new Set(blocks(two).map((r) => r.getAttribute('y')));
    expect(ys.size).toBeGreaterThan(1);
    // Coloured by time of day.
    expect(two.querySelector('svg.strip rect.b.night')).not.toBeNull();

    const one = docOf(PLAY);
    expect(PLAY.lanes).toBe('one');
    expect(one.querySelector('svg.strip')?.classList.contains('one')).toBe(true);
    expect(one.querySelector('.ll')).toBeNull();
    // Coloured by act, with the acts in the legend.
    expect(blocks(one).every((r) => /\bt[123]\b/.test(r.getAttribute('class') ?? ''))).toBe(true);
    expect([...one.querySelectorAll('.key li')].map(text)).toContain('Act 2');
    // No donuts with one lane.
    expect(one.querySelector('.donut')).toBeNull();
  });

  it('planned scenes and the tail are dashed, and Finished draws neither', () => {
    const doc = docOf(GAPS.map);
    expect(doc.querySelectorAll('svg.strip rect.stub')).toHaveLength(1);
    const gaps = doc.querySelectorAll('svg.strip rect.gap');
    // The tail, and the empty fourth act.
    expect(gaps).toHaveLength(2);
    const style = doc.querySelector('style')?.textContent ?? '';
    expect(style).toMatch(/\.strip \.stub,[^{]*\{[^}]*stroke-dasharray/);
    expect(style).toMatch(/\.strip \.gap,[^{]*\{[^}]*stroke-dasharray/);
    expect(doc.querySelectorAll('svg.pace rect.stub')).toHaveLength(1);
    expect([...doc.querySelectorAll('.key li')].map(text)).toEqual(
      expect.arrayContaining(['Planned', 'Still to write']),
    );
    // The tail runs on from the last scene, and the empty act after it to the right-hand edge.
    const tail = [...gaps].find((g) => g.getAttribute('class')?.includes('tail'));
    const empty = [...gaps].find((g) => g !== tail);
    expect(num(empty, 'x') - (num(tail, 'x') + num(tail, 'width'))).toBeLessThan(0.5);
    expect(num(empty, 'x') + num(empty, 'width')).toBeGreaterThan(99.5);

    const done = docOf(build(withGaps(), { status: 'finished', plannedPages: 150 }).map);
    expect(done.querySelector('svg.strip .stub, svg.strip .gap, svg.pace .stub')).toBeNull();
    expect(done.querySelector('.band .empty, .band .open')).toBeNull();
  });

  it('finished, the scenes run end to end with no holes', () => {
    const source = generated(40, 20, 6).replace(
      'INT. PLACE NUMBER 9 -',
      'INT. PLACE NUMBER 998 - NIGHT\n\nINT. PLACE NUMBER 997 - DAY\n\nINT. PLACE NUMBER 9 -',
    );
    const map = build(source, { status: 'finished' }).map;
    expect(map.scenes).toHaveLength(20);
    const rects = blocks(docOf(map));
    expect(rects).toHaveLength(20);
    // Each block starts where the one before ends (less its gutter).
    for (let i = 1; i < rects.length; i++) {
      const end = num(rects[i - 1], 'x') + num(rects[i - 1], 'width');
      expect(num(rects[i], 'x') - end).toBeLessThan(0.2);
    }
    expect(num(rects.at(-1), 'x') + num(rects.at(-1), 'width')).toBeGreaterThan(99.5);
  });

  it('a play’s interval shows on the band and the strip', () => {
    expect(PLAY.interval).toEqual({ afterAct: 1, afterScene: 6 });
    const doc = docOf(PLAY);
    const band = doc.querySelector('.band');
    const kids = [...(band?.children ?? [])];
    expect(kids.map((k) => k.className.split(' ')[0])).toEqual(['ab', 'iv', 'ab']);
    expect(text(band?.querySelector('.iv'))).toBe('Interval');
    // A gap in the strip, between the acts, named on the ruler.
    const iv = doc.querySelector('svg.strip rect.iv');
    expect(iv).not.toBeNull();
    const rects = blocks(doc);
    const lastOfOne = rects[5];
    const firstOfTwo = rects[6];
    expect(num(iv, 'x')).toBeGreaterThanOrEqual(num(lastOfOne, 'x') + num(lastOfOne, 'width'));
    expect(num(firstOfTwo, 'x')).toBeGreaterThanOrEqual(num(iv, 'x') + num(iv, 'width') - 0.001);
    const ruler = [...(doc.querySelector('#shape svg.ruler')?.querySelectorAll('text') ?? [])];
    expect(ruler.map(text)).toContain('Interval');
    // [[No interval]] takes it away.
    const none = build(generatedPlay(2, 6, 14, { 0: '[[No interval]]' })).map;
    expect(docOf(none).querySelector('.iv, rect.iv')).toBeNull();
  });

  it('ruler labels never overlap, on a long script and a play with an interval', () => {
    for (const map of [LONG, BIG, PLAY, build(HARBOUR).map]) {
      const doc = docOf(map);
      for (const svg of doc.querySelectorAll('svg.ruler, svg.marks')) {
        const labels = [...svg.querySelectorAll('text')].map((t) => ({
          x: num(t, 'x'),
          text: t.textContent ?? '',
        }));
        // Placing the drawn labels again keeps every one: none touches another.
        expect(placeLabels(labels)).toHaveLength(labels.length);
        expect(labels.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('the charts and their tables', () => {
  it('every chart is role=img with a title and a table with the same figures', () => {
    const doc = docOf(BIG);
    const charts = [...(shape(doc)?.querySelectorAll('svg[role="img"]') ?? [])];
    expect(charts.length).toBe(4); // the strip, two donuts, the pace
    for (const svg of charts) {
      expect(text(svg.querySelector(':scope > title'))).not.toBe('');
      const holder = svg.closest('.chart');
      expect(text(holder?.querySelector('details > summary'))).toBe('Show as a table');
      expect(holder?.querySelector('details table caption')).not.toBeNull();
    }

    // The strip's table: scenes by act and time of day, adding up to the model's counts.
    const table = doc.querySelector('.chart.strips details table');
    const rows = [...(table?.querySelectorAll('tbody tr') ?? [])];
    expect(rows.map((r) => text(r.querySelector('th')))).toEqual([
      'Act 1',
      'Act 2',
      'Act 3',
      'All acts',
    ]);
    const cells = (r: Element) => [...r.querySelectorAll('td')].map((td) => Number(text(td)));
    BIG.acts.forEach((act, a) => {
      const row = cells(rows[a] as Element);
      expect(row.at(-1)).toBe(act.scenes.length);
      expect(row.slice(0, -1).reduce((x, y) => x + y, 0)).toBe(act.scenes.length);
    });
    expect(cells(rows[3] as Element).at(-1)).toBe(BIG.scenes.length);
    const night = BIG.scenes.filter((s) => s.timeKind === 'night' && !s.planned).length;
    expect(cells(rows[3] as Element)[1]).toBe(night);

    // The donuts say the model's split, in their caption and their table.
    const donuts = [...doc.querySelectorAll('.donut')];
    expect(donuts.map((d) => text(d.querySelector('figcaption b')))).toEqual([
      `${BIG.split?.indoors}%`,
      `${BIG.split?.night}%`,
    ]);
    expect(text(donuts[0]?.querySelector('table'))).toContain(`${BIG.split?.indoors}%`);
    expect(text(donuts[1]?.querySelector('table'))).toContain(`${BIG.split?.night}%`);

    // The pace table: a row per scene.
    const pace = doc.querySelector('.chart.pacefig details table');
    expect(pace?.querySelectorAll('tbody tr')).toHaveLength(BIG.scenes.length);
    expect(text(doc.querySelector('.pacefig figcaption'))).toBe(BIG.pace);
  });

  it('the ruler, the markers, the lane names, and the legend swatches are aria-hidden', () => {
    for (const map of [BIG, build(HARBOUR).map]) {
      const doc = docOf(map);
      for (const el of doc.querySelectorAll('svg.ruler, svg.marks, .ll, .key .sw')) {
        expect(el.closest('[aria-hidden="true"]')).not.toBeNull();
      }
    }
  });

  it('a play draws every scene even with no time of day, and a tiny play stays simple', () => {
    const doc = docOf(build(BOATHOUSE, { title: 'The Boathouse' }).map);
    expect(blocks(doc)).toHaveLength(6);
    expect(doc.querySelector('.band')).toBeNull();
  });

  it('a script of planned scenes only renders, with nothing that isn’t a number', () => {
    const map = build(
      `# Act One\n\nINT. YARD - DAY\n\nEXT. ROAD - NIGHT\n\n# Act Two\n\nINT. YARD - NIGHT\n${''}`,
      { status: 'in-progress', plannedPages: 90 },
    ).map;
    const html = page(map);
    expect(html).not.toMatch(/NaN|Infinity/);
    const doc = docOf(map);
    expect(doc.querySelectorAll('svg.strip rect.stub')).toHaveLength(3);
    // A play of nothing but headings, no planned length: still no NaN.
    const bare = page(build(`## One\n\n## Two\n${PLAY_META}`).map);
    expect(bare).not.toMatch(/NaN|Infinity/);
  });
});
