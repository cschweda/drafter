import { parse } from '@drafter/fountain';
import { type Layout, type LayoutLine, type PaginateOptions, paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { pagesHtml } from '../src/pages';
import { colClass, rowClass } from '../src/rules';
import { STYLESHEET } from '../src/style';

const screenplay = builtins['us-screenplay'] as Template;
const stagePlay = builtins['stage-play-standard'] as Template;

/** A short screenplay of our own: a title page, scenes, a speech, dual dialogue, and styles. */
const SCREENPLAY = `Title: The Salt Road
Credit: Written by
Author: Wren Okafor
Draft date: 30 October 2026
Contact:
    Wren Okafor
    12 Harbour Lane

INT. LIGHTHOUSE KITCHEN - NIGHT

Rain needles the window. A kettle begins to shake on the stove.

MARA
(not looking up)
You left the lamp burning again.

JONAH
Somebody has to.

TESSA
It's mine tonight.

DECLAN ^
No, it's mine.

EXT. CLIFF PATH - CONTINUOUS

Mara climbs. **The wind** takes her *scarf* and _flings_ it out over ***the water***.

> THE END <
`;

/** A short stage play of our own: an act, a scene, speech, and a stage direction. */
const STAGE_PLAY = `# ACT ONE

## SCENE 1

A ferry waiting room. Benches. A clock that has stopped.

ODILE
(to no one)
The boat is late.

BASTIEN
The boat is always late.

ODILE
Then it is on time.
`;

/** A speech too long for one page, so it breaks with (MORE) and goes on with (CONT'D). */
const LONG_SPEECH = `INT. ENGINE ROOM - DAY\n\nPELL\n${'The pistons keep their own time down here.\n'.repeat(70)}`;

function render(source: string, template = screenplay, options?: PaginateOptions) {
  const layout = paginate(parse(source), template, options);
  const out = pagesHtml(layout, template);
  const host = document.createElement('div');
  host.innerHTML = out.html;
  return { layout, out, host, pages: [...host.querySelectorAll<HTMLElement>('.page')] };
}

const textOf = (line: LayoutLine) => line.runs.map((run) => run.text).join('');
const isBlank = (line: LayoutLine) => textOf(line).trim() === '';

/** Every line the page prints, with its row and column on the page's grid. */
function printed(layout: Layout, template: Template) {
  const { top, left } = template.page.margin;
  return layout.pages.map((page) =>
    page.lines.flatMap((line, k) =>
      (line.right ? [line, line.right] : [line])
        .filter((part) => !isBlank(part))
        .map((part) => ({ part, row: top + k, col: left + part.col })),
    ),
  );
}

/** The elements standing at a row and column of a page. */
const at = (page: Element, row: number, col: number) => [
  ...page.querySelectorAll<HTMLElement>(`.ln.${rowClass(row)}.${colClass(col)}`),
];

describe('pagesHtml', () => {
  for (const [name, source, template] of [
    ['screenplay', SCREENPLAY, screenplay],
    ['stage play', STAGE_PLAY, stagePlay],
    ['long speech', LONG_SPEECH, screenplay],
  ] as const) {
    it(`every printed line's text appears once, at its row and column (${name})`, () => {
      const { layout, out, pages } = render(source, template);
      expect(pages.length).toBe(layout.pages.length);
      printed(layout, template).forEach((parts, i) => {
        const page = pages[i] as HTMLElement;
        for (const { part, row, col } of parts) {
          const found = at(page, row, col);
          expect(found.length, `page ${i} row ${row} col ${col}`).toBe(1);
          expect(found[0]?.textContent).toBe(textOf(part));
          expect(out.rules).toContain(`.${rowClass(row)}{`);
          expect(out.rules).toContain(`.${colClass(col)}{`);
        }
        // Nothing else but the furniture.
        const body = [...page.querySelectorAll('.ln:not([data-furniture])')];
        expect(body.length).toBe(parts.length);
      });
    });
  }

  it('sizes each page from the template, by a class, with no style attribute anywhere', () => {
    const { out, pages } = render(SCREENPLAY);
    for (const page of pages) expect(page.classList.contains('p85x66')).toBe(true);
    expect(out.rules).toContain('.p85x66{');
    expect(out.html).not.toMatch(/style=/i);
    expect(out.html.startsWith('<section class="pages"')).toBe(true);
  });

  it('marks each page for a screen reader: "Title page", then "Page N"', () => {
    const { layout, pages } = render(SCREENPLAY);
    expect(pages.map((page) => page.querySelector('.vh')?.textContent)).toEqual(
      layout.pages.map((page) => (page.number === 0 ? 'Title page' : `Page ${page.number}`)),
    );
    for (const page of pages) expect(page.firstElementChild?.classList.contains('vh')).toBe(true);
  });

  it('the title page is a page with its fields', () => {
    const { layout, pages } = render(SCREENPLAY);
    expect(layout.pages[0]?.number).toBe(0);
    const title = pages[0]?.textContent ?? '';
    for (const field of ['The Salt Road', 'Written by', 'Wren Okafor', '30 October 2026']) {
      expect(title).toContain(field);
    }
    // Read by field: the draft date, though it stands level with the contact block's last line,
    // reads before the contact block, as its field comes first in the source.
    expect(title.indexOf('30 October 2026')).toBeLessThan(title.indexOf('12 Harbour Lane'));
  });

  it('dual dialogue draws both columns, the left speech read first', () => {
    const { layout, pages } = render(SCREENPLAY);
    // The title page has a right part too, its draft date; dual dialogue is on page 1.
    const index = layout.pages.findIndex(
      (page) => page.number > 0 && page.lines.some((line) => line.right),
    );
    const page = layout.pages[index];
    const row = page?.lines.findIndex((line) => line.right && !isBlank(line.right)) ?? -1;
    const line = page?.lines[row] as LayoutLine;
    const right = line.right as LayoutLine;
    const top = screenplay.page.margin.top + row;
    const left = screenplay.page.margin.left;
    const el = pages[index] as HTMLElement;
    const [a] = at(el, top, left + line.col);
    const [b] = at(el, top, left + right.col);
    expect(a?.textContent).toBe(textOf(line));
    expect(b?.textContent).toBe(textOf(right));
    expect(right.col).toBeGreaterThan(line.col);
    // The left column's speech comes before the right column's in the page's text.
    const words = el.textContent ?? '';
    expect(words.indexOf("It's mine tonight.")).toBeLessThan(words.indexOf("No, it's mine."));
    expect(words.indexOf("It's mine tonight.")).toBeLessThan(words.indexOf('DECLAN'));
  });

  it('scene numbers print left and right when the layout has them', () => {
    const { layout, pages } = render(SCREENPLAY, screenplay, { sceneNumbers: 'all' });
    const { top, left } = screenplay.page.margin;
    let seen = 0;
    layout.pages.forEach((page, i) => {
      const el = pages[i] as HTMLElement;
      for (const [side, col] of [
        [page.sceneNumbersLeft, screenplay.sceneNumbers.left],
        [page.sceneNumbersRight, screenplay.sceneNumbers.right],
      ] as const) {
        for (const { line, text } of side) {
          const [found] = at(el, top + line, left + col);
          expect(found?.textContent).toBe(text);
          expect(found?.getAttribute('aria-hidden')).toBe('true');
          seen++;
        }
      }
    });
    expect(seen).toBe(4);
    // Without them, none.
    expect(render(SCREENPLAY).host.querySelectorAll('[data-furniture="scene"]').length).toBe(0);
  });

  it('page numbers sit where the PDF puts them', () => {
    const { layout, pages } = render(LONG_SPEECH);
    const numbered = layout.pages.filter((page) => page.pageNumber);
    expect(numbered.length).toBeGreaterThan(0);
    layout.pages.forEach((page, i) => {
      if (!page.pageNumber) return;
      const { text, line, col } = page.pageNumber;
      // renderPdf: x = (margin.left + col) columns, y = `line` lines from the top edge.
      const [found] = at(pages[i] as HTMLElement, line, screenplay.page.margin.left + col);
      expect(found?.textContent).toBe(text);
      expect(found?.getAttribute('aria-hidden')).toBe('true');
    });
    // Page 2's "2." stands on the fourth line from the top, its full stop in the last column.
    const two = pages[1] as HTMLElement;
    const number = two.querySelector('[data-furniture="number"]');
    expect(number?.textContent).toBe('2.');
    expect(number?.classList.contains(rowClass(screenplay.page.numbering.line))).toBe(true);
    expect(number?.classList.contains(colClass(screenplay.page.width - 10 - 2))).toBe(true);
  });

  it('a header and a footer sit where the PDF puts them', () => {
    const template: Template = {
      ...screenplay,
      page: { ...screenplay.page, header: 'SALT ROAD p{n}', footer: 'Draft {n}' },
    };
    const { pages } = render(SCREENPLAY, template);
    const { margin, numbering, height } = template.page;
    const page = pages[1] as HTMLElement;
    expect(at(page, numbering.line, margin.left)[0]?.textContent).toBe('SALT ROAD p1');
    expect(at(page, height - 1 - numbering.line, margin.left)[0]?.textContent).toBe('Draft 1');
  });

  it('(MORE) and the furniture are hidden from screen readers; the text is not', () => {
    const { host } = render(LONG_SPEECH);
    const more = [...host.querySelectorAll('.ln')].filter((el) => el.textContent === '(MORE)');
    expect(more.length).toBeGreaterThan(0);
    for (const el of more) expect(el.getAttribute('aria-hidden')).toBe('true');
    for (const el of host.querySelectorAll('[data-furniture]')) {
      expect(el.getAttribute('aria-hidden')).toBe('true');
    }
    const spoken = [...host.querySelectorAll('.ln:not([aria-hidden])')];
    expect(spoken.some((el) => el.textContent?.includes('pistons'))).toBe(true);
  });

  it('a heading role prints as a heading at its level', () => {
    const { host } = render(STAGE_PLAY, stagePlay);
    const headings = [...host.querySelectorAll('[role="heading"]')];
    expect(headings.map((h) => [h.textContent, h.getAttribute('aria-level')])).toEqual([
      ['ACT ONE', '2'],
      ['SCENE 1', '3'],
    ]);
  });

  it('bold, italic, and underline become spans', () => {
    const { host } = render(SCREENPLAY);
    const span = (text: string) =>
      [...host.querySelectorAll('.ln span')].find((el) => el.textContent === text);
    expect(span('The wind')?.className).toBe('b');
    expect(span('scarf')?.className).toBe('i');
    expect(span('flings')?.className).toBe('u');
    expect(span('the water')?.className).toBe('b i');
  });

  it('hostile text stays text', () => {
    const hostile = '<img src=x onerror=alert(1)> "quoted" & </div>';
    const { host, layout } = render(`INT. ROOM - DAY\n\n${hostile}\n`);
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelectorAll('.page').length).toBe(layout.pages.length);
    const line = [...host.querySelectorAll('.ln')].find((el) => el.textContent?.includes('img'));
    expect(line?.textContent).toBe(hostile);
  });

  it('characters outside Courier Prime are kept as written', () => {
    const written = '东京 🎬 café';
    const { host } = render(`INT. ROOM - DAY\n\n${written}\n`);
    const line = [...host.querySelectorAll('.ln')].find((el) => el.textContent?.includes('东京'));
    expect(line?.textContent).toBe(written);
  });

  // The parser has already turned a tab into spaces; a separator reaches the layout as written.
  it('a line or paragraph separator prints as one space, as on the Script tab', () => {
    const { host } = render('INT. ROOM - DAY\n\nOne\u2029two\u2028three.\n');
    const line = [...host.querySelectorAll('.ln')].find((el) => el.textContent?.includes('One'));
    expect(line?.textContent).toBe('One two three.');
  });

  it('an empty layout is one blank page, as the PDF has', () => {
    const { pages, out } = render('');
    expect(pages.length).toBe(1);
    expect(pages[0]?.textContent).toBe('Page 1');
    expect(out.rules).toContain('.p85x66{');
  });

  it('writes the same markup and rules for the same layout', () => {
    const layout = paginate(parse(SCREENPLAY), screenplay);
    expect(pagesHtml(layout, screenplay)).toEqual(pagesHtml(layout, screenplay));
  });

  it('the stylesheet lets the pages shrink to a narrow screen, and prints them at 12pt', () => {
    // The page's type is 12pt and every measure on it is in em or ch, so the generated font-size
    // (pageRules) scales the whole card, lines in their places, against the pages' width.
    expect(STYLESHEET).toMatch(/\.pages \{[^}]*container-type: inline-size/);
    expect(STYLESHEET).toMatch(/\.page \{[^}]*font-size: 12pt;[^}]*line-height: 1;/);
    const print = STYLESHEET.slice(STYLESHEET.indexOf('@media print'));
    expect(print).toMatch(/\.pages \.page \{[^}]*font-size: 12pt/);
  });
});
