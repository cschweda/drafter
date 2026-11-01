import { describe, expect, it } from 'vitest';
import type { StoryMap } from '../src';
import { docOf, generatedPlay, text } from './charts';
import { build, generated, HARBOUR } from './scripts';

// Places (design §2.8, §5.1) and threads (design §2.9, §3.4), each with its table.

/** `count` setups, in scenes 1, 2, 3…, each paid off `gap` scenes later; every `open`th unpaid. */
const THINGS = ['key', 'bell', 'map', 'coin', 'rope', 'lamp', 'boot', 'ring', 'kite', 'drum'];
const LABEL = (i: number) =>
  `the ${THINGS[i % 10]}${i >= 10 ? ` ${THINGS[Math.floor(i / 10)]}` : ''}`;

function threaded(count: number, gap: number, open: number, label = LABEL) {
  const parts = generated(80, 40, 8).split(/(?=^(?:INT|EXT)\. )/m);
  const scenes = parts.slice(1);
  // A note goes just under its scene's heading, so it is the scene's and not an act's.
  const add = (at: number, line: string) => {
    scenes[at] = (scenes[at] as string).replace('\n\n', `\n\n${line}\n\n`);
  };
  for (let i = 0; i < count; i++) {
    const at = i % scenes.length;
    add(at, `A thing to keep. [[Setup: ${label(i)}]]`);
    if ((i + 1) % open !== 0) {
      add(Math.min(scenes.length - 1, at + gap), `The thing comes back. [[Payoff: ${label(i)}]]`);
    }
  }
  return [parts[0], ...scenes].join('');
}

const places = (map: StoryMap) => docOf(map).querySelector('section#places, section#settings');

describe('places', () => {
  it('places are tagged in five sizes, top 24, and N more', () => {
    const map = build(generated(120, 40, 8)).map;
    expect(map.places).toHaveLength(24);
    const section = places(map);
    expect(section?.id).toBe('places');
    expect(text(section?.querySelector('h2'))).toBe('Places');
    const tags = [...(section?.querySelectorAll('ul.tags li.tag') ?? [])];
    expect(tags).toHaveLength(24);
    tags.forEach((tag, i) => {
      const place = map.places[i];
      expect(tag.classList.contains(`z${place?.size}`)).toBe(true);
      expect(text(tag.querySelector('b'))).toBe(place?.name);
      expect(text(tag.querySelector('span'))).toMatch(/^\d+ scenes? · (\d+ min|under a minute)/);
    });
    expect(text(section?.querySelector('ul.tags li.more'))).toBe(`and ${map.placesMore} more`);
    expect(text(section?.querySelector('.cap'))).toBe(
      'The bigger the name, the more of the story happens there.',
    );
    // Its table: place, scenes, minutes, one row a tag.
    const rows = section?.querySelectorAll('details table tbody tr');
    expect(rows).toHaveLength(24);
    expect(text(rows?.[0]?.querySelector('th'))).toBe(map.places[0]?.name);
    // The nav links to it.
    expect(docOf(map).querySelector('nav a[href="#places"]')?.textContent).toBe('Places');
  });

  it('a play’s places are called settings', () => {
    const map = build(generatedPlay(2, 4, 6), { title: 'The Long Porch' }).map;
    const section = places(map);
    expect(section?.id).toBe('settings');
    expect(text(section?.querySelector('h2'))).toBe('Settings');
    expect(text(section?.querySelector('.cap'))).toBe(
      'The bigger the name, the more of the play happens there.',
    );
    expect(text(section?.querySelector('details table thead'))).toContain('Setting');
    expect(docOf(map).querySelector('nav a[href="#settings"]')?.textContent).toBe('Settings');
  });

  it('no places, no section', () => {
    const map = build(HARBOUR).map;
    const none = { ...map, places: [], placesMore: 0 };
    expect(places(none)).toBeNull();
    expect(docOf(none).querySelector('nav a[href="#places"]')).toBeNull();
  });
});

describe('threads', () => {
  it('threads draw up to 12 arcs and list them all', () => {
    const map = build(threaded(15, 5, 4)).map;
    expect(map.threads).toHaveLength(15);
    const doc = docOf(map);
    const section = doc.querySelector('section#threads');
    expect(text(section?.querySelector('h2'))).toBe('Threads');
    const arcs = section?.querySelectorAll('svg.arcs path.arc');
    expect(arcs).toHaveLength(12);
    const svg = section?.querySelector('svg.arcs');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 1000 150');
    expect(svg?.getAttribute('preserveAspectRatio')).toBe('none');
    expect(svg?.getAttribute('role')).toBe('img');
    for (const arc of arcs ?? []) {
      expect(arc.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    }
    expect(section?.querySelector('svg.arcn')?.getAttribute('aria-hidden')).toBe('true');
    expect(section?.querySelectorAll('svg.arcn text.nt')).toHaveLength(12);
    expect(section?.querySelectorAll('ol.threads > li')).toHaveLength(15);
    expect(section?.querySelectorAll('details table tbody tr')).toHaveLength(15);
    expect(doc.querySelector('nav a[href="#threads"]')?.textContent).toBe('Threads');
  });

  it('the numbers on the arcs never touch', () => {
    // Twelve threads crowded into the same few scenes.
    const map = build(threaded(12, 1, 99, (i) => `the ${THINGS[i % 10]} ${i}`)).map;
    const nums = [...docOf(map).querySelectorAll('svg.arcn text.nt')].map((t) => ({
      x: Number.parseFloat(t.getAttribute('x') ?? ''),
      y: Number.parseFloat(t.getAttribute('y') ?? ''),
    }));
    expect(nums).toHaveLength(12);
    // A badge is 20 px across; at 300 px wide 1% is 3 px.
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const a = nums[i] as { x: number; y: number };
        const b = nums[j] as { x: number; y: number };
        const apart = Math.abs(a.x - b.x) * 3 >= 22 || Math.abs(a.y - b.y) >= 22;
        expect(apart).toBe(true);
      }
    }
  });

  it('an unpaid thread says not yet paid off', () => {
    const map = build(threaded(4, 5, 2)).map;
    const doc = docOf(map);
    const items = [...doc.querySelectorAll('ol.threads > li')];
    expect(text(items[1])).toMatch(/scene 2 → not yet paid off$/);
    expect(items[1]?.classList.contains('open')).toBe(true);
    expect(text(items[0])).toMatch(/scene 1 → 6$/);
    expect(doc.querySelectorAll('svg.arcs path.arc.open')).toHaveLength(2);
    const style = doc.querySelector('style')?.textContent ?? '';
    expect(style).toMatch(/\.arc\.open\{[^}]*stroke-dasharray/);
  });

  it('no setups, no threads section', () => {
    const doc = docOf(build(HARBOUR).map);
    expect(doc.querySelector('section#threads')).toBeNull();
    expect(doc.querySelector('nav a[href="#threads"]')).toBeNull();
  });

  it('a thread label is text, even inside SVG', () => {
    const evil = '</text><script>x</script>';
    const map = build(threaded(1, 2, 99, () => evil)).map;
    expect(map.threads[0]?.label).toBe(evil);
    const doc = docOf(map);
    expect(doc.querySelector('script')).toBeNull();
    const title = doc.querySelector('svg.arcs path.arc title');
    expect(title?.textContent).toContain(evil);
    expect(text(doc.querySelector('ol.threads b'))).toBe(evil);
  });
});
