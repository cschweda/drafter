// Sketch (not compiled into the app): FileAccess for Electron, over the preload bridge in
// spike/desktop/electron/preload.cjs. A FileRef is { name, path }: plain data, so Dexie's `handles`
// table keeps it as is. The main process holds the list of granted paths; after a relaunch a stored
// path is re-granted only by `permission(ref, true)`, which asks main to confirm it (main can check
// the path is one it handed out earlier, e.g. a signed token, or ask the writer again).
import type { FileAccess, FileKind, FileRef, PickedFile } from '~/storage/files';
import { FileGoneError } from '~/storage/files';

interface Bridge {
  pickToOpen(): Promise<PickedFile | null>;
  pickToSave(name: string, kind: FileKind): Promise<DesktopRef | null>;
  read(ref: DesktopRef): Promise<{ bytes: Uint8Array; lastModified: number }>;
  write(ref: DesktopRef, data: string | Uint8Array): Promise<void>;
  regrant(ref: DesktopRef): Promise<boolean>;
}
interface DesktopRef extends FileRef {
  readonly path: string;
}
const bridge = () => (window as unknown as { drafterDesktop: Bridge }).drafterDesktop;
const gone = (e: unknown) => String(e).includes('ENOENT');

export const electronFiles: FileAccess = {
  canSaveInPlace: true,
  pickToOpen: () => bridge().pickToOpen(),
  async fromDrop(item) {
    // Electron gives a dropped File its path through webUtils.getPathForFile (exposed by preload).
    const file = item.getAsFile();
    if (!file) return null;
    const path = (window as unknown as { drafterDesktop: { pathOf(f: File): string } }).drafterDesktop.pathOf(file);
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { ref: path ? ({ name: file.name, path } as DesktopRef) : null, name: file.name, bytes, lastModified: file.lastModified };
  },
  pickToSave: (name, kind) => bridge().pickToSave(name, kind),
  async read(ref) {
    try {
      return await bridge().read(ref as DesktopRef);
    } catch (e) {
      if (gone(e)) throw new FileGoneError();
      throw e;
    }
  },
  async write(ref, data) {
    try {
      await bridge().write(ref as DesktopRef, data); // main writes to a temp file and renames
    } catch (e) {
      if (gone(e)) throw new FileGoneError();
      throw e;
    }
  },
  async permission(ref, ask) {
    return (await bridge().regrant(ref as DesktopRef)) ? 'granted' : ask ? 'denied' : 'prompt';
  },
  sameFile: async (a, b) => (a as DesktopRef).path === (b as DesktopRef).path,
  download(name, data, type) {
    // No downloads folder dance: a save dialog, then a write.
    void bridge()
      .pickToSave(name, type === 'application/pdf' ? 'pdf' : 'txt')
      .then((ref) => ref && bridge().write(ref, data));
  },
};
