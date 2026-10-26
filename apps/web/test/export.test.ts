// @vitest-environment jsdom
import { builtins } from '@drafter/templates';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { FileAccess, FileRef } from '../app/storage/files';

const TEXT = 'Title: The Call: Part 1\n\nINT. KITCHEN - NIGHT\n\nA phone rings.\n';
const OTHER = 'Title: The Crossing\n\nINT. HALL - DAY\n\nHi.\n';

// The editor shows `shown.text`; a test changes it to be another script's. A script switch in
// flight is `busy`.
const shown = vi.hoisted(() => ({
  text: '',
  kind: 'fountain' as 'fountain' | 'markdown',
  project: null as null | { fileName?: string; lineBreak?: '\n' | '\r\n'; bom?: boolean },
}));
const switching = vi.hoisted(() => ({ busy: undefined as undefined | { value: boolean } }));
vi.mock('../app/editor/session', async () => {
  const { parse } = await import('@drafter/fountain');
  const { builtins } = await import('@drafter/templates');
  const template = { value: builtins['us-screenplay'] };
  return {
    useEditor: () => ({
      get doc() {
        return { value: parse(shown.text) };
      },
      template,
      get kind() {
        return { value: shown.kind };
      },
      view: { state: { doc: { toString: () => shown.text } } },
    }),
  };
});
vi.mock('../app/storage/script', async () => {
  const { ref } = await import('vue');
  const busy = ref(false);
  switching.busy = busy;
  return { useScript: () => ({ busy, project: { value: shown.project } }) };
});

const render = vi.fn();
vi.mock('../app/storage/export-client', () => ({ renderExport: render }));

/** What a FileAccess did, in order. */
function recorder(options: { inPlace: boolean }) {
  const log: string[] = [];
  const written: { name: string; data: string | Uint8Array }[] = [];
  const control = { cancel: false, failWrite: false };
  const access: FileAccess = {
    canSaveInPlace: options.inPlace,
    pickToOpen: async () => null,
    fromDrop: async () => null,
    async pickToSave(name, kind) {
      log.push(`pick ${name} ${kind}`);
      return control.cancel ? null : ({ name } as FileRef);
    },
    read: async () => ({ bytes: new Uint8Array(), lastModified: 0 }),
    async write(ref, data) {
      log.push('write');
      if (control.failWrite) throw new DOMException('No.', 'NotAllowedError');
      written.push({ name: ref.name, data });
    },
    permission: async () => 'granted',
    sameFile: async () => false,
    download(name, data, type) {
      log.push(`download ${name} ${type}`);
      written.push({ name, data });
    },
  };
  return { access, log, written, control };
}

async function load(options: { inPlace: boolean }) {
  vi.resetModules();
  shown.text = TEXT;
  shown.kind = 'fountain';
  shown.project = null;
  render.mockReset();
  render.mockImplementation(async () => {
    return 'text';
  });
  const files = await import('../app/storage/files');
  const mine = recorder(options);
  files.setFiles(mine.access);
  const exported = await import('../app/storage/export');
  return { ...mine, ...exported };
}

