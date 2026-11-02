import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { docOf, page, text } from './charts';
import { HOSTILE, hostileScript } from './hostile-script';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';
import { build } from './scripts';

// Hostile titles, names, places, summaries, lines, hooks, and thread labels (story-map design
// §10.6): whatever the writer wrote stays text, inside SVG `<text>` and `<title>` too, and the
// page holds nothing live.

/** Compared as a reader sees it: spaces (U+2028 among them) as one space, any case. */
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** The Task 7 inert check: nothing that runs, loads, or leaves the page. */
function expectInertPage(html: string, label: string) {
  const doc = new JSDOM(html).window.document;
  for (const tag of [
    'script',
    'iframe',
    'object',
    'embed',
    'img',
    'form',
    'base',
    'link',
    'foreignObject',
  ]) {
    expect(doc.getElementsByTagName(tag).length, `${label}: <${tag}>`).toBe(0);
  }
  expect(doc.querySelectorAll('meta[http-equiv="refresh" i]').length, label).toBe(0);
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of el.getAttributeNames()) {
      expect(/^on/i.test(attr), `${label}: ${el.tagName} ${attr}`).toBe(false);
      expect(attr.toLowerCase(), `${label}: ${el.tagName}`).not.toBe('style');
      if (attr === 'href' || attr === 'xlink:href') {
        const value = el.getAttribute(attr) ?? '';
        expect(/^(?:#|mailto:)/.test(value), `${label}: ${attr}=${value}`).toBe(true);
      }
    }
  }
  expect(doc.querySelectorAll('h1'), label).toHaveLength(1);
}

/** The heading outline's shape: each heading's level, in order. */
const shape = (doc: Document) =>
  [...doc.querySelectorAll('h1, h2, h3, h4')].map((h) => h.tagName).join(' ');

describe('hostile text', () => {
  it.each(HOSTILE.map((h) => [JSON.stringify(h), h] as const))(
    'hostile text stays text everywhere (%s)',
    (_, h) => {
      const title = `The Bell ${h} Tower`;
      const { map } = build(hostileScript(h), { title });
      const html = page(map);
      expectInertPage(html, h);
      const doc = docOf(map);
      const has = (node: Element | null | undefined, what: string) =>
        expect(norm(node?.textContent ?? ''), `${what} holds ${JSON.stringify(h)}`).toContain(
          norm(h),
        );
      has(doc.querySelector('h1'), 'the title');
      expect(doc.title).toContain(title);
      has(doc.querySelector('article.card h3'), 'the first card');
      // The place, on the strip's block for the first scene and in its row.
      has(
        [...doc.querySelectorAll('svg title')].find((t) =>
          norm(t.textContent ?? '').includes(norm(h)),
        ),
        'a chart title',
      );
      has(doc.querySelector('li.sc h4'), 'the first scene');
      has(doc.querySelector('li.sc .what'), 'its summary');
      has(doc.querySelector('figure.pq'), 'the marked line');
      if (!h.includes(']]')) has(doc.querySelector('#threads'), 'the threads');
      // Every piece of the model's text is the page's text, exactly.
      const all = text(doc.body);
      for (const c of map.characters) {
        expect(all).toContain(c.name.replace(/\s+/g, ' '));
        if (c.hook) expect(all).toContain(c.hook.replace(/\s+/g, ' ').trim());
      }
      for (const q of map.quotes) expect(all).toContain(q.text.replace(/\s+/g, ' '));
      for (const t of map.threads) expect(all).toContain(t.label.replace(/\s+/g, ' ').trim());
    },
  );

  it('a lone surrogate becomes U+FFFD', () => {
    const h = 'half \ud800 a pair';
    const { map } = build(hostileScript(h), { title: `The Bell ${h} Tower` });
    const html = page(map);
    expect(
      /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(html),
    ).toBe(false);
    expect(html).toContain('half � a pair');
    expectInertPage(html, 'lone surrogate');
  });

  it('a 5,000-character name is in the file whole and its card clamps it', () => {
    const name = `OTTO${'VERYLONGNAME'.repeat(416)}`.slice(0, 5000);
    const { map } = build(hostileScript('plain', name), { title: 'Long' });
    const html = page(map);
    expect(html).toContain(map.characters.find((c) => c.key === name)?.name);
    const doc = docOf(map);
    const card = [...doc.querySelectorAll('article.card h3')].find(
      (h) => (h.textContent ?? '').length > 4000,
    );
    expect(card).toBeDefined();
    expect(card?.classList.contains('clamp')).toBe(true);
    // A short name isn't clamped.
    const short = [...doc.querySelectorAll('article.card h3')].find(
      (h) => (h.textContent ?? '').length < 40,
    );
    expect(short?.classList.contains('clamp')).toBe(false);
    expectInertPage(html, 'long name');
  });

  it('the same structure as a clean script', () => {
    const clean = shape(docOf(build(hostileScript('plain'), { title: 'Clean' }).map));
    for (const h of HOSTILE) {
      expect(shape(docOf(build(hostileScript(h), { title: `T ${h}` }).map)), h).toBe(clean);
    }
  });
});

describe('hostile sizes', () => {
  /** One scene whose action names WREN `n` times, and whose WREN speaks `n` short lines. */
  const named = (n: number) =>
    `Title: Echo\n\nINT. HALL - DAY\n\n${'WREN '.repeat(n)}waits.\n\n${'WREN\nAgain and again, the same old bell.\n\n'.repeat(Math.ceil(n / 50))}`;
  /** One speech of `n` words, far past the length rule: a line that is never picked. */
  const long = (n: number) =>
    `INT. HALL - DAY\n\nA lever waits.\n\nWREN\n${'ring '.repeat(n)}now.\n\nPIM\nThen ring it once more for luck.\n`;

  it(
    'a name said 50,000 times builds and draws in linear time',
    () => {
      expect(build(named(50_000)).map.characters[0]?.key).toBe('WREN');
      const result = scaling(
        (n) => named(n),
        (source) => page(build(source).map),
        12_500,
        3,
      );
      expect(result.growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  it(
    'a 10,000-character speech is never a line, in linear time',
    () => {
      const { map } = build(long(2_000));
      expect(map.quotes.every((q) => q.text.length <= 160)).toBe(true);
      expect(page(map)).not.toContain('ring ring ring');
      const result = scaling(long, (source) => page(build(source).map), 2_500, 3);
      expect(result.growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
