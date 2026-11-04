import { setMarkdownMeta } from '@drafter/markdown';
import { describe, expect, test } from 'vitest';
import { isNovel, NEW_NOVEL, NEW_NOVEL_CURSOR, withNovel } from '../app/novel/kind';
import { newScriptText } from '../app/storage/new-script';

describe('isNovel', () => {
  test('a new novel is one', () => {
    expect(isNovel(NEW_NOVEL)).toBe(true);
    expect(NEW_NOVEL).toBe('# Chapter One\n\n\n\n<!-- drafter {"template":"novel"} -->\n');
  });

  test('starts typing on the empty line under the heading', () => {
    expect(NEW_NOVEL.slice(0, NEW_NOVEL_CURSOR)).toBe('# Chapter One\n\n');
    expect(NEW_NOVEL[NEW_NOVEL_CURSOR]).toBe('\n');
    expect(newScriptText('novel', new Date())).toEqual({
      text: NEW_NOVEL,
      cursor: NEW_NOVEL_CURSOR,
    });
  });

  test('plain Markdown, other templates, and other values are not', () => {
    expect(isNovel('# Untitled\n\n')).toBe(false);
    expect(isNovel(setMarkdownMeta('# A\n', { template: 'screenplay' }))).toBe(false);
    expect(isNovel(setMarkdownMeta('# A\n', { novel: { nodes: {} } }))).toBe(false);
    expect(isNovel('# A\n\n<!-- drafter {"template":"novel"} --> and more')).toBe(false);
    expect(isNovel('')).toBe(false);
  });

  test('a novel that keeps facts is one, and removing template leaves them', () => {
    const text = setMarkdownMeta('# A\n', { template: 'novel', novel: { bookTarget: 5 } });
    expect(isNovel(text)).toBe(true);
    expect(isNovel(setMarkdownMeta(text, { novel: { bookTarget: 5 } }))).toBe(false);
  });
});

describe('withNovel', () => {
  test('makes plain Markdown a novel, and back, without a trace', () => {
    const plain = '# A\n\nText.\n';
    const novel = withNovel(plain, true);
    expect(isNovel(novel)).toBe(true);
    expect(novel).toBe('# A\n\nText.\n\n\n<!-- drafter {"template":"novel"} -->\n');
    expect(withNovel(novel, false)).toBe(plain);
  });

  test('keeps every other key, the facts included, both ways', () => {
    const facts = {
      novel: { bookTarget: 9, nodes: { 'chapter:a:0': { status: 'draft' } } },
      keep: 1,
    };
    const novel = setMarkdownMeta('# A\n', { template: 'novel', ...facts });
    const plain = withNovel(novel, false);
    expect(isNovel(plain)).toBe(false);
    expect(plain).toBe(setMarkdownMeta('# A\n', facts));
    expect(withNovel(plain, true)).toBe(setMarkdownMeta('# A\n', { ...facts, template: 'novel' }));
  });

  test('changes nothing when the document already is what is asked', () => {
    expect(withNovel(NEW_NOVEL, true)).toBe(NEW_NOVEL);
    expect(withNovel('# A\n', false)).toBe('# A\n');
  });
});
