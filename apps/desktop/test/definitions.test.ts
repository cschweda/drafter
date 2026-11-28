// definitions.ts: Definitions' download, without Electron or the network.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  DEFINITIONS,
  definitionsHostAllowed,
  downloadDefinitions,
  type Fetcher,
} from '../src/definitions';

const web = JSON.parse(
  readFileSync(new URL('../../web/app/definitions/source.json', import.meta.url), 'utf8'),
) as { release: string; file: string; size: number; sha256: string };

/** A response with `bytes` as its body, in `chunks` pieces, from `url`. */
function respond(bytes: Uint8Array, url: string, chunks = 4): Response {
  const size = Math.ceil(bytes.byteLength / chunks);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < bytes.byteLength; at += size)
        controller.enqueue(bytes.slice(at, at + size));
      controller.close();
    },
  });
  const response = new Response(body, { status: 200 });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}
const ASSET = 'https://release-assets.githubusercontent.com/github-production-release-asset/1/x';

describe('downloadDefinitions', () => {
  test('pins the same file as the web app', () => {
    expect(DEFINITIONS.size).toBe(web.size);
    expect(DEFINITIONS.sha256).toBe(web.sha256);
    expect(DEFINITIONS.url).toBe(
      `https://github.com/cschweda/w1913/releases/download/${web.release}/${web.file}`,
    );
  });

  test('trusts GitHub’s release hosts over https only', () => {
    expect(definitionsHostAllowed(DEFINITIONS.url)).toBe(true);
    expect(definitionsHostAllowed(ASSET)).toBe(true);
    for (const url of [
      'http://github.com/x',
      'https://evil.example/x',
      'https://github.com.evil.example/',
      'nonsense',
    ])
      expect(definitionsHostAllowed(url), url).toBe(false);
  });

  test('refuses bytes that aren’t the file, and a body that is too big', async () => {
    const small = new Uint8Array(1000);
    const fetch: Fetcher = async () => respond(small, ASSET);
    await expect(
      downloadDefinitions(fetch, () => {}, new AbortController().signal),
    ).rejects.toThrow('isn’t the expected file');
    const big = new Uint8Array(DEFINITIONS.size + 1);
    await expect(
      downloadDefinitions(
        async () => respond(big, ASSET),
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toThrow('isn’t the expected file');
  });

  test('stops a download that ended up somewhere other than GitHub', async () => {
    await expect(
      downloadDefinitions(
        async () => respond(new Uint8Array(1), 'https://evil.example/x'),
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toThrow('somewhere other than GitHub');
  });

  test('reports progress, and says when GitHub can’t be reached or the writer cancels', async () => {
    const seen: number[] = [];
    await downloadDefinitions(
      async () => respond(new Uint8Array(1000), ASSET),
      (received) => seen.push(received),
      new AbortController().signal,
    ).catch(() => {});
    expect(seen).toEqual([250, 500, 750, 1000]);
    await expect(
      downloadDefinitions(
        async () => {
          throw new TypeError('fetch failed');
        },
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toThrow('Couldn’t reach GitHub');
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      downloadDefinitions(
        async () => {
          throw new DOMException('aborted', 'AbortError');
        },
        () => {},
        cancelled.signal,
      ),
    ).rejects.toThrow('Cancelled.');
  });

  // The real file, when the web build has downloaded it (apps/web/.cache/definitions/).
  const cached = new URL(`../../web/.cache/definitions/${web.file}`, import.meta.url);
  test.skipIf(!existsSync(cached))('returns the bytes when they are the file', async () => {
    const bytes = new Uint8Array(readFileSync(cached));
    const got = await downloadDefinitions(
      async () => respond(bytes, ASSET, 50),
      () => {},
      new AbortController().signal,
    );
    expect(createHash('sha256').update(got).digest('hex')).toBe(DEFINITIONS.sha256);
  });
});
