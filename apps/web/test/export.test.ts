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
  project: null as null | {
    fileName?: string;
    lineBreak?: '\n' | '\r\n';
    bom?: boolean;
    exportOptions?: Record<string, string>;
    timing?: { minutesPerPage?: number };
  },
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
  return {
    useScript: () => ({
      busy,
      project: {
        get value() {
          return shown.project;
        },
      },
    }),
  };
});

const preferences = vi.hoisted(() => ({
  markdownPaper: 'letter' as 'letter' | 'a4',
  spellLanguage: 'en-US' as 'en-US' | 'en-GB',
}));
vi.mock('../app/settings/settings', () => ({
  useSettings: () => ({ settings: { value: preferences } }),
}));

// The worker's answer: the file, and the characters its fonts lack. A test gives the file.
const render = vi.fn();
const missing = vi.hoisted(() => ({ list: [] as string[] }));
vi.mock('../app/storage/export-client', () => ({
  renderExport: async (...args: unknown[]) => ({
    data: await render(...args),
    missing: missing.list,
  }),
}));

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
  preferences.markdownPaper = 'letter';
  preferences.spellLanguage = 'en-US';
  missing.list = [];
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
    expect(render).toHaveBeenCalledWith(
      {
        kind: 'pdf',
        source: TEXT,
        template: builtins['us-screenplay'],
        options: { sceneNumbers: 'none', titlePage: 'full', notes: 'leave-out' },
      },
      expect.any(Function),
    );
    expect(t.exportNotice.value).toBe('Exported The Call Part 1.pdf.');
  });

  test('exports plain text under a .txt name', async () => {
    const t = await load({ inPlace: true });
    expect(await t.exportScript('txt')).toBe('saved');
    expect(t.log[0]).toBe('pick The Call Part 1.txt txt');
    expect(t.written[0]?.data).toBe('text');
  });

  test('exports a Final Draft file under an .fdx name, rendered in the worker', async () => {
    const t = await load({ inPlace: true });
    render.mockResolvedValue('<FinalDraft/>');
    expect(await t.exportScript('fdx')).toBe('saved');
    expect(t.log).toEqual(['pick The Call Part 1.fdx fdx', 'write']);
    expect(t.written[0]?.data).toBe('<FinalDraft/>');
    expect(render).toHaveBeenCalledWith(
      {
        kind: 'fdx',
        source: TEXT,
        template: builtins['us-screenplay'],
        options: { sceneNumbers: 'none', titlePage: 'full', notes: 'leave-out' },
      },
      expect.any(Function),
    );
    expect(t.exportNotice.value).toBe('Exported The Call Part 1.fdx.');
  });

  test('downloads a Final Draft file as XML where the browser has no picker', async () => {
    const t = await load({ inPlace: false });
    expect(await t.exportScript('fdx')).toBe('saved');
    expect(t.log).toEqual(['download The Call Part 1.fdx application/xml']);
  });

  test('html is an export for scripts and Markdown documents', async () => {
    const t = await load({ inPlace: true });
    expect(t.exportApplies('html', 'fountain')).toBe(true);
    expect(t.exportApplies('html', 'markdown')).toBe(true);
    // Second in each list, after the PDF: the other finished-looking file.
    expect(t.EXPORTS.fountain).toEqual(['pdf', 'html', 'txt', 'fdx', 'md']);
    expect(t.EXPORTS.markdown).toEqual(['pdf', 'html', 'md', 'txt']);
  });

  test('the HTML file is named like the others, ending .html', async () => {
    for (const inPlace of [true, false]) {
      const t = await load({ inPlace });
      shown.project = { fileName: 'call.fountain', timing: { minutesPerPage: 1.5 } };
      preferences.spellLanguage = 'en-GB';
      render.mockResolvedValue('<!DOCTYPE html>\n<html></html>\n');
      expect(await t.exportScript('html')).toBe('saved');
      expect(t.log).toEqual(
        inPlace
          ? ['pick The Call Part 1.html html', 'write']
          : ['download The Call Part 1.html text/html'],
      );
      expect(t.written[0]?.data).toBe('<!DOCTYPE html>\n<html></html>\n');
      // The script's text, template, and options, as the PDF's; its title, the spelling
      // language, the app's name, and the script's own page rate for the header's kind line.
      expect(render).toHaveBeenCalledWith(
        {
          kind: 'html',
          source: TEXT,
          template: builtins['us-screenplay'],
          options: { sceneNumbers: 'none', titlePage: 'full', notes: 'leave-out' },
          title: 'The Call: Part 1',
          lang: 'en-GB',
          generator: expect.stringMatching(/^Drafter\b/),
          minutesPerPage: 1.5,
        },
        expect.any(Function),
      );
      expect(t.exportNotice.value).toBe('Exported The Call Part 1.html.');
    }
  });

  test('a Markdown document exports HTML, rendered in the worker from its text', async () => {
    const t = await load({ inPlace: false });
    shown.text = '# The Treatment\n\nWords.\n';
    shown.kind = 'markdown';
    // Its kept options change nothing, and its toast names none.
    shown.project = { exportOptions: { notes: 'include', sceneNumbers: 'all' } };
    render.mockResolvedValue('<!DOCTYPE html>\n');
    expect(await t.exportScript('html')).toBe('saved');
    expect(render).toHaveBeenCalledWith(
      {
        kind: 'markdown-html',
        source: shown.text,
        title: 'The Treatment',
        lang: 'en-US',
        generator: expect.stringMatching(/^Drafter\b/),
      },
      expect.any(Function),
    );
    expect(t.log).toEqual(['download The Treatment.html text/html']);
    expect(t.exportNotice.value).toBe('Exported The Treatment.html.');
  });

  test('notes travel to an html export when included', async () => {
    const t = await load({ inPlace: true });
    shown.project = { exportOptions: { sceneNumbers: 'all', notes: 'include' } };
    render.mockResolvedValue('<!DOCTYPE html>\n');
    expect(await t.exportScript('html')).toBe('saved');
    expect(render).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'html',
        options: { sceneNumbers: 'all', titlePage: 'full', notes: 'include' },
      }),
      expect.any(Function),
    );
    expect(t.exportNotice.value).toBe(
      'Exported The Call Part 1.html, with every scene numbered and notes.',
    );
    // Still never a PDF's.
    expect(await t.exportScript('pdf')).toBe('saved');
    expect(t.exportNotice.value).toBe('Exported The Call Part 1.pdf, with every scene numbered.');
  });

  test('says a Markdown document nested too deeply to export as HTML in words', async () => {
    const t = await load({ inPlace: false });
    shown.text = '# Deep\n';
    shown.kind = 'markdown';
    render.mockRejectedValue(
      new Error('This document is nested too deeply to export: more than 1000 levels.'),
    );
    expect(await t.exportScript('html')).toBe('cancelled');
    expect(t.exportError.value).toBe(
      'Couldn’t export Deep.html: this document is nested too deeply to lay out.',
    );
  });

  test('says only a screenplay or a stage play exports as Final Draft, before any picker', async () => {
    const t = await load({ inPlace: true });
    shown.text = '# The Treatment\n';
    shown.kind = 'markdown';
    expect(await t.exportScript('fdx')).toBe('cancelled');
    expect(t.exportError.value).toBe(
      'Only a screenplay or a stage play exports as a Final Draft file.',
    );
    expect(t.log).toEqual([]);
    expect(render).not.toHaveBeenCalled();
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

  test('exports a Markdown document as a PDF, on the paper in Settings and in the spelling language', async () => {
    const t = await load({ inPlace: true });
    shown.text = '# The Treatment\n\nWords.\n';
    shown.kind = 'markdown';
    preferences.markdownPaper = 'a4';
    preferences.spellLanguage = 'en-GB';
    render.mockImplementation(async () => {
      t.log.push('render');
      return new Uint8Array([1]);
    });
    expect(await t.exportScript('pdf')).toBe('saved');
    expect(t.log).toEqual(['pick The Treatment.pdf pdf', 'render', 'write']);
    expect(render).toHaveBeenCalledWith(
      {
        kind: 'markdown-pdf',
        source: shown.text,
        paper: 'a4',
        title: 'The Treatment',
        lang: 'en-GB',
      },
      expect.any(Function),
    );
    expect(t.written[0]?.data).toEqual(new Uint8Array([1]));
    expect(t.exportNotice.value).toBe('Exported The Treatment.pdf.');
  });

  test('names the PDF after the first heading, as the other exports', async () => {
    const t = await load({ inPlace: false });
    render.mockResolvedValue(new Uint8Array([1]));
    shown.kind = 'markdown';
    shown.text = 'A few words first.\n\n# Field: *Notes*\n\n## Later\n';
    expect(await t.exportScript('pdf')).toBe('saved');
    // No heading: the file's name, as Export as Markdown calls it.
    shown.text = 'Just words.\n';
    shown.project = { fileName: 'notes.md' };
    expect(await t.exportScript('pdf')).toBe('saved');
    expect(t.log).toEqual([
      'download Field Notes.pdf application/pdf',
      'download notes.pdf application/pdf',
    ]);
    expect(render.mock.calls.map(([request]) => request.title)).toEqual(['Field: Notes', 'notes']);
  });

  test('says which characters print as ?, up to five', async () => {
    const t = await load({ inPlace: true });
    render.mockResolvedValue(new Uint8Array([1]));
    shown.kind = 'markdown';
    shown.text = '# The Treatment\n\nWords.\n';
    missing.list = ['漢', '字', '🐦', '港', '湾', '町'];
    expect(await t.exportScript('pdf')).toBe('saved');
    expect(t.exportNotice.value).toBe(
      `Exported The Treatment.pdf. ${t.MISSING_GLYPHS}漢, 字, 🐦, 港, 湾.`,
    );
    expect(t.MISSING_GLYPHS).toBe('Some characters aren’t in Drafter’s fonts and print as ?: ');
    missing.list = ['漢'];
    await t.exportScript('pdf');
    expect(t.exportNotice.value).toBe(`Exported The Treatment.pdf. ${t.MISSING_GLYPHS}漢.`);
  });

  test('says an export is under way when it takes a while, until it is done', async () => {
    const t = await load({ inPlace: true });
    let release: (() => void) | undefined;
    render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(new Uint8Array([1]));
        }),
    );
    const done = t.exportScript('pdf');
    await new Promise((resolve) => setTimeout(resolve, 100));
    // A quick export says nothing until it's done.
    expect(t.exportNotice.value).toBe('');
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(t.exportNotice.value).toBe('Exporting The Call Part 1.pdf…');
    release?.();
    expect(await done).toBe('saved');
    expect(t.exportNotice.value).toBe('Exported The Call Part 1.pdf.');
  });

  test('takes the progress away when a slow export fails', async () => {
    const t = await load({ inPlace: true });
    let fail: (() => void) | undefined;
    render.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = () => reject(new Error('boom'));
        }),
    );
    const done = t.exportScript('pdf');
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(t.exportNotice.value).toBe('Exporting The Call Part 1.pdf…');
    fail?.();
    expect(await done).toBe('cancelled');
    expect(t.exportNotice.value).toBe('');
    expect(t.exportError.value).toBe('Couldn’t export The Call Part 1.pdf: boom');
  });

  test('shows how far a slow export is, and says each quarter it passes, once', async () => {
    const t = await load({ inPlace: true });
    let release: (() => void) | undefined;
    let progress: ((fraction: number | null) => void) | undefined;
    render.mockImplementationOnce(
      (_request: unknown, onProgress: (fraction: number | null) => void) =>
        new Promise((resolve) => {
          progress = onProgress;
          release = () => resolve(new Uint8Array([1]));
        }),
    );
    const done = t.exportScript('pdf');
    await new Promise((resolve) => setTimeout(resolve, 50));
    progress?.(null);
    progress?.(0.3);
    // A quick export shows no bar.
    expect(t.exportProgress.value).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(t.exportNotice.value).toBe('Exporting The Call Part 1.pdf…');
    expect(t.exportProgress.value).toEqual({ name: 'The Call Part 1.pdf', fraction: 0.3 });
    // The quarter it had passed before the bar showed isn't said.
    expect(t.exportMilestone.value).toBe('');
    progress?.(0.45);
    expect(t.exportProgress.value?.fraction).toBe(0.45);
    expect(t.exportMilestone.value).toBe('');
    progress?.(0.52);
    expect(t.exportMilestone.value).toBe('Export 50% done.');
    // A stage that can't say how far it is: the bar moves without a number.
    progress?.(null);
    expect(t.exportProgress.value?.fraction).toBeNull();
    progress?.(0.6);
    expect(t.exportMilestone.value).toBe('Export 50% done.');
    progress?.(0.9);
    expect(t.exportMilestone.value).toBe('Export 75% done.');
    progress?.(1);
    release?.();
    expect(await done).toBe('saved');
    expect(t.exportProgress.value).toBeNull();
    expect(t.exportMilestone.value).toBe('');
    expect(t.exportNotice.value).toBe('Exported The Call Part 1.pdf.');
  });

  test('says a quarter for a moment, and none beside the end', async () => {
    const t = await load({ inPlace: true });
    let release: (() => void) | undefined;
    let progress: ((fraction: number | null) => void) | undefined;
    render.mockImplementationOnce(
      (_request: unknown, onProgress: (fraction: number | null) => void) =>
        new Promise((resolve) => {
          progress = onProgress;
          release = () => resolve(new Uint8Array([1]));
        }),
    );
    const done = t.exportScript('pdf');
    await new Promise((resolve) => setTimeout(resolve, 600));
    progress?.(0.3);
    expect(t.exportMilestone.value).toBe('Export 25% done.');
    // Once said, the hidden text goes, so no stale quarter sits in the toast.
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect(t.exportMilestone.value).toBe('');
    // The end isn't a quarter: "Exported …" says it, without "75% done" beside it.
    progress?.(1);
    expect(t.exportMilestone.value).toBe('');
    release?.();
    expect(await done).toBe('saved');
    expect(t.exportNotice.value).toBe('Exported The Call Part 1.pdf.');
  });

  test('takes the bar away when a slow export fails', async () => {
    const t = await load({ inPlace: true });
    let fail: (() => void) | undefined;
    render.mockImplementationOnce(
      (_request: unknown, onProgress: (fraction: number | null) => void) =>
        new Promise((_, reject) => {
          onProgress(0.6);
          fail = () => reject(new Error('boom'));
        }),
    );
    const done = t.exportScript('pdf');
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(t.exportProgress.value).toEqual({ name: 'The Call Part 1.pdf', fraction: 0.6 });
    fail?.();
    expect(await done).toBe('cancelled');
    expect(t.exportProgress.value).toBeNull();
    expect(t.exportMilestone.value).toBe('');
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

  test('says a document nested too deeply to lay out in words, not the engine’s', async () => {
    const t = await load({ inPlace: true });
    shown.kind = 'markdown';
    shown.text = '# Deep\n\nText.\n';
    // Chromium's and WebKit's words for it, then Firefox's, then the parse's own refusal.
    for (const engine of [
      'Maximum call stack size exceeded',
      'too much recursion',
      'This document is nested too deeply to read: more than 48 levels.',
    ]) {
      render.mockRejectedValueOnce(new Error(engine));
      expect(await t.exportScript('pdf')).toBe('cancelled');
      expect(t.exportError.value).toBe(
        'Couldn’t export Deep.pdf: this document is nested too deeply to lay out.',
      );
      shown.text += '\nMore.\n';
    }
    // A RangeError of another kind says what it is, not that the document is deep.
    render.mockRejectedValueOnce(new RangeError('Invalid string length'));
    shown.text += '\nLonger.\n';
    expect(await t.exportScript('pdf')).toBe('cancelled');
    expect(t.exportError.value).toBe('Couldn’t export Deep.pdf: Invalid string length');
    // An error with no words of its own is a plain sentence.
    render.mockRejectedValueOnce(new Error(''));
    shown.text += '\nLast.\n';
    expect(await t.exportScript('pdf')).toBe('cancelled');
    expect(t.exportError.value).toBe('Couldn’t export Deep.pdf.');
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

  test('sends the open script’s options with its text', async () => {
    const t = await load({ inPlace: true });
    shown.project = { exportOptions: { sceneNumbers: 'written', titlePage: 'title-author' } };
    expect(await t.exportScript('pdf')).toBe('saved');
    expect(render).toHaveBeenCalledWith(
      {
        kind: 'pdf',
        source: TEXT,
        template: builtins['us-screenplay'],
        options: { sceneNumbers: 'written', titlePage: 'title-author', notes: 'leave-out' },
      },
      expect.any(Function),
    );
    // The toast names what isn't the default, so a choice made long ago is no surprise.
    expect(t.exportNotice.value).toBe(
      'Exported The Call Part 1.pdf, with scene numbers as written and the title and author only.',
    );
    // A Final Draft file keeps its written numbers whatever the choice: its toast names the title page only.
    expect(await t.exportScript('fdx')).toBe('saved');
    expect(render).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'fdx',
        options: { sceneNumbers: 'written', titlePage: 'title-author', notes: 'leave-out' },
      }),
      expect.any(Function),
    );
    expect(t.exportNotice.value).toBe(
      'Exported The Call Part 1.fdx, with the title and author only.',
    );
    // An option it doesn't know is read as the default.
    shown.project = { exportOptions: { sceneNumbers: 'roman', titlePage: 'none' } };
    expect(await t.exportScript('txt')).toBe('saved');
    expect(render).toHaveBeenLastCalledWith(
      expect.objectContaining({
        options: { sceneNumbers: 'none', titlePage: 'none', notes: 'leave-out' },
      }),
      expect.any(Function),
    );
    expect(t.exportNotice.value).toBe('Exported The Call Part 1.txt, with no title page.');
  });

  test('gives the same script’s export with other options its own export', async () => {
    const t = await load({ inPlace: true });
    shown.project = { exportOptions: { titlePage: 'full' } };
    let release: (() => void) | undefined;
    render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(new Uint8Array([1]));
        }),
    );
    const full = t.exportScript('pdf');
    expect(t.exportScript('pdf')).toBe(full);
    await vi.waitFor(() => expect(release).toBeDefined());
    // The options change (in the dialog) while the first is under way: not joined to it.
    shown.project = { exportOptions: { titlePage: 'none' } };
    const none = t.exportScript('pdf');
    expect(none).not.toBe(full);
    release?.();
    await full;
    await none;
    expect(
      render.mock.calls.map(([request]) => (request as { options: { titlePage: string } }).options),
    ).toEqual([
      { sceneNumbers: 'none', titlePage: 'full', notes: 'leave-out' },
      { sceneNumbers: 'none', titlePage: 'none', notes: 'leave-out' },
    ]);
  });

  test('a screenplay and a stage play export as md', async () => {
    const STAGE = 'Title: The Lamp\n\n# ACT ONE\n\n## SCENE 1\n\nThe keeper waits.\n';
    for (const [text, name] of [
      [TEXT, 'The Call Part 1.md'],
      [STAGE, 'The Lamp.md'],
    ] as const) {
      for (const inPlace of [true, false]) {
        const t = await load({ inPlace });
        shown.text = text;
        render.mockResolvedValue('# Markdown\n');
        expect(await t.exportScript('md')).toBe('saved');
        // Rendered in the worker, with the script's template and options, as the PDF is.
        expect(render).toHaveBeenCalledWith(
          {
            kind: 'md',
            source: text,
            template: builtins['us-screenplay'],
            options: { sceneNumbers: 'none', titlePage: 'full', notes: 'leave-out' },
          },
          expect.any(Function),
        );
        expect(t.log).toEqual(
          inPlace ? [`pick ${name} markdown`, 'write'] : [`download ${name} text/markdown`],
        );
        expect(t.written[0]?.data).toBe('# Markdown\n');
        expect(t.exportNotice.value).toBe(`Exported ${name}.`);
      }
    }
  });

  test('a Markdown document’s md export is still its own text', async () => {
    const t = await load({ inPlace: true });
    shown.text = '# The Treatment\n\nWords [[not a note]].\n';
    shown.kind = 'markdown';
    // Its export options, if any were kept, change nothing: the file is the text.
    shown.project = { exportOptions: { notes: 'include', sceneNumbers: 'all' } };
    expect(await t.exportScript('md')).toBe('saved');
    expect(render).not.toHaveBeenCalled();
    expect(t.written[0]?.data).toBe(shown.text);
    expect(t.exportNotice.value).toBe('Exported The Treatment.md.');
  });

  test('the toast names the Markdown export’s options', async () => {
    const t = await load({ inPlace: true });
    shown.project = { exportOptions: { sceneNumbers: 'all', titlePage: 'none' } };
    expect(await t.exportScript('md')).toBe('saved');
    expect(t.exportNotice.value).toBe(
      'Exported The Call Part 1.md, with every scene numbered and no title page.',
    );
    shown.project = {
      exportOptions: { sceneNumbers: 'all', titlePage: 'none', notes: 'include' },
    };
    expect(await t.exportScript('md')).toBe('saved');
    expect(render).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'md',
        options: { sceneNumbers: 'all', titlePage: 'none', notes: 'include' },
      }),
      expect.any(Function),
    );
    expect(t.exportNotice.value).toBe(
      'Exported The Call Part 1.md, with every scene numbered, no title page, and notes.',
    );
    // Only a Markdown export carries notes: the PDF's, the text's, and Final Draft's toasts never say so.
    shown.project = { exportOptions: { notes: 'include' } };
    expect(await t.exportScript('md')).toBe('saved');
    expect(t.exportNotice.value).toBe('Exported The Call Part 1.md, with notes.');
    for (const kind of ['pdf', 'txt', 'fdx'] as const) {
      expect(await t.exportScript(kind)).toBe('saved');
      expect(t.exportNotice.value).toBe(`Exported The Call Part 1.${kind}.`);
    }
  });

  test('the same export asked twice is joined, and one with other notes is its own', async () => {
    const t = await load({ inPlace: true });
    shown.project = { exportOptions: { notes: 'leave-out' } };
    let release: (() => void) | undefined;
    render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve('# One\n');
        }),
    );
    const first = t.exportScript('md');
    expect(t.exportScript('md')).toBe(first);
    await vi.waitFor(() => expect(release).toBeDefined());
    // Notes in Markdown changes while the first is under way: not joined to it.
    shown.project = { exportOptions: { notes: 'include' } };
    const second = t.exportScript('md');
    expect(second).not.toBe(first);
    expect(t.exportScript('md')).toBe(second);
    release?.();
    expect(await first).toBe('saved');
    expect(await second).toBe('saved');
    expect(
      render.mock.calls.map(
        ([request]) => (request as { options: { notes: string } }).options.notes,
      ),
    ).toEqual(['leave-out', 'include']);
  });

  test('joins an export already under way', async () => {
    const t = await load({ inPlace: true });
    const first = t.exportScript('pdf');
    const second = t.exportScript('pdf');
    expect(await first).toBe('saved');
    expect(await second).toBe('saved');
    expect(render).toHaveBeenCalledTimes(1);
  });

  test('gives another script’s PDF its own export, after the one under way', async () => {
    const t = await load({ inPlace: true });
    shown.project = { fileName: 'The Call.fountain' };
    let release: (() => void) | undefined;
    render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(new Uint8Array([1]));
        }),
    );
    const first = t.exportScript('pdf');
    await vi.waitFor(() => expect(release).toBeDefined());
    // Another script is opened, and exported as a PDF too, while the first is drawn.
    shown.text = OTHER;
    shown.project = { fileName: 'The Crossing.fountain' };
    const second = t.exportScript('pdf');
    expect(second).not.toBe(first);
    release?.();
    expect(await first).toBe('saved');
    expect(await second).toBe('saved');
    expect(render).toHaveBeenCalledTimes(2);
    expect(render.mock.calls.map(([request]) => (request as { source: string }).source)).toEqual([
      TEXT,
      OTHER,
    ]);
    expect(t.written.map((w) => w.name)).toEqual(['The Call Part 1.pdf', 'The Crossing.pdf']);
  });

  test('gives a Markdown PDF on other paper its own export', async () => {
    const t = await load({ inPlace: true });
    shown.kind = 'markdown';
    shown.text = '# Notes\n\nWords.\n';
    const letter = t.exportScript('pdf');
    expect(t.exportScript('pdf')).toBe(letter);
    preferences.markdownPaper = 'a4';
    const a4 = t.exportScript('pdf');
    expect(a4).not.toBe(letter);
    await letter;
    await a4;
    expect(render.mock.calls.map(([request]) => (request as { paper: string }).paper)).toEqual([
      'letter',
      'a4',
    ]);
  });

  for (const kind of ['pdf', 'txt', 'fdx'] as const) {
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
    shown.project = { exportOptions: { sceneNumbers: 'all' } };
    busy.value = false;
    expect(await done).toBe('saved');
    expect(t.log[0]).toBe('pick The Crossing.txt txt');
    // The options are the exported script's, read with its text.
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        source: OTHER,
        options: { sceneNumbers: 'all', titlePage: 'full', notes: 'leave-out' },
      }),
      expect.any(Function),
    );
    expect(t.exportNotice.value).toBe('Exported The Crossing.txt, with every scene numbered.');
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
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ source: TEXT }),
      expect.any(Function),
    );
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
