import { describe, expect, test } from 'vitest';
import {
  draftDay,
  draftName,
  markerLine,
  milestoneLabel,
  padDraft,
  paletteLabel,
  readerHeader,
  restoredLine,
  sameQuestion,
  shortId,
  typedDraftNumber,
  wordsOf,
} from '../app/drafts/labels';
import type { DraftRow } from '../app/drafts/store';

// The words the drafts use (drafts-and-cuts design §2): "Draft 03", a 7-character ID, the marker
// that says a new version began, and the question before freezing the same text again.

const A = `a3f9c2e${'0'.repeat(57)}`;
const B = `7b1e04d${'1'.repeat(57)}`;
const at = new Date(2026, 9, 12, 10, 42).getTime();
const row = (n: number, id: string, extra: Partial<DraftRow> = {}): DraftRow => ({
  key: `p:${n}`,
  projectId: 'p',
  n,
  id,
  frozenAt: at,
  note: '',
  words: 1200,
  ...extra,
});

describe('the drafts’ words', () => {
  test('a short ID is the first 7 characters', () => {
    expect(shortId(A)).toBe('a3f9c2e');
  });

  test('a day is day, month, and year', () => {
    expect(draftDay(at)).toBe('12 Oct 2026');
  });

  test('a milestone names the draft, its ID, and its note', () => {
    expect(milestoneLabel(row(3, A, { note: 'from Sam’s notes' }))).toBe(
      'Draft 03 · a3f9c2e — from Sam’s notes',
    );
    expect(milestoneLabel(row(1, A))).toBe('Draft 01 · a3f9c2e');
  });

  test('the marker says what a draft builds on', () => {
    const rows = [row(2, B), row(1, A)];
    expect(markerLine(1, undefined, rows)).toBe('Draft 01 begins');
    expect(markerLine(2, undefined, rows)).toBe('Draft 02 begins — builds on Draft 01 (a3f9c2e)');
    expect(markerLine(3, undefined, rows)).toBe('Draft 03 begins — builds on Draft 02 (7b1e04d)');
    expect(markerLine(3, { n: 1, id: A }, rows)).toBe('Draft 03 begins — from Draft 01 (a3f9c2e)');
  });

  test('the same text asks before a new number', () => {
    expect(sameQuestion(4)).toBe('This text is the same as Draft 04. Start Draft 05 anyway?');
  });

  test('the palette, the reader, and Restore say which draft', () => {
    expect(paletteLabel(row(2, A))).toBe('Draft 02 · a3f9c2e · 12 Oct 2026');
    expect(paletteLabel(row(2, A), 'Boca')).toBe('Draft 02 · a3f9c2e · 12 Oct 2026 · Boca');
    expect(readerHeader(row(2, A))).toBe('Draft 02 · a3f9c2e · read-only');
    expect(restoredLine(3, 5)).toBe(
      'Draft 03’s text is now Draft 05. Undo brings back what it replaced.',
    );
  });

  test('numbers have a leading zero: two digits, three past 99', () => {
    expect(padDraft(1)).toBe('01');
    expect(padDraft(99)).toBe('99');
    expect(padDraft(100)).toBe('100');
    expect(draftName(7)).toBe('Draft 07');
    expect(draftName(123)).toBe('Draft 123');
  });

  test('a typed number finds its draft, with or without the zero or the word', () => {
    for (const typed of ['2', '02', 'draft 2', 'Draft 02', ' DRAFT02 '])
      expect(typedDraftNumber(typed), typed).toBe(2);
    expect(typedDraftNumber('100')).toBe(100);
    for (const typed of ['0', '', 'draft', 'a3f9', '2a', 'Draft -2'])
      expect(typedDraftNumber(typed), typed).toBeNull();
  });

  test('words are counted with a thousands comma', () => {
    expect(wordsOf(1)).toBe('1 word');
    expect(wordsOf(12034)).toBe('12,034 words');
  });
});
