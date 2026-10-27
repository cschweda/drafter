import { type Ref, readonly, ref, shallowRef, watch } from 'vue';
import { useEditor } from '../editor/session';
import type { DocumentKind } from '../markdown/kind';
import { useMarkdown } from '../markdown/use-markdown';
import { useSettings } from '../settings/settings';
import { timedSay } from '../storage/say';
import { useScript } from '../storage/script';
import type { Counts } from './count';
import { useCounts } from './counts';

// Sprints (Phase 1 design §7.3): a countdown the writer starts, with Pause, Stop, and Hide
// (WCAG 2.2.2). The end is announced once; the countdown never is.

export type SprintState =
  | { status: 'idle' }
  | {
      status: 'running' | 'paused';
      /** The clock's time when the sprint ends. While paused it is where it was when paused, and means nothing. */
      endsAt: number;
      /** Milliseconds left: what the clock says when running, what was left when paused. */
      remaining: number;
      startWords: number;
      startPages: number;
    };

/** What a sprint is measured against: the words and pages when it began. */
export type SprintCounts = Pick<Counts, 'words' | 'pages'>;

export { SPRINT_MINUTES } from './sprint-minutes';

const MAX_MINUTES = 180;
const MINUTE = 60_000;

/** A length a sprint can have: a whole number of minutes from 1 to 180. */
export function isMinutes(minutes: unknown): minutes is number {
  return (
    typeof minutes === 'number' &&
    Number.isInteger(minutes) &&
    minutes >= 1 &&
    minutes <= MAX_MINUTES
  );
}

/** The minutes in what the writer typed, or null when it isn't a whole number from 1 to 180. */
export function parseMinutes(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const minutes = Number(trimmed);
  return isMinutes(minutes) ? minutes : null;
}

/**
 * Pure timing over an injected clock. Time left is always worked out from `endsAt` and the clock,
 * never from counting ticks, so a tab whose timers were throttled in the background is right
 * the moment it ticks again. The end happens on the first tick at or after `endsAt`, however late,
 * and once: `onEnd` is told what the sprint began with.
 */
export function createSprint(
  clock: { now(): number },
  onEnd?: (began: SprintCounts) => void,
): {
  start(minutes: number, counts: SprintCounts): void;
  pause(): void;
  resume(): void;
  stop(): void;
  tick(): SprintState;
} {
  let state: SprintState = { status: 'idle' };

  function tick(): SprintState {
    if (state.status === 'running') {
      const remaining = state.endsAt - clock.now();
      if (remaining <= 0) {
        const began = { words: state.startWords, pages: state.startPages };
        state = { status: 'idle' };
        onEnd?.(began);
      } else {
        state = { ...state, remaining };
      }
    }
    return { ...state };
  }

  return {
    start(minutes, counts) {
      if (!isMinutes(minutes)) return;
      const remaining = minutes * MINUTE;
      state = {
        status: 'running',
        endsAt: clock.now() + remaining,
        remaining,
        startWords: counts.words,
        startPages: counts.pages,
      };
    },
    pause() {
      // Time that ran out before the pause is the end, not a pause.
      if (tick().status !== 'running' || state.status !== 'running') return;
      state = { ...state, status: 'paused' };
    },
    resume() {
      if (state.status !== 'paused') return;
      state = { ...state, status: 'running', endsAt: clock.now() + state.remaining };
    },
    stop() {
      state = { status: 'idle' };
    },
    tick,
  };
}

/**
 * The time left, as the bar shows it: `15:00`, or `1:30:00` from an hour. The seconds are
 * rounded up, so the countdown reads 0:00 only when time is up. With `coarse` (reduced motion)
 * it is whole minutes, `15 min`, which changes once a minute and not every second.
 */
