import { describe, expect, test } from 'vitest';
import { dayOf, foldText, progressLabel } from '../app/history/labels';

// Words the history views share (version-history design §3.3, §6).

const NOW = new Date(2026, 9, 30, 15, 0).getTime();

describe('history labels', () => {
  test('a day in a sentence', () => {
    expect(dayOf(new Date(2026, 9, 30, 9, 0).getTime(), NOW)).toBe('today');
    expect(dayOf(new Date(2026, 9, 29, 9, 0).getTime(), NOW)).toBe('yesterday');
    expect(dayOf(new Date(2026, 9, 27, 10, 42).getTime(), NOW)).toBe('Tuesday, 27 October');
    expect(dayOf(new Date(2025, 0, 5).getTime(), NOW)).toBe('Sunday, 5 January 2025');
  });

  test('a filter folds case and accents', () => {
    expect(foldText('  Señor  PÉREZ ')).toBe('senor perez');
  });

  test('a scan reads', () => {
    expect(progressLabel(120, 300)).toBe('Reading versions… 120 of 300');
  });
});
