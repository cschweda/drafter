import { createHash } from 'node:crypto';
import { type MdNode, NestedTooDeeply, parseMarkdown } from '@drafter/markdown';
import { describe, expect, it } from 'vitest';
import { type DocumentHtmlInput, renderDocumentHtml } from '../src/document';

// Original text throughout: a treatment for a film that does not exist.

const read = (html: string) => new DOMParser().parseFromString(html, 'text/html');

function input(source: string, over: Partial<DocumentHtmlInput> = {}): DocumentHtmlInput {
  return {
    tree: parseMarkdown(source),
    title: 'The Lantern Keeper',
    lang: 'en',
    generator: 'Drafter 0.22.0',
    ...over,
  };
}

/** The document's file, parsed back. */
const render = (source: string, over: Partial<DocumentHtmlInput> = {}) =>
  read(renderDocumentHtml(input(source, over)));

const main = (doc: Document) => doc.querySelector('main') as HTMLElement;

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

const TREATMENT = `# The Lantern Keeper

## Premise

Ines tends the last *working* lighthouse on a coast of **dead** ones.[^keeper]

## Act One

- She logs every ship.
- She logs the ones that never come.

1. Dawn
2. Dusk

> The lamp is older than the town.
>
> Nobody remembers who lit it.

Inline \`code\` and a block:

\`\`\`
LAMP ON  18:42
LAMP OFF 06:10
\`\`\`

---

The inspector arrives.[^inspector] He has read about her.[^keeper]

[^keeper]: She took the post at nineteen.
[^inspector]: A man who measures everything.
`;

