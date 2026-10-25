import { readFileSync } from 'node:fs';
import { renderText } from '@drafter/cli';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { repo } from './helpers';

const screenplay = builtins['us-screenplay'] as Template;
const text = (source: string, template = screenplay) =>
  renderText(paginate(parse(source), template), template);
const pagesOf = (file: string) =>
  text(readFileSync(repo(file), 'utf8'))
    .split('\f')
    .map((page) => page.split('\n'));

describe('renderText', () => {
  it('puts each line at its column, inside the margins', () => {
    const [title, first] = pagesOf('fixtures/layout/short.fountain');
    expect(title?.[6 + 16]).toBe(`${' '.repeat(15 + 27)}Short`);
    expect(first?.[6]).toBe(`${' '.repeat(15)}INT. HALL - DAY`);
    expect(first?.[6 + 50]).toBe(`${' '.repeat(15 + 53)}CUT TO:`);
  });

  it('numbers pages in the top margin', () => {
    const pages = pagesOf('fixtures/layout/short.fountain');
    expect(pages[1]?.[3]).toBe('');
    expect(pages[2]?.[3]).toBe(`${' '.repeat(15 + 58)}2.`);
  });

  it('prints dual dialogue side by side', () => {
    const [page] = pagesOf('fixtures/layout/dual.fountain');
    expect(page?.[6 + 2]).toBe(`${' '.repeat(15 + 8)}MARGARET${' '.repeat(24)}DANNY`);
    expect(page?.[6 + 3]).toBe(`${' '.repeat(15)}You can't just turn up${' '.repeat(14)}(wet)`);
  });

  it('separates pages with form feeds and leaves no trailing spaces', () => {
    const output = text(readFileSync(repo('fixtures/layout/short.fountain'), 'utf8'));
    expect(output.split('\f')).toHaveLength(4);
    expect(output.split('\n').some((line) => line.endsWith(' '))).toBe(false);
    // Each page stops at its last printed line; the form feed does the rest.
    expect(output.split('\f').map((page) => page.endsWith('\n\n'))).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(output.endsWith('\n')).toBe(true);
  });

  it('prints control characters as spaces, C1 included', () => {
    expect(text('Bell\u0007rings\u009b.').split('\n')[6]).toBe(`${' '.repeat(15)}Bell rings .`);
  });

  it('prints nothing for an empty script', () => {
    expect(text('')).toBe('');
  });
});
