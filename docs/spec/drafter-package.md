# The Drafter Package Format (`.drafter`)

**Version:** 0.1 (draft) · **Date:** 2026-10-30 · **Editor:** the Drafter project (https://github.com/cschweda/drafter)

**Status:** a draft for comment. It may change until Drafter ships the format (planned for Drafter v0.28.0); from version 1.0 it changes only as §11 allows.

**Licence:** this specification is dedicated to the public domain under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). Anyone may read, copy, implement, extend, or publish it, in any application, open or closed, free or paid, without asking and without attribution (attribution is welcome, not required). The Drafter project claims no patent on anything here and will not assert one.

---

## 1. Purpose

A `.drafter` file is **one file that holds a whole writing project**: a screenplay, stage play, or prose work in plain text, together with the things a writer keeps beside it — numbered drafts, material they cut, a story workbook, and voice notes. It exists for **moving and keeping** a project: emailing it, archiving it, handing it to another application.

It is **not** a working format. Writers write in the plain-text file inside it (Fountain for scripts, Markdown for prose), which any text editor can open. Everything in a package is an ordinary file a person can read without special software.

### 1.1 Design principles

1. **Open and readable.** A package is a standard ZIP archive of plain files. Unzipping it with any tool gives a folder a person can understand.
2. **The script is the truth.** The main file is plain Fountain or Markdown. Nothing in the package is required to read or print the work.
3. **Graceful partial support.** An application that understands only Fountain can still open a package (it reads one manifest field and one file). An application may support any subset of the optional parts.
4. **Never lose anything.** Readers keep what they don't understand; writers never drop files they read but didn't change.

### 1.2 Conventions

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be read as described in RFC 2119 and RFC 8174 when, and only when, they appear in capitals.

A **writer** is software that creates or updates a package; a **reader** is software that opens one. A **path** is a name inside the archive.

## 2. The container

- A package **MUST** be a ZIP archive as defined by the PKWARE APPNOTE (version 6.3.10 or later), without encryption, spanning, or multiple disks.
- Entries **MUST** be stored (method 0) or deflated (method 8). Readers **MUST** support both. Writers **SHOULD** deflate text and **SHOULD** store audio that is already compressed.
- The archive's first entry **MUST** be named `mimetype`, stored (method 0), with no extra field, containing exactly the ASCII bytes `application/vnd.drafter.package+zip` with no line ending. (This lets a reader recognise a package from its first bytes, as EPUB does.)
- Path names **MUST** be UTF-8 and the writer **MUST** set general-purpose bit 11. Paths **MUST** use `/` as the separator, **MUST NOT** begin with `/`, **MUST NOT** contain a `..` segment, a backslash, a drive letter (`C:`), NUL, or any C0/C1 control character, and **MUST NOT** be longer than 255 bytes per segment or 1,024 bytes in total. No two paths may be equal ignoring case (they would collide when unpacked on many systems).
- Archives **MUST NOT** contain symbolic links, directories as entries with data, or entries whose stored and uncompressed sizes or CRC-32 disagree with their headers.
- The file extension is `.drafter`. The media type is `application/vnd.drafter.package+zip` (not yet registered with IANA; see §12).

## 3. Layout

```
mimetype                       required, first, stored
drafter.json                   required: the manifest (§4)
<main file>                    required: the work itself (§5), named in the manifest
drafts/                        optional: frozen drafts (§6)
cuts.md                        optional: material cut from the work (§7)
workbook.md                    optional: the story workbook (§8)
audio/                         optional: voice notes (§9)
```

Readers **MUST** ignore files and folders they don't recognise, and writers that update a package **MUST** keep them unless the user asks to remove them.

## 4. The manifest: `drafter.json`

A UTF-8 JSON object (RFC 8259), with no byte-order mark, at most 1 MiB.

```json
{
  "format": "drafter-package",
  "version": "0.1",
  "generator": "Drafter 0.28.0",
  "created": "2026-11-02T14:05:00Z",
  "modified": "2026-11-09T09:41:12Z",
  "title": "Boca",
  "author": "A. Writer",
  "kind": "screenplay",
  "language": "en",
  "main": "Boca.fountain",
  "drafts": [
    { "number": 1, "id": "a3f9c2e0…64 hex…", "frozen": "2026-11-02T14:05:00Z",
      "note": "first draft", "path": "drafts/Boca – Draft 01.fountain" },
    { "number": 2, "id": "7b1e04d9…", "frozen": "2026-11-08T18:30:00Z",
      "note": "after Sam's notes", "path": "drafts/Boca – Draft 02.fountain",
      "from": { "number": 1, "id": "a3f9c2e0…" } }
  ],
  "current": 3,
  "cuts": "cuts.md",
  "workbook": "workbook.md",
  "audio": [
    { "path": "audio/2026-11-03-0912.m4a", "recorded": "2026-11-03T09:12:40Z",
      "seconds": 41.5, "transcript": "She keeps the phone in the drawer now.",
      "note": "cuts.md#voice-2026-11-03-0912" }
  ],
  "files": {
    "Boca.fountain": "sha256:…",
    "drafts/Boca – Draft 01.fountain": "sha256:…"
  }
}
```

