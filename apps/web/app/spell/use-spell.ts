import { type ChangeDesc, ChangeSet } from '@codemirror/state';
import { mapSpellMarks, setSpellMarks, spellMarksOf } from '@drafter/cm-fountain';
import { effectScope, type Ref, readonly, ref, watch } from 'vue';
import { useEditor } from '../editor/session';
import { useSettings } from '../settings/settings';
import { useScript } from '../storage/script';
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

export interface SpellSessionApp {
  state: Readonly<Ref<SpellState>>;
  /** At most five suggestions for `word`; none while spellcheck is off or can't answer. */
  suggest(word: string): Promise<string[]>;
  /** The status bar's line after a failed load, once per visit. */
  problem: Readonly<Ref<string>>;
}

const FAILED =
  'Spellcheck couldn’t load its dictionary, so no words are marked. Everything else works.';

let shared: SpellSessionApp | undefined;

function create(): SpellSessionApp {
  const editor = useEditor();
  const { settings, ready } = useSettings();
  // The first script is open: on a first visit the sample is already in the editor, with no `load`.
  const { ready: scriptReady } = useScript();
  const state = ref<SpellState>('off');
  const problem = ref('');
  let client: SpellClient | null = null;
  /** Every change since the newest request's text was taken, or null when there is none. */
  let since: ChangeDesc | null = null;
  /** The newest request's number: only its reply is shown. */
  let wanted = 0;
  /** A load failed: nothing more is sent until the next script, kind, language, or setting change retries. */
  let halted = false;
  /** Whether this visit has said the dictionary failed: it says so once. */
  let said = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function clearMarks() {
    const { view } = editor;
    if (spellMarksOf(view.state).length > 0) view.dispatch({ effects: setSpellMarks.of([]) });
  }

  function onMarks(marks: Parameters<typeof mapSpellMarks>[0], seq: number) {
    if (seq !== wanted || !since) return;
    editor.view.dispatch({ effects: setSpellMarks.of(mapSpellMarks(marks, since)) });
  }

  function onState(next: SpellState) {
    state.value = next;
    if (next === 'failed') {
      halted = true;
      clearTimeout(timer);
      clearMarks();
      if (!said) {
        said = true;
        problem.value = FAILED;
      }
    } else if (next === 'ready') {
      problem.value = '';
    }
  }

  /** Sends the text as it is now (the client, made with no delay, posts it at once: the pause was taken here). */
  function request() {
    clearTimeout(timer);
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

  function start() {
    if (client) return;
    halted = false;
    try {
      const worker = new Worker(new URL('../workers/spell.worker.ts', import.meta.url), {
        type: 'module',
      });
      client = createSpellClient(worker, onMarks, onState, 0);
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
    client?.destroy();
    client = null;
    since = null;
    wanted = 0;
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
    timer = setTimeout(request, SPELL_DEBOUNCE_MS);
  });

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

  return {
    state: readonly(state),
    suggest: (word) => client?.suggest(word) ?? Promise.resolve([]),
    problem: readonly(problem),
  };
}

/** The spellcheck: created on first use, kept for the visit. */
export function useSpell(): SpellSessionApp {
  shared ??= create();
  return shared;
}