describe('renderDocumentHtml', () => {
  it('headings, lists, quotes, code, emphasis, and rules', () => {
    const doc = render(TREATMENT);
    const m = main(doc);
    expect(m.className).toBe('document');
    expect(m.hasAttribute('data-view')).toBe(false);
    // No view switch: a document has one view; the theme switch is there.
    expect(doc.querySelector('button[data-toggle="view"]')).toBeNull();
    expect(doc.querySelector('button[data-toggle="theme"]')).not.toBeNull();

    expect([...m.querySelectorAll('h1, h2')].map((h) => [h.tagName, h.textContent])).toEqual([
      ['H1', 'The Lantern Keeper'],
      ['H2', 'Premise'],
      ['H2', 'Act One'],
      ['H2', 'Notes'],
    ]);
    expect(m.querySelector('p em')?.textContent).toBe('working');
    expect(m.querySelector('p strong')?.textContent).toBe('dead');
    expect([...m.querySelectorAll('ul > li')].map((li) => li.textContent)).toEqual([
      'She logs every ship.',
      'She logs the ones that never come.',
    ]);
    // A tight list's items hold their text directly, as the Preview draws them.
    expect(m.querySelector('ul > li > p')).toBeNull();
    expect([...m.querySelectorAll('ol:not(.footnotes ol) > li')].length).toBe(2);
    expect([...m.querySelectorAll('blockquote > p')].map((p) => p.textContent)).toEqual([
      'The lamp is older than the town.',
      'Nobody remembers who lit it.',
    ]);
    expect(m.querySelector('p > code')?.textContent).toBe('code');
    expect(m.querySelector('pre > code')?.textContent).toBe('LAMP ON  18:42\nLAMP OFF 06:10');
    expect(m.querySelectorAll(':scope > hr').length).toBe(1);
  });

  it('an ordered list keeps its start, and a hard break is a break', () => {
    const m = main(render('3. three\n4. four\n\nline one\\\nline two\n'));
    expect(m.querySelector('ol')?.getAttribute('start')).toBe('3');
    expect(m.querySelector('p br')).not.toBeNull();
  });

  it('only http, https, and mailto links are links', () => {
    const source = [
      '[the harbour](https://example.org/harbour) and [the log](http://example.org/log)',
      'and [write](mailto:ines@example.org) and [run](javascript:alert(1))',
      'and [data](data:text/html,<script>alert(1)</script>) and [vb](vbscript:msgbox)',
      'and [tabbed](java\tscript:alert(2)) and [here](#premise) and [rel](notes/two.md)',
      'and [ref][harbour] and [bad ref][bad].',
      '',
      '[harbour]: https://example.org/ref',
      '[bad]: javascript:alert(3)',
    ].join('\n');
    const html = renderDocumentHtml(input(source));
    const links = [...main(read(html)).querySelectorAll('a')];
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['the harbour', 'https://example.org/harbour'],
      ['the log', 'http://example.org/log'],
      ['write', 'mailto:ines@example.org'],
      ['ref', 'https://example.org/ref'],
    ]);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
    const text = main(read(html)).textContent ?? '';
    for (const words of ['run', 'data', 'vb', 'tabbed', 'here', 'rel', 'bad ref']) {
      expect(text).toContain(words);
    }
    expect(html).not.toMatch(/javascript:|vbscript:|data:text/i);
  });

  it('a link inside a link’s text is not nested: the outer one wins', () => {
    // CommonMark doesn't nest links, but an image's or a reference's text can hold one; the
    // markup never puts an <a> in an <a>.
    const m = main(render('[outer ![pic](https://example.org/p.png)](https://example.org/o)'));
    expect(m.querySelectorAll('a').length).toBe(1);
    expect(m.querySelector('a a')).toBeNull();
  });

  it('images are their descriptions and nothing is fetched', () => {
    const html = renderDocumentHtml(
      input(
        '![the lighthouse at dusk](https://example.org/l.jpg) and ![](data:image/png;base64,AAAA) and ![ref][pic]\n\n[pic]: https://example.org/r.jpg\n',
      ),
    );
    const m = main(read(html));
    expect(m.querySelector('img')).toBeNull();
    expect(m.textContent).toContain('[Image: the lighthouse at dusk]');
    expect(m.textContent).toContain('[Image: no description]');
    expect(m.textContent).toContain('[Image: ref]');
    expect(html).not.toContain('example.org');
    expect(html).not.toContain('data:image');
  });

  it('raw HTML is text', () => {
    const source =
      '<div class="x">block</div>\n\nA <span onclick="alert(1)">span</span> and <script>alert(2)</script>.\n\n<style>body{display:none}</style>\n';
    const html = renderDocumentHtml(input(source));
    const doc = read(html);
    const m = main(doc);
    expect(m.querySelector('div, span[onclick], script, style')).toBeNull();
    expect(m.textContent).toContain('<div class="x">block</div>');
    expect(m.textContent).toContain('<span onclick="alert(1)">span</span>');
    expect(m.textContent).toContain('<script>alert(2)</script>');
    expect(doc.querySelectorAll('script').length).toBe(1);
    expect(doc.querySelectorAll('style').length).toBe(1);
    expect(html).not.toContain('style=');
  });

  it('footnotes are numbered by first reference and gathered at the end, with links both ways', () => {
    // `b` is defined first but referenced second; `unused` is never referenced; `a` is referenced twice.
    const source = [
      'First.[^a] Second.[^b] Again.[^a]',
      '',
      '[^b]: Note bee.',
      '[^unused]: Never printed.',
      '[^a]: Note ay, with a note of its own.[^c]',
      '[^c]: Note sea.',
    ].join('\n');
    const doc = render(source);
    const m = main(doc);
    const refs = [...m.querySelectorAll('sup a')];
    // As the Preview numbers them (the shared walk): a note referenced inside another is numbered
    // right after it, so `c` is 2 and `b` 3.
    expect(refs.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['1', '#fn-1'],
      ['3', '#fn-3'],
      ['1', '#fn-1'],
      ['2', '#fn-2'],
    ]);
    // The first reference to each note is the one its back link returns to.
    expect(refs.map((a) => a.id)).toEqual(['fnref-1', 'fnref-3', '', 'fnref-2']);

    const section = m.querySelector('section.footnotes') as HTMLElement;
    expect(section).toBe(m.lastElementChild);
    expect(section.querySelector(':scope > hr')).not.toBeNull();
    const heading = section.querySelector('h2') as HTMLElement;
    expect(heading.textContent).toBe('Notes');
    expect(section.getAttribute('aria-labelledby')).toBe(heading.id);
    const items = [...section.querySelectorAll(':scope > ol > li')];
    expect(items.map((li) => li.id)).toEqual(['fn-1', 'fn-2', 'fn-3']);
    expect(items.map((li) => li.querySelector('p')?.firstChild?.textContent?.trim())).toEqual([
      'Note ay, with a note of its own.',
      'Note sea.',
      'Note bee.',
    ]);
    expect(items.map((li) => li.querySelector('a.back')?.getAttribute('href'))).toEqual([
      '#fnref-1',
      '#fnref-2',
      '#fnref-3',
    ]);
    // The back link sits at the end of the note's last paragraph.
    expect(items[1]?.querySelector('p')?.lastElementChild?.className).toBe('back');
    expect(m.textContent).not.toContain('Never printed');
    // Each target exists once.
    for (const a of m.querySelectorAll('a[href^="#"]')) {
      expect(doc.querySelectorAll(a.getAttribute('href') as string).length).toBe(1);
    }
  });

  it('a note whose last block is not a paragraph has its back link after it', () => {
    const m = main(render('Text.[^1]\n\n[^1]: Look:\n\n    ```\n    code\n    ```\n'));
    const li = m.querySelector('#fn-1') as HTMLElement;
    expect(li.querySelector('pre a')).toBeNull();
    expect(li.querySelector('a.back')).not.toBeNull();
  });

  it('a footnote reference inside a link is no link of its own, and still the back link’s target', () => {
    const m = main(render('[See the log[^1]](https://example.org/log).\n\n[^1]: The log.\n'));
    expect(m.querySelector('a a')).toBeNull();
    const target = m.querySelector('#fnref-1') as HTMLElement;
    expect(target).not.toBeNull();
    expect(target.textContent).toBe('1');
    expect(m.querySelector('#fn-1 a.back')?.getAttribute('href')).toBe('#fnref-1');
  });

  it('an undefined footnote reference stays text', () => {
    const m = main(render('A claim.[^missing] Another.[^1]\n\n[^1]: Defined.\n'));
    expect(m.textContent).toContain('A claim.[^missing]');
    expect(m.querySelectorAll('sup').length).toBe(1);
    expect(m.querySelectorAll('section.footnotes li').length).toBe(1);
  });

  it('no notes section when no note is referenced', () => {
    const m = main(render('Plain.\n\n[^1]: Orphan.\n'));
    expect(m.querySelector('section.footnotes')).toBeNull();
    expect(m.textContent).not.toContain('Orphan');
  });

  it('the section links go to each ## heading, or # when there is no ##', () => {
    const doc = render(TREATMENT);
    const nav = doc.querySelector('nav.sections') as HTMLElement;
    expect(nav.getAttribute('aria-label')).toBe('Sections');
    const links = [...nav.querySelectorAll('ol > li > a')];
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Premise', '#h-2'],
      ['Act One', '#h-3'],
    ]);
    for (const a of links) {
      const target = doc.getElementById((a.getAttribute('href') as string).slice(1));
      expect(target?.textContent).toBe(a.textContent);
      expect(a.hasAttribute('target')).toBe(false);
    }
    // Every heading of the document has a generated id, never one from its words.
    expect([...main(doc).querySelectorAll('h1, h2:not(.footnotes h2)')].map((h) => h.id)).toEqual([
      'h-1',
      'h-2',
      'h-3',
    ]);

    const tops = render('# One\n\ntext\n\n# Two *emph*[^1]\n\n### Deep\n\n[^1]: n\n');
    expect(
      [...tops.querySelectorAll('nav.sections a')].map((a) => [
        a.textContent,
        a.getAttribute('href'),
      ]),
    ).toEqual([
      ['One', '#h-1'],
      ['Two emph', '#h-2'],
    ]);

    expect(render('Just text.\n').querySelector('nav')).toBeNull();
    // A heading with no words gets no link (it would be a link with no name).
    expect(render('## \n\n## Real\n').querySelectorAll('nav.sections a').length).toBe(1);
  });

  it('heading levels are the writer’s, but never skip below the header’s h1', () => {
    const levels = (source: string) =>
      [...main(render(source)).querySelectorAll('h1, h2, h3, h4, h5, h6')]
        .filter((h) => !h.closest('.footnotes'))
        .map((h) => Number(h.tagName[1]));
    expect(levels('# A\n\n## B\n\n### C\n\n## D\n')).toEqual([1, 2, 3, 2]);
    // Starting at ### reads as h2; #### under it as h3; a later ## is still h2.
    expect(levels('### A\n\n#### B\n\n## C\n\n###### D\n\n# E\n\n### F\n')).toEqual([
      2, 3, 2, 3, 1, 2,
    ]);
    expect(levels('> ### Quoted\n\n- #### Listed\n')).toEqual([2, 3]);
    // Headings inside a note sit under the Notes h2.
    const m = main(render('x[^1]\n\n[^1]: text\n\n    ##### Inner\n'));
    expect(m.querySelector('.footnotes h3')?.textContent).toBe('Inner');
  });

  it('reading time at 230 words a minute', () => {
    const kind = (source: string) => render(source).querySelector('.head .kind')?.textContent;
    expect(kind('one two three')).toBe('Document · 3 words · 1 min read');
    expect(kind('word')).toBe('Document · 1 word · 1 min read');
    expect(kind('')).toBe('Document · 0 words · 1 min read');
    expect(kind(Array(230).fill('w').join(' '))).toBe('Document · 230 words · 1 min read');
    expect(kind(Array(231).fill('w').join(' '))).toBe('Document · 231 words · 2 min read');
    expect(kind(Array(1240).fill('w').join(' '))).toBe('Document · 1,240 words · 6 min read');
    // Footnote text counts, as the app counts it; markup and addresses don't.
    expect(kind('a [b](https://example.org/x) c.[^1]\n\n[^1]: d e\n')).toBe(
      'Document · 5 words · 1 min read',
    );
  });

  it('the header has the title as its h1', () => {
    const doc = render('Body.', { title: '<Tide & "Time">' });
    expect(doc.querySelector('.head h1')?.textContent).toBe('<Tide & "Time">');
    expect(doc.title).toBe('<Tide & "Time">');
    expect(doc.querySelectorAll('h1').length).toBe(1);
    expect(doc.documentElement.lang).toBe('en');
  });

  it('hostile text is text everywhere', () => {
    const hostile = '<img src=x onerror=alert(1)> "q" \'s\' & </main></style>';
    const source = `# ${hostile}\n\n${hostile}\n\n- ${hostile}\n\n> ${hostile}\n\n\`${hostile}\`\n\n[${hostile}](https://example.org/?q="><script>)\n\n![${hostile}](x)\n`;
    const html = renderDocumentHtml(input(source, { title: hostile }));
    const doc = read(html);
    expect(doc.querySelector('img, [onerror]')).toBeNull();
    expect(doc.querySelectorAll('main').length).toBe(1);
    expect(doc.querySelectorAll('script').length).toBe(1);
    expect(main(doc).textContent).toContain(hostile);
    const a = main(doc).querySelector('a') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('https://example.org/?q=%22%3E%3Cscript%3E');
  });

  it('no Courier Prime is embedded', () => {
    const html = renderDocumentHtml(input(TREATMENT));
    expect(html).not.toContain('@font-face');
    expect(html).not.toContain('font/ttf');
    expect(html).not.toContain('base64');
  });

  it('no URL but the writer’s own links, data:, and #anchors', () => {
    const html = renderDocumentHtml(
      input(`${TREATMENT}\n[out](https://example.org/a) ![img](https://example.org/i.png)\n`),
    );
    for (const url of urls(html)) {
      expect(
        url === 'https://example.org/a' || url.startsWith('#') || url.startsWith('data:'),
      ).toBe(true);
    }
    expect(html).not.toContain('style=');
    const doc = read(html);
    expect(doc.querySelector('[style]')).toBeNull();
  });

  it('the CSP still matches the one style and the one script', () => {
    const doc = render(TREATMENT);
    const csp = doc
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute('content');
    const sha = (text: string) =>
      `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
    expect(csp).toContain(sha(doc.querySelector('style')?.textContent ?? ''));
    expect(csp).toContain(sha(doc.querySelector('script')?.textContent ?? ''));
  });

  it('ids are unique', () => {
    const doc = render(`${TREATMENT}\n## Premise\n\nAgain.[^keeper]\n`);
    const ids = [...doc.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a document nested too deeply is refused: by the parser, or by the renderer for a deeper tree', () => {
    // The parser refuses a document nested past its containers' limit; that is the caller's to say.
    expect(() => parseMarkdown(`${'> '.repeat(60)}deep\n`)).toThrow(NestedTooDeeply);

    // The parser itself nests emphasis as deep as the text: the renderer refuses such a tree with
    // an error the export says as "nested too deeply", rather than running out of stack.
    const deepEm = `${'*a '.repeat(1500)}x${' a*'.repeat(1500)}`;
    expect(() => renderDocumentHtml(input(deepEm))).toThrow(/nested too deeply/i);
    try {
      renderDocumentHtml(input(deepEm));
    } catch (error) {
      expect(error).toBeInstanceOf(RangeError);
    }

    // A tree handed over by hand, deeper still.
    let tree: MdNode = { type: 'text', value: 'x' };
    for (let i = 0; i < 100_000; i++) tree = { type: 'emphasis', children: [tree] };
    const root: MdNode = { type: 'root', children: [{ type: 'paragraph', children: [tree] }] };
    expect(() => renderDocumentHtml(input('', { tree: root }))).toThrow(/nested too deeply/i);

    // As deep as any real document gets, it renders.
    const fine = `${'> '.repeat(40)}${'*a '.repeat(200)}x${' a*'.repeat(200)}\n`;
    expect(() => renderDocumentHtml(input(fine))).not.toThrow();
  });
});
