import { parse } from '@drafter/fountain';
import { type Scene, sceneIndex } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { ref } from 'vue';
import { BACK_LIMIT, createScaffold } from '../app/scaffold/session';

// Scaffold's session (seeing-the-script design §5.1, §5.2, Call 26): one tab with pages, a Back list
// inside it, and the scene page following the cursor's scene, which is on at every visit. The
// cursor's scene (at rest) and the scenes by id are stand-ins over a real parse.

const screenplay = builtins['us-screenplay'] as Template;
const QUAY = `INT. CUSTOMS SHED - DAY

PELL counts crates.

EXT. QUAY - NIGHT

PELL
Tide's turning.

INT. NET LOFT - NIGHT

Ropes hang in loops.
`;
const scenes = sceneIndex(parse(QUAY), screenplay, null).scenes;
const byId = new Map(scenes.map((scene, i) => [`s${i + 1}`, scene] as const));

/** A session over QUAY, with the cursor resting in scene `at` (an id, or null before the first). */
function session(at: string | null = 's1') {
  const followed = ref<string | null>(at);
  const scaffold = createScaffold({
    followed,
    sceneById: (id) => byId.get(id) ?? null,
  });
  return { scaffold, followed };
}
const heading = (scene: Scene | null) => scene?.heading ?? null;

describe('Scaffold’s session', () => {
  test('starts on the scene page, following', () => {
    const { scaffold, followed } = session();
    expect(scaffold.page.value).toEqual({ kind: 'scene', pinned: null });
    expect(scaffold.follow.value).toBe(true);
    expect(scaffold.canGoBack.value).toBe(false);
    expect(heading(scaffold.sceneShown.value)).toBe('INT. CUSTOMS SHED - DAY');
    followed.value = 's2';
    expect(heading(scaffold.sceneShown.value)).toBe('EXT. QUAY - NIGHT');
    // Before the first scene there is none to show.
    followed.value = null;
    expect(scaffold.sceneShown.value).toBeNull();
  });

  test('open pushes Back and back pops it', () => {
    const { scaffold } = session();
    scaffold.open({ kind: 'cast' });
    expect(scaffold.page.value).toEqual({ kind: 'cast' });
    expect(scaffold.canGoBack.value).toBe(true);
    // Only the scene page shows a scene.
    expect(scaffold.sceneShown.value).toBeNull();
    scaffold.open({ kind: 'character', key: 'PELL' });
    scaffold.open({ kind: 'location', key: 'QUAY' });
    expect(scaffold.back()).toBe(true);
    expect(scaffold.page.value).toEqual({ kind: 'character', key: 'PELL' });
    expect(scaffold.back()).toBe(true);
    expect(scaffold.back()).toBe(true);
    expect(scaffold.page.value).toEqual({ kind: 'scene', pinned: null });
    expect(scaffold.canGoBack.value).toBe(false);
    expect(scaffold.back()).toBe(false);
    // The page already shown isn't pushed again.
    scaffold.open({ kind: 'scene', pinned: null });
    expect(scaffold.canGoBack.value).toBe(false);
  });

  test('a pinned scene turns follow off', () => {
    const { scaffold, followed } = session();
    scaffold.open({ kind: 'scene', pinned: 's3' });
    expect(scaffold.follow.value).toBe(false);
    expect(heading(scaffold.sceneShown.value)).toBe('INT. NET LOFT - NIGHT');
    // The cursor moving on doesn't move the page.
    followed.value = 's2';
    expect(heading(scaffold.sceneShown.value)).toBe('INT. NET LOFT - NIGHT');
    // Follow the cursor, on again: the page is the cursor's scene.
    scaffold.follow.value = true;
    expect(scaffold.page.value).toEqual({ kind: 'scene', pinned: null });
    expect(heading(scaffold.sceneShown.value)).toBe('EXT. QUAY - NIGHT');
    // And off: the page keeps the scene it shows, whatever the cursor does next.
    scaffold.follow.value = false;
    expect(scaffold.page.value).toEqual({ kind: 'scene', pinned: 's2' });
    followed.value = 's1';
    expect(heading(scaffold.sceneShown.value)).toBe('EXT. QUAY - NIGHT');
  });

  test('follow is not remembered', () => {
    const first = session().scaffold;
    first.follow.value = false;
    first.open({ kind: 'scene', pinned: 's3' });
    // The next visit's session follows again, on the scene page.
    const next = session('s2').scaffold;
    expect(next.follow.value).toBe(true);
    expect(next.page.value).toEqual({ kind: 'scene', pinned: null });
    expect(heading(next.sceneShown.value)).toBe('EXT. QUAY - NIGHT');
  });

  test('Back keeps the last 50 pages', () => {
    const { scaffold } = session();
    expect(BACK_LIMIT).toBe(50);
    for (let n = 0; n < 60; n++) scaffold.open({ kind: 'character', key: `C${n}` });
    let steps = 0;
    while (scaffold.back()) steps++;
    expect(steps).toBe(50);
    // The oldest went first: the first page left is the eleventh opened.
    expect(scaffold.page.value).toEqual({ kind: 'character', key: 'C9' });
  });

  test('before the first scene, Follow the cursor stays on: there is nothing to pin', () => {
    const { scaffold, followed } = session(null);
    scaffold.follow.value = false;
    expect(scaffold.follow.value).toBe(true);
    expect(scaffold.page.value).toEqual({ kind: 'scene', pinned: null });
    // So the cursor moving into a scene is still followed.
    followed.value = 's2';
    expect(heading(scaffold.sceneShown.value)).toBe('EXT. QUAY - NIGHT');
  });

  test('opening the scene page unpinned always follows the cursor', () => {
    const { scaffold, followed } = session('s1');
    scaffold.open({ kind: 'scene', pinned: 's3' });
    expect(scaffold.follow.value).toBe(false);
    // Show Scaffold: back to following, the cursor's scene.
    scaffold.open({ kind: 'scene', pinned: null });
    expect(scaffold.follow.value).toBe(true);
    expect(heading(scaffold.sceneShown.value)).toBe('INT. CUSTOMS SHED - DAY');
    // On the same page already, it stays on.
    scaffold.open({ kind: 'scene', pinned: null });
    expect(scaffold.follow.value).toBe(true);
    followed.value = 's3';
    expect(heading(scaffold.sceneShown.value)).toBe('INT. NET LOFT - NIGHT');
  });
});
