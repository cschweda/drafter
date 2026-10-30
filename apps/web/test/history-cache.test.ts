import 'fake-indexeddb/auto';
import { PRINT_VERSION, scenePrints } from '@drafter/history';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  cacheDb,
  clearProjectCache,
  prune,
  putScenes,
  readPrints,
  readScenes,
  sweep,
} from '../app/history/cache';
import { db } from '../app/storage/db';
import { createProject, removeProject } from '../app/storage/projects';

// The prints cache (version-history design §3.6): its own database, `drafter-cache`, holding each
// snapshot's scenes and one print per scene version, swept after a scan and removed with the script.

const HALL =
  'INT. GLASS HALL - DAY\n\nOrvella paces the long floor, counting the tiles under her breath.\n\nORVELLA\nNine hundred and some. Never the same twice.\n';
const ROOF =
  'EXT. TIN ROOF - NIGHT\n\nBrannick lies flat on the warm metal and watches the slow drift of lamps below.\n';
const YARD =
  'EXT. SALT YARD - DAWN\n\nA cart of grey sacks creaks past the gate while the gulls argue overhead.\n';
const script = (...scenes: string[]) => `Title: Tile Count\n\n${scenes.join('\n')}`;

const cache = () => cacheDb() as NonNullable<ReturnType<typeof cacheDb>>;

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  await Promise.all(cache().tables.map((table) => table.clear()));
});

/** The scenes and prints of `text`, as a scan stores them. */
function scanned(id: string, text: string) {
  const { slots, prints } = scenePrints(text);
  return { row: { id, slots }, prints };
}

describe('the prints cache', () => {
  test('stores and reads prints once per scene version', async () => {
    const one = scanned('s1', script(HALL, ROOF));
    const two = scanned('s2', script(HALL, YARD));
    await putScenes('p1', [one.row], one.prints);
    await putScenes('p1', [two.row], two.prints);

    const scenes = await readScenes('p1');
    expect([...scenes.keys()].sort()).toEqual(['s1', 's2']);
    expect(scenes.get('s1')).toEqual(one.row.slots);
    // HALL is in both snapshots and is stored once.
    expect(await cache().prints.where('projectId').equals('p1').count()).toBe(3);
    const prints = await readPrints('p1');
    const hall = one.row.slots[0]?.hash as string;
    expect(prints.get(hall)?.heading).toBe('INT. GLASS HALL - DAY');
    expect(prints.get(hall)?.sketch).toBeInstanceOf(Uint32Array);
    expect(prints.get(hall)).toEqual(one.prints[0]);
  });

  test('a row of another PRINT_VERSION is a miss', async () => {
    const one = scanned('s1', script(HALL));
    await putScenes('p1', [one.row], one.prints);
    await cache().snapshotScenes.update('s1', { version: PRINT_VERSION + 1 });
    const hash = one.row.slots[0]?.hash as string;
    await cache().prints.update(['p1', hash], { version: PRINT_VERSION + 1 });
    expect((await readScenes('p1')).size).toBe(0);
    expect((await readPrints('p1')).size).toBe(0);
  });

  test('sweep drops rows of gone snapshots and prints nothing names', async () => {
    const one = scanned('s1', script(HALL, ROOF));
    const two = scanned('s2', script(HALL, YARD));
    await putScenes('p1', [one.row, two.row], [...one.prints, ...two.prints]);
    await sweep('p1', new Set(['s2']));
    expect([...(await readScenes('p1')).keys()]).toEqual(['s2']);
    const headings = [...(await readPrints('p1')).values()].map((p) => p.heading).sort();
    expect(headings).toEqual(['EXT. SALT YARD - DAWN', 'INT. GLASS HALL - DAY']);
  });

  test('sweep drops rows of another PRINT_VERSION', async () => {
    const one = scanned('s1', script(HALL, ROOF));
    const two = scanned('s2', script(YARD));
    await putScenes('p1', [one.row, two.row], [...one.prints, ...two.prints]);
    await cache().snapshotScenes.update('s1', { version: PRINT_VERSION - 1 });
    const roof = one.row.slots[1]?.hash as string;
    await cache().prints.update(['p1', roof], { version: PRINT_VERSION - 1 });
    await sweep('p1', new Set(['s1', 's2']));
    expect(await cache().snapshotScenes.where('projectId').equals('p1').primaryKeys()).toEqual([
      's2',
    ]);
    // Only the yard is named by a row of this version.
    const left = await cache().prints.where('projectId').equals('p1').toArray();
    expect(left.map((p) => p.heading)).toEqual(['EXT. SALT YARD - DAWN']);
  });

  test('prune drops the rows of scripts that no longer exist', async () => {
    const mine = await createProject({ source: script(HALL) });
    const one = scanned('s1', script(HALL));
    const two = scanned('s2', script(ROOF));
    await putScenes(mine.id, [one.row], one.prints);
    await putScenes('gone', [two.row], two.prints);
    await prune();
    expect((await readScenes('gone')).size).toBe(0);
    expect(await cache().prints.where('projectId').equals('gone').count()).toBe(0);
    expect((await readScenes(mine.id)).size).toBe(1);
    expect((await readPrints(mine.id)).size).toBe(1);
  });

  test('clearProjectCache leaves other scripts alone', async () => {
    const one = scanned('s1', script(HALL));
    const two = scanned('s2', script(ROOF));
    await putScenes('p1', [one.row], one.prints);
    await putScenes('p2', [two.row], two.prints);
    await clearProjectCache('p1');
    expect((await readScenes('p1')).size).toBe(0);
    expect((await readPrints('p1')).size).toBe(0);
    expect([...(await readScenes('p2')).keys()]).toEqual(['s2']);
    expect((await readPrints('p2')).size).toBe(1);
  });

  test("removeProject clears the script's cache", async () => {
    const mine = await createProject({ source: script(HALL) });
    const other = await createProject({ source: script(ROOF) });
    const one = scanned('s1', script(HALL));
    const two = scanned('s2', script(ROOF));
    await putScenes(mine.id, [one.row], one.prints);
    await putScenes(other.id, [two.row], two.prints);
    await removeProject(mine.id);
    expect(await cache().snapshotScenes.where('projectId').equals(mine.id).count()).toBe(0);
    expect(await cache().prints.where('projectId').equals(mine.id).count()).toBe(0);
    expect((await readScenes(other.id)).size).toBe(1);
  });
});
