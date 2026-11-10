// The trap documents: deliberately broken and hostile files for every format Drafter opens or
// imports, each with the one outcome every entry point must give it. This file is the manifest and
// the generator at once: a trap's bytes are a committed file under `files/` (small, readable text)
// or made here, deterministically, when a test asks (anything large, binary, or packed). Every
// byte is the suite's own (docs/clean-room.md): no fixture, sample, or test file of another app,
// converter, or corpus. Element and attribute names are Drafter's own readers' (packages/fdx).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, gzipSync } from 'node:zlib';
import { SOURCE_ENTRY, sourceElement } from '../../packages/archive/src/reopen';
import { type CutEntry, cutsFile } from '../../packages/history/src/cuts-file';
import { draftFile } from '../../packages/history/src/draft-file';
import { CAPS } from '../../packages/production/src/block';
import type { Entry } from './entry-points';
import { SYMLINK_ATTRS, type TrapEntry, trapZip } from './zip';

export type Format =
  | 'text'
  | 'fountain'
  | 'markdown'
  | 'fdx'
  | 'highland'
  | 'fadein'
  | 'html'
  | 'epub'
  | 'files'
  | 'modules'
  | 'cuts'
  | 'draft';

/**
 * What an entry point must do with a trap. `opens`: the script opens, its text exactly `text`, or
 * holding every one of `lines`, or `chars` long. `refused`: nothing opens, and the message holds
 * `says`. `opens-with-warning`: it opens, and a message (a note count, a notice) holds `says`.
 */
export type Outcome =
  | { kind: 'opens'; text?: string; lines?: readonly string[]; chars?: number }
  | { kind: 'refused'; says: string }
  | {
      kind: 'opens-with-warning';
      says: string;
      text?: string;
      lines?: readonly string[];
      chars?: number;
    };

export interface Trap {
  id: string;
  format: Format;
  /** The file's name, as it is opened. */
  name: string;
  /** What it tests, in a sentence. */
  tests: string;
  /** Its bytes; generated when it is large or binary, else read from `files/`. */
  bytes?: () => Uint8Array;
  /** A special file (a pipe, a link, a folder) made in `dir`; returns its path. POSIX only. */
  place?: (dir: string) => string;
  /** The outcome at each entry point it goes through: its keys are the entry points. */
  expect: Partial<Record<Entry, Outcome>>;
  /** Its text, opened, is written into an HTML export too, which must hold nothing live. */
  inert?: boolean;
  /** The time it may take at one entry point, in ms (default `LIMIT_MS`). */
  limitMs?: number;
  /** Generated at test time because it is large (over 1 MB). */
  large?: boolean;
  /** Entry points it would go through by default and is kept out of, each with the reason. */
  keptOut?: Partial<Record<Entry, string>>;
  /** What it opens as, where its name doesn't say: a Drafter export whose block is Markdown. */
  opensAs?: 'fountain' | 'markdown';
  /**
   * The memory it may take at one entry point, in MB, when a parser's own tree makes the default
   * (a few copies of its bytes) too small; see docs/DEFERRED.md for the Markdown parser's.
   */
  memoryMB?: number;
  /** For the `novel` entry point: the structure it must find, and that it makes a move. */
  novel?: { parts: number; chapters: number; sections: number; moves: boolean };
  /**
   * For the `manuscript` entry point: the details the writer gave (a title, contact lines), which
   * go into the manuscript as they are, and how many chapters the book holds.
   */
  manuscript?: { details?: Record<string, unknown>; chapters: number };
  /**
   * For the `production` entry point: the block must read as a lock, its baseline decoded. Only the
   * well-formed control says so; every other trap through it must leave the script unlocked.
   */
  locked?: boolean;
}

/** The time one trap may take at one entry point, by default. */
export const LIMIT_MS = 2000;

export const KiB = 1024;
export const MiB = 1024 * 1024;
/** The caps the traps sit either side of: a script's text, an archive or export, an entry. */
export const SCRIPT_CAP = 5 * MiB;
export const ARCHIVE_CAP = 32 * MiB;
export const DESKTOP_READ_CAP = 64 * MiB;
export const MANIFEST_CAP = 64 * KiB;

// ---- Outcomes ----------------------------------------------------------------------------------

export const opens = (text?: string, more: { lines?: string[]; chars?: number } = {}): Outcome => ({
  kind: 'opens',
  ...(text === undefined ? {} : { text }),
  ...more,
});
export const opensWith = (...lines: string[]): Outcome => ({ kind: 'opens', lines });
export const refused = (says: string): Outcome => ({ kind: 'refused', says });
export const warns = (
  says: string,
  more: { text?: string; lines?: string[]; chars?: number } = {},
): Outcome => ({ kind: 'opens-with-warning', says, ...more });

/** The messages, as the app and the command line say them (the phrase each holds). */
export const SAYS = {
  binary: 'holds more than text',
  notUtf8: 'isn’t UTF-8 text',
  tooBig: 'too big to be a script (over 5 MB)',
  importTooBig: 'script in this file is too big (over 5 MB)',
  unreadable: 'too big to open (over 32 MB)',
  pdf: 'Drafter can’t open a PDF',
  packed: 'a Word, OpenDocument, or other packed file',
  webPage: 'Drafter can’t open a web page',
  eBook: 'Drafter can’t open an e-book',
  ole: 'an older Office or Final Draft file',
  rtf: 'an RTF document',
  note: 'came in as a note',
  notes: 'items came in as notes',
  fdx: (reason: string) => `This isn’t a Final Draft file: ${reason}`,
  highland: (reason: string) => `This isn’t a Highland file Drafter can read: ${reason}`,
  fadeIn: (reason: string) => `This isn’t a Fade In file Drafter can read: ${reason}`,
  notAFile: 'it isn’t a file',
  notAScript: 'it isn’t a script',
  cliTooBig: 'it is larger than 5 MB',
  cliNotAFile: 'it isn’t a file',
  cliCantRead: 'can’t read it',
  /** Drafter for Claude's words for the caps (Open's are above; a script over 5 MB, the CLI's). */
  mcpImportTooBig: 'the script in it is larger than 5 MB',
  mcpUnreadable: 'it is larger than 32 MB',
  /** Nothing opens and nothing is said: a command line's flag, not a file. */
  silent: '',
} as const;

// ---- Bytes -------------------------------------------------------------------------------------

const utf8 = new TextEncoder();
const enc = (text: string) => utf8.encode(text);
/** The committed fixtures. A path, not a URL: a jsdom test's global URL isn't Node's. */
const FILES = join(dirname(fileURLToPath(import.meta.url)), 'files');
const file = (path: string) => (): Uint8Array => new Uint8Array(readFileSync(join(FILES, path)));
const text = (path: string) => new TextDecoder().decode(file(path)());

const concat = (...parts: (Uint8Array | string | number[])[]): Uint8Array => {
  const chunks = parts.map((p) =>
    typeof p === 'string' ? enc(p) : Array.isArray(p) ? Uint8Array.from(p) : p,
  );
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
};

/** `size` bytes: `head`, then `fill` repeated, then `tail`. */
function sized(size: number, head: string, fill: string, tail = ''): Uint8Array {
  const out = new Uint8Array(size);
  const h = enc(head);
  const t = enc(tail);
  const f = enc(fill);
  out.set(h, 0);
  for (let at = h.length; at < size - t.length; at++)
    out[at] = f[(at - h.length) % f.length] as number;
  out.set(t, size - t.length);
  return out;
}

const SCRIPT = 'Title: The Signal Box\n\nINT. SIGNAL BOX - NIGHT\n\nA lever waits.\n';
const SCRIPT_LINES = ['INT. SIGNAL BOX - NIGHT', 'A lever waits.'];
const NOTES = '# The Signal Box\n\nA lever waits, and a *bell* rings.\n';

/** UTF-16 with its BOM, little- or big-endian. */
function utf16(textIn: string, big: boolean): Uint8Array {
  const out = new Uint8Array(2 + textIn.length * 2);
  out[0] = big ? 0xfe : 0xff;
  out[1] = big ? 0xff : 0xfe;
  for (let i = 0; i < textIn.length; i++) {
    const c = textIn.charCodeAt(i);
    out[2 + i * 2] = big ? c >> 8 : c & 0xff;
    out[3 + i * 2] = big ? c & 0xff : c >> 8;
  }
  return out;
}

/** A Windows executable's first bytes: "MZ", the DOS header's fields, and its stub's message. */
const EXE = () =>
  concat(
    [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0, 0],
    new Uint8Array(48),
    'This program cannot be run in DOS mode.\r\r\n$',
  );
/** A PNG's signature and the start of its IHDR chunk. */
const PNG = () =>
  concat(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52],
    [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0],
  );
/** The start of a PDF, as text: its header, one object, and an end marker. */
const PDF = () =>
  enc(
    '%PDF-1.4\n%\u00e2\u00e3\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
  );

// ---- FDX and OSF -------------------------------------------------------------------------------

const FD = '<FinalDraft DocumentType="Script" Template="No" Version="5">';
const fdx = (content: string, before = '') =>
  `<?xml version="1.0"?>\n${before}${FD}<Content>${content}</Content></FinalDraft>\n`;
const para = (type: string, body: string) =>
  `<Paragraph Type="${type}"><Text>${body}</Text></Paragraph>`;

const osfPara = (style: string, body: string) =>
  `<para><style basestyle="${style}"/><text>${body}</text></para>`;
const OSF = `<?xml version="1.0" encoding="UTF-8"?>
<document type="Open Screenplay Format document" version="40">
  <paragraphs>
    ${osfPara('Scene Heading', 'INT. SIGNAL BOX - NIGHT')}
    ${osfPara('Action', 'A lever waits.')}
  </paragraphs>
</document>
`;

// ---- Zips --------------------------------------------------------------------------------------

const highland = (entries: TrapEntry[], options?: Parameters<typeof trapZip>[1]) => () =>
  trapZip(entries, options);
const TEXT_ENTRY: TrapEntry = { name: 'text.fountain', data: SCRIPT };
const INFO: TrapEntry = { name: 'info.json', data: '{"version":1}' };

/** A deflate stream that inflates to `size` zero bytes, as a bomb is made. */
const zeros = (size: number) => deflateRawSync(new Uint8Array(size), { level: 9 });

