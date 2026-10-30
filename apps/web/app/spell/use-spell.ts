import { type ChangeDesc, ChangeSet } from '@codemirror/state';
import { mapSpellMarks, setSpellMarks, spellMarksOf } from '@drafter/cm-fountain';
import type { SpellLanguage } from '@drafter/spell';
import { effectScope, type Ref, readonly, ref, watch } from 'vue';
import { useEditor } from '../editor/session';
import { useSettings } from '../settings/settings';
import { useScript } from '../storage/script';
import { SPELL_FAILED } from './notice';
import {
  createSpellClient,
  SPELL_DEBOUNCE_MS,
  type SpellClient,
  type SpellState,
} from './spell-client';

// Drafter's spellcheck, as the app runs it (Phase 2 design §12; Plan D, Calls 5, 8, and 20). The
// worker is made once the settings are read, the setting is on, and the editor has its first
// script, and ended when the setting goes off. A keystroke costs the marks' mapping (in the
// editor's state) and composing its changes here: the text goes to the worker only after a pause
// of SPELL_DEBOUNCE_MS, and the reply is mapped through every edit made since it was sent, so the
// marks land on the words they were made for. A reply to an older request (another script, kind,
// or language since) is ignored by its number.
//
// The cast also asks the worker which names are ordinary words (seeing-the-script design §3.3,
// Calls 6, 7, and 49). With spellcheck on, its worker answers; with it off, a worker is made for
// that question alone when first asked, made again on the next ask when its dictionary failed, and
// ended when spellcheck starts its own.

export interface SpellSessionApp {
  state: Readonly<Ref<SpellState>>;
  /** At most five suggestions for `word`; none while spellcheck is off or can't answer. */
  suggest(word: string): Promise<string[]>;
  /** The status bar's line after a failed load, once per visit. */
  problem: Readonly<Ref<string>>;
  /**
   * Resolves once the marks are for the text as it is now: a check waiting out its pause is sent
   * at once, and the newest check's reply is awaited. At once while spellcheck is off or halted
   * after a failed load, and when the newest check has its reply already.
   */
  settled(): Promise<void>;
  /**
   * The names whose every word is a dictionary word in `language`; null when the worker can't
   * answer (the dictionary failed to load, or the worker was ended while asked).
   */
  words(names: string[], language: SpellLanguage): Promise<string[] | null>;
}

let shared: SpellSessionApp | undefined;

