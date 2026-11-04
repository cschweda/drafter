import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  draftFrom,
  draftsByPrefix,
  draftText,
  freezeDraft,
  listDrafts,
  setDraftFrom,
  setDraftNote,
} from '../app/drafts/store';
import { DAY_MS } from '../app/snapshots/retention';
import { db } from '../app/storage/db';
import { gunzip } from '../app/storage/gzip';
import { hashText } from '../app/storage/hash';
import { createProject, removeProject } from '../app/storage/projects';
import { takeSnapshot, thinSnapshots } from '../app/storage/snapshots';

// Drafts in the browser's storage (drafts-and-cuts design §2, §5): numbered from 1, only ever up,
// each the exact text with its SHA-256 as its ID, never thinned, and gone only with the script.

const NOW = new Date(2026, 10, 1, 12, 0, 0).getTime();
const ONE = 'INT. HALL - DAY\n\nMarra waits.\n';
const TWO = 'INT. HALL - DAY\n\nMarra waits, and waits.\n';

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await Promise.all(db.tables.map((table) => table.clear()));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const frozen = async (projectId: string, text: string, note = '') => {
  const out = await freezeDraft(projectId, text, note);
  if (out.result !== 'frozen') throw new Error(out.why);
  return out.row;
};

describe('the drafts store', () => {
  test('freezes Draft 1 then 2, numbers only go up', async () => {
    const p = await createProject({ source: ONE });
    const a = await frozen(p.id, ONE, 'first pass');
    vi.setSystemTime(NOW + 60_000);
    const b = await frozen(p.id, TWO);
    expect(a).toMatchObject({ key: `${p.id}:1`, projectId: p.id, n: 1, note: 'first pass' });
    expect(b).toMatchObject({ key: `${p.id}:2`, n: 2, frozenAt: NOW + 60_000, words: 8 });
    // Listed newest first, without their text.
    const listed = await listDrafts(p.id);
    expect(listed.map((row) => row.n)).toEqual([2, 1]);
    expect(listed.every((row) => row.gz === undefined && row.source === undefined)).toBe(true);
    expect(await draftText(p.id, 1)).toBe(ONE);
    expect(await draftText(p.id, 2)).toBe(TWO);
    expect(await draftText(p.id, 3)).toBeNull();
    // Another script's drafts start at 1 too.
    const q = await createProject({ source: ONE });
    expect((await frozen(q.id, ONE)).n).toBe(1);
  });

  test('two freezes at once take two numbers, and neither is lost', async () => {
    const p = await createProject({ source: ONE });
    const [a, b] = await Promise.all([
      freezeDraft(p.id, ONE, 'one'),
      freezeDraft(p.id, TWO, 'two'),
    ]);
    expect(a?.result).toBe('frozen');
    expect(b?.result).toBe('frozen');
    const listed = await listDrafts(p.id);
    expect(listed.map((row) => row.n)).toEqual([2, 1]);
    expect(new Set(listed.map((row) => row.note))).toEqual(new Set(['one', 'two']));
    const textOf = new Map(listed.map((row) => [row.note, row.n]));
    expect(await draftText(p.id, textOf.get('one') as number)).toBe(ONE);
    expect(await draftText(p.id, textOf.get('two') as number)).toBe(TWO);
  });

  test('the same text frozen again gets a new number and the same ID', async () => {
    const p = await createProject({ source: ONE });
    const a = await frozen(p.id, ONE);
    const b = await frozen(p.id, ONE);
    expect([a.n, b.n]).toEqual([1, 2]);
    expect(b.id).toBe(a.id);
  });

  test('the ID is hashText of the exact text', async () => {
    const p = await createProject({ source: ONE });
    const crlf = 'INT. HALL - DAY\r\n\r\nMarra waits.\r\n';
    const row = await frozen(p.id, crlf);
    expect(row.id).toBe(await hashText(crlf));
    expect(row.id).toMatch(/^[0-9a-f]{64}$/);
    expect(row.id).not.toBe(await hashText(ONE));
    // Kept compressed, as snapshots are.
    const stored = await db.drafts.get(`${p.id}:1`);
    expect(stored?.gz).toBeInstanceOf(Uint8Array);
    expect(await gunzip(stored?.gz as Uint8Array)).toBe(crlf);
  });

  test('a note is one line, trimmed, and can be changed later', async () => {
    const p = await createProject({ source: ONE });
    await frozen(p.id, ONE, '  sent to Sam\nfor notes  ');
    expect((await listDrafts(p.id))[0]?.note).toBe('sent to Sam for notes');
    await setDraftNote(p.id, 1, 'from Sam’s notes');
    expect((await listDrafts(p.id))[0]?.note).toBe('from Sam’s notes');
    // A draft that isn't there is left alone.
    await setDraftNote(p.id, 9, 'nothing');
    expect(await listDrafts(p.id)).toHaveLength(1);
  });

  test('a storage-full error leaves no half row and says so', async () => {
    const p = await createProject({ source: ONE });
    await frozen(p.id, ONE);
    const full = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    vi.spyOn(db.drafts, 'add').mockRejectedValue(full);
    const out = await freezeDraft(p.id, TWO, 'notes');
    expect(out.result).toBe('failed');
    expect(out.result === 'failed' && out.why).toMatch(/storage is full/);
    vi.restoreAllMocks();
    expect((await listDrafts(p.id)).map((row) => row.n)).toEqual([1]);
    // The next one is still Draft 2.
    expect((await frozen(p.id, TWO)).n).toBe(2);
  });

  test('another failure says so, and nothing is kept', async () => {
    const p = await createProject({ source: ONE });
    vi.spyOn(db.drafts, 'add').mockRejectedValue(new Error('broken'));
    const out = await freezeDraft(p.id, ONE, '');
    expect(out.result === 'failed' && out.why).toMatch(/Couldn’t start/);
    vi.restoreAllMocks();
    expect(await listDrafts(p.id)).toEqual([]);
  });

  test('a script that is gone gets no draft', async () => {
    const out = await freezeDraft('nobody', ONE, '');
    expect(out.result).toBe('failed');
    expect(await db.drafts.count()).toBe(0);
  });

  test('remembers where the next draft comes from, and uses it once', async () => {
    const p = await createProject({ source: ONE });
    const one = await frozen(p.id, ONE);
    expect(await draftFrom(p.id)).toBeNull();
    await setDraftFrom(p.id, { n: 1, id: one.id });
    expect(await draftFrom(p.id)).toEqual({ n: 1, id: one.id });
    const two = await frozen(p.id, TWO);
    expect(two.from).toEqual({ n: 1, id: one.id });
    expect(await draftFrom(p.id)).toBeNull();
    // A `from` given is used as it is.
    const three = await freezeDraft(p.id, ONE, '', { n: 2, id: two.id });
    expect(three.result === 'frozen' && three.row.from).toEqual({ n: 2, id: two.id });
  });

  test('draftsByPrefix finds by 4+ hex and lists every match', async () => {
    const p = await createProject({ source: ONE });
    const q = await createProject({ source: TWO });
    const a = await frozen(p.id, ONE);
    const b = await frozen(q.id, TWO);
    const c = await frozen(q.id, ONE);
    expect(await draftsByPrefix(a.id.slice(0, 3))).toEqual([]);
    expect(await draftsByPrefix('zzzz')).toEqual([]);
    const found = await draftsByPrefix(a.id.slice(0, 6).toUpperCase());
    expect(found.map((f) => [f.projectId, f.row.n]).sort()).toEqual(
      [
        [p.id, 1],
        [q.id, 2],
      ].sort(),
    );
    expect(found.every((f) => f.row.gz === undefined)).toBe(true);
    expect((await draftsByPrefix(b.id)).map((f) => f.row.key)).toEqual([b.key]);
    expect(c.id).toBe(a.id);
  });

  test('drafts survive thinSnapshots', async () => {
    const p = await createProject({ source: ONE });
    await takeSnapshot(p.id, ONE, 'timed');
    await frozen(p.id, ONE);
    await frozen(p.id, TWO);
    await thinSnapshots(p.id, NOW + 400 * DAY_MS);
    expect((await listDrafts(p.id)).map((row) => row.n)).toEqual([2, 1]);
    expect(await draftText(p.id, 1)).toBe(ONE);
  });

  test('removeProject removes them, and its cuts', async () => {
    const p = await createProject({ source: ONE });
    const q = await createProject({ source: TWO });
    await frozen(p.id, ONE);
    await frozen(q.id, TWO);
    await setDraftFrom(p.id, { n: 1, id: 'a'.repeat(64) });
    await db.cuts.put({ key: `${p.id}:x`, projectId: p.id, id: 'x' });
    await removeProject(p.id);
    expect(await listDrafts(p.id)).toEqual([]);
    expect(await draftFrom(p.id)).toBeNull();
    expect(await db.cuts.where('projectId').equals(p.id).count()).toBe(0);
    expect((await listDrafts(q.id)).map((row) => row.n)).toEqual([1]);
  });
});

