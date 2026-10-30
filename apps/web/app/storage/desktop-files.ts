/**
 * The desktop app's `FileAccess` (docs/drafter-desktop-design.md §3): the OS's own Open and Save
 * dialogs, and files read and written by path through the desktop app's main process
 * (`DesktopFilesBridge`, apps/desktop/src/files.ts), which writes atomically. A `FileRef` is
 * `{ name, path }`, plain data that IndexedDB keeps as it is and that still works after a restart,
 * with no permission to ask for again. `files.ts` installs it when `desktop()` has a bridge.
 */
import type { DesktopFilesBridge, DesktopSaveExtension } from '../desktop';
import { isImportName } from '../markdown/kind';
import {
  type FileAccess,
  FileGoneError,
  type FileKind,
  FileProblemError,
  type FileRef,
  type PickedFile,
} from './files';

/** A file on disk, by its absolute path. */
export interface DesktopRef extends FileRef {
  readonly path: string;
}

const EXTENSION: Record<FileKind, DesktopSaveExtension> = {
  fountain: '.fountain',
  markdown: '.md',
  txt: '.txt',
  pdf: '.pdf',
  fdx: '.fdx',
};

/**
 * The file's name: the last part of its path. A backslash separates only in a Windows path (one
 * that starts with a drive or `\\`); on Linux and macOS it is part of a name.
 */
export function nameOfPath(path: string): string {
  const windows = /^(?:[a-z]:[\\/]|\\\\)/i.test(path);
  return path.split(windows ? /[\\/]/ : '/').at(-1) || path;
}

const refOf = (path: string): DesktopRef => ({ name: nameOfPath(path), path });

/** The ref's path; a ref with none (a damaged record, a browser's handle) is as good as gone. */
function pathOf(ref: FileRef): string {
  const path = (ref as Partial<DesktopRef>).path;
  if (typeof path !== 'string' || path === '') throw new FileGoneError();
  return path;
}

/**
 * The web app's error for one of the bridge's: its message is a code (`gone`, `failed: EIO`),
 * after whatever Electron puts before an error from the main process.
 */
function translate(error: unknown, doing: 'reading' | 'writing'): unknown {
  const message = error instanceof Error ? error.message : String(error);
  const match = /(?:^|: )(gone|not-allowed|disk-full|too-big|not-a-file|failed)(?::\s*(.*))?$/.exec(
    message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, ''),
  );
  if (!match) return error;
  const [, code, detail] = match;
  switch (code) {
    case 'gone':
      return new FileGoneError();
    case 'not-allowed':
      return new DOMException(
        `Drafter isn’t allowed to ${doing === 'reading' ? 'read' : 'write'} that file.`,
        'NotAllowedError',
      );
    case 'disk-full':
      return new FileProblemError('the disk is full');
    case 'too-big':
      return new FileProblemError('the file is too big');
    case 'not-a-file':
      return new FileProblemError('that isn’t a file');
    default:
      return new FileProblemError(
        `something went wrong ${doing} it${detail ? ` (${detail.trim()})` : ''}`,
      );
  }
}

/** The files the desktop app saves in place (apps/desktop/src/files.ts `SCRIPT_EXTENSIONS`). */
const SCRIPT_EXTENSION = /\.(?:fountain|md|markdown|txt)$/i;

const encode = (data: string | Uint8Array) =>
  typeof data === 'string' ? new TextEncoder().encode(data) : data;

export function desktopFiles(bridge: DesktopFilesBridge): FileAccess {
  async function read(path: string) {
    try {
      return await bridge.read(path);
    } catch (error) {
      throw translate(error, 'reading');
    }
  }

  async function write(path: string, data: string | Uint8Array) {
    try {
      await bridge.write(path, encode(data));
    } catch (error) {
      throw translate(error, 'writing');
    }
  }

  async function picked(path: string): Promise<PickedFile> {
    const ref = refOf(path);
    const file = await read(path);
    // The desktop app writes only scripts (the real file's type, links followed). Anything else the
    // writer opened ("All files") that Open doesn't turn away (storage/formats.ts) becomes a new
    // script with its text, tied to no file, so Save asks where to put it instead of failing every
    // time.
    let real = path;
    try {
      real = await bridge.realPath(path);
    } catch {
      // Judged by its own name.
    }
    if (!SCRIPT_EXTENSION.test(real)) {
      return {
        ref: null,
        name: ref.name,
        ...file,
        // A Final Draft, Highland, or Fade In file is imported, and the import says what came in
        // (storage/open.ts).
        ...(isImportName(ref.name)
          ? {}
          : {
              notice: `“${ref.name}” opened as a new script. Drafter saves only .fountain, .md, .markdown, and .txt files, so Save will ask where to put it.`,
            }),
      };
    }
    return { ref, name: ref.name, ...file };
  }

  return {
    canSaveInPlace: true,

    fromPath: picked,

    async pickToOpen() {
      const path = await bridge.showOpen();
      return path ? picked(path) : null;
    },

    async fromDrop(item) {
      // Asked for before anything is awaited: a dropped item is readable only until the drop
      // handler returns.
      const file = item.getAsFile();
      if (!file) return null;
      let path = '';
      try {
        path = bridge.pathOfDropped(file);
      } catch {
        // No path: opened from the file itself, below.
      }
      if (path) {
        try {
          return await picked(path);
        } catch (error) {
          // The desktop app keeps only scripts it may write back (grants, apps/desktop): anything
          // else dropped opens from its bytes, unbound, as a file with no path does.
          if (!(error instanceof DOMException && error.name === 'NotAllowedError')) throw error;
        }
      }
      // A file with no place on disk (dragged from another app's memory): it opens, unbound.
      return {
        ref: null,
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        lastModified: file.lastModified,
      };
    },

    async pickToSave(suggestedName, kind) {
      const path = await bridge.showSave(suggestedName, EXTENSION[kind]);
      return path ? refOf(path) : null;
    },

    async read(ref) {
      return read(pathOf(ref));
    },

    async write(ref, data) {
      await write(pathOf(ref), data);
    },

    // A path needs no permission, now or after a restart: the main process reads and writes what
    // the writer can.
    async permission() {
      return 'granted';
    },

    async sameFile(a, b) {
      let pathA: string;
      let pathB: string;
      try {
        pathA = pathOf(a);
        pathB = pathOf(b);
      } catch {
        return false;
      }
      try {
        const [realA, realB] = await Promise.all([bridge.realPath(pathA), bridge.realPath(pathB)]);
        return realA === realB;
      } catch {
        return pathA === pathB;
      }
    },

    // Not used while `canSaveInPlace` (Save and Export ask where themselves), but kept to the
    // contract: a Save dialog, then a write.
    download(name, data, type) {
      const extension =
        Object.values(EXTENSION).find((ext) => name.toLowerCase().endsWith(ext)) ??
        (type === 'application/pdf' ? '.pdf' : '.txt');
      void (async () => {
        const path = await bridge.showSave(name, extension);
        if (path) await write(path, data);
      })().catch(() => {});
    },

    watch(ref, onChange) {
      let path: string;
      try {
        path = pathOf(ref);
      } catch {
        return () => {};
      }
      return bridge.watch(path, onChange);
    },
  };
}
