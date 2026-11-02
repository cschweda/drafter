import { describe, expect, it } from 'vitest';
import type { StoryMap } from '../src';
import { docOf, generatedPlay, page, scenesOnlyPlay, text, withGaps } from './charts';
import { BOATHOUSE, build, generated, HARBOUR, NO_ACTS } from './scripts';

// Every scene, in order (story-map design §2.7, §5.1, §5.2, §6, §10.4): the act cards when the
// writer set two acts or more and enough is written, else one run; a row per scene; the gaps in
// their place; the lines of dialogue after their scenes; a play's who's on stage; the interval.

const BIG = build(generated(120, 110, 30), { title: 'Long Shore' }).map;
const MID = build(generated(60, 40, 10), { title: 'Long Shore' }).map;
const GAPS = build(withGaps(), {
  title: 'Long Shore',
  status: 'in-progress',
  plannedPages: 150,
}).map;
const PLAY = build(generatedPlay(2, 6, 14), { title: 'The Long Porch' }).map;
const TINY = build(HARBOUR, { status: 'in-progress' }).map;

const rows = (doc: Document) => [...doc.querySelectorAll('ol.scenes > li.sc:not(.gaprow)')];

describe('the rows', () => {
  it('one row per scene, numbered 1, 2, 3 in order', () => {
    for (const map of [MID, TINY, PLAY, BIG]) {
      const doc = docOf(map);
      const list = rows(doc);
      expect(list).toHaveLength(map.scenes.length);
      expect(list.map((r) => text(r.querySelector('.num')))).toEqual(
        map.scenes.map((s) => String(s.n)),
      );
      expect(list.map((r) => r.id)).toEqual(map.scenes.map((s) => `s${s.n}`));
      // Each has its h4, which names the scene for screen readers.
      for (const [i, r] of list.entries()) {
        expect(text(r.querySelector('h4 .sr'))).toMatch(new RegExp(`^Scene ${i + 1}\\b`));
      }
    }
  });

  it('rows hold place, time, inside, minutes, what, and chips', () => {
    const doc = docOf(MID);
    const scene = MID.scenes[0];
    const row = rows(doc)[0];
    expect(text(row?.querySelector('h4'))).toBe(`Scene 1: ${scene?.place}`);
    const meta = text(row?.querySelector('.meta'));
    expect(meta).toContain(scene?.time as string);
    expect(meta).toContain(scene?.inside as string);
    expect(meta).toMatch(/\d+ min/);
    expect(row?.querySelector('.meta .ti')?.getAttribute('aria-hidden')).toBe('true');
    expect(text(row?.querySelector('p.what'))).toBe(scene?.what);
    const chips = [...(row?.querySelectorAll('ul.chips > li.chip') ?? [])];
    expect(chips.map((c) => text(c.querySelector('.sr')))).toEqual(
      scene?.chips.map((c) => MID.characters[c]?.name),
    );
    expect(row?.querySelector('ul.chips')?.getAttribute('aria-label')).toBe('Characters');
  });

  it('planned rows and the tail are dashed and say so', () => {
    const doc = docOf(GAPS);
    const stubs = [...doc.querySelectorAll('li.sc.stub')];
    expect(stubs).toHaveLength(GAPS.gaps.planned.length);
    expect(stubs.length).toBeGreaterThan(0);
    for (const s of stubs) expect(text(s.querySelector('.meta'))).toBe('Planned, not written yet');
    const tail = doc.querySelectorAll('li.sc.gaprow');
    expect(tail).toHaveLength(1);
    expect(text(tail[0])).toMatch(/still to write/i);
    // The tail is in the last act that has scenes, after its last scene.
    const last = GAPS.acts.findLast((a) => a.scenes.length > 0);
    expect(tail[0]?.closest('section')?.id).toBe(`act${last?.n}`);
    const style = doc.querySelector('style')?.textContent ?? '';
    expect(style).toMatch(/\.sc\.stub \.body[^{]*\{[^}]*dashed/);
    // Finished: no planned rows and no tail.
    const done = docOf(build(withGaps(), { title: 'Long Shore', status: 'finished' }).map);
    expect(done.querySelector('li.sc.stub, li.sc.gaprow, .todo')).toBeNull();
  });

  it('an empty act is a dashed card that says not written yet', () => {
    const doc = docOf(GAPS);
    const empty = doc.querySelector('section#act4');
    expect(empty?.classList.contains('empty')).toBe(true);
    expect(text(empty)).toContain('Not written yet');
    expect(empty?.querySelector('ol.scenes')).toBeNull();
  });

  it('a to-do shows the mark only', () => {
    const secret = 'the lighthouse keeper knows';
    const source = HARBOUR.replace('The lens turns.', `The lens turns. [[TODO: ${secret}]]`);
    const map = build(source, { status: 'in-progress' }).map;
    expect(map.gaps.todo.length).toBeGreaterThan(0);
    const html = page(map);
    expect(html).not.toContain(secret);
    const doc = docOf(map);
    const marked = [...doc.querySelectorAll('li.sc .todo')];
    expect(marked).toHaveLength(map.gaps.todo.length);
    expect(text(marked[0])).toBe('to do');
  });

  it('quotes follow their scene with the speaker', () => {
    const doc = docOf(MID);
    const shown = MID.quotes.filter((q) => q.inScene);
    expect(shown.length).toBeGreaterThan(0);
    const figures = [...doc.querySelectorAll('ol.scenes > li.qrow > figure.pq')];
    expect(figures).toHaveLength(shown.length);
    shown.forEach((q, i) => {
      const fig = figures[i];
      expect(text(fig?.querySelector('blockquote p'))).toBe(q.text);
      expect(text(fig?.querySelector('figcaption'))).toBe(MID.characters[q.character]?.name);
      // Right after its scene's row.
      const before = fig?.closest('li')?.previousElementSibling;
      expect(before?.id).toBe(`s${q.scene + 1}`);
    });
  });

  it("a play's rows show who's on stage with the sentence as the list's label", () => {
    const doc = docOf(PLAY);
    const scene = PLAY.scenes[0];
    const row = rows(doc)[0];
    expect(row?.querySelector('ul.chips')).toBeNull();
    const stage = row?.querySelector('div.onstage > ul.stage');
    const names = scene?.stage?.map((l) => PLAY.characters[l.character]?.name) ?? [];
    expect(stage?.getAttribute('aria-label')).toBe(
      `On stage: ${names.join(', ')}.${scene?.moves ? ` ${scene.moves}.` : ''}`,
    );
    expect(stage?.querySelectorAll('li')).toHaveLength(names.length);
    expect(row?.querySelector('p.moves')?.getAttribute('aria-hidden')).toBe('true');
    // Each bar runs from when they arrive to when they go.
    const first = scene?.stage?.[1];
    const bar = stage?.querySelectorAll('li')[1]?.querySelector('rect.on');
    expect(Number.parseFloat(bar?.getAttribute('x') ?? 'NaN')).toBeCloseTo(
      (first?.from ?? 0) * 100,
      1,
    );
  });

  it('scene summaries off: no what lines', () => {
    const off = build(generated(60, 40, 10), {
      title: 'Long Shore',
      include: { summaries: false, lines: true, threads: true, contact: false },
    }).map;
    expect(docOf(off).querySelector('p.what')).toBeNull();
    expect(docOf(MID).querySelector('p.what')).not.toBeNull();
  });

  it('a script of planned scenes only renders', () => {
    const source =
      '# Act One\n\nINT. BARN - DAY\n\nINT. FIELD - NIGHT\n\n= A storm.\n\n# Act Two\n';
    const map = build(source, { status: 'in-progress' }).map;
    expect(map.scenes.every((s) => s.planned)).toBe(true);
    const html = page(map);
    expect(html).not.toMatch(/NaN|Infinity/);
    const doc = docOf(map);
    expect(doc.querySelectorAll('li.sc.stub')).toHaveLength(map.scenes.length);
    expect(rows(doc)).toHaveLength(map.scenes.length);
  });

  it('nothing at all still renders', () => {
    const html = page(build('# Act One\n\n# Act Two\n', { status: 'in-progress' }).map);
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });
});

describe('acts', () => {
  it('two acts or more, long enough: an act card each, in the nav', () => {
    const doc = docOf(MID);
    const acts = [...doc.querySelectorAll('main section.act')];
    expect(acts.map((a) => a.id)).toEqual(['act1', 'act2', 'act3']);
    const first = acts[0];
    expect(first?.querySelector('.acthead .num')?.getAttribute('aria-hidden')).toBe('true');
    expect(text(first?.querySelector('.acthead .lbl'))).toBe('Act one');
    expect(text(first?.querySelector('h2'))).toBe('Act 1: Rising');
    expect(text(first?.querySelector('.acthead .count'))).toMatch(/^\d+ scenes · \d+ pages$/);
    const nav = [...doc.querySelectorAll('nav a')].map((a) => a.getAttribute('href'));
    expect(nav).toEqual(expect.arrayContaining(['#people', '#act1', '#act2', '#act3']));
    expect(nav.indexOf('#people')).toBeLessThan(nav.indexOf('#act1'));
    expect(doc.querySelector('section#scenes')).toBeNull();
  });

  it('no acts, one act, or an early draft: one run called The story', () => {
    const maps: StoryMap[] = [
      build(NO_ACTS, { title: 'Garage' }).map,
      build(generatedPlay(1, 5, 16), { title: 'The Long Porch' }).map,
      build(scenesOnlyPlay(5, 16), { title: 'The Long Porch' }).map,
      TINY,
    ];
    for (const map of maps) {
      const doc = docOf(map);
      expect(doc.querySelector('section.act')).toBeNull();
      const run = doc.querySelector('section#scenes');
      expect(text(run?.querySelector('h2'))).toBe('The story');
      expect([...doc.querySelectorAll('nav a')].map((a) => text(a))).toContain('Scenes');
    }
    // A one-act play shows no act words in its scenes.
    const one = docOf(build(generatedPlay(1, 5, 16), { title: 'The Long Porch' }).map);
    expect(text(one.querySelector('section#scenes'))).not.toMatch(/\bact\b/i);
  });

  it('an early draft with acts keeps small act labels in its one run', () => {
    const doc = docOf(TINY);
    const labels = [...doc.querySelectorAll('section#scenes .actmark')].map((l) => text(l));
    expect(labels).toEqual(['Act 1', 'Act 2', 'Act 3']);
  });

  it('the interval divides the acts', () => {
    const doc = docOf(PLAY);
    const iv = doc.querySelector('div.intermission');
    expect(iv?.getAttribute('role')).toBe('separator');
    expect(iv?.getAttribute('aria-label')).toBe('Interval');
    expect(iv?.previousElementSibling?.id).toBe('act1');
    expect(iv?.nextElementSibling?.id).toBe('act2');
    // A one-act play's interval falls after its scene.
    const one = build(generatedPlay(1, 5, 16, { 2: '[[Interval]]' }), {
      title: 'The Long Porch',
    }).map;
    const d = docOf(one);
    const div = d.querySelector('section#scenes div.intermission');
    const before = div?.previousElementSibling?.querySelectorAll('li.sc');
    expect(before?.[before.length - 1]?.id).toBe('s3');
    expect(div?.nextElementSibling?.querySelector('li.sc')?.id).toBe('s4');
    // A tiny two-act play, early: still divided.
    expect(docOf(build(BOATHOUSE).map).querySelector('div.intermission')).not.toBeNull();
  });

  it('over 80 scenes, each act folds, the first open', () => {
    const doc = docOf(BIG);
    const folds = [...doc.querySelectorAll('section.act > details.fold')];
    expect(folds).toHaveLength(3);
    expect(folds.map((f) => f.hasAttribute('open'))).toEqual([true, false, false]);
    BIG.acts.forEach((act, i) => {
      expect(text(folds[i]?.querySelector('summary'))).toBe(`${act.scenes.length} scenes — show`);
    });
    // Under it, nothing folds.
    expect(docOf(MID).querySelector('details.fold')).toBeNull();
  });
});
