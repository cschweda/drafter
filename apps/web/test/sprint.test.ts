import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  clockText,
  createSprint,
  createTone,
  isMinutes,
  lastSprintLabel,
  parseMinutes,
  SPRINT_MINUTES,
  sprintMessage,
} from '../app/stats/sprint';

/** A clock the test moves by hand: a sprint reads it, never counts ticks. */
function fakeClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

const MINUTE = 60_000;
const counts = { words: 100, pages: 0.4 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a sprint', () => {
  test('counts down and ends', () => {
    const clock = fakeClock();
    const ended = vi.fn();
    const sprint = createSprint(clock, ended);
    expect(sprint.tick()).toEqual({ status: 'idle' });

    sprint.start(15, { ...counts, minutes: 1, scenes: 1 });
    expect(sprint.tick()).toEqual({
      status: 'running',
      endsAt: 1_000_000 + 15 * MINUTE,
      remaining: 15 * MINUTE,
      startWords: 100,
      startPages: 0.4,
    });

    clock.advance(14 * MINUTE);
    expect(sprint.tick()).toMatchObject({ status: 'running', remaining: MINUTE });
    expect(ended).not.toHaveBeenCalled();

    // The end is the first tick at or after endsAt, and it says what the sprint began with, once.
    clock.advance(MINUTE);
    expect(sprint.tick()).toEqual({ status: 'idle' });
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith({ words: 100, pages: 0.4 });
    expect(sprint.tick()).toEqual({ status: 'idle' });
    clock.advance(MINUTE);
    sprint.tick();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  test('keeps time by the clock when the ticks come late', () => {
    // A background tab's timers are throttled to a tick a minute or fewer: remaining is endsAt
    // minus now, not a count of ticks, and the end fires on the next tick however late.
    const clock = fakeClock();
    const ended = vi.fn();
    const sprint = createSprint(clock, ended);
    sprint.start(25, counts);
    clock.advance(10 * MINUTE + 300);
    expect(sprint.tick()).toMatchObject({ remaining: 15 * MINUTE - 300 });
    clock.advance(3 * 60 * MINUTE);
    expect(sprint.tick()).toEqual({ status: 'idle' });
    expect(ended).toHaveBeenCalledTimes(1);
  });

  test('pauses and resumes without losing time', () => {
    const clock = fakeClock();
    const ended = vi.fn();
    const sprint = createSprint(clock, ended);
    sprint.start(25, counts);
    clock.advance(10 * MINUTE);
    sprint.pause();
    expect(sprint.tick()).toMatchObject({ status: 'paused', remaining: 15 * MINUTE });

    // Time passing while paused costs nothing, however long.
    clock.advance(5 * 60 * MINUTE);
    expect(sprint.tick()).toMatchObject({ status: 'paused', remaining: 15 * MINUTE });
    expect(ended).not.toHaveBeenCalled();

    sprint.resume();
    expect(sprint.tick()).toMatchObject({
      status: 'running',
      remaining: 15 * MINUTE,
      endsAt: clock.now() + 15 * MINUTE,
    });
    clock.advance(15 * MINUTE);
    expect(sprint.tick()).toEqual({ status: 'idle' });
    expect(ended).toHaveBeenCalledTimes(1);
  });

  test('pausing, resuming, and pausing again keeps the same seconds', () => {
    const clock = fakeClock();
    const sprint = createSprint(clock);
    sprint.start(1, counts);
    clock.advance(20_000);
    sprint.pause();
    sprint.pause();
    clock.advance(99_999);
    sprint.resume();
    sprint.resume();
    clock.advance(10_000);
    sprint.pause();
    expect(sprint.tick()).toMatchObject({ status: 'paused', remaining: 30_000 });
  });

  test('stops without announcing', () => {
    const clock = fakeClock();
    const ended = vi.fn();
    const sprint = createSprint(clock, ended);
    sprint.start(15, counts);
    clock.advance(5 * MINUTE);
    sprint.stop();
    expect(sprint.tick()).toEqual({ status: 'idle' });
    clock.advance(60 * MINUTE);
    expect(sprint.tick()).toEqual({ status: 'idle' });
    expect(ended).not.toHaveBeenCalled();

    // A paused sprint stops the same way, and stopping with none running is nothing.
    sprint.start(15, counts);
    sprint.pause();
    sprint.stop();
    sprint.stop();
    expect(sprint.tick()).toEqual({ status: 'idle' });
    expect(ended).not.toHaveBeenCalled();
  });

  test('pausing at or after the end ends it instead', () => {
    const clock = fakeClock();
    const ended = vi.fn();
    const sprint = createSprint(clock, ended);
    sprint.start(1, counts);
    clock.advance(2 * MINUTE);
    sprint.pause();
    expect(sprint.tick()).toEqual({ status: 'idle' });
    expect(ended).toHaveBeenCalledTimes(1);
  });

  test('a start while one is running begins again, and a bad length starts nothing', () => {
    const clock = fakeClock();
    const ended = vi.fn();
    const sprint = createSprint(clock, ended);
    sprint.start(0, counts);
    sprint.start(181, counts);
    sprint.start(1.5, counts);
    sprint.start(Number.NaN, counts);
    expect(sprint.tick()).toEqual({ status: 'idle' });

    sprint.start(15, counts);
    clock.advance(5 * MINUTE);
    sprint.start(25, { words: 500, pages: 2 });
    expect(sprint.tick()).toMatchObject({ remaining: 25 * MINUTE, startWords: 500, startPages: 2 });
    expect(ended).not.toHaveBeenCalled();
  });
});

describe('sprint lengths', () => {
  test('offers 15, 25, and 45 minutes, and takes any whole number from 1 to 180', () => {
    expect(SPRINT_MINUTES).toEqual([15, 25, 45]);
    expect([1, 15, 90, 180].every(isMinutes)).toBe(true);
    expect([0, -5, 181, 1.5, Number.NaN, Number.POSITIVE_INFINITY].some(isMinutes)).toBe(false);
    expect(parseMinutes('20')).toBe(20);
    expect(parseMinutes(' 180 ')).toBe(180);
    expect(parseMinutes('')).toBeNull();
    expect(parseMinutes('0')).toBeNull();
    expect(parseMinutes('181')).toBeNull();
    expect(parseMinutes('12.5')).toBeNull();
    expect(parseMinutes('20 min')).toBeNull();
    expect(parseMinutes('1e1')).toBeNull();
    expect(parseMinutes('-3')).toBeNull();
  });
});

describe('what the countdown says', () => {
  test('shows minutes and seconds, and hours when there are some', () => {
    expect(clockText(15 * MINUTE)).toBe('15:00');
    expect(clockText(14 * MINUTE + 59_001)).toBe('15:00');
    expect(clockText(61_000)).toBe('1:01');
    expect(clockText(999)).toBe('0:01');
    expect(clockText(0)).toBe('0:00');
    expect(clockText(90 * MINUTE)).toBe('1:30:00');
    expect(clockText(180 * MINUTE)).toBe('3:00:00');
  });

  test('shows whole minutes only when motion is reduced', () => {
    expect(clockText(15 * MINUTE, true)).toBe('15 min');
    expect(clockText(14 * MINUTE + 1, true)).toBe('15 min');
    expect(clockText(MINUTE, true)).toBe('1 min');
    expect(clockText(59_000, true)).toBe('1 min');
    expect(clockText(0, true)).toBe('0 min');
  });
});

describe('what the end says', () => {
  test('a screenplay: words, and pages', () => {
    expect(sprintMessage({ markdown: false, words: 312, pages: 1.2 })).toBe(
      'Sprint done: 312 words (1.2 pages).',
    );
    expect(sprintMessage({ markdown: false, words: 1, pages: 0.1 })).toBe(
      'Sprint done: 1 word (0.1 pages).',
    );
    expect(sprintMessage({ markdown: false, words: 1500, pages: 1 })).toBe(
      'Sprint done: 1,500 words (1 page).',
    );
  });

  test('pages are left out when they are not known or went the other way', () => {
    expect(sprintMessage({ markdown: false, words: 40, pages: null })).toBe(
      'Sprint done: 40 words.',
    );
    expect(sprintMessage({ markdown: false, words: 40, pages: -0.1 })).toBe(
      'Sprint done: 40 words.',
    );
  });

  test('nothing added, and a cut', () => {
    expect(sprintMessage({ markdown: false, words: 0, pages: 0 })).toBe(
      'Sprint done: no words added.',
    );
    expect(sprintMessage({ markdown: false, words: -45, pages: -0.3 })).toBe(
      'Sprint done: 45 words cut (0.3 pages).',
    );
    expect(sprintMessage({ markdown: false, words: -1, pages: null })).toBe(
      'Sprint done: 1 word cut.',
    );
  });

  test('a Markdown document: words only', () => {
    expect(sprintMessage({ markdown: true, words: 312, pages: 1.2 })).toBe(
      'Sprint done: 312 words.',
    );
    expect(sprintMessage({ markdown: true, words: 0, pages: null })).toBe(
      'Sprint done: no words added.',
    );
  });

  test('says no count when the script is not the one the sprint began on, or was not known', () => {
    expect(sprintMessage({ markdown: false, words: null, pages: null })).toBe(
      'Sprint done. The script changed while it ran, so there is no count.',
    );
    expect(sprintMessage({ markdown: true, words: null, pages: null })).toBe(
      'Sprint done. The script changed while it ran, so there is no count.',
    );
  });
});

/** An AudioContext standing in for the browser's, which records what was asked of it. */
function fakeAudio(state: 'running' | 'suspended' = 'running') {
  const made: Array<ReturnType<typeof makeContext>> = [];
  function makeContext() {
    const gain = {
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    const oscillators: Array<{
      type: string;
      frequency: { value: number; setValueAtTime: ReturnType<typeof vi.fn> };
      connect: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    }> = [];
    return {
      state,
      currentTime: 0,
      destination: {},
      resume: vi.fn(() => Promise.resolve()),
      close: vi.fn(() => Promise.resolve()),
      createGain: vi.fn(() => gain),
      createOscillator: vi.fn(() => {
        const osc = {
          type: 'sine',
          frequency: { value: 0, setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        oscillators.push(osc);
        return osc;
      }),
      oscillators,
      gain,
    };
  }
  const AudioContext = vi.fn(function (this: unknown) {
    const context = makeContext();
    made.push(context);
    return context;
  });
  vi.stubGlobal('AudioContext', AudioContext);
  return { AudioContext, made };
}

describe('the end tone', () => {
  test('makes no audio context until it plays', () => {
    const audio = fakeAudio();
    createTone();
    expect(audio.AudioContext).not.toHaveBeenCalled();
  });

  test('plays a short tone made with the Web Audio API, then lets the context go', () => {
    vi.useFakeTimers();
    try {
      const audio = fakeAudio();
      const tone = createTone();
      tone.play();
      expect(audio.AudioContext).toHaveBeenCalledTimes(1);
      const context = audio.made[0] as (typeof audio.made)[number];
      expect(context.oscillators.length).toBeGreaterThan(0);
      for (const osc of context.oscillators) {
        expect(osc.start).toHaveBeenCalledTimes(1);
        // Short: it stops itself well inside two seconds.
        const stopAt = osc.stop.mock.calls[0]?.[0] as number;
        expect(stopAt).toBeGreaterThan(0);
        expect(stopAt).toBeLessThan(2);
      }
      expect(context.close).not.toHaveBeenCalled();
      vi.advanceTimersByTime(3000);
      expect(context.close).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test('prepares the context in the start click, and plays on it at the end', () => {
    vi.useFakeTimers();
    try {
      const audio = fakeAudio('suspended');
      const tone = createTone();
      tone.prepare();
      expect(audio.AudioContext).toHaveBeenCalledTimes(1);
      const context = audio.made[0] as (typeof audio.made)[number];
      // Made in the gesture, a suspended context is asked to resume there.
      expect(context.resume).toHaveBeenCalled();
      tone.play();
      expect(audio.AudioContext).toHaveBeenCalledTimes(1);
      expect(context.oscillators.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test('a context made for a sprint that is stopped is let go', () => {
    const audio = fakeAudio();
    const tone = createTone();
    tone.prepare();
    tone.cancel();
    expect((audio.made[0] as (typeof audio.made)[number]).close).toHaveBeenCalledTimes(1);
    tone.cancel();
    expect((audio.made[0] as (typeof audio.made)[number]).close).toHaveBeenCalledTimes(1);
  });

  test('a suspended context, a refused resume, or no Web Audio at all is not an error', async () => {
    const audio = fakeAudio('suspended');
    const tone = createTone();
    tone.prepare();
    const context = audio.made[0] as (typeof audio.made)[number];
    context.resume.mockImplementation(() => Promise.reject(new Error('NotAllowedError')));
    expect(() => tone.play()).not.toThrow();
    await Promise.resolve();

    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    expect(() => createTone().prepare()).not.toThrow();
    expect(() => createTone().play()).not.toThrow();

    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => {
        throw new Error('too many contexts');
      }),
    );
    expect(() => createTone().play()).not.toThrow();
  });
});

describe('the last sprint, in the Counts panel', () => {
  // The time is the reader's own way of writing it, as the status bar's "Saved at" is.
  const ended = new Date(2026, 9, 26, 15, 42);
  const at = ended.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  test('says what it added, and when it ended', () => {
    expect(lastSprintLabel({ markdown: false, words: 312, pages: 1.2 }, ended)).toBe(
      `Last sprint: 312 words (1.2 pages), ended ${at}.`,
    );
    expect(lastSprintLabel({ markdown: true, words: 1, pages: null }, ended)).toBe(
      `Last sprint: 1 word, ended ${at}.`,
    );
  });

  test('says nothing added, a cut, and no count as the end did', () => {
    expect(lastSprintLabel({ markdown: false, words: 0, pages: 0 }, ended)).toBe(
      `Last sprint: no words added, ended ${at}.`,
    );
    expect(lastSprintLabel({ markdown: false, words: -45, pages: -0.3 }, ended)).toBe(
      `Last sprint: 45 words cut (0.3 pages), ended ${at}.`,
    );
    expect(lastSprintLabel({ markdown: false, words: null, pages: null }, ended)).toBe(
      `Last sprint: no count, since the script changed while it ran. It ended ${at}.`,
    );
  });
});
