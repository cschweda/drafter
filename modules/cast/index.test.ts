import { afterEach, describe, expect, test, vi } from 'vitest';
import { fakeContext } from '../fake-context';
import { draw } from '../render';
import cast from './index';

const tab = () => {
  const component = cast.tab?.component;
  if (!component) throw new Error('Cast has no tab');
  return component;
};
const copy = (ctx: ReturnType<typeof fakeContext>) => {
  const command = cast.commands?.(ctx).find((c) => c.id === 'copy');
  if (!command) throw new Error('Cast has no copy command');
  return command;
};

afterEach(() => vi.unstubAllGlobals());

describe('Cast', () => {
  test('is a button, a tab, and one command, and asks for nothing', () => {
    expect(cast.action?.label).toBe('Cast');
    expect(cast.tab?.label).toBe('Cast');
    expect(cast.permissions).toEqual({});
    expect(cast.commands?.(fakeContext()).map((c) => c.title)).toEqual(['Cast: copy the list']);
  });

  test('lists the sample screenplay’s characters with speeches and first scene', () => {
    const view = draw(tab(), fakeContext());
    expect(view.buttons.map((b) => b.text)).toEqual([
      'MARGARET 6 speeches · first in scene 1, INT. KITCHEN - NIGHT',
      'DANNY 5 speeches · first in scene 1, INT. KITCHEN - NIGHT',
    ]);
  });

  test('goes to the first cue when a character is chosen', () => {
    const ctx = fakeContext();
    const view = draw(tab(), ctx);
    view.buttons[1]?.click();
    view.buttons[0]?.click();
    // The first cue of each, not a later one.
    expect(ctx.calls.goto).toEqual([
      ctx.text.indexOf('DANNY (O.S.)'),
      ctx.text.indexOf('MARGARET\n'),
    ]);
  });

  test('counts one name once, however it is capitalized or extended', () => {
    const source = [
      'INT. A - DAY',
      '',
      'ANN',
      'Hi.',
      '',
      'EXT. B - DAY',
      '',
      '@Ann',
      '(V.O.)',
      'Again.',
      '',
      "BOB (CONT'D)",
      'Me too.',
      '',
    ].join('\n');
    const view = draw(tab(), fakeContext({ source }));
    expect(view.buttons.map((b) => b.text)).toEqual([
      'ANN 2 speeches · first in scene 1, INT. A - DAY',
      'BOB 1 speech · first in scene 2, EXT. B - DAY',
    ]);
  });

  test('leaves an extension on the cue line out of the name', () => {
    const source = 'INT. A - DAY\n\nANN (V.O.)\nHi.\n\nANN\nHello.\n\nBOB (O.S.)\nYo.\n';
    const view = draw(tab(), fakeContext({ source }));
    expect(view.buttons.map((b) => b.text)).toEqual([
      'ANN 2 speeches · first in scene 1, INT. A - DAY',
      'BOB 1 speech · first in scene 1, INT. A - DAY',
    ]);
  });

  test('names a first appearance before any scene heading', () => {
    const source = 'CARL\nHello.\n\nINT. A - DAY\n\nCARL\nAgain.\n';
    const view = draw(tab(), fakeContext({ source }));
    expect(view.buttons[0]?.text).toBe('CARL 2 speeches · first before the first scene');
  });

  test('says so for a script with no characters', () => {
    expect(draw(tab(), fakeContext({ source: 'INT. A - DAY\n\nQuiet.\n' })).text).toBe(
      'No characters yet.',
    );
  });

  test('says it is not available for a Markdown document', () => {
    const view = draw(tab(), fakeContext({ kind: 'markdown', source: '# Cast\n' }));
    expect(view.text).toBe('Not available for Markdown documents.');
    expect(view.buttons).toEqual([]);
  });

  test('the button opens the tab', () => {
    const ctx = fakeContext();
    cast.action?.run(ctx);
    expect(ctx.calls.openedTab).toBe(1);
  });

  test('copies the list as plain text', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const ctx = fakeContext();
    await copy(ctx).run();
    expect(writeText).toHaveBeenCalledWith(
      [
        'MARGARET: 6 speeches, first in scene 1 (INT. KITCHEN - NIGHT)',
        'DANNY: 5 speeches, first in scene 1 (INT. KITCHEN - NIGHT)',
        '',
      ].join('\n'),
    );
    expect(ctx.calls.notices).toEqual(['Copied the list of 2 characters.']);
  });

  test('says so when the browser won’t copy', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    });
    const ctx = fakeContext();
    await copy(ctx).run();
    expect(ctx.calls.notices).toEqual(['Couldn’t copy the list. Your browser didn’t allow it.']);
  });

  test('copies nothing, and says so, when there are no characters', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const ctx = fakeContext({ source: 'INT. A - DAY\n\nQuiet.\n' });
    await copy(ctx).run();
    expect(writeText).not.toHaveBeenCalled();
    expect(ctx.calls.notices).toEqual(['There are no characters to copy yet.']);
  });

  test('copies nothing from a Markdown document, and is left out of the palette there', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const ctx = fakeContext({ kind: 'markdown', source: '# Cast\n' });
    expect(copy(ctx).enabled?.()).toBe(false);
    await copy(ctx).run();
    expect(writeText).not.toHaveBeenCalled();
    expect(ctx.calls.notices).toEqual(['Not available for Markdown documents.']);
  });
});
