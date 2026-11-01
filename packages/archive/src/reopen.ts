// Reopenable exports (docs/spec/drafter-package.md, the appendix "The script inside an HTML or
// EPUB export"): with "Let Drafter reopen this file" on, an HTML export carries its script's exact text in one inert
// `<script type="text/plain" id="drafter-source">` element, as base64 of its UTF-8 bytes, and an
// EPUB carries it as one more file, `EPUB/drafter-source.fountain` (or `.md`). This file writes
// the element and reads either back. Reading never runs, renders, or parses the page as HTML: it
// looks for the element's exact opening text, and refuses (null) anything that isn't exactly one
// well-formed block. The bytes it gives back are the caller's to check as any opened text is
// (no NUL, strict UTF-8, under 5 MB).

import { isEBook, isWebPage, MAX_SCRIPT_BYTES } from './formats';
import { listZip, readEntry, ZIP_LIMITS } from './zip';

/** What the script inside is: a screenplay or stage play (Fountain), or a Markdown document. */
export type SourceKind = 'fountain' | 'markdown';

/** The element's id in an HTML export: part of the open spec, so it never changes. */
export const SOURCE_ID = 'drafter-source';

/** The source's file in an EPUB export, by kind: part of the open spec, so they never change. */
export const SOURCE_ENTRY: Readonly<Record<SourceKind, string>> = Object.freeze({
  fountain: 'EPUB/drafter-source.fountain',
  markdown: 'EPUB/drafter-source.md',
});

/**
 * The largest HTML or EPUB file read to look for its script: the zip reader's cap for an archive
 * (32 MB). A 300-page script's export is under 5 MB with its script inside.
 */
export const REOPEN_MAX_BYTES = ZIP_LIMITS.maxArchiveBytes;

const OPEN_START = `<script type="text/plain" id="${SOURCE_ID}" data-kind="`;
const OPEN_END = '" data-encoding="base64">';
const CLOSE = '</script>';
const LINE = 76;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VALUE = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) VALUE[ALPHABET.charCodeAt(i)] = i;

/** Standard base64 (RFC 4648 §4), padded. */
function toBase64(bytes: Uint8Array): string {
  const out: string[] = [];
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n =
      ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    out.push(
      ALPHABET[n >> 18] as string,
      ALPHABET[(n >> 12) & 63] as string,
      ALPHABET[(n >> 6) & 63] as string,
      ALPHABET[n & 63] as string,
    );
  }
  const left = bytes.length - i;
  if (left > 0) {
    const n = ((bytes[i] as number) << 16) | (left === 2 ? (bytes[i + 1] as number) << 8 : 0);
    out.push(ALPHABET[n >> 18] as string, ALPHABET[(n >> 12) & 63] as string);
    out.push(left === 2 ? (ALPHABET[(n >> 6) & 63] as string) : '=', '=');
  }
  return out.join('');
}

/**
 * Strict base64: ASCII white space between characters is skipped; anything else not in the
 * alphabet, a length that isn't a multiple of four, padding bits that aren't zero, or padding
 * anywhere but the end is refused
 * (null). Linear in the text. Gives up past `max` decoded bytes.
 */
function fromBase64(text: string, max: number): Uint8Array | null {
  // Over 4 characters for every 3 bytes past the cap can only be too big (or not base64).
  if (text.length > Math.ceil(max / 3) * 4 * 2 + 1024) return null;
  const all = new Uint8Array(text.length);
  let length = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0c || c === 0x0d) continue;
    if (c >= 128) return null;
    all[length++] = c;
  }
  const clean = all.subarray(0, length);
  if (clean.length % 4 !== 0) return null;
  let pad = 0;
  if (clean.length > 0 && clean[clean.length - 1] === 0x3d) pad++;
  if (clean.length > 1 && clean[clean.length - 2] === 0x3d) pad++;
  const size = (clean.length / 4) * 3 - pad;
  if (size > max) return null;
  const out = new Uint8Array(size);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const last = i + 4 === clean.length;
    let n = 0;
    for (let j = 0; j < 4; j++) {
      const c = clean[i + j] as number;
      if (c === 0x3d && last && j >= 4 - pad) {
        n <<= 6;
        continue;
      }
      const v = VALUE[c] as number;
      if (v < 0) return null;
      n = (n << 6) | v;
    }
    // The bits padding leaves over must be zero, so a text has one spelling only.
    if (last && ((pad === 2 && (n & 0xffff) !== 0) || (pad === 1 && (n & 0xff) !== 0))) return null;
    out[o++] = (n >> 16) & 255;
    if (o < size) out[o++] = (n >> 8) & 255;
    if (o < size) out[o++] = n & 255;
  }
  return out;
}

