// Cursors (§7.3): where the next page starts, and what it was a page of. Opaque to the AI app,
// signed with a key made when the server starts, so a made-up cursor, one from another server or
// another call, or one for a file that has changed since starts again from the beginning instead
// of reading anything else.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** What a cursor holds. */
export interface CursorAt {
  tool: string;
  /** The file (or folder) paged through, as the tool shows it. */
  path: string;
  mtimeMs: number;
  size: number;
  /** The SHA-256 of the call's other arguments, as canonical JSON (`argsHash`). */
  args: string;
  /** The item the next page starts at. */
  at: number;
  /** The part of that item, for one too large for a page. */
  part?: number;
}

/** JSON with every object's keys in code-unit order, so equal arguments give equal text. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** The SHA-256 (hex) of `args` as canonical JSON. */
export function argsHash(args: unknown): string {
  return createHash('sha256').update(canonical(args), 'utf8').digest('hex');
}

const mac = (key: Uint8Array, body: string) => createHmac('sha256', key).update(body).digest();

/** base64url(JSON) "." base64url(HMAC-SHA256(key, JSON)). */
export function makeCursor(key: Uint8Array, at: CursorAt): string {
  const json = JSON.stringify({
    tool: at.tool,
    path: at.path,
    mtimeMs: at.mtimeMs,
    size: at.size,
    args: at.args,
    at: at.at,
    ...(at.part === undefined ? {} : { part: at.part }),
  });
  return `${Buffer.from(json, 'utf8').toString('base64url')}.${mac(key, json).toString('base64url')}`;
}

const isPosition = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Where a cursor says to carry on, or 'restart' when it isn't one this server made for this very
 * call: its signature, its tool, its file and that file's size and modified time, and the other
 * arguments must all match `now`.
 */
export function readCursor(
  key: Uint8Array,
  cursor: string,
  now: Omit<CursorAt, 'at' | 'part'>,
): { at: number; part?: number } | 'restart' {
  const pieces = cursor.split('.');
  if (pieces.length !== 2) return 'restart';
  const [body, signature] = pieces as [string, string];
  if (!BASE64URL.test(body) || !BASE64URL.test(signature)) return 'restart';
  const json = Buffer.from(body, 'base64url').toString('utf8');
  const given = Buffer.from(signature, 'base64url');
  const expected = mac(key, json);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return 'restart';
  let at: Partial<CursorAt>;
  try {
    at = JSON.parse(json);
  } catch {
    return 'restart';
  }
  if (
    at === null ||
    typeof at !== 'object' ||
    at.tool !== now.tool ||
    at.path !== now.path ||
    at.mtimeMs !== now.mtimeMs ||
    at.size !== now.size ||
    at.args !== now.args ||
    !isPosition(at.at) ||
    (at.part !== undefined && !isPosition(at.part))
  )
    return 'restart';
  return at.part === undefined ? { at: at.at } : { at: at.at, part: at.part };
}
