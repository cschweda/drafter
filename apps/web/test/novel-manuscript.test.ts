import { setMarkdownMeta } from '@drafter/markdown';
import { describe, expect, test } from 'vitest';
import { closeWhenBookChanges, contactLines, detailsFor, keptFrom } from '../app/novel/manuscript';

// The Manuscript details dialog's model (manuscript plan, Task 6): what the form opens with, and
// which of its answers are kept in the book (only what isn't the book's own default, so a default
// keeps following the book).

const BOOK = '# Part One\n\n# The Salt Road\n\nThe tide went out.\n';
const novel = (manuscript?: unknown) =>
  setMarkdownMeta(BOOK, { template: 'novel', novel: { nodes: {}, manuscript } });

describe('detailsFor', () => {
  test('a book with nothing kept opens with its defaults', () => {
    expect(detailsFor(novel(), 'salt-road')).toEqual({
      title: 'The Salt Road',
      byline: '',
      legalName: '',
      contact: [],
      surname: '',
      shortTitle: 'THE SALT ROAD',
      font: 'times',
    });
  });

  test('what is kept wins, and what follows from it follows', () => {
    const source = novel({ byline: 'Rosa Vale', contact: ['1 Quay Lane'], font: 'courier' });
    expect(detailsFor(source, 'salt-road')).toMatchObject({
      byline: 'Rosa Vale',
      legalName: 'Rosa Vale',
      surname: 'Vale',
      contact: ['1 Quay Lane'],
      font: 'courier',
    });
  });

  test('a book with no title of its own is named after its file', () => {
    expect(detailsFor('# Chapter 1\n\nWords.\n', 'salt-road').title).toBe('salt-road');
  });
});

describe('keptFrom', () => {
  const source = novel();

  test('the defaults as they are keep nothing', () => {
    expect(keptFrom(detailsFor(source, 'salt-road'), source, 'salt-road')).toEqual({});
  });

  test('a byline is kept, and the legal name and surname it gives are not', () => {
    const form = {
      ...detailsFor(source, 'salt-road'),
      byline: 'Rosa Vale',
      legalName: 'Rosa Vale',
      surname: 'Vale',
    };
    expect(keptFrom(form, source, 'salt-road')).toEqual({ byline: 'Rosa Vale' });
  });

  test('what was changed from its default is kept, trimmed', () => {
    const form = {
      title: ' The Long Salt Road ',
      byline: 'R. Vale',
      legalName: 'Rosalind Vale',
      contact: ['1 Quay Lane', 'r@vale.example'],
      surname: 'Vale-Hart',
      shortTitle: 'SALT',
      font: 'courier' as const,
    };
    expect(keptFrom(form, source, 'salt-road')).toEqual({
      title: 'The Long Salt Road',
      byline: 'R. Vale',
      legalName: 'Rosalind Vale',
      contact: ['1 Quay Lane', 'r@vale.example'],
      surname: 'Vale-Hart',
      shortTitle: 'SALT',
      font: 'courier',
    });
  });

  test('a short title that follows a changed title is not kept', () => {
    const form = {
      ...detailsFor(source, 'salt-road'),
      title: 'Wren at the Light',
      shortTitle: 'WREN AT THE',
    };
    expect(keptFrom(form, source, 'salt-road')).toEqual({ title: 'Wren at the Light' });
  });
});

describe('contactLines', () => {
  test('one line each, trimmed, the empty ones left out', () => {
    expect(contactLines('  1 Quay Lane \r\n\n r@vale.example\n')).toEqual([
      '1 Quay Lane',
      'r@vale.example',
    ]);
    expect(contactLines('')).toEqual([]);
  });
});

describe('closeWhenBookChanges', () => {
  test('closes the open dialog when another book opens, and not otherwise', async () => {
    const { nextTick, ref } = await import('vue');
    const id = ref<string | undefined>('book-a');
    const open = ref(true);
    let closed = 0;
    const stop = closeWhenBookChanges(
      () => id.value,
      () => 'book-a',
      () => open.value,
      () => {
        closed++;
      },
    );
    id.value = 'book-a';
    await nextTick();
    expect(closed).toBe(0);
    id.value = 'book-b';
    await nextTick();
    expect(closed).toBe(1);
    // A closed dialog is left alone.
    open.value = false;
    id.value = 'book-c';
    await nextTick();
    expect(closed).toBe(1);
    stop();
  });
});