const utf8 = new TextEncoder();

/**
 * The element an HTML export carries its script in: `type="text/plain"`, so no browser runs it
 * and no content security policy is asked about it; the text as base64 of its UTF-8 bytes, in
 * lines of 76, so nothing in the script (`</script>`, `<!--`) can end the element or be read as
 * markup. The text goes in exactly as given: its line breaks and a leading byte order mark too.
 */
export function sourceElement(kind: SourceKind, text: string): string {
  const encoded = toBase64(utf8.encode(text));
  const lines: string[] = [];
  for (let i = 0; i < encoded.length; i += LINE) lines.push(encoded.slice(i, i + LINE));
  const body = lines.length > 0 ? `\n${lines.join('\n')}\n` : '\n';
  return `${OPEN_START}${kind}${OPEN_END}${body}${CLOSE}`;
}

/** What `embeddedSource` found: the script's kind and its exact bytes. */
export interface EmbeddedSource {
  kind: SourceKind;
  bytes: Uint8Array;
}

/**
 * Whether a file is one a reopenable export could be: an e-book or a web page by its content
 * (whatever its name), else by its extension (`.epub`, `.html`, `.htm`); null for anything else.
 */
export function reopenFormatOf(
  name: string | undefined,
  bytes: Uint8Array,
): 'html' | 'epub' | null {
  if (isEBook(bytes)) return 'epub';
  if (isWebPage(bytes)) return 'html';
  const extension = /\.([^./\\]+)$/.exec(name ?? '')?.[1]?.toLowerCase();
  if (extension === 'epub') return 'epub';
  if (extension === 'html' || extension === 'htm') return 'html';
  return null;
}

function fromHtml(bytes: Uint8Array): EmbeddedSource | null {
  const page = new TextDecoder('utf-8').decode(bytes);
  const start = page.indexOf(OPEN_START);
  if (start < 0) return null;
  // Exactly one: a Drafter export escapes every `<` of the writer's text, so it has only its own.
  if (page.indexOf(OPEN_START, start + OPEN_START.length) >= 0) return null;
  const kindStart = start + OPEN_START.length;
  const kindEnd = page.indexOf('"', kindStart);
  if (kindEnd < 0) return null;
  const kind = page.slice(kindStart, kindEnd);
  if (kind !== 'fountain' && kind !== 'markdown') return null;
  if (!page.startsWith(OPEN_END, kindEnd)) return null;
  const bodyStart = kindEnd + OPEN_END.length;
  const bodyEnd = page.indexOf(CLOSE, bodyStart);
  if (bodyEnd < 0) return null;
  const decoded = fromBase64(page.slice(bodyStart, bodyEnd), MAX_SCRIPT_BYTES);
  return decoded ? { kind, bytes: decoded } : null;
}

async function fromEpub(bytes: Uint8Array): Promise<EmbeddedSource | null> {
  try {
    const entries = listZip(bytes);
    const found = (Object.keys(SOURCE_ENTRY) as SourceKind[]).flatMap((kind) =>
      entries
        .filter((e) => !e.directory && e.name === SOURCE_ENTRY[kind])
        .map((entry) => ({ kind, entry })),
    );
    const only = found.length === 1 ? found[0] : undefined;
    if (!only) return null;
    return { kind: only.kind, bytes: await readEntry(bytes, only.entry) };
  } catch {
    // Damaged, too big, or in a form the reader refuses: no script to give back.
    return null;
  }
}

/**
 * The script a Drafter HTML or EPUB export carries (written with "Let Drafter reopen this file"),
 * or null when the file has none, holds a malformed one, or is over `REOPEN_MAX_BYTES`, or its
 * script is over 5 MB. Never throws.
 */
export async function embeddedSource(bytes: Uint8Array): Promise<EmbeddedSource | null> {
  if (bytes.byteLength > REOPEN_MAX_BYTES) return null;
  try {
    return isEBook(bytes) ? await fromEpub(bytes) : fromHtml(bytes);
  } catch {
    return null;
  }
}
