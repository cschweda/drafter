import type { IsWord } from '@drafter/cast';
import type { SpellLanguage } from '@drafter/spell';
import { effectScope, type Ref, readonly, ref, watch } from 'vue';
import { useSettings } from '../settings/settings';
import { useSpell } from '../spell/use-spell';

// Which names are ordinary words (seeing-the-script design §3.3, Calls 6 and 7), as the spell
// worker answers, kept for the visit by language and by name in capitals (names that differ only
// in case are one character). Until a name is answered, or when the worker can't answer, `isWord`
// says undefined, which the cast reads as a word: the name counts only in capitals.

export interface WordAnswers {
  isWord: IsWord;
  /** Asks the worker about the names not answered or asked yet, in the spell language. */
  ask(names: readonly string[]): void;
  /** Goes up when an answer comes, or the language changes: whoever read `isWord` reads it again. */
  version: Readonly<Ref<number>>;
  /** No view needs the cast now: a worker made for words alone may end (use-spell.ts says when). */
  rest(): void;
}

let shared: WordAnswers | undefined;

function create(): WordAnswers {
  const { settings } = useSettings();
  const spell = useSpell();
  const version = ref(0);
  /** By language, each name's answer. */
  const answers = new Map<SpellLanguage, Map<string, boolean>>();
  /** By language, the names asked and not answered yet. */
  const asking = new Map<SpellLanguage, Set<string>>();
  const language = () => settings.value.spellLanguage;
  const of = <T>(map: Map<SpellLanguage, T>, lang: SpellLanguage, make: () => T): T => {
    let found = map.get(lang);
    if (!found) {
      found = make();
      map.set(lang, found);
    }
    return found;
  };

  // Another language's answers aren't this one's (they are kept for coming back to it).
  effectScope(true).run(() => {
    watch(language, () => {
      version.value++;
    });
  });

  return {
    isWord: (name) => answers.get(language())?.get(name.toUpperCase()),
    ask(names) {
      const lang = language();
      const known = of(answers, lang, () => new Map<string, boolean>());
      const pending = of(asking, lang, () => new Set<string>());
      const fresh = [...new Set(names.map((name) => name.toUpperCase()))].filter(
        (key) => !known.has(key) && !pending.has(key),
      );
      if (fresh.length === 0) return;
      for (const key of fresh) pending.add(key);
      void spell.words(fresh, lang).then((words) => {
        for (const key of fresh) pending.delete(key);
        // No answer: they stay capitals only, and a later ask tries again (use-spell.ts says when).
        if (words === null) return;
        const yes = new Set(words);
        for (const key of fresh) known.set(key, yes.has(key));
        if (language() === lang) version.value++;
      });
    },
    version: readonly(version),
    rest: () => spell.restSpare(),
  };
}

/** The dictionary's answers for the cast: made on first use in the browser, kept for the visit. */
export function useWordAnswers(): WordAnswers {
  shared ??= create();
  return shared;
}
