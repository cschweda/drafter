// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { isFinalDraftName, kindOfFileName, NEW_MARKDOWN } from '../app/markdown/kind';
import { parseMarkdown } from '../app/markdown/parse';
import { PREVIEW_PROBLEMS, previewDelay, previewProblem } from '../app/markdown/preview';
import { renderMarkdown } from '../app/markdown/render';
import { markdownTitle, retitleMarkdown } from '../app/markdown/title';
import { countWords } from '../app/markdown/words';

function draw(source: string): HTMLElement {
  const host = document.createElement('div');
  host.append(renderMarkdown(parseMarkdown(source), document));
  return host;
}

describe('the Markdown preview', () => {
  test('marks each block with where it starts in the text, for scroll sync', () => {
    const source = '# Title\n\nA paragraph.\n\n- one\n- two\n\n> quoted\n\n```\ncode\n```\n\n---\n';
    const host = draw(source);
    const marks = [...host.querySelectorAll<HTMLElement>('[data-from]')].map((el) => [
      el.tagName,
      Number(el.dataset.from),
    ]);
    expect(marks).toEqual([
      ['H1', 0],
      ['P', source.indexOf('A paragraph')],
      ['UL', source.indexOf('- one')],
      ['LI', source.indexOf('- one')],
      ['LI', source.indexOf('- two')],
      ['BLOCKQUOTE', source.indexOf('> quoted')],
      ['P', source.indexOf('quoted')],
      ['PRE', source.indexOf('```')],
      ['HR', source.indexOf('---')],
    ]);
    // The offsets are numbers the tree gives, never the writer's text.
    for (const el of host.querySelectorAll<HTMLElement>('[data-from]')) {
      expect(el.dataset.from).toMatch(/^\d+$/);
    }
  });

  test('renders headings, emphasis, lists, quotes, and code as elements', () => {
    const host = draw(
      [
        '# Title',
        '',
        '## Act one',
        '',
        'Some *slanted* and **bold** words with `code`.',
        '',
        '- one',
        '- two',
        '',
        '3. three',
        '4. four',
        '',
        '> Quoted.',
        '',
        '```',
        'a < b',
        '```',
        '',
        '---',
      ].join('\n'),
    );
    expect(host.querySelector('h1')?.textContent).toBe('Title');
    expect(host.querySelector('h2')?.textContent).toBe('Act one');
    expect(host.querySelector('p em')?.textContent).toBe('slanted');
    expect(host.querySelector('p strong')?.textContent).toBe('bold');
    expect(host.querySelector('p code')?.textContent).toBe('code');
    expect([...host.querySelectorAll('ul > li')].map((li) => li.textContent)).toEqual([
      'one',
      'two',
    ]);
    const ordered = host.querySelector('ol');
    expect(ordered?.getAttribute('start')).toBe('3');
    expect([...(ordered?.querySelectorAll('li') ?? [])].map((li) => li.textContent)).toEqual([
      'three',
      'four',
    ]);
    expect(host.querySelector('blockquote p')?.textContent).toBe('Quoted.');
    expect(host.querySelector('pre > code')?.textContent).toBe('a < b');
    expect(host.querySelector('hr')).not.toBeNull();
  });

  test('keeps a tight list’s items free of paragraphs, and a loose list’s in them', () => {
    expect(draw('- a\n- b\n').querySelector('li p')).toBeNull();
    expect(draw('- a\n\n- b\n').querySelector('li p')).not.toBeNull();
  });

  test('shows raw HTML as text', () => {
    const host = draw(
      '<img src=x onerror=alert(1)>\n\nText <b onclick="x()">bold</b> and <script>1</script>\n',
    );
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('b')).toBeNull();
    expect(host.querySelector('script')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(host.textContent).toContain('<b onclick="x()">');
  });

  test('draws a link as its text and an image as its description, and runs nothing', () => {
    const host = draw(
      '[click](javascript:alert(1)) and ![a cat](http://example.com/cat.png "t") and <http://example.com>\n',
    );
    expect(host.querySelector('a')).toBeNull();
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('click');
    expect(host.textContent).toContain('a cat');
    expect(host.innerHTML).not.toContain('javascript:');
  });

  test('draws nothing for an empty document', () => {
    expect(draw('').childNodes.length).toBe(0);
  });
});

