import { parse } from '@drafter/fountain';
import { type LayoutLine, type Page, paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { buildPage } from '../src/page';

// A locked page (production design §7.2) prints its label, and a revision mark (§6.2) is an asterisk
// in the right margin, in the type's own color, at the column Compare's Pages view uses
// (`STAR_COLUMN_FROM_RIGHT`, 5 in from the page's right edge), with its set said to a screen reader.

const screenplay = builtins['us-screenplay'] as Template;

/** The first page of `source`, as a locked page labelled `label`, with its lines reading `marked` carrying the Blue mark. */
function lockedPage(source: string, label: string, marked: string[]): Page {
  const page = paginate(parse(source), screenplay).pages[0] as Page;
  const text = (line: LayoutLine) => line.runs.map((run) => run.text).join('');
  const lines = page.lines.map((line) =>
    marked.includes(text(line)) ? { ...line, mark: { set: 'Blue' } } : line,
  );
  return { ...page, label, lines };
}

const SOURCE = 'INT. HALL - DAY\n\nShe waits by the door.\n\nThe phone rings.\n';

describe('a locked, revised page', () => {
  it('draws 12A and an asterisk with its label', () => {
    const el = buildPage(document, lockedPage(SOURCE, '12A', ['The phone rings.']), screenplay);
    expect(el.firstElementChild?.textContent).toBe('Page 12A');

    const stars = [...el.querySelectorAll<HTMLElement>('.drafter-revision-star')];
    expect(stars).toHaveLength(1);
    const star = stars[0] as HTMLElement;
    expect(star.textContent).toBe('*');
    expect(star.getAttribute('aria-hidden')).toBe('true');
    expect(star.dataset.set).toBe('Blue');
    // Five columns in from the page's right edge, as Compare draws its asterisk.
    expect(star.style.getPropertyValue('--col')).toBe(String(screenplay.page.width - 5));

    const line = [...el.querySelectorAll<HTMLElement>('.drafter-line[data-from]')].find((l) =>
      l.textContent?.endsWith('The phone rings.'),
    ) as HTMLElement;
    expect(star.style.getPropertyValue('--row')).toBe(line.style.getPropertyValue('--row'));
    // Said before the line's words, and kept out of a copy of the text.
    const said = line.firstElementChild as HTMLElement;
    expect(said.className).toBe('drafter-sr-only drafter-revision-said');
    expect(said.textContent).toBe('changed in Blue, ');

    // An unmarked line says nothing more.
    const other = [...el.querySelectorAll<HTMLElement>('.drafter-line[data-from]')].find(
      (l) => l.textContent === 'She waits by the door.',
    );
    expect(other).toBeDefined();
  });

  it('marks the right part of a row too', () => {
    const page = lockedPage(SOURCE, '3', []);
    const at = page.lines.findIndex((line) => line.runs.length > 0);
    const left = page.lines[at] as LayoutLine;
    const lines = page.lines.slice();
    lines[at] = { ...left, right: { ...left, col: 40, mark: { set: 'Pink' } } };
    const el = buildPage(document, { ...page, lines }, screenplay);
    const stars = [...el.querySelectorAll<HTMLElement>('.drafter-revision-star')];
    expect(stars.map((s) => s.dataset.set)).toEqual(['Pink']);
    expect([...el.querySelectorAll('.drafter-revision-said')].map((s) => s.textContent)).toEqual([
      'changed in Pink, ',
    ]);
  });

  it('an unlocked page reads as before', () => {
    const page = paginate(parse(SOURCE), screenplay).pages[0] as Page;
    const el = buildPage(document, page, screenplay);
    expect(el.firstElementChild?.textContent).toBe('Page 1');
    expect(el.querySelector('.drafter-revision-star, .drafter-revision-said')).toBeNull();
  });
});
