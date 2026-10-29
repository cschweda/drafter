import { CHECK_SPELLING_OFF, SPELL_FAILED } from './notice';
import { spellingCount } from './rows';
import type { SpellState } from './spell-client';

// Check spelling (Plan D, Call 13), apart from the registry so a test can drive it: it waits for
// the check under way, then shows Problems on its Spelling group and says what it found. It never
// says "No misspelled words." about a check that hasn't come back.

/** What Check spelling says when the check under way hasn't come back, or the dictionary loads. */
export const STILL_CHECKING =
  'Still checking spelling. Problems will list the words when it’s done.';
/** Said when the wait passes `SLOW_MS`. */
export const CHECKING = 'Checking spelling…';

/** How long a wait goes before it's said. */
const SLOW_MS = 300;
/** How long Check spelling waits for a check under way: a dictionary may still be loading. */
const WAIT_MS = 10_000;

export interface CheckSpellingDeps {
  /** Whether the Spellcheck setting is on. */
  on(): boolean;
  /** Resolves once the marks are for the text as it is now (`useSpell().settled`). */
  settled(): Promise<void>;
  state(): SpellState;
  /** How many words are marked now. */
  count(): number;
  /** Shows Problems, with focus on the Spelling heading. */
  show(): Promise<void>;
  say(message: string): void;
}

/** The command's run: a second run while one is waiting is ignored, so focus moves once. */
export function makeCheckSpelling(deps: CheckSpellingDeps): () => Promise<void> {
  let waiting = false;
  return async () => {
    if (!deps.on()) {
      deps.say(CHECK_SPELLING_OFF);
      return;
    }
    if (waiting) return;
    waiting = true;
    try {
      let inTime = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const slow = setTimeout(() => deps.say(CHECKING), SLOW_MS);
      await Promise.race([
        deps.settled().then(() => {
          inTime = true;
        }),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, WAIT_MS);
        }),
      ]);
      clearTimeout(slow);
      clearTimeout(timer);
      await deps.show();
      const state = deps.state();
      if (state === 'failed') deps.say(SPELL_FAILED);
      else if (!inTime || state !== 'ready') deps.say(STILL_CHECKING);
      else deps.say(spellingCount(deps.count()));
    } finally {
      waiting = false;
    }
  };
}
