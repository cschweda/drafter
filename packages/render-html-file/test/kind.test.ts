import type { Layout } from '@drafter/layout';
import { describe, expect, it } from 'vitest';
import { kindLine, runningTime } from '../src/kind';
import { screenplay, stagePlay } from './scripts';

const line = (text: string) => ({ runs: [{ text }] });
/** A layout of a title page and `full` full pages, then a last page printed `tenths` tenths down. */
function laid(full: number, tenths = 0, title = true): Layout {
  const page = (number: number, printed: number) => ({
    number,
    lines: Array.from({ length: 10 }, (_, k) => line(k < printed ? 'x' : '')),
  });
  const pages = [
    ...(title ? [page(0, 3)] : []),
    ...Array.from({ length: full }, (_, k) => page(k + 1, 10)),
    ...(tenths > 0 ? [page(full + 1, tenths)] : []),
  ];
  return { pages } as unknown as Layout;
}

describe('runningTime', () => {
  it('says whole minutes in the words Stats uses', () => {
    expect(runningTime(0)).toBe('Under a minute');
    expect(runningTime(1)).toBe('About 1 min');
    expect(runningTime(59)).toBe('About 59 min');
    expect(runningTime(60)).toBe('About 1 h');
    expect(runningTime(65)).toBe('About 1 h 5 min');
    expect(runningTime(112)).toBe('About 1 h 52 min');
  });
});

describe('kindLine', () => {
  it('counts one page, leaving out the title page', () => {
    expect(kindLine(laid(0, 4), screenplay, 1)).toBe('Screenplay · 1 page · Under a minute');
    expect(kindLine(laid(1, 0), screenplay, 1)).toBe('Screenplay · 1 page · About 1 min');
  });

  it('counts many pages at the rate, in whole minutes', () => {
    expect(kindLine(laid(93, 5), stagePlay, 1.2)).toBe('Stage play · 94 pages · About 1 h 52 min');
    expect(kindLine(laid(59), screenplay, 1)).toBe('Screenplay · 59 pages · About 59 min');
    expect(kindLine(laid(60), screenplay, 1)).toBe('Screenplay · 60 pages · About 1 h');
    expect(kindLine(laid(65), screenplay, 1)).toBe('Screenplay · 65 pages · About 1 h 5 min');
    expect(kindLine(laid(1000), screenplay, 1)).toContain('1,000 pages');
  });

  it('shows a template of the writer’s own as a screenplay, and a script with no pages', () => {
    expect(kindLine(laid(2), { ...screenplay, id: 'mine' }, 1)).toMatch(/^Screenplay · 2 pages/);
    expect(kindLine(laid(0, 0), screenplay, 1)).toBe('Screenplay · 0 pages · Under a minute');
  });
});
