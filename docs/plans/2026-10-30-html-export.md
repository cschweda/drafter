# Export as HTML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export → HTML (and, in Task 9, EPUB) for screenplays, stage plays, and Markdown documents: one self-contained, offline `.html` file in the "Studio" look, dark by default with a light switch, and for scripts a Pages · Reading switch.

**Architecture:** A new DOM-free package, `@drafter/render-html-file`, turns a parsed script plus its layout (or a Markdown tree) into one HTML string: an escaped body, one fixed stylesheet, one fixed script, Courier Prime as base64, and a CSP meta that allows nothing from the network. The web app's export worker and the CLI call it; the app wires a new `html` export kind through the existing export plumbing. The Markdown parser and the scene-color hex values move into packages so the generator and the CLI can use them.

**Tech Stack:** TypeScript, pnpm workspace packages built with tsdown, Vitest (+ jsdom for parsing output in tests), Nuxt 4 app, Electron desktop, Playwright e2e, commander CLI.

**Spec:** `docs/drafter-html-export-design.md` (approved 2026-10-30). Read it first; its §12 calls bind.

**Starts from:** main after the `formats` release (v0.20.0) is merged — it needs that release's Markdown footnotes (`parse.ts` with `mdast-util-gfm-footnote`). Ships as its own minor release.

## Global Constraints

