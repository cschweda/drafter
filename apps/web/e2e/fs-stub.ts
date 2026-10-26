import type { Page } from '@playwright/test';

/**
 * Chromium's file pickers, stood in for by the origin-private file system, so the tests can read
 * back what the app wrote. `nextFileName` says what the next pick is called (else the suggested
 * name), and `cancelNextPick` makes it a cancelled dialog. Tests of the download path call
 * `removePickers` instead.
 */
export async function stubPickers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown> & {
      __nextFileName?: string;
      __cancelPick?: boolean;
      __failWrites?: boolean;
      __picks: string[];
    };
    w.__picks = [];
    const pick = async (options?: { suggestedName?: string }) => {
      if (w.__cancelPick) {
        w.__cancelPick = false;
        throw new DOMException('The user aborted a request.', 'AbortError');
      }
      const name = w.__nextFileName ?? options?.suggestedName ?? 'Untitled.fountain';
      w.__nextFileName = undefined;
      w.__picks.push(name);
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(name, { create: true });
      if (w.__failWrites) {
        // A file the page may not write to; the app's write is refused, and nothing is stored.
        return Object.assign(handle, {
          createWritable: () => Promise.reject(new DOMException('No.', 'NotAllowedError')),
        });
      }
      return handle;
    };
    w.showSaveFilePicker = pick;
    w.showOpenFilePicker = async (options?: { suggestedName?: string }) => [await pick(options)];
  });
}

/** Browsers without the File System Access API: Save downloads. */
export async function removePickers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    for (const name of ['showSaveFilePicker', 'showOpenFilePicker']) {
      Object.defineProperty(window, name, { value: undefined, configurable: true });
    }
  });
}

export function nextFileName(page: Page, name: string): Promise<void> {
  return page.evaluate((n) => {
    (window as unknown as { __nextFileName: string }).__nextFileName = n;
  }, name);
}

export function cancelNextPick(page: Page): Promise<void> {
  return page.evaluate(() => {
    (window as unknown as { __cancelPick: boolean }).__cancelPick = true;
  });
}

export function failWrites(page: Page): Promise<void> {
  return page.evaluate(() => {
    (window as unknown as { __failWrites: boolean }).__failWrites = true;
  });
}

/** The names the pickers have been asked for or given, in order, since the page loaded. */
export function picks(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __picks: string[] }).__picks);
}

/** The files in the stand-in file system. */
export function files(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
      names.push(name);
    }
    return names.sort();
  });
}

/** A file's bytes, or null if there is no such file. */
export function bytesOf(page: Page, name: string): Promise<number[] | null> {
  return page.evaluate(async (n) => {
    const root = await navigator.storage.getDirectory();
    try {
      const file = await (await root.getFileHandle(n)).getFile();
      return Array.from(new Uint8Array(await file.arrayBuffer()));
    } catch {
      return null;
    }
  }, name);
}

/** A file's text (UTF-8), or null if there is no such file. */
export async function textOf(page: Page, name: string): Promise<string | null> {
  const bytes = await bytesOf(page, name);
  return bytes ? new TextDecoder().decode(new Uint8Array(bytes)) : null;
}

/** Puts a file (bytes, or UTF-8 text) in the stand-in file system, for the next pick to answer with. */
export function putFile(page: Page, name: string, content: string | number[]): Promise<void> {
  const bytes =
    typeof content === 'string' ? Array.from(new TextEncoder().encode(content)) : content;
  return page.evaluate(
    async ({ n, b }) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(n, { create: true });
      const writable = await handle.createWritable();
      await writable.write(new Uint8Array(b));
      await writable.close();
    },
    { n: name, b: bytes },
  );
}
