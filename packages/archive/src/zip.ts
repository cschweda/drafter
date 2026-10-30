// A strict, read-only zip reader, written from APPNOTE.TXT: the end of central directory record,
// the central directory's file headers, and each entry's local file header. It reads an archive
// that's already in memory, lists its entries with every safety rule applied, and reads one entry
// at a time. Nothing is written, and no entry name is ever used as a path: an entry is only looked
// up by its name. Inflating is the platform's DecompressionStream.
import { crc32 } from './crc32';
import { DeflateWalkError, walkDeflate } from './deflate';

export interface ZipLimits {
  /** The largest archive read at all, in bytes. */
  maxArchiveBytes: number;
  /** The most entries the central directory may list. */
  maxEntries: number;
  /** The largest entry read, by its declared (and real) uncompressed size. */
  maxEntryBytes: number;
  /** The largest the entries' declared sizes may sum to. */
  maxTotalBytes: number;
}

const MiB = 1024 * 1024;

export const ZIP_LIMITS: Readonly<ZipLimits> = Object.freeze({
  maxArchiveBytes: 32 * MiB,
  maxEntries: 1_000,
  maxEntryBytes: 5 * MiB,
  maxTotalBytes: 256 * MiB,
});

export interface ZipEntry {
  /** As stored: UTF-8 when flag bit 11 is set, else each byte as one Latin-1 character. */
  name: string;
  /** 0 stored, 8 deflated; any other is listed, and refused by `readEntry`. */
  method: number;
  /** The declared uncompressed size. */
  size: number;
  compressedSize: number;
  crc32: number;
  /** Where the entry's data starts, past its local header. */
  dataOffset: number;
  /** The name ends in '/'. */
  directory: boolean;
}

export type ZipReason =
  | 'not-zip'
  | 'too-big'
  | 'too-many-entries'
  | 'too-big-unpacked'
  | 'zip64'
  | 'split'
  | 'encrypted'
  | 'unsafe-name'
  | 'duplicate-name'
  | 'damaged'
  | 'method'
  | 'entry-too-big'
  | 'no-inflate';

const MESSAGES: Record<ZipReason, string> = {
  'not-zip': 'This isn’t a zip archive.',
  'too-big': 'The archive is too big to open.',
  'too-many-entries': 'The archive holds too many files.',
  'too-big-unpacked': 'The archive’s files would be too big unpacked.',
  zip64: 'The archive is in the zip64 format, which isn’t read.',
  split: 'The archive is split across several files.',
  encrypted: 'The archive holds an encrypted file.',
  'unsafe-name': 'The archive holds a file with an unsafe name.',
  'duplicate-name': 'The archive holds two files with the same name.',
  damaged: 'The archive is damaged.',
  method: 'A file in the archive is compressed in a way that isn’t read.',
  'entry-too-big': 'A file in the archive is too big to open.',
  'no-inflate': 'This browser can’t unpack compressed files.',
};