function create(): SpellSessionApp {
  const editor = useEditor();
  const { settings, ready } = useSettings();
  // The first script is open: on a first visit the sample is already in the editor, with no `load`.
  const { ready: scriptReady } = useScript();
  const state = ref<SpellState>('off');
  const problem = ref('');
  let client: SpellClient | null = null;
  /** With spellcheck off, the worker that answers the words question alone; null until asked. */
  let spare: SpellClient | null = null;
  /** The spare's dictionary failed to load (or it died): the next ask ends it and makes another. */
  let spareFailed = false;
  /** Every change since the newest request's text was taken, or null when there is none. */
  let since: ChangeDesc | null = null;
  /** The newest request's number: only its reply is shown. */
  let wanted = 0;
  /** A load failed: nothing more is sent until the next script, kind, language, or setting change retries. */
  let halted = false;
  /** Whether this visit has said the dictionary failed: it says so once. */
  let said = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** A check is waiting out its pause. */
  let queued = false;
  /** The newest request whose reply has come (or never will: a failure, or the worker ended). */
  let answered = 0;
  /** Who is waiting for `settled`. */
  let waiters: Array<() => void> = [];

  /** Everyone waiting for the marks is told they are as settled as they'll be. */
  function settle() {
    answered = wanted;
    const waiting = waiters;
    waiters = [];
    for (const resolve of waiting) resolve();
  }

  function clearMarks() {
    const { view } = editor;
    if (spellMarksOf(view.state).length > 0) view.dispatch({ effects: setSpellMarks.of([]) });
  }

  function onMarks(marks: Parameters<typeof mapSpellMarks>[0], seq: number) {
    if (seq !== wanted) return;
    if (since) editor.view.dispatch({ effects: setSpellMarks.of(mapSpellMarks(marks, since)) });
    settle();
  }

  function onState(next: SpellState) {
    state.value = next;
    if (next === 'failed') {
      halted = true;
      clearTimeout(timer);
      queued = false;
      clearMarks();
      settle();
      if (!said) {
        said = true;
        problem.value = SPELL_FAILED;
      }
    } else if (next === 'ready') {
      problem.value = '';
    }
  }

  /** Sends the text as it is now (the client, made with no delay, posts it at once: the pause was taken here). */
  function request() {
    clearTimeout(timer);
    queued = false;
    if (!client || halted) return;
    const { state: now } = editor.view;
    since = ChangeSet.empty(now.doc.length).desc;
    wanted = client.check({
      source: now.doc.toString(),
      kind: editor.kind.value,
      notes: settings.value.spellNotes,
      // A copy: the settings' list is a Vue proxy, which a worker can't be sent.
      mine: [...settings.value.personalDictionary],
    });
  }

  const makeWorker = () =>
    new Worker(new URL('../workers/spell.worker.ts', import.meta.url), { type: 'module' });

  function start() {
    if (client) return;
    halted = false;
    // One worker at a time: spellcheck's answers the words question from now on.
    spare?.destroy();
    spare = null;
    try {
      client = createSpellClient(makeWorker(), onMarks, onState, 0);
    } catch {
      // A browser that blocks module workers: no marks, said once, as a failed load is.
      onState('failed');
      return;
    }
    client.language(settings.value.spellLanguage);
    request();
  }

  /** Ends the worker; the next `start` makes another. */
  function end() {
    clearTimeout(timer);
    queued = false;
    client?.destroy();
    client = null;
    since = null;
    wanted = 0;
    settle();
  }

  function stop() {
    end();
    state.value = 'off';
    problem.value = '';
    // Turned on again, a failure is news again.
    said = false;
  }

  /**
   * Checks again now. After a failure, with a fresh worker: the old one may be the thing that
   * failed (it died), and a fresh one loads the dictionary again. Each retry that fails stops
   * the checks again (`onState`).
   */
  function retry() {
    if (!client) return;
    if (halted) {
      end();
      start();
    } else {
      request();
    }
  }

  /** Starts over: the marks go, and the text is checked again now. */
  function again() {
    if (!client) return;
    clearMarks();
    retry();
  }

  editor.onChange((changes) => {
    if (!client) return;
    // Another script (`load`): its state is new, so it has no marks; check it now.
    if (changes === null) {
      retry();
      return;
    }
    if (since) since = since.composeDesc(changes.desc);
    if (halted) return;
    clearTimeout(timer);
    queued = true;
    timer = setTimeout(request, SPELL_DEBOUNCE_MS);
  });

  function settled(): Promise<void> {
    if (!client || halted) return Promise.resolve();
    if (queued) request();
    if (answered === wanted) return Promise.resolve();
    return new Promise((resolve) => waiters.push(resolve));
  }

  void ready.then(() => {
    // The session lives for the visit, so its watchers belong to no component.
    effectScope(true).run(() => {
      watch(
        [() => settings.value.spellcheck, scriptReady],
        ([on, open]) => {
          if (!on) stop();
          else if (open) start();
        },
        { immediate: true },
      );
      watch(
        () => settings.value.spellLanguage,
        (language) => {
          if (!client) return;
          // A fresh worker (after a failure) loads the language it's started with.
          if (!halted) client.language(language);
          again();
        },
      );
      // A load changes the kind too, and its `onChange(null)` has checked already.
      watch([editor.kind, editor.loaded], ([, loaded], [, before]) => {
        if (loaded === before) again();
      });
      watch([() => settings.value.spellNotes, () => settings.value.personalDictionary], retry);
    });
  });

  /** The worker that answers the words question now: spellcheck's, else one made for it. */
  function answerer(): SpellClient | null {
    if (client) return halted ? null : client;
    // A spare that failed answers nothing again: a fresh one tries the dictionary again.
    if (spare && spareFailed) {
      spare.destroy();
      spare = null;
    }
    if (!spare) {
      try {
        spareFailed = false;
        // Nothing is shown from it: no marks, and no state (spellcheck is off).
        const made: SpellClient = createSpellClient(
          makeWorker(),
          () => {},
          (next) => {
            if (next === 'failed' && spare === made) spareFailed = true;
          },
          0,
        );
        spare = made;
      } catch {
        return null;
      }
    }
    return spare;
  }

  async function words(names: string[], language: SpellLanguage): Promise<string[] | null> {
    const asked = answerer();
    if (!asked) return null;
    const answer = await asked.words(names, language);
    // Ended while it was asked (spellcheck turned on or off took over): ask whoever answers now.
    if (answer === null && asked !== client && asked !== spare) return words(names, language);
    return answer;
  }

  return {
    state: readonly(state),
    suggest: (word) => client?.suggest(word) ?? Promise.resolve([]),
    problem: readonly(problem),
    settled,
    words,
  };
}

/** The spellcheck: created on first use, kept for the visit. */
export function useSpell(): SpellSessionApp {
  shared ??= create();
  return shared;
}
