import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../src/escape';
import {
  CLIENT_SCRIPT,
  gridRules,
  headerHtml,
  htmlShell,
  type ShellInput,
  STYLESHEET,
} from '../src/index';
import { PALETTES } from '../src/style';

const HOSTILE = '</title><script>alert(1)</script>';

function input(over: Partial<ShellInput> = {}): ShellInput {
  return {
    title: 'The Long Way',
    lang: 'en',
    generator: 'Drafter 0.21.0',
    kind: 'script',
    header: headerHtml('Screenplay · 2 pages', 'The Long Way', ['by Ada Quill']),
    nav: '',
    body: '<section class="pages"></section><section class="reading" hidden=""></section>',
    fontFaces: '',
    rules: '',
    ...over,
  };
}

const parse = (html: string) => new JSDOM(html).window.document;
const sha256 = (text: string) =>
  `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
const cspOf = (doc: Document) =>
  doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '';

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

describe('htmlShell', () => {
  it('has one style and one script, and a CSP whose hashes match them', () => {
    const doc = parse(
      htmlShell(
        input({
          fontFaces: '@font-face{font-family:"X";src:url(data:font/ttf;base64,AAAA)}',
          rules: gridRules([6], [15]),
        }),
      ),
    );
    const styles = doc.querySelectorAll('style');
    const scripts = doc.querySelectorAll('script');
    expect(styles.length).toBe(1);
    expect(scripts.length).toBe(1);
    const csp = cspOf(doc);
    expect(csp).toContain(sha256(styles[0]?.textContent ?? ''));
    expect(csp).toContain(sha256(scripts[0]?.textContent ?? ''));
    // The script is the fixed text, and the style is the fonts, the fixed text, and the rules.
    expect(scripts[0]?.textContent).toBe(CLIENT_SCRIPT);
    expect(styles[0]?.textContent).toBe(
      `@font-face{font-family:"X";src:url(data:font/ttf;base64,AAAA)}\n${STYLESHEET}\n${gridRules([6], [15])}`,
    );
  });

  it('puts the CSP before the style and the script, so it governs both', () => {
    const html = htmlShell(input());
    const csp = html.indexOf('Content-Security-Policy');
    expect(csp).toBeGreaterThan(0);
    expect(csp).toBeLessThan(html.indexOf('<style>'));
    expect(csp).toBeLessThan(html.indexOf('<script>'));
    // The charset comes first of all.
    expect(html.indexOf('<meta charset="utf-8"')).toBeLessThan(csp);
  });

  it('the CSP allows no network', () => {
    const csp = cspOf(parse(htmlShell(input())));
    const directives = new Map(
      csp
        .split(';')
        .map((d) => d.trim().split(/\s+/))
        .filter((d) => d[0])
        .map(([name, ...sources]) => [name, sources]),
    );
    expect(directives.get('default-src')).toEqual(["'none'"]);
    expect(directives.get('font-src')).toEqual(['data:']);
    expect(directives.get('img-src')).toEqual(['data:']);
    expect(directives.get('base-uri')).toEqual(["'none'"]);
    expect(directives.get('form-action')).toEqual(["'none'"]);
    for (const [name, sources] of directives) {
      for (const source of sources) {
        expect(source, name).not.toMatch(/http|https:|\*|'self'|'unsafe-/);
      }
    }
    // No style attribute and no inline script beyond the one hashed.
    expect(directives.has('style-src-attr')).toBe(false);
    expect(directives.has('script-src-attr')).toBe(false);
    expect(directives.get('style-src')?.every((s) => s.startsWith("'sha256-"))).toBe(true);
    expect(directives.get('script-src')?.every((s) => s.startsWith("'sha256-"))).toBe(true);
  });

  it('no URL in the file except data: and #anchors', () => {
    for (const kind of ['script', 'document'] as const) {
      const html = htmlShell(
        input({
          kind,
          body: '',
          fontFaces: '@font-face{font-family:"X";src:url("data:font/ttf;base64,AAAA")}',
        }),
      );
      const found = urls(html);
      expect(found.length).toBeGreaterThan(0);
      for (const url of found) expect(url, kind).toMatch(/^(?:data:|#)/);
    }
  });

  it('opens dark', () => {
    const html = htmlShell(input());
    expect(html).toMatch(/<html [^>]*data-theme="dark"/);
    expect(parse(html).documentElement.dataset.theme).toBe('dark');
  });

  it('opens a script in Pages, with the reading view hidden', () => {
    const doc = parse(htmlShell(input()));
    const main = doc.querySelector('main');
    expect(main?.dataset.view).toBe('pages');
    expect(main?.querySelector('section.pages')?.hasAttribute('hidden')).toBe(false);
    expect(main?.querySelector('section.reading')?.hasAttribute('hidden')).toBe(true);
  });

  it('a script has both toggles; a document has the theme toggle only', () => {
    const script = parse(htmlShell(input()));
    expect(script.querySelector('button[data-toggle="view"]')?.getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(script.querySelector('button[data-toggle="theme"]')?.getAttribute('aria-pressed')).toBe(
      'false',
    );
    const document_ = parse(htmlShell(input({ kind: 'document', body: '<p>Hello.</p>' })));
    expect(document_.querySelector('button[data-toggle="view"]')).toBeNull();
    expect(document_.querySelector('button[data-toggle="theme"]')).not.toBeNull();
    expect(document_.querySelector('main')?.hasAttribute('data-view')).toBe(false);
    expect(document_.querySelector('main')?.textContent).toBe('Hello.');
  });

  it('a hostile title is escaped in <title> and the header', () => {
    const doc = parse(
      htmlShell(input({ title: HOSTILE, header: headerHtml(HOSTILE, HOSTILE, [HOSTILE]) })),
    );
    expect(doc.title).toBe(HOSTILE);
    expect(doc.querySelectorAll('script').length).toBe(1);
    const header = doc.querySelector('header.head');
    expect(header?.querySelector('h1')?.textContent).toBe(HOSTILE);
    expect(header?.textContent).toBe(HOSTILE.repeat(3));
    expect(header?.querySelectorAll('script, title').length).toBe(0);
  });

  it('refuses font rules or generated rules that could end the style element', () => {
    for (const css of ['</style><script>alert(1)</script>', '.a{}<']) {
      expect(() => htmlShell(input({ fontFaces: css }))).toThrow(RangeError);
      expect(() => htmlShell(input({ rules: css }))).toThrow(RangeError);
    }
  });

  it('refuses a carriage return in either, which would change the hash the browser takes', () => {
    expect(() => htmlShell(input({ fontFaces: '.a{}\r\n' }))).toThrow(RangeError);
    expect(() => htmlShell(input({ rules: '.a{}\r\n.b{}' }))).toThrow(RangeError);
  });

  it('writes no style attribute, in either kind', () => {
    for (const kind of ['script', 'document'] as const) {
      const html = htmlShell(input({ kind, nav: '', rules: gridRules([1], [2]) }));
      expect(html, kind).not.toMatch(/\sstyle\s*=/i);
      const doc = parse(html);
      expect(doc.querySelectorAll('[style]').length, kind).toBe(0);
    }
  });

  it('a hostile generator or language changes nothing else', () => {
    const doc = parse(
      htmlShell(
        input({
          generator: `"><script>alert(1)</script>`,
          lang: `en" onload="alert(1)`,
        }),
      ),
    );
    expect(doc.querySelectorAll('script').length).toBe(1);
    expect(doc.querySelectorAll('style').length).toBe(1);
    expect(doc.querySelector('meta[name="generator"]')?.getAttribute('content')).toBe(
      `"><script>alert(1)</script>`,
    );
    expect(doc.documentElement.getAttribute('lang')).toBe('en');
    expect(doc.documentElement.hasAttribute('onload')).toBe(false);
  });

  it('names the generator', () => {
    const doc = parse(htmlShell(input()));
    expect(doc.querySelector('meta[name="generator"]')?.getAttribute('content')).toBe(
      'Drafter 0.21.0',
    );
  });

  it('has a viewport and lang', () => {
    const doc = parse(htmlShell(input({ lang: 'en-GB' })));
    expect(doc.querySelector('meta[name="viewport"]')?.getAttribute('content')).toContain(
      'width=device-width',
    );
    expect(doc.documentElement.lang).toBe('en-GB');
    expect(doc.characterSet).toBe('UTF-8');
  });

  it('puts the band or section links after the header, and leaves out an empty one', () => {
    const nav =
      '<nav class="band" aria-label="Acts"><ol><li><a href="#b-1">One</a></li></ol></nav>';
    const doc = parse(htmlShell(input({ nav })));
    expect(doc.querySelector('header.head + nav.band')).not.toBeNull();
    expect(parse(htmlShell(input())).querySelector('nav.band')).toBeNull();
  });

  it('starts with a link past the bar and the band to the content', () => {
    const doc = parse(htmlShell(input()));
    const skip = doc.querySelector('body > a');
    expect(skip?.getAttribute('href')).toBe('#main');
    expect(doc.getElementById('main')?.tagName).toBe('MAIN');
  });

  it('the style and the script are plain ASCII with no carriage return, so their hashes are stable', () => {
    for (const text of [STYLESHEET, CLIENT_SCRIPT]) {
      const odd = [...text].filter((c) => c !== '\t' && c !== '\n' && (c < ' ' || c > '~'));
      expect(odd).toEqual([]);
      expect(text).not.toContain('</');
    }
  });

  it('the style holds nothing that would reach out: no url(, no @import', () => {
    expect(STYLESHEET).not.toMatch(/url\(|@import/);
  });

  it('prints light, without the bar, a page to a sheet', () => {
    const print = STYLESHEET.slice(STYLESHEET.indexOf('@media print'));
    expect(print).toContain('.bar');
    expect(print).toContain('break-after: page');
    expect(print).toContain(`--bg: ${PALETTES.light.bg}`);
  });

  it('the header is escaped text in the header element', () => {
    expect(headerHtml('A & B', '<T>', ['x"y'])).toBe(
      `<p class="kind">A &amp; B</p><h1 class="title">&lt;T&gt;</h1><p class="byline">x&quot;y</p>`,
    );
    expect(headerHtml('', 'Only', [])).toBe('<h1 class="title">Only</h1>');
    expect(escapeHtml('')).toBe('');
  });
});
