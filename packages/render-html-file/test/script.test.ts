import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { rowClass } from '../src/rules';
import { renderScriptHtml, type ScriptHtmlInput } from '../src/script';
import { STYLESHEET } from '../src/style';
import { FONTS, type Laid, lay, SCREENPLAY, STAGE_PLAY, stagePlay } from './scripts';

function input(laid: Laid, over: Partial<ScriptHtmlInput> = {}): ScriptHtmlInput {
  return {
    ...laid,
    notes: 'leave-out',
    fonts: FONTS,
    title: 'The Salt Road',
    lang: 'en',
    generator: 'Drafter 0.22.0',
    kindLine: 'Screenplay · 3 pages · About 3 min',
    ...over,
  };
}

const read = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const sha256 = (text: string) =>
  `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/** Every `src=`, `href=`, and CSS `url(` value in the file. */
function urls(html: string): string[] {
  const found: string[] = [];
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    found.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  for (const m of html.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\)/g)) {
    found.push((m[1] ?? m[2] ?? m[3] ?? '').trim());
  }
  return found;
}

describe('renderScriptHtml', () => {
  it('renderScriptHtml has both views, the bar, the band, and Courier Prime faces only for styles used', () => {
    const html = renderScriptHtml(input(lay(SCREENPLAY)));
    const doc = read(html);
    expect(doc.querySelector('.bar .switches button[data-toggle="view"]')).not.toBeNull();
    expect(doc.querySelector('.bar .switches button[data-toggle="theme"]')).not.toBeNull();
    const main = doc.querySelector('main');
    expect(main?.dataset.view).toBe('pages');
    expect(main?.querySelector(':scope > section.pages')?.hasAttribute('hidden')).toBe(false);
    expect(main?.querySelector(':scope > section.reading')?.hasAttribute('hidden')).toBe(true);
    expect(doc.querySelectorAll('nav.band a').length).toBe(2);

    // Regular, Bold, and Italic, which the script uses; no Bold Italic, which it doesn't.
    const style = doc.querySelector('style')?.textContent ?? '';
    const faces = style.match(/@font-face\{[^}]*\}/g) ?? [];
    expect(faces.length).toBe(3);
    expect(faces.map((f) => /font-weight:(\d+)/.exec(f)?.[1])).toEqual(['400', '700', '400']);
    expect(faces.map((f) => /font-style:(\w+)/.exec(f)?.[1])).toEqual([
      'normal',
      'normal',
      'italic',
    ]);
    expect(faces.every((f) => f.includes('font-family:"Courier Prime"'))).toBe(true);

    // One style: the faces, the stylesheet, then the pages', band's, and reading's rules.
    expect(style.startsWith('@font-face')).toBe(true);
    expect(style).toContain(STYLESHEET);
    expect(style).toMatch(/\.p85x66\{/);
    expect(style).toMatch(/\.band \.g\d+\{flex-grow:\d+\}/);
    expect(style).toMatch(/\.k0\{--c:#/);
    const csp = doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
    expect(csp?.getAttribute('content')).toContain(sha256(style));
    expect(html).not.toMatch(/style=/i);
    expect(doc.querySelector('[style]')).toBeNull();
  });

  it('carries the header: the kind line, the title, and the title page beneath', () => {
    const doc = read(renderScriptHtml(input(lay(SCREENPLAY))));
    const head = doc.querySelector('header.head');
    expect(head?.querySelector('.kind')?.textContent).toBe('Screenplay · 3 pages · About 3 min');
    expect(head?.querySelector('h1')?.textContent).toBe('The Salt Road');
    expect([...(head?.querySelectorAll('.byline') ?? [])].map((p) => p.textContent)).toEqual([
      'Written by Wren Okafor',
      '30 October 2026',
    ]);
    expect(doc.title).toBe('The Salt Road');
    expect(doc.documentElement.lang).toBe('en');
  });

  it('the title page mode none leaves the header with the title only', () => {
    // titlePageFor with 'none' gives the doc no title page.
    const laid = lay(SCREENPLAY);
    const doc = read(renderScriptHtml(input({ ...laid, doc: { ...laid.doc, titlePage: null } })));
    const head = doc.querySelector('header.head');
    expect(head?.querySelector('h1')?.textContent).toBe('The Salt Road');
    expect(head?.querySelector('.byline')).toBeNull();
    expect(head?.textContent).not.toContain('Wren Okafor');
  });

  it('a stage play has its acts in the band and its scenes in Reading', () => {
    const doc = read(
      renderScriptHtml(input(lay(STAGE_PLAY, stagePlay), { kindLine: 'Stage play · 1 page' })),
    );
    expect([...doc.querySelectorAll('nav.band a')].map((a) => a.textContent)).toEqual([
      'ACT ONE',
      'ACT TWO',
    ]);
    expect(doc.querySelectorAll('.reading h3').length).toBe(2);
    expect(doc.querySelectorAll('.pages .page').length).toBeGreaterThan(0);
  });

  it("puts a band block's Pages target on its first printed line", () => {
    const laid = lay(SCREENPLAY, undefined, { sceneNumbers: 'all' });
    const doc = read(renderScriptHtml(input(laid)));
    const { top } = laid.template.page.margin;
    for (const a of doc.querySelectorAll('nav.band a')) {
      const block = Number((a.getAttribute('href') ?? '').slice(3));
      const target = doc.getElementById(`b-${block}`) as HTMLElement;
      const at = laid.layout.index[block] as { page: number; line: number };
      expect(target.classList.contains(rowClass(top + at.line)), `b-${block}`).toBe(true);
      const pageIndex = laid.layout.pages.findIndex((p) => p.number === at.page);
      expect(target.closest('.page')).toBe(doc.querySelectorAll('.page')[pageIndex]);
    }
  });

  it('notes appear in Reading only', () => {
    const doc = read(renderScriptHtml(input(lay(SCREENPLAY), { notes: 'include' })));
    expect(doc.querySelectorAll('.reading aside.note').length).toBe(3);
    expect(doc.querySelector('.pages')?.textContent).not.toContain('Make the rain louder');
  });

  it('hostile title', () => {
    const hostile = '</title><script>alert(1)</script><img src=x onerror=alert(2)>"\'&';
    const source = `Title: ${hostile}\nAuthor: ${hostile}\n\nINT. A - DAY\n\nX.\n`;
    const html = renderScriptHtml(input(lay(source), { title: hostile, kindLine: hostile }));
    const doc = read(html);
    expect(doc.title).toBe(hostile);
    expect(doc.querySelector('h1')?.textContent).toBe(hostile);
    expect(doc.querySelector('.kind')?.textContent).toBe(hostile);
    expect(doc.querySelector('.byline')?.textContent).toBe(hostile);
    expect(doc.querySelectorAll('script').length).toBe(1);
    expect(doc.querySelector('img')).toBeNull();
  });

  it('no URL but data: and #anchors', () => {
    for (const laid of [lay(SCREENPLAY), lay(STAGE_PLAY, stagePlay)]) {
      const html = renderScriptHtml(input(laid, { notes: 'include' }));
      const found = urls(html);
      expect(found.some((u) => u.startsWith('data:font/'))).toBe(true);
      expect(found.some((u) => u.startsWith('#b-'))).toBe(true);
      for (const url of found) expect(url).toMatch(/^(?:data:|#)/);
    }
  });
});
