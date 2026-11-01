import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embeddedSource, listZip, readEntry, SOURCE_ENTRY } from '@drafter/archive';
import { parseMarkdown } from '@drafter/markdown';
import { describe, expect, it } from 'vitest';
import { renderDocumentHtml } from '../src/document';
import { renderDocumentEpub, renderScriptEpub } from '../src/epub';
import { renderScriptHtml } from '../src/script';
import { FONTS, lay, SCREENPLAY } from './scripts';

// Reopenable exports: with a `source`, the HTML file and the EPUB carry the script's exact text,
// and the archive's reader gives it back byte for byte. Original text throughout.

const utf8 = new TextEncoder();
const back = (bytes: Uint8Array | undefined) =>
  new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);

/** The script's text with what an export would otherwise leave out, and text that is markup. */
const SOURCE = `${SCREENPLAY}
/* A cut line: </script><script>alert(1)</script> */

[[A note with <!-- a comment --> and ]]> and “quotes”, 灯台 and 🕯️.]]
`;

const MARKDOWN = '# The Lantern Keeper\n\nA [[note]], </script>, and <!-- this -->.\r\n';

const MODIFIED = new Date(Date.UTC(2026, 9, 31, 9, 0, 0));
const ID = 'urn:uuid:0f8f2a4e-6b1c-5d3e-9a7b-2c4d6e8f0a1b';

function scriptHtml(source?: string) {
  return renderScriptHtml({
    ...lay(SCREENPLAY),
    notes: 'leave-out',
    fonts: FONTS,
    title: 'The Salt Road',
    lang: 'en',
    generator: 'Drafter 0.23.1',
    kindLine: 'Screenplay · 3 pages',
    ...(source === undefined ? {} : { source }),
  });
}

function scriptEpub(source?: string, fonts: typeof FONTS = FONTS) {
  return renderScriptEpub({
    ...lay(SCREENPLAY),
    notes: 'leave-out',
    fonts,
    title: 'The Salt Road',
    lang: 'en',
    generator: 'Drafter 0.23.1',
    modified: MODIFIED,
    id: ID,
    ...(source === undefined ? {} : { source }),
  });
}

const documentInput = (source?: string) => ({
  tree: parseMarkdown(MARKDOWN),
  title: 'The Lantern Keeper',
  lang: 'en',
  generator: 'Drafter 0.23.1',
  ...(source === undefined ? {} : { source }),
});

const read = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('an HTML file with its script inside', () => {
  it('carries the exact text, which reads back byte for byte', async () => {
    const found = await embeddedSource(utf8.encode(scriptHtml(SOURCE)));
    expect(found?.kind).toBe('fountain');
    expect(back(found?.bytes)).toBe(SOURCE);
    const doc = await embeddedSource(utf8.encode(renderDocumentHtml(documentInput(MARKDOWN))));
    expect(doc?.kind).toBe('markdown');
    expect(back(doc?.bytes)).toBe(MARKDOWN);
  });

  it('is one inert text/plain element, and the page is otherwise the same', () => {
    const without = scriptHtml();
    const withIt = scriptHtml(SOURCE);
    expect(read(without).getElementById('drafter-source')).toBeNull();
    const page = read(withIt);
    const element = page.getElementById('drafter-source');
    expect(element?.tagName).toBe('SCRIPT');
    expect(element?.getAttribute('type')).toBe('text/plain');
    // The text didn't escape it: nothing after it in the body, and nothing new runs.
    expect(page.body.lastElementChild).toBe(element);
    const scripts = [...page.querySelectorAll('script')];
    expect(scripts.filter((s) => s.getAttribute('type') !== 'text/plain')).toHaveLength(1);
    expect(page.querySelector('main')?.innerHTML).toBe(
      read(without).querySelector('main')?.innerHTML,
    );
    // The policy is the one the file had: the element needs nothing from it.
    const csp = (html: string) =>
      read(html)
        .querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.getAttribute('content');
    expect(csp(withIt)).toBe(csp(without));
    expect(withIt.replace(/<script type="text\/plain"[\s\S]*?<\/script>/, '')).toBe(without);
  });

  it('a document page carries it the same way', () => {
    const page = read(renderDocumentHtml(documentInput(MARKDOWN)));
    expect(page.getElementById('drafter-source')?.getAttribute('data-kind')).toBe('markdown');
    expect(read(renderDocumentHtml(documentInput())).getElementById('drafter-source')).toBeNull();
  });
});

