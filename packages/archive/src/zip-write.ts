// A small zip writer, from APPNOTE.TXT, for the files Drafter makes (an EPUB): every entry stored,
// never compressed, so its bytes sit in the archive as they are. A local file header before each
// entry's data, a central file header for each, and the end of central directory record. Names are
// UTF-8 with flag bit 11 (the language-encoding flag) set in both headers. No extra fields, no data
// descriptors, no comment, and a fixed date (1980-01-01, the earliest a zip can say), so the same
// entries always make the same bytes. Not zip64: an archive past 4 GiB or 65,535 entries is refused.
import { crc32 } from './crc32';
import { safeName } from './zip';

export interface ZipWriteEntry {
  /** The entry's name inside the archive: a relative path, `/` between its parts. */
  name: string;
  data: Uint8Array;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const LOCAL_SIZE = 30;
const CENTRAL_SIZE = 46;
const END_SIZE = 22;
/** 2.0: the version a stored entry with a directory in its name needs. */
const VERSION = 20;
const FLAG_UTF8 = 0x0800;
/** 1980-01-01 00:00:00 as MS-DOS writes a date: day 1, month 1, year 0 (1980); time 0. */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

/** The most bytes a name may take: its length is a 16-bit field in both headers. */
const MAX_NAME_BYTES = 0xffff;

/**
 * Whether a name may be written: everything the archive's own reader asks (`safeName`: not empty,
 * not absolute, no drive letter, backslash, control character, line or paragraph separator, bidi
 * control, or `..` part), and besides no empty part and no lone surrogate (which UTF-8 cannot
 * carry, so the name would come back changed). So an unpacker is never led outside its folder,
 * and the writer never makes an archive its reader refuses.
 */
function checkName(name: string, encoded: Uint8Array): void {
  if (
    !safeName(name) ||
    name.split('/').slice(0, -1).includes('') ||
    /[\uD800-\uDFFF]/u.test(name)
  ) {
    throw new RangeError(`Not a name a zip may hold: ${JSON.stringify(name.slice(0, 80))}`);
  }
  if (encoded.length > MAX_NAME_BYTES) {
    throw new RangeError(`A name too long for a zip: ${encoded.length} bytes`);
  }
}

/**
 * The entries as one zip archive, in the order given, each stored (method 0). The first entry's
 * data starts at byte 30 plus its name's length, as an EPUB's `mimetype` must. Throws a RangeError
 * for a name `checkName` refuses, two entries whose names differ at most by case (a case-blind disk
 * would unpack them onto one file), or an archive too big for a plain zip.
 */
export function zipStored(entries: readonly ZipWriteEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  const items = entries.map((entry) => {
    const name = encoder.encode(entry.name);
    checkName(entry.name, name);
    const folded = entry.name.toLowerCase();
    if (seen.has(folded)) throw new RangeError(`Two entries named ${entry.name}`);
    seen.add(folded);
    return { name, data: entry.data, crc: crc32(entry.data) };
  });
  if (items.length > 0xfffe) throw new RangeError('Too many entries for a zip');

  let localTotal = 0;
  let centralTotal = 0;
  for (const item of items) {
    localTotal += LOCAL_SIZE + item.name.length + item.data.length;
    centralTotal += CENTRAL_SIZE + item.name.length;
  }
  const size = localTotal + centralTotal + END_SIZE;
  if (localTotal + centralTotal >= 0xffffffff) throw new RangeError('Too big for a zip');

  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let at = 0;
  const u16 = (n: number) => {
    view.setUint16(at, n, true);
    at += 2;
  };
  const u32 = (n: number) => {
    view.setUint32(at, n >>> 0, true);
    at += 4;
  };
  const put = (bytes: Uint8Array) => {
    out.set(bytes, at);
    at += bytes.length;
  };

  const offsets: number[] = [];
  for (const item of items) {
    offsets.push(at);
    u32(SIG_LOCAL);
    u16(VERSION);
    u16(FLAG_UTF8);
    u16(0); // stored
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(item.crc);
    u32(item.data.length);
    u32(item.data.length);
    u16(item.name.length);
    u16(0); // no extra field
    put(item.name);
    put(item.data);
  }

  const directory = at;
  items.forEach((item, i) => {
    u32(SIG_CENTRAL);
    u16(VERSION); // made by: MS-DOS (0), 2.0
    u16(VERSION);
    u16(FLAG_UTF8);
    u16(0);
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(item.crc);
    u32(item.data.length);
    u32(item.data.length);
    u16(item.name.length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(offsets[i] as number);
    put(item.name);
  });

  const directorySize = at - directory;
  u32(SIG_END);
  u16(0);
  u16(0);
  u16(items.length);
  u16(items.length);
  u32(directorySize);
  u32(directory);
  u16(0); // no comment
  return out;
}
