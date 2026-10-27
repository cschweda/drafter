import { describe, expect, test } from 'vitest';
import {
  duration,
  lastDays,
  type StatsDay,
  scriptTotals,
  timeTodayLabel,
  wordsTodayLabel,
} from '../app/stats/history';

const MIN = 60_000;
const today = new Date(2026, 9, 27, 15, 0);

const days = (rows: Record<string, StatsDay>) => new Map(Object.entries(rows));

describe('the last 30 days', () => {
  test('lists 30 days, oldest first, today last, with nothing for a day not written', () => {
    const month = lastDays(days({ '2026-10-27': { ms: 5 * MIN, words: 100 } }), today);
    expect(month.days).toHaveLength(30);
    expect(month.days[0]).toEqual({ date: '2026-09-28', words: 0, ms: 0 });
    expect(month.days[29]).toEqual({ date: '2026-10-27', words: 100, ms: 5 * MIN });
  });

  test('counts days written, the best day, the average, and a cutting day', () => {
    const month = lastDays(
      days({
        '2026-10-20': { ms: 10 * MIN, words: 300 },
        '2026-10-21': { ms: 20 * MIN, words: -120 },
        '2026-10-22': { ms: 30 * MIN, words: 600 },
        // Older than 30 days: not in the month.
        '2026-09-01': { ms: 60 * MIN, words: 5000 },
        // Words but no writing time (a file reloaded): not a day written.
        '2026-10-23': { ms: 0, words: 40 },
      }),
      today,
    );
    expect(month.daysWritten).toBe(3);
    expect(month.best).toEqual({ date: '2026-10-22', words: 600 });
    // (300 - 120 + 600) / 3.
    expect(month.average).toBe(260);
    expect(month.days.find((d) => d.date === '2026-10-21')?.words).toBe(-120);
  });

  test('has no best day or average with nothing written, and a best day only when words grew', () => {
    const none = lastDays(days({}), today);
    expect(none).toMatchObject({ daysWritten: 0, best: null, average: null, streak: 0 });
    const cutting = lastDays(days({ '2026-10-27': { ms: MIN, words: -50 } }), today);
    expect(cutting.best).toBeNull();
    expect(cutting.average).toBe(-50);
  });

  test('the streak counts back from today when written, else from yesterday', () => {
    const rows = {
      '2026-10-24': { ms: MIN, words: 1 },
      '2026-10-25': { ms: MIN, words: 1 },
      '2026-10-26': { ms: MIN, words: 1 },
    };
    expect(lastDays(days(rows), today).streak).toBe(3);
    expect(lastDays(days({ ...rows, '2026-10-27': { ms: MIN, words: 0 } }), today).streak).toBe(4);
    // A gap ends it.
    expect(lastDays(days({ '2026-10-25': { ms: MIN, words: 1 } }), today).streak).toBe(0);
  });

  test('counts days across a change of month and of clocks', () => {
    const month = lastDays(days({}), new Date(2026, 2, 30, 1, 0));
    expect(month.days[0]?.date).toBe('2026-03-01');
    expect(month.days[29]?.date).toBe('2026-03-30');
    expect(new Set(month.days.map((d) => d.date)).size).toBe(30);
  });
});

describe('the script as a whole', () => {
  test('totals the writing time, the days written, and the first', () => {
    expect(
      scriptTotals(
        days({
          '2026-10-22': { ms: 30 * MIN, words: 600 },
          '2025-01-05': { ms: 10 * MIN, words: 10 },
          '2024-12-31': { ms: 0, words: 10 },
        }),
      ),
    ).toEqual({ ms: 40 * MIN, daysWritten: 2, firstDay: '2025-01-05' });
    expect(scriptTotals(days({}))).toEqual({ ms: 0, daysWritten: 0, firstDay: null });
  });
});

describe('the labels', () => {
  test('say a writing time in minutes and hours', () => {
    expect(duration(0)).toBe('<1 min');
    expect(duration(59_999)).toBe('<1 min');
    expect(duration(MIN)).toBe('1 min');
    expect(duration(38 * MIN + 59_000)).toBe('38 min');
    expect(duration(60 * MIN)).toBe('1 h 00 min');
    expect(duration(65 * MIN)).toBe('1 h 05 min');
    expect(duration(25 * 60 * MIN)).toBe('25 h 00 min');
    expect(timeTodayLabel(38 * MIN)).toBe('38 min today');
    expect(timeTodayLabel(30_000)).toBe('<1 min today');
  });

  test('say the words added today, with a sign', () => {
    expect(wordsTodayLabel(420)).toBe('+420 words today');
    expect(wordsTodayLabel(1)).toBe('+1 word today');
    expect(wordsTodayLabel(12345)).toBe('+12,345 words today');
    expect(wordsTodayLabel(-35)).toBe('−35 words today');
    expect(wordsTodayLabel(0)).toBe('0 words today');
  });
});
