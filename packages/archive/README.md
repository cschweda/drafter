# @drafter/archive

Files from other screenwriting apps that come packed as a zip, for [Drafter](https://github.com/cschweda/drafter). It holds Drafter's own strict, read-only zip reader, written from PKWARE's APPNOTE.TXT: it reads an archive already in memory, lists its entries from the central directory with every safety rule applied, and reads one entry at a time. Nothing is ever written, and an entry's name is only ever looked up, never used as a path. It touches no file and no DOM, so it runs in Node, in a browser, and in a worker.

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

`fromHighland(bytes)` reads the script out of a `.highland` file. By the app maker's public description, the file is a zip of a TextBundle: `text.fountain` holds the script as Fountain, `info.json` and other JSON files hold the app's own settings and data, and `assets/` holds images. The script comes in exactly as Highland wrote it (a BOM taken off, line endings made `\n`), since it is already Fountain; every other entry, except the app's JSON (`HIGHLAND_METADATA`), `__MACOSX/`, and dot-files, is named, never read, in one note at the script's end:

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

The script is `text.fountain` when there is one, else the one `.fountain` entry, or the shallowest; none is `no-script`, and two at the same depth `many-scripts`. A script that isn't UTF-8 is `not-utf8`, and every `ZipError` comes back as an `ArchiveError` with the zip's reason. Only the script's entry is ever read. The result has the same shape as `@drafter/fdx`'s `FdxImport`, with `title` null, so the app titles the script from its title page.

## License

MIT
