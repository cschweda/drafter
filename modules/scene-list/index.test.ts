import { describe, expect, test } from 'vitest';
import { fakeContext } from '../fake-context';
import { draw } from '../render';
import sceneList, { lengthLabel } from './index';

const tab = () => {
  const component = sceneList.tab?.component;
  if (!component) throw new Error('the Scene list has no tab');
  return component;
};

describe('Scene list', () => {
  test('is a button and a tab, and asks for nothing', () => {
    expect(sceneList.action?.label).toBe('Scenes');
    expect(sceneList.tab?.label).toBe('Scenes');
    expect(sceneList.permissions).toEqual({});
    expect(sceneList.commands).toBeUndefined();
  });

  test('lists every scene of the sample screenplay with its page and length', () => {
    // A page is 54 lines, so an eighth is 6.75 lines. The first scene starts at the top of page 1
    // and the second at line 10 of page 2: 54 + 10 = 64 lines, which is 9.5 eighths, so 9. The
    // second runs from there to the last printed line, line 22 of page 2: 13 lines, nearly 2.
    const view = draw(tab(), fakeContext());
    expect(view.buttons.map((b) => b.text)).toEqual([
      '1 INT. KITCHEN - NIGHT Page 1 · 1 1/8 pages',
      '2 EXT. BACK PORCH - LATER Page 2 · 2/8 page',
    ]);
  });

  test('counts a scene shorter than an eighth as one eighth', () => {
    // Four lines (heading, blank, action, blank) and three: under one eighth each.
    const ctx = fakeContext({ source: 'INT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n' });
    expect(draw(tab(), ctx).buttons.map((b) => b.text)).toEqual([
      '1 INT. A - DAY Page 1 · 1/8 page',
      '2 INT. B - DAY Page 1 · 1/8 page',
    ]);
  });

  test('counts a long scene in whole pages and eighths', () => {
    // 60 one-line paragraphs, each followed by a blank line, and the heading with its blank line:
    // 122 lines, 18 eighths.
    const action = Array.from({ length: 60 }, (_, i) => `Line ${i}.\n\n`).join('');
    const ctx = fakeContext({ source: `INT. LONG - DAY\n\n${action}INT. NEXT - DAY\n\nEnd.\n` });
    expect(draw(tab(), ctx).buttons[0]?.text).toBe('1 INT. LONG - DAY Page 1 · 2 2/8 pages');
  });

  test('goes to the scene heading when one is chosen', () => {
    const ctx = fakeContext();
    const view = draw(tab(), ctx);
    view.buttons[1]?.click();
    view.buttons[0]?.click();
    expect(ctx.calls.goto).toEqual([
      ctx.text.indexOf('EXT. BACK PORCH'),
      ctx.text.indexOf('INT. KITCHEN'),
    ]);
  });

  test('shows a locked scene number as the writer typed it', () => {
    const ctx = fakeContext({ source: 'INT. A - DAY #12A#\n\nOne.\n' });
    expect(draw(tab(), ctx).buttons[0]?.text).toMatch(/^12A INT\. A - DAY /);
  });

  test('says so while the first layout is on its way', () => {
    const view = draw(tab(), fakeContext({ layout: 'pending' }));
    expect(view.text).toBe('Laying out…');
    expect(view.buttons).toEqual([]);
  });

  test('waits for the layout to match the text rather than pair a scene with the wrong page', () => {
    // A scene was added; the layout still has the script before it.
    const ctx = fakeContext({ source: 'INT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n' });
    ctx.layoutOf = 'INT. A - DAY\n\nOne.\n';
    expect(draw(tab(), ctx).text).toBe('Laying out…');
    // The layout catches up.
    ctx.layoutOf = undefined;
    expect(draw(tab(), ctx).buttons).toHaveLength(2);
  });

  test('says the pages could not be made when the layout failed', () => {
    const view = draw(tab(), fakeContext({ layout: 'failed' }));
    expect(view.text).toBe('The pages couldn’t be made, so scenes can’t be placed on them.');
  });

  test('says so for a script with no scenes', () => {
    const view = draw(tab(), fakeContext({ source: 'Just action.\n' }));
    expect(view.text).toBe('No scene headings yet.');
  });

  test('says it is not available for a Markdown document', () => {
    const view = draw(tab(), fakeContext({ kind: 'markdown', source: '# Notes\n' }));
    expect(view.text).toBe('Not available for Markdown documents.');
    expect(view.buttons).toEqual([]);
  });

  test('the button opens the tab', () => {
    const ctx = fakeContext();
    sceneList.action?.run(ctx);
    expect(ctx.calls.openedTab).toBe(1);
  });
});

describe('lengthLabel', () => {
  test.each([
    [1, '1/8 page'],
    [3, '3/8 page'],
    [7, '7/8 page'],
    [8, '1 page'],
    [9, '1 1/8 pages'],
    [16, '2 pages'],
    [21, '2 5/8 pages'],
  ])('%i eighths is %s', (eighths, label) => {
    expect(lengthLabel(eighths)).toBe(label);
  });
});
