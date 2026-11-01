import { describe, expect, test } from 'vitest';
import {
  draftDay,
  markerLine,
  milestoneLabel,
  paletteLabel,
  readerHeader,
  restoredLine,
  sameQuestion,
  shortId,
  wordsOf,
} from '../app/drafts/labels';
import type { DraftRow } from '../app/drafts/store';

// The words the drafts use (drafts-and-cuts design §2): "Draft 3", a 7-character ID, the marker
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
      'Draft 3 · a3f9c2e — from Sam’s notes',
    );
    expect(milestoneLabel(row(1, A))).toBe('Draft 1 · a3f9c2e');
  });

  test('the marker says what a draft builds on', () => {
    const rows = [row(2, B), row(1, A)];
    expect(markerLine(1, undefined, rows)).toBe('Draft 1 begins');
    expect(markerLine(2, undefined, rows)).toBe('Draft 2 begins — builds on Draft 1 (a3f9c2e)');
    expect(markerLine(3, undefined, rows)).toBe('Draft 3 begins — builds on Draft 2 (7b1e04d)');
    expect(markerLine(3, { n: 1, id: A }, rows)).toBe('Draft 3 begins — from Draft 1 (a3f9c2e)');
  });

  test('the same text asks before a new number', () => {
    expect(sameQuestion(4)).toBe('This text is the same as Draft 4. Start Draft 5 anyway?');
  });

  test('the palette, the reader, and Restore say which draft', () => {
    expect(paletteLabel(row(2, A))).toBe('Draft 2 · a3f9c2e · 12 Oct 2026');
    expect(paletteLabel(row(2, A), 'Boca')).toBe('Draft 2 · a3f9c2e · 12 Oct 2026 · Boca');
    expect(readerHeader(row(2, A))).toBe('Draft 2 · a3f9c2e · read-only');
    expect(restoredLine(3, 5)).toBe(
      'Draft 3’s text is now Draft 5. Undo brings back what it replaced.',
    );
  });

  test('words are counted with a thousands comma', () => {
    expect(wordsOf(1)).toBe('1 word');
    expect(wordsOf(12034)).toBe('12,034 words');
  });
});
