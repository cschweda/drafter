import { createLookup, type LookupBuild, type Result } from 'w1913';

// The definitions worker's work (definitions design §7.3), apart from the worker so a test can run
// it in Node. On the first question it reads the stored file (gzipped, checked by `load`),
// decompresses and parses it, and builds the lookup once; every later question is answered from
// memory (about 0.1 ms). Nothing here touches the network.

export type DefinitionsRequest =
  | { type: 'lookup'; seq: number; word: string }
  | { type: 'suggest'; seq: number; prefix: string; limit: number };

export interface Suggestion {
  headword: string;
  slug: string;
}

export type DefinitionsReply =
  | { type: 'result'; seq: number; result: Result | null }
  | { type: 'suggestions'; seq: number; suggestions: Suggestion[] }
  /** The dictionary isn't downloaded (or what is stored isn't the expected file). */
  | { type: 'missing'; seq: number }
  | { type: 'failed'; seq: number; message: string };

/**
 * A word or phrase worth looking up: letters, with spaces, hyphens, and apostrophes inside, and
 * at most six words (the dictionary's phrases are shorter; a sentence is no lookup).
 */
export function lookupWord(text: string): string | null {
  const word = text
    .trim()
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
    .replace(/\s+/g, ' ');
  if (
    !word ||
    word.length > 64 ||
    word.split(' ').length > 6 ||
    !/^[\p{L}][\p{L}\p{M}' ’-]*$/u.test(word)
  )
    return null;
  return word;
}

/** The lookup build in `gz`: decompressed and parsed. */
export async function parseBuild(gz: Uint8Array): Promise<LookupBuild> {
  const stream = new Blob([gz as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text()) as LookupBuild;
}

export function createDefinitionsWorker(load: () => Promise<Uint8Array | null>) {
  let lookup: Promise<ReturnType<typeof createLookup> | null> | null = null;
  const ready = () => {
    lookup ??= load().then(async (gz) => (gz ? createLookup(await parseBuild(gz)) : null));
    // A failure (or a missing file) is not kept: the next question tries again, after a download.
    return lookup.then(
      (found) => {
        if (!found) lookup = null;
        return found;
      },
      (error: unknown) => {
        lookup = null;
        throw error;
      },
    );
  };
  return {
    async handle(request: DefinitionsRequest): Promise<DefinitionsReply> {
      const { seq } = request;
      try {
        const dictionary = await ready();
        if (!dictionary) return { type: 'missing', seq };
        if (request.type === 'lookup') {
          const word = lookupWord(request.word);
          return { type: 'result', seq, result: word ? dictionary.lookup(word) : null };
        }
        return {
          type: 'suggestions',
          seq,
          suggestions: dictionary.suggest(request.prefix, request.limit),
        };
      } catch (error) {
        return {
          type: 'failed',
          seq,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
