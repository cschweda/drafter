import { describe, expect, test } from 'vitest';
import { deletedScenes } from '../src';
import { now, versions } from './helpers';
import { CAR, LAST_FERRY, nightFares, S, V } from './scripts';

/** The headings of the scenes in `older` (oldest first) that are deleted in `current`. */
function deleted(older: readonly string[], current: string): string[] {
  const { snapshots, prints } = versions(older);
  return deletedScenes(snapshots, prints, now(current)).map((d) => d.newest.print.heading);
}

describe('deletedScenes', () => {
  test('lists a scene removed since a snapshot', () => {
    const { snapshots, prints } = versions([LAST_FERRY]);
    const found = deletedScenes(snapshots, prints, now(V.waterCut));
    expect(found).toHaveLength(1);
    const [water] = found;
    expect(water?.newest.print.heading).toBe('EXT. OPEN WATER - NIGHT');
    expect(water?.newest.snapshot).toBe('s0');
    expect(water?.newest.slot.ordinal).toBe(10);
    expect(LAST_FERRY.slice(water?.newest.slot.from, water?.newest.slot.to)).toBe(S.water);
    expect(water?.versions).toBe(1);
    expect(water?.oldestAt).toBe(water?.newest.at);
    expect(water?.key).toBe(water?.newest.print.hash);
  });

  test('nothing is deleted when nothing was cut', () => {
    expect(deleted([LAST_FERRY], LAST_FERRY)).toEqual([]);
    expect(deleted([], LAST_FERRY)).toEqual([]);
  });

  test('lists the one car scene deleted of five', () => {
    const cut = [...CAR.slice(0, 2), ...CAR.slice(3)];
    const { snapshots, prints } = versions([nightFares(CAR)]);
    const found = deletedScenes(snapshots, prints, now(nightFares(cut)));
    expect(found).toHaveLength(1);
    expect(found[0]?.newest.print.heading).toBe('INT. CAR - NIGHT');
    expect(found[0]?.newest.slot.ordinal).toBe(4);
  });

  test('a trimmed scene, a renamed one, and a rewrite under its heading kept', () => {
    expect(deleted([LAST_FERRY], V.trimmed)).toEqual([]);
    expect(deleted([LAST_FERRY], V.renamed)).toEqual([]);
  });

  test('a scene rewritten from nothing under a new heading is deleted', () => {
    expect(deleted([LAST_FERRY], V.rewrite)).toEqual(['INT. FERRY WHEELHOUSE - NIGHT']);
  });

  test('a split scene is not deleted', () => {
    expect(deleted([LAST_FERRY], V.split)).toEqual([]);
    expect(deleted([LAST_FERRY], V.splitRenamed)).toEqual([]);
    // Nor is either half, once split, when the scene is whole again.
    expect(deleted([V.split], LAST_FERRY)).toEqual([]);
  });

  test('two merged scenes are not deleted', () => {
    expect(deleted([LAST_FERRY], V.merged)).toEqual([]);
    expect(deleted([LAST_FERRY], V.mergedRenamed)).toEqual([]);
  });

  test('a heading-only scene filled in later is not deleted; one cut is', () => {
    const bare = 'INT. BARN - DAY\n\nINT. HOUSE - DAY\n\nMara waits.\n';
    const filled =
      'INT. BARN - DAY\n\nTobin feeds the goats and counts them twice, slowly.\n\nINT. HOUSE - DAY\n\nMara waits.\n';
    expect(deleted([bare], filled)).toEqual([]);
    expect(deleted([filled], bare)).toEqual([]);
    expect(deleted([bare], 'INT. HOUSE - DAY\n\nMara waits.\n')).toEqual(['INT. BARN - DAY']);
  });

  test('a moved scene is not deleted', () => {
    expect(deleted([LAST_FERRY], V.moved)).toEqual([]);
  });

  test('a scene cut while a near-copy stays is not deleted; one sharing a line is', () => {
    expect(deleted([LAST_FERRY], V.callbackKept)).toEqual([]);
    expect(deleted([LAST_FERRY], V.echoKept)).toEqual(['EXT. JETTY - MORNING']);
  });

  test('one entry across many versions, dated by the newest', () => {
    // The wheelhouse scene in three versions (as written, renamed, then trimmed), then cut.
    const renamed = S.wheelhouse.replace('INT. FERRY WHEELHOUSE', 'INT. WHEELHOUSE');
    const trimmed = renamed.replace(/\n\nHe holds the torch[\s\S]*$/, '');
    const edit = (scene: string) => LAST_FERRY.replace(S.wheelhouse, scene);
    const older = [LAST_FERRY, LAST_FERRY, edit(renamed), edit(trimmed), edit(trimmed)];
    const { snapshots, prints } = versions(older);
    const found = deletedScenes(
      snapshots,
      prints,
      now(LAST_FERRY.replace(`${S.wheelhouse}\n\n`, '')),
    );
    expect(found).toHaveLength(1);
    const [entry] = found;
    expect(entry?.versions).toBe(5);
    expect(entry?.newest.snapshot).toBe('s4');
    expect(entry?.newest.at).toBe(5 * 3_600_000);
    expect(entry?.oldestAt).toBe(3_600_000);
    expect(entry?.newest.print.heading).toBe('INT. WHEELHOUSE - NIGHT');
  });

  test('newest deleted first', () => {
    // The water scene is cut in the second version, the landing in the third; now both are gone
    // and the morning scene too, which the newest version still had.
    const noWater = V.waterCut;
    const noLanding = noWater.replace(`${S.landing}\n\n`, '');
    const current = noLanding.replace(`\n\n${S.morning}`, '');
    expect(deleted([LAST_FERRY, noWater, noLanding], current)).toEqual([
      'EXT. JETTY - DAY',
      'EXT. ISLAND LANDING - DAY',
      'EXT. OPEN WATER - NIGHT',
    ]);
  });

  test('a scene in two snapshots at once is one entry with both', () => {
    const { snapshots, prints } = versions([LAST_FERRY, LAST_FERRY]);
    const found = deletedScenes(snapshots, prints, now(V.waterCut));
    expect(found.map((d) => [d.versions, d.newest.snapshot])).toEqual([[2, 's1']]);
  });
});
