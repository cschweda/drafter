import { blockAt, parse } from '@drafter/fountain';
import { type Layout, type LayoutLine, paginate } from '@drafter/layout';
import * as api from '@drafter/render-html';
import {
  createScriptView,
  GOTO_EVENT,
  type ScriptView,
  type ScriptViewOptions,
} from '@drafter/render-html';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const screenplay = builtins['us-screenplay'] as Template;

const layoutOf = (source: string, template: Template = screenplay): Layout =>
  paginate(parse(source), template);

/** Three pages, one line of action on each. */
const THREE = 'INT. HALL - DAY\n\nOne.\n\n===\n\nTwo.\n\n===\n\nThree.\n';

/** The index of the block that starts at `text`. */
function blockOf(source: string, text: string): number {
  const found = blockAt(parse(source), source.indexOf(text));
  if (!found) throw new Error(`"${text}" is in no block`);
  return found.index;
}

/** A promise settled by hand: it stands in for the fonts loading. */
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets every promise reaction that is waiting run. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const mounted: HTMLElement[] = [];

/** A view in a container that is in the document, so `isConnected` tells a page that is gone. */
function mount(options?: ScriptViewOptions) {
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  return { container, view: createScriptView(container, options) };
}

const pagesIn = (view: ScriptView) => [
  ...view.element.querySelectorAll<HTMLElement>('.drafter-page'),
];

function found<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`no ${what}`);
  return value;
}

/** The line with exactly this text. */
function lineWith(view: ScriptView, text: string): HTMLElement {
  const lines = [...view.element.querySelectorAll<HTMLElement>('.drafter-line')];
  return found(
    lines.find((line) => line.textContent === text),
    `line reading "${text}"`,
  );
}

// jsdom has no layout and no scrollIntoView, so the tests supply one that records its calls.
const scrollIntoView = vi.fn();
beforeEach(() => {
  scrollIntoView.mockClear();
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: scrollIntoView,
  });
});
afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  for (const container of mounted.splice(0)) container.remove();
});

/** The elements `scrollIntoView` was called on, in order. */
const scrolled = () => scrollIntoView.mock.contexts as Element[];

describe('the package', () => {
  it('exports the view, its click event, and speechRoles', () => {
    expect(Object.keys(api).sort()).toEqual(['GOTO_EVENT', 'createScriptView', 'speechRoles']);
    expect(GOTO_EVENT).toBe('drafter:goto');
  });
});

describe('createScriptView', () => {
  it('appends a labelled Script region to the container', () => {
    const container = document.createElement('div');
    container.append(document.createElement('p'));
    const view = createScriptView(container);
    expect(view.element.tagName).toBe('SECTION');
    expect(view.element.className).toBe('drafter-script');
    expect(view.element.getAttribute('aria-label')).toBe('Script');
    expect(container.lastElementChild).toBe(view.element);
  });

  it('removes its region when destroyed', () => {
    const container = document.createElement('div');
    const view = createScriptView(container);
    view.destroy();
    expect(container.children).toHaveLength(0);
    expect(view.element.isConnected).toBe(false);
  });
});