/** An EPUB: `mimetype` first and stored, a container, a page, and `more` entries. */
function epub(more: TrapEntry[], options: { first?: TrapEntry[]; mimetype?: string } = {}) {
  return (): Uint8Array =>
    trapZip([
      ...(options.first ?? []),
      { name: 'mimetype', data: options.mimetype ?? 'application/epub+zip', method: 0 },
      {
        name: 'META-INF/container.xml',
        data: '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      },
      {
        name: 'EPUB/page.xhtml',
        data: '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Page</title></head><body><p>A page.</p></body></html>',
      },
      ...more,
    ]);
}
const source = (
  kind: 'fountain' | 'markdown',
  data: string | Uint8Array,
  extra: Partial<TrapEntry> = {},
) => ({
  name: SOURCE_ENTRY[kind],
  data,
  ...extra,
});

// ---- HTML --------------------------------------------------------------------------------------

/** A page like a Drafter export: a doctype, a head, and `body`. */
const page = (body: string, head = '') =>
  `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>The Signal Box</title>\n${head}</head>\n<body>\n${body}\n</body>\n</html>\n`;
const block = (textIn: string, kind: 'fountain' | 'markdown' = 'fountain') =>
  sourceElement(kind, textIn);
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const rawBlock = (kind: string, body: string) =>
  `<script type="text/plain" id="drafter-source" data-kind="${kind}" data-encoding="base64">\n${body}\n</script>`;

const HOSTILE_HEAD = `<meta http-equiv="refresh" content="0; url=https://example.invalid/">
<link rel="stylesheet" href="https://example.invalid/trap.css">
<script src="https://example.invalid/trap.js"></script>
<script>window.__trapped = 'page-script'; fetch('https://example.invalid/beacon');</script>
`;
const HOSTILE_BODY = `<iframe src="https://example.invalid/frame"></iframe>
<img src="https://example.invalid/pixel.png" onerror="window.__trapped = 'img'">
<object data="https://example.invalid/x.swf"></object>
<form action="https://example.invalid/steal"><input name="x"></form>
<a href="javascript:window.__trapped='link'">Open</a>`;

// ---- Text traps for each text format ----------------------------------------------------------

type TextKind = { ext: string; format: Format; name: string };
const TEXT_KINDS: readonly TextKind[] = [
  { ext: 'fountain', format: 'fountain', name: 'Fountain' },
  { ext: 'md', format: 'markdown', name: 'Markdown' },
  { ext: 'txt', format: 'text', name: 'plain text' },
];

const BIDI = '\u202e';
/** 9,000 bytes of text, then a NUL past the first 8 KB, then a line break. */
const NUL_LATE = concat(sized(9000, 'Title: Late Nul\n\n', 'A lever waits. '), [0], '\n');
const FLOOD = `Title: Z${'\u0301'.repeat(200_000)}\n\nINT. HALL - DAY\n\nA${'\u0308'.repeat(200_000)}\n`;
const LONG = `INT. ${'VERY '.repeat(40_000)}LONG HALL - DAY\n\n${'W'.repeat(200_000)}\nA lever waits.\n`;
const ZW = '\u200b\u200d\ufeff';

// For the story map (Task 7): sizes a story map must draw in time, with every name escaped.
/** A speaker with a 100,000-character name, introduced in capitals and speaking in three scenes. */
const HUGE_NAME = (() => {
  const name = `QUILL${'LONGNAME'.repeat(12_500)}`;
  const scene = (n: number) =>
    `INT. LAMP ROOM ${n} - NIGHT\n\n${name} (40s), a keeper, climbs the stairs.\n\n${name}\nSomebody has to keep the lamp lit all night.\n\nPIM\nThen let it be somebody else for once.\n\n`;
  return `Title: The Long Name\n\n${scene(1)}${scene(2)}${scene(3)}`;
})();
/** A marked speech of 10,000 characters: a line of dialogue far past the length rule. */
const LONG_SPEECH = `Title: The Long Speech\n\nINT. HALL - DAY\n\nA lever waits.\n\nWREN\n${'ring '.repeat(1_999)}ring!\n[[Quote]]\n\nPIM\nThen ring it once more for luck.\n`;
/** One name said 50,000 times in one paragraph, and speaking a thousand times. */
const SAID_OFTEN = `Title: Echo\n\nINT. HALL - DAY\n\n${'WREN '.repeat(50_000)}waits.\n\n${'WREN\nAgain and again, the same old bell.\n\n'.repeat(1_000)}`;

/** The traps every text format shares, for one of them. */
function textTraps({ ext, format, name }: TextKind): Trap[] {
  const id = (s: string) => `${ext}-${s}`;
  const n = (s: string) => `${s}.${ext}`;
  const sample = ext === 'md' ? NOTES : SCRIPT;
  const markdown = ext === 'md';
  return [
    {
      id: id('empty'),
      format,
      name: n('empty'),
      tests: `A 0-byte ${name} file opens as an empty script.`,
      bytes: () => new Uint8Array(),
      expect: { 'web-open': opens('') },
    },
    {
      id: id('whitespace'),
      format,
      name: n('whitespace'),
      tests: `A ${name} file of spaces, tabs, and blank lines opens exactly.`,
      bytes: () => enc(' \t \n\n   \n\t\n'),
      expect: { 'web-open': opens(' \t \n\n   \n\t\n') },
    },
    {
      id: id('bom'),
      format,
      name: n('bom'),
      tests: 'A UTF-8 byte order mark is taken off, not shown.',
      bytes: () => concat([0xef, 0xbb, 0xbf], sample),
      expect: { 'web-open': opens(sample) },
    },
    {
      id: id('utf16le'),
      format,
      name: n('utf16le'),
      tests: 'UTF-16 (little-endian, with its BOM) is refused as not UTF-8, not opened as garbage.',
      bytes: () => utf16(sample, false),
      expect: { 'web-open': refused(SAYS.notUtf8) },
    },
    {
      id: id('utf16be'),
      format,
      name: n('utf16be'),
      tests: 'UTF-16 (big-endian, with its BOM) is refused as not UTF-8.',
      bytes: () => utf16(sample, true),
      expect: { 'web-open': refused(SAYS.notUtf8) },
    },
    {
      id: id('invalid-utf8'),
      format,
      name: n('invalid-utf8'),
      tests:
        'Bytes that are not UTF-8 (Latin-1 é, a lone continuation byte) are refused, so saving can’t change them.',
      bytes: () => concat('Title: Caf', [0xe9], '\n\nINT. ', [0x80], 'HALL\n'),
      expect: { 'web-open': refused(SAYS.notUtf8), 'cli-build': opens() },
    },
    {
      id: id('nul-early'),
      format,
      name: n('nul-early'),
      tests: 'A NUL byte near the start means it isn’t text.',
      bytes: () => concat('Title: Nul\n\n', [0], 'INT. HALL\n'),
      expect: { 'web-open': refused(SAYS.binary) },
    },
    {
      id: id('nul-late'),
      format,
      name: n('nul-late'),
      tests:
        'A NUL byte past the first 8 KB opens, as Open’s 8 KB rule allows (docs/DEFERRED.md asks whether it should).',
      bytes: () => NUL_LATE,
      expect: { 'web-open': opens(new TextDecoder().decode(NUL_LATE)) },
    },
    {
      id: id('cr-only'),
      format,
      name: n('cr-only'),
      tests: 'Old Mac line breaks (CR alone) become line feeds.',
      bytes: () => enc(sample.replace(/\n/g, '\r')),
      expect: { 'web-open': opens(sample) },
    },
    {
      id: id('mixed-breaks'),
      format,
      name: n('mixed-breaks'),
      tests: 'CRLF, CR, and LF in one file all become line feeds.',
      bytes: () => enc('Title: Mixed\r\n\rINT. HALL - DAY\n\r\nA lever waits.\r'),
      expect: { 'web-open': opens('Title: Mixed\n\nINT. HALL - DAY\n\nA lever waits.\n') },
    },
    {
      id: id('10mb-line'),
      format,
      name: n('10mb-line'),
      tests: 'A 10 MB file of one line is refused by size before it is decoded.',
      bytes: () => sized(10 * MiB, '', 'a'),
      expect: { 'web-open': refused(SAYS.tooBig), 'cli-build': refused(SAYS.cliTooBig) },
      large: true,
    },
    {
      id: id('at-cap'),
      format,
      name: n('at-cap'),
      tests: 'A file of exactly 5 MB, the cap, opens.',
      bytes: () =>
        sized(
          SCRIPT_CAP,
          markdown ? '# At the Cap\n\n' : 'Title: At the Cap\n\n',
          'A lever waits.\n',
        ),
      expect: { 'web-open': opens(undefined, { chars: SCRIPT_CAP }) },
      large: true,
      limitMs: 10_000,
      memoryMB: 1024,
    },
    {
      id: id('over-cap'),
      format,
      name: n('over-cap'),
      tests: 'A file one byte over 5 MB is refused.',
      bytes: () => sized(SCRIPT_CAP + 1, 'Title: Over the Cap\n\n', 'A lever waits.\n'),
      expect: { 'web-open': refused(SAYS.tooBig), 'cli-build': refused(SAYS.cliTooBig) },
      large: true,
    },
    {
      id: id('bidi-zero-width'),
      format,
      name: n('bidi-zero-width'),
      tests:
        'Zero-width and bidi-override characters in a title and a character name are kept as they are.',
      bytes: () =>
        enc(
          markdown
            ? `# The ${BIDI}xob langiS${ZW}\n\n${BIDI}WREN${ZW}: a lever waits.\n`
            : `Title: The ${BIDI}xob langiS${ZW}\n\nINT. HALL - DAY\n\n${BIDI}WREN${ZW}\nA lever waits.\n`,
        ),
      expect: {
        'web-open': opens(
          markdown
            ? `# The ${BIDI}xob langiS${ZW}\n\n${BIDI}WREN${ZW}: a lever waits.\n`
            : `Title: The ${BIDI}xob langiS${ZW}\n\nINT. HALL - DAY\n\n${BIDI}WREN${ZW}\nA lever waits.\n`,
        ),
      },
      inert: true,
    },
    {
      id: id('combining-flood'),
      format,
      name: n('combining-flood'),
      tests: 'A letter carrying 200,000 combining marks opens without stalling.',
      bytes: () => enc(FLOOD),
      expect: { 'web-open': opens(FLOOD) },
      inert: true,
    },
    {
      id: id('emoji'),
      format,
      name: n('emoji'),
      tests: 'Emoji, flags, skin tones, and joined families open exactly.',
      bytes: () =>
        enc(
          `Title: 🚂 The Signal Box 🇬🇧\n\nINT. HALL - DAY\n\n👩🏽‍🔧 WREN pulls a lever. 👨‍👩‍👧‍👦\n`,
        ),
      expect: {
        'web-open': opens(
          `Title: 🚂 The Signal Box 🇬🇧\n\nINT. HALL - DAY\n\n👩🏽‍🔧 WREN pulls a lever. 👨‍👩‍👧‍👦\n`,
        ),
      },
      inert: true,
    },
    {
      id: id('long-heading'),
      format,
      name: n('long-heading'),
      tests: 'A 200,000-character scene heading and character name open without stalling.',
      bytes: () => enc(LONG),
      expect: { 'web-open': opens(LONG) },
      inert: true,
    },
    {
      id: id('exe'),
      format,
      name: n('program'),
      tests: `A Windows program renamed .${ext} is refused as not text.`,
      bytes: EXE,
      expect: { 'web-open': refused(SAYS.binary) },
    },
    {
      id: id('png'),
      format,
      name: n('picture'),
      tests: `A PNG renamed .${ext} is refused as not text.`,
      bytes: PNG,
      expect: { 'web-open': refused(SAYS.binary) },
    },
    {
      id: id('pdf'),
      format,
      name: n('printed'),
      tests: `A PDF renamed .${ext} is named a PDF, by its first bytes, by Open and by Drafter for Claude alike.`,
      bytes: PDF,
      expect: { 'web-open': refused(SAYS.pdf) },
    },
  ];
}

// ---- Every trap --------------------------------------------------------------------------------

const FOUNTAIN_TRAPS: Trap[] = [
  {
    id: 'fountain-title-page-html',
    format: 'fountain',
    name: 'title-page-html.fountain',
    tests:
      '<script>, <img onerror>, a javascript: link, and an HTML comment on the title page stay text.',
    bytes: file('fountain/title-page-html.fountain'),
    expect: { 'web-open': opens(text('fountain/title-page-html.fountain')) },
    inert: true,
  },
  {
    id: 'fountain-action-html',
    format: 'fountain',
    name: 'action-html.fountain',
    tests:
      'Script, image, link, iframe, style, and comment markup in action and dialogue stays text.',
    bytes: file('fountain/action-html.fountain'),
    expect: { 'web-open': opens(text('fountain/action-html.fountain')) },
    inert: true,
  },
  {
    id: 'fountain-notes-html',
    format: 'fountain',
    name: 'notes-html.fountain',
    tests: 'Markup inside notes and a boneyard stays text.',
    bytes: file('fountain/notes-html.fountain'),
    expect: { 'web-open': opens(text('fountain/notes-html.fountain')) },
    inert: true,
  },
  {
    id: 'fountain-unclosed-boneyard',
    format: 'fountain',
    name: 'unclosed-boneyard.fountain',
    tests: 'A /* that is never closed opens; the rest is hidden, not lost.',
    bytes: file('fountain/unclosed-boneyard.fountain'),
    expect: { 'web-open': opens(text('fountain/unclosed-boneyard.fountain')) },
  },
  {
    id: 'fountain-unclosed-note',
    format: 'fountain',
    name: 'unclosed-note.fountain',
    tests: 'A [[ that is never closed opens as text.',
    bytes: file('fountain/unclosed-note.fountain'),
    expect: { 'web-open': opens(text('fountain/unclosed-note.fountain')) },
  },
  {
    id: 'fountain-nested-emphasis',
    format: 'fountain',
    name: 'nested-emphasis.fountain',
    tests: 'Ten thousand nested emphasis markers open, parse, and export in time.',
    bytes: () =>
      enc(
        `Title: Nested\n\nINT. HALL - DAY\n\n${'*_**'.repeat(2500)}lever${'**_*'.repeat(2500)}\n\n${'*'.repeat(10_000)}\n`,
      ),
    expect: { 'web-open': opensWith('INT. HALL - DAY') },
    inert: true,
  },
  {
    id: 'fountain-unbalanced-emphasis',
    format: 'fountain',
    name: 'unbalanced-emphasis.fountain',
    tests: 'Ten thousand openers with no closers parse in linear time.',
    bytes: () => enc(`INT. HALL - DAY\n\n${'*a _b **c '.repeat(10_000)}\n`),
    expect: { 'web-open': opensWith('INT. HALL - DAY') },
    inert: true,
  },
  {
    id: 'fountain-10000-keys',
    format: 'fountain',
    name: 'many-keys.fountain',
    tests: 'A title page with 10,000 keys opens in time.',
    bytes: () =>
      enc(
        `${Array.from({ length: 10_000 }, (_, i) => `Key${i}: Value ${i}`).join('\n')}\n\nINT. HALL - DAY\n\nA lever waits.\n`,
      ),
    expect: { 'web-open': opensWith('Key9999: Value 9999', 'A lever waits.') },
  },
  {
    id: 'fountain-meta-malformed',
    format: 'fountain',
    name: 'meta-malformed.fountain',
    tests: 'A Drafter metadata block that isn’t JSON opens, and is kept as written.',
    bytes: file('fountain/meta-malformed.fountain'),
    expect: { 'web-open': opens(text('fountain/meta-malformed.fountain')) },
  },
  {
    id: 'fountain-meta-duplicated',
    format: 'fountain',
    name: 'meta-duplicated.fountain',
    tests: 'Two metadata blocks, one with a __proto__ key, open without polluting anything.',
    bytes: file('fountain/meta-duplicated.fountain'),
    expect: { 'web-open': opens(text('fountain/meta-duplicated.fountain')) },
  },
  {
    id: 'fountain-meta-hostile',
    format: 'fountain',
    name: 'meta-hostile-values.fountain',
    tests: 'A metadata block of wrong types, an unknown version, and markup in the template opens.',
    bytes: file('fountain/meta-hostile-values.fountain'),
    expect: { 'web-open': opens(text('fountain/meta-hostile-values.fountain')) },
    inert: true,
  },
  {
    id: 'fountain-meta-huge',
    format: 'fountain',
    name: 'meta-huge.fountain',
    tests: 'A 3 MB metadata block opens in time.',
    bytes: () =>
      enc(
        `Title: Huge Block\n\nINT. HALL - DAY\n\nA lever waits.\n\n/* drafter\n{"v":1,"template":"us-screenplay","x":"${'y'.repeat(3 * MiB)}"}\n*/\n`,
      ),
    expect: { 'web-open': opensWith('A lever waits.') },
    large: true,
    limitMs: 5000,
  },
  {
    id: 'fountain-many-boneyards',
    format: 'fountain',
    name: 'many-boneyards.fountain',
    tests: '50,000 boneyard openers and closers in a row parse in time.',
    bytes: () => enc(`INT. HALL - DAY\n\n${'/* */ '.repeat(25_000)}${'/*'.repeat(25_000)}\n`),
    expect: { 'web-open': opensWith('INT. HALL - DAY') },
  },
  {
    id: 'fountain-many-notes',
    format: 'fountain',
    name: 'many-notes.fountain',
    tests: '50,000 note openers with no closers parse in time.',
    bytes: () => enc(`INT. HALL - DAY\n\n${'[[ '.repeat(50_000)}\n`),
    expect: { 'web-open': opensWith('INT. HALL - DAY') },
    // `build` prints all 50,000 warnings.
    memoryMB: 512,
  },
  {
    id: 'fountain-is-fdx',
    format: 'fountain',
    name: 'final-draft.fountain',
    tests: 'A Final Draft file named .fountain opens as the text it is (Fountain reads any text).',
    bytes: file('fdx/valid.fdx'),
    expect: { 'web-open': opens(text('fdx/valid.fdx')) },
  },
  {
    id: 'fountain-is-highland',
    format: 'fountain',
    name: 'packed.fountain',
    tests:
      'A Highland zip named .fountain is named a packed file, by its first bytes, by Open and by Drafter for Claude alike.',
    bytes: highland([TEXT_ENTRY]),
    expect: { 'web-open': refused(SAYS.packed) },
  },
  {
    id: 'fountain-is-rtf',
    format: 'fountain',
    name: 'rich.fountain',
    tests:
      'An RTF document named .fountain is named an RTF document, by its first bytes, by Open and by Drafter for Claude alike.',
    bytes: () => enc('{\\rtf1\\ansi INT. HALL - DAY\\par A lever waits.}'),
    expect: { 'web-open': refused(SAYS.rtf) },
  },
  {
    id: 'fountain-is-ole',
    format: 'fountain',
    name: 'older.fountain',
    tests:
      'An OLE compound file (an older Office or Final Draft file) named .fountain is named so, by Open and by Drafter for Claude alike.',
    bytes: () => concat([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], new Uint8Array(504)),
    expect: { 'web-open': refused(SAYS.ole) },
  },
  {
    id: 'fountain-story-map-hostile',
    format: 'fountain',
    name: 'story-map-hostile.fountain',
    tests:
      'Markup, `]]>`, `</style>`, `</title>`, bidi overrides, U+2028, and a 5,000-character name in the title, logline, contact, names, places, summaries, a marked line, an edited hook from the metadata block, and threads stay text in the story map.',
    bytes: file('fountain/story-map-hostile.fountain'),
    expect: { 'web-open': opens(text('fountain/story-map-hostile.fountain')) },
    inert: true,
  },
  {
    id: 'fountain-story-map-huge-name',
    format: 'fountain',
    name: 'huge-name.fountain',
    tests:
      'A leading character with a 100,000-character name is drawn in the story map in time, whole and escaped.',
    bytes: () => enc(HUGE_NAME),
    expect: { 'web-open': opens(HUGE_NAME) },
    inert: true,
  },
  {
    id: 'fountain-story-map-long-line',
    format: 'fountain',
    name: 'long-line.fountain',
    tests:
      'A 10,000-character speech marked [[Quote]] is weighed as a line of dialogue in time, and left out.',
    bytes: () => enc(LONG_SPEECH),
    expect: { 'web-open': opens(LONG_SPEECH) },
    inert: true,
  },
  {
    id: 'fountain-story-map-said-often',
    format: 'fountain',
    name: 'said-often.fountain',
    tests:
      'One name said 50,000 times in a paragraph, and speaking 1,000 times, makes a story map in linear time.',
    bytes: () => enc(SAID_OFTEN),
    expect: { 'web-open': opens(SAID_OFTEN) },
    inert: true,
  },
  {
    id: 'fountain-is-export',
    format: 'fountain',
    name: 'export.fountain',
    tests:
      'A Drafter HTML export named .fountain is reopened by its content: the script inside opens, in Open and in Drafter for Claude alike.',
    bytes: () => enc(page(`<main>…</main>\n${block(SCRIPT)}`)),
    expect: { 'web-open': opens(SCRIPT) },
  },
];

// For Classic Mode (design §15.2): scripts shaped against its hidden marks, its caret, and the
// metadata block it keeps. Each opens exactly, and the `classic` harness walks it.
const CLASSIC_META = '/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/';
const ONLY_MARKS = `${['@@@@', '!!!!', '>>><<<', '~~~~', '....', '####', '====', '= =', '><', '**', '__', '^', '\\\\', '[[]]', '/**/', '()', '#1#'].join('\n\n')}\n`;
const UNCLOSED_FIRST = `/* never closed, from line 1\n\nA lever waits.\n\nJUNE\nIs it on?\n\n>CUT TO:\n`;
const UNCLOSED_NOTE = `INT. SIGNAL BOX - NIGHT\n\nA lever [[waits, and the note never closes.\n\nDALE\nIt's late.\n\n>CUT TO:\n`;
const BONEYARD_IN_NOTE = `INT. SIGNAL BOX - NIGHT\n\nA lever waits. [[A note /* with a boneyard */ inside it.]]\n\n@JUNE\nHello. [[/* and here */]]\n`;
const NOTE_ACROSS = `INT. SIGNAL BOX - NIGHT\n\nA lever [[a note\nthat runs\nacross three lines]] waits.\n\nJUNE\n[[one\nmore]]\nHello.\n`;
const META_DAMAGED = `INT. SIGNAL BOX - NIGHT\n\nA lever waits.\n\n/* drafter\n{"v":1,"template":\n*/\n`;
const META_NOT_LAST = `INT. SIGNAL BOX - NIGHT\n\nA lever waits.\n\n${CLASSIC_META}\n\nJUNE\nAfter the block.\n`;
const META_TWICE = `# ACT ONE\n\n## THE BOX\n\nA lever waits.\n\n${CLASSIC_META}\n\n${CLASSIC_META}\n`;
const CLASSIC_LONG_LINE = `INT. SIGNAL BOX - NIGHT\n\n!${'Lever. '.repeat(14_285)}\n\n@JUNE\n${'go '.repeat(33_333)}\n`;
const SPACES_HEADING = `INT.${' '.repeat(50_000)}SIGNAL BOX - NIGHT\n\n.${' '.repeat(50_000)}\n\nA lever waits.\n`;
const FORCED_MARKS = `${'!A\n\n'.repeat(50_000)}${'@B\nhi.\n\n'.repeat(50_000)}`;
const BIDI_EDGE = `!${BIDI}A lever waits.\n\n${BIDI}!A lever waits.\n\n@${BIDI}JUNE\nHello.\n\n>\u202dTHE END\u202c<\n\n**${BIDI}bold**\u202c and *\u2066it\u2069*\n\n~\u200fLa la\n`;
const COMBINING_EDGE = `!\u0301A lever waits.\n\n@\u0308JUNE\nHello.\n\n~\u0301La la\n\n>THE END<\u0301\n\n*\u0301it*\u0308 and **b\u0301**\n\n.\u0301FLASHBACK\n`;
const LIST_BREAKER_NAME = '<IMG SRC=X ONERROR=THROW>';
const LIST_BREAKER = `INT. ${LIST_BREAKER_NAME} - NIGHT\n\nA lever waits.\n\n${LIST_BREAKER_NAME}\nHello.\n\n@<img src=x onerror=window.__trapped=1>\nAgain.\n\nEXT. ${LIST_BREAKER_NAME} - DAY\n\nRain.\n`;

/** The size of the 5 MB script: a kilobyte under the cap. */
const CLASSIC_5MB_SIZE = SCRIPT_CAP - KiB;

/** A script of `CLASSIC_5MB_SIZE` characters (all ASCII), every element and mark in it, made when asked. */
function classic5mb(): string {
  // Every part a scene of its own, with a section and a synopsis: about 25,000 of each.
  const scene = (n: number) =>
    `# Part ${n}\n\nINT. SIGNAL BOX ${n} - NIGHT\n\n= She waits.\n\n!BANG. A lever waits. [[a note]] *it* **is** _late_.\n\n@McGRAW\n(softly)\nIs it on?\n~La la la.\n\nJUNE ^\nIt's on.\n\n>THE END<\n\n/* cut ${n} */\n\n>FADE OUT.\n\n===\n\n`;
  const parts: string[] = [];
  let length = 0;
  for (let n = 1; ; n++) {
    const one = scene(n);
    if (length + one.length > CLASSIC_5MB_SIZE - 2) break;
    parts.push(one);
    length += one.length;
  }
  // The last line of action fills it to the size, and ends the file.
  parts.push(`${'w'.repeat(CLASSIC_5MB_SIZE - length - 1)}\n`);
  return parts.join('');
}

const classicTrap = (id: string, tests: string, body: string, more: Partial<Trap> = {}): Trap => ({
  id: `classic-${id}`,
  format: 'fountain',
  name: `classic-${id}.fountain`,
  tests,
  bytes: () => enc(body),
  expect: { 'web-open': opens(body) },
  ...more,
});

const CLASSIC_TRAPS: Trap[] = [
  classicTrap(
    'only-marks',
    'A script of nothing but marks (`@@@@`, `!!!!`, `>>><<<`, and every other) opens, and Classic Mode hides only what pairs.',
    ONLY_MARKS,
  ),
  classicTrap(
    'unclosed-boneyard-line-1',
    'A `/*` on line 1 that never closes: Classic Mode shows it, so the rest of the script isn’t cut for no reason.',
    UNCLOSED_FIRST,
  ),
  classicTrap(
    'unclosed-note',
    'A `[[` that never closes, mid-script: its brackets stay seen, and the caret walks past it.',
    UNCLOSED_NOTE,
  ),
  classicTrap(
    'boneyard-in-note',
    'A boneyard inside a note, in action and in a speech: the delimiters hidden pair as the parser reads them.',
    BONEYARD_IN_NOTE,
  ),
  classicTrap(
    'note-across-lines',
    'A note across three lines, and one inside a speech: hidden at each end, its lines walked.',
    NOTE_ACROSS,
  ),
  classicTrap(
    'meta-damaged',
    'A damaged metadata block is a boneyard, shown and not protected, and walking it writes nothing.',
    META_DAMAGED,
  ),
  classicTrap(
    'meta-not-last',
    'A metadata block with text after it isn’t the script’s block, and Classic Mode leaves both alone.',
    META_NOT_LAST,
  ),
  classicTrap(
    'meta-twice',
    'Two metadata blocks at the end: the last is protected, the other shown, and neither is written.',
    META_TWICE,
  ),
  classicTrap(
    'long-line',
    'A 100,000-character line of forced action and a 100,000-character speech: drawn and walked in time.',
    CLASSIC_LONG_LINE,
    { inert: true },
  ),
  {
    id: 'classic-5mb',
    format: 'fountain',
    name: 'classic-5mb.fountain',
    tests:
      'A script of nearly 5 MB, about 25,000 scenes with every element and mark: the left pane drawn and every line walked in time.',
    bytes: () => enc(classic5mb()),
    expect: { 'web-open': opens(undefined, { chars: CLASSIC_5MB_SIZE }) },
    keptOut: {
      mcp: 'Drafter for Claude stops a call at 10 seconds, and its overview of 25,000 scenes, sections, and synopses takes longer (docs/DEFERRED.md)',
    },
    large: true,
    limitMs: 20_000,
    memoryMB: 1024,
  },
  classicTrap(
    'spaces-heading',
    'A scene heading of 50,000 spaces, and a forced one of nothing else: walked without stalling.',
    SPACES_HEADING,
  ),
  classicTrap(
    '100k-marks',
    'A hundred thousand forced marks, a line each: each hidden, each line walked, in time.',
    FORCED_MARKS,
    // A quarter of a million lines walked one by one: the time of a script at the cap, and the
    // memory of a quarter of a million blocks parsed.
    { limitMs: 10_000, memoryMB: 384 },
  ),
  classicTrap(
    'bidi-edge',
    'Bidirectional overrides and isolates on a hidden mark’s edge stay as they are, the caret beside them.',
    BIDI_EDGE,
    { inert: true },
  ),
  classicTrap(
    'combining-edge',
    'Combining marks on a hidden mark’s edge stay with their letters, and the caret never splits them.',
    COMBINING_EDGE,
    { inert: true },
  ),
  classicTrap(
    'list-breaker',
    'A name and a place made to break a list, `<img src=x onerror=…>`, are text in the script and in the autofill list.',
    LIST_BREAKER,
    { inert: true },
  ),
];

// ---- Production (locks and revisions) -----------------------------------------------------------

/** A locked script's text, without its block: the baseline of the well-formed lock. */
const LOCKED_SCRIPT =
  'Title: The Locked Box\n\nINT. SIGNAL BOX - NIGHT #1#\n\nA lever waits.\n\nEXT. YARD - DAY #2#\n\nRain on the rails.\n';
const gzip64 = (data: Uint8Array | string) => b64(gzipSync(data, { level: 9 }));
/** `make`, run once, the first time it is asked for: nothing is built when traps.ts is imported. */
const once = <T>(make: () => T): (() => T) => {
  let made: { value: T } | undefined;
  return () => {
    made ??= { value: make() };
    return made.value;
  };
};
/**
 * An outcome that opens with exactly the text `make` gives, made only when the outcome's `text` is
 * read (by a harness, or the manifest), not when the trap is listed.
 */
const opensLazily = (make: () => string): Outcome => ({
  kind: 'opens',
  get text() {
    return make();
  },
});
/** A well-formed production block for `LOCKED_SCRIPT`, which each trap breaks one way. */
const lock = once(() => ({
  lockedAt: '2026-11-09',
  firstScene: 1,
  numbers: ['1', '2'],
  pages: [['1', 2, 0]],
  sets: [{ name: 'Blue', color: '#8fb4e8', date: '2026-11-09', draft: 'd'.repeat(64) }],
  baseline: gzip64(LOCKED_SCRIPT),
}));
/** The locked script with `production` as its block's key, written as `setMeta` writes it. */
const lockedWith = (production: Record<string, unknown>) =>
  `${LOCKED_SCRIPT}\n/* drafter\n${JSON.stringify({ v: 1, template: 'us-screenplay', production }).replaceAll('/', '\\/')}\n*/\n`;

/** A hundred thousand fingerprints, a closed set's `lines` five times past its cap. */
const marked100k = () =>
  Array.from({ length: 100_000 }, (_, i) => `${i.toString(16).padStart(7, '0')}:1`);
/** A gzip that inflates to 9.5 MiB, past the 8 MiB the decoder may inflate a baseline to. */
const bombBaseline = () => gzip64(new Uint8Array(9.5 * MiB).fill(0x61));

/**
 * A production trap whose file is the locked script with the block `production()` gives. The text
 * is made the first time a test asks for the bytes or the outcome's text, and kept for the visit.
 */
const productionTrap = (
  id: string,
  tests: string,
  production: () => Record<string, unknown>,
  more: Partial<Trap> = {},
): Trap => {
  const body = once(() => lockedWith(production()));
  return {
    id: `production-${id}`,
    format: 'fountain',
    name: `production-${id}.fountain`,
    tests,
    bytes: () => enc(body()),
    expect: { 'web-open': opensLazily(body), production: opens() },
    ...more,
  };
};

const PRODUCTION_TRAPS: Trap[] = [
  productionTrap(
    'well-formed',
    'The control: a well-formed lock opens locked, its baseline decoded, so the traps below show the reader can tell.',
    lock,
    { locked: true },
  ),
  {
    id: 'production-bad-base64',
    format: 'fountain',
    name: 'production-bad-base64.fountain',
    tests:
      'A production block whose baseline isn’t base64: the script opens as written, unlocked, and the block is called damaged.',
    bytes: file('fountain/production-bad-base64.fountain'),
    expect: {
      'web-open': opens(text('fountain/production-bad-base64.fountain')),
      production: opens(),
    },
  },
  productionTrap(
    'gzip-bomb',
    'A baseline of 13 KB that inflates to 9.5 MiB: the decoder stops at its 8 MiB cap, and the script opens unlocked.',
    () => ({ ...lock(), baseline: bombBaseline() }),
  ),
  {
    id: 'production-pages-out-of-order',
    format: 'fountain',
    name: 'production-pages-out-of-order.fountain',
    tests:
      'A page map whose labels and lines run backwards (3, 1, 2): read as damaged, never trusted, and the script opens unlocked.',
    bytes: file('fountain/production-pages-out-of-order.fountain'),
    expect: {
      'web-open': opens(text('fountain/production-pages-out-of-order.fountain')),
      production: opens(),
    },
  },
  productionTrap(
    '100k-marked-lines',
    'A closed revision set of 100,000 marked lines, five times its cap: ignored whole, in time, and the script opens unlocked.',
    () => ({
      ...lock(),
      sets: [
        { ...lock().sets[0], lines: marked100k(), gaps: [] },
        { name: 'Pink', color: '#f2a7c4', date: '2026-11-10', draft: 'e'.repeat(64) },
      ],
    }),
    {
      large: true,
      limitMs: 5000,
    },
  ),
  {
    id: 'production-numbers-wrong-type',
    format: 'fountain',
    name: 'production-numbers-wrong-type.fountain',
    tests:
      'Scene `numbers` given as numbers, not strings: the block is ignored, the script opens unlocked, its `#1#` text untouched.',
    bytes: file('fountain/production-numbers-wrong-type.fountain'),
    expect: {
      'web-open': opens(text('fountain/production-numbers-wrong-type.fountain')),
      production: opens(),
    },
  },
  {
    id: 'production-baseline-over-cap',
    format: 'fountain',
    name: 'production-baseline-over-cap.fountain',
    tests:
      'A stored baseline one character past its cap (about 11 MB): the file is over 5 MB, so Open refuses it by size; read anyway, the block is refused by length before any decoding.',
    bytes: () => enc(lockedWith({ ...lock(), baseline: 'A'.repeat(CAPS.baselineChars + 1) })),
    expect: { 'web-open': refused(SAYS.tooBig), production: opens() },
    large: true,
    limitMs: 10_000,
    memoryMB: 512,
  },
];

/** The name the list-breaker trap puts in a cue and a place, which the autofill list must show as text. */
export const LIST_BREAKER_LABEL = LIST_BREAKER_NAME;

const deepList = (depth: number) =>
  Array.from({ length: depth }, (_, i) => `${'  '.repeat(i)}- level ${i}`).join('\n');

const MARKDOWN_TRAPS: Trap[] = [
  {
    id: 'md-raw-html',
    format: 'markdown',
    name: 'raw-html.md',
    tests:
      'Raw HTML (script, iframe, img onerror, object, meta refresh, style, svg onload) stays text.',
    bytes: file('markdown/raw-html.md'),
    expect: { 'web-open': opens(text('markdown/raw-html.md')) },
    inert: true,
  },
  {
    id: 'md-hostile-links',
    format: 'markdown',
    name: 'hostile-links.md',
    tests:
      'javascript:, data:, and vbscript: links and images, encoded and by reference, never become links.',
    bytes: file('markdown/hostile-links.md'),
    expect: { 'web-open': opens(text('markdown/hostile-links.md')) },
    inert: true,
  },
  {
    id: 'md-reference-loop',
    format: 'markdown',
    name: 'reference-loop.md',
    tests: 'Reference links that point at each other open and render.',
    bytes: file('markdown/reference-loop.md'),
    expect: { 'web-open': opens(text('markdown/reference-loop.md')) },
    inert: true,
  },
  {
    id: 'md-footnote-loop',
    format: 'markdown',
    name: 'footnote-loop.md',
    tests: 'Footnotes that cite each other, and themselves, open and render.',
    bytes: file('markdown/footnote-loop.md'),
    expect: { 'web-open': opens(text('markdown/footnote-loop.md')) },
    inert: true,
  },
  {
    id: 'md-front-matter',
    format: 'markdown',
    name: 'front-matter.md',
    tests: 'YAML front matter with anchor bombs and a tag that would run a command is only text.',
    bytes: file('markdown/front-matter.md'),
    expect: { 'web-open': opens(text('markdown/front-matter.md')) },
    inert: true,
  },
  {
    id: 'md-deep-lists',
    format: 'markdown',
    name: 'deep-lists.md',
    tests:
      'Lists nested 300 deep open; the reader says it is nested too deeply instead of stalling.',
    bytes: () => enc(`# Deep\n\n${deepList(300)}\n`),
    expect: {
      'web-open': opensWith('# Deep', '- level 299'),
      package: warns('nested too deeply'),
    },
  },
  {
    id: 'md-deep-quotes',
    format: 'markdown',
    name: 'deep-quotes.md',
    tests: 'Block quotes nested 100,000 deep open; the reader refuses to parse them.',
    bytes: () => enc(`# Deep\n\n${'>'.repeat(100_000)} the bottom\n`),
    expect: { 'web-open': opensWith('the bottom'), package: warns('nested too deeply') },
  },
  {
    id: 'md-deep-emphasis',
    format: 'markdown',
    name: 'deep-emphasis.md',
    tests: 'Emphasis nested 1,500 deep parses in time, and its export stays inert.',
    bytes: () => enc(`# Deep\n\n${'*a '.repeat(1500)}b${' a*'.repeat(1500)}\n`),
    expect: { 'web-open': opensWith('# Deep') },
    inert: true,
    // The parse and the export, in one timed job.
    limitMs: 5000,
  },
  {
    id: 'md-emphasis-quadratic',
    format: 'markdown',
    name: 'emphasis-quadratic.md',
    tests:
      'A paragraph of 160,000 emphasis marks opens at once; the reader refuses it instead of stalling for minutes (red/blue audit, 2026-11-03).',
    bytes: () => enc(`# Marks\n\n${'*_'.repeat(80_000)}\n`),
    expect: { 'web-open': opensWith('# Marks'), package: warns('too many marks') },
    limitMs: 5000,
  },
  {
    id: 'md-huge-table',
    format: 'markdown',
    name: 'huge-table.md',
    tests: 'A pipe table of 1,500 rows by 50 columns of inline HTML opens and exports in time.',
    bytes: () =>
      enc(
        `# Table\n\n|${' h |'.repeat(50)}\n|${' - |'.repeat(50)}\n${`|${' <b>x</b> |'.repeat(50)}\n`.repeat(1500)}`,
      ),
    expect: { 'web-open': opensWith('# Table') },
    inert: true,
    limitMs: 5000,
    memoryMB: 1536,
  },
  {
    id: 'md-many-footnotes',
    format: 'markdown',
    name: 'many-footnotes.md',
    tests: '30,000 footnote definitions and references parse in linear time.',
    bytes: () =>
      enc(
        `# Notes\n\n${Array.from({ length: 30_000 }, (_, i) => `x[^${i}]`).join(' ')}\n\n${Array.from({ length: 30_000 }, (_, i) => `[^${i}]: n${i}`).join('\n')}\n`,
      ),
    expect: { 'web-open': opensWith('# Notes') },
    limitMs: 5000,
  },
  {
    id: 'md-is-epub',
    format: 'markdown',
    name: 'book.md',
    tests:
      'An EPUB named .md is named an e-book by its content, whatever its name, by Open and by Drafter for Claude alike.',
    bytes: epub([]),
    expect: { 'web-open': refused(SAYS.eBook) },
  },
];

// ---- A novel ------------------------------------------------------------------------------------

/** The trailing comment that makes a Markdown file a novel, with `more` beside the template. */
const novelMeta = (more: Record<string, unknown> = {}) =>
  `<!-- drafter ${JSON.stringify({ template: 'novel', ...more })} -->\n`;
const NOVEL_META = novelMeta();

/** 100,000 bare `#` lines: the heading scan must stay linear, and ids must not collide into a stall. */
const HEADING_FLOOD = `${'#\n'.repeat(100_000)}\n${NOVEL_META}`;
const FENCE_UNCLOSED = `# The First Chapter\n\nThe tide came in.\n\n# The Second Chapter\n\nThe tide went out.\n\n\`\`\`\n# Not a chapter\n## Nor a section\n***\n\nThe fence never closes, and the comment below is inside it.\n\n${NOVEL_META}`;
/** 20,000 parts, each with a chapter of two sections: the deepest tree the scan can make wide. */
const DEEP_PARTS = `${Array.from(
  { length: 20_000 },
  (_, i) => `# Part ${i}\n\n# Chapter ${i}\n\n## Section ${i}\n\nWords.\n\n***\n\nMore words.\n`,
).join('\n')}\n${NOVEL_META}`;
const CRLF_NOVEL = `# Part One\r\n\r\n# The Salt Road\r\n\r\n## Low Tide\r\n\r\nShe walked out.\r\n\r\n***\r\n\r\nThe gulls wheeled.\r\n\r\n# The Light\r\n\r\nAn ending.\r\n\r\n${NOVEL_META.replace('\n', '\r\n')}`;
const HOSTILE_NOVEL_META = `# One\n\nWords.\n\n# Two\n\nMore.\n\n<!-- drafter ${
  // A hand-built string: JSON.stringify would make the `__proto__` key an own property too, but
  // writing it out shows the file as a person would find it.
  `{"template":"novel","novel":{"bookTarget":"many","nodes":{"__proto__":{"status":"done","target":5,"synopsis":"x"},"constructor":{"status":"nope"},"chapter:one:0":{"status":7,"target":-4,"synopsis":["a"]},"chapter:two:0":{"status":"draft","synopsis":"${'long '.repeat(200_000)}"},"toString":null,"chapter:gone:0":"text"}}}`
} -->\n`;

