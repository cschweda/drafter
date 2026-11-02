// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EditorState as State } from '@codemirror/state';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { STORY_MAP_FONT_FILES, type StoryMapFace, type StoryMapFonts } from '@drafter/story-map';
import { builtins } from '@drafter/templates';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import sampleScreenplay from '#samples/screenplay.fountain?raw';
import { countScript } from '../app/stats/count';
import type { FileAccess, FileRef } from '../app/storage/files';
import type { ExportRequest } from '../app/workers/export-compute';

// A path, not a URL: jsdom's URL isn't one `readFile` takes.
const FONTS = join(import.meta.dirname, '../../../packages/story-map/fonts/');
async function storyMapFonts(): Promise<StoryMapFonts> {
  const faces = Object.keys(STORY_MAP_FONT_FILES) as StoryMapFace[];
  const loaded = await Promise.all(
    faces.map(async (face) => [
      face,
      new Uint8Array(await readFile(join(FONTS, STORY_MAP_FONT_FILES[face]))),
    ]),
  );
  return Object.fromEntries(loaded) as StoryMapFonts;
}

const SCRIPT = [
  'Title: Salt Road',
  'Author: Ines Varga',
  'Contact: ines@example.com',
  '',
  '# Act One',
  '',
  'EXT. SALT FLATS - DAY',
  '',
  'PELL walks the white ground.',
  '',
  'PELL',
  'Every road out of here ends at the water.',
  '',
  'INT. TRUCK CAB - NIGHT',
  '',
  'ROOK drives.',
  '',
  'ROOK',
  'Then we find a road that does not.',
  '',
  'PELL',
  'There is no such road anywhere on the map.',
  '',
].join('\n');

// The editor: a CodeMirror state that dispatches, as the app's does.
const held = vi.hoisted(() => ({
  text: '',
  readOnly: false,
  project: null as null | Record<string, unknown>,
  kept: [] as Array<Record<string, unknown>>,
  requests: [] as unknown[],
  undo: 0,
}));
vi.mock('../app/editor/session', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { shallowRef } = await import('vue');
  const { parse } = await import('@drafter/fountain');
  const { builtins } = await import('@drafter/templates');
  let state = EditorState.create({ doc: '' });
  const doc = shallowRef(parse(''));
  const view = {
    get state() {
      // A read-only tab's editor is read-only too.
      return new Proxy(state, {
        get: (target, key) => (key === 'readOnly' ? held.readOnly : Reflect.get(target, key)),
      });
    },
    dispatch(spec: Parameters<State['update']>[0]) {
      state = state.update(spec).state;
      held.undo++;
      held.text = state.doc.toString();
      doc.value = parse(held.text);
    },
    focus() {},
  };
  return {
    useEditor: () => ({
      view,
      doc,
      template: shallowRef(builtins['us-screenplay']),
      kind: shallowRef('fountain'),
      reset(text: string) {
        state = EditorState.create({ doc: text });
        held.text = text;
        doc.value = parse(text);
      },
    }),
  };
});
vi.mock('../app/storage/script', async () => {
  const { ref } = await import('vue');
  return {
    useScript: () => ({
      busy: ref(false),
      project: {
        get value() {
          return held.project;
        },
      },
      async keepOnProject(change: (p: Record<string, unknown>) => Record<string, unknown>) {
        if (!held.project || held.readOnly) return;
        const fields = change(held.project);
        held.kept.push(fields);
        held.project = { ...held.project, ...fields };
      },
    }),
  };
});
vi.mock('../app/storage/guard', () => ({
  useGuard: () => ({
    readOnly: {
      get value() {
        return held.readOnly;
      },
    },
  }),
}));
vi.mock('../app/settings/settings', () => ({
  useSettings: () => ({ settings: { value: { markdownPaper: 'letter', spellLanguage: 'en-US' } } }),
}));
const drafts = vi.hoisted(() => ({ current: 1, rows: [] as Array<{ n: number; id: string }> }));
vi.mock('../app/drafts/use-drafts', () => ({
  useDrafts: () => ({
    current: {
      get value() {
        return drafts.current;
      },
    },
    rows: {
      get value() {
        return drafts.rows;
      },
    },
  }),
}));
// The worker, run here: the real exporter, with the story map's fonts from the package.
vi.mock('../app/storage/export-client', async () => {
  const { createExporter } = await import('../app/workers/export-compute');
  let exporter: ReturnType<typeof createExporter> | undefined;
  return {
    renderExport: async (request: ExportRequest) => {
      held.requests.push(request);
      exporter ??= createExporter(undefined, undefined, storyMapFonts);
      const reply = await exporter(request);
      if ('error' in reply) throw new Error(reply.error);
      return { data: reply.data, missing: [] };
    },
  };
});

