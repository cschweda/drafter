import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TextChange } from '@drafter/fountain';
import { lock } from '@drafter/production';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { drafter, tempDir } from './helpers';

const template = builtins['us-screenplay'] as Template;

function apply(text: string, changes: readonly TextChange[]): string {
  let out = text;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}

const paragraphs = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `Line ${from + i} of the hall.\n`).join('\n');
const UNLOCKED = `Title: The Hall\nAuthor: Wren Okafor\n\nINT. HALL - DAY\n\n${paragraphs(1, 120)}`;

/** The script locked on 9 November 2026, then 15 new paragraphs on page 2: its end goes to 2A. */
async function lockedEdited(): Promise<string> {
  const text = apply(
    UNLOCKED,
    await lock(UNLOCKED, template, { today: '2026-11-09', draftId: 'd1', firstScene: 1 }),
  );
  const at = text.indexOf('Line 40 of');
  return `${text.slice(0, at)}${paragraphs(1000, 15)}\n${text.slice(at)}`;
}

describe('drafter build on a locked script', () => {
  const dir = tempDir();

  test('plain text prints the locked pages, at their labels', async () => {
    const file = join(dir(), 'hall.fountain');
    writeFileSync(file, await lockedEdited());
    const result = await drafter('build', file, '--txt', '-');
    expect(result.code).toBe(0);
    const numbers = result.out
      .split('\f')
      .map((page) => /\S+\.$/m.exec(page.split('\n')[3] ?? '')?.[0]);
    expect(numbers.slice(2, 5)).toEqual(['2.', '2A.', '3.']);
  });

  test('the HTML pages carry the labels and the open revision’s header', async () => {
    const file = join(dir(), 'hall.fountain');
    writeFileSync(file, await lockedEdited());
    const result = await drafter('build', file, '--html', '-');
    expect(result.code).toBe(0);
    const furniture = (kind: string) =>
      [...result.out.matchAll(new RegExp(`data-furniture="${kind}"[^>]*>([^<]*)<`, 'g'))].map(
        (m) => m[1],
      );
    expect(furniture('number').slice(0, 3)).toEqual(['2.', '2A.', '3.']);
    const headers = furniture('revision');
    expect(headers.length).toBeGreaterThan(0);
    expect(headers.every((text) => /^\S+ Revision — 9 November 2026$/.test(text ?? ''))).toBe(true);
  });

  test('an unlocked script prints as before', async () => {
    const file = join(dir(), 'hall.fountain');
    writeFileSync(file, UNLOCKED);
    const result = await drafter('build', file, '--txt', '-');
    expect(result.code).toBe(0);
    expect(result.out).not.toContain('2A.');
    expect(result.out).not.toContain('Revision');
  });
});
