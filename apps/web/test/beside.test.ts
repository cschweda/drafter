import 'fake-indexeddb/auto';
import { listZip } from '@drafter/archive';
import {
  type CutEntry,
  cutsFile,
  draftFile,
  readCutsFile,
  readDraftFile,
  type WorkKind,
} from '@drafter/history';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  type BesideFolder,
  besideNames,
  mergeCutsFile,
  syncBeside,
  writeDraft,
} from '../app/beside/beside';
import { openedDraft } from '../app/beside/draft-open';
import { exportDraftsAndCuts } from '../app/beside/export';
import { besideFailure } from '../app/beside/failure';
import { readCutsBytes, readDraftBytes } from '../app/beside/read';
import { listCuts, recordCuts } from '../app/cuts/store';
import { draftText, freezeDraft, listDrafts } from '../app/drafts/store';
import { db } from '../app/storage/db';
import { hashText } from '../app/storage/hash';
import { createProject } from '../app/storage/projects';

// Drafts and cuts beside the work (drafts-and-cuts design §4, plan Task 7): written once, never
// over a file, the cuts file grown by merging with what is on disk, a second computer's drafts
// and cuts read back, and the zip for where nothing can be written.

const NOW = new Date(Date.UTC(2026, 10, 1, 12, 0, 0)).getTime();
const ONE = 'INT. HALL - DAY\n\nMarra waits.\n';
const TWO = 'INT. HALL - DAY\n\nMarra waits, and waits.\n';
const NAMES = besideNames('Boca.fountain') as NonNullable<ReturnType<typeof besideNames>>;
const enc = (text: string) => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** A folder in memory, with every write counted. */
function memoryFolder() {
  const files = new Map<string, Uint8Array>();
  const writes: string[] = [];
  const folder: BesideFolder = {
    async read(rel) {
      return files.get(rel) ?? null;
    },
    async list(name) {
      return [...files.keys()]
        .filter((rel) => rel.startsWith(`${name}/`))
        .map((rel) => rel.slice(name.length + 1))
        .sort();
    },
    async create(rel, bytes) {
      if (files.has(rel)) return 'exists';
      files.set(rel, bytes);
      writes.push(rel);
      return 'written';
    },
    async replace(rel, bytes) {
      files.set(rel, bytes);
      writes.push(rel);
    },
  };
  return { folder, files, writes };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await Promise.all(db.tables.map((table) => table.clear()));
});
afterEach(() => {
  vi.useRealTimers();
});

const freeze = async (projectId: string, text: string, note = '') => {
  const out = await freezeDraft(projectId, text, note);
  if (out.result !== 'frozen') throw new Error(out.why);
  return out.row;
};

const sync = (
  projectId: string,
  folder: BesideFolder,
  more: Partial<{ readDrafts: boolean; cuts: boolean; where: string; kind: WorkKind }> = {},
) =>
  syncBeside(projectId, folder, NAMES, more.kind ?? 'fountain', more.where ?? 'here', {
    readDrafts: more.readDrafts ?? false,
    cuts: more.cuts ?? true,
    now: new Date(),
  });

async function cutEntry(text: string, title: string, at = NOW - 60_000): Promise<CutEntry> {
  return {
    id: await hashText(text),
    title,
    text,
    kind: 'fountain',
    cuts: [{ at: new Date(at).toISOString(), draft: 1 }],
    where: { after: 'INT. HALL - DAY', before: null },
  };
}

describe('the names', () => {
  test('are the work’s, cleaned as the desktop app cleans them', () => {
    expect(NAMES).toEqual({
      file: 'Boca.fountain',
      work: 'Boca',
      folder: 'Boca drafts',
      cuts: 'Boca.fountain.cuts.md',
    });
    expect(besideNames('a:b.md')).toMatchObject({ work: 'a_b', cuts: 'a_b.md.cuts.md' });
    expect(besideNames('...')).toBeNull();
  });
});

