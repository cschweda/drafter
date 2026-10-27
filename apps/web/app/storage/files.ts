/**
 * The one module that touches files: the File System Access API, file inputs, drops, and
 * downloads. Everything else reads and writes files through `FileAccess`, so the desktop app
 * supplies its own (`desktopFiles`, by path, through the main process: chosen here when
 * `desktop()` has a bridge) and a test can supply an in-memory one (`setFiles`).
 */
import { desktop } from '../desktop';
import { desktopFiles } from './desktop-files';

/**
 * A file the writer chose. It must be structured-cloneable, so it can be kept in the `handles`
 * table: the browser version holds a `FileSystemFileHandle`, and the desktop version `{ name, path }`.
 */
export interface FileRef {
  readonly name: string;
}

export interface PickedFile {
  ref: FileRef | null;
  name: string;
  bytes: Uint8Array;
  lastModified: number;
}

/** The file was moved or deleted, or its drive is gone. */
export class FileGoneError extends Error {
  constructor(message = 'The file is gone.') {
    super(message);
    this.name = 'FileGoneError';
  }
}

/**
 * The file system refused for a reason the writer can do something about ("the disk is full"):
 * the message is said after "Couldn’t save the file: ". The file is as it was. (The desktop app's.)
 */
export class FileProblemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileProblemError';
  }
}

export type FileKind = 'fountain' | 'markdown' | 'pdf' | 'txt';

export interface FileAccess {
  /** Save writes back to the file it came from (Chromium's API; a desktop version: always). */
  readonly canSaveInPlace: boolean;
  /** Null: cancelled. */
  pickToOpen(): Promise<PickedFile | null>;
  /** The file at a path the system named (the desktop app's); the browser has no paths. */
  fromPath?(path: string): Promise<PickedFile>;
  fromDrop(item: DataTransferItem): Promise<PickedFile | null>;
  /** Null: cancelled. */
  pickToSave(suggestedName: string, kind: FileKind): Promise<FileRef | null>;
  /** Throws `FileGoneError`. */
  read(ref: FileRef): Promise<{ bytes: Uint8Array; lastModified: number }>;
  /** Asks for permission if needed. */
  write(ref: FileRef, data: string | Uint8Array): Promise<void>;
  permission(ref: FileRef, ask: boolean): Promise<'granted' | 'prompt' | 'denied'>;
  sameFile(a: FileRef, b: FileRef): Promise<boolean>;
  /** The fallback where `!canSaveInPlace`. */
  download(name: string, data: string | Uint8Array, type: string): void;
  /**
   * Calls `onChange` when another program changes the file; returns the function that stops it.
   * Only where the file can be watched (the desktop app); the browser has no way to.
   */
  watch?(ref: FileRef, onChange: () => void): () => void;
}

// ---- The browser's version ---------------------------------------------------------------------

/** The parts of the File System Access API that TypeScript's DOM types leave out. */
interface PermissionedHandle extends FileSystemFileHandle {
  queryPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}
interface PickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption?: boolean;
  multiple?: boolean;
}
interface PickerWindow {
  showSaveFilePicker?: (options?: PickerOptions) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (options?: PickerOptions) => Promise<FileSystemFileHandle[]>;
}
type HandleItem = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
};

const pickers = (): PickerWindow => window as unknown as PickerWindow;
const handleOf = (ref: FileRef) => ref as PermissionedHandle;

const TYPES: Record<FileKind, PickerOptions['types']> = {
  fountain: [{ description: 'Fountain script', accept: { 'text/plain': ['.fountain'] } }],
  markdown: [
    { description: 'Markdown document', accept: { 'text/markdown': ['.md', '.markdown'] } },
  ],
  txt: [{ description: 'Text', accept: { 'text/plain': ['.txt'] } }],
  pdf: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
};

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';
const isGone = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === 'NotFoundError' || error.name === 'NotReadableError');

async function pickedFrom(file: File, ref: FileRef | null): Promise<PickedFile> {
  return {
    ref,
    name: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
    lastModified: file.lastModified,
  };
}