| Field | Required | Meaning |
|---|---|---|
| `format` | **MUST** | The string `"drafter-package"`. |
| `version` | **MUST** | The version of this specification the package follows (`"major.minor"`). |
| `main` | **MUST** | The path of the work's file (§5). |
| `kind` | **SHOULD** | One of `screenplay`, `stageplay`, `markdown`, `novel`; a reader treats an unknown value as `markdown` if `main` ends in `.md`, else `screenplay`. |
| `title`, `author` | **SHOULD** | Plain text, for listing the package without opening the work. |
| `language` | **MAY** | A BCP 47 tag. |
| `generator` | **SHOULD** | The application and version that last wrote the package. |
| `created`, `modified` | **SHOULD** | RFC 3339 timestamps in UTC. |
| `drafts` | **MAY** | Frozen drafts, oldest first (§6). |
| `current` | **MAY** | The number of the draft being written now (the last frozen number + 1). |
| `cuts`, `workbook` | **MAY** | Paths of those files (§7, §8). |
| `audio` | **MAY** | Voice notes (§9). |
| `files` | **SHOULD** | A map from path to `"sha256:<64 lowercase hex>"` of that file's bytes, for integrity. A reader **SHOULD** warn (not refuse) when a file's hash differs. |

Readers **MUST** ignore unknown fields; writers **MUST** keep unknown fields they read unless they replace the whole manifest knowingly. Extensions **SHOULD** use a field name with the extender's reverse-domain prefix (`"com.example.colors": …`).

## 5. The main file

