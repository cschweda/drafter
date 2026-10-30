import { parse } from '@drafter/fountain';
import { type Layout, type Page, paginate } from '@drafter/layout';
import { createScriptView, type ScriptView } from '@drafter/render-html';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The view's `decorate` hook (version-history design §11): the Script pane puts Show changes'
// marks on the pages through it, so it runs on every page a draw leaves on the screen, built or
// kept, after the page has its final offsets; and `redecorate` runs it again on every page.

const screenplay = builtins['us-screenplay'] as Template;
const layoutOf = (source: string): Layout => paginate(parse(source), screenplay);

/** Three pages, one line of action on each. */
const THREE = 'INT. HALL - DAY\n\nOne.\n\n===\n\nTwo.\n\n===\n\nThree.\n';

const mounted: HTMLElement[] = [];
function mount(decorate: (el: HTMLElement, page: Page) => void): ScriptView {
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  return createScriptView(container, { decorate });
}
afterEach(() => {
  for (const container of mounted.splice(0)) container.remove();
});

const pagesIn = (view: ScriptView) => [
  ...view.element.querySelectorAll<HTMLElement>('.drafter-page'),
];

describe('decorate', () => {
  it('decorate runs for each drawn and each kept page', async () => {
    const calls: Array<{ el: HTMLElement; page: Page; from: string | null }> = [];
    const view = mount((el, page) =>
      calls.push({
        el,
        page,
        from: el.querySelector('[data-from]')?.getAttribute('data-from') ?? null,
      }),
    );
    await view.update(layoutOf(THREE), screenplay);
    const first = pagesIn(view);
    expect(calls.map((c) => c.el)).toEqual(first);
    expect(calls.map((c) => c.page.number)).toEqual(layoutOf(THREE).pages.map((p) => p.number));

    // An edit on the last page: the first pages are kept, and decorated again with their new page.
    calls.length = 0;
    const edited = THREE.replace('Three.', 'Three, again.');
    await view.update(layoutOf(edited), screenplay);
    const after = pagesIn(view);
    expect(after[0]).toBe(first[0]);
    expect(calls.map((c) => c.el)).toEqual(after);
    expect(calls.at(-1)?.el).not.toBe(first.at(-1));

    // An edit that moves every later page's offsets: a kept page is decorated after it moved.
    calls.length = 0;
    const longer = `INT. GREAT HALL - DAY${edited.slice('INT. HALL - DAY'.length)}`;
    const moved = layoutOf(longer);
    await view.update(moved, screenplay);
    const last = calls.at(-1);
    expect(last?.from).toBe(
      String(moved.pages.at(-1)?.lines.find((l) => l.span.from < l.span.to)?.span.from),
    );
  });

  it('redecorate runs it again on every page', async () => {
    const decorate = vi.fn();
    const view = mount(decorate);
    await view.update(layoutOf(THREE), screenplay);
    decorate.mockClear();
    view.redecorate();
    expect(decorate.mock.calls.map(([el]) => el)).toEqual(pagesIn(view));
    expect(decorate.mock.calls.map(([, page]) => (page as Page).number)).toEqual(
      layoutOf(THREE).pages.map((p) => p.number),
    );
  });

  it('a view without decorate draws as before, and redecorate does nothing', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    mounted.push(container);
    const view = createScriptView(container);
    await view.update(layoutOf(THREE), screenplay);
    expect(() => view.redecorate()).not.toThrow();
    expect(pagesIn(view)).toHaveLength(layoutOf(THREE).pages.length);
  });
});