/** A hidden file input, for browsers without a picker. The promise resolves null if it is cancelled. */
function pickWithInput(): Promise<PickedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.fountain,.txt,.md,.markdown,text/plain,text/markdown';
    input.hidden = true;
    const done = () => input.remove();
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      done();
      if (!file) resolve(null);
      else pickedFrom(file, null).then(resolve, reject);
    });
    input.addEventListener('cancel', () => {
      done();
      resolve(null);
    });
    document.body.append(input);
    input.click();
  });
}

const encode = (data: string | Uint8Array) =>
  typeof data === 'string' ? new TextEncoder().encode(data) : data;

export const browserFiles: FileAccess = {
  get canSaveInPlace() {
    return typeof pickers().showSaveFilePicker === 'function';
  },

  async pickToOpen() {
    const show = pickers().showOpenFilePicker;
    if (typeof show !== 'function') return pickWithInput();
    try {
      const [handle] = await show.call(window, {
        types: [
          {
            description: 'Fountain script, Markdown document, or text',
            accept: { 'text/plain': ['.fountain', '.txt'], 'text/markdown': ['.md', '.markdown'] },
          },
        ],
      });
      if (!handle) return null;
      return await pickedFrom(await handle.getFile(), handle);
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  },

  async fromDrop(item) {
    // A dropped item is only readable until the drop handler returns, so everything it can give is
    // asked for now, before anything is awaited.
    const entry = item as HandleItem;
    const asFile = item.getAsFile();
    const asHandle =
      typeof entry.getAsFileSystemHandle === 'function'
        ? entry.getAsFileSystemHandle().catch(() => null)
        : Promise.resolve(null);
    const handle = await asHandle;
    if (handle?.kind === 'file') {
      const file = handle as FileSystemFileHandle;
      return pickedFrom(await file.getFile(), file);
    }
    // No handle (another browser, or a file the page can't keep): the file alone, which opens but can't save in place.
    return asFile ? pickedFrom(asFile, null) : null;
  },

  async pickToSave(suggestedName, kind) {
    const show = pickers().showSaveFilePicker;
    if (typeof show !== 'function') return null;
    try {
      return await show.call(window, { suggestedName, types: TYPES[kind] });
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  },

  async read(ref) {
    try {
      const file = await (ref as FileSystemFileHandle).getFile();
      return { bytes: new Uint8Array(await file.arrayBuffer()), lastModified: file.lastModified };
    } catch (error) {
      if (isGone(error)) throw new FileGoneError();
      throw error;
    }
  },

  async write(ref, data) {
    const handle = handleOf(ref);
    if ((await browserFiles.permission(ref, true)) !== 'granted') {
      throw new DOMException('Drafter may not write that file.', 'NotAllowedError');
    }
    try {
      const writable = await handle.createWritable();
      try {
        await writable.write(encode(data) as BufferSource);
        await writable.close();
      } catch (error) {
        // Give the half-written stream up, so the file keeps what it had and the error is the real one.
        await writable.abort().catch(() => {});
        throw error;
      }
    } catch (error) {
      if (isGone(error)) throw new FileGoneError();
      throw error;
    }
  },

  async permission(ref, ask) {
    const handle = handleOf(ref);
    const mode = { mode: 'readwrite' } as const;
    // A handle that can't be asked (the origin-private file system's, in some browsers) is the page's own.
    if (typeof handle.queryPermission !== 'function') return 'granted';
    try {
      let state = await handle.queryPermission(mode);
      if (state === 'prompt' && ask) state = await handle.requestPermission(mode);
      return state;
    } catch (error) {
      if (isGone(error)) throw new FileGoneError();
      throw error;
    }
  },

  async sameFile(a, b) {
    try {
      return await (a as FileSystemFileHandle).isSameEntry(b as FileSystemFileHandle);
    } catch {
      return false;
    }
  },

  download(name, data, type) {
    const url = URL.createObjectURL(new Blob([encode(data) as BlobPart], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    // The download has started by the time the click returns; give the browser a moment to read it.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};

let current: FileAccess | undefined;

/** The `FileAccess` in use: `browserFiles`, the desktop app's, or a test's own. */
export function useFiles(): FileAccess {
  if (!current) {
    const files = desktop()?.files;
    current = files ? desktopFiles(files) : browserFiles;
  }
  return current;
}

export function setFiles(files: FileAccess): void {
  current = files;
}