describe('update', () => {
  it('waits for the fonts before the first render', async () => {
    const fonts = deferred();
    const { view } = mount({ fontsReady: fonts.promise });
    const done = view.update(layoutOf(THREE), screenplay);
    await settle();
    expect(pagesIn(view)).toHaveLength(0);
    fonts.resolve();
    await done;
    expect(pagesIn(view)).toHaveLength(3);
  });

  it('draws at once when there are no fonts to wait for', () => {
    const { view } = mount();
    void view.update(layoutOf(THREE), screenplay);
    expect(pagesIn(view)).toHaveLength(3);
  });

  it('draws at once after the first render, however long the fonts took', async () => {
    const fonts = deferred();
    const { view } = mount({ fontsReady: fonts.promise });
    const first = view.update(layoutOf(THREE), screenplay);
    fonts.resolve();
    await first;
    void view.update(layoutOf('INT. HALL - DAY\n\nOne.\n'), screenplay);
    expect(pagesIn(view)).toHaveLength(1);
  });

  it.each([
    ['before the first update', true],
    ['after it', false],
  ])('draws anyway when the fonts fail to load %s', async (_when, failsFirst) => {
    const fonts = deferred();
    if (failsFirst) fonts.reject(new Error('Courier Prime did not load'));
    const { view } = mount({ fontsReady: fonts.promise });
    const done = view.update(layoutOf(THREE), screenplay);
    if (!failsFirst) fonts.reject(new Error('Courier Prime did not load'));
    await done;
    expect(pagesIn(view)).toHaveLength(3);
  });

  it('keeps unchanged pages and replaces changed ones', async () => {
    const { view } = mount();
    await view.update(layoutOf(THREE), screenplay);
    const before = pagesIn(view);
    // The same length, so no later page's offsets move.
    await view.update(layoutOf(THREE.replace('Two.', 'Too.')), screenplay);
    const after = pagesIn(view);
    expect(after).toHaveLength(3);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[2]).toBe(before[2]);
    expect(before[1]?.isConnected).toBe(false);
    expect(after[1]?.textContent).toContain('Too.');
    expect(after.map((page) => page.dataset.page)).toEqual(['1', '2', '3']);
  });

  it('puts the pages a longer script adds after the ones it keeps', async () => {
    const { view } = mount();
    await view.update(layoutOf('INT. HALL - DAY\n\nOne.\n'), screenplay);
    await view.update(layoutOf(THREE), screenplay);
    expect(pagesIn(view).map((page) => page.dataset.page)).toEqual(['1', '2', '3']);
    expect(view.element.children).toHaveLength(3);
  });

  it('removes pages that are gone', async () => {
    const { view } = mount();
    await view.update(layoutOf(THREE), screenplay);
    const before = pagesIn(view);
    await view.update(layoutOf('INT. HALL - DAY\n\nOne.\n'), screenplay);
    expect(pagesIn(view)).toHaveLength(1);
    expect(view.element.children).toHaveLength(1);
    expect(before[1]?.isConnected).toBe(false);
    expect(before[2]?.isConnected).toBe(false);
  });

  it('clears the view for a script with no pages', async () => {
    const { view } = mount();
    for (const source of ['', '\n', '   \n']) {
      // Each round draws again from nothing, so the view is whole after it was cleared.
      await view.update(layoutOf(THREE), screenplay);
      const before = pagesIn(view);
      expect(before).toHaveLength(3);

      const empty = layoutOf(source);
      expect(empty.pages).toHaveLength(0);
      await view.update(empty, screenplay);
      expect(view.element.children).toHaveLength(0);
      expect(before.some((page) => page.isConnected)).toBe(false);

      view.reveal(0);
    }
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('draws every page again when only the template changes', async () => {
    const source = 'INT. HALL - DAY\n\nOne.\n\n===\n\nEXT. YARD - NIGHT\n\nTwo.\n';
    const layout = layoutOf(source);
    const { view } = mount();
    await view.update(layout, screenplay);
    const before = pagesIn(view);
    const levels = () =>
      [...view.element.querySelectorAll('[role=heading]')].map((el) =>
        el.getAttribute('aria-level'),
      );
    expect(levels()).toEqual(['2', '2']);

    // The layout ignores a heading's level, so the same pages come out of this template.
    const deeper = structuredClone(screenplay);
    deeper.roles.scene_heading.heading = 3;
    expect(layoutOf(source, deeper)).toEqual(layout);
    await view.update(layout, deeper);
    const after = pagesIn(view);
    expect(after).toHaveLength(2);
    expect(after.map((page, i) => page === before[i])).toEqual([false, false]);
    expect(levels()).toEqual(['3', '3']);
  });

  it('keeps the pages when the template is only a new copy of the same one', async () => {
    const { view } = mount();
    await view.update(layoutOf(THREE), screenplay);
    const before = pagesIn(view);
    await view.update(layoutOf(THREE), structuredClone(screenplay));
    expect(pagesIn(view).map((page, i) => page === before[i])).toEqual([true, true, true]);
  });

  it('renders the newest of two quick updates', async () => {
    const fonts = deferred();
    const { view } = mount({ fontsReady: fonts.promise });
    const older = view.update(layoutOf('INT. HALL - DAY\n\nThe older one.\n'), screenplay);
    const newer = view.update(layoutOf('INT. HALL - DAY\n\nThe newer one.\n'), screenplay);
    fonts.resolve();
    await Promise.all([older, newer]);
    expect(view.element.textContent).toContain('The newer one.');
    expect(view.element.textContent).not.toContain('The older one.');
  });

  // The second call can land at any moment as the fonts become ready, between the microtasks that
  // end the wait and the older call's own: whichever it is, the older one must not draw after it.
  it.each([0, 1, 2, 3, 4, 5])(
    'renders the newest when the second call comes %i microtasks after the fonts load',
    async (hops) => {
      const fonts = deferred();
      const { view } = mount({ fontsReady: fonts.promise });
      const older = view.update(layoutOf('INT. HALL - DAY\n\nThe older one.\n'), screenplay);
      let newer: Promise<void> = Promise.resolve();
      const callNewer = (left: number): void => {
        if (left > 0) queueMicrotask(() => callNewer(left - 1));
        else newer = view.update(layoutOf('INT. HALL - DAY\n\nThe newer one.\n'), screenplay);
      };
      fonts.resolve();
      callNewer(hops);
      await settle();
      await Promise.all([older, newer]);
      expect(view.element.textContent).toContain('The newer one.');
      expect(view.element.textContent).not.toContain('The older one.');
    },
  );

  it('draws nothing once destroyed, even for an update that was waiting', async () => {
    const fonts = deferred();
    const { view } = mount({ fontsReady: fonts.promise });
    const done = view.update(layoutOf(THREE), screenplay);
    view.destroy();
    fonts.resolve();
    await done;
    await view.update(layoutOf(THREE), screenplay);
    expect(view.element.children).toHaveLength(0);
  });

  it('never has two elements with one id while it swaps pages', async () => {
    const speeches = 'INT. HALL - DAY\n\nMARGARET\nHello.\n\n===\n\nDANNY\nHi.\n';
    const { view } = mount();
    await view.update(layoutOf(speeches), screenplay);

    // Replay the swap one mutation at a time, counting the ids in the view after each.
    const idsIn = (node: Node) =>
      node instanceof Element ? [...node.querySelectorAll('[id]')].map((el) => el.id) : [];
    const counts = new Map<string, number>();
    const change = (ids: string[], by: number) => {
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + by);
    };
    change(idsIn(view.element), 1);
    expect(counts.size).toBeGreaterThan(0);

    const observer = new MutationObserver(() => {});
    observer.observe(view.element, { childList: true });
    // The same length, so the second page is kept and only the first is swapped.
    void view.update(layoutOf(speeches.replace('Hello.', 'Hallo.')), screenplay);
    const records = observer.takeRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      for (const node of record.removedNodes) change(idsIn(node), -1);
      for (const node of record.addedNodes) change(idsIn(node), 1);
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(1);
    }
    expect(view.element.textContent).toContain('Hallo.');
  });

  it('works out the speech roles once for a whole update', async () => {
    const walks = async (source: string) => {
      let count = 0;
      const roleMap = new Proxy(screenplay.roleMap, {
        get(target, key, receiver) {
          if (key === Symbol.iterator) count++;
          return Reflect.get(target, key, receiver);
        },
      });
      await mount().view.update(layoutOf(source), { ...screenplay, roleMap });
      return count;
    };
    const one = await walks('INT. HALL - DAY\n\nOne.\n');
    expect(one).toBeGreaterThan(0);
    expect(await walks(THREE)).toBe(one);
  });
});

