import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { filler } from './helpers';

const screenplay = builtins['us-screenplay'] as Template;

describe('page labels', () => {
  it('are the page numbers when unlocked', () => {
    const layout = paginate(parse(filler(130)), screenplay);
    expect(layout.pages.length).toBeGreaterThan(2);
    for (const page of layout.pages) expect(page.label).toBe(String(page.number));
  });

  it('are empty on the title page', () => {
    const layout = paginate(parse('Title: Hi\n\nINT. A - DAY\n\nText.\n'), screenplay);
    expect(layout.pages[0].number).toBe(0);
    expect(layout.pages[0].label).toBe('');
  });
});
