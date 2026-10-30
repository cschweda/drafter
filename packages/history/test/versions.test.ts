import { describe, expect, test } from 'vitest';
import { type SceneVersion, sceneVersions, type VersionRow } from '../src';
import { printOf, versions } from './helpers';
import { LAST_FERRY, S } from './scripts';

const isGap = (row: VersionRow): row is { gap: true; snapshots: string[] } => 'gap' in row;

/** Edits made to the wheelhouse scene one at a time, renaming it along the way. */
const EDITS: Array<[string, string]> = [
  [
    'A cramped box of dials and a wheel worn pale',
    'A cramped cabin of brass dials and a wheel rubbed pale',
  ],
  ['INT. FERRY WHEELHOUSE', 'INT. WHEELHOUSE'],
  ['Hold the torch on the compass and stop talking.', 'Hold the light steady. Quiet now.'],
  [
    'Tobias braces in the doorway, soaked, the valuation folder still absurdly under his arm.',
    'Tobias stumbles in, dripping, clutching a folder he has forgotten he is holding.',
  ],
  [
    'He holds the torch. His hand shakes. She steadies it with hers without looking.',
    'He tries. The beam wobbles over the dials. She reaches over and steadies his wrist.',
  ],
  ['INT. WHEELHOUSE', 'INT. BRIDGE'],
  [
    'Rain sheets the glass faster than the wiper can clear it.',
    'The single wiper loses its fight with the rain.',
  ],
];

/** The scene after each edit in turn, from as first written. */
const STEPS = [S.wheelhouse as string];
for (const [from, to] of EDITS) STEPS.push((STEPS[STEPS.length - 1] as string).replace(from, to));

const edit = (scene: string) => LAST_FERRY.replace(S.wheelhouse, scene);

describe('sceneVersions', () => {
  test('follows a scene renamed and rewritten bit by bit', () => {
    const { snapshots, prints } = versions(STEPS.map(edit));
    const current = printOf(edit(STEPS[7] as string), 'INT. BRIDGE - NIGHT');
    const rows = sceneVersions(current, snapshots, prints);
    expect(rows.every((r) => !isGap(r))).toBe(true);
    expect(rows.map((r) => (r as SceneVersion).snapshots)).toEqual(
      [7, 6, 5, 4, 3, 2, 1, 0].map((i) => [`s${i}`]),
    );
    const first = rows[7] as SceneVersion;
    expect(prints.get(first.hash)?.heading).toBe('INT. FERRY WHEELHOUSE - NIGHT');
    expect(first.slot.ordinal).toBe(9);
    // The newest and the oldest version share too little to match each other directly.
    expect(
      sceneVersions(current, [snapshots[7] as (typeof snapshots)[number]], prints).every(isGap),
    ).toBe(true);
  });

  test('each version carries its heading and its printed words, for the list', () => {
    const { snapshots, prints } = versions(STEPS.map(edit));
    const rows = sceneVersions(
      printOf(edit(STEPS[7] as string), 'INT. BRIDGE - NIGHT'),
      snapshots,
      prints,
    ) as SceneVersion[];
    for (const row of rows) {
      expect(row.heading).toBe(prints.get(row.hash)?.heading);
      expect(row.words).toBe(prints.get(row.hash)?.words);
    }
    expect(rows[7]?.heading).toBe('INT. FERRY WHEELHOUSE - NIGHT');
    expect(rows[0]?.heading).toBe('INT. BRIDGE - NIGHT');
  });

  test('merges consecutive equal versions', () => {
    const texts = [STEPS[0], STEPS[0], STEPS[1], STEPS[1], STEPS[1]].map((s) => edit(s as string));
    const { snapshots, prints } = versions(texts);
    const rows = sceneVersions(
      printOf(texts[4] as string, 'INT. FERRY WHEELHOUSE - NIGHT'),
      snapshots,
      prints,
    );
    expect(rows).toHaveLength(2);
    const [newer, older] = rows as SceneVersion[];
    expect(newer?.snapshots).toEqual(['s4', 's3', 's2']);
    expect(newer?.newestAt).toBe(5 * 3_600_000);
    expect(newer?.oldestAt).toBe(3 * 3_600_000);
    expect(older?.snapshots).toEqual(['s1', 's0']);
    expect(older?.newestAt).toBe(2 * 3_600_000);
    expect(older?.oldestAt).toBe(3_600_000);
  });

  test('a snapshot without the scene is a gap and the walk goes on', () => {
    const without = LAST_FERRY.replace(`${S.wheelhouse}\n\n`, '');
    const texts = [edit(STEPS[0] as string), without, without, edit(STEPS[1] as string)];
    const { snapshots, prints } = versions(texts);
    const rows = sceneVersions(
      printOf(texts[3] as string, 'INT. FERRY WHEELHOUSE - NIGHT'),
      snapshots,
      prints,
    );
    expect(rows.map((r) => (isGap(r) ? 'gap' : 'version'))).toEqual(['version', 'gap', 'version']);
    expect(rows[1]?.snapshots).toEqual(['s2', 's1']);
    expect(rows[2]?.snapshots).toEqual(['s0']);
  });

  test('picks the closest of two matches, the same heading first', () => {
    // A copy of the scene sits beside it; the walk follows the one under the same heading.
    const copy = S.wheelhouse.replace('INT. FERRY WHEELHOUSE', 'INT. FERRY GALLEY');
    const text = LAST_FERRY.replace(S.wheelhouse, `${S.wheelhouse}\n\n${copy}`);
    const { snapshots, prints } = versions([text]);
    // Now, the scene has one word changed, so no version has its hash.
    const current = text.replace('forty years', 'fifty years');
    const rows = sceneVersions(
      printOf(current, 'INT. FERRY WHEELHOUSE - NIGHT'),
      snapshots,
      prints,
    );
    expect(rows).toHaveLength(1);
    expect(prints.get((rows[0] as SceneVersion).hash)?.heading).toBe(
      'INT. FERRY WHEELHOUSE - NIGHT',
    );
  });
});
