import { EditorSelection, type EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { elementTemplate, fountainHighlighting } from '@drafter/cm-fountain';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, describe, expect, it } from 'vitest';
import { lineClassOf, roleVariables } from '../../src/classic';
import { classicDecorations } from '../../src/classic/view';
import { classicEditor, keys } from './harness';

const SCREENPLAY = builtins['us-screenplay'] as Template;
const PLAY = builtins['stage-play-standard'] as Template;

const views: EditorView[] = [];

function mountState(state: EditorState): EditorView {
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({ state, parent });
  views.push(view);
  return view;
}

/** `|` is the cursor; with none, it's put first, so `editor` doesn't read `[ ]` as a selection. */
const mount = (marked: string, template: Template = SCREENPLAY) =>
  mountState(
    classicEditor(marked.includes('|') ? marked : `|${marked}`, {
      template,
      with: [fountainHighlighting()],
    }),
  );

afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.parentElement?.remove();
    view.destroy();
  }
});

/** The words of each line the view draws. */
const drawn = (view: EditorView) =>
  [...view.contentDOM.querySelectorAll('.cm-line')].map((line) => line.textContent);

const lineEl = (view: EditorView, index: number) =>
  view.contentDOM.querySelectorAll('.cm-line')[index] as HTMLElement;

const roleClasses = (view: EditorView, index: number) =>
  [...lineEl(view, index).classList].filter((name) => name.startsWith('cm-c-')).sort();

describe('the left pane: marks', () => {
  it.each([
    ['@McGRAW\nHello.', 'McGRAW'],
    ['.FLASHBACK', 'FLASHBACK'],
    ['!BANG', 'BANG'],
    ['>FADE OUT.', 'FADE OUT.'],
    ['>THE END<', 'THE END'],
    ['~la', 'la'],
    ['# Act', 'Act'],
    ['= sum', 'sum'],
    ['A **bold** word', 'A bold word'],
    ['A \\* star', 'A * star'],
    ['A [[note]] here', 'A note here'],
    ['A /* cut */ here', 'A  cut  here'],
  ])('%s is hidden, and the text is unchanged', (text, words) => {
    const view = mount(`\n\n${text}`);
    expect(drawn(view)[2]).toBe(words);
    expect(view.state.doc.toString()).toBe(`\n\n${text}`);
  });

  it('the title page shows as it is', () => {
    const view = mount('Title: Signal Hill\nAuthor: June Lake\n\nINT. DINER - DAY');
    expect(drawn(view).slice(0, 2)).toEqual(['Title: Signal Hill', 'Author: June Lake']);
    expect(roleClasses(view, 0)).toEqual([]);
  });

  it('a scene number stays visible', () => {
    const view = mount('INT. DINER - DAY #12#');
    expect(drawn(view)).toEqual(['INT. DINER - DAY #12#']);
    const forced = mount('.THE PIER #12#');
    expect(drawn(forced)).toEqual(['THE PIER #12#']);
  });

  it('an unclosed /* and a stray ** show', () => {
    expect(drawn(mount('Some /* cut'))).toEqual(['Some /* cut']);
    expect(drawn(mount('A ** stray'))).toEqual(['A ** stray']);
  });

  it("a mark isn't in the DOM, so a reader never hears it", () => {
    const view = mount('@McGRAW\nHello **you**.\n\n[[a note]]');
    const text = view.contentDOM.textContent ?? '';
    for (const mark of ['@', '**', '[[', ']]']) expect(text).not.toContain(mark);
    for (const rule of view.contentDOM.querySelectorAll('.cm-c-note-rule')) {
      expect(rule.getAttribute('aria-hidden')).toBe('true');
    }
    expect(view.contentDOM.querySelectorAll('.cm-c-note-rule')).toHaveLength(2);
  });

  it('a note and a cut have a rule at each end, so the stop before the end can be seen', () => {
    const view = mount('A [[note]] and /* cut */ there');
    expect(view.contentDOM.querySelectorAll('.cm-c-note-rule')).toHaveLength(2);
    expect(view.contentDOM.querySelectorAll('.cm-c-boneyard-rule')).toHaveLength(2);
  });

  it('a page break is a rule with its words, atomic', () => {
    const view = mount('Before.\n\n===\n\nAfter.');
    expect(drawn(view)[2]).toBe('Page break');
    expect(view.contentDOM.querySelector('.cm-c-page-break')?.textContent).toBe('Page break');
  });

  it('a dual mark is a tag on the name', () => {
    const view = mount('JUNE\nYes.\n\nDALE ^\nNo.');
    expect(drawn(view)[3]?.trim()).toBe('DALE dual');
    expect(view.contentDOM.querySelector('.cm-c-dual')?.textContent).toBe('dual');
  });

  it('the hidden set is what the cursor steps over', () => {
    const view = mount('@McGRAW\nHello **you**.');
    const [source] = view.state.facet(EditorView.atomicRanges);
    const set = (source as (v: EditorView) => import('@codemirror/view').DecorationSet)(view);
    const spans: [number, number][] = [];
    set.between(0, view.state.doc.length, (from, to) => {
      spans.push([from, to]);
    });
    expect(spans).toEqual([
      [0, 1],
      [14, 16],
      [19, 21],
    ]);
  });
});

