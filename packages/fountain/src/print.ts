import type { Doc } from './types';

/** Writes a document back out. Every node keeps its raw text, so this is lossless. */
export function print(doc: Doc): string {
  let out = doc.titlePage?.raw ?? '';
  for (const block of doc.blocks) {
    out += block.leading;
    out += block.lines.map((line) => line.raw).join('\n');
  }
  return out + doc.trailing;
}
