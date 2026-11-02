// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';

// The desktop app's right-click Use in story map: the page answers which speech is under a click,
// only when the click lands in the editor itself (`story-map/desktop-speech.ts`).

const SCRIPT = 'INT. DOCK - DAY\n\nGulls.\n\nODILE\nNobody sails a boat they never mended.\n';

const bridge = vi.hoisted(() => ({
  answer: null as null | ((x: number, y: number) => number | null),
}));
vi.mock('../app/desktop', () => ({
  desktop: () => ({
    editor: {
      onSpeechAt(answer: (x: number, y: number) => number | null) {
        bridge.answer = answer;
        return () => {};
      },
      onMarkSpeech: () => () => {},
    },
  }),
}));

const held = vi.hoisted(() => ({ pos: 0, content: null as unknown as HTMLElement }));
vi.mock('../app/editor/session', async () => {
  const { shallowRef } = await import('vue');
  const { parse } = await import('@drafter/fountain');
  return {
    useEditor: () => ({
      kind: shallowRef('fountain'),
      doc: shallowRef(parse(SCRIPT)),
      view: {
        state: { readOnly: false },
        get contentDOM() {
          return held.content;
        },
        posAtCoords: () => held.pos,
      },
    }),
  };
});

/** What `document.elementFromPoint` finds at the click. */
let under: Element | null = null;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML =
    '<div class="cm-content"><div class="cm-line">line</div></div><input id="logline" />';
  held.content = document.querySelector('.cm-content') as HTMLElement;
  document.elementFromPoint = () => under;
  const { installSpeechMenu } = await import('../app/story-map/desktop-speech');
  installSpeechMenu();
});

describe('the speech under a right-click', () => {
  test('a click in the editor, on a speech, answers its offset', () => {
    under = document.querySelector('.cm-line');
    held.pos = SCRIPT.indexOf('Nobody');
    expect(bridge.answer?.(10, 10)).toBe(held.pos);
  });

  test('a click anywhere else, or over another field, is none', () => {
    held.pos = SCRIPT.indexOf('Nobody');
    under = document.getElementById('logline');
    expect(bridge.answer?.(10, 10)).toBeNull();
    under = document.body;
    expect(bridge.answer?.(10, 10)).toBeNull();
    under = null;
    expect(bridge.answer?.(10, 10)).toBeNull();
  });

  test('a click in the editor outside any speech is none', () => {
    under = document.querySelector('.cm-line');
    held.pos = SCRIPT.indexOf('Gulls');
    expect(bridge.answer?.(10, 10)).toBeNull();
  });
});
