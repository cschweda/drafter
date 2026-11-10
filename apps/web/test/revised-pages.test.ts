import { readFile } from 'node:fs/promises';
import type { TextChange } from '@drafter/fountain';
import { lock, setHeader } from '@drafter/production';
import { FONT_FILES, type FontSet } from '@drafter/render-pdf';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { extract } from '../../../packages/render-pdf/test/helpers';
import type { When } from '../app/commands/behavior';
import { exportBehaviors } from '../app/commands/export-commands';
import {
  type RevisedInfo,
  revisedDefaults,
  revisedHeaderChoice,
  revisedPagesOpen,
  revisedRefusal,
} from '../app/production/revised';
import {
  createExporter,
  type ExportOptions,
  type ExportReply,
} from '../app/workers/export-compute';

// The revised-pages PDF (production design §8): only the pages with marks, as they print in the
// full PDF, with the revision header; the dialog's defaults; the command, for a locked script.

const template = builtins['us-screenplay'] as Template;
const HEADER = 'Blue Revision — 9 November 2026';

const FOLDER = new URL('../../../packages/render-pdf/fonts/', import.meta.url);
async function realFonts(): Promise<FontSet> {
  const bytes = async (style: keyof FontSet) =>
    new Uint8Array(await readFile(new URL(FONT_FILES[style], FOLDER)));
  return {
    regular: await bytes('regular'),
    bold: await bytes('bold'),
    italic: await bytes('italic'),
    boldItalic: await bytes('boldItalic'),
  };
}

function apply(text: string, changes: readonly TextChange[]): string {
  let out = text;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}

const paragraphs = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `Line ${from + i} of the hall.\n`).join('\n');
const UNLOCKED = `Title: The Hall\nAuthor: Wren Okafor\n\nINT. HALL - DAY\n\n${paragraphs(1, 120)}`;

async function locked(): Promise<string> {
  return apply(
    UNLOCKED,
    await lock(UNLOCKED, template, { today: '2026-11-09', draftId: 'd1', firstScene: 1 }),
  );
}

/** Locked, then 15 new paragraphs on page 2: its end goes to 2A. */
async function lockedEdited(): Promise<string> {
  const text = await locked();
  const at = text.indexOf('Line 40 of');
  return `${text.slice(0, at)}${paragraphs(1000, 15)}\n${text.slice(at)}`;
}

const bytesOf = (reply: ExportReply): Uint8Array => {
  if (!('data' in reply) || typeof reply.data === 'string') throw new Error(JSON.stringify(reply));
  return reply.data;
};
const infoOf = (reply: ExportReply): RevisedInfo => {
  if (!('data' in reply) || typeof reply.data !== 'string') throw new Error(JSON.stringify(reply));
  return JSON.parse(reply.data) as RevisedInfo;
};

const OPTIONS: ExportOptions = { sceneNumbers: 'none', titlePage: 'full', notes: 'leave-out' };
const REVISED = {
  kind: 'revised-pdf',
  template,
  options: OPTIONS,
  which: { kind: 'current' },
  marks: 'open',
  header: HEADER,
  tint: false,
} as const;

describe('the revised-pages PDF', () => {
  test('prints only the marked pages, with their labels and the header', async () => {
    const source = await lockedEdited();
    const pages = await extract(bytesOf(await createExporter(realFonts)({ ...REVISED, source })));
    const all = pages.map((p) => p.items.map((i) => i.str));
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.length).toBeLessThan(5);
    // No title page, and every page carries an asterisk and the header.
    expect(all.flat().join(' ')).not.toContain('Wren Okafor');
    for (const page of all) {
      expect(page).toContain('*');
      expect(page).toContain(HEADER);
    }
    expect(all.flat()).toContain('2A.');
  });

  test('a page range prints those pages, marked or not', async () => {
    const source = await lockedEdited();
    const reply = await createExporter(realFonts)({
      ...REVISED,
      source,
      which: { kind: 'range', from: '3', to: '4' },
    });
    const all = (await extract(bytesOf(reply))).map((p) => p.items.map((i) => i.str));
    expect(all).toHaveLength(2);
    expect(all[0]).toContain('3.');
    expect(all[1]).toContain('4.');
  });

  test('refuses an empty export with the set’s message, and no file', async () => {
    const reply = await createExporter(realFonts)({ ...REVISED, source: await locked() });
    expect(reply).toEqual({ error: 'There are no Blue changes to print.', refused: true });
    const all = await createExporter(realFonts)({
      ...REVISED,
      source: await locked(),
      which: { kind: 'all' },
    });
    expect(all).toEqual({ error: 'There are no revised pages to print.', refused: true });
  });

  test('refuses an unlocked script', async () => {
    const reply = await createExporter(realFonts)({ ...REVISED, source: UNLOCKED });
    expect(reply).toMatchObject({ refused: true });
  });

  test('a production’s own header prints in the full PDF too', async () => {
    const edited = await lockedEdited();
    const source = apply(edited, await setHeader(edited, 'Blue Pages — Shooting Draft'));
    const reply = await createExporter(realFonts)({
      kind: 'pdf',
      source,
      template,
      options: OPTIONS,
    });
    const all = (await extract(bytesOf(reply))).map((p) => p.items.map((i) => i.str));
    for (const page of all.slice(1)) expect(page).toContain('Blue Pages — Shooting Draft');
    expect(all.flat()).not.toContain(HEADER);
  });
});