const NOVEL_TRAPS: Trap[] = [
  {
    id: 'novel-heading-flood',
    format: 'markdown',
    name: 'heading-flood.md',
    tests:
      '100,000 `#` lines open as a novel and are read as chapters in linear time, and one move keeps every line.',
    bytes: () => enc(HEADING_FLOOD),
    expect: { 'web-open': opens(HEADING_FLOOD) },
    novel: { parts: 0, chapters: 100_000, sections: 0, moves: true },
  },
  {
    id: 'novel-fence-unclosed',
    format: 'markdown',
    name: 'fence-unclosed.md',
    tests:
      'A code fence that never closes hides the headings after it: they are text, not chapters, and nothing is lost.',
    bytes: () => enc(FENCE_UNCLOSED),
    expect: { 'web-open': opens(FENCE_UNCLOSED) },
    novel: { parts: 0, chapters: 2, sections: 0, moves: true },
  },
  {
    id: 'novel-meta-hostile',
    format: 'markdown',
    name: 'meta-hostile.md',
    tests:
      'A novel’s comment holding `__proto__` and `constructor` keys, wrong types, an unknown status, and a 1 MB synopsis opens; the facts are ignored or capped, never thrown.',
    bytes: () => enc(HOSTILE_NOVEL_META),
    expect: { 'web-open': opens(HOSTILE_NOVEL_META) },
    novel: { parts: 0, chapters: 2, sections: 0, moves: true },
  },
  {
    id: 'novel-deep-parts',
    format: 'markdown',
    name: 'deep-parts.md',
    tests:
      '20,000 parts, each holding a chapter and two sections, are read in linear time and one move keeps every line.',
    bytes: () => enc(DEEP_PARTS),
    expect: { 'web-open': opens(DEEP_PARTS) },
    novel: { parts: 20_000, chapters: 20_000, sections: 40_000, moves: true },
  },
  {
    id: 'novel-crlf',
    format: 'markdown',
    name: 'crlf.md',
    tests:
      'A novel written with CRLF line breaks opens with line feeds; read raw, its structure is the same and a move keeps its CRLF.',
    bytes: () => enc(CRLF_NOVEL),
    expect: { 'web-open': opens(CRLF_NOVEL.replace(/\r\n/g, '\n')) },
    novel: { parts: 1, chapters: 2, sections: 2, moves: true },
  },
];

