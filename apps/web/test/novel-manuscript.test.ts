import { setMarkdownMeta } from '@drafter/markdown';
import { MAX_CONTACT_LINES, MAX_DETAIL, readFacts, writeFacts } from '@drafter/novel';
import { describe, expect, test } from 'vitest';
import {
  answersOf,
  closeWhenBookChanges,
  contactLines,
  detailsFor,
  keptFrom,
} from '../app/novel/manuscript';

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

describe('answersOf', () => {
  const form = {
    title: '  The Salt Road ',
    byline: 'R. Vale',
    legalName: '',
    contact: '',
    surname: '',
    shortTitle: '',
    font: 'times' as const,
  };

  test('trims each answer and splits the contact into lines', () => {
    expect(answersOf({ ...form, contact: ' 1 Quay Lane \n\nr@vale.example' })).toEqual({
      ...form,
      title: 'The Salt Road',
      contact: ['1 Quay Lane', 'r@vale.example'],
    });
  });

  test('cuts each field and contact line to MAX_DETAIL, so what is exported is what is kept', () => {
    const long = 'x'.repeat(MAX_DETAIL + 50);
    // A pair of surrogates straddling the cut is dropped whole, as the book drops it.
    const straddle = `${'y'.repeat(MAX_DETAIL - 1)}😀z`;
    const typed = answersOf({
      ...form,
      title: long,
      byline: straddle,
      legalName: long,
      surname: long,
      shortTitle: long,
      contact: `${long}\nshort\n${straddle}`,
    });
    expect(typed.title).toHaveLength(MAX_DETAIL);
    expect(typed.byline).toBe('y'.repeat(MAX_DETAIL - 1));
    expect(typed.legalName).toHaveLength(MAX_DETAIL);
    expect(typed.surname).toHaveLength(MAX_DETAIL);
    expect(typed.shortTitle).toHaveLength(MAX_DETAIL);
    expect(typed.contact).toEqual(['x'.repeat(MAX_DETAIL), 'short', 'y'.repeat(MAX_DETAIL - 1)]);
    // Kept in a book and read back, the contact is exactly what was exported.
    const book = writeFacts('# One\n\nText.\n', {
      ...readFacts('# One\n\nText.\n'),
      manuscript: keptFrom(typed, '# One\n\nText.\n', 'one'),
    });
    expect(readFacts(book).manuscript?.contact).toEqual(typed.contact);
    expect(readFacts(book).manuscript?.legalName).toBe(typed.legalName);
  });

  test('keeps at most MAX_CONTACT_LINES contact lines', () => {
    const contact = Array.from({ length: MAX_CONTACT_LINES + 3 }, (_, i) => `line ${i}`).join('\n');
    expect(answersOf({ ...form, contact }).contact).toHaveLength(MAX_CONTACT_LINES);
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
