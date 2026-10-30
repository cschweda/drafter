# @drafter/archive

Highland (`.highland`) and Fade In (`.fadein`) files, which come packed as a zip, for [Drafter](https://github.com/cschweda/drafter). Both readers were built from the formats' public descriptions and synthetic test files; they haven't yet been checked against files the apps made (see `docs/DEFERRED.md`). It holds Drafter's own strict, read-only zip reader, written from PKWARE's APPNOTE.TXT: it reads an archive already in memory, lists its entries from the central directory with every safety rule applied, and reads one entry at a time. Nothing is ever written, and an entry's name is only ever looked up, never used as a path. It touches no file and no DOM, so it runs in Node, in a browser, and in a worker.

```ts
import { listZip, readEntry, ZipError, ZIP_LIMITS } from '@drafter/archive';

try {
  const entries = listZip(bytes); // synchronous: the central directory, checked
  const text = entries.find((e) => e.name === 'text.md');
  if (text) console.log(new TextDecoder().decode(await readEntry(bytes, text)));
} catch (error) {
  if (error instanceof ZipError) console.log(error.reason, error.message); // e.g. 'encrypted'
}
```

**What it refuses** (`ZipError.reason`), so a hostile archive costs at most a bounded, linear amount of work:

- an archive over 32 MiB (`too-big`), with more than 1,000 entries (`too-many-entries`), or whose declared sizes sum past 256 MiB (`too-big-unpacked`), before anything is inflated
- anything that isn't a zip (`not-zip`): no end record in the last 65,557 bytes whose comment runs exactly to the end, or bytes prepended, as a self-extractor has
- zip64 (`zip64`), a split archive (`split`), and an archive holding any encrypted entry (`encrypted`)
- a name that is empty or absolute, or holds `\`, NUL or another control character (C1 among them, when it decodes as UTF-8; a name without flag bit 11 that isn't UTF-8 is read as Latin-1, its bytes 0x80 to 0x9F as U+FFFD), a line or paragraph separator, a bidi control, a `..` segment, or a drive letter (`unsafe-name`), and two entries of one name (`duplicate-name`), even in an entry that is never read
- overlapping entries, a local header that disagrees with its central record (name, method, UTF-8 flag, and, without a data descriptor, CRC-32 and sizes), data or a directory outside the file, a deflate stream far longer than its size could need, cut short, with bytes after its end, with Huffman codes zlib wouldn't take, or giving other than its declared size, and a CRC-32 mismatch (`damaged`)
- an entry declared over 5 MiB (`entry-too-big`), a method other than stored or deflate (`method`), and a deflated entry where the platform has no `DecompressionStream('deflate-raw')` (`no-inflate`)

A deflated entry is walked first, without inflating (`deflate.ts`, from RFC 1951), to count the bytes it gives and find the stream's end, so a zip bomb is refused before any output is made; then the platform's `DecompressionStream` inflates it, its output counted chunk by chunk and cut off past the declared size. The limits are `ZIP_LIMITS`, and each call takes smaller (or larger) ones.

## Highland

`fromHighland(bytes)` reads the script out of a `.highland` file. By the app maker's public description, the file is a zip of a TextBundle: `text.fountain` (or `text.markdown`, `text.txt`) holds the script as Fountain, `info.json` and other JSON files hold the app's own settings and data, and `assets/` holds images. The script comes in exactly as Highland wrote it (a BOM taken off, line endings made `\n`), since it is already Fountain; every other entry, except the app's JSON (`HIGHLAND_METADATA`), `__MACOSX/`, and dot-files, is named, never read, in one note at the script's end (at most 50 names of up to 255 characters each, and about 16 KB, then "and N more"):

```fountain
[[highland: Also in the file, not brought in: notes.txt, assets/cover.png]]
```

```ts
import { ArchiveError, fromHighland } from '@drafter/archive';

try {
  const { text, mapped } = await fromHighland(bytes); // mapped: [{ type: 'Also in the file', count: 1 }]
} catch (error) {
  if (error instanceof ArchiveError) console.log(error.reason, error.message);
  // e.g. 'no-script': "This isn’t a Highland file Drafter can read: it holds no script."
}
```

The script is the `text.*` (`.fountain`, `.markdown`, `.md`, or `.txt`, read as Fountain whatever its extension) at the shallowest depth, since subfolders hold revisions, `.fountain` preferred there; two left is `many-scripts`. Only when there is no `text.*` is the one `.fountain` entry, or the shallowest, read, never a bare `.txt` or `.md`; none is `no-script`. A script that isn't UTF-8 is `not-utf8`, one holding NUL `not-text`, and every `ZipError` comes back as an `ArchiveError` with the zip's reason. Only the script's entry is ever read. The result has the same shape as `@drafter/fdx`'s `FdxImport`, with `title` null, so the app titles the script from its title page.

## Fade In

`fromFadeIn(bytes)` reads the script out of a `.fadein` file. By the public descriptions, the file is a zip holding the script as an Open Screenplay Format XML document. No public source names the entry, so the document is the archive's one `.xml` entry at the shallowest depth (outside `__MACOSX/` and dot-files); when several sit there, the one whose root element is `document`, OSF's root, which is found by looking at no more than each one's first kilobyte. Only that entry is read in full, as strict UTF-8, and `@drafter/fdx`'s `fromOsf` turns it into Fountain, so the result is an `FdxImport` with OSF's notes (`[[osf: …]]`), `ignored`, and `title`.

```ts
import { ArchiveError, fromFadeIn } from '@drafter/archive';

try {
  const { text, mapped, ignored } = await fromFadeIn(bytes);
} catch (error) {
  if (error instanceof ArchiveError) console.log(error.reason, error.message);
  // e.g. 'not-osf': "This isn’t a Fade In file Drafter can read: its script isn’t in a form Drafter reads (…)."
}
```

No `.xml` is `no-script`, several with no single OSF root is `many-scripts` (naming up to five), and a document `fromOsf` refuses is `not-osf`, with its reason.

## Files that aren't scripts

`notAScript(name, bytes)` names a file that is a known kind other than a script, so the app's Open and `drafter convert` turn it away with the same words: by extension, in any case (`.rtf`, `.doc`, `.docx`, `.odt`, `.pages`, `.pdf`, `.fdr`, `.celtx`, `.zip`), or, whatever its name, by its first bytes (RTF, PDF, an OLE compound file, and a zip, unless it is named `.highland` or `.fadein`). It returns a `Refusal` (what the file is, and what to do instead) or null, and `refusalMessage(name, refusal)` says it: "Drafter can’t open a Word document (Notes.docx). Save it as plain text or Fountain in the app that made it, then open that."

## License

MIT
