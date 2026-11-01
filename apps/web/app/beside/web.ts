// Drafts and cuts beside the work in Chromium (drafts-and-cuts design §4.1, Calls 13 and 24): the
// File System Access API can write next to a file only through its folder, so the writer is asked
// once for the script's folder (`showDirectoryPicker`), which must hold the script's own file
// (`isSameEntry`, not just its name), and the folder is remembered per project in the `handles`
// table (`folder:<projectId>`). Other browsers have no folder picker: their drafts and cuts stay in
// the browser, with Export drafts and cuts.
import { db } from '../storage/db';
import type { FileRef } from '../storage/files';
import type { BesideFolder } from './beside';
import { MAX_BESIDE_BYTES, TOO_BIG } from './read';

interface PermissionedDirectory extends FileSystemDirectoryHandle {
  queryPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
  values(): AsyncIterable<FileSystemHandle>;
}
interface PickerWindow {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite';
    startIn?: FileSystemHandle;
    id?: string;
  }) => Promise<FileSystemDirectoryHandle>;
}

/** Whether this browser can be given a folder: Chromium on a computer. */
export function canPickFolder(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as PickerWindow).showDirectoryPicker === 'function'
  );
}

/** The `handles` row of a project's granted folder. */
export const folderKey = (projectId: string): string => `folder:${projectId}`;

const isNotFound = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === 'NotFoundError' || error.name === 'TypeMismatchError');

/** Whether `folder` holds the script's own file (`script`, a file handle), not just its name. */
export async function folderHolds(
  folder: FileSystemDirectoryHandle,
  script: FileRef,
): Promise<boolean> {
  try {
    const there = await folder.getFileHandle(script.name);
    return await there.isSameEntry(script as FileSystemFileHandle);
  } catch {
    return false;
  }
}

/** Asks for the folder (null: cancelled). */
export async function pickFolder(script: FileRef): Promise<FileSystemDirectoryHandle | null> {
  const show = (window as unknown as PickerWindow).showDirectoryPicker;
  if (typeof show !== 'function') return null;
  try {
    return await show.call(window, {
      mode: 'readwrite',
      startIn: script as FileSystemFileHandle,
      id: 'drafter-beside',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
}

/** The project's granted folder, or null. */
export async function storedFolder(projectId: string): Promise<FileSystemDirectoryHandle | null> {
  const row = await db.handles.get(folderKey(projectId)).catch(() => undefined);
  const ref = row?.ref as unknown;
  return ref && typeof (ref as FileSystemDirectoryHandle).getDirectoryHandle === 'function'
    ? (ref as FileSystemDirectoryHandle)
    : null;
}

/** The settings row holding the ID of a project's folder grant. */
export const grantKey = (projectId: string): string => `folder-grant:${projectId}`;

/**
 * Keeps `folder` as the project's. A folder that isn't the one kept before (by `isSameEntry`, not
 * by its name: two folders called "Scripts" are two places) gets a new grant ID, so what was
 * written in the old one is written again in it.
 */
export async function storeFolder(
  projectId: string,
  folder: FileSystemDirectoryHandle,
): Promise<void> {
  const before = await storedFolder(projectId);
  const same = before ? await before.isSameEntry(folder).catch(() => false) : false;
  await db.handles.put({ id: folderKey(projectId), ref: folder as unknown as FileRef });
  if (!same) await db.settings.put({ key: grantKey(projectId), value: crypto.randomUUID() });
}

/**
 * The ID of the project's folder grant: the place drafts and cuts were written is this, never the
 * folder's name. Made the first time it is asked for.
 */
export async function folderGrant(projectId: string): Promise<string> {
  const row = await db.settings.get(grantKey(projectId)).catch(() => undefined);
  if (typeof row?.value === 'string' && row.value !== '') return row.value;
  const id = crypto.randomUUID();
  await db.settings.put({ key: grantKey(projectId), value: id });
  return id;
}

/** Whether Drafter may write in the folder now; `ask` asks (it needs the writer's click). */
export async function folderPermission(
  folder: FileSystemDirectoryHandle,
  ask: boolean,
): Promise<PermissionState> {
  const handle = folder as PermissionedDirectory;
  if (typeof handle.queryPermission !== 'function') return 'granted';
  let state = await handle.queryPermission({ mode: 'readwrite' });
  if (state === 'prompt' && ask && typeof handle.requestPermission === 'function')
    state = await handle.requestPermission({ mode: 'readwrite' });
  return state;
}

/** `rel` split into its folder (or none) and its name. */
function parts(rel: string): { folder: string | null; name: string } {
  const at = rel.indexOf('/');
  return at < 0
    ? { folder: null, name: rel }
    : { folder: rel.slice(0, at), name: rel.slice(at + 1) };
}

async function fileIn(
  root: FileSystemDirectoryHandle,
  rel: string,
  make: boolean,
): Promise<{ dir: FileSystemDirectoryHandle; name: string } | null> {
  const { folder, name } = parts(rel);
  if (folder === null) return { dir: root, name };
  try {
    return { dir: await root.getDirectoryHandle(folder, { create: make }), name };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function exists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

async function writeWhole(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes as BufferSource);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

/** The granted folder, as somewhere to write. */
export function webFolder(root: FileSystemDirectoryHandle): BesideFolder {
  return {
    async read(rel) {
      const at = await fileIn(root, rel, false);
      if (!at) return null;
      try {
        const file = await (await at.dir.getFileHandle(at.name)).getFile();
        // Too big to be Drafter's: refused without reading it.
        if (file.size > MAX_BESIDE_BYTES) throw new Error(TOO_BIG);
        return new Uint8Array(await file.arrayBuffer());
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async list(folder) {
      const at = await fileIn(root, `${folder}/x`, false);
      if (!at) return [];
      const names: string[] = [];
      for await (const entry of (at.dir as PermissionedDirectory).values()) {
        if (entry.kind === 'file') names.push(entry.name);
      }
      return names.sort();
    },
    async create(rel, bytes) {
      const at = (await fileIn(root, rel, true)) as {
        dir: FileSystemDirectoryHandle;
        name: string;
      };
      if (await exists(at.dir, at.name)) return 'exists';
      await writeWhole(await at.dir.getFileHandle(at.name, { create: true }), bytes);
      return 'written';
    },
    async replace(rel, bytes) {
      const at = (await fileIn(root, rel, true)) as {
        dir: FileSystemDirectoryHandle;
        name: string;
      };
      // `createWritable` writes a copy and swaps it in on close: the old file stays whole until then.
      await writeWhole(await at.dir.getFileHandle(at.name, { create: true }), bytes);
    },
  };
}
