import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { type MapOptions, mailtoOf, renderStoryMap, type StoryMap } from '../src';
import { pageHtml, type Section } from '../src/render/shell';
import { fakeFonts } from './fonts';
import { BOATHOUSE, build, HARBOUR } from './scripts';

const NOV_1 = Date.UTC(2026, 10, 1, 15, 30);

const html = (map: StoryMap) =>
  renderStoryMap({ map, fonts: fakeFonts(), lang: 'en', generator: 'Drafter 0.24.1' });
const dom = (source: string, over: Partial<MapOptions> = {}) =>
  new JSDOM(html(build(source, over).map)).window.document;
const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();

const NO_AUTHOR = HARBOUR.replace('Author: Wren Abernathy\n', '');

describe('the page frame', () => {
  it('one h1, the title', () => {
    const doc = dom(HARBOUR);
    const h1s = doc.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(text(h1s[0])).toBe('Slack Tide');
    // One word to a span, so a phone sets one word to a line.
    expect([...(h1s[0]?.querySelectorAll('span') ?? [])].map((s) => s.textContent)).toEqual([
      'Slack',
      'Tide',
    ]);
    expect(doc.title).toBe('Slack Tide – story map');
    expect(doc.documentElement.getAttribute('lang')).toBe('en');
    expect(doc.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(doc.querySelector('meta[name="generator"]')?.getAttribute('content')).toBe(
      'Drafter 0.24.1',
    );
  });

  it('the greeting, status, logline, and explainer read as set', () => {
    const doc = dom(HARBOUR, {
      status: 'in-progress',
      logline: 'A harbour pilot keeps a light that nobody else will.',
      greeting: 'What I’m working on',
      updated: NOV_1,
    });
    expect(doc.body.className).toBe('wip');
    const from = doc.querySelector('.from');
    expect(from?.querySelector('.av')?.getAttribute('aria-hidden')).toBe('true');
    expect(text(from?.querySelector('.av'))).toBe('WA');
    expect(text(from?.querySelector('b'))).toBe('Wren Abernathy');
    expect(text(from)).toContain('What I’m working on');
    const pill = doc.querySelector('.status .pill');
    expect(text(pill)).toBe('A screenplay in progress');
    expect(pill?.classList.contains('wip')).toBe(true);
    expect([...doc.querySelectorAll('.status > span')].map(text)).toEqual([
      'A screenplay in progress',
      'Draft 01',
      'updated 1 Nov 2026',
    ]);
    expect(text(doc.querySelector('.log'))).toBe(
      'A harbour pilot keeps a light that nobody else will.',
    );
    expect(text(doc.querySelector('.explain'))).toBe(
      'A picture of my script: its shape, its people, and every scene in order. Just scroll.',
    );

    // Finished, no logline, the explainer hidden, no date.
    const done = dom(HARBOUR, { status: 'finished', explain: null });
    expect(done.body.className).toBe('done');
    expect(text(done.querySelector('.status .pill'))).toBe('A finished screenplay');
    expect(done.querySelector('.status .pill')?.classList.contains('done')).toBe(true);
    expect([...done.querySelectorAll('.status > span')].map(text)).toEqual([
      'A finished screenplay',
      'Draft 01',
    ]);
    expect(done.querySelector('.log')).toBeNull();
    expect(done.querySelector('.explain')).toBeNull();

    const play = dom(BOATHOUSE, { title: 'The Boathouse', status: 'in-progress' });
    expect(text(play.querySelector('.status .pill'))).toBe('A stage play in progress');
    const playDone = dom(BOATHOUSE, { title: 'The Boathouse', status: 'finished' });
    expect(text(playDone.querySelector('.status .pill'))).toBe('A finished stage play');
  });

  it('no author, no disc, and no Written by', () => {
    const doc = dom(NO_AUTHOR);
    expect(doc.querySelector('.av')).toBeNull();
    expect(doc.querySelector('.from b')).toBeNull();
    expect(text(doc.querySelector('.from'))).toBe("What I'm writing");
    expect(text(doc.querySelector('.soon'))).not.toContain('Written by');
    // With an author, the close says who.
    const by = dom(HARBOUR);
    const dts = [...by.querySelectorAll('.soon dt')].map(text);
    expect(dts).toEqual(['Written by']);
    expect(text(by.querySelector('.soon dd'))).toBe('Wren Abernathy');
  });

  it('the meter shows only with a planned length, and never when finished', () => {
    const planned = dom(HARBOUR, { plannedPages: 40 });
    const meter = planned.querySelector('.meter');
    expect(text(meter?.querySelector('.mrow b'))).toBe('About 10% written');
    expect(text(meter?.querySelector('.mrow span'))).toBe('4 of 40 planned pages');
    const bar = meter?.querySelector('svg');
    expect(bar?.getAttribute('role')).toBe('img');
    expect(bar?.getAttribute('aria-label')).toBe('About 10% written');
    expect(bar?.querySelector('.mfg')?.getAttribute('width')).toBe('10%');
    expect(text(meter?.querySelector('.mnote'))).toBe(
      'Acts 1 and 2 are written. Act 3 is under way: the ending still to come.',
    );

    // In progress without a length: the sentence alone, and never a percentage.
    const loose = dom(`${HARBOUR}\nEXT. CLIFF PATH - NIGHT\n\n= Mara climbs to the old light.\n`);
    const alone = loose.querySelector('.meter');
    expect(text(alone?.querySelector('.mnote'))).toMatch(/Act 3 is under way: 1 scene planned/);
    expect(alone?.querySelector('svg')).toBeNull();
    expect(alone?.querySelector('.mrow')).toBeNull();
    expect(text(alone)).not.toMatch(/%/);

    // Finished: none, even with a length.
    expect(
      dom(HARBOUR, { plannedPages: 40, status: 'finished' }).querySelector('.meter'),
    ).toBeNull();
  });

  it('the facts say pages so far, the running time, scenes, characters, and places', () => {
    const doc = dom(HARBOUR, { status: 'in-progress' });
    const facts = [...doc.querySelectorAll('dl.facts > div')];
    // Each holds its term before its number, as a description list must.
    for (const div of facts) {
      expect([...div.children].map((c) => c.tagName)).toEqual(['DT', 'DD']);
    }
    expect(facts.map((d) => [text(d.querySelector('dd')), text(d.querySelector('dt'))])).toEqual([
      ['4', 'pages so far'],
      ['4 min', 'to watch, about'],
      ['14', 'scenes'],
      ['10', 'characters'],
      ['6', 'places'],
    ]);
    const done = dom(HARBOUR, { status: 'finished' });
    expect(text(done.querySelector('dl.facts dt'))).toBe('pages');
  });

  it('a play’s facts say settings and the interval', () => {
    const wip = dom(BOATHOUSE, { title: 'The Boathouse', status: 'in-progress' });
    const terms = [...wip.querySelectorAll('dl.facts dt')].map(text);
    expect(terms).toEqual([
      'pages so far',
      'so far, plus an interval',
      'scenes',
      'characters',
      'settings',
    ]);
    const done = dom(BOATHOUSE, { title: 'The Boathouse', status: 'finished' });
    expect([...done.querySelectorAll('dl.facts dt')].map(text)[1]).toBe('with an interval');
  });

  it('the nav lists the sections in order', () => {
    const { map } = build(HARBOUR);
    const section =
      (id: string, label: string, rule = ''): Section =>
      () => ({
        nav: { id, label },
        html: `<section id="${id}"><h2>${label}</h2></section>`,
        rules: rule,
      });
    const sections: Section[] = [
      section('shape', 'Shape', '.x1{color:red}'),
      section('people', 'Characters'),
      () => ({ nav: null, html: '<p class="between">x</p>', rules: '' }),
      section('act1', 'Act 1'),
      section('places', 'Places'),
    ];
    const doc = new JSDOM(
      pageHtml({ map, fonts: fakeFonts(), lang: 'en', generator: 'Drafter' }, sections),
    ).window.document;
    const nav = doc.querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBe('On this page');
    expect(
      [...(nav?.querySelectorAll('a') ?? [])].map((a) => [a.getAttribute('href'), text(a)]),
    ).toEqual([
      ['#shape', 'Shape'],
      ['#people', 'Characters'],
      ['#act1', 'Act 1'],
      ['#places', 'Places'],
    ]);
    // The sections' markup goes in main, in order, before the close; their rules in the style.
    const main = doc.querySelector('main');
    expect([...(main?.children ?? [])].map((c) => c.id || c.className)).toEqual([
      'shape',
      'people',
      'between',
      'act1',
      'places',
      'soon',
    ]);
    expect(doc.querySelector('style')?.textContent).toContain('.x1{color:red}');
    // With no sections, no nav at all.
    expect(dom(HARBOUR).querySelector('nav')).toBeNull();
  });

  it('contact is off by default, a mailto only when it validates', () => {
    expect(mailtoOf('sam@example.com')).toBe('mailto:sam@example.com');
    for (const bad of ['a@b@c', 'x y@z', 's@x?cc=y', 's@x&a', '@x', 'x@', '', 'a\u0001@b']) {
      expect(mailtoOf(bad), bad).toBeNull();
    }
    expect(text(dom(HARBOUR).querySelector('.soon'))).not.toContain('Say hello');
    expect(dom(HARBOUR).querySelector('a[href^="mailto:"]')).toBeNull();

    const on = (contact: string) =>
      dom(HARBOUR, {
        contact,
        include: { summaries: true, lines: true, threads: true, contact: true },
      });
    const good = on('wren@example.com');
    const link = good.querySelector('.soon a[href^="mailto:"]');
    expect(link?.getAttribute('href')).toBe('mailto:wren@example.com');
    expect(text(link)).toBe('wren@example.com');
    expect([...good.querySelectorAll('.soon dt')].map(text)).toEqual(['Written by', 'Say hello']);
    for (const bad of ['a@b@c', 'x y@z', 's@x?cc=y', 's@x&a']) {
      const doc = on(bad);
      expect(doc.querySelector('a[href^="mailto:"]'), bad).toBeNull();
      expect([...doc.querySelectorAll('.soon dd')].map(text), bad).toContain(bad);
    }
  });

  it('the last line has the title, draft, and short ID', () => {
    const doc = dom(HARBOUR);
    expect([...doc.querySelectorAll('.made span')].map(text)).toEqual([
      'Slack Tide · Draft 01 · a3f9c2e',
      'Made with Drafter',
    ]);
    expect(text(doc.querySelector('.soon h2'))).toBe('The end');
    expect(text(dom(HARBOUR, { status: 'in-progress' }).querySelector('.soon h2'))).toBe(
      'More soon',
    );
  });

  it('escapes what the writer wrote', () => {
    const hostile = '</title><script>alert(1)</script>';
    const doc = dom(HARBOUR, { title: hostile, logline: hostile, greeting: hostile });
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.title).toBe(`${hostile} – story map`);
    expect(text(doc.querySelector('h1'))).toBe(hostile);
    expect(text(doc.querySelector('.log'))).toBe(hostile);
  });
});
