import { describe, expect, it } from 'vitest';
import { type DocItem, layoutDocument } from '../src/document/layout';
import { STYLE } from '../src/document/style';
import { fixedMeasure, MISSING, md } from './document-helpers';

const layout = (source: string, paper: 'letter' | 'a4' = 'letter') =>
  layoutDocument(md(source), { paper, measure: fixedMeasure });
const ofKind = <K extends DocItem['kind']>(items: DocItem[], kind: K) =>
  items.filter((item): item is Extract<DocItem, { kind: K }> => item.kind === kind);
const bars = (items: DocItem[]) =>
  ofKind(items, 'line').filter((line) => line.thickness === STYLE.quoteBar);

describe('layoutDocument', () => {
  it('lays a page out at the paper’s size, text from the top-left of the text area', () => {
    const { width, height, pages, missing } = layout('Ost vorn.', 'a4');
    expect([width, height]).toEqual([595.28, 841.89]);
    expect(missing).toEqual([]);
    const [text] = ofKind(pages[0]?.items ?? [], 'text');
    // The first line's top is the text area's; its baseline sits its ascent below.
    expect(text).toMatchObject({ kind: 'text', x: 72, text: 'Ost vorn.', face: 'text', size: 11 });
    expect(text?.y).toBeCloseTo(841.89 - 72 - (2.5 + 8.8), 6);
  });

  it('wraps at the paper’s text width', () => {
    // fixedMeasure: 5.5 pt a character at 11 pt; 468 pt holds 85 of them, 451.28 holds 82.
    const word = 'q'.repeat(84);
    expect(ofKind(layout(word, 'letter').pages[0]?.items ?? [], 'text')).toHaveLength(1);
    expect(ofKind(layout(word, 'a4').pages[0]?.items ?? [], 'text')).toHaveLength(2);
  });

  it('reports the characters the fonts lack, in the order first seen', () => {
    const c = String.fromCodePoint(MISSING);
    expect(layout(`# ${c}\n\nOst ${c} ulm.`).missing).toEqual([c]);
  });

  it('draws a quote’s bar unbroken between its paragraphs, and two quotes with two bars', () => {
    const one = bars(layout('> Vorn ost.\n>\n> Ulm plenk.').pages[0]?.items ?? []);
    expect(one).toHaveLength(1);
    const bar = one[0] as Extract<DocItem, { kind: 'line' }>;
    expect(bar.x1).toBe(72 + STYLE.quoteBar / 2);
    // From the first line's top, through the 8 pt between the paragraphs, to the last line's bottom.
    expect(bar.y1 - bar.y2).toBeCloseTo(16 + 8 + 16, 6);
    expect(bar.y1).toBeCloseTo(792 - 72, 6);

    expect(bars(layout('> Vorn ost.\n\n> Ulm plenk.').pages[0]?.items ?? [])).toHaveLength(2);
    // A quote in a quote: the outer bar runs the whole height, the inner only its own.
    const nested = bars(layout('> Vorn.\n>\n> > Ost.\n>\n> Ulm.').pages[0]?.items ?? []);
    expect(nested.map((line) => [line.x1, Math.round(line.y1 - line.y2)])).toEqual(
      expect.arrayContaining([
        [73, 16 * 3 + 8 * 2],
        [89, 16],
      ]),
    );
  });

  it('draws each page’s part of a code panel and of a quote’s bar', () => {
    // A code block of 100 lines splits across pages; inside a quote, so the bar splits too.
    const code = Array.from({ length: 100 }, (_, i) => `> ${'q'.repeat(i % 30)}`).join('\n');
    const { pages } = layout(`> \`\`\`\n${code}\n> \`\`\``);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      const panels = ofKind(page.items, 'rect');
      expect(panels).toHaveLength(1);
      const panel = panels[0] as Extract<DocItem, { kind: 'rect' }>;
      expect(panel.x).toBe(72 + STYLE.quoteIndent);
      expect(panel.width).toBe(468 - STYLE.quoteIndent);
      const [bar] = bars(page.items);
      // The bar runs the panel's height on each page.
      expect(bar?.y1).toBeCloseTo(panel.y + panel.height, 6);
      expect(bar?.y2).toBeCloseTo(panel.y, 6);
    }
    // The padding is only at the panel's real top and bottom.
    const first = ofKind(pages[0]?.items ?? [], 'rect')[0];
    expect(first?.y).toBeCloseTo(72 + ((648 - STYLE.codePadding) % STYLE.codeLeading), 6);
  });

  it('gives a link a rectangle its line’s height and an underline', () => {
    const items = layout('Ost [vorn ulm](<https://example.com/a b>) plenk.').pages[0]?.items ?? [];
    const [link] = ofKind(items, 'link');
    const text = ofKind(items, 'text').find((t) => t.text === 'vorn ulm');
    expect(link).toMatchObject({ uri: 'https://example.com/a%20b', height: 16, width: 44 });
    expect(link?.x).toBe(text?.x);
    const underline = ofKind(items, 'line').find((line) => line.color === 'link');
    expect(underline).toMatchObject({ thickness: 0.5, x1: text?.x, x2: (text?.x ?? 0) + 44 });
    expect(underline?.y1).toBeCloseTo((text?.y ?? 0) - 1.5, 6);
    // An address that isn't http, https, or mailto: neither.
    const plain = layout('[vorn](javascript:ost)').pages[0]?.items ?? [];
    expect(ofKind(plain, 'link')).toEqual([]);
    expect(ofKind(plain, 'line')).toEqual([]);
  });

  it('draws a rule across the text width at its indent', () => {
    const [rule] = ofKind(layout('Ost.\n\n---\n\nVorn.').pages[0]?.items ?? [], 'line');
    expect(rule).toMatchObject({ x1: 72, x2: 540, thickness: STYLE.ruleThickness, color: 'rule' });
    expect(rule?.y1).toBe(rule?.y2);
  });

  it('numbers pages only when there are two or more', () => {
    expect(layout('Ost.').pages[0]?.items.filter((i) => i.kind === 'text')).toHaveLength(1);
    expect(layout('').pages).toEqual([{ items: [] }]);
    const long = Array.from({ length: 40 }, () => 'Vorn ost ulm plenk.').join('\n\n');
    const { pages } = layout(long);
    expect(pages.length).toBe(2);
    expect(pages.map((page) => ofKind(page.items, 'text').find((t) => t.y === 36)?.text)).toEqual([
      '1',
      '2',
    ]);
  });
});