export class ZipError extends Error {
  constructor(readonly reason: ZipReason) {
    super(MESSAGES[reason]);
    this.name = 'ZipError';
  }
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const END_SIZE = 22;
const CENTRAL_SIZE = 46;
const LOCAL_SIZE = 30;
const ZIP64_LOCATOR_SIZE = 20;
/** The end record and the longest comment it can carry. */
const END_SEARCH = END_SIZE + 0xffff;

const FLAG_ENCRYPTED = 0x0001;
const FLAG_DATA_DESCRIPTOR = 0x0008;
const FLAG_STRONG_ENCRYPTION = 0x0040;
const FLAG_UTF8 = 0x0800;

const u16 = (b: Uint8Array, at: number) => (b[at] as number) | ((b[at + 1] as number) << 8);
const u32 = (b: Uint8Array, at: number) =>
  ((b[at] as number) |
    ((b[at + 1] as number) << 8) |
    ((b[at + 2] as number) << 16) |
    ((b[at + 3] as number) << 24)) >>>
  0;

function fail(reason: ZipReason): never {
  throw new ZipError(reason);
}

function limitsOf(limits?: Partial<ZipLimits>): ZipLimits {
  return { ...ZIP_LIMITS, ...limits };
}

/** Where the end record starts: the last one in reach whose comment runs exactly to the end. */
function findEnd(bytes: Uint8Array): number {
  const last = bytes.length - END_SIZE;
  const first = Math.max(0, bytes.length - END_SEARCH);
  for (let at = last; at >= first; at--) {
    if (u32(bytes, at) === SIG_END && at + END_SIZE + u16(bytes, at + 20) === bytes.length) {
      return at;
    }
  }
  return fail('not-zip');
}

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

function decodeName(raw: Uint8Array, utf8: boolean): string {
  if (utf8) {
    try {
      return UTF8_DECODER.decode(raw);
    } catch {
      return fail('unsafe-name');
    }
  }
  let name = '';
  for (let i = 0; i < raw.length; i++) name += String.fromCharCode(raw[i] as number);
  return name;
}

/**
 * Whether a name is safe to list: not empty or absolute, and without a backslash, a control
 * character (C0, DEL, or C1, NUL among them), a line or paragraph separator, a bidi control, a
 * `..` segment, or a drive letter. No real package's names hold any of these, and a name can end
 * up in a script's notes.
 */
function safeName(name: string): boolean {
  if (name === '' || name.startsWith('/') || /^[A-Za-z]:/.test(name)) return false;
  if (/[\\\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(name)) return false;
  return !name.split('/').includes('..');
}

function sameBytes(bytes: Uint8Array, a: number, b: number, length: number): boolean {
  for (let i = 0; i < length; i++) if (bytes[a + i] !== bytes[b + i]) return false;
  return true;
}

/** The archive's entries, from its central directory, every safety rule applied; synchronous. */
export function listZip(bytes: Uint8Array, limits?: Partial<ZipLimits>): ZipEntry[] {
  const lim = limitsOf(limits);
  if (bytes.length > lim.maxArchiveBytes) fail('too-big');
  if (bytes.length < END_SIZE) fail('not-zip');
  const end = findEnd(bytes);
  if (end >= ZIP64_LOCATOR_SIZE && u32(bytes, end - ZIP64_LOCATOR_SIZE) === SIG_ZIP64_LOCATOR) {
    fail('zip64');
  }
  const disk = u16(bytes, end + 4);
  const directoryDisk = u16(bytes, end + 6);
  const onDisk = u16(bytes, end + 8);
  const count = u16(bytes, end + 10);
  const directorySize = u32(bytes, end + 12);
  const directoryOffset = u32(bytes, end + 16);
  if (
    disk === 0xffff ||
    directoryDisk === 0xffff ||
    onDisk === 0xffff ||
    count === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  ) {
    fail('zip64');
  }
  if (disk !== 0 || directoryDisk !== 0 || onDisk !== count) fail('split');
  if (count > lim.maxEntries) fail('too-many-entries');
  // The central directory ends where the end record starts: nothing between them, and nothing
  // before the archive (a self-extractor's stub) that the offsets don't count.
  if (directoryOffset + directorySize > end) fail('damaged');
  if (directoryOffset + directorySize < end) fail('not-zip');

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  const spans: [number, number][] = [];
  let total = 0;
  let at = directoryOffset;
  for (let i = 0; i < count; i++) {
    if (at + CENTRAL_SIZE > end || u32(bytes, at) !== SIG_CENTRAL) fail('damaged');
    const flags = u16(bytes, at + 8);
    const method = u16(bytes, at + 10);
    const crc = u32(bytes, at + 16);
    const compressedSize = u32(bytes, at + 20);
    const size = u32(bytes, at + 24);
    const nameLength = u16(bytes, at + 28);
    const extraLength = u16(bytes, at + 30);
    const commentLength = u16(bytes, at + 32);
    const startDisk = u16(bytes, at + 34);
    const localOffset = u32(bytes, at + 42);
    const nameAt = at + CENTRAL_SIZE;
    const next = nameAt + nameLength + extraLength + commentLength;
    if (next > end) fail('damaged');
    if (
      compressedSize === 0xffffffff ||
      size === 0xffffffff ||
      localOffset === 0xffffffff ||
      startDisk === 0xffff
    ) {
      fail('zip64');
    }
    if (startDisk !== 0) fail('split');
    if (flags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION)) fail('encrypted');
    const name = decodeName(bytes.subarray(nameAt, nameAt + nameLength), (flags & FLAG_UTF8) !== 0);
    if (!safeName(name)) fail('unsafe-name');
    if (names.has(name)) fail('duplicate-name');
    names.add(name);
    total += size;
    if (total > lim.maxTotalBytes) fail('too-big-unpacked');

    // The local header: inside the file before the central directory, and agreeing with this record.
    if (localOffset + LOCAL_SIZE > directoryOffset || u32(bytes, localOffset) !== SIG_LOCAL) {
      fail('damaged');
    }
    const localFlags = u16(bytes, localOffset + 6);
    if (localFlags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION)) fail('encrypted');
    if (u16(bytes, localOffset + 8) !== method) fail('damaged');
    if ((localFlags & FLAG_UTF8) !== (flags & FLAG_UTF8)) fail('damaged');
    // Without flag bit 3, the local header carries the CRC-32 and sizes too, and they must agree;
    // with it, they follow the data in a descriptor, and the central record's are the ones read.
    if (
      !(localFlags & FLAG_DATA_DESCRIPTOR) &&
      (u32(bytes, localOffset + 14) !== crc ||
        u32(bytes, localOffset + 18) !== compressedSize ||
        u32(bytes, localOffset + 22) !== size)
    ) {
      fail('damaged');
    }
    const localNameLength = u16(bytes, localOffset + 26);
    const localExtraLength = u16(bytes, localOffset + 28);
    const localNameAt = localOffset + LOCAL_SIZE;
    const dataOffset = localNameAt + localNameLength + localExtraLength;
    if (
      localNameLength !== nameLength ||
      dataOffset > directoryOffset ||
      !sameBytes(bytes, localNameAt, nameAt, nameLength)
    ) {
      fail('damaged');
    }
    if (dataOffset + compressedSize > directoryOffset) fail('damaged');
    spans.push([localOffset, dataOffset + compressedSize]);
    entries.push({
      name,
      method,
      size,
      compressedSize,
      crc32: crc,
      dataOffset,
      directory: name.endsWith('/'),
    });
    at = next;
  }
  // The records fill the central directory exactly.
  if (at !== end) fail('damaged');
  // No two entries share a byte, and the first starts the file: nothing is prepended.
  spans.sort((a, b) => a[0] - b[0]);
  if ((spans[0]?.[0] ?? directoryOffset) !== 0) fail('not-zip');
  for (let i = 1; i < spans.length; i++) {
    if ((spans[i]?.[0] as number) < (spans[i - 1]?.[1] as number)) fail('damaged');
  }
  return entries;
}

