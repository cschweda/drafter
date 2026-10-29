import {
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
  | { type: 'suggest'; seq: number; word: string };
export type SpellReply =
  | { type: 'ready'; language: SpellLanguage }
  | { type: 'failed'; message: string }
  | { type: 'checked'; seq: number; marks: Misspelling[] }
  | { type: 'suggestions'; seq: number; word: string; suggestions: string[] };

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

/** One attempt at loading a language: whoever sees it fail first says so; the rest say nothing. */
interface Attempt {
  language: SpellLanguage;
  session: Promise<SpellSession>;
  told: boolean;
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
      session: load(wanted).then((files) => createSpellSession(createChecker(files))),
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
  async function session(): Promise<SpellSession | { reply: SpellReply | null }> {
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
      if (request.type === 'language') language = request.language;
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
              marks: got.check({
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
              suggestions: got.suggest(request.word),
            };
        }
      } catch (error) {
        return { type: 'failed', message: messageOf(error) };
      }
    },
  };
}
