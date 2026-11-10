import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { renderPdf } from '@drafter/render-pdf';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { fonts, operators } from './helpers';

const template = builtins['us-screenplay'] as Template;
const layout = paginate(parse('INT. HALL - DAY\n\nMargaret waits.\n\nShe leaves.\n'), template);
const page = layout.pages.find((p) => p.number === 1);
const index = layout.pages.findIndex((p) => p.number === 1);
const count = (ops: string) => (ops.match(/ l\n/g) ?? []).length;

describe('crossOut', () => {
  it('draws one line per range, corner to corner of the block', async () => {
    expect(page && page.lines.length > 2).toBe(true);
    const base = count(await operators(await renderPdf(layout, template, { fonts }), index));
    const bytes = await renderPdf(layout, template, {
      fonts,
      crossOut: [{ page: 1, from: 0, to: 2 }],
    });
    const ops = await operators(bytes, index);
    expect(count(ops)).toBe(base + 1);
    // left margin 15 cols = 108 pt; right edge (85 - 15 - ... ) from the template; top of line 0, bottom of line 2.
    const { margin, width } = template.page;
    const x0 = margin.left * 7.2;
    const x1 = (width - margin.right) * 7.2;
    const top = 792 - margin.top * 12;
    const bottom = 792 - (margin.top + 3) * 12;
    expect(ops).toContain(`${x0} ${top} m`);
    expect(ops).toContain(`${x1} ${bottom} l`);
    expect(ops).toContain('1 w');
  });

  it('ignores ranges on pages that do not exist', async () => {
    const plain = await renderPdf(layout, template, { fonts });
    const bytes = await renderPdf(layout, template, {
      fonts,
      crossOut: [{ page: 99, from: 0, to: 1 }],
    });
    expect(bytes).toEqual(plain);
  });
});
