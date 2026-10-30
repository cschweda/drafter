import { describe, expect, test } from 'vitest';
import { sceneAnchors } from '../src';
import { LANTERN_ROOM, LAST_FERRY } from './scripts';

describe('sceneAnchors', () => {
  test("gives each scene heading's line and title, a play's ## scenes included", () => {
    const lines = LAST_FERRY.split('\n');
    const anchors = sceneAnchors(LAST_FERRY);
    expect(anchors).toHaveLength(12);
    for (const anchor of anchors) expect(lines[anchor.line]).toBe(anchor.title);
    expect(anchors[0]).toEqual({ line: 5, title: 'INT. FERRY OFFICE - DAWN' });
    const play = sceneAnchors(LANTERN_ROOM);
    expect(play.map((a) => LANTERN_ROOM.split('\n')[a.line])).toEqual([
      '## The Climb',
      '## The Lamp',
      '## The Letter',
      '## The Gale',
      '## The Ship',
      '## The Keys',
    ]);
  });

  test('counts CRLF as one line break and leaves sections out', () => {
    const crlf = LAST_FERRY.replace(/\n/g, '\r\n');
    expect(sceneAnchors(crlf)).toEqual(sceneAnchors(LAST_FERRY));
    expect(sceneAnchors('# ACT ONE\n\nJust a section.\n')).toEqual([]);
  });
});
