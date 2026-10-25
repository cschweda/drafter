import { readdirSync, readFileSync } from 'node:fs';
import { parse, print } from '@drafter/fountain';
import { describe, expect, it } from 'vitest';

interface ExpectedBlock {
  kind: string;
  line: number;
  forced?: boolean;
  sem?: Record<string, unknown>;
}
interface Expected {
  blocks: ExpectedBlock[];
  diagnostics: Array<{ code: string; line: number }>;
  titlePage?: Record<string, unknown>;
  meta?: unknown;
}

const dir = new URL('../../../fixtures/classification/', import.meta.url);
const names = readdirSync(dir)
  .filter((file) => file.endsWith('.fountain'))
  .sort();

function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

describe('classification fixtures', () => {
  it('finds the fixtures', () => {
    expect(names.length).toBeGreaterThan(0);
  });

  for (const name of names) {
    it(name, () => {
      const source = readFileSync(new URL(name, dir), 'utf8');
      const expected: Expected = JSON.parse(
        readFileSync(new URL(name.replace(/\.fountain$/, '.expected.json'), dir), 'utf8'),
      );
      const doc = parse(source);

      expect(print(doc)).toBe(source);
      expect(doc.blocks.map((b) => ({ kind: b.kind, line: lineOf(source, b.span.from) }))).toEqual(
        expected.blocks.map(({ kind, line }) => ({ kind, line })),
      );
      expected.blocks.forEach((want, i) => {
        const block = doc.blocks[i];
        if (want.forced !== undefined) expect(block?.forced, `block ${i} forced`).toBe(want.forced);
        if (want.sem) expect(block?.sem, `block ${i} sem`).toMatchObject(want.sem);
      });
      expect(
        doc.diagnostics.map((d) => ({ code: d.code, line: lineOf(source, d.span.from) })),
      ).toEqual(expected.diagnostics);
      if (expected.titlePage) expect(doc.titlePage).toMatchObject(expected.titlePage);
      if ('meta' in expected) expect(doc.meta).toEqual(expected.meta);
    });
  }
});
