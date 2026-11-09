import { CAPS } from './block';

/** Bytes to base64 a slice at a time: spreading a multi-MB array into one call overflows the stack. */
const CHUNK = 0x8000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function collect(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        // Stop inflating the moment the cap is passed, so a small file can't fill memory.
        await reader.cancel().catch(() => {});
        return null;
      }
      parts.push(value);
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The script's text, gzipped and then base64, for the baseline kept in the file. */
export async function encodeBaseline(text: string): Promise<string> {
  const source = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = await collect(source, Number.POSITIVE_INFINITY);
  // Unreachable with an infinite cap, but keeps the type honest.
  if (!bytes) throw new Error('could not compress the baseline');
  return toBase64(bytes);
}

/**
 * Reads a baseline back. Returns null, never throws, for anything that isn't one: bad base64,
 * bad gzip, or text past `maxBytes` (a file is untrusted input, and gzip can inflate a lot).
 */
export async function decodeBaseline(
  encoded: string,
  maxBytes: number = CAPS.baselineBytes,
): Promise<string | null> {
  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    return null;
  }
  const input = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) input[i] = binary.charCodeAt(i);

  const stream = new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip'));
  const bytes = await collect(stream, maxBytes);
  if (!bytes) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