// A Markdown document's draft and snapshot count its prose only, never its drafter comment (a
// novel's synopses), and a script counts as it always has.
describe('words of a Markdown document', () => {
  const BODY = '# The Salt Road\n\nShe walked out at low tide.\n';
  const NOVEL = `${BODY}\n<!-- drafter {"template":"novel","novel":{"nodes":{"chapter:the-salt-road:0":{"synopsis":"Many words of a long synopsis here."}}}} -->\n`;
  const SCRIPT = `${ONE}\n<!-- drafter {"note":"a script's own line"} -->\n`;

  test('a draft, a draft from a file, and a snapshot count the prose; a script all of it', async () => {
    const { addDraftFromFile } = await import('../app/drafts/store');
    const { documentWords, wordsIn } = await import('../app/markdown/words');
    const p = await createProject({ source: NOVEL });
    const out = await freezeDraft(p.id, NOVEL, '', undefined, 'markdown');
    if (out.result !== 'frozen') throw new Error(out.why);
    expect(out.row.words).toBe(wordsIn(BODY));
    // Another text (the same one is the draft already), with as many words.
    const fromFile = NOVEL.replace('low tide', 'high tide');
    await addDraftFromFile(p.id, {
      n: 5,
      id: await hashText(fromFile),
      text: fromFile,
      frozenAt: NOW,
      note: '',
      changed: false,
      kind: 'markdown',
      file: 'Draft 05.md',
      where: 'folder',
    });
    expect((await listDrafts(p.id)).find((row) => row.n === 5)?.words).toBe(wordsIn(BODY));
    await takeSnapshot(p.id, NOVEL, 'manual', { kind: 'markdown' });
    const { listSnapshots } = await import('../app/storage/snapshots');
    expect((await listSnapshots(p.id))[0]?.words).toBe(wordsIn(BODY));
    // A script is unchanged, whatever its last line says.
    const s = await createProject({ source: SCRIPT });
    const scripted = await freezeDraft(s.id, SCRIPT, '', undefined, 'fountain');
    if (scripted.result !== 'frozen') throw new Error(scripted.why);
    expect(scripted.row.words).toBe(wordsIn(SCRIPT));
    expect(documentWords(SCRIPT, 'fountain')).toBe(wordsIn(SCRIPT));
    // A row with no kind, kept before: a text ending in a drafter comment is a document's.
    expect(documentWords(NOVEL)).toBe(wordsIn(BODY));
  });

  test('a draft step counts the prose, so a synopsis edited is no words', async () => {
    const { stepCounts } = await import('../app/drafts/steps');
    const longer = NOVEL.replace('long synopsis', 'longer and longer synopsis');
    expect(stepCounts(NOVEL, longer, 'markdown').words).toBe(0);
    expect(stepCounts(NOVEL, longer, 'markdown').changed).toBe(0);
  });
});
