import { readFileSync } from 'node:fs';
import { parse } from '@drafter/fountain';
import { type Layout, paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { lockedPagesOf } from '../src/layout';
import type { LockedPage } from '../src/types';

// The test that must not fail (docs/plans/2026-11-21-sentence-page-breaks.md, §7): a script locked
// by v0.27.1 keeps every page exactly. Each fixture is a script, the page map v0.27.1's lock
// recorded for it (a source line and a count of printed lines), and the pages v0.27.1 then printed.
// They were made by v0.27.1's engine and are never to be regenerated with a later one.
interface Fixture {
  template: string;
  editLine: number;
  added: string;
  pages: Array<[string, number, number]>;
  partway: number;
  printed: Array<{ label: string; lines: string[] }>;
  afterEdit: Array<{ label: string; first: string }>;
}
const read = (name: string) =>
  readFileSync(new URL(`fixtures/v0271/${name}`, import.meta.url), 'utf8');
const texts = (layout: Layout) =>
  layout.pages
    .filter((p) => p.number > 0)
    .map((p) => ({
      label: p.label,
      lines: p.lines.map((l) =>
        `${' '.repeat(l.col)}${l.runs.map((r) => r.text).join('')}`.trimEnd(),
      ),
    }));

for (const [script, file] of [
  ['prose', 'prose.us-screenplay.json'],
  ['base', 'base.us-screenplay.json'],
  ['prose', 'prose.stage-play-standard.json'],
] as const) {
  describe(`a script locked by v0.27.1: ${file}`, () => {
    const fixture = JSON.parse(read(file)) as Fixture;
    const template = builtins[fixture.template] as Template;
    const source = read(`${script}.fountain`);
    const pages: LockedPage[] = fixture.pages.map(([label, line, printed]) => ({
      label,
      line,
      printed,
    }));

    it('has pages that start partway into a paragraph or a speech', () => {
      expect(fixture.partway).toBeGreaterThan(0);
      expect(pages.filter((p) => p.printed > 0)).toHaveLength(fixture.partway);
    });

    it('prints every page as v0.27.1 did, line for line', () => {
      const layout = paginate(parse(source), template, {
        locked: lockedPagesOf(pages, source, source),
      });
      const now = texts(layout);
      expect(now.map((p) => p.label)).toEqual(fixture.printed.map((p) => p.label));
      now.forEach((page, k) => {
        expect(page.lines, `page ${page.label}`).toEqual(fixture.printed[k]?.lines);
      });
    });

    it('starts every locked page at the same line after an edit', () => {
      const lines = source.split('\n');
      lines.splice(fixture.editLine, 0, fixture.added, '');
      const current = lines.join('\n');
      const layout = paginate(parse(current), template, {
        locked: lockedPagesOf(pages, source, current),
      });
      const first = (label: string) =>
        texts(layout)
          .find((p) => p.label === label)
          ?.lines.find((l) => l.trim() !== '');
      // The pages the edit overflows onto (4A) may break elsewhere now; the locked ones may not.
      const lockedOnes = fixture.afterEdit.filter((p) => /^\d+$/.test(p.label));
      expect(lockedOnes.length).toBe(pages.length);
      for (const page of lockedOnes)
        expect(first(page.label), `page ${page.label}`).toBe(page.first);
    });
  });
}