describe('clicks', () => {
  const source =
    'INT. HALL - DAY\n\nShe **waits** by the door.\n\nMARGARET\nHello.\n\n===\n\nNext.\n';

  async function shown(text = source) {
    const { container, view } = mount();
    await view.update(layoutOf(text), screenplay);
    const events: Array<CustomEvent<{ offset: number }>> = [];
    container.addEventListener(GOTO_EVENT, (event) => {
      events.push(event as CustomEvent<{ offset: number }>);
    });
    return { container, view, events };
  }

  it('reports the source offset of a clicked line', async () => {
    const { view, events } = await shown();
    lineWith(view, 'Hello.').click();
    lineWith(view, 'Next.').click();
    expect(events.map((event) => event.detail.offset)).toEqual([
      source.indexOf('Hello.'),
      source.indexOf('Next.'),
    ]);
    // It comes from the region and bubbles, so the app can listen on the pane.
    expect(events[0]?.target).toBe(view.element);
    expect(events[0]?.bubbles).toBe(true);
  });

  it('reports a click on styled text as a click on its line', async () => {
    const { view, events } = await shown();
    const bold = found(lineWith(view, 'She waits by the door.').querySelector('.b'), 'bold run');
    expect(bold.textContent).toBe('waits');
    (bold as HTMLElement).click();
    expect(events.map((event) => event.detail.offset)).toEqual([source.indexOf('She')]);
  });

  it('reports nothing for the furniture, the paper, or the region itself', async () => {
    const { view, events } = await shown();
    const number = found(view.element.querySelector<HTMLElement>('.drafter-page-number'), 'number');
    number.click();
    found(pagesIn(view)[0], 'page').click();
    view.element.click();
    expect(events).toHaveLength(0);
  });

  it('reports the offset an edit moved a line to', async () => {
    const { view, events } = await shown();
    const longer = source.replace('INT. HALL - DAY', 'INT. THE GREAT HALL - DAY');
    // Nothing on the second page changed but where it stands in the source.
    await view.update(layoutOf(longer), screenplay);
    lineWith(view, 'Next.').click();
    expect(events.map((event) => event.detail.offset)).toEqual([longer.indexOf('Next.')]);
  });

  it('reports offsets that slice back to the text in a CRLF script', async () => {
    const crlf = [
      'INT. HALL - DAY',
      '',
      'She waits by the door, and the hall goes on and on past a great many doors until it ends.',
      '',
      'MARGARET',
      'Hello.',
      '',
    ].join('\r\n');
    const { view, events } = await shown(crlf);
    const lines = [...view.element.querySelectorAll<HTMLElement>('.drafter-line[data-from]')];
    // The action wraps, so its second line starts in the middle of a source line.
    const action = lines.filter((line) => line.classList.contains('role-action'));
    expect(action.length).toBeGreaterThan(1);
    expect(action.map((line) => line.textContent).join(' ')).toBe(
      'She waits by the door, and the hall goes on and on past a great many doors until it ends.',
    );
    expect(lines).toHaveLength(action.length + 3);
    for (const line of lines) line.click();
    expect(events).toHaveLength(lines.length);
    for (const [i, line] of lines.entries()) {
      const offset = events[i]?.detail.offset ?? -1;
      const text = line.textContent ?? '';
      expect(crlf.slice(offset, offset + text.length)).toBe(text);
    }
  });
});