function checked(data: Uint8Array, entry: ZipEntry): Uint8Array {
  if (data.length !== entry.size || crc32(data) !== entry.crc32) fail('damaged');
  return data;
}

/** A `DecompressionStream` for raw deflate, or nothing where the platform has none. */
function inflater(): DecompressionStream | undefined {
  if (typeof globalThis.DecompressionStream !== 'function') return undefined;
  try {
    return new DecompressionStream('deflate-raw');
  } catch {
    return undefined;
  }
}

/** One entry's bytes, inflated if deflated, its size and CRC-32 checked. */
export async function readEntry(
  bytes: Uint8Array,
  entry: ZipEntry,
  limits?: Partial<ZipLimits>,
): Promise<Uint8Array> {
  const lim = limitsOf(limits);
  const { dataOffset, compressedSize, size } = entry;
  if (
    !Number.isSafeInteger(dataOffset) ||
    !Number.isSafeInteger(compressedSize) ||
    dataOffset < 0 ||
    compressedSize < 0 ||
    dataOffset + compressedSize > bytes.length
  ) {
    fail('damaged');
  }
  if (size > lim.maxEntryBytes) fail('entry-too-big');
  const packed = bytes.subarray(dataOffset, dataOffset + compressedSize);
  if (entry.method === 0) {
    if (compressedSize !== size) fail('damaged');
    return checked(packed.slice(), entry);
  }
  if (entry.method !== 8) fail('method');
  // No encoder needs more than an eighth over the size, and 64 KiB, so a stream past that is
  // padding (empty blocks, say) that would only make the walk slow.
  if (compressedSize > size + (size >>> 3) + 64 * 1024) fail('damaged');
  const stream = inflater();
  if (!stream) fail('no-inflate');

  // Walk the stream first: it must be whole, end exactly at the data's end, and give exactly the
  // declared size, so a stream that would give more is refused before anything inflates.
  try {
    if (walkDeflate(packed, size) !== size) fail('damaged');
  } catch (error) {
    if (error instanceof DeflateWalkError) fail('damaged');
    throw error;
  }

  // Then inflate, counting chunk by chunk and stopping the moment the count passes what's allowed.
  const writer = stream.writable.getWriter();
  writer.write(packed as BufferSource).catch(() => {});
  writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const out = new Uint8Array(size);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // `size` is at most `maxEntryBytes`, checked above, so this caps the output at both.
      if (length + value.length > size) {
        reader.cancel().catch(() => {});
        fail('damaged');
      }
      out.set(value, length);
      length += value.length;
    }
  } catch (error) {
    if (error instanceof ZipError) throw error;
    fail('damaged');
  }
  return checked(out.subarray(0, length), entry);
}