// ---- A novel's manuscript -----------------------------------------------------------------------

/** 20,000 one-line chapters: a manuscript starts each on a new page, so this is 20,000 pages. */
const MANUSCRIPT_CHAPTERS = `${Array.from({ length: 20_000 }, (_, i) => `# Chapter ${i + 1}\n\nShe walked out.\n`).join('\n')}\n${NOVEL_META}`;
/** A 50,000-character chapter heading: the running header, the title page, and the file's name all take it. */
const LONG_TITLE = 'T'.repeat(50_000);
const MANUSCRIPT_TITLE = `# ${LONG_TITLE}\n\nThe tide came in.\n\n${NOVEL_META}`;
/** What breaks XML, or a Word field, or a CDATA section, or the PDF's strings, in one line. */
const XML_HOSTILE = '<w:fldChar w:fldCharType="begin"/> ]]> & &amp; \u0000 ￾ ￿ "\' </w:t></w:p>';
/** The same without the NUL, for the start of the file: Open refuses a NUL in its first 8 KB. */
const XML_EARLY = XML_HOSTILE.replace('\u0000', '');
const MANUSCRIPT_XML = `# ${XML_EARLY}\n\n${'Padding words. '.repeat(700)}\n\n${XML_HOSTILE}\n\n*${XML_HOSTILE}* **${XML_HOSTILE}**\n\n***\n\n<w:instrText>${XML_HOSTILE}\n\n${NOVEL_META}`;
/** Hebrew and Arabic: right to left, and letters neither font has. */
const MANUSCRIPT_RTL = `# פרק ראשון\n\nהיא הלכה אל הים, והגלים באו אליה.\n\n# الفصل الثاني\n\nمشت إلى البحر وهي تقول *مرحبا* للموج.\n\nShe said שלום and then مرحبا aloud.\n\n${NOVEL_META}`;

const MANUSCRIPT_TRAPS: Trap[] = [
  {
    id: 'novel-manuscript-chapters',
    format: 'markdown',
    name: 'manuscript-chapters.md',
    tests:
      '20,000 chapters make a manuscript as a PDF and as a Word file within the time, the Word file whole and the PDF opening.',
    bytes: () => enc(MANUSCRIPT_CHAPTERS),
    expect: { 'web-open': opens(MANUSCRIPT_CHAPTERS), manuscript: opens() },
    manuscript: { chapters: 20_000 },
    limitMs: 30_000,
    memoryMB: 1024,
  },
  {
    id: 'novel-manuscript-title',
    format: 'markdown',
    name: 'manuscript-title.md',
    tests:
      'A 50,000-character title, as the first heading and in the details too, makes both files without a throw.',
    bytes: () => enc(MANUSCRIPT_TITLE),
    expect: { 'web-open': opens(MANUSCRIPT_TITLE), manuscript: opens() },
    manuscript: {
      chapters: 1,
      details: {
        title: LONG_TITLE,
        byline: LONG_TITLE,
        shortTitle: LONG_TITLE,
        surname: LONG_TITLE,
      },
    },
    limitMs: 20_000,
    memoryMB: 1024,
  },
  {
    id: 'novel-manuscript-xml',
    format: 'markdown',
    name: 'manuscript-xml.md',
    tests:
      'Field codes, `]]>`, `&`, NUL, and U+FFFE in the text and in the title and contact lines leave the Word file’s every part well-formed, with the one field.',
    bytes: () => enc(MANUSCRIPT_XML),
    expect: { 'web-open': opens(MANUSCRIPT_XML), manuscript: opens() },
    manuscript: {
      chapters: 1,
      details: {
        title: XML_HOSTILE,
        byline: XML_HOSTILE,
        legalName: XML_HOSTILE,
        contact: [XML_HOSTILE, '<w:fldSimple w:instr="PAGE"/>', ']]>', '\u0000￾&'],
        surname: XML_HOSTILE,
        shortTitle: XML_HOSTILE,
      },
    },
    limitMs: 20_000,
  },
  {
    id: 'novel-manuscript-rtl',
    format: 'markdown',
    name: 'manuscript-rtl.md',
    tests:
      'Hebrew and Arabic paragraphs, alone and beside English, make both files: letters the font lacks print as `?`, nothing throws.',
    bytes: () => enc(MANUSCRIPT_RTL),
    expect: { 'web-open': opens(MANUSCRIPT_RTL), manuscript: opens() },
    manuscript: { chapters: 2 },
    limitMs: 20_000,
  },
];

