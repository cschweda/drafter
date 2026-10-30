// The file's one script, run as a browser runs it: jsdom loads a whole file with scripts on,
// and the tests press its buttons. Storage is jsdom's own, per window, so "reopening" a file
// copies what the first window stored into the second before its script runs.
import { JSDOM, VirtualConsole } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { headerHtml, htmlShell, type ShellInput } from '../src/index';

const BODY =
  '<section class="pages"><div class="page" id="b-1">INT. HOUSE - DAY</div></section>' +
  '<section class="reading" hidden=""><h3 class="sh" id="r-b-1">INT. HOUSE - DAY</h3></section>';

function file(over: Partial<ShellInput> = {}): string {
  return htmlShell({
    title: 'The Long Way',
    lang: 'en',
    generator: 'Drafter 0.21.0',
    kind: 'script',
    header: headerHtml('Screenplay', 'The Long Way', []),
    nav: '<nav class="band" aria-label="Scenes"><ol><li><a href="#b-1">One</a></li></ol></nav>',
    body: BODY,
    fontFaces: '',
    ...over,
  });
}

interface Opened {
  dom: JSDOM;
  doc: Document;
  errors: unknown[];
  press(toggle: 'theme' | 'view'): void;
}

/** Opens a file with its script running; `before` runs on the window first, as a browser's settings would. */
async function open(
  html: string,
  before: (window: JSDOM['window']) => void = () => {},
): Promise<Opened> {
  const errors: unknown[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push(e));
  virtualConsole.on('error', (e) => errors.push(e));
  const dom = new JSDOM(html, {
    url: 'https://drafter.test/script.html',
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse: (window) => before(window),
  });
  const doc = dom.window.document;
  if (doc.readyState !== 'complete') {
    await new Promise((resolve) => dom.window.addEventListener('load', resolve));
  }
  const press = (toggle: 'theme' | 'view') => {
    const button = doc.querySelector<HTMLButtonElement>(`button[data-toggle="${toggle}"]`);
    if (!button) throw new Error(`no ${toggle} button`);
    button.click();
  };
  return { dom, doc, errors, press };
}

const theme = (o: Opened) => o.doc.documentElement.getAttribute('data-theme');
const pressed = (o: Opened, toggle: string) =>
  o.doc.querySelector(`button[data-toggle="${toggle}"]`)?.getAttribute('aria-pressed');
const sections = (o: Opened) => ({
  view: o.doc.querySelector('main')?.getAttribute('data-view'),
  pages: o.doc.querySelector<HTMLElement>('section.pages')?.hidden,
  reading: o.doc.querySelector<HTMLElement>('section.reading')?.hidden,
});

/** Everything the window stored, to hand to the next one. */
function stored(o: Opened): [string, string][] {
  const s = o.dom.window.localStorage;
  return Array.from({ length: s.length }, (_, i) => {
    const key = s.key(i) ?? '';
    return [key, s.getItem(key) ?? ''];
  });
}

/** Storage that throws on every use, as Safari's does on a file:// page or with cookies blocked. */
function throwingStorage(window: JSDOM['window']) {
  const fail = () => {
    throw new window.DOMException('The operation is insecure.', 'SecurityError');
  };
  window.Storage.prototype.getItem = fail;
  window.Storage.prototype.setItem = fail;
  window.Storage.prototype.removeItem = fail;
}