function recorder() {
  const written: { name: string; data: string | Uint8Array; type?: string }[] = [];
  const access: FileAccess = {
    canSaveInPlace: false,
    pickToOpen: async () => null,
    fromDrop: async () => null,
    pickToSave: async (name) => ({ name }) as FileRef,
    read: async () => ({ bytes: new Uint8Array(), lastModified: 0 }),
    write: async () => {},
    permission: async () => 'granted',
    sameFile: async () => false,
    download(name, data, type) {
      written.push({ name, data, type });
    },
  };
  return { access, written };
}

const NO_CHANGES = { logline: null, plannedPages: null, hooks: {}, quotes: [] };

async function load(text: string) {
  vi.resetModules();
  vi.stubGlobal('crypto', webcrypto);
  held.readOnly = false;
  held.project = { id: 'p1', updatedAt: Date.UTC(2026, 9, 30), savedAt: Date.UTC(2026, 9, 31) };
  held.kept = [];
  held.requests = [];
  held.undo = 0;
  drafts.current = 1;
  drafts.rows = [];
  const { useEditor } = await import('../app/editor/session');
  (useEditor() as unknown as { reset(t: string): void }).reset(text);
  const files = await import('../app/storage/files');
  const mine = recorder();
  files.setFiles(mine.access);
  const flow = await import('../app/story-map/flow');
  const options = await import('../app/story-map/options');
  const page = { ...options.STORY_MAP_DEFAULTS };
  return { ...mine, ...flow, page };
}

/** The story-map requests the worker was sent. */
const mapRequests = () =>
  held.requests.filter((r) => (r as { kind: string }).kind === 'story-map') as Array<
    Extract<ExportRequest, { kind: 'story-map' }>
  >;

