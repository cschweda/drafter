import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { argsHash, type CursorAt, makeCursor, readCursor } from '../src/cursor';

const key = new Uint8Array(randomBytes(32));
const file = {
  tool: 'read_scene',
  path: 'Scripts/Signal Hill/Signal Hill – 101.fountain',
  mtimeMs: 1_762_000_000_123.5,
  size: 18_204,
  args: argsHash({ scene: '3', include: [] }),
};

describe('cursors', () => {
  it('a cursor round-trips', () => {
    const cursor = makeCursor(key, { ...file, at: 7 });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(readCursor(key, cursor, file)).toEqual({ at: 7 });
    const parted = makeCursor(key, { ...file, at: 2, part: 3 });
    expect(readCursor(key, parted, file)).toEqual({ at: 2, part: 3 });
    // The same arguments in another order are the same arguments.
    expect(argsHash({ include: [], scene: '3' })).toBe(file.args);
  });

  it('a changed file, other arguments, another tool, or another file restart', () => {
    const cursor = makeCursor(key, { ...file, at: 7 });
    const changes: Array<Omit<CursorAt, 'at' | 'part'>> = [
      { ...file, mtimeMs: file.mtimeMs + 1 },
      { ...file, size: file.size + 1 },
      { ...file, args: argsHash({ scene: '4', include: [] }) },
      { ...file, tool: 'script_overview' },
      { ...file, path: 'Scripts/Signal Hill/Signal Hill – 102.fountain' },
    ];
    for (const now of changes) expect(readCursor(key, cursor, now)).toBe('restart');
  });

  it('a forged or truncated cursor restarts', () => {
    const cursor = makeCursor(key, { ...file, at: 7 });
    const [body, mac] = cursor.split('.') as [string, string];
    const forgedBody = Buffer.from(JSON.stringify({ ...file, at: 9_999 }), 'utf8').toString(
      'base64url',
    );
    for (const bad of [
      `${forgedBody}.${mac}`,
      cursor.slice(0, -3),
      body,
      `${body}.`,
      '',
      '.',
      'not a cursor',
      `${body}.${mac}.${mac}`,
    ])
      expect(readCursor(key, bad, file)).toBe('restart');
  });

  it('a cursor from another server’s key restarts', () => {
    const other = new Uint8Array(randomBytes(32));
    expect(readCursor(key, makeCursor(other, { ...file, at: 7 }), file)).toBe('restart');
  });

  it('a signed cursor with a bad position restarts', () => {
    for (const at of [-1, 1.5, Number.NaN])
      expect(readCursor(key, makeCursor(key, { ...file, at }), file)).toBe('restart');
    expect(readCursor(key, makeCursor(key, { ...file, at: 1, part: -2 }), file)).toBe('restart');
  });
});
