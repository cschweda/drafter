import { splitLines } from '@drafter/compare';

async function sha7(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  let hex = '';
  for (const b of new Uint8Array(digest).subarray(0, 4)) hex += b.toString(16).padStart(2, '0');
  return hex.slice(0, 7);
}

/**
 * One short fingerprint per source line: the first 7 hex characters of the SHA-256 of the
 * trimmed line, then `:n`, where n counts how often that fingerprint has appeared so far.
 * The count tells repeated lines (blank lines, "CUT TO:") apart. Lines split as the diff
 * splits them, so the two always agree on line numbers.
 */
export async function fingerprintLines(text: string): Promise<string[]> {
  const { lines } = splitLines(text);
  const seen = new Map<string, number>();
  const cache = new Map<string, string>();
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    let hash = cache.get(trimmed);
    if (hash === undefined) {
      hash = await sha7(trimmed);
      cache.set(trimmed, hash);
    }
    const n = (seen.get(hash) ?? 0) + 1;
    seen.set(hash, n);
    out.push(`${hash}:${n}`);
  }
  return out;
}
