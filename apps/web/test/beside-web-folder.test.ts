import { describe, expect, test } from 'vitest';
import { webFolder } from '../app/beside/web';

// The granted folder in Chromium (beside/web.ts): the File System Access API has no exclusive
// create, so `create` checks the name is free, writes, then reads the file back. When another
// writer got there in between (another tab), whichever text is left in the file is the one written,
// and the other is told `exists`, so its draft goes to `(2)` and neither is lost.

/** A folder in memory shaped like FileSystemDirectoryHandle, with a hook after each write. */
function memoryRoot(afterWrite?: (name: string) => void) {
  const files = new Map<string, Uint8Array>();
  const notFound = () => new DOMException('Not found.', 'NotFoundError');
  const dir = (prefix: string): FileSystemDirectoryHandle =>
    ({
      name: prefix,
      async getDirectoryHandle(name: string) {
        return dir(`${prefix}${name}/`);
      },
      async getFileHandle(name: string, options?: { create?: boolean }) {
        const key = `${prefix}${name}`;
        if (!files.has(key)) {
          if (!options?.create) throw notFound();
          files.set(key, new Uint8Array());
        }
        return {
          name,
          kind: 'file',
          async getFile() {
            const bytes = files.get(key) as Uint8Array;
            return { size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer };
          },
          async createWritable() {
            let held = new Uint8Array();
            return {
              async write(bytes: Uint8Array) {
                held = new Uint8Array(bytes);
              },
              async close() {
                files.set(key, held);
                afterWrite?.(key);
              },
              async abort() {},
            };
          },
        };
      },
    }) as unknown as FileSystemDirectoryHandle;
  return { root: dir(''), files };
}

const enc = (s: string) => new TextEncoder().encode(s);

describe('webFolder create', () => {
  test('writes a new file, and says exists for one already there', async () => {
    const { root, files } = memoryRoot();
    const folder = webFolder(root);
    expect(await folder.create('Boca drafts/a.fountain', enc('one'))).toBe('written');
    expect(await folder.create('Boca drafts/a.fountain', enc('two'))).toBe('exists');
    expect(new TextDecoder().decode(files.get('Boca drafts/a.fountain'))).toBe('one');
  });

  test('another writer racing in between: only the text left in the file counts as written', async () => {
    let raced = false;
    const { root, files } = memoryRoot((key) => {
      // Just after this write closes, another tab's write of the same new name lands.
      if (!raced) {
        raced = true;
        files.set(key, enc('theirs'));
      }
    });
    const folder = webFolder(root);
    expect(await folder.create('Boca drafts/a.fountain', enc('mine'))).toBe('exists');
    expect(new TextDecoder().decode(files.get('Boca drafts/a.fountain'))).toBe('theirs');
  });
});