describe('reveal', () => {
  const script = [
    'INT. HALL - DAY',
    '',
    'The hall is long and cold, and it goes on and on past every door the house has ever had.',
    '',
    'MARGARET',
    'We should go.',
    '',
    '===',
    '',
    'EXT. YARD - NIGHT',
    '',
    'Rain.',
    '',
  ].join('\n');

  async function shown(options?: ScriptViewOptions, source = script) {
    const { container, view } = mount(options);
    await view.update(layoutOf(source), screenplay);
    return { container, view, source, block: (text: string) => blockOf(source, text) };
  }

  it('reveals the line where a block starts', async () => {
    const { view, block } = await shown();
    view.reveal(block('We should go.'));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(scrolled()[0]).toBe(lineWith(view, 'We should go.'));
  });

  it('reveals the first line of a block that wraps', async () => {
    const { view, source, block } = await shown();
    view.reveal(block('The hall'));
    const first = found(
      view.element.querySelector(`.drafter-line[data-from="${source.indexOf('The hall')}"]`),
      'first line',
    );
    expect(first.textContent).toMatch(/^The hall is long/);
    expect(scrolled()).toHaveLength(1);
    expect(scrolled()[0]).toBe(first);
  });

  it('reveals a block on a later page', async () => {
    const { view, block } = await shown();
    view.reveal(block('Rain.'));
    const line = lineWith(view, 'Rain.');
    expect(line.closest<HTMLElement>('.drafter-page')?.dataset.page).toBe('2');
    expect(scrolled()[0]).toBe(line);
  });

  it.each([
    ['no title page', THREE],
    ['a title page', `Title: Test\n\n${THREE}`],
  ])('finds a page by its number, with %s', async (_name, source) => {
    const { view, block } = await shown(undefined, source);
    for (const text of ['One.', 'Two.', 'Three.']) {
      scrollIntoView.mockClear();
      view.reveal(block(text));
      expect(scrolled()).toHaveLength(1);
      expect(scrolled()[0]).toBe(lineWith(view, text));
    }
  });

  describe('on a page whose lines are not in row order', () => {
    const span = { from: 0, to: 1 };
    const text = (block: number, words: string, right?: LayoutLine): LayoutLine => ({
      col: 0,
      runs: [{ text: words, bold: false, italic: false, underline: false, span }],
      role: 'action',
      blockIndex: block,
      span,
      right,
    });
    const blank = (right?: LayoutLine): LayoutLine => ({
      col: 0,
      runs: [],
      role: 'action',
      blockIndex: -1,
      span,
      synthetic: 'blank',
      right,
    });
    // Row 0 holds only a right part, which is read after the left lines below it. So the DOM
    // goes B, C, X, and the first line by row is X, the last by position.
    const layout: Layout = {
      pages: [
        {
          number: 1,
          lines: [blank(text(3, 'X')), text(1, 'B'), blank(), text(2, 'C')],
          sceneNumbersLeft: [],
          sceneNumbersRight: [],
        },
      ],
      index: [
        { page: 1, line: 0 },
        { page: 1, line: 1 }, // block 1, B
        { page: 1, line: 3 }, // block 2, C
        { page: 1, line: 0 }, // block 3, X
        { page: 1, line: 2 }, // block 4: row 2 holds no line, so the next one, C
        { page: 1, line: 9 }, // block 5: nothing at or after row 9
        { page: 99, line: 0 }, // block 6: there is no page 99
      ],
      diagnostics: [],
    };

    async function drawn() {
      const { view } = mount();
      await view.update(layout, screenplay);
      const page = found(pagesIn(view)[0], 'page');
      const reads = [...page.querySelectorAll('.drafter-line')].map((line) => line.textContent);
      expect(reads).toEqual(['B', 'C', 'X']);
      return view;
    }

    it('picks the line by its row, not by its place in the page', async () => {
      const view = await drawn();
      view.reveal(3);
      expect(scrolled()).toHaveLength(1);
      expect(scrolled()[0]).toBe(lineWith(view, 'X'));
      view.reveal(1);
      expect(scrolled()[1]).toBe(lineWith(view, 'B'));
    });

    it('takes the next line when the row holds none', async () => {
      const view = await drawn();
      view.reveal(4);
      expect(scrolled()).toHaveLength(1);
      expect(scrolled()[0]).toBe(lineWith(view, 'C'));
    });

    it('does nothing when no line comes at or after the row, or the page is not there', async () => {
      const view = await drawn();
      view.reveal(5);
      view.reveal(6);
      expect(scrollIntoView).not.toHaveBeenCalled();
    });
  });

  it("ignores a block index the layout doesn't have", async () => {
    const { view, source } = await shown();
    const count = layoutOf(source).index.length;
    for (const index of [-1, count, count + 1000, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      view.reveal(index);
    }
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('does nothing before the first render', async () => {
    const fonts = deferred();
    const { view } = mount({ fontsReady: fonts.promise });
    const done = view.update(layoutOf(script), screenplay);
    view.reveal(0);
    fonts.resolve();
    await done;
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('leaves the view alone for two seconds after the reader scrolls', async () => {
    let time = 10_000;
    const { container, view, block } = await shown({ now: () => time });
    const goHome = block('We should go.');

    view.reveal(goHome);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    container.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 120 }));
    time += 1999;
    view.reveal(goHome);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    time += 1;
    view.reveal(goHome);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('starts the two seconds over at each scroll', async () => {
    let time = 0;
    const { container, view, block } = await shown({ now: () => time });
    const goHome = block('We should go.');
    container.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    time = 1500;
    container.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    time = 3499;
    view.reveal(goHome);
    expect(scrollIntoView).not.toHaveBeenCalled();
    time = 3500;
    view.reveal(goHome);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  const key = (name: string) => () => new KeyboardEvent('keydown', { key: name, bubbles: true });
  const readerInputs: Array<[string, () => Event]> = [
    ['a turn of the wheel', () => new WheelEvent('wheel', { bubbles: true })],
    ['a touch', () => new Event('touchstart', { bubbles: true })],
    ['a dragged touch', () => new Event('touchmove', { bubbles: true })],
    ['the Page Up key', key('PageUp')],
    ['the Page Down key', key('PageDown')],
    ['the Home key', key('Home')],
    ['the End key', key('End')],
    ['the Up Arrow key', key('ArrowUp')],
    ['the Down Arrow key', key('ArrowDown')],
    ['the Left Arrow key', key('ArrowLeft')],
    ['the Right Arrow key', key('ArrowRight')],
    ['the Space key', key(' ')],
  ];

  it.each(readerInputs)('counts %s as the reader scrolling', async (_name, make) => {
    const { view, block } = await shown({ now: () => 0 });
    // From a line, so it has to bubble up to the container.
    lineWith(view, 'We should go.').dispatchEvent(make());
    view.reveal(block('We should go.'));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  const otherInputs: Array<[string, () => Event]> = [
    ['a letter key', key('a')],
    ['the Tab key', key('Tab')],
    ['the Enter key', key('Enter')],
    ['a click', () => new MouseEvent('click', { bubbles: true })],
    ['a scroll event', () => new Event('scroll')],
  ];

  it.each(otherInputs)('does not count %s as the reader scrolling', async (_name, make) => {
    const { container, view, block } = await shown({ now: () => 0 });
    container.dispatchEvent(make());
    view.reveal(block('We should go.'));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("does not take its own scrolling for the reader's", async () => {
    const { container, view, block } = await shown({ now: () => 0 });
    view.reveal(block('We should go.'));
    // The browser reports the scroll that scrollIntoView made.
    container.dispatchEvent(new Event('scroll'));
    view.reveal(block('Rain.'));
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('measures the two seconds with the real clock unless given one', async () => {
    const { container, view, block } = await shown();
    view.reveal(block('We should go.'));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    container.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    view.reveal(block('We should go.'));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});

describe('destroy', () => {
  it('removes its listeners, and reveals nothing afterwards', async () => {
    const now = vi.fn(() => 0);
    const { container, view } = mount({ now });
    await view.update(layoutOf(THREE), screenplay);
    const line = lineWith(view, 'Two.');
    view.destroy();
    expect(() => view.destroy()).not.toThrow();

    const goto = vi.fn();
    view.element.addEventListener(GOTO_EVENT, goto);
    line.click();
    expect(goto).not.toHaveBeenCalled();

    now.mockClear();
    container.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    container.dispatchEvent(new Event('touchstart', { bubbles: true }));
    container.dispatchEvent(new Event('touchmove', { bubbles: true }));
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    expect(now).not.toHaveBeenCalled();

    view.reveal(1);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
