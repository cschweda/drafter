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
});
