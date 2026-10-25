import { readdirSync, readFileSync } from 'node:fs';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { builtins, loadTemplate, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { firstPart, lineOf, pageNumbered, parts, text } from './helpers';

interface Expected {
  template: string;
  pages: number;
  firstLineOf: Record<string, { page: number; line: number; col?: number }>;
  synthetic?: Array<{ page: number; line: number; col: number; text: string }>;
  textOf?: Record<string, string>;
  diagnostics?: Array<{ code: string; line: number }>;
}

const dir = new URL('../../../fixtures/layout/', import.meta.url);
const names = readdirSync(dir)
  .filter((file) => file.endsWith('.fountain'))
  .map((file) => file.replace(/\.fountain$/, ''))
  .sort();

function templateFor(spec: string): Template {
  if (spec.endsWith('.json'))
    return loadTemplate(JSON.parse(readFileSync(new URL(spec, dir), 'utf8')));
  const template = builtins[spec];
  if (!template) throw new Error(`no built-in template "${spec}"`);
  return template;
}

describe('layout fixtures (hand-derived; see fixtures/layout/*.derivation.md)', () => {
  it('finds the fixtures', () => {
    expect(names.length).toBeGreaterThan(0);
  });

  for (const name of names) {
    it(name, () => {
      const source = readFileSync(new URL(`${name}.fountain`, dir), 'utf8');
      const expected: Expected = JSON.parse(
        readFileSync(new URL(`${name}.expected.json`, dir), 'utf8'),
      );
      const doc = parse(source);
      const layout = paginate(doc, templateFor(expected.template));
      const blockAtLine = new Map(doc.blocks.map((b, i) => [lineOf(source, b.span.from), i]));

      expect(layout.pages.length, 'pages').toBe(expected.pages);
      for (const [line, want] of Object.entries(expected.firstLineOf)) {
        const index = blockAtLine.get(Number(line));
        expect(index, `a block starts at source line ${line}`).toBeDefined();
        const at = layout.index[index as number];
        expect(at && { page: at.page, line: at.line }, `source line ${line}`).toEqual({
          page: want.page,
          line: want.line,
        });
        if (want.col !== undefined) {
          expect(firstPart(layout, index as number)?.col, `col of source line ${line}`).toBe(
            want.col,
          );
        }
      }
      for (const want of expected.synthetic ?? []) {
        const row = pageNumbered(layout, want.page)?.lines[want.line];
        const found = row && parts(row).find((part) => part.synthetic && text(part) === want.text);
        expect(
          found && { col: found.col },
          `"${want.text}" on page ${want.page}, line ${want.line}`,
        ).toEqual({
          col: want.col,
        });
      }
      for (const [line, want] of Object.entries(expected.textOf ?? {})) {
        const index = blockAtLine.get(Number(line)) as number;
        expect(text(firstPart(layout, index)), `text of source line ${line}`).toBe(want);
      }
      expect(
        layout.diagnostics.map((d) => ({ code: d.code, line: lineOf(source, d.span.from) })),
      ).toEqual(expected.diagnostics ?? []);
    });
  }
});
