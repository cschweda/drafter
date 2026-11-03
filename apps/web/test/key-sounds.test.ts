// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, test } from 'vitest';
import { createKeySounds, type KeySounds, keySounds, soundFor } from '../app/editor/key-sounds';

// Typewriter sounds (Settings → Typewriter sounds, off by default): a clack for each key that
// types, the bell for Enter, nothing at all while it's off, and nothing from a shortcut.

const press = (key: string, extra: Partial<KeyboardEventInit> = {}) =>
  new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });

describe('which keys sound', () => {
  test('a character, a space, Backspace, Delete, and Tab clack; Enter rings the bell', () => {
    for (const key of ['a', 'Z', '7', ' ', '.', 'é', 'Backspace', 'Delete', 'Tab'])
      expect(soundFor(press(key)), key).toBe('key');
    expect(soundFor(press('Enter'))).toBe('bell');
  });

  test('a shortcut, an arrow, or an input method’s key makes no sound', () => {
    for (const event of [
      press('s', { ctrlKey: true }),
      press('k', { metaKey: true }),
      press('1', { altKey: true }),
      press('ArrowLeft'),
      press('Shift'),
      press('Escape'),
      press('a', { isComposing: true }),
    ])
      expect(soundFor(event), event.key).toBeNull();
  });
});

describe('the Source pane', () => {
  function editor(on: () => boolean) {
    const played: string[] = [];
    const sounds: KeySounds = {
      key: () => played.push('key'),
      bell: () => played.push('bell'),
      close: () => {},
    };
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      state: EditorState.create({ doc: '', extensions: [keySounds(on, sounds)] }),
      parent,
    });
    return { view, played };
  }

  test('sounds only while the setting is on, and leaves the key to the editor', () => {
    let on = false;
    const { view, played } = editor(() => on);
    for (const key of ['a', 'Enter']) view.contentDOM.dispatchEvent(press(key));
    expect(played).toEqual([]);
    on = true;
    const enter = press('Enter');
    view.contentDOM.dispatchEvent(press('a'));
    view.contentDOM.dispatchEvent(enter);
    view.contentDOM.dispatchEvent(press('ArrowDown'));
    expect(played).toEqual(['key', 'bell']);
    // The handler said nothing was handled, so CodeMirror's own Enter still runs.
    expect(enter.defaultPrevented).toBe(false);
    view.destroy();
  });
});

describe('the sounds themselves', () => {
  test('make nothing without Web Audio, and never throw', () => {
    const sounds = createKeySounds(undefined);
    expect(() => {
      sounds.key();
      sounds.bell();
      sounds.close();
    }).not.toThrow();
  });

  test('build a clack and a two-tone bell, with no audio file, in one context', () => {
    const made: string[] = [];
    let contexts = 0;
    const param = () => ({
      value: 0,
      setValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
    });
    const node = (kind: string) => {
      made.push(kind);
      const n: Record<string, unknown> = {
        connect: () => n,
        start: () => {},
        stop: () => {},
        frequency: param(),
        Q: param(),
        gain: param(),
      };
      return n;
    };
    class FakeContext {
      state = 'running';
      sampleRate = 8000;
      currentTime = 0;
      destination = {};
      constructor() {
        contexts++;
      }
      createBuffer(_c: number, length: number) {
        return { getChannelData: () => new Float32Array(length) };
      }
      createBufferSource = () => node('noise');
      createBiquadFilter = () => node('filter');
      createGain = () => node('gain');
      createOscillator = () => node('tone');
      resume = async () => {};
      close = async () => {};
    }
    const sounds = createKeySounds(FakeContext as unknown as new () => AudioContext);
    sounds.key();
    sounds.key();
    sounds.bell();
    expect(contexts).toBe(1);
    expect(made.filter((k) => k === 'noise')).toHaveLength(2);
    expect(made.filter((k) => k === 'tone')).toHaveLength(2);
    sounds.close();
  });
});