describe('the left pane: what is drawn', () => {
  it('BANG on Action draws Action while the cursor is on it', () => {
    const state = keys(classicEditor('She waits.\n\n|\n\nMore.'), 'BANG');
    const line = state.doc.line(3);
    expect(line.text).toContain('BANG');
    expect(lineClassOf(state, line)).toBe('cm-c-action');
  });

  it('a lone name draws Character while its Dialogue is pending, then Action', () => {
    const state = keys(classicEditor('|'), 'Tab', 'JUNE', 'Enter');
    expect(state.doc.line(1).text).toContain('JUNE');
    expect(lineClassOf(state, state.doc.line(1))).toBe('cm-c-character');
    const view = mountState(state);
    expect(roleClasses(view, 0)).toEqual(['cm-c-character']);
    view.dispatch({ selection: EditorSelection.cursor(0), userEvent: 'select' });
    expect(roleClasses(view, 0)).toEqual(['cm-c-action']);
  });

  it('a pending element draws on its empty line', () => {
    const state = keys(classicEditor('She waits.|'), 'Tab');
    const line = state.doc.lineAt(state.selection.main.head);
    expect(line.text).toBe('');
    expect(lineClassOf(state, line)).toBe('cm-c-character');
  });

  it('an opened file draws what the parser says', () => {
    const view = mount(
      'INT. DINER - DAY\n\nShe waits.\n\nJUNE\n(softly)\nHello.\n\nCUT TO:\n\n>THE END<\n\n~la\n\n|',
    );
    const classes = [0, 2, 4, 5, 6, 8, 10, 12].map((index) => roleClasses(view, index));
    expect(classes).toEqual([
      ['cm-c-scene_heading'],
      ['cm-c-action'],
      ['cm-c-character'],
      ['cm-c-parenthetical'],
      ['cm-c-dialogue'],
      ['cm-c-right', 'cm-c-transition'],
      ['cm-c-center', 'cm-c-centered'],
      ['cm-c-italic', 'cm-c-lyric'],
    ]);
  });

  it("a play's lines take its roles", () => {
    const view = mount('# One\n\n## Two\n\nShe waits.\n\nJUNE\nHello.\n\n|', PLAY);
    const classes = [0, 2, 4, 6, 7].map((index) => roleClasses(view, index));
    expect(classes).toEqual([
      ['cm-c-act_heading', 'cm-c-center'],
      ['cm-c-center', 'cm-c-scene_heading_play'],
      ['cm-c-italic', 'cm-c-stage_direction'],
      ['cm-c-center', 'cm-c-character'],
      ['cm-c-dialogue'],
    ]);
  });

  it('a section says its depth', () => {
    const view = mount('# One\n\n### Three\n\n= sum\n\n|');
    expect(roleClasses(view, 0)).toEqual(['cm-c-depth-1', 'cm-c-section']);
    expect(roleClasses(view, 2)).toEqual(['cm-c-depth-3', 'cm-c-section']);
    expect(roleClasses(view, 4)).toEqual(['cm-c-synopsis']);
  });

  it('notes, cuts, and the title page have no element', () => {
    const state = classicEditor('Title: x\n\nINT. A\n\n[[a note]]\n\n/* cut */\n\n|');
    expect(lineClassOf(state, state.doc.line(1))).toBeNull();
    expect(lineClassOf(state, state.doc.line(5))).toBeNull();
    expect(lineClassOf(state, state.doc.line(7))).toBeNull();
  });

  it('a line of <img src=x onerror=…> stays text', () => {
    const text = '<img src=x onerror=alert(1)>';
    const view = mount(text);
    expect(drawn(view)).toEqual([text]);
    expect(view.contentDOM.querySelector('img:not(.cm-widgetBuffer)')).toBeNull();
  });
});

