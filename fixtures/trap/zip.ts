// A small zip writer for the trap documents, from APPNOTE.TXT's three records (a local file header
// before each entry's data, a central file header for each entry, the end of central directory
// record), with a switch for each way a hostile or broken archive can lie. Every byte is the
// generator's own: no archive is copied from anywhere. Times are fixed, so the output is the same
// on every run.
import { deflateRawSync } from 'node:zlib';
import { crc32 } from '../../packages/archive/src/crc32';

export interface TrapEntry {
  name: string;
  data: Uint8Array | string;
  /** 0 stored, 8 deflated (the default), or any other method number, stored as is. */
  method?: number;
  /** General-purpose flags, in both headers (bit 11, a UTF-8 name, is added for a non-ASCII name). */
  flags?: number;
  /** The uncompressed size to declare, in both headers, instead of the real one. */
  declaredSize?: number;
  /** The CRC-32 to declare, in both headers, instead of the real one. */
  declaredCrc?: number;
  /** The external attributes: a Unix mode in the high 16 bits (with `madeBy` 3, Unix). */
  external?: number;
  /** The "version made by" field's high byte: 0 MS-DOS, 3 Unix. */
  madeBy?: number;
  /** Compressed bytes to store as they are, instead of compressing `data`. */
  raw?: Uint8Array;
  /** An extra field, in both headers. */
  extra?: Uint8Array;
}

export interface TrapZipOptions {
  /** Bytes before the first entry, whose offsets the archive does not count (a polyglot). */
  junk?: Uint8Array;
  /** Bytes before the first entry, counted in every offset (a self-extractor's stub). */
  stub?: Uint8Array;
  /** Leave out the central directory and the end record: local headers alone. */
  noCentral?: boolean;
  /** A zip64 end of central directory locator just before the end record. */
  zip64Locator?: boolean;
  /** The end record's entry counts, instead of the real one. */
  declaredCount?: number;
}

const utf8 = new TextEncoder();
const bytesOf = (data: Uint8Array | string) =>
  typeof data === 'string' ? utf8.encode(data) : data;

class Out {
  private chunks: Uint8Array[] = [];
  length = 0;
  bytes(b: Uint8Array) {
    this.chunks.push(b);
    this.length += b.length;
  }
  u16(v: number) {
    this.bytes(Uint8Array.of(v & 0xff, (v >>> 8) & 0xff));
  }
  u32(v: number) {
    this.bytes(Uint8Array.of(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff));
  }
  done(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const c of this.chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}

/** An archive of `entries`, broken in the ways the options and each entry's fields ask. */
export function trapZip(entries: readonly TrapEntry[], options: TrapZipOptions = {}): Uint8Array {
  const out = new Out();
  if (options.stub) out.bytes(options.stub);
  const central: {
    entry: TrapEntry;
    name: Uint8Array;
    flags: number;
    method: number;
    crc: number;
    size: number;
    packed: number;
    offset: number;
  }[] = [];
  for (const entry of entries) {
    const data = bytesOf(entry.data);
    const method = entry.method ?? 8;
    const packed = entry.raw ?? (method === 8 ? deflateRawSync(data) : data);
    const name = utf8.encode(entry.name);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: any byte past ASCII marks a UTF-8 name.
    const flags = (entry.flags ?? 0) | (/[^\x00-\x7f]/.test(entry.name) ? 0x800 : 0);
    const crc = entry.declaredCrc ?? crc32(data);
    const size = entry.declaredSize ?? data.length;
    const extra = entry.extra ?? new Uint8Array();
    const offset = out.length;
    out.u32(0x04034b50);
    out.u16(20);
    out.u16(flags);
    out.u16(method);
    out.u16(0); // time
    out.u16(0x21); // date: 1980-01-01
    out.u32(crc);
    out.u32(packed.length);
    out.u32(size);
    out.u16(name.length);
    out.u16(extra.length);
    out.bytes(name);
    out.bytes(extra);
    out.bytes(packed);
    central.push({ entry, name, flags, method, crc, size, packed: packed.length, offset });
  }
  if (options.noCentral) return withJunk(out.done(), options.junk);
  const directoryOffset = out.length;
  for (const c of central) {
    const extra = c.entry.extra ?? new Uint8Array();
    out.u32(0x02014b50);
    out.u16(((c.entry.madeBy ?? 0) << 8) | 20);
    out.u16(20);
    out.u16(c.flags);
    out.u16(c.method);
    out.u16(0);
    out.u16(0x21);
    out.u32(c.crc);
    out.u32(c.packed);
    out.u32(c.size);
    out.u16(c.name.length);
    out.u16(extra.length);
    out.u16(0); // comment
    out.u16(0); // disk
    out.u16(0); // internal attributes
    out.u32(c.entry.external ?? 0);
    out.u32(c.offset);
    out.bytes(c.name);
    out.bytes(extra);
  }
  const directorySize = out.length - directoryOffset;
  if (options.zip64Locator) {
    out.u32(0x07064b50);
    out.u32(0);
    out.u32(0);
    out.u32(0);
    out.u32(1);
  }
  const count = options.declaredCount ?? central.length;
  out.u32(0x06054b50);
  out.u16(0);
  out.u16(0);
  out.u16(count);
  out.u16(count);
  out.u32(directorySize);
  out.u32(directoryOffset);
  out.u16(0);
  return withJunk(out.done(), options.junk);
}

function withJunk(zip: Uint8Array, junk: Uint8Array | undefined): Uint8Array {
  if (!junk) return zip;
  const out = new Uint8Array(junk.length + zip.length);
  out.set(junk);
  out.set(zip, junk.length);
  return out;
}

/** A Unix mode for a symbolic link (S_IFLNK, 0777), as external attributes put it. */
export const SYMLINK_ATTRS = (0o120777 << 16) >>> 0;
