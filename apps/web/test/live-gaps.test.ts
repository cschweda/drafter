// @vitest-environment jsdom
import { changesOf, markPages, type PageMarks } from '@drafter/compare';
import { parse } from '@drafter/fountain';
import { type Layout, paginate } from '@drafter/layout';
import { buildPage } from '@drafter/render-html';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, describe, expect, test } from 'vitest';
import { markPage, rowOf } from '../app/compare/draw';
import { decorateLive } from '../app/compare/live';

// Show changes' removed-lines markers (version-history design §4.3), and Compare's Pages markers,
// which share their placement: the rule sits in the blank row above the line it is before (or on
// that row's top edge when there is none), so it never crosses a live line; Escape closes the
// lines it shows and puts focus back on its button; one is open at a time; and marking the pages
// again keeps what was open and what had focus.

const template = builtins['us-screenplay'] as Template;

const BEFORE = [
  'INT. HALL - DAY',
  '',
  'She paces by the door.',
  '',
  'The phone rings.',
  '',
  'Nobody answers it.',
  '',
  'MARRA',
  'Who is it?',
  '',
  'EXT. ROOF - NIGHT',
  '',
  'Wind.',
  '',
  'A gutter falls.',
  '',
].join('\n');
const AFTER = BEFORE.replace('Nobody answers it.\n\n', '').replace('A gutter falls.\n', '');

function pageOf(older: string, newer: string): { el: HTMLElement; marks: PageMarks } {
  const layout: Layout = paginate(parse(newer), template);
  const page = layout.pages[0];
  if (!page) throw new Error('no page');
  const el = buildPage(document, page, template);
  document.body.append(el);
  return { el, marks: markPages(layout, changesOf(older, newer)) };
}

/** The rows the page's own lines stand on. */
const rowsOf = (el: HTMLElement) =>
  new Set([...el.querySelectorAll<HTMLElement>('.drafter-line[data-from]')].map(rowOf));

const gapsOf = (el: HTMLElement, cls: string) => [...el.querySelectorAll<HTMLElement>(cls)];
const buttonOf = (gap: HTMLElement) => gap.querySelector('button') as HTMLButtonElement;
const press = (target: Element, key: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

afterEach(() => {
  document.body.replaceChildren();
});

describe('removed-lines markers', () => {
  for (const [name, cls, draw] of [
    [
      'Show changes',
      '.live-gap',
      (el: HTMLElement, marks: PageMarks) =>
        decorateLive(el, { number: 1 } as Parameters<typeof decorateLive>[1], marks),
    ],
    [
      "Compare's Pages",
      '.compare-gap',
      (el: HTMLElement, marks: PageMarks) => markPage(el, 1, marks),
    ],
  ] as const) {
    test(`${name}: the rule is in the blank row above, or on the edge of a row with none`, () => {
      const { el, marks } = pageOf(BEFORE, AFTER);
      draw(el, marks);
      const taken = rowsOf(el);
      const gaps = gapsOf(el, cls);
      expect(gaps).toHaveLength(2);
      for (const gap of gaps) {
        const at = Number(gap.style.getPropertyValue('--row'));
        // Never inside a row with a line on it.
        if (!Number.isInteger(at)) expect(taken.has(Math.floor(at))).toBe(false);
        // Mid-row exactly when the row above the line it is before is blank.
        const below = Math.ceil(at);
        expect(Number.isInteger(at)).toBe(taken.has(below - 1));
        // The lines it shows open on the row edge below the rule.
        expect(Number(gap.style.getPropertyValue('--drop'))).toBe(below - at);
      }
      // The first is before MARRA, whose row above is blank; the last is after the last line.
      expect(Number.isInteger(Number(gaps[0]?.style.getPropertyValue('--row')))).toBe(false);
      expect(Number.isInteger(Number(gaps[1]?.style.getPropertyValue('--row')))).toBe(true);
    });

    test(`${name}: one open at a time, and Escape closes it and focuses its button`, () => {
      const { el, marks } = pageOf(BEFORE, AFTER);
      draw(el, marks);
      const [first, second] = gapsOf(el, cls).map(buttonOf) as [
        HTMLButtonElement,
        HTMLButtonElement,
      ];
      first.click();
      expect(first.getAttribute('aria-expanded')).toBe('true');
      second.click();
      expect(second.getAttribute('aria-expanded')).toBe('true');
      expect(first.getAttribute('aria-expanded')).toBe('false');
      const firstLines = document.getElementById(first.getAttribute('aria-controls') ?? '');
      expect(firstLines?.hidden).toBe(true);
      const secondLines = document.getElementById(second.getAttribute('aria-controls') ?? '');
      (document.body as HTMLElement).focus();
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      secondLines?.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(second.getAttribute('aria-expanded')).toBe('false');
      expect(secondLines?.hidden).toBe(true);
      expect(document.activeElement).toBe(second);
      // Escape with nothing open is left to the pane.
      expect(press(second, 'Escape')).toBe(true);
    });

    test(`${name}: the box holds the lines with text, not the blank lines around them`, () => {
      const { el, marks } = pageOf(BEFORE, AFTER);
      draw(el, marks);
      const first = buttonOf(gapsOf(el, cls)[0] as HTMLElement);
      expect(first.textContent).toContain('1 line removed');
      const held = document.getElementById(first.getAttribute('aria-controls') ?? '');
      expect([...(held?.children ?? [])].map((line) => line.textContent)).toEqual([
        'Nobody answers it.',
      ]);
    });

    test(`${name}: the hidden words can't be selected and copied`, () => {
      const { el, marks } = pageOf(BEFORE.replace('Wind.', 'Rain.'), AFTER);
      draw(el, marks);
      const said = el.querySelectorAll('[data-change] > .drafter-sr-only');
      expect(said.length).toBeGreaterThan(0);
      for (const s of said) expect(s.classList.contains('change-said')).toBe(true);
    });
  }

  test('marking the pages again keeps an open marker open and the focus where it was', () => {
    const { el, marks } = pageOf(BEFORE.replace('Wind.', 'Rain.'), AFTER);
    const page = { number: 1 } as Parameters<typeof decorateLive>[1];
    decorateLive(el, page, marks);
    const button = buttonOf(gapsOf(el, '.live-gap')[0] as HTMLElement);
    button.click();
    button.focus();
    // The same changes, marked again (a layout's marks come again as a new object).
    const again: PageMarks = structuredClone(marks);
    decorateLive(el, page, again);
    const now = buttonOf(gapsOf(el, '.live-gap')[0] as HTMLElement);
    expect(now).not.toBe(button);
    expect(now.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(now);
    // A marked line with focus keeps it too.
    const line = el.querySelector<HTMLElement>('.live-mark') as HTMLElement;
    line.focus();
    decorateLive(el, page, structuredClone(marks));
    expect(document.activeElement?.classList.contains('live-mark')).toBe(true);
    expect(document.activeElement?.textContent).toBe(line.textContent);
  });

  test('marking again keeps a marker open but never takes focus from outside the page', () => {
    const { el, marks } = pageOf(BEFORE, AFTER);
    const page = { number: 1 } as Parameters<typeof decorateLive>[1];
    decorateLive(el, page, marks);
    buttonOf(gapsOf(el, '.live-gap')[0] as HTMLElement).click();
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    decorateLive(el, page, structuredClone(marks));
    expect(document.activeElement).toBe(input);
    expect(buttonOf(gapsOf(el, '.live-gap')[0] as HTMLElement).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });
});
