// Builds zip archives for the tests, from APPNOTE.TXT's three records: a local file header before
// each entry's data, a central file header for each entry, and the end of central directory record.
// Each option breaks the archive in one deliberate way. Deflate is Node's built-in zlib.
import { deflateRawSync } from 'node:zlib';
import { crc32 } from '../src/crc32';

export interface MakeEntry {
  name: string;
  data: Uint8Array | string;
  /** 0 stored, 8 deflated (the default), or any other number, stored as is. */
  method?: number;
  /** General-purpose flags. Bit 11 writes the name as UTF-8; without it, each character is a byte. */
  flags?: number;
  /** The uncompressed size to declare, in both headers, instead of the real one. */
  declaredSize?: number;
  /** The CRC-32 to declare, in both headers, instead of the real one. */
  declaredCrc?: number;
  /** The name in the local header, when it should differ from the central record's. */
  localName?: string;
  /** An extra field, in both headers. */
  extra?: Uint8Array;
  /** Compressed bytes to store as they are, instead of compressing `data`. */
  raw?: Uint8Array;
}

export interface MakeOptions {
  comment?: string;
  /** Puts a zip64 end of central directory locator just before the end record. */
  zip64Locator?: boolean;
  /** The end record's disk number. */
  disk?: number;
  /** Bytes before the first entry, with every offset counted from the file's start (a self-extractor). */
  prefix?: Uint8Array;
  /** `[i, j]`: entry i's compressed size reaches over entry j's header and data. */
  overlap?: [number, number];
}

const UTF8 = 0x800;

function nameBytes(name: string, flags: number): Uint8Array {
  if (flags & UTF8) return new TextEncoder().encode(name);
  return Uint8Array.from(name, (c) => c.charCodeAt(0) & 0xff);
}

class Writer {
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

interface Laid {
  name: Uint8Array;
  localName: Uint8Array;
  flags: number;
  method: number;
  crc: number;
  size: number;
  packed: Uint8Array;
  compressedSize: number;
  extra: Uint8Array;
  offset: number;
}

export function makeZip(entries: MakeEntry[], options: MakeOptions = {}): Uint8Array {
  const out = new Writer();
  const prefix = options.prefix ?? new Uint8Array(0);
  out.bytes(prefix);
  const laid: Laid[] = entries.map((e) => {
    const data = typeof e.data === 'string' ? new TextEncoder().encode(e.data) : e.data;
    const method = e.method ?? 8;
    const flags = e.flags ?? 0;
    const packed = e.raw ?? (method === 8 ? new Uint8Array(deflateRawSync(data)) : data);
    return {
      name: nameBytes(e.name, flags),
      localName: nameBytes(e.localName ?? e.name, flags),
      flags,
      method,
      crc: e.declaredCrc ?? crc32(data),
      size: e.declaredSize ?? data.length,
      packed,
      compressedSize: packed.length,
      extra: e.extra ?? new Uint8Array(0),
      offset: 0,
    };
  });
  for (const e of laid) {
    e.offset = out.length;
    out.u32(0x04034b50);
    out.u16(20); // version needed to extract
    out.u16(e.flags);
    out.u16(e.method);
    out.u16(0); // time
    out.u16(0x21); // date: 1980-01-01
    out.u32(e.crc);
    out.u32(e.compressedSize);
    out.u32(e.size);
    out.u16(e.localName.length);
    out.u16(e.extra.length);
    out.bytes(e.localName);
    out.bytes(e.extra);
    out.bytes(e.packed);
  }
  if (options.overlap) {
    const [i, j] = options.overlap;
    const a = laid[i];
    const b = laid[j];
    if (!a || !b) throw new Error('overlap: no such entry');
    const aData = a.offset + 30 + a.localName.length + a.extra.length;
    const bEnd = b.offset + 30 + b.localName.length + b.extra.length + b.compressedSize;
    a.compressedSize = bEnd - aData;
  }
  const cdOffset = out.length;
  for (const e of laid) {
    out.u32(0x02014b50);
    out.u16(0x031e); // made by: Unix, 3.0
    out.u16(20);
    out.u16(e.flags);
    out.u16(e.method);
    out.u16(0);
    out.u16(0x21);
    out.u32(e.crc);
    out.u32(e.compressedSize);
    out.u32(e.size);
    out.u16(e.name.length);
    out.u16(e.extra.length);
    out.u16(0); // comment length
    out.u16(0); // disk number start
    out.u16(0); // internal attributes
    out.u32(0); // external attributes
    out.u32(e.offset);
    out.bytes(e.name);
    out.bytes(e.extra);
  }
  const cdSize = out.length - cdOffset;
  if (options.zip64Locator) {
    out.u32(0x07064b50);
    out.u32(0); // disk with the zip64 end record
    out.u32(0); // its offset (never read: the locator alone refuses the archive)
    out.u32(0);
    out.u32(1); // total disks
  }
  const comment = new TextEncoder().encode(options.comment ?? '');
  out.u32(0x06054b50);
  out.u16(options.disk ?? 0);
  out.u16(options.disk ?? 0);
  out.u16(laid.length);
  out.u16(laid.length);
  out.u32(cdSize);
  out.u32(cdOffset);
  out.u16(comment.length);
  out.bytes(comment);
  return out.done();
}

/**
 * A raw deflate stream (one fixed-Huffman block, RFC 1951 §3.2.6) that inflates to `1 + 258 * (1 +
 * 8 * groups)` zero bytes: a literal 0, then copies of 258 bytes from one back. About 13 bytes per
 * 2 KB of output, so a gigabyte of zeros is under 7 MB, built without making the gigabyte.
 */
export function zeroBomb(groups: number): { packed: Uint8Array; size: number } {
  let acc = 0;
  let nAcc = 0;
  const bytes: number[] = [];
  const put = (value: number, n: number) => {
    for (let i = 0; i < n; i++) {
      acc |= ((value >>> i) & 1) << nAcc;
      if (++nAcc === 8) {
        bytes.push(acc);
        acc = 0;
        nAcc = 0;
      }
    }
  };
  // A Huffman code is sent from its most significant bit.
  const code = (value: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) put((value >>> i) & 1, 1);
  };
  const copy = () => {
    code(0b11000101, 8); // length symbol 285: 258 bytes, no extra bits
    code(0, 5); // distance symbol 0: one back
  };
  put(1, 1); // final block
  put(1, 2); // fixed Huffman
  code(0b00110000, 8); // literal 0
  copy(); // 24 bits so far: byte-aligned
  const group: number[] = [];
  const before = bytes.length;
  for (let i = 0; i < 8; i++) copy(); // 104 bits: exactly 13 bytes
  group.push(...bytes.splice(before));
  const head = bytes.splice(0);
  code(0, 7); // end of block
  const tail = nAcc ? [...bytes, acc] : bytes;
  const packed = new Uint8Array(head.length + group.length * groups + tail.length);
  packed.set(head, 0);
  for (let g = 0; g < groups; g++) packed.set(group, head.length + g * group.length);
  packed.set(tail, head.length + group.length * groups);
  return { packed, size: 1 + 258 * (1 + 8 * groups) };
}
