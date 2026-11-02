import { describe, expect, it } from 'vitest';
import { renderStoryMap, type StoryMap } from '../src';
import { realFonts } from './fonts';
import { build, generated } from './scripts';

// The size budget (story-map design §10.3, Call 24): small enough to send by text message or
// email, with the real fonts inside.

const KB = 1024;
const bytes = (map: StoryMap) =>
  new TextEncoder().encode(
    renderStoryMap({ map, fonts: realFonts(), lang: 'en', generator: 'Drafter 0.24.1' }),
  ).length;

describe('the size budget', () => {
  it('120 pages is under 400 KB', () => {
    const map = build(generated(120, 110, 30), { title: 'Long Shore', status: 'in-progress' }).map;
    expect(map.facts.pages).toBeGreaterThanOrEqual(115);
    const size = bytes(map);
    console.log(`story map, 120 pages, 110 scenes, 30 characters: ${size} bytes`);
    expect(size).toBeLessThan(400 * KB);
  });

  it('300 pages, 200 scenes, 60 characters is under 1 MB', () => {
    const map = build(generated(300, 200, 60), { title: 'Long Shore', status: 'in-progress' }).map;
    expect(map.facts.pages).toBeGreaterThanOrEqual(290);
    expect(map.scenes).toHaveLength(200);
    expect(map.characters).toHaveLength(60);
    const size = bytes(map);
    console.log(`story map, 300 pages, 200 scenes, 60 characters: ${size} bytes`);
    expect(size).toBeLessThan(1024 * KB);
  });
});
