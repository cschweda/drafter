// A snapshot's text, gzip-compressed with the browser's own `CompressionStream` (technical design
// §8.4): no dependency. Where it is missing, snapshots are kept as plain text (`canCompress`).

/** Whether this browser can gzip a snapshot. */
export function canCompress(): boolean {
  return typeof globalThis.CompressionStream === 'function';
}

/** Whether this browser can read a gzip-compressed snapshot. */
export function canDecompress(): boolean {
  return typeof globalThis.DecompressionStream === 'function';
}

async function pipe(bytes: Uint8Array, through: CompressionStream | DecompressionStream) {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(through);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The text's UTF-8 bytes, gzip-compressed. */
export function gzip(text: string): Promise<Uint8Array> {
  return pipe(new TextEncoder().encode(text), new CompressionStream('gzip'));
}

/** The text back; rejects when the bytes are not gzip, are damaged, or are not UTF-8. */
export async function gunzip(bytes: Uint8Array): Promise<string> {
  const raw = await pipe(bytes, new DecompressionStream('gzip'));
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
}