describe('making a story map', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  test('Make writes the logline, quote marks, and metadata as one undo, then exports', async () => {
    const t = await load(SCRIPT);
    const doc = parse(SCRIPT);
    const rook = doc.blocks.findIndex((b) => b.kind === 'character' && b.sem.name === 'ROOK');
    expect(
      await t.makeStoryMap(
        {
          logline: 'Two drivers look for a road that does not end at the sea.',
          plannedPages: 90,
          hooks: { PELL: 'a walker who maps salt' },
          quotes: [{ cue: rook, use: 'quote' }],
        },
        t.page,
      ),
    ).toBe('saved');
    expect(held.undo).toBe(1);
    expect(held.text).toContain(
      'Contact: ines@example.com\nLogline: Two drivers look for a road that does not end at the sea.\n\n# Act One',
    );
    expect(held.text).toContain('Then we find a road that does not. [[Quote]]');
    expect(parse(held.text).meta).toEqual({
      v: 1,
      storyMap: { plannedPages: 90, hooks: { PELL: 'a walker who maps salt' } },
    });
    // Then the file, with what was written.
    expect(t.written).toHaveLength(1);
    const html = t.written[0]?.data as string;
    expect(html.toLowerCase().startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Two drivers look for a road that does not end at the sea.');
    expect(html).toContain('a walker who maps salt');
    expect(html).toContain('Then we find a road that does not.');
    expect(t.written[0]?.type).toBe('text/html');
    // And the page's choices kept on the project.
    expect(held.kept).toHaveLength(1);
  });

  test('nothing changed, nothing written', async () => {
    const t = await load(SCRIPT);
    const r = await t.makeStoryMap(NO_CHANGES, t.page);
    const { exportError } = await import('../app/storage/export');
    expect(exportError.value).toBe('');
    expect(r).toBe('saved');
    expect(held.undo).toBe(0);
    expect(held.text).toBe(SCRIPT);
    expect(t.written).toHaveLength(1);
  });

  test('a hook set back to what was found leaves the metadata as it was', async () => {
    const t = await load(SCRIPT);
    expect(await t.makeStoryMap({ ...NO_CHANGES, hooks: { PELL: null } }, t.page)).toBe('saved');
    expect(held.undo).toBe(0);
  });

  test('the file is named "<title> – story map.html"', async () => {
    const t = await load(SCRIPT);
    await t.makeStoryMap(NO_CHANGES, t.page);
    expect(t.written[0]?.name).toBe('Salt Road – story map.html');
  });

  test('the request never carries the script', async () => {
    const t = await load(SCRIPT);
    // Not even with "Let Drafter reopen this file" on (Call 20).
    held.project = { ...held.project, exportOptions: { reopenable: true } };
    await t.makeStoryMap(NO_CHANGES, { ...t.page, include: { ...t.page.include, contact: true } });
    const [request] = mapRequests();
    expect(request).toBeDefined();
    expect(request).not.toHaveProperty('embed');
    expect(request?.options.include.contact).toBe(true);
    // The contact comes from the title page unless the writer typed another.
    expect(request?.options.contact).toBe('ines@example.com');
    const html = t.written[0]?.data as string;
    // No script in it, and the other title page lines aren't there either.
    expect(html).not.toContain('<script');
    expect(html).not.toContain('Every road out of here ends at the water.\nINT.');
    expect(html).not.toContain('PELL walks the white ground.\n');
    // Nothing Open could read back as the script.
    const { embeddedSource } = await import('@drafter/archive');
    expect(await embeddedSource(new TextEncoder().encode(html))).toBeNull();
  });

  test('a contact emptied in the dialog stays empty, not the title page’s', async () => {
    const t = await load(SCRIPT);
    await t.makeStoryMap(NO_CHANGES, {
      ...t.page,
      include: { ...t.page.include, contact: true },
      contact: '',
    });
    expect(mapRequests()[0]?.options.contact).toBeNull();
    expect(t.written[0]?.data as string).not.toContain('ines@example.com');
  });

  test('the draft number and ID come from Drafts', async () => {
    const t = await load(SCRIPT);
    await t.makeStoryMap(NO_CHANGES, t.page);
    const first = mapRequests()[0]?.options;
    expect(first?.draft.number).toBe(1);
    // With no frozen draft, the SHA-256 of the text.
    const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(SCRIPT));
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    expect(first?.draft.id).toBe(hex);
    expect(first?.updated).toBe(Date.UTC(2026, 9, 31));

    const u = await load(SCRIPT);
    drafts.current = 3;
    drafts.rows = [
      { n: 2, id: 'b'.repeat(64) },
      { n: 1, id: 'a'.repeat(64) },
    ];
    await u.makeStoryMap(NO_CHANGES, u.page);
    expect(mapRequests()[0]?.options.draft).toEqual({ number: 3, id: 'b'.repeat(64) });
  });

  test('a read-only tab writes nothing, makes the page, and says the choices were not kept', async () => {
    const t = await load(SCRIPT);
    held.readOnly = true;
    const { exportNotice } = await import('../app/storage/export');
    expect(await t.makeStoryMap({ ...NO_CHANGES, logline: 'Never written.' }, t.page)).toBe(
      'saved',
    );
    expect(held.text).toBe(SCRIPT);
    expect(held.kept).toEqual([]);
    expect(t.written).toHaveLength(1);
    expect(t.written[0]?.data as string).toContain('Never written.');
    expect(exportNotice.value).toMatch(/weren’t kept/);
  });

  test('the running time is the Stats tab’s', async () => {
    const t = await load(sampleScreenplay);
    await t.makeStoryMap(NO_CHANGES, t.page);
    const html = t.written[0]?.data as string;
    const template = builtins['us-screenplay'];
    const doc = parse(sampleScreenplay);
    const layout = paginate(doc, template);
    const minutes = Math.round(countScript(doc, layout, template).pages * 1);
    const { buildStoryMap } = await import('@drafter/story-map');
    const request = mapRequests()[0];
    const map = buildStoryMap({
      doc,
      template,
      layout,
      options: request?.options as Parameters<typeof buildStoryMap>[0]['options'],
    });
    expect(Math.abs(map.facts.minutes - minutes)).toBeLessThanOrEqual(1);
    expect(html).toContain('<title>');
  });
});

describe('the picks for the dialog', () => {
  test('lists the lines the page would use, each with the next in its scene, and the hooks', async () => {
    vi.resetModules();
    const { createExporter } = await import('../app/workers/export-compute');
    const { STORY_MAP_DEFAULTS } = await import('../app/story-map/options');
    const exporter = createExporter(undefined, undefined, storyMapFonts);
    const reply = await exporter({
      kind: 'story-map-picks',
      source: SCRIPT,
      template: builtins['us-screenplay'],
      options: {
        ...STORY_MAP_DEFAULTS,
        plannedPages: null,
        logline: null,
        hooks: {},
        rates: { minutesPerPage: 1, wordsPerMinute: 150 },
        draft: { number: 1, id: 'a'.repeat(64) },
        updated: null,
        title: 'Salt Road',
      },
    });
    if (!('data' in reply)) throw new Error('no picks');
    const picks = JSON.parse(reply.data as string);
    expect(picks.gapsFound).toBe(false);
    expect(picks.quotes.length).toBeGreaterThan(0);
    for (const quote of picks.quotes) {
      expect(typeof quote.text).toBe('string');
      expect(typeof quote.speaker).toBe('string');
      expect(quote.choices.map((c: { cue: number }) => c.cue)).toContain(quote.cue);
    }
    expect(picks.hooks.map((h: { key: string }) => h.key)).toEqual(
      expect.arrayContaining(['PELL', 'ROOK']),
    );
  });
});
