import {
  type Checker,
  createChecker,
  createSpellSession,
  DICTIONARIES,
  type Misspelling,
  type SpellLanguage,
  type SpellSession,
} from '@drafter/spell';
import type { DocumentKind } from '../markdown/kind';

// The spellcheck worker's work (Phase 2 design §12; Plan D, Call 5), apart from the worker so a
// test can run it in Node. It holds one session per language: the session's verdicts are cached
// by word alone, so a language change makes a new session rather than reusing the old one's.

/** What the main thread sends the spellcheck worker. */
export type SpellRequest =
  | { type: 'language'; language: SpellLanguage }
  | {
      type: 'check';
      seq: number;
      source: string;
      kind: DocumentKind;
      notes: boolean;
      mine: string[];
    }
  | { type: 'suggest'; seq: number; word: string }
  /** Which of `names` are ordinary words (seeing-the-script design §3.3); loads `language` if need be. */
  | { type: 'words'; seq: number; names: string[]; language: SpellLanguage };
export type SpellReply =
  | { type: 'ready'; language: SpellLanguage }
  | { type: 'failed'; message: string }
  | { type: 'checked'; seq: number; marks: Misspelling[] }
  | { type: 'suggestions'; seq: number; word: string; suggestions: string[] }
  /** The names whose every word, lowercased, is a dictionary word, as they were sent. */
  | { type: 'words'; seq: number; words: string[] };

/** Fetches `${folder}index.aff` and `index.dic` from the app's own origin, which `connect-src 'self'` allows. */
export async function fetchDictionary(
  language: SpellLanguage,
  fetcher: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<{ aff: Uint8Array; dic: Uint8Array }> {
  const { folder } = DICTIONARIES[language];
  const get = async (file: string) => {
    const response = await fetcher(`${folder}${file}`);
    if (!response.ok) throw new Error(`Couldn’t load the dictionary file ${folder}${file}.`);
    return new Uint8Array(await response.arrayBuffer());
  };
  const [aff, dic] = await Promise.all([get('index.aff'), get('index.dic')]);
  return { aff, dic };
}

/** A loaded language: the session that checks text, and its checker for single words. */
interface Loaded {
  session: SpellSession;
  checker: Checker;
}

/** One attempt at loading a language: whoever sees it fail first says so; the rest say nothing. */
interface Attempt {
  language: SpellLanguage;
  session: Promise<Loaded>;
  told: boolean;
}

/** Whether `c` is a letter, a mark, or a digit: what a name's word is trimmed to. */
const WORDLIKE = /[\p{L}\p{M}\p{N}]/u;

/**
 * The words of a name to look up: split at spaces, lowercased, with the marks at each word's edges
 * taken off (`DR.` is `dr`). Scans, so a long name costs its length.
 */
export function nameWords(name: string): string[] {
  const out: string[] = [];
  for (const part of name.toLowerCase().split(' ')) {
    let from = 0;
    let to = part.length;
    while (from < to && !WORDLIKE.test(part[from] as string)) from++;
    while (to > from && !WORDLIKE.test(part[to - 1] as string)) to--;
    if (from < to) out.push(part.slice(from, to));
  }
  return out;
}

/** Whether every word of `name` is a dictionary word; a name with none is no word. */
function isWordName(checker: Checker, name: string): boolean {
  const words = nameWords(name.replace(/\s/g, ' '));
  return words.length > 0 && words.every((word) => checker.correct(word));
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * One session per language; a check or a suggestion before `ready` waits for it; a failed load is
 * one 'failed' reply, tried again on the next request. A request never throws: an error is a reply.
 */
export function createSpellWorker(load: typeof fetchDictionary = fetchDictionary): {
  handle(request: SpellRequest): Promise<SpellReply | null>;
} {
  let language: SpellLanguage = 'en-US';
  let attempt: Attempt | undefined;

  const current = (): Attempt => {
    if (attempt && attempt.language === language) return attempt;
    const wanted = language;
    const made: Attempt = {
      language: wanted,
      session: load(wanted).then((files) => {
        const checker = createChecker(files);
        return { session: createSpellSession(checker), checker };
      }),
      told: false,
    };
    // A failed load is forgotten, so the next request tries again.
    made.session.catch(() => {
      if (attempt === made) attempt = undefined;
    });
    attempt = made;
    return made;
  };

  /** The session, or the reply that says it couldn't be had (null when that was said already). */
  async function session(): Promise<Loaded | { reply: SpellReply | null }> {
    const mine = current();
    try {
      return await mine.session;
    } catch (error) {
      if (mine.told) return { reply: null };
      mine.told = true;
      return { reply: { type: 'failed', message: messageOf(error) } };
    }
  }

  return {
    async handle(request) {
      if (request.type === 'language' || request.type === 'words') language = request.language;
      const got = await session();
      if ('reply' in got) return got.reply;
      try {
        switch (request.type) {
          case 'language':
            return { type: 'ready', language: request.language };
          case 'check':
            return {
              type: 'checked',
              seq: request.seq,
              marks: got.session.check({
                source: request.source,
                kind: request.kind,
                notes: request.notes,
                mine: request.mine,
              }),
            };
          case 'suggest':
            return {
              type: 'suggestions',
              seq: request.seq,
              word: request.word,
              suggestions: got.session.suggest(request.word),
            };
          case 'words':
            return {
              type: 'words',
              seq: request.seq,
              words: request.names.filter((name) => isWordName(got.checker, name)),
            };
        }
      } catch (error) {
        return { type: 'failed', message: messageOf(error) };
      }
    },
  };
}
