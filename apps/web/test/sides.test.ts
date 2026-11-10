import { readFile } from 'node:fs/promises';
import { FONT_FILES, type FontSet } from '@drafter/render-pdf';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { extract } from '../../../packages/render-pdf/test/helpers';
import type { When } from '../app/commands/behavior';
import { exportBehaviors } from '../app/commands/export-commands';
import {
  type SidesChoices,
  scenesOfCharacters,
  sidesChoice,
  sidesOpen,
} from '../app/production/sides';
import { createExporter, type ExportReply } from '../app/workers/export-compute';

// Sides (production design §10): the worker's lists and PDF, and the dialog's choices.

const template = builtins['us-screenplay'] as Template;
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

const filler = (n: number, word: string) =>
  Array.from({ length: n }, (_, i) => `${word} paragraph ${i + 1} of the scene.`).join('\n\n');
const SOURCE = [
  'Title: The Hall',
  '',
  'INT. HALL - DAY',
  '',
  'MARGARET',
  'Hello there.',
  '',
  'INT. KITCHEN - DAY',
  '',
  filler(14, 'Kitchen'),
  '',
  'INT. ATTIC - NIGHT',
  '',
  'MARGARET',
  'Is anyone up here?',
  '',
  'EXT. YARD - NIGHT',
  '',
  filler(10, 'Yard'),
  '',
].join('\n');

const text = (reply: ExportReply, kind: 'string' | 'bytes') => {
  if (!('data' in reply)) throw new Error(JSON.stringify(reply));
  if (kind === 'string' && typeof reply.data === 'string') return reply.data;
  if (kind === 'bytes' && typeof reply.data !== 'string') return reply.data;
  throw new Error('wrong data');
};

describe('the sides worker', () => {
  test('sides-info lists the characters with their scenes, and the scenes', async () => {
    const reply = await createExporter(realFonts)({ kind: 'sides-info', source: SOURCE, template });
    const info = JSON.parse(text(reply, 'string') as string) as SidesChoices;
    expect(info.characters.find((c) => c.name === 'MARGARET')?.scenes).toEqual([1, 3]);
    expect(info.scenes.map((s) => s.label)).toEqual(['1', '2', '3', '4']);
  });

  test('sides-pdf prints the header and the ticked scenes, in script order', async () => {
    const reply = await createExporter(realFonts)({
      kind: 'sides-pdf',
      source: SOURCE,
      template,
      names: ['Margaret'],
      scenes: [1, 3],
      today: '2026-11-12',
    });
    const pages = await extract(text(reply, 'bytes') as Uint8Array);
    const all = pages.flatMap((p) => p.items.map((i) => i.str)).join(' ');
    expect(all).toContain('SIDES — MARGARET — Scenes 1, 3 — 12 November 2026');
    expect(all).toContain('Hello there.');
    expect(all).toContain('Is anyone up here?');
  });

  test('sides-pdf with nothing ticked is refused, with no file', async () => {
    const reply = await createExporter(realFonts)({
      kind: 'sides-pdf',
      source: SOURCE,
      template,
      names: [],
      scenes: [],
      today: '2026-11-12',
    });
    expect(reply).toMatchObject({ refused: true });
  });

  test('sides-pdf ignores a scene that is not in the script', async () => {
    const reply = await createExporter(realFonts)({
      kind: 'sides-pdf',
      source: SOURCE,
      template,
      names: ['Margaret'],
      scenes: [99],
      today: '2026-11-12',
    });
    expect(reply).toMatchObject({ refused: true });
  });
});

const INFO: SidesChoices = {
  characters: [
    { key: 'MARGARET', name: 'MARGARET', scenes: [1, 3] },
    { key: 'JON', name: 'JON', scenes: [2, 3] },
  ],
  scenes: [1, 2, 3, 4].map((n) => ({ ordinal: n, label: String(n), heading: `INT. R${n} - DAY` })),
};

describe('the sides dialog’s choices', () => {
  test('choosing a character ticks their scenes; several are joined, each once, in order', () => {
    expect(scenesOfCharacters(INFO, ['MARGARET'])).toEqual([1, 3]);
    expect(scenesOfCharacters(INFO, ['JON', 'MARGARET'])).toEqual([1, 2, 3]);
    expect(scenesOfCharacters(INFO, [])).toEqual([]);
  });

  test('the list stays editable: the choice is whatever is ticked, in script order', () => {
    expect(sidesChoice(INFO, ['MARGARET'], new Set([4, 1]))).toEqual({
      names: ['MARGARET'],
      scenes: [1, 4],
    });
    expect(sidesChoice(INFO, ['JON', 'MARGARET'], new Set())).toEqual({
      names: ['MARGARET', 'JON'],
      scenes: [],
    });
  });
});

function when(fountain: boolean): When {
  return {
    hasScript: () => true,
    idle: () => true,
    canStart: () => true,
    isFountain: () => fountain,
    isMarkdown: () => !fountain,
    isNovel: () => false,
    isLocked: () => false,
    exportsHere: () => true,
  };
}

describe('Export sides (PDF)…', () => {
  test('is on for a Fountain script, locked or not, and off for Markdown', () => {
    const id = 'export-sides';
    expect(exportBehaviors(when(true))[id]?.enabled?.()).toBe(true);
    expect(exportBehaviors(when(false))[id]?.enabled?.()).toBe(false);
  });

  test('opens its dialog', () => {
    sidesOpen.value = false;
    exportBehaviors(when(true))['export-sides']?.run();
    expect(sidesOpen.value).toBe(true);
    sidesOpen.value = false;
  });
});
