// Sketch (not compiled into the app): FileAccess for Tauri v2. The app's own Rust commands
// (spike/desktop/tauri/src-tauri/src/main.rs) do the dialogs and the I/O, so the page never gets
// the fs plugin's broad scope; the Rust side keeps the set of granted paths. (The alternative is
// @tauri-apps/plugin-dialog + @tauri-apps/plugin-fs from JS, with the fs scope widened at runtime
// to each picked path: `fs:scope` + the dialog plugin does this automatically for picked paths.)
import { invoke } from '@tauri-apps/api/core';
import type { FileAccess, FileRef } from '~/storage/files';
import { FileGoneError } from '~/storage/files';

interface DesktopRef extends FileRef {
  readonly path: string;
}
const gone = (e: unknown) => /No such file|not found/i.test(String(e));
const bytesOf = (data: string | Uint8Array) =>
  typeof data === 'string' ? new TextEncoder().encode(data) : data;

export const tauriFiles: FileAccess = {
  canSaveInPlace: true,
  async pickToOpen() {
    // Returned as raw bytes (tauri::ipc::Response) in a real build; the spike sends text as JSON.
    const picked = await invoke<{ ref: DesktopRef; name: string; text: string; lastModified: number } | null>('pick_to_open');
    return picked && { ref: picked.ref, name: picked.name, bytes: bytesOf(picked.text), lastModified: picked.lastModified };
  },
  async fromDrop() {
    // WebKitGTK's drop gives a File without a path; Tauri's own drag-drop event (onDragDropEvent)
    // gives paths instead, so drops are handled there and this returns null.
    return null;
  },
  pickToSave: (suggestedName, kind) => invoke<DesktopRef | null>('pick_to_save', { suggestedName, kind }),
  async read(ref) {
    try {
      const r = await invoke<{ text: string; lastModified: number }>('read_file', { fileRef: ref });
      return { bytes: bytesOf(r.text), lastModified: r.lastModified };
    } catch (e) {
      if (gone(e)) throw new FileGoneError();
      throw e;
    }
  },
  async write(ref, data) {
    try {
      // For a PDF: invoke('write_bytes', bytes, { headers: { path } }) sends the body raw, not JSON.
      await invoke('write_file', { fileRef: ref, text: typeof data === 'string' ? data : new TextDecoder().decode(data) });
    } catch (e) {
      if (gone(e)) throw new FileGoneError();
      throw e;
    }
  },
  async permission(ref, ask) {
    return (await invoke<boolean>('regrant', { fileRef: ref, ask })) ? 'granted' : ask ? 'denied' : 'prompt';
  },
  sameFile: async (a, b) => (a as DesktopRef).path === (b as DesktopRef).path,
  download(name, data, type) {
    void invoke<DesktopRef | null>('pick_to_save', { suggestedName: name, kind: type === 'application/pdf' ? 'pdf' : 'txt' }).then(
      (ref) => ref && tauriFiles.write(ref, data),
    );
  },
};
