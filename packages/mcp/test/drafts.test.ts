import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { draftFile, draftFileName } from '@drafter/history';
import { afterEach, describe, expect, it } from 'vitest';
import { __setBudgetForTests } from '../src/paging';
import { OUTSIDE } from '../src/paths';
import { NO_DRAFTS } from '../src/tools/history';
import { answerOf, type Connected, connect, refusalOf } from './connect';
import { DRAFT_NOTES, DRAFT_TEXTS, EPISODE_101, makeLibrary } from './library';
import { put, tempFolder } from './temp';

interface Drafts {
  drafts: Array<{
    draft: string;
    number: number;
    id: string;
    short_id: string;
    frozen: string;
    note: string;
    note_cut?: true;
    pages: number | null;
    scenes: number;
    words: number;
    matches: boolean;
  }>;
  unreadable: number;
  next?: string;
  restarted?: true;
}

let open: Connected | undefined;
afterEach(async () => {
  __setBudgetForTests(undefined);
  await open?.close();
  open = undefined;
});

const EP101 = `Scripts/Signal Hill/${EPISODE_101}`;
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

async function library() {
  const made = makeLibrary(tempFolder());
  open = await connect({ folders: [made.scripts] });
  return made;
}

const drafts = async (args: object) =>
  answerOf<Drafts>(await (open as Connected).call('list_drafts', args));

describe('list_drafts', () => {
  it('lists Drafts 01 to 03 with their notes and figures, never their text', async () => {
    await library();
    const result = await (open as Connected).call('list_drafts', { script: EP101 });
    const got = answerOf<Drafts>(result);
    expect(got.drafts.map((d) => d.draft)).toEqual(['Draft 01', 'Draft 02', 'Draft 03']);
    expect(got.drafts.map((d) => d.note)).toEqual([...DRAFT_NOTES]);
    expect(got.unreadable).toBe(0);
    expect(got.next).toBeUndefined();
    const first = got.drafts[0];
    expect(first).toEqual({
      draft: 'Draft 01',
      number: 1,
      id: sha256(DRAFT_TEXTS[0]),
      short_id: sha256(DRAFT_TEXTS[0]).slice(0, 7),
      frozen: '2026-10-01T09:00:00.000Z',
      note: 'First pass',
      pages: 1,
      scenes: 3,
      words: expect.any(Number),
      matches: true,
    });
    expect(first?.words).toBeGreaterThan(10);
    expect(got.drafts[2]?.scenes).toBe(3);
    // No draft's text, no Contact, nothing from the metadata block.
    const text = (result.content[0] as { text: string }).text;
    for (const never of [
      'shortwave',
      'static',
      'Grange',
      '555-0142',
      'us-screenplay',
      'Eli climbs',
    ])
      expect(text).not.toContain(never);
  });

  it('an edited draft says it no longer matches', async () => {
    await library();
    const got = await drafts({ script: EP101 });
    expect(got.drafts.map((d) => d.matches)).toEqual([true, false, true]);
    // Its ID is the one it was frozen with.
    expect(got.drafts[1]?.id).toBe(sha256(DRAFT_TEXTS[1]));
  });

  it('no drafts folder says how to get them', async () => {
    const made = await library();
    renameSync(
      join(made.scripts, 'Signal Hill', 'Signal Hill – 101 drafts'),
      join(made.scripts, 'Signal Hill', 'Elsewhere'),
    );
    const refusal = refusalOf(await (open as Connected).call('list_drafts', { script: EP101 }));
    expect(refusal.error).toBe(NO_DRAFTS);
  });

  it('a drafts folder that is a link out is refused', async () => {
    const dir = tempFolder();
    const scripts = join(dir, 'Scripts');
    const outside = join(dir, 'Private drafts');
    put(join(scripts, 'Pilot.fountain'), 'INT. HALL - DAY\n\nEmpty.\n');
    const text = 'INT. HALL - DAY\n\nFull.\n';
    put(
      join(outside, draftFileName('Pilot', 1, 'fountain')),
      draftFile(
        text,
        { draft: 1, id: sha256(text), frozen: '2026-10-01T09:00:00.000Z', note: '' },
        'fountain',
      ),
    );
    symlinkSync(outside, join(scripts, 'Pilot drafts'));
    open = await connect({ folders: [scripts] });
    const result = await open.call('list_drafts', { script: 'Scripts/Pilot.fountain' });
    const refusal = refusalOf(result);
    expect(refusal.error).toBe(OUTSIDE);
    const body = (result.content[0] as { text: string }).text;
    expect(body).not.toContain(dir);
    expect(body).not.toContain('Full.');
  });

  it('a draft file that can’t be read is counted, a copy from another computer listed, and other files ignored', async () => {
    const made = await library();
    const folder = join(made.scripts, 'Signal Hill', 'Signal Hill – 101 drafts');
    put(join(folder, 'Signal Hill – 101 – Draft 04.fountain'), 'No facts here.\n');
    const text = 'INT. HALL - DAY\n\nAnother computer.\n';
    put(
      join(folder, 'Signal Hill – 101 – Draft 03 (2).fountain'),
      draftFile(
        text,
        { draft: 3, id: sha256(text), frozen: '2026-10-09T09:00:00.000Z', note: 'Laptop' },
        'fountain',
      ),
    );
    put(join(folder, 'Signal Hill – 101 – Draft 05.md'), '# Not this work’s kind\n');
    mkdirSync(join(folder, 'Signal Hill – 101 – Draft 06.fountain'));
    const got = await drafts({ script: EP101 });
    expect(got.drafts.map((d) => [d.draft, d.note])).toEqual([
      ['Draft 01', 'First pass'],
      ['Draft 02', 'Cut the tower'],
      ['Draft 03', 'Envelope beat'],
      ['Draft 03', 'Laptop'],
    ]);
    expect(got.unreadable).toBe(2);
  });

  it('a long draft note is cut, and many drafts come a page at a time', async () => {
    const dir = tempFolder();
    const scripts = join(dir, 'Scripts');
    put(join(scripts, 'Pilot.fountain'), 'INT. HALL - DAY\n\nEmpty.\n');
    for (let n = 1; n <= 12; n++) {
      const text = `INT. HALL - DAY\n\nTake ${n}.\n`;
      put(
        join(scripts, 'Pilot drafts', draftFileName('Pilot', n, 'fountain')),
        draftFile(
          text,
          {
            draft: n,
            id: sha256(text),
            frozen: '2026-10-01T09:00:00.000Z',
            note: 'n'.repeat(n === 1 ? 900 : 10),
          },
          'fountain',
        ),
      );
    }
    open = await connect({ folders: [scripts] });
    expect((await drafts({ script: 'Scripts/Pilot.fountain' })).drafts[0]).toMatchObject({
      note_cut: true,
    });
    __setBudgetForTests(1_500);
    const seen: number[] = [];
    let cursor: string | undefined;
    do {
      const page = await drafts({
        script: 'Scripts/Pilot.fountain',
        ...(cursor ? { cursor } : {}),
      });
      expect(page.restarted).toBeUndefined();
      seen.push(...page.drafts.map((d) => d.number));
      cursor = page.next;
    } while (cursor);
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});