describe('counting words', () => {
  test('counts words', () => {
    expect(countWords(parseMarkdown(''))).toBe(0);
    expect(countWords(parseMarkdown('# Title\n\nOne *two* **three** `four`.\n'))).toBe(5);
    expect(countWords(parseMarkdown('- a b\n- c\n\n> d e f\n'))).toBe(6);
  });

  test('counts a link’s text and not its address, and the markup not at all', () => {
    expect(
      countWords(parseMarkdown('[two words](http://example.com/a/b) ![alt text](x.png)\n')),
    ).toBe(4);
    expect(countWords(parseMarkdown('---\n\n***\n'))).toBe(0);
  });
});

describe('the title of a Markdown document', () => {
  test('is the first heading, without its markup', () => {
    expect(markdownTitle('Some notes\n\n# The *Long* Treatment\n\n## Later\n')).toBe(
      'The Long Treatment',
    );
    expect(markdownTitle('  ## Closing hashes ##  \n')).toBe('Closing hashes');
    expect(markdownTitle('Setext title\n====\n')).toBe('Setext title');
  });

  test('is nothing when there is no heading, and skips a heading in a code fence', () => {
    expect(markdownTitle('just words\n')).toBeUndefined();
    expect(markdownTitle('```\n# not a heading\n```\n')).toBeUndefined();
    expect(markdownTitle('#\n')).toBeUndefined();
    expect(markdownTitle('#hashtag\n')).toBeUndefined();
  });
});

describe('naming a copy of a Markdown document', () => {
  test('replaces the first heading’s text, keeping its level, or puts a heading in front', () => {
    expect(retitleMarkdown('Intro\n\n## Old *name*\n\n# Other\n', 'New (copy)')).toBe(
      'Intro\n\n## New (copy)\n\n# Other\n',
    );
    expect(retitleMarkdown('just words\n', 'Notes (copy)')).toBe('# Notes (copy)\n\njust words\n');
    expect(markdownTitle(retitleMarkdown('```\n# code\n```\n', 'T'))).toBe('T');
  });
});

describe('documents and files', () => {
  test('opens .md and .markdown as Markdown and everything else as Fountain', () => {
    expect(kindOfFileName('notes.md')).toBe('markdown');
    expect(kindOfFileName('Notes.MARKDOWN')).toBe('markdown');
    expect(kindOfFileName('a.b.md')).toBe('markdown');
    expect(kindOfFileName('script.fountain')).toBe('fountain');
    expect(kindOfFileName('script.txt')).toBe('fountain');
    expect(kindOfFileName('md')).toBe('fountain');
    expect(kindOfFileName(undefined)).toBe('fountain');
  });

  test('knows a Final Draft file by its name: an import, not a kind of document', () => {
    expect(isFinalDraftName('The Call.fdx')).toBe(true);
    expect(isFinalDraftName('THE CALL.FDX')).toBe(true);
    expect(isFinalDraftName('The Call.fdx.fountain')).toBe(false);
    expect(isFinalDraftName('fdx')).toBe(false);
    expect(isFinalDraftName(undefined)).toBe(false);
  });

  test('starts a new document with a title and a blank line', () => {
    expect(NEW_MARKDOWN).toBe('# Untitled\n\n');
  });

  test('parses a long document in the background of typing: no wait for a short one, a wait for a long one', () => {
    expect(previewDelay(0)).toBe(0);
    expect(previewDelay(5_000)).toBe(0);
    expect(previewDelay(500_000)).toBeGreaterThan(0);
  });

  test('tells a document nested too deeply to preview from any other failure', () => {
    // Chromium and WebKit run out of stack with a RangeError; Firefox with "too much recursion".
    expect(previewProblem(new RangeError('Maximum call stack size exceeded'))).toBe('deep');
    expect(previewProblem('Maximum call stack size exceeded.')).toBe('deep');
    expect(previewProblem(new Error('too much recursion'))).toBe('deep');
    expect(previewProblem(new TypeError('x is undefined'))).toBe('other');
    expect(previewProblem('boom')).toBe('other');
    expect(PREVIEW_PROBLEMS.deep).toBe(
      'This document is nested too deeply to preview. Your text is safe in the Source.',
    );
    expect(PREVIEW_PROBLEMS.other).toBe(
      'The Preview couldn’t show this document. Your text is safe in the Source.',
    );
  });
});