- Clean room: the page design, CSS, and script are Drafter's own; no code, stylesheets, or fixtures from other apps, script-sharing sites, or HTML templates. All test fixtures are original text.
- The exported file makes **no network request of any kind**: no CDN, no remote font, no remote image. Only `data:` fonts. A `<meta http-equiv="Content-Security-Policy">` with `default-src 'none'`, the inline style and inline script allowed by `sha256` hash, `font-src data:`, `img-src data:`.
- Every character of the writer's text is escaped (`&`, `<`, `>`, `"`, `'`) at every insertion point; attribute values are generated or validated, never copied unescaped.
- Dark palette by default; light palette via the toggle; the choice remembered in `localStorage` inside `try/catch`; with nothing remembered the file opens dark (whatever the system setting). Printing always uses the light palette.
- Scripts open in **Pages** view; the last view is remembered the same way.
- Works with JavaScript off: Pages view (or the document) in the dark palette, fully readable.
- Notes: left out by default; with "Include notes", `[[notes]]` appear in **Reading only**, never in Pages. Boneyard never appears.
- Interface type is the system sans-serif stack; only Courier Prime is embedded, and only in a script's file, only the styles the script uses.
- Reading time at **230 words a minute**. Links: only `http:`, `https:`, `mailto:` become links (new tab, `rel="noopener noreferrer"`); others are text.
- Any regex on the writer's text must be linear.
- Every package's version equals the repository's (`apps/web/test/version.test.ts`).
- Gates use `set -e` (and `-o pipefail` when piping), never `(cmd; echo $?) &&`. Run `pnpm install` after merges. E2E never on port 4190.
- Commits never carry a Co-Authored-By or any AI trailer.

## Review Focus

1. **Hostile text in every element** (`</script>`, `</style>`, `<!--`, `"` and `'` in a title, `javascript:` and `data:` links, U+2028/U+2029, NUL and other C0/C1 controls, lone surrogates): the file still parses into the same structure and nothing runs. Pinned in Tasks 2, 3, 4, 5.
2. **Storage that throws** (Safari on `file://`, an email client's sandboxed preview, cookies blocked): the switch and toggle still work for the visit; nothing is thrown. Pinned in Task 2.
3. **One character under different spellings** (`Tom`, `TOM`, `TOM (V.O.)`, `TOM (CONT'D)`, `^` dual): one color per character in Reading. Pinned in Task 4.
4. **Characters Courier Prime lacks** (CJK, emoji, combining marks): the text is present in both views, nothing is replaced or dropped. Pinned in Tasks 3 and 4.
5. **A long script** (300 pages): the export finishes in the worker without a long task beyond the existing script PDF's, and the file stays under 4 MB. Pinned in Task 8.

---

## File Structure

- `packages/markdown/` (new, `@drafter/markdown`): `src/parse.ts` (moved `parseMarkdown`, with footnotes), `src/title.ts` (moved `markdownTitle`, `retitleMarkdown`), `src/words.ts` (moved `wordsIn`, `countWords`), `src/types.ts` (`MdNode`, now with `url?`, `identifier?`, `label?`), `src/index.ts`. The app's `apps/web/app/markdown/{parse,title,words}.ts` become re-exports.
- `packages/notes/src/colors.ts` (modify): adds `SCENE_SWATCH`.
- `packages/render-html-file/` (new): `src/escape.ts`, `src/shell.ts` (document, CSP, palettes, print), `src/client.ts` (the fixed inline script as a string), `src/style.ts` (the fixed stylesheet as a string), `src/fonts.ts`, `src/pages.ts`, `src/reading.ts`, `src/band.ts`, `src/script.ts` (`renderScriptHtml`), `src/document.ts` (`renderDocumentHtml`), `src/index.ts`.
- `apps/web/app/workers/export-compute.ts`, `storage/export.ts`, `storage/files.ts`, `storage/desktop-files.ts`, `storage/text.ts`, `storage/export-options.ts`, `desktop.ts`, `commands/data.ts`, `commands/builtin.ts`, `components/ExportMenu.vue`, `components/AppMenu.vue`, `components/ExportOptionsDialog.vue`, `workers/export-progress.ts` (modify).
- `apps/desktop/src/file-handlers.ts`, `files-ipc.ts`, `files.ts`, `test/menu.test.ts` (modify).
- `packages/cli/src/cli.ts` (modify).

---

### Task 1: The Markdown parser and the scene colors move into packages

**Files:**
- Create: `packages/markdown/{package.json,tsconfig.json,tsdown.config.ts,vitest.config.ts,README.md}`, `packages/markdown/src/{index,parse,title,words,types}.ts`, `packages/markdown/test/*.test.ts` (moved)
- Modify: `apps/web/app/markdown/{parse,title,words,render}.ts` (re-export from the package; `render.ts` imports `MdNode` from it), `packages/notes/src/colors.ts` (or wherever `SCENE_COLORS` lives), `apps/web/app/outline/labels.ts` (uses `SCENE_SWATCH`), `vitest.shared.ts`, `apps/web/nuxt.config.ts:163` (alias regex), `apps/web/package.json`, `apps/web/app/about/tech.ts`, `docs/technical-details.md` (snapshot), `docs/DEPENDENCIES.md`

**Interfaces:**
- Produces (`@drafter/markdown`): `parseMarkdown(source: string): MdNode`; `markdownTitle(source: string): string | undefined`; `retitleMarkdown(...)` (signature unchanged from the app); `wordsIn(text: string): number`; `countWords(tree: MdNode): number`; `interface MdNode` (the app's fields plus `url?: string; identifier?: string; label?: string | null`).
- Produces (`@drafter/notes`): `SCENE_SWATCH: Readonly<Record<SceneColor, string>>` — the exact hex values of today's `SWATCH` in `apps/web/app/outline/labels.ts:23`.

- [ ] **Step 1: Move the tests first.** Move the app's tests for parse, title, and words (find them with `grep -l "parseMarkdown\|markdownTitle\|countWords" apps/web/test`) into `packages/markdown/test/`, importing from `../src`. Add `packages/notes/test/swatch.test.ts`: `it('has a hex color for every scene color')` — `for (const c of SCENE_COLORS) expect(SCENE_SWATCH[c]).toMatch(/^#[0-9a-f]{6}$/)` — and `it('keeps the outline’s colors')` comparing to the literal values copied from `labels.ts`.
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/markdown test` and `pnpm --filter @drafter/notes test` → FAIL (package and export missing).
- [ ] **Step 3: Create the package and move the code.** Model `package.json`/`tsdown.config.ts`/`tsconfig.json`/`vitest.config.ts` on `packages/render-text`; version = the repo's. Dependencies: whatever `parse.ts` imports after `formats` (`mdast-util-from-markdown`, the footnote micromark/mdast packages). The app files become one-line re-exports so every existing import keeps working.
- [ ] **Step 4: Run everything that touches Markdown.** `pnpm --filter @drafter/markdown test`, `pnpm --filter @drafter/notes test`, `pnpm --filter web test` (expect `tech.test.ts` to require the new package in `PACKAGES` and the snapshot regenerated — do both), `pnpm -r typecheck`, `pnpm check` → PASS.
- [ ] **Step 5: Commit.** `refactor: the Markdown parser and the scene colors in packages, for the HTML export`

### Task 2: The package and its shell: escaping, palettes, the switch, CSP

**Files:**
- Create: `packages/render-html-file/` (package files as Task 1; vitest `environment: 'jsdom'` as `packages/render-html/vitest.config.ts:6` does), `src/escape.ts`, `src/style.ts`, `src/client.ts`, `src/shell.ts`, `src/index.ts`, `test/escape.test.ts`, `test/shell.test.ts`, `test/client.test.ts`
- Modify: `vitest.shared.ts`, `apps/web/nuxt.config.ts` (alias), `apps/web/app/about/tech.ts`, `docs/technical-details.md`, `docs/DEPENDENCIES.md`

**Interfaces:**
- Produces:
  ```ts
  export function escapeHtml(text: string): string;            // & < > " ' ; C0/C1 controls (not \t \n) → space; lone surrogates → U+FFFD
  export interface ShellInput {
    title: string; lang: string; generator: string;              // generator e.g. "Drafter 0.21.0"
    kind: 'script' | 'document';
    header: string;                                              // already-escaped HTML for the header
    nav: string;                                                 // band or section links, escaped HTML
    body: string;                                                // escaped HTML
    fontFaces: string;                                           // @font-face rules with data: URLs, or ''
  }
  export function htmlShell(input: ShellInput): string;
  export const CLIENT_SCRIPT: string;                            // fixed text; no template values inside
  export const STYLESHEET: string;                               // fixed text
  ```
- The body contract later tasks rely on: a script's body is `<main data-view="pages">` holding `<section class="pages">` and `<section class="reading" hidden>`; the bar has `<button data-toggle="view" aria-pressed>` (scripts only) and `<button data-toggle="theme" aria-pressed>`; `<html data-theme="dark">` by default; band links are `<a href="#b-<n>">` with targets `id="b-<n>"`.

- [ ] **Step 1: Write the failing tests.**
  - `escape.test.ts`: `escapes the five characters` (`escapeHtml(`<a href="x">'&'</a>`)` → `&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;`); `turns controls into spaces and keeps tabs and newlines`; `replaces a lone surrogate`; `a property: parsing <p>${escapeHtml(s)}</p> with jsdom gives back s` for fast-check strings after the same control/surrogate mapping.
  - `shell.test.ts`: `has one style and one script, and a CSP whose hashes match them` (compute `sha256-` base64 of the exact `<style>`/`<script>` text with `node:crypto` and find both in the CSP `content`); `the CSP allows no network` (`default-src 'none'`, no `http`, no `https:` source anywhere in the CSP); `no URL in the file except data: and #anchors` (regex over `src=|href=|url(` in the output with an empty body); `opens dark` (`<html … data-theme="dark"`); `a hostile title is escaped in <title> and the header` (`</title><script>alert(1)</script>`); `names the generator`; `has a viewport and lang`.
  - `client.test.ts` (jsdom; load the shell into a `JSDOM` with `runScripts: 'dangerously'`): `the theme toggle switches data-theme and aria-pressed`; `the view toggle shows reading and hides pages`; `remembers the choices` (reload with the same `localStorage`); `works when localStorage throws` (stub `Storage.prototype.getItem/setItem` to throw: toggles still switch, no error); `with nothing remembered it opens dark even if the system prefers light` (stub `matchMedia` to light).
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/render-html-file test` → FAIL.
- [ ] **Step 3: Implement.** `STYLESHEET`: Studio palette as CSS variables on `:root[data-theme=dark]` and `[data-theme=light]` (dark: bg `#0e1116`, panel `#161b22`, line `#262d36`, ink `#e6e9ee`, dim `#8b95a3`, amber `#f2b84b`; light: paper-white bg, dark ink, accents darkened to pass AA — measure), system sans stack, the sticky bar, header, band, `@media print` forcing light, hiding the bar, `break-after: page` per `.page`. `CLIENT_SCRIPT`: a self-contained IIFE; storage via a `safeGet/safeSet` that swallow errors; band clicks rely on plain `#` anchors (no JS needed). With JS off the defaults (`data-theme="dark"`, `data-view="pages"`) already render.
- [ ] **Step 4: Run them.** → PASS. `pnpm check`, `pnpm -r typecheck`.
- [ ] **Step 5: Commit.** `feat(render-html-file): a self-contained Studio page: escaping, palettes, switches, and a CSP with no network`

### Task 3: Pages view

**Files:**
- Create: `packages/render-html-file/src/pages.ts`, `src/fonts.ts`, `test/pages.test.ts`, `test/fonts.test.ts`

**Interfaces:**
- Consumes: `escapeHtml` (Task 2); `Layout`, `Page`, `LayoutLine` from `@drafter/layout`; `Template` from `@drafter/templates`.
- Produces:
  ```ts
  export function pagesHtml(layout: Layout, template: Template): string;   // <section class="pages"> … one <div class="page" style="--cols:W;--rows:H"> per page
  export type FontStyle = 'regular' | 'bold' | 'italic' | 'boldItalic';
  export function stylesUsed(layout: Layout): Set<FontStyle>;              // 'regular' always
  export function fontFaces(fonts: Partial<Record<FontStyle, Uint8Array>>, used: Set<FontStyle>): string;  // @font-face "Courier Prime" with data:font/ttf;base64 (or woff2 if converted)
  ```
- Positions match `@drafter/render-html`'s stylesheet: a line at `top: calc(row * 1in/6)`, `left: calc(col * 1ch)`, with `row = margin.top + bodyRow`, `col = margin.left + line.col`; `line.right` (dual dialogue, draft date) drawn as its own positioned line; page numbers, scene numbers (left/right), header and footer at the rows and columns `renderPdf` uses (design §3.1; see `packages/render-pdf/src/render.ts:99-100` for the mapping). Runs become `<span class="b|i|u">`. `(MORE)` and furniture `aria-hidden="true"`; each page starts with a visually hidden "Page N" (title page: "Title page").

- [ ] **Step 1: Write the failing tests** (lay out original fixtures with `parse` + `paginate` on `us-screenplay` and `stage-play-standard`):
  - `every printed line's text appears once, at its row and column` (walk `layout.pages`, for each non-blank line find the element with `style` containing `--row:R;--col:C` and compare `textContent` to the runs' text).
  - `dual dialogue draws both columns`; `the title page is a page with its fields`; `scene numbers print left and right when the layout has them`; `page numbers sit where the PDF puts them`.
  - `bold, italic, and underline become spans`.
  - `hostile text stays text` (a line `<img src=x onerror=alert(1)>` → no `img` element after parsing with jsdom; text equal).
  - `characters outside Courier Prime are kept` (`东京 🎬 é` as written, combining form preserved).
  - `stylesUsed` → `{'regular'}` for plain text, adds `bold` for `**x**`, etc.; `fontFaces` emits one `@font-face` per used style with `font-weight`/`font-style` set, and only `data:` URLs.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement** `pagesHtml`, `stylesUsed`, `fontFaces`. **Call (builder):** convert to WOFF2 only if a small, dependency-light way exists; plain TTF base64 is acceptable.
- [ ] **Step 4: Run them.** → PASS.
- [ ] **Step 5: Commit.** `feat(render-html-file): the exact pages, on the Script tab's grid, with Courier Prime inside`

### Task 4: Reading view, the band, the header, and `renderScriptHtml`

**Files:**
- Create: `packages/render-html-file/src/reading.ts`, `src/band.ts`, `src/script.ts`, `test/reading.test.ts`, `test/band.test.ts`, `test/script.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3; `Doc` from `@drafter/fountain`; `sceneIndex`, `structureStrip`, `linesPerPage` from `@drafter/outline`; `SCENE_SWATCH` from `@drafter/notes`.
- Produces:
  ```ts
  export interface ScriptHtmlInput {
    doc: Doc;                        // parsed, with the export's title page already applied (titlePageFor)
    layout: Layout;                  // paginate(doc, template, { sceneNumbers })
    template: Template;
    notes: 'leave-out' | 'include';
    fonts: Partial<Record<FontStyle, Uint8Array>>;
    title: string; lang: string; generator: string;
    kindLine: string;                // e.g. "Stage play · 94 pages · About 1 h 50 min", made by the caller
  }
  export function renderScriptHtml(input: ScriptHtmlInput): string;
  export function readingHtml(doc: Doc, layout: Layout, notes: 'leave-out' | 'include'): string;
  export function bandHtml(doc: Doc, template: Template, layout: Layout): string;   // '' when there are no sections and no scenes
  export function characterKey(cue: string): string;                               // uppercase, extensions and ^ and (CONT'D) stripped, spaces collapsed
  export const CHARACTER_COLORS: readonly string[];                                  // fixed, AA in both palettes
  ```
- Reading walks the layout's lines in page order and groups them by `doc.blocks[line.blockIndex]` (skip `blockIndex === -1`, i.e. `(MORE)`, `CONT'D`, blanks; skip the title page — the header carries it). Block kind → element: `scene_heading` → `<h3 class="sh">` (with the scene number when the layout prints one), `section` → `<h2 id="b-…">`, `action` → `<p>`, `character`+`parenthetical`+`dialogue` → one `<div class="speech">` (name in the margin with its color; extension in grey; parenthetical small above the speech), dual → two speeches in `<div class="dual">`, `transition` → right-aligned, `centered` → centered, `lyric` → italic, anything else → `<p>`. Notes, when included, as `<aside class="note">` at their place in source order (from the doc's note blocks / inline notes); boneyard never. Colors by `characterKey`, assigned in order of first speech, cycling past the palette.
- Band: `structureStrip(sceneIndex(doc, template, layout), linesPerPage(layout))` — use its top row (sections if any, else scenes); each block → `<li><a href="#b-<block>" style="flex-grow:<length>;--c:<SCENE_SWATCH[color] or palette>" aria-label="<label>, pages A to B">`. The matching anchors: the Reading view's section/scene-heading ids, and `id`s on the Pages view's first line of each block (from `layout.index[block]`).

- [ ] **Step 1: Write the failing tests:**
  - `reading.test.ts`: `every speech appears once, in order` (collect cue+dialogue from the doc; compare to `.speech` elements); `action, transitions, centered, and lyrics have their elements`; `a stage play reads the same way` (stage-play fixture: act headings → `h2`, stage directions → `p`); `dual dialogue is side by side`; `one color for Tom, TOM, TOM (V.O.), and TOM (CONT'D)`; `colors follow first speech and repeat past the palette`; `notes are left out by default and appear as asides when included`; `boneyard never appears, even with notes included`; `an unknown kind falls back to a paragraph` (monkeypatch a block kind); `hostile cue and dialogue stay text`; `characters outside Courier Prime are kept`.
  - `band.test.ts`: `sections when the script has them, else scenes`; `each block's flex-grow is its length`; `labels say the page range`; `scene colors use SCENE_SWATCH`; `no band for a script with no sections or scenes`; `every band link has a target in both views`.
  - `script.test.ts`: `renderScriptHtml has both views, the bar, the band, and Courier Prime faces only for styles used`; `the title page mode none leaves the header with the title only`; `hostile title`; `no URL but data: and #anchors` (as Task 2, on a full script).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** → PASS, plus `pnpm check`, `pnpm -r typecheck`.
- [ ] **Step 5: Commit.** `feat(render-html-file): the reading view, the scene band, and a script's whole file`

### Task 5: Markdown documents: `renderDocumentHtml`

**Files:**
- Create: `packages/render-html-file/src/document.ts`, `test/document.test.ts`

**Interfaces:**
- Consumes: Task 2; `MdNode`, `countWords` from `@drafter/markdown`.
- Produces:
  ```ts
  export interface DocumentHtmlInput { tree: MdNode; title: string; lang: string; generator: string; }
  export function renderDocumentHtml(input: DocumentHtmlInput): string;   // header "Document · N words · M min read" (ceil(words/230), at least 1)
  ```
- Elements as the Preview draws them (`apps/web/app/markdown/render.ts`), with: links whose `url` parses with `new URL` to `http:`/`https:`/`mailto:` → `<a href target="_blank" rel="noopener noreferrer">`, others → text; images → `[Image: alt]` text; raw HTML → text; footnote references → `<sup><a href="#fn-n" id="fnref-n">n</a></sup>` numbered as the Preview numbers them; definitions gathered at the end under `<hr>` in `<ol>` with a back link; section links row from `##` headings (or `#` if no `##`), each heading given `id="h-<n>"`.

- [ ] **Step 1: Write the failing tests:** `headings, lists, quotes, code, emphasis, and rules`; `only http, https, and mailto links are links` (`javascript:alert(1)`, `data:text/html,…`, `vbscript:` → text); `images are their descriptions and nothing is fetched`; `raw HTML is text`; `footnotes are numbered by first reference and gathered at the end, with links both ways`; `an undefined footnote reference stays text`; `the section links go to each ## heading, or # when there is no ##`; `reading time at 230 words a minute`; `no Courier Prime is embedded`; `no URL but the writer's own links, data:, and #anchors`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** → PASS.
- [ ] **Step 5: Commit.** `feat(render-html-file): a Markdown document's page, with working links and footnotes`

### Task 6: Export → HTML in the app and the desktop app

**Files:**
- Modify: `apps/web/app/workers/export-compute.ts` (request kinds `html` and `markdown-html`; `exportOne` builds them; fonts via the existing `fontsOnce`), `workers/export-progress.ts` (weights for both; reuse `script`/`markdown`), `storage/export.ts` (`ExportKind` gains `'html'`; `EXPORTS` adds it for both document kinds; `MIME.html = 'text/html'`; `EXTENSION.html = '.html'`; `withOptions` keeps notes for `md` and `html`; the request built with `kindLine` from `countScript`/`runningTime` and the script's rate, `generator` from the app version, `lang` from the document), `storage/text.ts:105` (extension type), `storage/files.ts` (`FileKind` + picker `TYPES` entry "Web page"), `storage/desktop-files.ts`, `desktop.ts` (`DesktopSaveExtension`), `storage/export-options.ts` (the notes legend becomes "Include notes (Markdown and HTML)"; `NOTES_ONLY_MARKDOWN` text says Markdown and HTML), `components/ExportOptionsDialog.vue`, `commands/data.ts` (`{ id: 'export-html', title: 'Export as HTML', group: 'File' }` after `export-md`), `commands/builtin.ts` (`'export-html': { enabled: () => exportsHere('html'), run: () => void exportScript('html') }`), `components/ExportMenu.vue` (a button, icon `i-lucide-globe` or the closest in the app's set), `components/AppMenu.vue` (`EXPORT_ICONS`), `pages/docs/*` help page that lists exports, `apps/desktop/src/file-handlers.ts` (`SaveExtension`, `SAVE_EXTENSIONS`), `apps/desktop/src/files-ipc.ts` (`SAVE_FILTERS` "Web page"), `apps/desktop/src/files.ts` (`WRITE_EXTENSIONS` adds `.html`), `apps/desktop/test/menu.test.ts` (expects `export-html`)
- Test: `apps/web/test/export*.test.ts` (the existing unit tests for `storage/export.ts` and the worker), `apps/web/e2e/export.spec.ts`, `apps/web/e2e/a11y.spec.ts`, `apps/desktop/e2e/menu.spec.ts` or `files.spec.ts`

**Interfaces:**
- Consumes: `renderScriptHtml`, `renderDocumentHtml` (Tasks 4–5); `parseMarkdown` (Task 1).
- Produces: `ExportRequest` gains `{ kind: 'html'; source; template; options?; title; lang; generator; kindLine }` and `{ kind: 'markdown-html'; source; title; lang; generator }`; the reply's `data` is the HTML string.

- [ ] **Step 1: Write the failing tests:**
  - Unit: `html is an export for scripts and Markdown documents`; `the HTML file is named like the others, ending .html`; `notes travel to an html export when included`; the worker `builds an html file from a script with the export options` (scene numbers none/all, title page none) and `from a Markdown document`.
  - e2e `export.spec.ts`: `exports HTML from the Export menu, the app menu, and the palette` (download, `.html`, starts with `<!doctype html>`); `the exported file opens with every request blocked` (open the downloaded file in a new page with `page.route('**/*', r => r.abort())` except the file itself, then assert no request was attempted beyond it, the Pages view visible, the switch shows Reading, the toggle switches to light); `with JavaScript off the file still shows the pages` (a context with `javaScriptEnabled: false`); `a Markdown document exports HTML with its links and footnotes`.
  - e2e `a11y.spec.ts`: `exported HTML has no accessibility violations` for a screenplay (Pages and Reading) and a Markdown document, in both palettes (title includes "accessibility violations").
  - Desktop: File › Export › HTML saves an `.html` (follow `menu.spec.ts`'s Markdown export test).
- [ ] **Step 2: Run them.** Unit → FAIL; build the test app and run the new e2e on chromium (port 4198) → FAIL.
- [ ] **Step 3: Implement** the wiring listed above.
- [ ] **Step 4: Run them** plus `export.spec.ts`, `a11y.spec.ts`, `palette.spec.ts`, `markdown.spec.ts`, `phone.spec.ts` on every project, and `pnpm --filter @drafter/desktop e2e` (it runs `build:web`, which clears `apps/web/.output`: rebuild before web e2e again) → PASS.
- [ ] **Step 5: Commit.** `feat(web): Export as HTML, for scripts and Markdown documents, on the web and the desktop`

### Task 7: The CLI's `--html`

**Files:**
- Modify: `packages/cli/src/cli.ts` (`BuildOptions.html?: string`; `.option('--html <file>', 'write a self-contained HTML page (both views, dark and light)')`; in `build`, fonts from `loadFonts()`, `kindLine` from page count at a page a minute with the template's kind), `packages/cli/package.json` (dependency on `@drafter/render-html-file`, `@drafter/outline` if not there), `packages/cli/README.md`
- Test: `packages/cli/test/cli.test.ts`, `acceptance.test.ts`

**Interfaces:**
- Consumes: `renderScriptHtml` (Task 4).

- [ ] **Step 1: Write the failing tests:** in `describe('drafter build')`: `writes an HTML file with --html` (`drafter('build', fixture, '--html', out)` → code 0, file starts `<!doctype html>`, contains `data-view="pages"` and a `@font-face`); `--html - writes to standard output`; `--html with --scene-numbers numbers the scenes`; `refuses two outputs to standard output` (with `--pdf -`); the help lists `--html`. Acceptance: the built CLI writes an HTML for a sample.
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/cli test` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** → PASS.
- [ ] **Step 5: Commit.** `feat(cli): drafter build --html`

### Task 8: Size and speed, docs, and the README

**Files:**
- Create: `packages/render-html-file/test/budget.test.ts`
- Modify: `README.md` (the Formats section's export table gains **HTML**; the "What you can do today" Files line), `docs/technical-details.md` via `tech.ts`, `docs/DECISIONS.md` (the design's calls, with the measured size and time), `CHANGELOG.md` (`[Unreleased]` → Added), `docs/DEFERRED.md` (images embedded as base64; search; contents sidebar), help page(s) for exports and the Export options dialog's help text

- [ ] **Step 1: Write the failing test:** `budget.test.ts`: generate an original 120-page and a 300-page screenplay (repeat original scenes with varied names), lay them out, `renderScriptHtml` with all four font styles: `120 pages: under 2 MB and under 1 s`; `300 pages: under 4 MB and under 3 s` (record both figures in DECISIONS). Mark the timing assertions with the repo's existing pattern for load-sensitive tests.
- [ ] **Step 2: Run it.** → FAIL until Tasks 2–5 are in (they are; it may already pass — if it fails on size, implement WOFF2 or trim the stylesheet; on time, remove quadratic string building).
- [ ] **Step 3: Write the docs** listed above, in the repo's voice; README stays concise (move detail to docs).
- [ ] **Step 4: Full gates.** `set -e; pnpm install; pnpm check; pnpm -r typecheck; pnpm test` (re-run load-sensitive timing failures alone and record both), the web e2e suite on every project, `pnpm --filter @drafter/desktop e2e`.
- [ ] **Step 5: Commit.** `docs: Export as HTML in the README, the help, and the decisions, with its measured size and speed`

### Task 9: Export → EPUB (design §10a)

**Files:**
- Create: `packages/archive/src/zip-write.ts` (`zipStored(entries: { name: string; data: Uint8Array }[]): Uint8Array`, local headers + central directory + end record, UTF-8 names, `crc32` from `crc32.ts`), `packages/archive/test/zip-write.test.ts`, `packages/render-html-file/src/epub.ts`, `packages/render-html-file/test/epub.test.ts`
- Modify: `packages/archive/src/index.ts`, `packages/render-html-file/src/index.ts`, and the same app wiring as Task 6 for a new kind `epub` (`ExportKind`, `EXPORTS`, `MIME.epub = 'application/epub+zip'`, `EXTENSION.epub = '.epub'`, `FileKind`, pickers "E-book", desktop save types, `export-epub` command after `export-html`, Export menu, app menu icon), `apps/desktop/test/menu.test.ts`, README Formats table, CHANGELOG, DECISIONS, help

**Interfaces:**
- Consumes: Task 4's Reading builder and Task 5's document builder (refactor them so the body builders can emit XHTML: self-closing void elements, `xmlns`, no inline script/style).
- Produces: `renderScriptEpub(input: Omit<ScriptHtmlInput, 'kindLine'> & { author?: string; modified: Date; id: string }): Uint8Array`; `renderDocumentEpub(input: DocumentHtmlInput & { author?: string; modified: Date; id: string }): Uint8Array`.

- [ ] **Step 1: Write the failing tests:** `zip-write.test.ts`: `round-trips through the archive's own reader` (names, bytes, order), `stores without compression`, `UTF-8 names`, `an empty entry`. `epub.test.ts`: `mimetype is the first entry, stored, exactly application/epub+zip`; `container.xml points at the package`; `every manifest item exists and every file is in the manifest`; `every content document parses as XHTML` (jsdom `DOMParser` with `application/xhtml+xml`, no `parsererror`); `the nav lists every act (or chapter) and, for a script, its scenes`; `a script's EPUB is its Reading view: every speech once, in order`; `footnotes are EPUB footnotes, linked both ways`; `hostile text escaped in content, title, and author`; `no script element and no http(s) reference anywhere`; `Courier Prime only for a script, only styles used`. If `epubcheck` is on PATH, a test runs it and expects no errors (skipped otherwise).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement** the writer, the XHTML variants of the body builders, the package, nav, and container, and the app wiring.
- [ ] **Step 4: Run them**, plus e2e: `exports an EPUB from the Export menu, the app menu, and the palette` (download; unzip with the archive reader; mimetype first) on every project; desktop File › Export › EPUB. → PASS.
- [ ] **Step 5: Commit.** `feat: Export as EPUB, for reading a draft on an e-reader`