const FDX_TRAPS: Trap[] = [
  {
    id: 'fdx-valid',
    format: 'fdx',
    name: 'valid.fdx',
    tests: 'The baseline: a small, well-formed Final Draft file imports.',
    bytes: file('fdx/valid.fdx'),
    expect: { 'web-open': opensWith(...SCRIPT_LINES) },
  },
  {
    id: 'fdx-billion-laughs',
    format: 'fdx',
    name: 'billion-laughs.fdx',
    tests: 'Nested entity expansion is never expanded: a DOCTYPE is refused outright.',
    bytes: file('fdx/billion-laughs.fdx'),
    expect: { 'web-open': refused(SAYS.fdx('A DOCTYPE is not allowed')) },
  },
  {
    id: 'fdx-xxe-file',
    format: 'fdx',
    name: 'xxe-file.fdx',
    tests: 'An external entity naming file:///etc/passwd is refused, never read.',
    bytes: file('fdx/xxe-file.fdx'),
    expect: { 'web-open': refused(SAYS.fdx('A DOCTYPE is not allowed')) },
  },
  {
    id: 'fdx-xxe-http',
    format: 'fdx',
    name: 'xxe-http.fdx',
    tests: 'An external entity naming an http:// URL is refused, never fetched.',
    bytes: file('fdx/xxe-http.fdx'),
    expect: { 'web-open': refused(SAYS.fdx('A DOCTYPE is not allowed')) },
  },
  {
    id: 'fdx-external-dtd',
    format: 'fdx',
    name: 'external-dtd.fdx',
    tests: 'A DOCTYPE naming an external DTD is refused, never fetched.',
    bytes: file('fdx/external-dtd.fdx'),
    expect: { 'web-open': refused(SAYS.fdx('A DOCTYPE is not allowed')) },
  },
  {
    id: 'fdx-parameter-entity',
    format: 'fdx',
    name: 'parameter-entity.fdx',
    tests: 'A parameter entity naming a local file is refused, never read.',
    bytes: file('fdx/parameter-entity.fdx'),
    expect: { 'web-open': refused(SAYS.fdx('A DOCTYPE is not allowed')) },
  },
  {
    id: 'fdx-deep-nesting',
    format: 'fdx',
    name: 'deep.fdx',
    tests: 'Elements nested 200,000 deep are refused at depth 65, without recursion.',
    bytes: () =>
      enc(`${FD}<Content>${'<a>'.repeat(200_000)}${'</a>'.repeat(200_000)}</Content></FinalDraft>`),
    expect: { 'web-open': refused(SAYS.fdx('Elements nest deeper than 64')) },
    large: true,
  },
  {
    id: 'fdx-huge-attribute',
    format: 'fdx',
    name: 'huge-attribute.fdx',
    tests: 'A 4 MB attribute value is read once, in linear time, and left out.',
    bytes: () =>
      enc(
        fdx(para('Action', 'A lever waits.')).replace(
          FD,
          `${FD.slice(0, -1)} Junk="${'j'.repeat(4 * MiB)}">`,
        ),
      ),
    expect: { 'web-open': opensWith('A lever waits.') },
    large: true,
    limitMs: 5000,
  },
  {
    id: 'fdx-huge-type',
    format: 'fdx',
    name: 'huge-type.fdx',
    tests:
      'A paragraph type 1 MB long comes in as a note, in time (the note holds the whole type: docs/DEFERRED.md).',
    bytes: () => enc(fdx(para('T'.repeat(MiB), 'A lever waits.'))),
    expect: { 'web-open': warns(SAYS.note, { lines: ['A lever waits.'] }) },
    large: true,
  },
  {
    id: 'fdx-malformed',
    format: 'fdx',
    name: 'malformed.fdx',
    tests: 'A mismatched closing tag is refused, and the message says where.',
    bytes: file('fdx/malformed.fdx'),
    expect: { 'web-open': refused(SAYS.fdx('</Paragraph> closes <Text>')) },
  },
  {
    id: 'fdx-wrong-root',
    format: 'fdx',
    name: 'wrong-root.fdx',
    tests: 'Well-formed XML whose root isn’t FinalDraft is refused.',
    bytes: file('fdx/wrong-root.fdx'),
    expect: {
      'web-open': refused(SAYS.fdx('it has no FinalDraft root holding a Content element.')),
    },
  },
  {
    id: 'fdx-empty-content',
    format: 'fdx',
    name: 'empty-content.fdx',
    tests: 'An empty Content imports as an empty script.',
    bytes: file('fdx/empty-content.fdx'),
    expect: { 'web-open': opens('') },
  },
  {
    id: 'fdx-unknown-types',
    format: 'fdx',
    name: 'unknown-types.fdx',
    tests:
      'Paragraph types Drafter has no element for (one of them markup) come in as counted notes.',
    bytes: file('fdx/unknown-types.fdx'),
    expect: {
      'web-open': warns(SAYS.notes, {
        lines: ['INT. SIGNAL BOX - NIGHT', 'A shimmer. [[fdx: Hologram]]', 'Odd type.'],
      }),
    },
    inert: true,
  },
  {
    id: 'fdx-cdata-script',
    format: 'fdx',
    name: 'cdata-script.fdx',
    tests: 'A <script> inside CDATA, and an escaped <img onerror>, come in as text.',
    bytes: file('fdx/cdata-script.fdx'),
    expect: {
      'web-open': opensWith(
        // Fountain's own escape: an underscore would start emphasis.
        "<script>window.\\_\\_trapped = 'cdata'</script>",
        '<img src=x onerror="window.\\_\\_trapped = \'escaped\'">',
      ),
    },
    inert: true,
  },
  {
    id: 'fdx-processing-instruction',
    format: 'fdx',
    name: 'processing-instruction.fdx',
    tests: 'An xml-stylesheet processing instruction is refused, never fetched.',
    bytes: file('fdx/processing-instruction.fdx'),
    expect: { 'web-open': refused(SAYS.fdx('A processing instruction is not allowed')) },
  },
  {
    id: 'fdx-encoding-mismatch',
    format: 'fdx',
    name: 'encoding-mismatch.fdx',
    tests: 'A declaration saying UTF-16 over UTF-8 bytes: the bytes decide, and it imports.',
    bytes: file('fdx/encoding-mismatch.fdx'),
    expect: { 'web-open': opensWith('Café, naïve, résumé.') },
  },
  {
    id: 'fdx-latin1',
    format: 'fdx',
    name: 'latin1.fdx',
    tests: 'A file declared ISO-8859-1 and holding Latin-1 bytes is refused as not UTF-8.',
    bytes: () =>
      concat(
        '<?xml version="1.0" encoding="ISO-8859-1"?>\n',
        FD,
        '<Content><Paragraph Type="Action"><Text>Caf',
        [0xe9],
        '</Text></Paragraph></Content></FinalDraft>\n',
      ),
    expect: { 'web-open': refused(SAYS.notUtf8) },
  },
  {
    id: 'fdx-utf16',
    format: 'fdx',
    name: 'utf16.fdx',
    tests: 'A UTF-16 Final Draft file is refused as not UTF-8.',
    bytes: () => utf16(text('fdx/valid.fdx'), false),
    expect: { 'web-open': refused(SAYS.notUtf8) },
  },
  {
    id: 'fdx-undeclared-entity',
    format: 'fdx',
    name: 'undeclared-entity.fdx',
    tests: 'An HTML entity XML doesn’t define (&nbsp;) is refused.',
    bytes: file('fdx/undeclared-entity.fdx'),
    expect: { 'web-open': refused(SAYS.fdx('The entity &nbsp; is not allowed')) },
  },
  {
    id: 'fdx-proto-attribute',
    format: 'fdx',
    name: 'proto-attribute.fdx',
    tests: 'Attributes named __proto__ and constructor are plain keys, and it imports.',
    bytes: file('fdx/proto-attribute.fdx'),
    expect: { 'web-open': opensWith('A lever waits.') },
  },
  {
    id: 'fdx-second-root',
    format: 'fdx',
    name: 'second-root.fdx',
    tests: 'Two root elements are refused.',
    bytes: file('fdx/second-root.fdx'),
    expect: { 'web-open': refused(SAYS.fdx('A second root element')) },
  },
  {
    id: 'fdx-char-reference-nul',
    format: 'fdx',
    name: 'char-reference-nul.fdx',
    tests: 'A character reference to NUL (&#0;) is refused.',
    bytes: file('fdx/char-reference-nul.fdx'),
    expect: { 'web-open': refused(SAYS.fdx('A character reference to a character XML forbids')) },
  },
  {
    id: 'fdx-many-comments',
    format: 'fdx',
    name: 'many-comments.fdx',
    tests: '100,000 empty comments before the root are read in linear time.',
    bytes: () =>
      enc(
        `<?xml version="1.0"?>\n${'<!---->'.repeat(100_000)}${fdx(para('Action', 'A lever waits.')).slice(22)}`,
      ),
    expect: { 'web-open': opensWith('A lever waits.') },
  },
  {
    id: 'fdx-unclosed-cdata',
    format: 'fdx',
    name: 'unclosed-cdata.fdx',
    tests: 'A CDATA section that never closes is refused.',
    bytes: () =>
      enc(
        fdx(`<Paragraph Type="Action"><Text><![CDATA[${'x'.repeat(100_000)}`).replace(
          /<\/Content>.*$/s,
          '',
        ),
      ),
    expect: { 'web-open': refused(SAYS.fdx('A CDATA section is not closed')) },
  },
  {
    id: 'fdx-at-cap',
    format: 'fdx',
    name: 'at-cap.fdx',
    tests: 'A Final Draft file of exactly 5 MB imports.',
    bytes: () => {
      const head = `<?xml version="1.0"?>\n${FD}<Content><Paragraph Type="Action"><Text>A lever waits.</Text></Paragraph></Content>`;
      const tail = '</FinalDraft>\n';
      return sized(SCRIPT_CAP, `${head}<!--`, ' ', `-->${tail}`);
    },
    expect: { 'web-open': opensWith('A lever waits.') },
    large: true,
    limitMs: 5000,
  },
  {
    id: 'fdx-over-cap',
    format: 'fdx',
    name: 'over-cap.fdx',
    tests: 'A Final Draft file one byte over 5 MB is refused by size.',
    bytes: () =>
      sized(
        SCRIPT_CAP + 1,
        `<?xml version="1.0"?>\n${FD}<Content><!--`,
        ' ',
        '--></Content></FinalDraft>\n',
      ),
    expect: {
      'web-open': refused(SAYS.tooBig),
      'cli-convert': refused(SAYS.cliTooBig),
      package: refused(SAYS.fdx('The file is larger than 5 MB')),
    },
    large: true,
  },
  {
    id: 'fdx-binary',
    format: 'fdx',
    name: 'program.fdx',
    tests: 'A program renamed .fdx is refused as not text.',
    bytes: EXE,
    expect: { 'web-open': refused(SAYS.binary) },
  },
  {
    id: 'fdx-is-fountain',
    format: 'fdx',
    name: 'fountain.fdx',
    tests: 'A Fountain script named .fdx is refused: it isn’t XML.',
    bytes: () => enc(SCRIPT),
    expect: { 'web-open': refused(SAYS.fdx('Text before the root element')) },
  },
  {
    id: 'fdx-is-highland',
    format: 'fdx',
    name: 'packed.fdx',
    tests: 'A zip named .fdx is named a packed file by its first bytes.',
    bytes: highland([TEXT_ENTRY]),
    expect: { 'web-open': refused(SAYS.packed), package: refused(SAYS.binary) },
  },
  {
    id: 'fdx-empty',
    format: 'fdx',
    name: 'empty.fdx',
    tests: 'A 0-byte Final Draft file is refused.',
    bytes: () => new Uint8Array(),
    expect: { 'web-open': refused(SAYS.fdx('The file has no root element')) },
  },
];

const MANY = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ name: `assets/${i}.png`, data: '', method: 0 }));

const HIGHLAND_TRAPS: Trap[] = [
  {
    id: 'highland-valid',
    format: 'highland',
    name: 'valid.highland',
    tests: 'The baseline: a TextBundle zip with its text.fountain and info.json imports.',
    bytes: highland([TEXT_ENTRY, INFO]),
    expect: { 'web-open': opens(SCRIPT) },
  },
  {
    id: 'highland-bomb',
    format: 'highland',
    name: 'bomb.highland',
    tests:
      'A 64 MB script squeezed into 64 KB (a ratio of a thousand) is refused before it is unpacked.',
    bytes: highland([
      { name: 'text.fountain', data: '', raw: zeros(64 * MiB), declaredSize: 64 * MiB },
    ]),
    expect: { 'web-open': refused(SAYS.highland('its script is larger than 5 MB.')) },
  },
  {
    id: 'highland-bomb-lying',
    format: 'highland',
    name: 'bomb-lying.highland',
    tests: 'A bomb that declares a small size is refused as damaged.',
    bytes: highland([{ name: 'text.fountain', data: '', raw: zeros(64 * MiB), declaredSize: 100 }]),
    expect: { 'web-open': refused(SAYS.highland('it is damaged.')) },
  },
  {
    id: 'highland-bomb-total',
    format: 'highland',
    name: 'bomb-total.highland',
    tests: 'Entries whose declared sizes sum past 256 MB are refused before anything is read.',
    bytes: highland([
      TEXT_ENTRY,
      ...Array.from({ length: 60 }, (_, i) => ({
        name: `assets/${i}.bin`,
        data: '',
        raw: new Uint8Array(),
        declaredSize: 5 * MiB,
      })),
    ]),
    expect: { 'web-open': refused(SAYS.highland('it unpacks to more than 256 MB.')) },
  },
  {
    id: 'highland-nested-bomb',
    format: 'highland',
    name: 'nested.highland',
    tests: 'A zip inside the zip is never opened: it is named in a note, not unpacked.',
    bytes: highland([
      TEXT_ENTRY,
      {
        name: 'assets/inner.zip',
        data: trapZip([{ name: 'zeros', data: '', raw: zeros(MiB), declaredSize: MiB }]),
        method: 0,
      },
    ]),
    expect: { 'web-open': warns(SAYS.note, { lines: [...SCRIPT_LINES, 'assets/inner.zip'] }) },
  },
  {
    id: 'highland-larger-than-declared',
    format: 'highland',
    name: 'larger.highland',
    tests: 'An entry that inflates to more than its declared size is refused as damaged.',
    bytes: highland([{ name: 'text.fountain', data: SCRIPT, declaredSize: 10 }]),
    expect: { 'web-open': refused(SAYS.highland('it is damaged.')) },
  },
  {
    id: 'highland-smaller-than-declared',
    format: 'highland',
    name: 'smaller.highland',
    tests: 'An entry that inflates to less than its declared size is refused as damaged.',
    bytes: highland([{ name: 'text.fountain', data: SCRIPT, declaredSize: SCRIPT.length + 50 }]),
    expect: { 'web-open': refused(SAYS.highland('it is damaged.')) },
  },
  {
    id: 'highland-bad-crc',
    format: 'highland',
    name: 'crc.highland',
    tests: 'A wrong CRC-32 is refused as damaged.',
    bytes: highland([{ ...TEXT_ENTRY, declaredCrc: 0xdeadbeef }]),
    expect: { 'web-open': refused(SAYS.highland('it is damaged.')) },
  },
  {
    id: 'highland-truncated',
    format: 'highland',
    name: 'truncated.highland',
    tests: 'An archive cut off before its end record is refused as not a zip.',
    bytes: () => highland([TEXT_ENTRY, INFO])().subarray(0, 80),
    expect: { 'web-open': refused(SAYS.highland('it isn’t a zip archive.')) },
  },
  {
    id: 'highland-no-central',
    format: 'highland',
    name: 'no-central.highland',
    tests: 'Local headers with no central directory are refused.',
    bytes: highland([TEXT_ENTRY], { noCentral: true }),
    expect: { 'web-open': refused(SAYS.highland('it isn’t a zip archive.')) },
  },
  {
    id: 'highland-duplicate',
    format: 'highland',
    name: 'duplicate.highland',
    tests: 'Two entries with the same name are refused.',
    bytes: highland([TEXT_ENTRY, { name: 'text.fountain', data: 'INT. ELSEWHERE - DAY\n' }]),
    expect: { 'web-open': refused(SAYS.highland('it holds two files with the same name.')) },
  },
  ...(
    [
      ['dotdot', '../text.fountain'],
      ['dotdot-inner', 'assets/../../text.fountain'],
      ['absolute', '/etc/text.fountain'],
      ['backslash', '..\\text.fountain'],
      ['drive', 'C:/text.fountain'],
      ['control', 'text\u0007.fountain'],
      ['bidi', `text${BIDI}.fountain`],
    ] as const
  ).map(
    ([kind, entryName]): Trap => ({
      id: `highland-traversal-${kind}`,
      format: 'highland',
      name: `traversal-${kind}.highland`,
      tests: `An entry named ${JSON.stringify(entryName)} is refused as unsafe, never used as a path.`,
      bytes: highland([TEXT_ENTRY, { name: entryName, data: 'x' }]),
      expect: { 'web-open': refused(SAYS.highland('it holds a file with an unsafe name.')) },
    }),
  ),
  {
    id: 'highland-symlink',
    format: 'highland',
    name: 'symlink.highland',
    tests: 'A symlink entry is never followed: its stored bytes (a path) are all that is read.',
    bytes: highland([
      { name: 'text.fountain', data: '/etc/passwd', method: 0, madeBy: 3, external: SYMLINK_ATTRS },
    ]),
    expect: { 'web-open': opens('/etc/passwd') },
  },
  {
    id: 'highland-encrypted',
    format: 'highland',
    name: 'encrypted.highland',
    tests: 'An encrypted entry is refused.',
    bytes: highland([{ ...TEXT_ENTRY, flags: 1 }]),
    expect: { 'web-open': refused(SAYS.highland('it is encrypted.')) },
  },
  {
    id: 'highland-method',
    format: 'highland',
    name: 'method.highland',
    tests: 'A script compressed with an unsupported method (bzip2, 12) is refused.',
    bytes: highland([{ ...TEXT_ENTRY, method: 12 }]),
    expect: {
      'web-open': refused(SAYS.highland('its script is compressed in a way Drafter doesn’t read.')),
    },
  },
  {
    id: 'highland-zip64-locator',
    format: 'highland',
    name: 'zip64.highland',
    tests: 'A zip64 locator is refused, not half-read.',
    bytes: highland([TEXT_ENTRY], { zip64Locator: true }),
    expect: { 'web-open': refused(SAYS.highland('it is stored in a form Drafter doesn’t read.')) },
  },
  {
    id: 'highland-zip64-sizes',
    format: 'highland',
    name: 'zip64-sizes.highland',
    tests: 'Sizes of 0xFFFFFFFF (zip64 markers) are refused.',
    bytes: highland([{ ...TEXT_ENTRY, declaredSize: 0xffffffff }]),
    expect: { 'web-open': refused(SAYS.highland('it is stored in a form Drafter doesn’t read.')) },
  },
  {
    id: 'highland-zip64-extra',
    format: 'highland',
    name: 'zip64-extra.highland',
    tests: 'A zip64 extra field with no markers is ignored, as it should be, and the script opens.',
    bytes: highland([
      {
        ...TEXT_ENTRY,
        extra: Uint8Array.of(
          0x01,
          0x00,
          0x08,
          0x00,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0xff,
          0x7f,
        ),
      },
    ]),
    expect: { 'web-open': opens(SCRIPT) },
  },
  {
    id: 'highland-count-lies',
    format: 'highland',
    name: 'count.highland',
    tests: 'An end record whose count disagrees with the directory is refused as damaged.',
    bytes: highland([TEXT_ENTRY, INFO], { declaredCount: 3 }),
    expect: { 'web-open': refused(SAYS.highland('it is damaged.')) },
  },
  {
    id: 'highland-many-entries',
    format: 'highland',
    name: 'many.highland',
    tests: '1,001 entries are refused before any is read.',
    bytes: highland([TEXT_ENTRY, ...MANY(1000)]),
    expect: { 'web-open': refused(SAYS.highland('it holds more than 1,000 files.')) },
  },
  {
    id: 'highland-at-entry-cap',
    format: 'highland',
    name: 'thousand.highland',
    tests: 'Exactly 1,000 entries open, and the note names 50 of them and counts the rest.',
    bytes: highland([TEXT_ENTRY, ...MANY(999)]),
    expect: { 'web-open': warns(SAYS.note, { lines: ['assets/0.png', 'and 949 more'] }) },
  },
  {
    id: 'highland-empty',
    format: 'highland',
    name: 'empty.highland',
    tests: 'A 0-byte Highland file is refused as not a zip.',
    bytes: () => new Uint8Array(),
    expect: { 'web-open': refused(SAYS.highland('it isn’t a zip archive.')) },
  },
  {
    id: 'highland-junk',
    format: 'highland',
    name: 'junk.highland',
    tests: 'Junk before the archive that its offsets don’t count is refused.',
    bytes: highland([TEXT_ENTRY], { junk: enc('GIF89a junk before the archive') }),
    expect: { 'web-open': refused(SAYS.highland('it isn’t a zip archive.')) },
  },
  {
    id: 'highland-stub',
    format: 'highland',
    name: 'stub.highland',
    tests:
      'A self-extractor’s stub, counted in the offsets, is still refused: nothing may come first.',
    bytes: highland([TEXT_ENTRY], { stub: EXE() }),
    expect: { 'web-open': refused(SAYS.highland('it isn’t a zip archive.')) },
  },
  {
    id: 'highland-html-polyglot',
    format: 'highland',
    name: 'polyglot.highland',
    tests:
      'A web page with a zip after it, named .highland, is taken as the web page it starts as.',
    bytes: highland([TEXT_ENTRY], {
      junk: enc('<!DOCTYPE html><html><body>hello</body></html>\n'),
    }),
    expect: {
      'web-open': refused(SAYS.webPage),
      package: refused(SAYS.highland('it isn’t a zip archive.')),
    },
  },
  {
    id: 'highland-no-script',
    format: 'highland',
    name: 'no-script.highland',
    tests: 'An archive with no text.* or .fountain entry is refused.',
    bytes: highland([INFO, { name: 'assets/a.png', data: 'x' }]),
    expect: { 'web-open': refused(SAYS.highland('it holds no script.')) },
  },
  {
    id: 'highland-two-scripts',
    format: 'highland',
    name: 'two.highland',
    tests: 'Two text.* entries at the top (neither .fountain) are refused as many scripts.',
    bytes: highland([
      { name: 'text.md', data: 'a' },
      { name: 'text.txt', data: 'b' },
    ]),
    expect: { 'web-open': refused(SAYS.highland('it holds more than one script.')) },
  },
  {
    id: 'highland-not-utf8',
    format: 'highland',
    name: 'latin1.highland',
    tests: 'A script inside that isn’t UTF-8 is refused.',
    bytes: highland([{ name: 'text.fountain', data: concat('Caf', [0xe9], '\n') }]),
    expect: { 'web-open': refused(SAYS.highland('its script isn’t UTF-8 text.')) },
  },
  {
    id: 'highland-nul',
    format: 'highland',
    name: 'nul.highland',
    tests: 'A script inside holding a NUL is refused.',
    bytes: highland([{ name: 'text.fountain', data: concat('INT. HALL\n', [0], '\n') }]),
    expect: { 'web-open': refused(SAYS.highland('its script holds more than text.')) },
  },
  {
    id: 'highland-hostile-names',
    format: 'highland',
    name: 'names.highland',
    tests: 'Entry names that would close a note or open a boneyard are defused in the note.',
    bytes: highland([TEXT_ENTRY, { name: 'assets/[[x]]/*y*/z.png', data: 'x' }]),
    expect: { 'web-open': warns(SAYS.note, { lines: ['assets/[ [x] ]/ *y* /z.png'] }) },
  },
  {
    id: 'highland-entry-at-cap',
    format: 'highland',
    name: 'entry-at-cap.highland',
    tests: 'A script inside of exactly 5 MB opens.',
    bytes: () =>
      trapZip([
        { name: 'text.fountain', data: sized(SCRIPT_CAP, 'Title: Big\n\n', 'A lever waits.\n') },
      ]),
    expect: { 'web-open': opens(undefined, { chars: SCRIPT_CAP }) },
    large: true,
    limitMs: 10_000,
    memoryMB: 512,
  },
  {
    id: 'highland-entry-over-cap',
    format: 'highland',
    name: 'entry-over-cap.highland',
    tests: 'A script inside one byte over 5 MB is refused.',
    bytes: () =>
      trapZip([
        {
          name: 'text.fountain',
          data: sized(SCRIPT_CAP + 1, 'Title: Big\n\n', 'A lever waits.\n'),
        },
      ]),
    expect: { 'web-open': refused(SAYS.highland('its script is larger than 5 MB.')) },
    large: true,
  },
  {
    id: 'highland-archive-at-cap',
    format: 'highland',
    name: 'archive-at-cap.highland',
    tests: 'An archive of exactly 32 MB (a big picture beside the script) opens.',
    bytes: () => {
      const small = trapZip([
        TEXT_ENTRY,
        { name: 'assets/big.bin', data: new Uint8Array(0), method: 0 },
      ]);
      const pad = ARCHIVE_CAP - small.length;
      return trapZip([
        TEXT_ENTRY,
        { name: 'assets/big.bin', data: new Uint8Array(pad), method: 0 },
      ]);
    },
    expect: { 'web-open': warns(SAYS.note, { lines: ['assets/big.bin'] }) },
    large: true,
    limitMs: 10_000,
  },
  {
    id: 'highland-archive-over-cap',
    format: 'highland',
    name: 'archive-over-cap.highland',
    tests: 'An archive one byte over 32 MB is refused before it is read.',
    bytes: () => {
      const small = trapZip([
        TEXT_ENTRY,
        { name: 'assets/big.bin', data: new Uint8Array(0), method: 0 },
      ]);
      const pad = ARCHIVE_CAP + 1 - small.length;
      return trapZip([
        TEXT_ENTRY,
        { name: 'assets/big.bin', data: new Uint8Array(pad), method: 0 },
      ]);
    },
    expect: {
      'web-open': refused(SAYS.unreadable),
      // The desktop app reads up to 64 MB, and the zip reader's own cap says it.
      'desktop-open': refused(SAYS.highland('it is larger than 32 MB.')),
      'cli-convert': refused(SAYS.highland('it is larger than 32 MB.')),
      package: refused(SAYS.highland('it is larger than 32 MB.')),
    },
    large: true,
  },
  {
    id: 'highland-is-fountain',
    format: 'highland',
    name: 'fountain.highland',
    tests: 'A Fountain script named .highland is refused as not a zip.',
    bytes: () => enc(SCRIPT),
    expect: { 'web-open': refused(SAYS.highland('it isn’t a zip archive.')) },
  },
  {
    id: 'highland-is-epub',
    format: 'highland',
    name: 'book.highland',
    tests: 'An EPUB named .highland is taken as the e-book it is.',
    bytes: epub([]),
    expect: {
      'web-open': refused(SAYS.eBook),
      package: refused(SAYS.highland('it holds no script.')),
    },
  },
];