describe('the left pane: the template', () => {
  it('the indents come from the template, in numbers', () => {
    expect(roleVariables(SCREENPLAY)).toMatchObject({
      '--c-character-indent': '22',
      '--c-character-width': '33',
      '--c-transition-indent': '40',
      '--c-transition-width': '20',
    });
    const view = mount('INT. DINER');
    expect(view.dom.classList.contains('cm-classic')).toBe(true);
    expect(view.dom.style.getPropertyValue('--c-dialogue-indent')).toBe('10');
    expect(view.dom.style.getPropertyValue('--c-dialogue-width')).toBe('35');
  });

  it("a template whose numbers aren't integers adds no variable", () => {
    const roles = {
      ...SCREENPLAY.roles,
      character: { ...SCREENPLAY.roles.character, indent: 22.5 },
      dialogue: { ...SCREENPLAY.roles.dialogue, width: Number.NaN },
      action: { ...SCREENPLAY.roles.action, indent: '1; color: red' },
    };
    const variables = roleVariables({ ...SCREENPLAY, roles } as unknown as Template);
    for (const name of ['character', 'dialogue', 'action']) {
      expect(variables).not.toHaveProperty(`--c-${name}-indent`);
      expect(variables).not.toHaveProperty(`--c-${name}-width`);
    }
    expect(variables['--c-transition-indent']).toBe('40');
  });

  it('a role with an unsafe name adds no variable and no class', () => {
    const roles = { 'x; color: red': SCREENPLAY.roles.action, ...SCREENPLAY.roles };
    const roleMap = [{ kind: 'action', role: 'x; color: red' }, ...SCREENPLAY.roleMap];
    const template = { ...SCREENPLAY, roles, roleMap } as unknown as Template;
    expect(Object.keys(roleVariables(template)).join()).not.toContain('color');
    const state = classicEditor('She waits.\n\n|', { template });
    expect(lineClassOf(state, state.doc.line(1))).toBe('cm-c-action');
  });

  it('a keystroke reads the variables from a cache', () => {
    const view = mount('INT. DINER|');
    const before = view.dom.getAttribute('style');
    view.dispatch({ changes: { from: 10, insert: ' X' } });
    expect(view.dom.getAttribute('style')).toBe(before);
    expect(view.state.facet(elementTemplate)?.()).toBe(SCREENPLAY);
  });
});

describe('the left pane: the viewport', () => {
  it('only the visible ranges are decorated', () => {
    const page = 'JUNE\n**Hello** there.\n\n';
    const view = mount(page.repeat(3000));
    const visibleTo = view.visibleRanges.at(-1)?.to ?? 0;
    expect(visibleTo).toBeLessThan(view.state.doc.length);
    const [source] = view.state.facet(EditorView.atomicRanges);
    const set = (source as (v: EditorView) => import('@codemirror/view').DecorationSet)(view);
    let count = 0;
    let last = 0;
    set.between(0, view.state.doc.length, (_from, to) => {
      count++;
      last = to;
    });
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(3000);
    expect(last).toBeLessThanOrEqual(view.state.doc.lineAt(visibleTo).to);
  });

  it("a mark across the edge of what's seen is left out, so it can't swallow CodeMirror's gap", () => {
    const state = classicEditor('|A **b** c **d** e');
    const spans = (to: number) => {
      const out: number[] = [];
      classicDecorations(state, [{ from: 0, to }]).hidden.between(0, 100, (from) => {
        out.push(from);
      });
      return out;
    };
    expect(spans(7)).toEqual([2, 5]);
    expect(spans(6)).toEqual([2]);
  });

  it('a long line of marks is decorated where it is seen', () => {
    const view = mount(`${'**a** '.repeat(20000)}`);
    const [source] = view.state.facet(EditorView.atomicRanges);
    const set = (source as (v: EditorView) => import('@codemirror/view').DecorationSet)(view);
    expect(view.visibleRanges.length).toBeGreaterThan(0);
    let count = 0;
    set.between(0, view.state.doc.length, () => {
      count++;
    });
    const seen = view.visibleRanges.reduce((sum, { from, to }) => sum + to - from, 0);
    expect(count).toBeLessThanOrEqual(seen);
  });
});