- A screenplay or stage play **MUST** be [Fountain](https://fountain.io/syntax) in UTF-8, extension `.fountain`. A Markdown document or novel **MUST** be CommonMark (with GitHub-style footnotes permitted) in UTF-8, extension `.md`.
- Line endings **SHOULD** be LF; readers **MUST** accept CRLF.
- The file **MAY** end with Drafter's metadata block, which other Fountain applications treat as a boneyard and do not print:
  - Fountain: a final block `/* drafter` followed by a line break, one JSON object, and `*/`.
  - Markdown: a final `<!-- drafter ` followed by one JSON object and ` -->`.
  The JSON's `"v"` field is its version (currently 1). Known keys include `template` (a template id such as `us-screenplay` or `stage-play-standard`) and, in a frozen draft, the draft facts of §6. Readers **MUST** ignore unknown keys and **MUST** keep the block when they rewrite the file.
- A reader that understands only Fountain **MAY** open a package by reading `drafter.json`'s `main` and that file alone; that is a conforming **minimal reader** (§10).

## 6. Drafts

A **draft** is a version of the work the writer chose to freeze, numbered from 1 upward.

- Each frozen draft is a file under `drafts/`, in the same format as the main file. Writers **SHOULD** name them `<Title> – Draft NN.<ext>` (two digits, three past 99); readers **MUST NOT** rely on the name — the manifest's `path` is authoritative.
- A draft's **id** is the SHA-256 of its text as UTF-8, before the metadata block of §5 is added, written as 64 lowercase hex characters. Applications **SHOULD** show the first 7 characters and accept a unique prefix of at least 4 to find a draft.
- The draft file's metadata block carries the same facts as its manifest entry: `draft` (number), `id`, `frozen` (RFC 3339), `note` (one line, may be empty), and optionally `from: {"number", "id"}` when the draft was restored from an earlier one. The draft file is: the text, then exactly one blank line, then the block. To verify a draft, remove the block and that one blank line, then hash.
- Draft numbers **MUST NOT** be reused. Readers **MUST** accept gaps.
- Drafts are records: writers **MUST NOT** modify or delete a frozen draft's file except at the user's explicit request.

## 7. Cuts: `cuts.md`

Material the writer removed, kept so it can be read, copied, or put back. A Markdown document a person can read, which an application can also parse exactly.

- It begins with a level-1 heading naming the work, and a sentence saying what the file is.
- Each cut is a level-2 heading (its title), a line describing where and when it was cut, the cut text, and **then a machine-readable comment** on its own line:
  `<!-- drafter-cut {"id":"…","title":"…","kind":"fountain","cuts":[{"at":"…","draft":12}],"where":{"after":"…","before":"…"},"putBack":"…"} -->`
- The comment's JSON is authoritative; the visible lines are for people. `id` is the SHA-256 of the cut text; the same text cut twice is one entry whose `cuts` list holds every time it was cut (`draft` is the draft number being written when it was cut, or `null`). `where` names the neighbouring headings it sat between, for putting it back.
- Inside the comment, `/` **MUST** be written `\/` and `--` **MUST** be written `--`, so the comment can't be closed early. Fountain cut text **MUST** be in a fenced code block whose fence is longer than any backtick run inside it; Markdown cut text is included as-is with its headings demoted one level.
- Entries are newest first. Two copies of a cuts file **MUST** merge by `id` without loss: the union of their `cuts` lists, and the earliest `putBack`.
- Readers **MUST** skip (and keep) an entry whose comment doesn't parse, rather than refusing the file.

## 8. The workbook: `workbook.md`

A CommonMark document: the story's bible and plan.

- `## ` headings that match a top-level part of the work (an act, or "Act One") group **scene cards**: each card is a `### ` heading (the scene's title or slug line), then bullets (beats), then any text (notes and drafted lines; dialogue as `**NAME**` followed by the line).
- Other `## ` sections (for example Cast, Motifs, Open questions) are the **bible**, free-form.
- A card **MAY** end with a status comment `<!-- drafter-card {"status":"mine"|"suggested"|"open"} -->`.
- An `## Unplaced` section holds cards and snippets not yet placed in the structure.
- The workbook format will be finalised when Drafter ships its Workbook (planned v0.27.0); until then readers **SHOULD** treat it as plain Markdown.

## 9. Voice notes: `audio/`

- Each recording is a file under `audio/` in a widely supported format: **SHOULD** be AAC in MP4 (`.m4a`), Opus in WebM (`.webm`) or Ogg (`.ogg`), or WAV (`.wav`); readers that can't play one **MUST** still keep it.
- The manifest's `audio` entry gives `recorded` (RFC 3339), `seconds`, the `transcript` (plain text, as transcribed), and optionally `note`, a link to where the transcript was placed (`cuts.md#…`, `workbook.md#…`, or the main file).
- Audio is the writer's own voice: applications **MUST NOT** upload it anywhere without the writer's explicit action.

## 10. Conformance

- **Minimal reader:** recognises the package (§2's `mimetype`), reads `drafter.json`, opens `main`. Ignores everything else.
- **Full reader:** also lists drafts (verifying ids), shows cuts, the workbook, and voice notes, and keeps everything it doesn't understand.
- **Writer:** produces a package that satisfies §2–§9 for the parts it includes, and when updating a package it read, keeps every file and manifest field it didn't change.

## 11. Versioning

`version` is `major.minor`. A minor version adds optional fields or files; a reader of the same major version **MUST** be able to open a package of a higher minor version (ignoring what it doesn't know). A major version may change required structure; a reader **MUST** refuse a higher major version with a clear message rather than guess. Version 0.x is a draft and may change in any way until 1.0.

## 12. Security considerations

Packages come from other people; readers **MUST** treat every byte as untrusted.

- **Archive bombs and size:** readers **SHOULD** cap the archive (Drafter: 32 MiB without audio, 512 MiB with), entry count (Drafter: 10,000), per-entry uncompressed size, total uncompressed size, and compression ratio, and refuse beyond them before inflating.
- **Paths:** readers **MUST** refuse (not repair) any path breaking §2's rules, and **MUST NOT** follow links when unpacking.
- **Text:** parse JSON, Fountain, Markdown, and the cut comments with bounded, linear-time code; cap nesting depth; never execute or render embedded HTML as markup.
- **Integrity:** the `files` hashes detect accidental damage; they are not a signature and prove nothing about who wrote the package.
- **Privacy:** packages may hold voice recordings and unpublished work. Applications **SHOULD NOT** send a package or its contents to a server without the user's explicit action.

## 13. IANA considerations

The media type `application/vnd.drafter.package+zip` is not yet registered. The Drafter project may register it in the vendor tree before version 1.0; until then implementers **MAY** use it as written.

## 14. Change log

- **0.1 (2026-10-30):** first draft, written ahead of Drafter's implementation (planned v0.28.0) so other applications can comment and implement.

## 15. Feedback

Open an issue at https://github.com/cschweda/drafter/issues with "Package format" in the title. Implementations in other applications are welcome — tell us and we'll list them here.