const fadeIn = (entries: TrapEntry[]) => () => trapZip(entries);

const FADE_IN_TRAPS: Trap[] = [
  {
    id: 'fadein-valid',
    format: 'fadein',
    name: 'valid.fadein',
    tests: 'The baseline: a zip holding one OSF document imports.',
    bytes: fadeIn([{ name: 'document.xml', data: OSF }]),
    expect: { 'web-open': opensWith(...SCRIPT_LINES) },
  },
  {
    id: 'fadein-xxe',
    format: 'fadein',
    name: 'xxe.fadein',
    tests: 'An OSF document with an external entity is refused, never read.',
    bytes: fadeIn([
      {
        name: 'document.xml',
        data: OSF.replace(
          '<document',
          '<!DOCTYPE document [ <!ENTITY x SYSTEM "file:///etc/passwd"> ]>\n<document',
        ),
      },
    ]),
    expect: {
      'web-open': refused(
        SAYS.fadeIn('its script isn’t in a form Drafter reads (A DOCTYPE is not allowed'),
      ),
    },
  },
  {
    id: 'fadein-bomb',
    format: 'fadein',
    name: 'bomb.fadein',
    tests: 'A deflate bomb as the document is refused before it is unpacked.',
    bytes: fadeIn([
      { name: 'document.xml', data: '', raw: zeros(64 * MiB), declaredSize: 64 * MiB },
    ]),
    expect: { 'web-open': refused(SAYS.fadeIn('its script is larger than 5 MB.')) },
  },
  {
    id: 'fadein-two-documents',
    format: 'fadein',
    name: 'two.fadein',
    tests: 'Two OSF documents at the top are refused, naming both.',
    bytes: fadeIn([
      { name: 'a.xml', data: OSF },
      { name: 'b.xml', data: OSF },
    ]),
    expect: { 'web-open': refused(SAYS.fadeIn('it holds more than one script (a.xml, b.xml).')) },
  },
  {
    id: 'fadein-decoy',
    format: 'fadein',
    name: 'decoy.fadein',
    tests:
      'Of two .xml entries, the one whose root is OSF’s is read; a bomb beside it is passed over.',
    bytes: fadeIn([
      { name: 'decoy.xml', data: '', raw: zeros(64 * MiB), declaredSize: 64 * MiB },
      { name: 'document.xml', data: OSF },
    ]),
    expect: { 'web-open': opensWith(...SCRIPT_LINES) },
  },
  {
    id: 'fadein-comment-prolog',
    format: 'fadein',
    name: 'comments.fadein',
    tests:
      'Of two .xml entries, one with thousands of empty comments before its root is looked at in linear time.',
    bytes: fadeIn([
      { name: 'a.xml', data: `<?xml version="1.0"?>${'<!---->'.repeat(20_000)}<other/>` },
      { name: 'b.xml', data: OSF },
    ]),
    expect: { 'web-open': opensWith(...SCRIPT_LINES) },
  },
  {
    id: 'fadein-no-xml',
    format: 'fadein',
    name: 'no-xml.fadein',
    tests: 'An archive with no .xml is refused.',
    bytes: fadeIn([{ name: 'readme.txt', data: 'hi' }]),
    expect: { 'web-open': refused(SAYS.fadeIn('it holds no script.')) },
  },
  {
    id: 'fadein-wrong-root',
    format: 'fadein',
    name: 'wrong-root.fadein',
    tests: 'An .xml whose root isn’t OSF’s document is refused.',
    bytes: fadeIn([{ name: 'document.xml', data: text('fdx/valid.fdx') }]),
    expect: {
      'web-open': refused(
        SAYS.fadeIn(
          'its script isn’t in a form Drafter reads (it has no document root holding paragraphs)',
        ),
      ),
    },
  },
  {
    id: 'fadein-traversal',
    format: 'fadein',
    name: 'traversal.fadein',
    tests: 'A document entry named ../document.xml is refused as unsafe.',
    bytes: fadeIn([{ name: '../document.xml', data: OSF }]),
    expect: { 'web-open': refused(SAYS.fadeIn('it holds a file with an unsafe name.')) },
  },
  {
    id: 'fadein-script-in-text',
    format: 'fadein',
    name: 'script.fadein',
    tests: 'Escaped markup in an OSF paragraph comes in as text.',
    bytes: fadeIn([
      {
        name: 'document.xml',
        data: OSF.replace('A lever waits.', '&lt;script&gt;window.__trapped = 1&lt;/script&gt;'),
      },
    ]),
    expect: { 'web-open': opensWith('<script>window.\\_\\_trapped = 1</script>') },
    inert: true,
  },
  {
    id: 'fadein-empty',
    format: 'fadein',
    name: 'empty.fadein',
    tests: 'A 0-byte Fade In file is refused as not a zip.',
    bytes: () => new Uint8Array(),
    expect: { 'web-open': refused(SAYS.fadeIn('it isn’t a zip archive.')) },
  },
];

const HTML_TRAPS: Trap[] = [
  {
    id: 'html-valid',
    format: 'html',
    name: 'valid.html',
    tests: 'The baseline: a page carrying one well-formed block reopens with its script.',
    bytes: () => enc(page(block(SCRIPT))),
    expect: { 'web-open': opens(SCRIPT) },
  },
  {
    id: 'html-valid-markdown',
    format: 'html',
    name: 'notes.html',
    tests: 'A block of kind markdown reopens as a Markdown document.',
    bytes: () => enc(page(block(NOTES, 'markdown'))),
    expect: { 'web-open': opens(NOTES) },
    opensAs: 'markdown',
  },
  {
    id: 'html-no-source',
    format: 'html',
    name: 'no-source.html',
    tests: 'A page with no block is refused as a web page, with what to do.',
    bytes: () => enc(page('<p>Just a page.</p>')),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-two-blocks',
    format: 'html',
    name: 'two.html',
    tests: 'Two blocks are refused: there is no telling which is the script.',
    bytes: () => enc(page(`${block(SCRIPT)}\n${block('INT. ELSEWHERE - DAY\n')}`)),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-block-in-comment',
    format: 'html',
    name: 'commented.html',
    tests:
      'The only block inside an HTML comment is still read: the reader never parses the page, and the text is checked as any opened text.',
    bytes: () => enc(page(`<!-- ${block(SCRIPT)} -->`)),
    expect: { 'web-open': opens(SCRIPT) },
  },
  {
    id: 'html-block-in-comment-and-real',
    format: 'html',
    name: 'commented-twice.html',
    tests: 'A commented-out block beside a real one makes two, and is refused.',
    bytes: () => enc(page(`<!-- ${block('INT. DECOY - DAY\n')} -->\n${block(SCRIPT)}`)),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-block-in-js-string',
    format: 'html',
    name: 'js-string.html',
    tests:
      'The opening text inside a JavaScript string, with no real block: the string’s own quote and the page’s </script> leave no well-formed block, so it is refused, and nothing runs.',
    bytes: () =>
      enc(
        page(
          `<script>var s = '${block(SCRIPT).replace(/\n/g, '\\n').replace('</script>', '<\\/script>')}';</script>`,
        ),
      ),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-kind-injection',
    format: 'html',
    name: 'kind-injection.html',
    tests: 'A data-kind with an attribute smuggled after it (onload) is refused.',
    bytes: () =>
      enc(
        page(
          block(SCRIPT).replace(
            'data-kind="fountain"',
            'data-kind="fountain" onload="window.__trapped=1"',
          ),
        ),
      ),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-kind-unknown',
    format: 'html',
    name: 'kind-unknown.html',
    tests: 'An unknown data-kind (html) is refused.',
    bytes: () => enc(page(rawBlock('html', b64(enc(SCRIPT))))),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-kind-quote',
    format: 'html',
    name: 'kind-quote.html',
    tests: 'A data-kind holding an escaped quote is refused.',
    bytes: () => enc(page(rawBlock('fountain\\', b64(enc(SCRIPT))))),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-base64-invalid',
    format: 'html',
    name: 'base64-invalid.html',
    tests: 'Characters outside base64’s alphabet are refused.',
    bytes: () => enc(page(rawBlock('fountain', 'SU5ULiBIQUxM!!!!'))),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-base64-padding',
    format: 'html',
    name: 'base64-padding.html',
    tests: 'Padding in the middle of the base64 is refused.',
    bytes: () => enc(page(rawBlock('fountain', 'SU5U=CBIQUxM'))),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-base64-bits',
    format: 'html',
    name: 'base64-bits.html',
    tests: 'Padding whose left-over bits aren’t zero (a second spelling) is refused.',
    bytes: () => enc(page(rawBlock('fountain', 'QR=='))),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-base64-length',
    format: 'html',
    name: 'base64-length.html',
    tests: 'Base64 whose length isn’t a multiple of four is refused.',
    bytes: () => enc(page(rawBlock('fountain', 'SU5ULi'))),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-base64-unicode',
    format: 'html',
    name: 'base64-unicode.html',
    tests: 'Non-ASCII look-alikes in the base64 are refused.',
    bytes: () => enc(page(rawBlock('fountain', 'SU5ULi\uff22IQUxM'))),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-base64-spaced',
    format: 'html',
    name: 'base64-spaced.html',
    tests: 'White space between the base64 characters is skipped, and it reopens.',
    bytes: () => enc(page(rawBlock('fountain', b64(enc(SCRIPT)).split('').join(' \t')))),
    expect: { 'web-open': opens(SCRIPT) },
  },
  {
    id: 'html-not-utf8',
    format: 'html',
    name: 'not-utf8.html',
    tests: 'A block of base64 whose bytes aren’t UTF-8 is refused as not UTF-8.',
    bytes: () => enc(page(rawBlock('fountain', b64(concat('Caf', [0xe9, 0x80], '\n'))))),
    expect: { 'web-open': refused(SAYS.notUtf8) },
  },
  {
    id: 'html-nul',
    format: 'html',
    name: 'nul.html',
    tests: 'A block whose bytes hold a NUL is refused as not text.',
    bytes: () => enc(page(rawBlock('fountain', b64(concat('INT. HALL\n', [0], '\n'))))),
    expect: { 'web-open': refused(SAYS.binary) },
  },
  {
    id: 'html-unclosed',
    format: 'html',
    name: 'unclosed.html',
    tests: 'A block with no </script> is refused.',
    bytes: () => enc(page(block(SCRIPT).replace('</script>', ''))),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-hostile-page',
    format: 'html',
    name: 'hostile.html',
    tests:
      'A valid block in a page of scripts, a meta refresh, iframes, a form, and remote images: the script opens, and nothing on the page is run or fetched.',
    bytes: () => enc(page(`${HOSTILE_BODY}\n${block(SCRIPT)}`, HOSTILE_HEAD)),
    expect: { 'web-open': opens(SCRIPT) },
  },
  {
    id: 'html-hostile-source',
    format: 'html',
    name: 'hostile-source.html',
    tests: 'A block whose script is itself markup opens as text, and stays text.',
    bytes: () => enc(page(block(text('fountain/action-html.fountain')))),
    expect: { 'web-open': opens(text('fountain/action-html.fountain')) },
    inert: true,
  },
  {
    id: 'html-reordered',
    format: 'html',
    name: 'reordered.html',
    tests:
      'A block whose attributes are in another order isn’t Drafter’s exact opening, and is refused.',
    bytes: () =>
      enc(
        page(
          `<script id="drafter-source" type="text/plain" data-kind="fountain" data-encoding="base64">\n${b64(enc(SCRIPT))}\n</script>`,
        ),
      ),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-uppercase',
    format: 'html',
    name: 'uppercase.html',
    tests: 'A block in upper case isn’t Drafter’s exact opening, and is refused.',
    bytes: () =>
      enc(
        page(
          block(SCRIPT)
            .replace(
              '<script type="text/plain" id="drafter-source"',
              '<SCRIPT TYPE="text/plain" ID="drafter-source"',
            )
            .replace('</script>', '</SCRIPT>'),
        ),
      ),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-entity-encoded',
    format: 'html',
    name: 'entities.html',
    tests:
      'A block written with HTML entities (&lt;script …) is text, not a block, and is refused.',
    bytes: () =>
      enc(
        page(
          `<pre>${block(SCRIPT).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</pre>`,
        ),
      ),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-bom-doctype',
    format: 'html',
    name: 'bom.htm',
    tests: 'A .htm page with a byte order mark before its doctype reopens.',
    bytes: () => concat([0xef, 0xbb, 0xbf], page(block(SCRIPT))),
    expect: { 'web-open': opens(SCRIPT) },
  },
  {
    id: 'html-empty',
    format: 'html',
    name: 'empty.html',
    tests: 'A 0-byte .html file is refused as a web page.',
    bytes: () => new Uint8Array(),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-utf16',
    format: 'html',
    name: 'utf16.html',
    tests: 'A UTF-16 page is refused: its block can’t be found in UTF-8.',
    bytes: () => utf16(page(block(SCRIPT)), false),
    expect: { 'web-open': refused(SAYS.webPage) },
  },
  {
    id: 'html-block-at-cap',
    format: 'html',
    name: 'block-at-cap.html',
    tests: 'A block whose script is exactly 5 MB reopens.',
    bytes: () =>
      enc(
        page(
          block(new TextDecoder().decode(sized(SCRIPT_CAP, 'Title: Big\n\n', 'A lever waits.\n'))),
        ),
      ),
    expect: { 'web-open': opens(undefined, { chars: SCRIPT_CAP }) },
    large: true,
    limitMs: 10_000,
    memoryMB: 512,
  },
  {
    id: 'html-block-over-cap',
    format: 'html',
    name: 'block-over-cap.html',
    tests: 'A block whose script is one byte over 5 MB is refused as too big.',
    bytes: () =>
      enc(
        page(
          block(
            new TextDecoder().decode(sized(SCRIPT_CAP + 1, 'Title: Big\n\n', 'A lever waits.\n')),
          ),
        ),
      ),
    expect: {
      'web-open': refused(SAYS.importTooBig),
      'cli-convert': refused('the script in it is larger than 5 MB'),
      // The reader gives nothing for it; the app asks why (`sourceTooBig`).
      package: refused(SAYS.webPage),
    },
    large: true,
    limitMs: 5000,
  },
  {
    id: 'html-file-over-cap',
    format: 'html',
    name: 'file-over-cap.html',
    tests: 'A page over 32 MB is refused before it is read, whatever it carries.',
    bytes: () => enc(page(`${block(SCRIPT)}\n<!--${' '.repeat(ARCHIVE_CAP)}-->`)),
    expect: {
      'web-open': refused(SAYS.unreadable),
      'desktop-open': refused('too big to be a Drafter export (over 32 MB)'),
      'cli-convert': refused('it is larger than 32 MB'),
    },
    large: true,
  },
  {
    id: 'html-padded-oversized',
    format: 'html',
    name: 'padded.html',
    tests: '20 MB of white space inside the base64 is given up on early, not decoded.',
    bytes: () => enc(page(rawBlock('fountain', `${b64(enc(SCRIPT))}${' '.repeat(20 * MiB)}`))),
    expect: { 'web-open': refused(SAYS.webPage) },
    large: true,
  },
];

