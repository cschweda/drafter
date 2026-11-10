import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { renderPdf } from '@drafter/render-pdf';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { fonts, objects, operators } from './helpers';

const template = builtins['us-screenplay'] as Template;
const layout = paginate(parse('Title: Tinted\n\nINT. HALL - DAY\n\nMargaret waits.\n'), template);

describe('tint', () => {
  it('draws a page rectangle in the color, under the text', async () => {
    const bytes = await renderPdf(layout, template, { fonts, tint: '#3366ff' });
    const body = await operators(bytes, layout.pages.length - 1);
    const fill = body.indexOf('0.2 0.4 1 rg');
    expect(fill).toBeGreaterThanOrEqual(0);
    expect(body).toContain('612 792 l');
    expect(fill).toBeLessThan(body.indexOf('BT'));
    expect((await objects(bytes)).some((o) => o.includes('/ca 0.12'))).toBe(true);
  });

  it('leaves the title page untinted', async () => {
    const bytes = await renderPdf(layout, template, { fonts, tint: '#3366ff' });
    expect(layout.pages[0]?.number).toBe(0);
    expect(await operators(bytes, 0)).not.toContain('612 792 l');
  });

  it('rejects a tint that is not #rrggbb', async () => {
    const plain = await renderPdf(layout, template, { fonts });
    for (const tint of ['blue', '#fff', '#12345g', 'javascript:1', '']) {
      const bytes = await renderPdf(layout, template, { fonts, tint });
      expect(bytes).toEqual(plain);
    }
  });
  it('tints each page in its own colour when given one per page', async () => {
    const long = paginate(
      parse(`INT. HALL - DAY\n\n${'Margaret waits.\n\n'.repeat(80)}`),
      template,
    );
    expect(long.pages.length).toBeGreaterThan(1);
    const colours: Record<number, string | null> = { 1: '#3366ff', 2: '#ff6699' };
    const bytes = await renderPdf(long, template, {
      fonts,
      tint: (page) => colours[page.number] ?? null,
    });
    expect(await operators(bytes, 0)).toContain('0.2 0.4 1 rg');
    expect(await operators(bytes, 1)).toContain('1 0.4 0.6 rg');
    if (long.pages.length > 2) expect(await operators(bytes, 2)).not.toContain('612 792 l');
    // A colour that isn't #rrggbb tints nothing.
    const bad = await renderPdf(long, template, { fonts, tint: () => 'blue' });
    expect(bad).toEqual(await renderPdf(long, template, { fonts }));
  });
});
