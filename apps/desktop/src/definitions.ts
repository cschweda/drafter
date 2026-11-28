// Definitions' download (definitions design §7.4): the one request the desktop app makes for the
// writer's dictionary, and only when they ask for it in Settings. The main process fetches the
// pinned W1913 release asset on a session of its own (as the update check does), with no cookies,
// a time limit, at most the file's own size, from GitHub's hosts only, and hands the page the bytes
// only when their SHA-256 is the pinned one. The page cannot name the URL. Built here without
// Electron, so a test can run it; main.ts wires it to `net.fetch` and IPC.
import { createHash } from 'node:crypto';

/**
 * The file, as `apps/web/app/definitions/source.ts` pins it (a test checks the two agree): the
 * desktop app's main process doesn't import the web app's source.
 */
export const DEFINITIONS = {
  url: 'https://github.com/cschweda/w1913/releases/download/v0.17.2/w1913-lookup-0.7.json.gz',
  size: 8_116_098,
  sha256: 'a0675f4e5e32b981278c1bcd384312532b9e75b1457fcfb8a5cd52276f29380f',
} as const;

/** The hosts the download may come from: the release page, and GitHub's asset host it redirects to. */
export const DEFINITIONS_HOSTS = new Set([
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
]);

/** How long the whole download may take. */
export const DEFINITIONS_TIMEOUT_MS = 120_000;

export type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

/** Whether `url` is one the download may touch: https, on one of `DEFINITIONS_HOSTS`. */
export function definitionsHostAllowed(url: string): boolean {
  try {
    const at = new URL(url);
    return at.protocol === 'https:' && DEFINITIONS_HOSTS.has(at.hostname);
  } catch {
    return false;
  }
}

/**
 * Downloads the pinned file through `fetch` (which follows GitHub's redirect; main.ts's session
 * refuses every request to another host, redirects included), reporting bytes as they come, and
 * returns them once they are the file. Throws a sentence for the writer on any failure; `signal`
 * cancels.
 */
export async function downloadDefinitions(
  fetch: Fetcher,
  onProgress: (received: number, total: number) => void,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const limit = AbortSignal.any([signal, AbortSignal.timeout(DEFINITIONS_TIMEOUT_MS)]);
  let response: Response;
  try {
    response = await fetch(DEFINITIONS.url, { signal: limit });
  } catch {
    if (signal.aborted) throw new Error('Cancelled.');
    throw new Error(
      'Couldn’t reach GitHub to download the dictionary. Check the connection and try again.',
    );
  }
  if (response.url && !definitionsHostAllowed(response.url)) {
    throw new Error(
      'The dictionary’s download went somewhere other than GitHub, so it was stopped.',
    );
  }
  if (!response.ok || !response.body)
    throw new Error(`GitHub answered ${response.status} for the dictionary.`);
  if (Number(response.headers.get('content-length') || 0) > DEFINITIONS.size) {
    throw new Error('The dictionary on GitHub isn’t the expected file.');
  }
  const bytes = new Uint8Array(DEFINITIONS.size);
  let received = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (received + value.byteLength > DEFINITIONS.size) {
        throw new Error('The dictionary on GitHub isn’t the expected file.');
      }
      bytes.set(value, received);
      received += value.byteLength;
      onProgress(received, DEFINITIONS.size);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (signal.aborted) throw new Error('Cancelled.');
    if (error instanceof Error && error.message.startsWith('The dictionary')) throw error;
    throw new Error('The dictionary’s download stopped. Try again.');
  }
  if (
    received !== DEFINITIONS.size ||
    createHash('sha256').update(bytes).digest('hex') !== DEFINITIONS.sha256
  ) {
    throw new Error('The dictionary on GitHub isn’t the expected file.');
  }
  return bytes;
}
