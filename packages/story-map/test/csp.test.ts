import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { type MapOptions, renderStoryMap } from '../src';
import { realFonts } from './fonts';
import { BOATHOUSE, build, HARBOUR, NO_ACTS } from './scripts';

const FONTS = realFonts();
const CONTACT_ON: Partial<MapOptions> = {
  contact: 'wren@example.com',
  include: { summaries: true, lines: true, threads: true, contact: true },
};

/** Every way the page can be drawn here: in progress and finished, a play, no acts, contact on. */
const PAGES: Array<[string, string]> = [
  ['in progress', build(HARBOUR, { status: 'in-progress', plannedPages: 40 }).map],
  ['finished, contact on', build(HARBOUR, { status: 'finished', ...CONTACT_ON }).map],
  ['a play', build(BOATHOUSE, { title: 'The Boathouse', status: 'in-progress' }).map],
  ['no acts', build(NO_ACTS, { title: 'Garage' }).map],
].map(([name, map]) => [
  name as string,
  renderStoryMap({ map: map as never, fonts: FONTS, lang: 'en', generator: 'Drafter 0.24.1' }),
]);

const sha256 = (text: string) =>
  `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
const parse = (html: string) => new JSDOM(html).window.document;
const cspOf = (doc: Document) =>
  doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '';

/** Every `src=`, `href=`, `xlink:href=`, `action=`, and CSS `url(` value in the file. */
function urls(html: string): string[] {
  const found: string[] = [];
  for (const m of html.matchAll(
    /\b(?:src|href|xlink:href|action|formaction|poster|data)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
  )) {
    found.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  for (const m of html.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\)/g)) {
    found.push((m[1] ?? m[2] ?? m[3] ?? '').trim());
  }
  return found;
}

describe('the story map’s policy', () => {
  it.each(PAGES)('the style hash matches the one style (%s)', (_, html) => {
    const doc = parse(html);
    const styles = doc.querySelectorAll('style');
    expect(styles).toHaveLength(1);
    const style = styles[0]?.textContent ?? '';
    expect(cspOf(doc)).toBe(
      `default-src 'none'; style-src ${sha256(style)}; font-src data:; img-src data:; base-uri 'none'; form-action 'none'`,
    );
    // The meta comes first in the head, before anything it governs.
    expect(doc.head.firstElementChild?.getAttribute('charset')).toBe('utf-8');
    expect(doc.head.children[1]?.getAttribute('http-equiv')).toBe('Content-Security-Policy');
  });

  it.each(PAGES)('there is no script-src and no script element (%s)', (_, html) => {
    const doc = parse(html);
    expect(cspOf(doc)).not.toContain('script-src');
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(html).not.toMatch(/<script/i);
  });

  it.each(PAGES)(
    'no style attribute, no on* attribute, no javascript: anywhere (%s)',
    (_, html) => {
      const doc = parse(html);
      for (const node of doc.querySelectorAll('*')) {
        for (const attr of node.attributes) {
          expect(attr.name, node.tagName).not.toBe('style');
          expect(attr.name.startsWith('on'), `${node.tagName} ${attr.name}`).toBe(false);
        }
      }
      expect(html).not.toMatch(/javascript:/i);
    },
  );

  it.each(PAGES)('every URL is #, data:, or the one mailto (%s)', (name, html) => {
    const found = urls(html);
    expect(found.length).toBeGreaterThan(0);
    const mailtos = found.filter((u) => u.startsWith('mailto:'));
    expect(mailtos).toEqual(name === 'finished, contact on' ? ['mailto:wren@example.com'] : []);
    for (const url of found) {
      if (url.startsWith('mailto:')) continue;
      expect(url.startsWith('#') || url.startsWith('data:'), url.slice(0, 40)).toBe(true);
    }
    // No other way to a URL: no link, base, iframe, img, object, or form.
    const doc = parse(html);
    expect(
      doc.querySelectorAll('link, base, iframe, img, object, embed, form, video, audio'),
    ).toHaveLength(0);
  });
});