describe('exporting', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  test('asks where to save before it renders, and suggests the title', async () => {
    const t = await load({ inPlace: true });
    render.mockImplementation(async () => {
      t.log.push('render');
      return new Uint8Array([1]);
    });
    expect(await t.exportScript('pdf')).toBe('saved');
    // The colon is not allowed in a file name.
    expect(t.log).toEqual(['pick The Call Part 1.pdf pdf', 'render', 'write']);
    expect(t.written[0]?.data).toEqual(new Uint8Array([1]));
    expect(render).toHaveBeenCalledWith({
      kind: 'pdf',
      source: TEXT,
      template: builtins['us-screenplay'],
    });
    expect(t.exportNotice.value).toBe('Exported The Call Part 1.pdf.');
  });

  test('exports plain text under a .txt name', async () => {
    const t = await load({ inPlace: true });
    expect(await t.exportScript('txt')).toBe('saved');
    expect(t.log[0]).toBe('pick The Call Part 1.txt txt');
    expect(t.written[0]?.data).toBe('text');
  });

  test('exports a Markdown document as its own text, as .md or .txt, with no rendering', async () => {
    const t = await load({ inPlace: true });
    shown.text = '# The Treatment\n\nWords.\n';
    shown.kind = 'markdown';
    expect(await t.exportScript('md')).toBe('saved');
    expect(await t.exportScript('txt')).toBe('saved');
    expect(t.log).toEqual([
      'pick The Treatment.md markdown',
      'write',
      'pick The Treatment.txt txt',
      'write',
    ]);
    expect(t.written.map((w) => w.data)).toEqual([shown.text, shown.text]);
    expect(render).not.toHaveBeenCalled();
  });

  test('writes a Markdown document with its file’s line breaks and byte order mark, as Save does', async () => {
    for (const inPlace of [true, false]) {
      const t = await load({ inPlace });
      shown.text = '# The Treatment\n\nWords.\n';
      shown.kind = 'markdown';
      shown.project = { fileName: 'The Treatment.md', lineBreak: '\r\n', bom: true };
      expect(await t.exportScript('md')).toBe('saved');
      expect(await t.exportScript('txt')).toBe('saved');
      const bytes = '\uFEFF# The Treatment\r\n\r\nWords.\r\n';
      expect(t.written.map((w) => w.data)).toEqual([bytes, bytes]);
    }
  });

  test('calls a Markdown document with no heading after its file', async () => {
    const t = await load({ inPlace: true });
    shown.text = 'Just words.\n';
    shown.kind = 'markdown';
    shown.project = { fileName: 'notes.md' };
    expect(await t.exportScript('md')).toBe('saved');
    expect(t.log[0]).toBe('pick notes.md markdown');
  });

  test('says a PDF of a Markdown document isn’t available, before any picker', async () => {
    const t = await load({ inPlace: true });
    shown.text = '# The Treatment\n';
    shown.kind = 'markdown';
    expect(await t.exportScript('pdf')).toBe('cancelled');
    expect(t.exportError.value).toMatch(/PDF of a Markdown document/);
    expect(t.log).toEqual([]);
  });

  test('does nothing when the picker is cancelled', async () => {
    const t = await load({ inPlace: true });
    t.control.cancel = true;
    expect(await t.exportScript('pdf')).toBe('cancelled');
    expect(render).not.toHaveBeenCalled();
    expect(t.written).toEqual([]);
    expect(t.exportNotice.value).toBe('');
    expect(t.exportError.value).toBe('');
  });

  test('downloads where the browser has no picker', async () => {
    const t = await load({ inPlace: false });
    render.mockResolvedValue(new Uint8Array([1]));
    expect(await t.exportScript('pdf')).toBe('saved');
    expect(t.log).toEqual(['download The Call Part 1.pdf application/pdf']);
    await t.exportScript('txt');
    expect(t.log[1]).toBe('download The Call Part 1.txt text/plain');
  });

  test('says so, and does not throw, when the export fails', async () => {
    const t = await load({ inPlace: true });
    render.mockRejectedValue(new Error('The fonts could not be loaded.'));
    expect(await t.exportScript('pdf')).toBe('cancelled');
    expect(t.exportError.value).toBe(
      'Couldn’t export The Call Part 1.pdf: The fonts could not be loaded.',
    );
    expect(t.exportNotice.value).toBe('');
    expect(t.written).toEqual([]);
  });

  test('says so, and does not throw, when the file cannot be written', async () => {
    const t = await load({ inPlace: true });
    t.control.failWrite = true;
    expect(await t.exportScript('txt')).toBe('cancelled');
    expect(t.exportError.value).toContain('Couldn’t export The Call Part 1.txt');
  });

  test('a good export clears an earlier error, and a new one clears the notice', async () => {
    const t = await load({ inPlace: true });
    render.mockRejectedValueOnce(new Error('boom'));
    await t.exportScript('txt');
    expect(t.exportError.value).not.toBe('');
    await t.exportScript('txt');
    expect(t.exportError.value).toBe('');
    expect(t.exportNotice.value).toBe('Exported The Call Part 1.txt.');
  });

  test('joins an export already under way', async () => {
    const t = await load({ inPlace: true });
    const first = t.exportScript('pdf');
    const second = t.exportScript('pdf');
    expect(await first).toBe('saved');
    expect(await second).toBe('saved');
    expect(render).toHaveBeenCalledTimes(1);
  });

  for (const kind of ['pdf', 'txt'] as const) {
    for (const [what, text] of [
      ['empty', ''],
      ['only blank lines', '\n\n  \n\n'],
    ] as const) {
      test(`refuses an ${what} script as ${kind}, before any picker`, async () => {
        const t = await load({ inPlace: true });
        shown.text = text;
        expect(await t.exportScript(kind)).toBe('cancelled');
        expect(t.exportError.value).toBe('Nothing to export yet.');
        expect(t.exportNotice.value).toBe('');
        expect(t.log).toEqual([]);
        expect(render).not.toHaveBeenCalled();
        expect(t.written).toEqual([]);
      });
    }
  }

  test('waits for a script switch, and names and renders the same script', async () => {
    const t = await load({ inPlace: true });
    const busy = switching.busy as { value: boolean };
    busy.value = true;
    const done = t.exportScript('txt');
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Nothing has been asked or read while the switch is under way.
    expect(t.log).toEqual([]);
    // The switch ends: the editor shows the other script.
    shown.text = OTHER;
    busy.value = false;
    expect(await done).toBe('saved');
    expect(t.log[0]).toBe('pick The Crossing.txt txt');
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ source: OTHER }));
    expect(t.exportNotice.value).toBe('Exported The Crossing.txt.');
  });

  test('renders the text it named, even if the editor changes while the picker is open', async () => {
    const t = await load({ inPlace: true });
    const pick = t.access.pickToSave;
    t.access.pickToSave = async (name, kind) => {
      shown.text = OTHER;
      return pick(name, kind);
    };
    await t.exportScript('txt');
    expect(t.log[0]).toBe('pick The Call Part 1.txt txt');
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ source: TEXT }));
  });

  test('queues a different kind after the one under way, and produces both', async () => {
    const t = await load({ inPlace: true });
    let release: (() => void) | undefined;
    render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(new Uint8Array([1]));
        }),
    );
    render.mockResolvedValueOnce('text');
    const pdf = t.exportScript('pdf');
    const txt = t.exportScript('txt');
    await new Promise((resolve) => setTimeout(resolve, 20));
    // One render at a time: the worker's replies are matched in order.
    expect(render).toHaveBeenCalledTimes(1);
    expect(t.log).toEqual(['pick The Call Part 1.pdf pdf']);
    release?.();
    expect(await pdf).toBe('saved');
    expect(await txt).toBe('saved');
    expect(t.log).toEqual([
      'pick The Call Part 1.pdf pdf',
      'write',
      'pick The Call Part 1.txt txt',
      'write',
    ]);
    expect(t.written.map((w) => w.name)).toEqual(['The Call Part 1.pdf', 'The Call Part 1.txt']);
    expect(t.exportNotice.value).toBe('Exported The Call Part 1.txt.');
  });
});
