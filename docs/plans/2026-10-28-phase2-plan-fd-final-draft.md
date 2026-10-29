# Phase 2, Plan FD: Final Draft files (v0.11.0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (or superpowers:executing-plans) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Final Draft files (v0.11.0): **Export as Final Draft (.fdx)** from the Export menu, the app menu, and the palette; and **import**, which turns an `.fdx` opened from Open, a drop, or (on the desktop) the system into a new Fountain script. The writer's working file stays `.fountain`; `.fdx` is import and export only (decided 2026-10-28).

**Architecture:** A new engine package, `@drafter/fdx`, with three parts: a strict XML reader and a small writer, written for the package (no DOM, no dependency); `toFdx(doc, template)`, which maps a parsed script to Final Draft XML; and `fromFdx(xml)`, which maps Final Draft XML back to **Fountain text** (never a `Doc`), so an import is parsed and checked like any other script. `apps/web` adds the export kind `fdx`, sends an opened `.fdx` through `fromFdx` into a new, unsaved Fountain script, and says what was mapped to notes. `apps/desktop` offers `.fdx` in Open with (never as Drafter's default).

**Tech Stack:** TypeScript, Vitest 5 with fast-check, Vue 3.5 / Nuxt 4 / Nuxt UI 4, Playwright 1.64. No new dependencies.

**Spec:** [`docs/drafter-phase2-design.md`](../drafter-phase2-design.md) §22 Plan FD; [`docs/drafter-technical-design.md`](../drafter-technical-design.md) §6.3 (the mapping) and §11 (imported content is untrusted).

## Global Constraints

- Branch `phase2-fd`, from `main` at v0.10.0.
- **Clean room:** the element and attribute names come from the technical design §6.3, which records the structure of `.fdx` files as XML. No code or fixtures from any screenwriting app, converter, or Fountain library. The fixtures are hand-made in `packages/fdx/test/fixtures/` with original text. When the maintainer supplies `.fdx` files they made in Final Draft, they are tested against locally and **never committed** (they are the maintainer's writing); anything they show becomes a hand-made fixture.
- **No new dependencies.** `@drafter/fdx` depends on `@drafter/fountain` and `@drafter/templates`; dev dependencies as `@drafter/outline` has them.
- **Untrusted input (technical design §11):** the XML reader accepts no DTD (`<!DOCTYPE` is refused), no entities beyond `&lt; &gt; &amp; &quot; &apos;` and numeric character references (which must name a valid XML character), no processing instructions other than a leading XML declaration, and refuses mismatched tags, duplicate attributes, unclosed elements, text after the root, and nesting deeper than 64. It is linear in the input and caps its input at the open path's 5 MB. Imported text reaches the DOM only as text.
- **Nothing is dropped silently on import.** A paragraph `Type` Drafter doesn't map becomes action with a `[[fdx: Type]]` note. Content-bearing elements Drafter doesn't map get the same note. The formatting and settings elements of the file (page layout, element settings, header and footer, fonts, smart type lists, revisions, macros, and the like) are listed in `IGNORED` in `packages/fdx/src/import.ts` and reported as a count, not as notes.
- **Import is never lossy without saying so:** `fromFdx` returns `{ text, mapped: Array<{ type: string; count: number }>, ignored: string[] }`, and the app says "Imported “X”. N paragraphs came in as notes; Problems lists them." when `mapped` is not empty.
- **Fountain stays canonical.** Import emits forced markers wherever the plain text would read as another kind (an all-caps action line gets `!`, a cue that isn't all caps gets `@`, a heading without a prefix gets `.`, a transition not ending in `TO:` gets `>`), so `parse(fromFdx(x).text)` has the kinds the file had.
- Every task: tests first and watched failing; then `pnpm test`, `pnpm check`, `pnpm -r typecheck` green; `apps/web` e2e for the specs a task touches; a CHANGELOG entry under `[Unreleased]`; choices in `docs/DECISIONS.md` (a new `## Phase 2, Plan FD: Final Draft files` section); conventional commits with no AI co-author trailer and no session link.
- **Accessibility:** new UI reuses existing dialogs, menus, and toasts. No new accessibility work in this plan (maintainer, 2026-10-28: accessibility waits for the final steps); the existing axe tests must stay green.

## Review Focus

1. **The reader refuses what it should** (DTD, entities, malformed, deep nesting), with a plain message and nothing opened. Task 1's tests.
2. **Export → import → export is stable** on elements, title page, scene numbers, dual dialogue, emphasis, notes, synopses, sections, centered, lyrics, page breaks. Task 4's property test over the shared Fountain generator.
3. **Import never drops content silently.** Task 3's fixtures for unknown types and elements.
4. **An imported script is new and unsaved**: Save asks where to put the `.fountain`; it never writes over the `.fdx`. Task 5's e2e.

---

### Task 1: The XML reader and writer (`@drafter/fdx`)

**Files:**
- Create: `packages/fdx/{package.json,README.md,tsconfig.json,tsdown.config.ts,vitest.config.ts}` (copied in shape from `packages/outline`), `packages/fdx/src/{index.ts,xml.ts}`, `packages/fdx/test/xml.test.ts`
- Modify: `vitest.shared.ts` (alias), `apps/web/nuxt.config.ts` (alias), `apps/web/package.json` (dependency), `README.md` (Packages table: built in Plan FD), `docs/DEPENDENCIES.md` (the workspace package row, if workspace packages are listed)

**Interfaces (Produces):**
```ts
export interface XmlElement { name: string; attrs: Record<string, string>; children: XmlNode[] }
export type XmlNode = XmlElement | string;
export class XmlError extends Error { readonly offset: number }
/** Strict: see Global Constraints. Whitespace-only text between elements is kept; callers ignore it. */
export function readXml(text: string): XmlElement;
/** `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>` then the tree, two-space indent; text escaped. */
export function writeXml(root: XmlElement): string;
```

- [ ] Tests: round trip of a hand-built tree; each refusal (DOCTYPE, `&custom;`, `&#0;`, `<a></b>`, duplicate attribute, unclosed, trailing text, depth 65, a PI after the declaration); CDATA read as text; a 5 MB input read in under a second; fast-check: `readXml(writeXml(t))` equals `t` for random trees with random text (including `<&>"'` and astral characters).
- [ ] Implement a single-pass tokenizer over the string.

### Task 2: Export (`toFdx`)

**Files:** Create `packages/fdx/src/export.ts`, `packages/fdx/test/export.test.ts`

**Interfaces:**
```ts
export function toFdx(doc: Doc, template: Template): string;
```

Mapping (technical design §6.3), one `<Paragraph Type="…">` per logical block inside `<Content>`:
- scene heading → `Scene Heading`, with `Number="12A"` when the heading has a locked number; the scene's synopses → `<SceneProperties Title="" Summary="…"/>` on it (several synopses joined by a newline); a stage play's `##` scene → `Scene Heading` too; its act (`#`) is a section, mapped as below.
- action → `Action`; `centered` → `Action` with `Alignment="Center"`; lyric → `Dialogue` with `<Text Style="Italic">`; character → `Character` (the extension kept in the text, e.g. `MARGARET (V.O.)`); parenthetical → `Parenthetical` (with its parentheses); dialogue → `Dialogue`; transition → `Transition`; page break → `<Paragraph Type="Action" StartsNewPage="Yes">` on the next paragraph.
- section → `General` with the text, and the depth kept in an attribute Drafter writes and reads, `DrafterSection="2"`. (Final Draft ignores unknown attributes; it is how sections survive a round trip. Record in DECISIONS.)
- a note on its own line → `<ScriptNote>` carried as a `General` paragraph with `DrafterNote="Yes"`; a note inside a line → kept in the text as `[[…]]`. (Real Final Draft notes anchor to text ranges; mapping to them waits for real files. Record in DECISIONS and DEFERRED.)
- boneyard → omitted; the metadata block → omitted.
- dual dialogue: the two speeches inside `<Paragraph><DualDialogue>…</DualDialogue></Paragraph>`.
- emphasis: one `<Text>` run per style change; `Style` is `Bold`, `Italic`, `Underline`, joined with `+` (`Bold+Italic`).
- title page → `<TitlePage><Content>` with one `Action` paragraph per value line, `Alignment="Center"` for Title, Credit, Author(s), Source; `Left` for Draft date and Contact; the key carried as `DrafterKey="Title"` on its first line.
- root: `<FinalDraft DocumentType="Script" Template="No" Version="5">`.

- [ ] Tests: a fixture per mapping row, compared as XML trees (not strings), and a whole sample script (`samples/`) exported without throwing.

### Task 3: Import (`fromFdx`)

**Files:** Create `packages/fdx/src/import.ts`, `packages/fdx/test/import.test.ts`, `packages/fdx/test/fixtures/*.fdx` (hand-made)

**Interfaces:**
```ts
export interface FdxImport { text: string; title: string | null; mapped: Array<{ type: string; count: number }>; ignored: string[] }
export class FdxError extends Error {}   // "This isn’t a Final Draft file: …", wraps XmlError
export function fromFdx(xml: string): FdxImport;
```

- The root must be `FinalDraft` with a `Content` child, else `FdxError`.
- The inverse of Task 2's mapping, writing Fountain text with forced markers as Global Constraints say, blank lines between blocks as Fountain needs (none between a cue, its parentheticals, and its speech), a dual's second cue with `^`.
- Paragraph types with no Fountain kind (`Shot`, `Cast List`, `New Act`, `End of Act`, and any other): `Shot` → a scene heading forced with `.` (Fountain has no shot; a forced heading prints like one) — record in DECISIONS; all others → action with `[[fdx: Type]]`.
- `SceneProperties Summary` → `= ` synopsis lines after the heading; `Number` → `#12A#`.
- Title page paragraphs → title page fields by `DrafterKey`, else by order (first centered block Title, then Credit/Author by the words "by"/"written by", the rest as `Notes:`); recorded in DECISIONS.
- Text is normalized: `\r\n` and `\r` → `\n`, tabs → spaces, characters Fountain would read as markup (`*`, `_`, `[[`, `/*`, a leading `!@#~.>=`) escaped with `\` where they'd change the reading.

- [ ] Tests: each mapping row by fixture; an unknown type and an unknown content element come in as notes and are counted in `mapped`; a settings-only element is in `ignored`; refusals of non-Final-Draft XML; the imported text round-trips through `print(parse(…))`.

### Task 4: The round trip

**Files:** Create `packages/fdx/test/roundtrip.test.ts`

- [ ] fast-check over `fixtures/generators/fountain.ts`: for a random script `s`, `x1 = toFdx(parse(s))`, `x2 = toFdx(parse(fromFdx(x1).text))`, and `readXml(x1)` equals `readXml(x2)` (supported fields only: the generator's boneyard is filtered first, since export omits it). Shrink failures to fixtures.
- [ ] And: the blocks' kinds and printable text of `parse(fromFdx(toFdx(parse(s))).text)` equal those of `parse(s)` minus boneyard.

### Task 5: The app

**Files:**
- Modify: `apps/web/app/storage/export.ts` (`ExportKind` gains `fdx`, MIME `application/xml`, `.fdx`), the export worker/client (export runs `toFdx` in the worker like `txt`), `apps/web/app/commands/builtin.ts` and the command list (`export-fdx`, Fountain only, "Export as Final Draft (.fdx)…"), the toolbar's Export menu and the app menu's File section.
- Modify: `apps/web/app/markdown/kind.ts` (a `.fdx` name is an import, not a kind), `apps/web/app/storage/open.ts`: a `.fdx` file is decoded (UTF-8; a BOM is fine), passed to `fromFdx`, and opened with `script.addScript(text, { kind: 'fountain' })` as a **new script with no file**, titled from `title` or the file's name; a refused file says the `FdxError` message in the status bar and opens nothing. The file input's and picker's accepted types include `.fdx`.
- Modify: `apps/desktop/electron-builder.config.cjs`: `.fdx` in Open with on Linux, Windows, and macOS, never as the default (as `.md` is).
- Modify: the help page for files (`apps/web/app/pages/docs/…`): Final Draft files, what maps and what comes in as notes.
- Create: `apps/web/e2e/fdx.spec.ts`

- [ ] e2e: Open a hand-made `.fdx` → a new script with the expected text, unsaved, the `.fdx` untouched; Save asks for a `.fountain` name; a drop works; a malformed file is refused with its message; Export as Final Draft writes a file whose XML parses and has the scene headings; the menu item is absent for Markdown.
- [ ] Desktop e2e (`apps/desktop`): opening a `.fdx` from the command line imports it.

### Task 6: Release prep

- [ ] README (status, roadmap row, Final Draft section), architecture, CHANGELOG, DECISIONS, DEFERRED (real Final Draft notes, revisions, and any element the maintainer's files show), then the v0.11.0 release by the tag-first procedure.