describe('the file’s script', () => {
  it('the theme toggle switches data-theme and aria-pressed', async () => {
    const o = await open(file());
    expect(theme(o)).toBe('dark');
    expect(pressed(o, 'theme')).toBe('false');
    o.press('theme');
    expect(theme(o)).toBe('light');
    expect(pressed(o, 'theme')).toBe('true');
    o.press('theme');
    expect(theme(o)).toBe('dark');
    expect(pressed(o, 'theme')).toBe('false');
    expect(o.errors).toEqual([]);
  });

  it('the view toggle shows reading and hides pages', async () => {
    const o = await open(file());
    expect(sections(o)).toEqual({ view: 'pages', pages: false, reading: true });
    expect(pressed(o, 'view')).toBe('false');
    o.press('view');
    expect(sections(o)).toEqual({ view: 'reading', pages: true, reading: false });
    expect(pressed(o, 'view')).toBe('true');
    o.press('view');
    expect(sections(o)).toEqual({ view: 'pages', pages: false, reading: true });
    expect(o.errors).toEqual([]);
  });

  it('shows the switches only when the script runs, since they need it', async () => {
    const off = new JSDOM(file()).window.document;
    expect(off.querySelector<HTMLElement>('.switches')?.hidden).toBe(true);
    const on = await open(file());
    expect(on.doc.querySelector<HTMLElement>('.switches')?.hidden).toBe(false);
  });

  it('remembers the choices', async () => {
    const first = await open(file());
    first.press('theme');
    first.press('view');
    const saved = stored(first);
    expect(saved.length).toBe(2);
    const again = await open(file(), (window) => {
      for (const [key, value] of saved) window.localStorage.setItem(key, value);
    });
    expect(theme(again)).toBe('light');
    expect(pressed(again, 'theme')).toBe('true');
    expect(sections(again)).toEqual({ view: 'reading', pages: true, reading: false });
    expect(pressed(again, 'view')).toBe('true');
    expect(again.errors).toEqual([]);
  });

  it('a remembered view does not touch a document, which has no views', async () => {
    const first = await open(file());
    first.press('view');
    const saved = stored(first);
    const document_ = await open(file({ kind: 'document', body: '<p>Hi.</p>' }), (window) => {
      for (const [key, value] of saved) window.localStorage.setItem(key, value);
    });
    expect(document_.doc.querySelector('main')?.hasAttribute('data-view')).toBe(false);
    expect(document_.doc.querySelector('button[data-toggle="view"]')).toBeNull();
    document_.press('theme');
    expect(theme(document_)).toBe('light');
    expect(document_.errors).toEqual([]);
  });

  it('ignores a remembered value it does not know', async () => {
    const o = await open(file(), (window) => {
      for (let i = 0; i < 4; i++) window.localStorage.setItem(`x${i}`, 'y');
      window.localStorage.setItem('drafter-export-theme', '"><img src=x>');
      window.localStorage.setItem('drafter-export-view', 'everything');
    });
    expect(theme(o)).toBe('dark');
    expect(sections(o).view).toBe('pages');
  });

  it('works when localStorage throws', async () => {
    const o = await open(file(), throwingStorage);
    expect(theme(o)).toBe('dark');
    o.press('theme');
    o.press('view');
    expect(theme(o)).toBe('light');
    expect(sections(o)).toEqual({ view: 'reading', pages: true, reading: false });
    expect(o.errors).toEqual([]);
  });

  it('works when even reaching localStorage throws', async () => {
    const o = await open(file(), (window) => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new window.DOMException('The operation is insecure.', 'SecurityError');
        },
      });
    });
    o.press('theme');
    o.press('view');
    expect(theme(o)).toBe('light');
    expect(sections(o).view).toBe('reading');
    expect(o.errors).toEqual([]);
  });

  it('with nothing remembered it opens dark even if the system prefers light', async () => {
    const o = await open(file(), (window) => {
      window.matchMedia = ((query: string) => ({
        matches: query.includes('light'),
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;
    });
    expect(theme(o)).toBe('dark');
    expect(pressed(o, 'theme')).toBe('false');
  });

  it('a band link in Reading goes to the Reading view’s own heading', async () => {
    const o = await open(file());
    o.press('view');
    const target = o.doc.getElementById('r-b-1') as HTMLElement;
    let scrolled: Element | null = null;
    target.scrollIntoView = function (this: Element) {
      scrolled = this;
    };
    o.doc.querySelector<HTMLAnchorElement>('nav.band a')?.click();
    expect(scrolled).toBe(target);
    expect(o.errors).toEqual([]);
  });
});