describe('writing beside the work', () => {
  test('a freeze writes its draft file once', async () => {
    const p = await createProject({ source: ONE });
    await freeze(p.id, ONE, 'first pass');
    const { folder, files, writes } = memoryFolder();
    expect((await sync(p.id, folder)).draftsWritten).toBe(1);
    expect((await sync(p.id, folder)).draftsWritten).toBe(0);
    expect(writes.filter((w) => w.startsWith('Boca drafts/'))).toEqual([
      'Boca drafts/Boca – Draft 01.fountain',
    ]);
    const read = readDraftFile(
      dec(files.get('Boca drafts/Boca – Draft 01.fountain') as Uint8Array),
      'fountain',
    );
    expect(read.text).toBe(ONE);
    expect(read.facts).toMatchObject({ draft: 1, id: await hashText(ONE), note: 'first pass' });
    // A move (Save As) writes it again in the new place.
    expect((await sync(p.id, folder, { where: 'there' })).draftsWritten).toBe(1);
  });

  test('the cuts file is merged with what is on disk before writing', async () => {
    const p = await createProject({ source: ONE });
    await recordCuts(
      p.id,
      'fountain',
      [
        {
          title: 'MINE',
          text: 'A speech cut here on this computer today.',
          where: { after: null, before: null },
        },
      ],
      1,
      NOW - 1000,
    );
    const theirs = await cutEntry('A speech cut on the other computer yesterday.', 'THEIRS');
    const { folder, files } = memoryFolder();
    files.set(NAMES.cuts, enc(cutsFile(NAMES.file, [theirs])));
    const out = await sync(p.id, folder);
    expect(out.cutsAdded).toBe(1);
    const titles = readCutsFile(dec(files.get(NAMES.cuts) as Uint8Array)).entries.map(
      (e) => e.title,
    );
    expect(titles.sort()).toEqual(['MINE', 'THEIRS']);
    // And the other computer's cut is in the list now.
    expect((await listCuts(p.id)).map((row) => row.title).sort()).toEqual(['MINE', 'THEIRS']);
  });

  test('a forged, foreign or future entry on disk changes nothing stored', async () => {
    const p = await createProject({ source: ONE });
    await recordCuts(
      p.id,
      'fountain',
      [
        {
          title: 'MINE',
          text: 'A speech cut here on this computer today.',
          where: { after: null, before: null },
        },
      ],
      1,
      NOW - 1000,
    );
    const [mine] = await listCuts(p.id);
    const forged = {
      ...(await cutEntry('Something else entirely, put in by hand.', 'FORGED')),
      id: mine?.id as string,
      title: 'FORGED',
    };
    const foreign = {
      ...(await cutEntry('# A heading\n\nA Markdown cut.', 'MD')),
      kind: 'markdown' as const,
    };
    const future = await cutEntry(
      'From a clock far ahead of this one.',
      'FUTURE',
      NOW + 30 * 86_400_000,
    );
    const { folder, files } = memoryFolder();
    files.set(NAMES.cuts, enc(cutsFile(NAMES.file, [forged, foreign, future])));
    const out = await sync(p.id, folder);
    expect(out.skipped).toBe(2);
    const rows = await listCuts(p.id);
    expect(rows.map((r) => r.title)).toEqual(['MINE']);
    expect(rows[0]?.text).toBe('A speech cut here on this computer today.');
  });

  test('a damaged cut only another computer had is still in the file after a sync', async () => {
    const p = await createProject({ source: ONE });
    await recordCuts(
      p.id,
      'fountain',
      [
        {
          title: 'MINE',
          text: 'A speech cut here on this computer today.',
          where: { after: null, before: null },
        },
      ],
      1,
      NOW - 1000,
    );
    const theirs = await cutEntry('A speech cut on the other computer yesterday.', 'THEIRS');
    const good = await cutEntry('Another speech the other computer cut, intact.', 'GOOD');
    // One character changed inside the damaged cut's comment: its ID no longer checks out.
    const file = cutsFile(NAMES.file, [theirs, good]);
    const damaged = file.replace(
      '"text":"A speech cut on the other',
      '"text":"A speech cut on thE other',
    );
    expect(damaged).not.toBe(file);
    const block = damaged.slice(
      damaged.indexOf('## THEIRS'),
      damaged.indexOf(' -->', damaged.indexOf('## THEIRS')) + 4,
    );
    const { folder, files } = memoryFolder();
    files.set(NAMES.cuts, enc(damaged));
    const out = await sync(p.id, folder);
    expect(out.skipped).toBe(1);
    const after = dec(files.get(NAMES.cuts) as Uint8Array);
    // Kept byte for byte, and MINE added.
    expect(after).toContain(block);
    expect(
      readCutsFile(after)
        .entries.map((e) => e.title)
        .sort(),
    ).toEqual(['GOOD', 'MINE', 'THEIRS']);
    // A second sync changes nothing more: the carried block isn't doubled.
    await sync(p.id, folder);
    const again = dec(files.get(NAMES.cuts) as Uint8Array);
    expect(again).toBe(after);
    expect(again.split(block).length).toBe(2);
  });

  test('forged, foreign and future entries stay in the file, byte for byte', async () => {
    const p = await createProject({ source: ONE });
    await recordCuts(
      p.id,
      'fountain',
      [
        {
          title: 'MINE',
          text: 'A speech cut here on this computer today.',
          where: { after: null, before: null },
        },
      ],
      1,
      NOW - 1000,
    );
    const forged = {
      ...(await cutEntry('Something else entirely, put in by hand.', 'FORGED')),
      id: await hashText('Not this text at all, but another.'),
    };
    const foreign = {
      ...(await cutEntry('# A heading\n\nA Markdown cut.', 'MD')),
      kind: 'markdown' as const,
    };
    const future = await cutEntry(
      'From a clock far ahead of this one.',
      'FUTURE',
      NOW + 30 * 86_400_000,
    );
    const before = cutsFile(NAMES.file, [forged, foreign, future]);
    const blocks = ['FORGED', 'MD', 'FUTURE'].map((t) => {
      const at = before.indexOf(`## ${t}`);
      return before.slice(at, before.indexOf(' -->', at) + 4);
    });
    const { folder, files } = memoryFolder();
    files.set(NAMES.cuts, enc(before));
    await sync(p.id, folder);
    const after = dec(files.get(NAMES.cuts) as Uint8Array);
    for (const block of blocks) expect(after).toContain(block);
    expect(readCutsFile(after).entries.map((e) => e.title)).toContain('MINE');
  });

  test('a cuts file that can’t be read is never written over', async () => {
    const p = await createProject({ source: ONE });
    await recordCuts(
      p.id,
      'fountain',
      [
        {
          title: 'MINE',
          text: 'A speech cut here on this computer today.',
          where: { after: null, before: null },
        },
      ],
      1,
      NOW - 1000,
    );
    const { folder, files } = memoryFolder();
    const latin1 = new Uint8Array([0x23, 0x20, 0xe9, 0xff]);
    files.set(NAMES.cuts, latin1);
    expect((await sync(p.id, folder)).problem).toBe('it isn’t UTF-8 text');
    expect(files.get(NAMES.cuts)).toBe(latin1);
    const failing: BesideFolder = {
      ...folder,
      read: async () => Promise.reject(new Error('gone')),
    };
    const replace = vi.spyOn(failing, 'replace');
    expect((await mergeCutsFile(failing, NAMES, [], 'fountain', new Date())).written).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  test('another computer’s Draft 04 is kept as “(2)”', async () => {
    const p = await createProject({ source: ONE });
    for (const text of ['one\n', 'two\n', 'three\n']) await freeze(p.id, text);
    const mine = await freeze(p.id, ONE);
    const { folder, files } = memoryFolder();
    // The other computer wrote its own Draft 04 first.
    const theirsText = 'INT. PORCH - NIGHT\n\nSomeone else’s fourth draft.\n';
    const theirs = draftFile(
      theirsText,
      {
        draft: 4,
        id: await hashText(theirsText),
        frozen: new Date(NOW - 5000).toISOString(),
        note: '',
      },
      'fountain',
    );
    files.set('Boca drafts/Boca – Draft 04.fountain', enc(theirs));
    await sync(p.id, folder, { cuts: false });
    expect(dec(files.get('Boca drafts/Boca – Draft 04.fountain') as Uint8Array)).toBe(theirs);
    const two = readDraftFile(
      dec(files.get('Boca drafts/Boca – Draft 04 (2).fountain') as Uint8Array),
      'fountain',
    );
    expect(two.facts?.id).toBe(mine.id);
    // Writing again finds this draft at "(2)" and writes nothing more.
    expect((await sync(p.id, folder, { where: 'again', cuts: false })).draftsWritten).toBe(4);
    expect([...files.keys()].filter((k) => k.includes('Draft 04'))).toHaveLength(2);
  });

  test('reopening reads the other computer’s drafts into the list, its Draft 04 apart', async () => {
    const p = await createProject({ source: ONE });
    for (const text of ['one\n', 'two\n', 'three\n', ONE]) await freeze(p.id, text);
    const { folder, files } = memoryFolder();
    await sync(p.id, folder, { cuts: false });
    const theirsText = 'Someone else’s fourth draft.\n';
    files.set(
      'Boca drafts/Boca – Draft 04 (2).fountain',
      enc(
        draftFile(
          theirsText,
          {
            draft: 4,
            id: await hashText(theirsText),
            frozen: new Date(NOW - 5000).toISOString(),
            note: 'on the laptop',
          },
          'fountain',
        ),
      ),
    );
    // A second computer opening the same work: a new project, with nothing yet.
    const q = await createProject({ source: TWO });
    const out = await sync(q.id, folder, { readDrafts: true, cuts: false });
    expect(out.draftsAdded).toBe(5);
    const rows = await listDrafts(q.id);
    expect(rows.map((r) => [r.n, r.outside ?? null])).toEqual([
      [4, 'another-computer'],
      [4, null],
      [3, null],
      [2, null],
      [1, null],
    ]);
    expect(await draftText(q.id, 4)).toBe(ONE);
    expect(await draftText(q.id, rows[0]?.key as string)).toBe(theirsText);
    // Read again: nothing new, nothing doubled.
    expect((await sync(q.id, folder, { readDrafts: true, cuts: false })).draftsAdded).toBe(0);
    // The next draft is 05.
    expect((await freeze(q.id, TWO)).n).toBe(5);
  });

  test('an edited draft file is listed as changed outside Drafter', async () => {
    const q = await createProject({ source: ONE });
    const { folder, files } = memoryFolder();
    const file = draftFile(
      ONE,
      { draft: 1, id: await hashText(ONE), frozen: new Date(NOW).toISOString(), note: '' },
      'fountain',
    );
    files.set(
      'Boca drafts/Boca – Draft 01.fountain',
      enc(file.replace('Marra waits.', 'Marra leaves.')),
    );
    const out = await sync(q.id, folder, { readDrafts: true, cuts: false });
    expect(out.changed).toEqual(['Boca – Draft 01.fountain']);
    const [row] = await listDrafts(q.id);
    expect(row).toMatchObject({ n: 1, outside: 'changed', file: 'Boca – Draft 01.fountain' });
    expect(await draftText(q.id, row?.key as string)).toBe(
      ONE.replace('Marra waits.', 'Marra leaves.'),
    );
  });

  test('a draft file with CRLF line breaks, or a byte order mark in its text, still verifies', async () => {
    const file = draftFile(
      ONE,
      { draft: 1, id: await hashText(ONE), frozen: new Date(NOW).toISOString(), note: '' },
      'fountain',
    );
    const crlf = await readDraftBytes(enc(file.replace(/\n/g, '\r\n')), 'fountain');
    expect(crlf.facts && crlf.matches && crlf.text).toBe(ONE);
    const bom = `﻿${ONE}`;
    const withBom = draftFile(
      bom,
      { draft: 1, id: await hashText(bom), frozen: new Date(NOW).toISOString(), note: '' },
      'fountain',
    );
    const read = await readDraftBytes(enc(withBom), 'fountain');
    expect(read.facts && read.matches).toBe(true);
  });

  test('writeDraft never writes over another text, and gives up past its copies', async () => {
    const p = await createProject({ source: ONE });
    const row = await freeze(p.id, ONE);
    const taken: BesideFolder = {
      read: async () => enc('someone else’s'),
      list: async () => [],
      create: async () => 'exists',
      replace: async () => {
        throw new Error('never');
      },
    };
    expect(await writeDraft(taken, NAMES, row, ONE, 'fountain')).toBeNull();
  });
});

describe('reading what is beside the work', () => {
  test('the cuts file is checked: a forged ID, a wrong kind, damage, and a huge file', async () => {
    const good = await cutEntry('A good cut that hashes to its own ID.', 'GOOD');
    const forged = { ...good, title: 'FORGED', text: 'Not the text that ID is of.' };
    const md = { ...(await cutEntry('A Markdown cut.', 'MD')), kind: 'markdown' as const };
    const file = `${cutsFile(NAMES.file, [good, forged, md])}<!-- drafter-cut {broken -->\n`;
    const read = await readCutsBytes(enc(file), 'fountain');
    expect(read.entries.map((e) => e.title)).toEqual(['GOOD']);
    expect(read.skipped).toBe(3);
    expect((await readCutsBytes(new Uint8Array(32 * 1024 * 1024 + 1), 'fountain')).problem).toBe(
      'it is too big (over 32 MB)',
    );
  });
});

describe('Export drafts and cuts', () => {
  test('the zip holds the drafts folder and the cuts file', async () => {
    const p = await createProject({ source: ONE });
    await freeze(p.id, ONE);
    await freeze(p.id, TWO);
    await recordCuts(
      p.id,
      'fountain',
      [
        {
          title: 'GONE',
          text: 'Words that left the script for good, or so it seemed.',
          where: { after: null, before: null },
        },
      ],
      2,
      NOW,
    );
    const zip = await exportDraftsAndCuts(p.id, NAMES, 'fountain');
    expect(listZip(zip).map((e) => e.name)).toEqual([
      'Boca drafts/Boca – Draft 01.fountain',
      'Boca drafts/Boca – Draft 02.fountain',
      'Boca.fountain.cuts.md',
    ]);
  });
});

describe('opening a draft file itself', () => {
  test('is recognised by its name and its facts, which come out of the text', async () => {
    const file = draftFile(
      ONE,
      { draft: 3, id: await hashText(ONE), frozen: new Date(NOW).toISOString(), note: 'n' },
      'fountain',
    );
    expect(openedDraft('Boca – Draft 03.fountain', file, 'fountain')).toEqual({
      text: ONE,
      work: 'Boca',
      n: 3,
    });
    expect(openedDraft('Boca – Draft 03 (2).fountain', file, 'fountain')?.n).toBe(3);
    // Either alone is not enough.
    expect(openedDraft('Boca.fountain', file, 'fountain')).toBeNull();
    expect(openedDraft('Boca – Draft 03.fountain', ONE, 'fountain')).toBeNull();
  });
});

describe('when a write beside the work fails', () => {
  test('one bad draft file doesn’t stop the others or the cuts file, and is reported', async () => {
    const p = await createProject({ source: ONE });
    await freeze(p.id, ONE);
    await freeze(p.id, TWO);
    await recordCuts(
      p.id,
      'fountain',
      [
        {
          title: 'MINE',
          text: 'A speech cut here on this computer today.',
          where: { after: null, before: null },
        },
      ],
      2,
      NOW - 1000,
    );
    const { folder, files } = memoryFolder();
    const failing: BesideFolder = {
      ...folder,
      async create(rel, bytes) {
        if (rel.endsWith('Draft 01.fountain')) throw new Error('disk-full');
        return folder.create(rel, bytes);
      },
    };
    const out = await sync(p.id, failing);
    expect(out.draftsWritten).toBe(1);
    expect(out.failed.map((f) => f.what)).toEqual(['Draft 01']);
    expect(files.has('Boca drafts/Boca – Draft 02.fountain')).toBe(true);
    expect(files.has(NAMES.cuts)).toBe(true);
    // The next sync, with room again, writes the one that failed.
    const again = await sync(p.id, folder);
    expect(again.failed).toEqual([]);
    expect(again.draftsWritten).toBe(1);
  });

  test('a cuts file that can’t be written is reported, not thrown', async () => {
    const p = await createProject({ source: ONE });
    await recordCuts(
      p.id,
      'fountain',
      [
        {
          title: 'MINE',
          text: 'A speech cut here on this computer today.',
          where: { after: null, before: null },
        },
      ],
      1,
      NOW - 1000,
    );
    const { folder } = memoryFolder();
    const failing: BesideFolder = {
      ...folder,
      replace: async () => Promise.reject(new DOMException('No room.', 'QuotaExceededError')),
    };
    const out = await sync(p.id, failing);
    expect(out.failed.map((f) => f.what)).toEqual([NAMES.cuts]);
  });

  test('says why, and how to put it right', () => {
    const full = besideFailure('Boca.fountain', [
      new DOMException('No room.', 'QuotaExceededError'),
    ]);
    expect(full).toMatch(/^Couldn’t write beside Boca\.fountain: the disk is full\./);
    expect(full).toContain('Free some space');
    expect(
      besideFailure('Boca.fountain', [
        new Error("Error invoking remote method 'x': Error: disk-full"),
      ]),
    ).toMatch(/the disk is full/);
    const revoked = besideFailure('Boca.fountain', [new DOMException('No.', 'NotAllowedError')]);
    expect(revoked).toMatch(
      /^Couldn’t write beside Boca\.fountain: Drafter isn’t allowed to write in its folder any more\./,
    );
    expect(revoked).toContain('Keep next to Boca.fountain…');
    const link = besideFailure('Boca.fountain', [new Error('not-allowed: a link')]);
    expect(link).toMatch(
      /^Couldn’t write beside Boca\.fountain: a link is where Drafter would write/,
    );
    expect(link).toContain('never writes through a link');
    const other = besideFailure(
      'Boca.fountain',
      [new Error('failed: EIO')],
      ['Draft 01', 'Draft 03'],
    );
    expect(other).toMatch(/something went wrong \(EIO\)/);
    expect(other).toContain('Not written: Draft 01, Draft 03.');
    expect(other).toContain('tries again');
  });
});