const EPUB_TRAPS: Trap[] = [
  {
    id: 'epub-valid',
    format: 'epub',
    name: 'valid.epub',
    tests: 'The baseline: an EPUB carrying EPUB/drafter-source.fountain reopens with its script.',
    bytes: epub([source('fountain', SCRIPT)]),
    expect: { 'web-open': opens(SCRIPT) },
  },
  {
    id: 'epub-valid-markdown',
    format: 'epub',
    name: 'notes.epub',
    tests: 'An EPUB carrying drafter-source.md reopens as Markdown.',
    bytes: epub([source('markdown', NOTES)]),
    expect: { 'web-open': opens(NOTES) },
    opensAs: 'markdown',
  },
  {
    id: 'epub-no-source',
    format: 'epub',
    name: 'no-source.epub',
    tests: 'An EPUB with no source entry is refused as an e-book.',
    bytes: epub([]),
    expect: { 'web-open': refused(SAYS.eBook) },
  },
  {
    id: 'epub-both-sources',
    format: 'epub',
    name: 'both.epub',
    tests: 'Both a .fountain and a .md source are refused.',
    bytes: epub([source('fountain', SCRIPT), source('markdown', NOTES)]),
    expect: { 'web-open': refused(SAYS.eBook) },
  },
  {
    id: 'epub-source-traversal',
    format: 'epub',
    name: 'traversal.epub',
    tests: 'A source entry named with ../ is refused, never used as a path.',
    bytes: epub([{ name: `EPUB/../${SOURCE_ENTRY.fountain}`, data: SCRIPT }]),
    expect: { 'web-open': refused(SAYS.eBook) },
  },
  {
    id: 'epub-source-elsewhere',
    format: 'epub',
    name: 'elsewhere.epub',
    tests: 'A drafter-source.fountain anywhere but EPUB/ isn’t the source, and is refused.',
    bytes: epub([{ name: 'OEBPS/drafter-source.fountain', data: SCRIPT }]),
    expect: { 'web-open': refused(SAYS.eBook) },
  },
  {
    id: 'epub-source-bomb',
    format: 'epub',
    name: 'bomb.epub',
    tests:
      'A deflate bomb as the source entry is refused by its declared size, as too big, before it is unpacked.',
    bytes: epub([source('fountain', '', { raw: zeros(64 * MiB), declaredSize: 64 * MiB })]),
    expect: {
      'web-open': refused(SAYS.importTooBig),
      'cli-convert': refused('the script in it is larger than 5 MB'),
      package: refused(SAYS.eBook),
    },
  },
  {
    id: 'epub-source-bomb-lying',
    format: 'epub',
    name: 'bomb-lying.epub',
    tests: 'A source bomb declaring a small size is refused as damaged.',
    bytes: epub([source('fountain', '', { raw: zeros(64 * MiB), declaredSize: 100 })]),
    expect: { 'web-open': refused(SAYS.eBook) },
  },
  {
    id: 'epub-scripts',
    format: 'epub',
    name: 'scripts.epub',
    tests: 'An EPUB whose pages hold scripts and remote images: only the source is read.',
    bytes: epub([
      {
        name: 'EPUB/evil.xhtml',
        data: `<html xmlns="http://www.w3.org/1999/xhtml"><body>${HOSTILE_BODY}<script>window.__trapped=1</script></body></html>`,
      },
      source('fountain', SCRIPT),
    ]),
    expect: { 'web-open': opens(SCRIPT) },
  },
  {
    id: 'epub-broken-but-source',
    format: 'epub',
    name: 'broken.epub',
    tests:
      'A valid source in an otherwise broken EPUB (no container, no package, broken pages) reopens.',
    bytes: () =>
      trapZip([
        { name: 'mimetype', data: 'application/epub+zip', method: 0 },
        { name: 'EPUB/page.xhtml', data: '<html><body><p>unclosed' },
        { name: SOURCE_ENTRY.fountain, data: SCRIPT },
      ]),
    expect: { 'web-open': opens(SCRIPT) },
  },
  {
    id: 'epub-mimetype-second',
    format: 'epub',
    name: 'mimetype-second.epub',
    tests:
      'An EPUB whose mimetype entry isn’t first is not an EPUB by EPUB’s own rule, and is refused.',
    bytes: epub([source('fountain', SCRIPT)], { first: [{ name: 'README', data: 'x' }] }),
    expect: { 'web-open': refused(SAYS.eBook) },
  },
  {
    id: 'epub-mimetype-wrong',
    format: 'epub',
    name: 'mimetype-wrong.epub',
    tests: 'An EPUB whose mimetype says application/zip is refused.',
    bytes: epub([source('fountain', SCRIPT)], { mimetype: 'application/zip' }),
    expect: { 'web-open': refused(SAYS.eBook) },
  },
  {
    id: 'epub-source-not-utf8',
    format: 'epub',
    name: 'latin1.epub',
    tests: 'A source that isn’t UTF-8 is refused as not UTF-8.',
    bytes: epub([source('fountain', concat('Caf', [0xe9], '\n'))]),
    expect: { 'web-open': refused(SAYS.notUtf8) },
  },
  {
    id: 'epub-source-nul',
    format: 'epub',
    name: 'nul.epub',
    tests: 'A source holding a NUL is refused as not text.',
    bytes: epub([source('fountain', concat('INT. HALL\n', [0], '\n'))]),
    expect: { 'web-open': refused(SAYS.binary) },
  },
  {
    id: 'epub-source-encrypted',
    format: 'epub',
    name: 'encrypted.epub',
    tests: 'An encrypted source entry is refused.',
    bytes: epub([source('fountain', SCRIPT, { flags: 1 })]),
    expect: { 'web-open': refused(SAYS.eBook) },
  },
  {
    id: 'epub-source-symlink',
    format: 'epub',
    name: 'symlink.epub',
    tests: 'A source entry that is a symlink is never followed: its stored path is the text.',
    bytes: epub([
      source('fountain', '/etc/passwd', { method: 0, madeBy: 3, external: SYMLINK_ATTRS }),
    ]),
    expect: { 'web-open': opens('/etc/passwd') },
  },
  {
    id: 'epub-empty',
    format: 'epub',
    name: 'empty.epub',
    tests: 'A 0-byte .epub is refused as an e-book.',
    bytes: () => new Uint8Array(),
    expect: { 'web-open': refused(SAYS.eBook) },
  },
  {
    id: 'epub-truncated',
    format: 'epub',
    name: 'truncated.epub',
    tests: 'An EPUB cut short is refused.',
    bytes: () => epub([source('fountain', SCRIPT)])().subarray(0, 120),
    expect: { 'web-open': refused(SAYS.eBook) },
  },
];

/** A named pipe at `dir/name`, made with the system's mkfifo. */
const fifo = (dir: string, name: string) => {
  const path = join(dir, name);
  execFileSync('mkfifo', [path]);
  return path;
};
/** A symbolic link at `dir/name` to `target`. */
const link = (dir: string, name: string, target: string) => {
  const path = join(dir, name);
  symlinkSync(target, path);
  return path;
};
/** A folder at `dir/name`. */
const folder = (dir: string, name: string) => {
  const path = join(dir, name);
  mkdirSync(path);
  return path;
};

/** Special files: made on disk, so only the desktop app and the command line meet them. */
const FILE_TRAPS: Trap[] = [
  {
    id: 'files-unicode-name',
    format: 'files',
    name: 'Ünïcödé 🚂 名前.fountain',
    tests: 'A name with accents, emoji, and CJK opens.',
    bytes: () => enc(SCRIPT),
    expect: { 'desktop-open': opens(SCRIPT), 'cli-build': opens() },
  },
  {
    id: 'files-spaces-name',
    format: 'files',
    name: '  a script with   spaces .fountain',
    tests: 'A name with leading, inner, and trailing spaces opens.',
    bytes: () => enc(SCRIPT),
    expect: { 'desktop-open': opens(SCRIPT), 'cli-build': opens() },
  },
  {
    id: 'files-dash-name',
    format: 'files',
    name: '-rf.fountain',
    tests:
      'A name starting with a dash is a flag on a command line, left out in silence (after -- it is a file).',
    bytes: () => enc(SCRIPT),
    expect: { 'desktop-open': refused(SAYS.silent), 'cli-build': opens() },
  },
  {
    id: 'files-long-name',
    format: 'files',
    name: `${'L'.repeat(240)}.fountain`,
    tests: 'A name of 249 bytes, near the longest a disk allows, opens.',
    bytes: () => enc(SCRIPT),
    expect: { 'desktop-open': opens(SCRIPT), 'cli-build': opens() },
  },
  {
    id: 'files-directory',
    format: 'files',
    name: 'folder.fountain',
    tests: 'A folder named like a script is refused, not read.',
    place: (dir) => folder(dir, 'folder.fountain'),
    expect: { 'desktop-open': refused(SAYS.notAFile), 'cli-build': refused("it's a folder") },
  },
  {
    id: 'files-directory-fdx',
    format: 'files',
    name: 'folder.fdx',
    tests:
      'A folder named like a Final Draft file is searched as a folder, holding nothing to convert.',
    place: (dir) => folder(dir, 'folder.fdx'),
    expect: { 'cli-convert': refused('nothing to convert') },
  },
  {
    id: 'files-fifo',
    format: 'files',
    name: 'pipe.fountain',
    tests: 'A named pipe is refused at once, never opened (opening one would wait for a writer).',
    place: (dir) => fifo(dir, 'pipe.fountain'),
    expect: { 'desktop-open': refused(SAYS.notAFile), 'cli-build': refused(SAYS.cliNotAFile) },
  },
  {
    id: 'files-fifo-fdx',
    format: 'files',
    name: 'pipe.fdx',
    tests: 'A named pipe named .fdx is refused by convert without hanging.',
    place: (dir) => fifo(dir, 'pipe.fdx'),
    expect: { 'cli-convert': refused(SAYS.cliNotAFile), 'desktop-open': refused(SAYS.notAFile) },
  },
  {
    id: 'files-dev-zero',
    format: 'files',
    name: 'zero.fountain',
    tests: 'A link to /dev/zero, an endless device, is refused, not read until memory runs out.',
    place: (dir) => link(dir, 'zero.fountain', '/dev/zero'),
    expect: { 'desktop-open': refused(SAYS.notAFile), 'cli-build': refused(SAYS.cliNotAFile) },
  },
  {
    id: 'files-passwd-link',
    format: 'files',
    name: 'passwd.fountain',
    tests:
      'A link named .fountain to /etc/passwd: the desktop app judges a file by where it leads and refuses it; the command line reads what it was named, as any tool does.',
    place: (dir) => link(dir, 'passwd.fountain', '/etc/passwd'),
    expect: { 'desktop-open': refused(SAYS.notAScript), 'cli-build': opens() },
  },
  {
    id: 'files-passwd-link-fdx',
    format: 'files',
    name: 'passwd.fdx',
    tests: 'A link named .fdx to /etc/passwd is read only as XML, and refused.',
    place: (dir) => link(dir, 'passwd.fdx', '/etc/passwd'),
    expect: { 'cli-convert': refused(SAYS.fdx('Text before the root element')) },
  },
  {
    id: 'files-dangling-link',
    format: 'files',
    name: 'dangling.fountain',
    tests: 'A link to nothing is said to be missing.',
    place: (dir) => link(dir, 'dangling.fountain', join(dir, 'nothing-here.fountain')),
    expect: { 'desktop-open': refused('it isn’t there'), 'cli-build': refused('no such file') },
  },
  {
    id: 'files-over-desktop-cap',
    format: 'files',
    name: 'huge.fountain',
    tests: 'A 65 MB file is refused by the desktop app’s read cap before it reaches the page.',
    bytes: () => sized(DESKTOP_READ_CAP + MiB, 'Title: Huge\n\n', 'A lever waits.\n'),
    expect: {
      'desktop-open': refused('it is too big (over 64 MB)'),
      'cli-build': refused(SAYS.cliTooBig),
    },
    large: true,
    limitMs: 10_000,
  },
];

/** A module folder's manifest, for the desktop app's modules folder. */
const manifest = (value: unknown) => () =>
  enc(typeof value === 'string' ? value : JSON.stringify(value));
const MODULE = {
  id: 'trap-module',
  name: 'Trap',
  description: 'A module of the traps.',
  permissions: {},
};