describe('a production’s own header in the HTML file', () => {
  test('is escaped', async () => {
    const edited = await lockedEdited();
    const source = apply(edited, await setHeader(edited, '<img src=x onerror=alert(1)>'));
    const reply = await createExporter(realFonts)({
      kind: 'html',
      source,
      template,
      options: OPTIONS,
      title: 'The Hall',
      lang: 'en',
      generator: 'Drafter',
      minutesPerPage: 1,
    });
    if (!('data' in reply) || typeof reply.data !== 'string')
      throw new Error(JSON.stringify(reply));
    expect(reply.data).not.toContain('<img');
    expect(reply.data).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('the dialog', () => {
  test('its info: the body pages’ labels, the open set, and the header’s default', async () => {
    const info = infoOf(
      await createExporter(realFonts)({
        kind: 'revised-info',
        source: await lockedEdited(),
        template,
        options: OPTIONS,
      }),
    );
    expect(info.open).toBe('Blue');
    expect(info.labels[0]).toBe('1');
    expect(info.labels).toContain('2A');
    expect(info.defaultHeader).toBe(HEADER);
    expect(info.header).toBeNull();
    expect(info.current).toBe(true);
    expect(info.any).toBe(true);
  });

  test('the dialog’s header default: the production’s own, else the set’s', () => {
    const info: RevisedInfo = {
      open: 'Blue',
      labels: ['1', '2', '2A', '3'],
      defaultHeader: HEADER,
      header: null,
      current: true,
      any: true,
    };
    expect(revisedDefaults(info)).toEqual({ header: HEADER, from: '1', to: '3' });
    expect(revisedDefaults({ ...info, header: 'Blue Pages' }).header).toBe('Blue Pages');
  });

  test('a changed header is kept; the default or a blank removes the production’s own', () => {
    const info: RevisedInfo = {
      open: 'Blue',
      labels: ['1'],
      defaultHeader: HEADER,
      header: null,
      current: true,
      any: true,
    };
    expect(revisedHeaderChoice(HEADER, info)).toEqual({ header: HEADER, save: undefined });
    expect(revisedHeaderChoice('  Blue Pages ', info)).toEqual({
      header: 'Blue Pages',
      save: 'Blue Pages',
    });
    const own = { ...info, header: 'Blue Pages' };
    expect(revisedHeaderChoice('Blue Pages', own)).toEqual({
      header: 'Blue Pages',
      save: undefined,
    });
    expect(revisedHeaderChoice('', own)).toEqual({ header: HEADER, save: null });
    expect(revisedHeaderChoice(HEADER, own)).toEqual({ header: HEADER, save: null });
  });

  test('says what is empty before any picker', () => {
    const info: RevisedInfo = {
      open: 'Blue',
      labels: ['1', '2'],
      defaultHeader: HEADER,
      header: null,
      current: false,
      any: false,
    };
    expect(revisedRefusal(info, { kind: 'current' })).toBe('There are no Blue changes to print.');
    expect(revisedRefusal(info, { kind: 'all' })).toBe('There are no revised pages to print.');
    expect(revisedRefusal(info, { kind: 'range', from: '1', to: '2' })).toBeNull();
    expect(revisedRefusal(info, { kind: 'range', from: '1', to: '9' })).toBe(
      'There are no revised pages to print.',
    );
    expect(revisedRefusal({ ...info, current: true, any: true }, { kind: 'current' })).toBeNull();
  });
});

function when(fountain: boolean, locked: boolean): When {
  return {
    hasScript: () => true,
    idle: () => true,
    canStart: () => true,
    isFountain: () => fountain,
    isMarkdown: () => !fountain,
    isNovel: () => false,
    isLocked: () => locked,
    exportsHere: () => true,
  };
}

describe('Export revised pages (PDF)…', () => {
  test('the command is off unless locked', () => {
    const id = 'export-revised-pages';
    expect(exportBehaviors(when(true, true))[id]?.enabled?.()).toBe(true);
    expect(exportBehaviors(when(true, false))[id]?.enabled?.()).toBe(false);
    expect(exportBehaviors(when(false, true))[id]?.enabled?.()).toBe(false);
  });

  test('opens its dialog', () => {
    revisedPagesOpen.value = false;
    exportBehaviors(when(true, true))['export-revised-pages']?.run();
    expect(revisedPagesOpen.value).toBe(true);
    revisedPagesOpen.value = false;
  });
});
