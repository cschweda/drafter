import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// Typewriter sounds (the maintainer, 2026-11-03: "a fun toggle ... to hear a typewriter click
// ... and a bell when moving to the next line in source. Again -- off by default"): a key's clack
// for each character typed or deleted in the Source pane, and the carriage bell for Enter. Made
// with the Web Audio API, from noise and two tones: no audio file, nothing fetched, offline. The
// context is made on the first key, which is the interaction a browser asks for before a page may
// make a sound; if the browser has no Web Audio, or holds it suspended, there is simply no sound.

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | undefined {
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext;
}

export interface KeySounds {
  /** A key's clack. */
  key(): void;
  /** The carriage bell, at a new line. */
  bell(): void;
  close(): void;
}

/** The two sounds, in one lazily made context. */
export function createKeySounds(Constructor = audioContextConstructor()): KeySounds {
  let context: AudioContext | undefined;
  let noise: AudioBuffer | undefined;

  function open(): AudioContext | undefined {
    if (context) return context;
    if (!Constructor) return undefined;
    try {
      context = new Constructor();
      if (context.state === 'suspended') Promise.resolve(context.resume()).catch(() => {});
      // 40 ms of noise, made once: each clack is a slice of it, filtered and shaped.
      const length = Math.ceil(context.sampleRate * 0.04);
      noise = context.createBuffer(1, length, context.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      context = undefined;
    }
    return context;
  }

  return {
    key() {
      const ctx = open();
      if (!ctx || !noise) return;
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = noise;
      // A key and its typebar: a bright click with a little body, each a touch different.
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800 + Math.random() * 900;
      filter.Q.value = 1.2;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.5, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
      source.connect(filter).connect(gain).connect(ctx.destination);
      source.start(now);
      source.stop(now + 0.04);
    },
    bell() {
      const ctx = open();
      if (!ctx) return;
      const now = ctx.currentTime;
      // A small bell: a high tone and its overtone, struck and left to ring.
      for (const [frequency, level] of [
        [2093, 0.22],
        [5274, 0.08],
      ] as const) {
        const tone = ctx.createOscillator();
        tone.type = 'sine';
        tone.frequency.value = frequency;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(level, now + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
        tone.connect(gain).connect(ctx.destination);
        tone.start(now);
        tone.stop(now + 0.95);
      }
    },
    close() {
      const held = context;
      context = undefined;
      noise = undefined;
      if (held) Promise.resolve(held.close()).catch(() => {});
    },
  };
}

/** Whether a key press is one that types, deletes, or starts a new line, as a typewriter's would sound. */
export function soundFor(event: KeyboardEvent): 'key' | 'bell' | null {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === 'Enter') return 'bell';
  if (event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Tab') return 'key';
  if (event.key === ' ' || [...event.key].length === 1) return 'key';
  return null;
}

/**
 * The Source pane's typewriter sounds: a clack for each key that types, and the bell for Enter,
 * while `on()` says so (Settings → Typewriter sounds, off by default). The page's own handling of
 * the key is untouched.
 */
export function keySounds(on: () => boolean, sounds: KeySounds = createKeySounds()): Extension {
  return EditorView.domEventHandlers({
    keydown(event) {
      if (!on()) return false;
      const which = soundFor(event);
      if (which === 'bell') sounds.bell();
      else if (which === 'key') sounds.key();
      return false;
    },
  });
}