export function clockText(remaining: number, coarse = false): string {
  if (coarse) return `${Math.ceil(Math.max(0, remaining) / MINUTE)} min`;
  const seconds = Math.ceil(Math.max(0, remaining) / 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0
    ? `${hours}:${two(minutes)}:${two(seconds % 60)}`
    : `${minutes}:${two(seconds % 60)}`;
}

export interface SprintReport {
  markdown: boolean;
  /** Words added (negative for a cut); null when the sprint can't say. */
  words: number | null;
  /** Pages added to a tenth; null when not known (or in a Markdown document). */
  pages: number | null;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** What the end says: "Sprint done: 312 words (1.2 pages)." */
export function sprintMessage(report: SprintReport): string {
  if (report.words === null) {
    return 'Sprint done. The script changed while it ran, so there is no count.';
  }
  const { words } = report;
  if (words === 0) return 'Sprint done: no words added.';
  const count = Math.abs(words);
  const noun = `${count.toLocaleString('en-US')} ${plural(count, 'word', 'words')}`;
  const pages =
    report.markdown || report.pages === null ? null : Math.round(report.pages * 10) / 10;
  // A page count that went the other way from the words (the layout is a moment behind) is left out.
  const showPages = pages !== null && (words > 0 ? pages >= 0 : pages <= 0);
  const inPages = showPages
    ? ` (${Math.abs(pages)} ${plural(Math.abs(pages), 'page', 'pages')})`
    : '';
  return words > 0 ? `Sprint done: ${noun}${inPages}.` : `Sprint done: ${noun} cut${inPages}.`;
}

// ---- The tone ------------------------------------------------------------------------------

type AudioContextConstructor = new () => AudioContext;

/** The browser's Web Audio, if it has one (Safari before 14.1 had it as `webkitAudioContext`). */
function audioContextConstructor(): AudioContextConstructor | undefined {
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext;
}

/**
 * The tone at the end of a sprint, made with the Web Audio API: two short notes, no audio file.
 * The context is made lazily. A browser lets a page make sound only after the writer has
 * interacted with it, and the click that starts a sprint is that, so with the sound on `prepare`
 * makes the context there; `play` makes one if there isn't, and a context the browser holds
 * suspended is asked to resume and otherwise left alone, with no error. The context is closed
 * once the tone has played, and by `cancel`.
 */
export function createTone(): { prepare(): void; play(): void; cancel(): void } {
  let context: AudioContext | undefined;

  function open(): AudioContext | undefined {
    if (context) return context;
    const Constructor = audioContextConstructor();
    if (!Constructor) return undefined;
    try {
      context = new Constructor();
      if (context.state === 'suspended') {
        Promise.resolve(context.resume()).catch(() => {});
      }
    } catch {
      context = undefined;
    }
    return context;
  }

  function release() {
    const held = context;
    context = undefined;
    if (!held) return;
    try {
      Promise.resolve(held.close()).catch(() => {});
    } catch {
      // Already closed.
    }
  }

  return {
    prepare() {
      open();
    },
    play() {
      const audio = open();
      if (!audio) return;
      try {
        if (audio.state === 'suspended') Promise.resolve(audio.resume()).catch(() => {});
        const begin = audio.currentTime + 0.02;
        const note = (frequency: number, at: number, length: number) => {
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(frequency, at);
          // Quiet, with a soft start and end so it doesn't click.
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.linearRampToValueAtTime(0.15, at + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
          oscillator.connect(gain);
          gain.connect(audio.destination);
          oscillator.start(at);
          oscillator.stop(at + length);
        };
        note(660, begin, 0.2);
        note(880, begin + 0.22, 0.3);
      } catch {
        // No sound is better than an error at the end of a sprint.
      }
      // Let the context go once the tone is over.
      setTimeout(release, 1500);
    },
    cancel: release,
  };
}

// ---- The app's sprint ----------------------------------------------------------------------

/** "Sprint done: 312 words (1.2 pages).": a toast, and the one live region that hears of a sprint. Empty after a few seconds. */
export const sprintNotice = ref('');
const announceEnd = timedSay(sprintNotice, 8000);

export interface SprintSession {
  state: Readonly<Ref<SprintState>>;
  /** The countdown is hidden (WCAG 2.2.2); the sprint runs on. */
  hidden: Ref<boolean>;
  /** Starts a sprint of `minutes` (a whole number from 1 to 180) when none is running. */
  start(minutes: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

/** Where a sprint began, and what the script held: the script it reports on must be the one it began on. */
interface Basis {
  id: string | null;
  kind: DocumentKind;
  words: number | null;
  pages: number | null;
}

let session: SprintSession | undefined;

function create(): SprintSession {
  const script = useScript();
  const editor = useEditor();
  const counts = useCounts();
  const markdown = useMarkdown();
  const { settings } = useSettings();
  const tone = createTone();

  const state = shallowRef<SprintState>({ status: 'idle' });
  const hidden = ref(false);
  let began: Basis | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  function basis(): Basis {
    const known = counts.known.value;
    return {
      id: script.project.value?.id ?? null,
      kind: editor.kind.value,
      words: known.words,
      pages: known.pages,
    };
  }

  /** A long Markdown document's words arrive from a worker after each change; wait for the last to come. */
  function settled(): Promise<void> {
    if (editor.kind.value !== 'markdown' || !markdown.updating.value) return Promise.resolve();
    return new Promise((resolve) => {
      const stopWatching = watch(markdown.updating, (updating) => {
        if (!updating) done();
      });
      const giveUp = setTimeout(done, 2000);
      function done() {
        clearTimeout(giveUp);
        stopWatching();
        resolve();
      }
    });
  }

  async function report(from: Basis) {
    await settled();
    const now = basis();
    const same = now.id === from.id && now.kind === from.kind;
    const words = same && now.words !== null && from.words !== null ? now.words - from.words : null;
    const pages = same && now.pages !== null && from.pages !== null ? now.pages - from.pages : null;
    await announceEnd(sprintMessage({ markdown: now.kind === 'markdown', words, pages }));
  }

  const sprint = createSprint({ now: () => Date.now() }, () => {
    const from = began;
    began = null;
    stopTimer();
    // The sound is the writer's choice, and only for a sprint that ran its time.
    if (settings.value.sprintSound) tone.play();
    else tone.cancel();
    if (from) void report(from);
  });

  /** Looks at the clock and updates `state`, but only when what is shown changed: the second, or the status. */
  function refresh() {
    const next = sprint.tick();
    const was = state.value;
    const same =
      next.status === was.status &&
      (next.status === 'idle' ||
        (was.status === next.status &&
          Math.ceil(next.remaining / 1000) === Math.ceil(was.remaining / 1000) &&
          next.endsAt === was.endsAt));
    if (!same) state.value = next;
    if (next.status !== 'running') stopTimer();
  }

  function startTimer() {
    if (timer === undefined) timer = setInterval(refresh, 500);
  }
  function stopTimer() {
    clearInterval(timer);
    timer = undefined;
  }

  // A tab that comes back to the front looks at the clock at once, not at its next throttled tick.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refresh();
    });
  }

  return {
    state: readonly(state),
    hidden,
    start(minutes) {
      if (state.value.status !== 'idle' || !isMinutes(minutes)) return;
      hidden.value = false;
      began = basis();
      // The click that starts a sprint is the gesture a browser wants before it will play a sound.
      if (settings.value.sprintSound) tone.prepare();
      sprint.start(minutes, { words: began.words ?? 0, pages: began.pages ?? 0 });
      refresh();
      startTimer();
    },
    pause() {
      sprint.pause();
      refresh();
    },
    resume() {
      sprint.resume();
      refresh();
      if (state.value.status === 'running') startTimer();
    },
    stop() {
      sprint.stop();
      began = null;
      tone.cancel();
      refresh();
    },
  };
}

/** The app's sprint: one for the visit, created on first use in the browser. */
export function useSprint(): SprintSession {
  session ??= create();
  return session;
}
