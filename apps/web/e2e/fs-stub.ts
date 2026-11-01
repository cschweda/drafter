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
    // The folder picker (drafts and cuts beside the work): the stand-in file system's root, which
    // holds every file the pickers made, or the folder `nextFolder` names in it.
    const dirs = w as unknown as { __nextFolder?: string; __folderPicks: number };
    dirs.__folderPicks = 0;
    w.showDirectoryPicker = async () => {
      if (w.__cancelPick) {
        w.__cancelPick = false;
        throw new DOMException('The user aborted a request.', 'AbortError');
      }
      dirs.__folderPicks++;
      const root = await navigator.storage.getDirectory();
      const name = dirs.__nextFolder;
      dirs.__nextFolder = undefined;
      return name ? root.getDirectoryHandle(name, { create: true }) : root;
    };
  });
}

/** The next folder pick answers with this folder of the stand-in file system (not its root). */
export function nextFolder(page: Page, name: string): Promise<void> {
  return page.evaluate((n) => {
    (window as unknown as { __nextFolder: string }).__nextFolder = n;
  }, name);
}

/** How many times the folder picker has been shown. */
export function folderPicks(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __folderPicks: number }).__folderPicks);
}

/** A file's text at a path (`Boca drafts/Boca – Draft 01.fountain`) in the stand-in file system. */
export function textAt(page: Page, path: string): Promise<string | null> {
  return page.evaluate(async (p) => {
    let dir = await navigator.storage.getDirectory();
    const parts = p.split('/');
    try {
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
      const file = await (await dir.getFileHandle(parts.at(-1) as string)).getFile();
      return await file.text();
    } catch {
      return null;
    }
  }, path);
}

/** Puts a file at a path (folders made as needed) in the stand-in file system. */
export function putAt(page: Page, path: string, text: string): Promise<void> {
  return page.evaluate(
    async ({ p, t }) => {
      let dir = await navigator.storage.getDirectory();
      const parts = p.split('/');
      for (const part of parts.slice(0, -1))
        dir = await dir.getDirectoryHandle(part, { create: true });
      const handle = await dir.getFileHandle(parts.at(-1) as string, { create: true });
      const writable = await handle.createWritable();
      await writable.write(t);
      await writable.close();
    },
    { p: path, t: text },
  );
}

/** The names in a folder of the stand-in file system. */
export function filesIn(page: Page, path: string): Promise<string[]> {
  return page.evaluate(async (p) => {
    let dir = await navigator.storage.getDirectory();
    try {
      for (const part of p.split('/')) dir = await dir.getDirectoryHandle(part);
    } catch {
      return [];
    }
    const names: string[] = [];
    for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) {
      names.push(name);
    }
    return names.sort();
  }, path);
}

/** Browsers without the File System Access API: Save downloads. */
export async function removePickers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    for (const name of ['showSaveFilePicker', 'showOpenFilePicker', 'showDirectoryPicker']) {
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

/** When a file was last written (`lastModified`, in ms), or null if there is no such file. */
export function modifiedOf(page: Page, name: string): Promise<number | null> {
  return page.evaluate(async (n) => {
    const root = await navigator.storage.getDirectory();
    try {
      return (await (await root.getFileHandle(n)).getFile()).lastModified;
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

/**
 * Records the text of every `role="alert"` element as it is added to the page, from the first
 * node on: a screen reader announces an alert when it appears, so a message that is shown again
 * has to appear again. Call it before `goto`; `alertsHeard` reads what was recorded.
 */
export async function watchAlerts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __alerts: string[] };
    w.__alerts = [];
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (!(node instanceof Element)) continue;
          for (const el of [node, ...Array.from(node.querySelectorAll('[role="alert"]'))]) {
            if (el.getAttribute('role') === 'alert' && el.textContent)
              w.__alerts.push(el.textContent);
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

/** The alerts `watchAlerts` has seen added, in order. */
export function alertsHeard(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __alerts: string[] }).__alerts);
}

/**
 * Counts how often the app reads (`getFile`) and writes (`createWritable`) a file in the stand-in
 * file system, so a test can wait for a check or a save to have really run. Call it before
 * `goto`; `fileAccess` reads the counts (a test's own reads of a file count too).
 */
export async function countFileAccess(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __reads: number; __writes: number };
    w.__reads = 0;
    w.__writes = 0;
    const proto = FileSystemFileHandle.prototype;
    const getFile = proto.getFile;
    proto.getFile = function (this: FileSystemFileHandle) {
      w.__reads++;
      return getFile.call(this);
    };
    const createWritable = proto.createWritable;
    proto.createWritable = function (this: FileSystemFileHandle, ...args) {
      w.__writes++;
      return createWritable.apply(this, args);
    };
  });
}

/** The counts `countFileAccess` keeps. */
export function fileAccess(page: Page): Promise<{ reads: number; writes: number }> {
  return page.evaluate(() => {
    const w = window as unknown as { __reads: number; __writes: number };
    return { reads: w.__reads, writes: w.__writes };
  });
}