const MODULE_TRAPS: Trap[] = [
  {
    id: 'module-valid',
    format: 'modules',
    name: 'module.json',
    tests: 'The baseline: a well-formed module.json with an index.js loads.',
    bytes: manifest(MODULE),
    expect: { 'desktop-modules': opens() },
  },
  {
    id: 'module-not-json',
    format: 'modules',
    name: 'module.json',
    tests: 'A module.json that isn’t JSON is skipped, naming why.',
    bytes: manifest('{"id": "trap-module", '),
    expect: { 'desktop-modules': refused('isn’t valid JSON') },
  },
  {
    id: 'module-too-big',
    format: 'modules',
    name: 'module.json',
    tests: 'A module.json one byte over 64 KB is skipped before it is read.',
    bytes: () => sized(MANIFEST_CAP + 1, '{"id":"trap-module","x":"', 'x', '"}'),
    expect: { 'desktop-modules': refused('larger than 64 KB') },
  },
  {
    id: 'module-traversal-id',
    format: 'modules',
    name: 'module.json',
    tests: 'An id of ../../evil is refused: an id is a host name.',
    bytes: manifest({ ...MODULE, id: '../../evil' }),
    expect: { 'desktop-modules': refused('its id must be') },
  },
  {
    id: 'module-wildcard-origin',
    format: 'modules',
    name: 'module.json',
    tests: 'A network origin of https://* (a CSP wildcard) is refused.',
    bytes: manifest({ ...MODULE, permissions: { network: ['https://*'] } }),
    expect: { 'desktop-modules': refused('is not an origin') },
  },
  {
    id: 'module-csp-injection',
    format: 'modules',
    name: 'module.json',
    tests: 'An origin carrying a ; to end the CSP source list is refused.',
    bytes: manifest({
      ...MODULE,
      permissions: { network: ["https://a.example; script-src 'unsafe-inline'"] },
    }),
    expect: { 'desktop-modules': refused('is not an origin') },
  },
  {
    id: 'module-drafter-name',
    format: 'modules',
    name: 'module.json',
    tests: 'A module calling itself Drafter is refused.',
    bytes: manifest({ ...MODULE, name: 'Drafter Updater' }),
    expect: { 'desktop-modules': refused('can’t be “Drafter”') },
  },
  {
    id: 'module-proto',
    format: 'modules',
    name: 'module.json',
    tests:
      'A module.json whose permissions come only under a __proto__ key is refused: in JSON that is a plain key, not the prototype.',
    bytes: manifest(
      '{"id":"trap-module","name":"Trap","description":"d","__proto__":{"permissions":{"network":["https://evil.example"]}}}',
    ),
    expect: { 'desktop-modules': refused('no permissions object') },
  },
  {
    id: 'module-manifest-fifo',
    format: 'modules',
    name: 'module.json',
    tests: 'A module.json that is a named pipe is skipped without hanging.',
    place: (dir) => fifo(dir, 'module.json'),
    expect: { 'desktop-modules': refused('it has no module.json') },
  },
];

// ---- Drafts and cuts beside the work ---------------------------------------------------------
//
// The cuts file (`Boca.fountain.cuts.md`) and draft files (`Boca drafts/Boca – Draft 01.fountain`)
// are read back when the work opens, and may have been edited anywhere: by hand, on another
// computer, or by anything that can write to the folder. `beside-read` is the app's reading of
// them (apps/web/app/beside/read.ts): a cuts file's entries checked by their IDs and merged into
// none (the outcome's text is the cuts kept, one title a line; its message is what the lists say
// was left out); a draft file's text and whether its ID still holds.

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const FROZEN = '2026-10-01T09:00:00.000Z';
const cut = (title: string, text: string, more: Partial<CutEntry> = {}): CutEntry => ({
  id: sha256(text),
  title,
  text,
  kind: 'fountain',
  cuts: [{ at: FROZEN, draft: 2 }],
  where: { after: 'INT. HALL - DAY', before: null },
  ...more,
});
const KEPT = cut('THE FERRY', 'MARRA\nThe ferry left without us, and nobody said a word.');
const cutsBytes =
  (...entries: CutEntry[]) =>
  () =>
    enc(cutsFile('Boca.fountain', entries));
const DRAFT_TEXT = 'Title: Boca\n\nINT. HALL - DAY\n\nMarra waits.\n';
const draftBytes =
  (text: string, id = sha256(text)) =>
  () =>
    enc(draftFile(text, { draft: 3, id, frozen: FROZEN, note: 'from Sam’s notes' }, 'fountain'));
const LEFT_OUT = (n: number) =>
  n === 1
    ? '1 cut in “Boca.fountain.cuts.md” couldn’t be read'
    : `${n} cuts in “Boca.fountain.cuts.md” couldn’t be read`;

const BESIDE_TRAPS: Trap[] = [
  {
    id: 'cuts-valid',
    format: 'cuts',
    name: 'Boca.fountain.cuts.md',
    tests: 'The baseline: a cuts file as Drafter writes it reads back with its one cut.',
    bytes: cutsBytes(KEPT),
    expect: { 'beside-read': opens('THE FERRY') },
  },
  {
    id: 'cuts-forged-id',
    format: 'cuts',
    name: 'Boca.fountain.cuts.md',
    tests:
      'An entry whose text was changed under its ID (a forged ID) is left out, and said so; the good one is kept.',
    bytes: cutsBytes(KEPT, { ...KEPT, title: 'FORGED', text: 'Text that ID was never of.' }),
    expect: { 'beside-read': warns(LEFT_OUT(1), { text: 'THE FERRY' }) },
  },
  {
    id: 'cuts-huge',
    format: 'cuts',
    name: 'Boca.fountain.cuts.md',
    tests: 'A cuts file over 32 MB is refused before it is read, and left as it is.',
    bytes: () => sized(32 * MiB + 1, '# Cuts from Boca.fountain\n\n', 'x'),
    expect: { 'beside-read': refused('it is too big (over 32 MB)') },
    large: true,
    limitMs: 10_000,
  },
  {
    id: 'cuts-duplicates',
    format: 'cuts',
    name: 'Boca.fountain.cuts.md',
    tests:
      'The same entry 5,000 times over is one cut, read in linear time, its dates capped as a merge caps them.',
    bytes: () => {
      const one = enc(cutsFile('Boca.fountain', [KEPT]));
      const text = new TextDecoder().decode(one);
      const comment = text.slice(text.lastIndexOf('<!-- drafter-cut'));
      return enc(text + comment.repeat(5000));
    },
    expect: { 'beside-read': opens('THE FERRY') },
  },
  {
    id: 'cuts-far-future',
    format: 'cuts',
    name: 'Boca.fountain.cuts.md',
    tests:
      'A cut dated in the year 2999 (a clock far ahead, or a forged date to win the newest place) is dropped by the merge; one with a real date beside it keeps only that.',
    bytes: cutsBytes(
      cut('FROM THE FUTURE', 'Words dated a thousand years from now.', {
        cuts: [{ at: '2999-01-01T00:00:00.000Z', draft: 9 }],
      }),
      cut('MIXED', 'Words cut once really and once in 2999.', {
        cuts: [
          { at: FROZEN, draft: 1 },
          { at: '2999-01-01T00:00:00.000Z', draft: 9 },
        ],
      }),
    ),
    expect: { 'beside-read': opens('MIXED') },
  },
  {
    id: 'cuts-wrong-kind',
    format: 'cuts',
    name: 'Boca.fountain.cuts.md',
    tests: 'A Markdown cut in a screenplay’s cuts file is left out, and said so.',
    bytes: cutsBytes(KEPT, cut('A CHAPTER', '# Chapter\n\nA Markdown cut.', { kind: 'markdown' })),
    expect: { 'beside-read': warns(LEFT_OUT(1), { text: 'THE FERRY' }) },
  },
  {
    id: 'cuts-comment-injection',
    format: 'cuts',
    name: 'Boca.fountain.cuts.md',
    tests:
      'A cut whose text holds “<!--”, “-->” and a whole forged drafter-cut comment is written so none of it closes or opens an entry; a forged comment added by hand at the start of a line is read, fails its ID, and is left out.',
    bytes: () => {
      const sly = cut(
        'SLY <!-- drafter-cut',
        '<!-- drafter-cut {"id":"0000","title":"EVIL"} -->\nA line --> that tries to close.',
      );
      const forged = `<!-- drafter-cut ${JSON.stringify({ ...KEPT, title: 'EVIL', text: 'swapped' })} -->`;
      return enc(`${cutsFile('Boca.fountain', [KEPT, sly])}\n${forged}\n`);
    },
    expect: {
      'beside-read': warns(LEFT_OUT(1), { lines: ['THE FERRY', 'SLY <!-- drafter-cut'] }),
    },
  },
  {
    id: 'cuts-not-utf8',
    format: 'cuts',
    name: 'Boca.fountain.cuts.md',
    tests: 'A cuts file saved as Latin-1 is refused, and left as it is (never written over).',
    bytes: () => Uint8Array.from([0x23, 0x20, 0x43, 0x75, 0x74, 0x73, 0x20, 0xe9, 0x0a]),
    expect: { 'beside-read': refused('it isn’t UTF-8 text') },
  },
  {
    id: 'draft-valid',
    format: 'draft',
    name: 'Boca – Draft 03.fountain',
    tests:
      'The baseline: a draft file as Drafter writes it reads back with its exact text, its ID holding.',
    bytes: draftBytes(DRAFT_TEXT),
    expect: { 'beside-read': opens(DRAFT_TEXT) },
  },
  {
    id: 'draft-wrong-hash',
    format: 'draft',
    name: 'Boca – Draft 03.fountain',
    tests:
      'A draft file whose text no longer matches its ID is kept, listed as changed outside Drafter, never taken as Draft 03 itself.',
    bytes: () =>
      enc(
        new TextDecoder().decode(draftBytes(DRAFT_TEXT)()).replace('Marra waits.', 'Marra leaves.'),
      ),
    expect: {
      'beside-read': warns('changed outside Drafter', {
        text: DRAFT_TEXT.replace('Marra waits.', 'Marra leaves.'),
      }),
    },
  },
  {
    id: 'draft-nested-blocks',
    format: 'draft',
    name: 'Boca – Draft 03.fountain',
    tests:
      'A draft block written inside another by hand (a /* drafter block whose JSON holds another) is a problem, not a crash, and nothing is read as a draft.',
    bytes: () =>
      enc(
        `${DRAFT_TEXT}\n/* drafter\n{"v":1,"draft":3,"id":"${sha256(DRAFT_TEXT)}","frozen":"${FROZEN}","note":"/* drafter\n{\\"draft\\":9}\n*/"}\n*/\n`,
      ),
    expect: { 'beside-read': refused('isn’t') },
  },
  {
    id: 'draft-refrozen',
    format: 'draft',
    name: 'Boca – Draft 03.fountain',
    tests:
      'A draft of a draft file (its text ends with an older draft block) keeps the older block as text, and its own ID holds.',
    bytes: () => {
      const older = new TextDecoder().decode(draftBytes(DRAFT_TEXT)());
      return draftBytes(older)();
    },
    expect: { 'beside-read': opensWith('Title: Boca', '"draft":3') },
  },
  {
    id: 'draft-crlf',
    format: 'draft',
    name: 'Boca – Draft 03.fountain',
    tests:
      'A draft file with CRLF line breaks (written on Windows, or by an editor) still verifies: its ID is of the text with line feeds.',
    bytes: () => enc(new TextDecoder().decode(draftBytes(DRAFT_TEXT)()).replace(/\n/g, '\r\n')),
    expect: { 'beside-read': opens(DRAFT_TEXT) },
  },
  {
    id: 'draft-no-block',
    format: 'draft',
    name: 'Boca – Draft 03.fountain',
    tests: 'A file named as a draft but with no draft block is not read as a draft.',
    bytes: () => enc(DRAFT_TEXT),
    expect: { 'beside-read': refused('block') },
  },
];

/** The formats Drafter for Claude reads (packages/mcp/src/formats.ts). */
export const MCP_FORMATS: ReadonlySet<Format> = new Set([
  'fountain',
  'text',
  'markdown',
  'fdx',
  'highland',
  'fadein',
  'html',
  'epub',
]);

export const TRAPS: readonly Trap[] = [
  ...TEXT_KINDS.flatMap(textTraps),
  ...FOUNTAIN_TRAPS,
  ...CLASSIC_TRAPS,
  ...PRODUCTION_TRAPS,
  ...MARKDOWN_TRAPS,
  ...NOVEL_TRAPS,
  ...MANUSCRIPT_TRAPS,
  ...FDX_TRAPS,
  ...HIGHLAND_TRAPS,
  ...FADE_IN_TRAPS,
  ...HTML_TRAPS,
  ...EPUB_TRAPS,
  ...FILE_TRAPS,
  ...MODULE_TRAPS,
  ...BESIDE_TRAPS,
].map(withDefaults);

/**
 * Fills in the entry points a trap goes through, from what it is: every file the app opens goes
 * through the web app's Open and the desktop app's (with the web app's outcome unless it says
 * otherwise); a file `convert` reads, through `convert`; a Fountain file, through `build`; and each
 * format with a reader of its own, through it.
 */
function withDefaults(trap: Trap): Trap {
  const expect = { ...trap.expect };
  const web = expect['web-open'];
  if (web) {
    expect['desktop-open'] ??= web;
    if (/\.(fdx|highland|fadein|html?|epub)$/i.test(trap.name)) expect['cli-convert'] ??= web;
    if (/\.fountain$/i.test(trap.name)) expect['cli-build'] ??= buildOutcome(web);
    if (trap.format !== 'text' && trap.format !== 'files' && !expect.package) {
      const outcome = packageOutcome(trap, web);
      if (outcome) expect.package = outcome;
    }
    if (MCP_FORMATS.has(trap.format)) expect.mcp ??= mcpOutcome(web);
    if (web.kind !== 'refused' && opensAs(trap) === 'fountain') expect.classic ??= opens();
    // A Markdown file that opens is read as a novel too: it may be one, and its headings are the input.
    if (web.kind !== 'refused' && trap.format === 'markdown') expect.novel ??= opens();
  }
  for (const entry of Object.keys(trap.keptOut ?? {}) as Entry[]) delete expect[entry];
  return { ...trap, expect };
}

/** What a trap that opens opens as: Markdown by its name or its block's kind, else Fountain. */
function opensAs(trap: Trap): 'fountain' | 'markdown' {
  if (trap.opensAs) return trap.opensAs;
  return trap.format === 'markdown' || /\.(?:md|markdown)$/i.test(trap.name)
    ? 'markdown'
    : 'fountain';
}

/**
 * What `build` does with a file the app opens or refuses: it lays out any regular file of at most
 * 5 MB as text, whatever it holds (it never writes over its input, so a file that isn't UTF-8 or
 * holds a NUL can't be harmed; docs/DEFERRED.md asks whether it should refuse them as Open does).
 */
function buildOutcome(web: Outcome): Outcome {
  if (web.kind === 'refused' && web.says === SAYS.tooBig) return refused(SAYS.cliTooBig);
  return opens();
}

/**
 * Drafter for Claude's outcome for a file the app opens or refuses: opened (its text isn't
 * compared: the tools give parts of it), or refused in the server's words.
 */
function mcpOutcome(web: Outcome): Outcome {
  if (web.kind !== 'refused') return opens();
  const words: Partial<Record<string, string>> = {
    [SAYS.tooBig]: SAYS.cliTooBig,
    [SAYS.importTooBig]: SAYS.mcpImportTooBig,
    [SAYS.unreadable]: SAYS.mcpUnreadable,
  };
  return refused(words[web.says] ?? web.says);
}

/** A format's reader on its own: an import's outcome is its reader's; text always parses. */
function packageOutcome(trap: Trap, web: Outcome): Outcome | undefined {
  if (trap.format === 'fountain' || trap.format === 'markdown') {
    // Text the app refuses (too big, not UTF-8, not text) never reaches the reader.
    return web.kind === 'refused' ? undefined : opens();
  }
  return web;
}

/** The entry points a trap must go through. */
export const via = (trap: Trap): Entry[] => Object.keys(trap.expect) as Entry[];

/** The traps going through `entry`. */
export const trapsFor = (entry: Entry): Trap[] => TRAPS.filter((t) => entry in t.expect);