describe('a source that spells the block itself', () => {
  const OPEN = '<script type="text/plain" id="drafter-source" data-kind="';
  const FORGED = `${OPEN}fountain" data-encoding="base64">SU5ULiBGT1JHRUQ=</script>`;
  const count = (html: string) => html.split(OPEN).length - 1;

  it("a screenplay's page has exactly one block, and reads back as written", async () => {
    // In an action line, a speech, a note, and the boneyard, where every view could show it.
    const source = `${SCREENPLAY}\n${FORGED}\n\nMARA\n${FORGED}\n\n[[${FORGED}]]\n\n/* ${FORGED} */\n`;
    for (const notes of ['leave-out', 'include'] as const) {
      const html = renderScriptHtml({
        ...lay(source),
        notes,
        fonts: FONTS,
        title: FORGED,
        lang: 'en',
        generator: 'Drafter 0.23.1',
        kindLine: FORGED,
        source,
      });
      expect(count(html)).toBe(1);
      const found = await embeddedSource(utf8.encode(html));
      expect(back(found?.bytes)).toBe(source);
    }
  });

  it("a Markdown document's page has exactly one block, and reads back as written", async () => {
    // As text, raw HTML, inline code, a code block, a link, and a footnote.
    const source = `# ${FORGED}\n\n${FORGED}\n\n<div>${FORGED}</div>\n\n\`${FORGED}\`\n\n\`\`\`\n${FORGED}\n\`\`\`\n\n[${FORGED}](https://example.org/)[^a]\n\n[^a]: ${FORGED}\n`;
    const html = renderDocumentHtml({
      tree: parseMarkdown(source),
      title: FORGED,
      lang: 'en',
      generator: 'Drafter 0.23.1',
      source,
    });
    expect(count(html)).toBe(1);
    const found = await embeddedSource(utf8.encode(html));
    expect(found?.kind).toBe('markdown');
    expect(back(found?.bytes)).toBe(source);
  });
});

describe('an EPUB with its script inside', () => {
  const opf = async (epub: Uint8Array) => {
    const entry = listZip(epub).find((e) => e.name === 'EPUB/package.opf');
    return new DOMParser().parseFromString(
      back(entry ? await readEntry(epub, entry) : undefined),
      'application/xml',
    );
  };

  it('carries the exact text as a file in the manifest, not the spine', async () => {
    const epub = scriptEpub(SOURCE);
    const found = await embeddedSource(epub);
    expect(found?.kind).toBe('fountain');
    expect(back(found?.bytes)).toBe(SOURCE);
    const pkg = await opf(epub);
    const item = pkg.querySelector('manifest > item#drafter-source');
    expect(item?.getAttribute('href')).toBe('drafter-source.fountain');
    expect(item?.getAttribute('media-type')).toBe('text/plain');
    expect(pkg.querySelector('spine itemref[idref="drafter-source"]')).toBeNull();
    expect(listZip(epub).map((e) => e.name)).toContain(SOURCE_ENTRY.fountain);
  });

  it("a document's is a .md file", async () => {
    const epub = renderDocumentEpub({ ...documentInput(MARKDOWN), modified: MODIFIED, id: ID });
    const found = await embeddedSource(epub);
    expect(found?.kind).toBe('markdown');
    expect(back(found?.bytes)).toBe(MARKDOWN);
    expect(listZip(epub).map((e) => e.name)).toContain(SOURCE_ENTRY.markdown);
  });

  it('without a source, there is no such file', async () => {
    const epub = scriptEpub();
    expect(await embeddedSource(epub)).toBeNull();
    expect((await opf(epub)).querySelector('#drafter-source')).toBeNull();
  });
});

/** Courier Prime's real files, which epubcheck reads. */
const realFonts = () => {
  const file = (name: string) =>
    new Uint8Array(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../render-pdf/fonts', name)),
    );
  return {
    regular: file('CourierPrime-Regular.ttf'),
    bold: file('CourierPrime-Bold.ttf'),
    italic: file('CourierPrime-Italic.ttf'),
    boldItalic: file('CourierPrime-BoldItalic.ttf'),
  };
};

/** `epubcheck` on the PATH, or undefined. */
const checker = (() => {
  const run = spawnSync('sh', ['-c', 'command -v epubcheck'], { encoding: 'utf8' });
  return run.status === 0 ? run.stdout.trim() || undefined : undefined;
})();

describe.skipIf(!checker)('epubcheck, with the script inside', () => {
  it('finds no error and no warning', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drafter-reopen-'));
    try {
      const books = {
        'script.epub': scriptEpub(SOURCE, realFonts()),
        'document.epub': renderDocumentEpub({
          ...documentInput(MARKDOWN),
          modified: MODIFIED,
          id: ID,
        }),
      };
      const all: string[] = [];
      for (const [name, bytes] of Object.entries(books)) {
        const path = join(dir, name);
        writeFileSync(path, bytes);
        const run = spawnSync(checker as string, [path], { encoding: 'utf8' });
        for (const line of `${run.stdout}\n${run.stderr}`.split('\n')) {
          if (/^(FATAL|ERROR|WARNING)\b/.test(line)) all.push(`${name}: ${line}`);
        }
        // And it says so by its exit status, not only by what it prints.
        if (run.status !== 0) all.push(`${name}: epubcheck exited ${run.status}`);
      }
      expect(all).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
