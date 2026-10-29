# drafter.dev — High-Level Architecture

*Open-source, local-first, zero-login screenwriting and playwriting IDE. Source on the left, the script on the right.*

Author: Christopher Schweda · Status: Draft v0.2 · October 2026

---

## 1. Vision

Drafter is to screenwriting what the Inform 7 IDE is to interactive fiction: a two-pane environment where the writer works in a plain-text **source** (Fountain) on the left and sees the **compiled** result — a paginated, industry-formatted script — on the right, continuously. Everything the app knows about the script is *derived* from the source. There is no hidden document model, no proprietary file, no account, no server.

Three principles, in priority order:

1. **The source is the truth.** A `.fountain` file is the whole project. Anything Drafter adds (scene colors, synopses, notes, revision marks) is expressed in Fountain syntax or Fountain-compatible metadata so the file stays readable in Beat, Highland, Slugline, BetterFountain, or a text editor.
2. **Local-first, offline-first, forever.** Files on your own disk, with a recovery copy in the browser. Static deploy. Nothing to pay for, nothing to log into, nothing that can be shut off.
3. **Formats are templates, templates are data.** US screenplay, stage play, sitcom, radio drama — each is a declarative template the engine applies. Users can add their own.

Clean-room note: Drafter is built from the public Fountain spec and the publicly documented FDX XML format. Like any writer, the design looked at what other screenwriting apps let people do, through their public documentation; it takes no code, tests, or files from Beat (GPL-3) or any other, so Drafter can be MIT-licensed. If you ever want to pull in Beat code, the whole project becomes GPL — decide once, early. Recommendation: **MIT**.

---

## 2. The IDE (Inform 7 model)

```
┌─────────────────────────────────────┬─────────────────────────────────────┐
│  SOURCE                             │  SCRIPT · OUTLINE · CARDS · NOTES   │
│  (Fountain, CodeMirror 6)           │  · PROBLEMS · STATS · REFERENCE     │
│                                     │                                     │
│  INT. KITCHEN - NIGHT               │  ┌───────────────────────────────┐  │
│                                     │  │              7.               │  │
│  MARGARET sits at the table,        │  │  INT. KITCHEN - NIGHT         │  │
│  not eating.                        │  │                               │  │
│                                     │  │  MARGARET sits at the table,  │  │
│  MARGARET                           │  │  not eating.                  │  │
│  (quietly)                          │  │                               │  │
│  You said you'd call.               │  │           MARGARET            │  │
│                                     │  │           (quietly)           │  │
│                                     │  │      You said you'd call.     │  │
│                                     │  └───────────────────────────────┘  │
├─────────────────────────────────────┴─────────────────────────────────────┤
│  status: p. 7 of 94 · 2 problems · saved 2 min ago · US Screenplay        │
└───────────────────────────────────────────────────────────────────────────┘
```

**Left pane — Source.** CodeMirror 6 editing raw Fountain. This is the key architectural choice and the main departure from Final Draft, Beat, and every WYSIWYG app: the writer edits text, not a rich document. CodeMirror gives us:

- Fountain syntax highlighting driven by **the one parser** (`@drafter/fountain`) via CodeMirror decorations — no second grammar to drift
- Element-aware **Tab/Enter conveniences** that insert plain Fountain (Tab on a blank line → `@` plus auto-uppercase as you type the cue; Enter after a cue → dialogue; Tab in dialogue → `(parenthetical)`). **Markup is visible, always.** Drafter is an honest Fountain editor: what's in the file is what's on screen. The only commands that change the case of existing text are two explicit, named, undoable conversions (action ↔ character). A "clean" display mode that dims or hides markers comes later as a pure display decoration; it never changes the document.
- Autocomplete for character names, locations (sluglines), transitions, and `#` section headings, built from the live AST
- Folding on scenes and sections — this is where "condense to outline" lives
- Spellcheck (nspell, offline) with a project dictionary that knows your character names (see §9)
- Lint diagnostics shown in the gutter, synced with the Problems pane
- Scroll-sync and cursor-sync with the right pane

**Right pane — tabbed, like Inform 7.**

| Tab | What it shows | Derived from |
|---|---|---|
| **Script** | The paginated, formatted script. Same page model as the PDF — what you see *is* the export. Clicking a line moves the source cursor. | AST + template → pagination engine |
| **Outline** | Collapsible tree: sections (`#`), scenes, synopses (`=`), scene colors, page counts, per-scene character list. Drag to reorder → rewrites source. | AST |
| **Cards** | Index-card / corkboard view of scenes with synopsis and color. Same data as Outline, different surface. | AST |
| **Notes** | All `[[notes]]` and `/* boneyard */` in one place, linked back to their position. | AST |
| **Problems** | The linter (§7). Like Inform's "Problems" pane: click to jump. | Lint rules over AST |
| **Stats** | Page count, estimated runtime, dialogue share per character, scene length distribution, INT/EXT and DAY/NIGHT breakdown, pacing chart. | AST + pagination |
| **Reference** | Built-in Fountain syntax reference and the active template's formatting rules. Inform ships its documentation inside the IDE; so should we. | Static + template |

Layout is resizable; either pane can be collapsed for "just write" mode or "just read" mode.

Either pane can show any tab, one pane at a time: choosing a tab that's open in the other pane swaps them.

---

## 3. Stack

**Recommendation: Nuxt 4 + Nuxt UI v4 is fine — with one caveat.** The app is entirely client-side (there is nothing for a server to render), so run it as a Nuxt SPA (`ssr: false`) or hybrid with only the marketing/docs pages prerendered. You get Nuxt's tooling, file-based routing for `/`, `/editor`, `/docs`, `/templates`, and Nuxt UI for the chrome (panes, menus, command palette, dialogs) while the editor core stays framework-agnostic.

Honest alternative: plain **Vite + Vue 3** would be slightly leaner for a single-page app and avoids any temptation to reach for server features. But Nuxt costs you almost nothing here and keeps your toolchain consistent across projects. Go Nuxt.

| Concern | Choice | Why |
|---|---|---|
| App shell | Nuxt 4, Nuxt UI v4, TypeScript, pnpm | Your default; SPA mode |
| Source editor | **CodeMirror 6** | Best-in-class plain-text editor; extensible via facets; used by Replit, Obsidian, Sourcegraph. Not ProseMirror — we are editing text, not a document tree |
| Grammar | None — decorations from `@drafter/fountain` | One parser; highlighting is a projection of the CST onto the viewport |
| Script rendering | HTML + CSS, Courier Prime (OFL) | Same layout engine output drives screen and PDF |
| PDF | **pdf-lib** (or pdfkit in browser) | Pure JS, embeds Courier Prime, runs offline |
| FDX | fast-xml-parser or hand-rolled | FDX is simple XML; write both directions |
| Storage | IndexedDB (via Dexie) + File System Access API | §6 |
| Offline | PWA (vite-pwa / @vite-pwa/nuxt) | Install to desktop; works on a plane |
| Spellcheck | nspell (Hunspell in JS); browser-native disabled | §9 — one checker, one set of squiggles |
| Deploy | Netlify static | Free tier is enough forever |
| Tests | Vitest + Playwright | Pagination and round-trip tests are the heart of the test suite |

---

## 4. Monorepo

The engine must be usable without the UI — a CLI, a VS Code extension, or someone else's app should be able to `import { parse, paginate, toPDF } from '@drafter/...'`. That discipline also keeps the hard logic testable in isolation.

```
drafter/
├── apps/
│   └── web/                  # Nuxt 4 app (drafter.dev)
├── packages/
│   ├── fountain/             # Parser: Fountain text → AST; AST → Fountain text (lossless)
│   ├── templates/            # Template schema + built-in templates (JSON)
│   ├── layout/               # AST + template → Page model (pagination engine)
│   ├── render-html/          # Page model → DOM (right pane)
│   ├── render-pdf/           # Page model → PDF
│   ├── fdx/                  # FDX import/export (AST ↔ Final Draft XML)
│   ├── lint/                 # Rules over the AST → diagnostics
│   ├── outline/              # Condense / expand, reorder, scene operations
│   ├── spell/                # nspell wrapper, dictionary loading, project dictionary
│   ├── stats/                # Page count, runtime, dialogue share, pacing
│   ├── cm-fountain/          # CodeMirror 6 integration (decorations, keymaps, autocomplete)
│   └── cli/                  # `drafter build` / `drafter check`
├── templates/                # Community templates live here as plain JSON
├── samples/                  # A short screenplay and stage play: the same story in both formats
└── docs/
```

Build with pnpm workspaces; publish the packages under `@drafter/*` on npm so the engine has a life outside the app.

---

## 5. Data model

**5.1 The CST.** The parser emits a flat, ordered list of blocks that keep their *raw text and surrounding whitespace* (a concrete syntax tree, not an abstract one), with semantic fields computed on top. Every rendered line maps back to a character offset in the source. Simplified view:

```ts
type Element =
  | { kind: 'scene_heading'; text; sceneNumber?; range }
  | { kind: 'action'; text; range }
  | { kind: 'character'; name; extension?; dual?: boolean; range }
  | { kind: 'parenthetical'; text; range }
  | { kind: 'dialogue'; text; range }
  | { kind: 'transition'; text; range }
  | { kind: 'centered'; text; range }
  | { kind: 'lyric'; text; range }
  | { kind: 'section'; depth; text; range }      // # Act One
  | { kind: 'synopsis'; text; range }             // = Margaret waits
  | { kind: 'note'; text; range }                 // [[ ... ]]
  | { kind: 'boneyard'; text; range }             // /* ... */
  | { kind: 'page_break'; range }
  | { kind: 'title_page'; fields: Record<string,string>; range }
```

Inline emphasis (`*italic*`, `**bold**`, `_underline_`) is parsed within `text`. What belongs to one scene (its color, storylines, goal) is a keyed note in the scene's own header, such as `[[Color: blue]]`, so it travels with the scene through reorders, renames, and other apps, and never prints ([Phase 2 design](drafter-phase2-design.md) §5.3–5.4; decided 2026-10-28). What belongs to the script as a whole (the template, the dictionary, revision state) lives in one metadata block at the end of the file (§5.3).

**5.2 Round-trip is a hard requirement.** `print(parse(src)) === src` for *every* input, well-formed or not — guaranteed by the CST keeping raw text. Every edit triggers a full reparse (technical design §2.7), so there's one parsing path to trust. FDX gets its own invariant (export → import → export is stable on supported fields). This is what lets Outline, Cards, and Expand rewrite the source safely. The test corpus is original and synthetic fixtures written for this project: screenplays are almost never public domain, so no third-party scripts are included, and the spec's own examples aren't copied in.

**5.3 Project metadata.** Human-meaningful fields live in the Fountain title page (`Title:`, `Author:`, `Draft date:`). Drafter-specific state lives in a single boneyard block at the end of the file, which every other Fountain tool ignores:

```
/* drafter
{ "v": 1, "template": "us-screenplay",
  "dictionary": ["Margaret", "Keokuk"] }
*/
```

The file stays valid and readable everywhere; the block never interrupts the prose. The block holds only script-wide data; nothing in it is keyed by scene, so it never needs a scene identity. Scene colors are header notes instead (§5.1).

---

## 6. Storage and files (no logins, ever)

Drafter saves the way a desktop app does: the file is the document, and Drafter warns you before you lose unsaved work. Behind that, the browser keeps a recovery copy at all times. Three layers, all local:

1. **The file** — a script is a `.fountain` file you save, like any document. `Mod+S` saves and `Mod+Shift+S` saves as. Where the browser allows it, Drafter writes straight back to the file you opened or saved, such as `~/scripts/boca.fountain`. Where it doesn't, Save downloads a fresh copy of the file.
2. **The recovery copy: IndexedDB (Dexie)** — kept in every browser, whether or not the script has a file, and written as you type. Holds the project list, each project's source, a rolling snapshot history, templates, and UI state. It's what brings your work back after a crash, a killed tab, or a closed window, and it makes "close the tab, come back tomorrow" work without any file dialog.
3. **Export** — one-click to `.fountain` (canonical), `.fdx` (Final Draft), `.pdf`, `.html` (standalone, self-contained), `.txt` (fixed-width), `.md` outline, `.json` (CST). Import from `.fountain`, `.fdx`, `.txt`. PDF import is out of scope through Phase 4 — it is a bottomless well.

**6.1 The honest browser table.** "Local-first forever" is only as strong as the browser's storage guarantees, and those differ a lot. This table is also user documentation; it should appear in the app's docs.

| Capability | Chrome, Edge, and other Chromium browsers | Firefox | Safari (macOS / iOS) |
|---|---|---|---|
| Recovery copy in IndexedDB | ✅ | ✅ | ✅ |
| Open a `.fountain` and **save back to the same file** | ✅ File System Access API | ❌ | ❌ |
| Remember the file across sessions | ✅ (asks again, unless the user chose "Allow on every visit") | — | — |
| Warning before leaving with unsaved changes | ✅ desktop | ✅ desktop | ✅ macOS; unreliable on iOS |
| Drag-and-drop / picker import | ✅ | ✅ | ✅ |
| Download exports | ✅ | ✅ | ✅ |
| `navigator.storage.persist()` honored | Usually, after some site engagement | Prompts the user | Only when installed as an app |
| Risk of the browser **silently evicting** local data | Low once persisted | Low once persisted | **Real**: non-installed sites can lose IndexedDB after ~7 days of non-use |
| Install as PWA | ✅ | ❌ (desktop) | ✅ "Add to Dock / Home Screen" |

Brave is the exception among Chromium browsers: it ships with the File System Access API turned off, so it saves by download, like Firefox and Safari.

**6.2 Saving like a desktop app.** The same rules apply in every browser:

- **Unsaved changes are always visible.** The tab title and status bar mark a script whose changes aren't in its file yet, and the status bar says when it was last saved.
- **Leaving with unsaved changes asks first.** Closing the tab, reloading, or leaving the site triggers the browser's own confirmation. Moving elsewhere inside the app, to the docs say, shows Drafter's own dialog: *Save*, *Leave without saving*, or *Cancel*. The browser's dialog uses its own generic wording and isn't reliable on phones and tablets, or when the system kills a tab; those are the cases the recovery copy exists for.
- **The recovery copy is always on.** Every change reaches IndexedDB within a second of a pause in typing, and at least every few seconds while typing, never on a long timer. Reopening Drafter brings each script back as you left it, with unsaved changes included and still marked unsaved. *Revert to Saved* discards them.
- **Drafter says when the recovery copy isn't safe.** On first use it requests `storage.persist()`. If storage is unavailable (blocked, full, or failing to write) or not persistent (refused, Safari without installing, or a private window), a warning says so and offers the real remedies: save to a file, or install Drafter as an app, which on Safari is what makes storage durable.
- **Firefox, Safari, and Brave save by download.** A web page there can't write to a file it opened, so every Save downloads a fresh copy, and the leave warning effectively means "download again." Repeated saves pile up as numbered copies in the Downloads folder. That's the honest cost of app-style saving where the browser can't save in place.
- Every saved file is a complete `.fountain`, so any copy is a full backup, not a partial one.

Snapshots are stored as full text (scripts are tiny), with a retention schedule (all labeled; unlabeled thinned by age). A **Compare** view renders two snapshots as script pages with changed lines marked — the backbone of revision-mode export.

There is no sync through Drafter, ever. From Phase 1, a script saved in a folder that Dropbox, Google Drive, iCloud, or Syncthing keeps in sync syncs like any other file, in browsers that save in place. A later phase adds direct Open and Save for Dropbox and Google Drive: the user signs in with Dropbox or Google in their own window, never with Drafter, and nothing passes through a Drafter server. Peer-to-peer sync (Yjs over WebRTC) remains a possibility.

---

## 7. Templates

A template is a JSON document that answers two questions: *how is each element formatted* and *how do pages break*. The engine knows nothing about screenplays specifically.

Measurements are in **characters and lines**, the engine's native units (Courier 12pt: 10 chars and 6 lines per inch). Inches are accepted as `{ "in": 1.5 }` and converted at load; the engine never sees inches.

```jsonc
{                                   // abridged; the full schema is in the technical design §4.2
  "id": "us-screenplay",
  "name": "US Screenplay (Feature)",
  "page": { "paper": "letter", "width": 85, "height": 66, "margin": { "top": 6, "bottom": 6, "left": 15, "right": 10 },
            "font": { "family": "Courier Prime", "monospace": true, "pt": 12 } },
  "roles": {
    "scene_heading": { "indent": 0,  "width": 60, "case": "upper", "spaceBefore": 2, "keepWithNext": true },
    "action":        { "indent": 0,  "width": 60, "spaceBefore": 1 },
    "character":     { "indent": 22, "width": 33, "case": "upper", "spaceBefore": 1, "keepWithNext": true },
    "parenthetical": { "indent": 16, "width": 25, "spaceBefore": 0 },
    "dialogue":      { "indent": 10, "width": 35, "spaceBefore": 0 },
    "transition":    { "indent": 40, "width": 20, "case": "upper", "align": "right", "spaceBefore": 1 }
  },
  "roleMap": [ { "kind": ["section", "synopsis", "note", "boneyard"], "role": "omit" },
               { "kind": "*", "role": "@kind" } ],
  "dialogueSplit": { "more": "(MORE)", "contd": "(CONT'D)", "moreIndent": 22,
                     "minLinesBefore": 2, "minLinesAfter": 2, "contdAfterAction": true },
  "sceneNumbers": { "enabled": false, "left": -10, "right": 61 },
  "titlePage": { "layout": "centered-feature" }
}
```

Built-in templates to ship with v1:

- **US Screenplay (Feature)** — the default; this is the one whose formatting rules must be exact, verified by hand-checked fixtures
- **TV Single-Camera** (same as feature plus act breaks and `TEASER`/`ACT ONE` centered)
- **TV Multi-Camera / Sitcom** (double-spaced dialogue, uppercase action)
- **Stage Play — Dramatists Guild standard** (character names centered or left; stage directions in parentheses/italic; ACT/SCENE headings; no sluglines)
- **Stage Play — Acting edition** (Samuel French / Concord style)
- **Radio / Audio Drama** (numbered cues, SFX/MUSIC elements)
- **UK/BBC Screenplay** (A4, slightly different margins)

Templates can `extends` another and override. Users add templates by dropping a JSON file into the Templates panel (stored in IndexedDB) or by pasting JSON. Loading by URL is deferred, because it needs a broader content security policy. The `templates/` folder in the repo is the community library; a PR adds a format.

Because playwriting and radio formats use elements Fountain doesn't name (stage direction, act/scene heading, sound cue), the template declares a **role map**: ordered rules that assign a *role* to each Fountain block based on its kind and content, first match wins. No new syntax is needed:

```jsonc
"roleMap": [
  { "kind": "section", "depth": 1, "role": "act_heading" },
  { "kind": "section", "depth": 2, "role": "scene_heading_play" },
  { "kind": "character", "names": ["SFX", "FX", "SOUND"], "role": "sfx_cue" },
  { "kind": "dialogue", "afterRole": "sfx_cue", "role": "sfx_text" },
  { "kind": "action", "role": "stage_direction" },
  { "kind": "scene_heading", "role": "disabled" },
  { "kind": ["section", "synopsis", "note", "boneyard"], "role": "omit" },
  { "kind": "*", "role": "@kind" }
]
```

So a radio script's `SFX` is typed as a character cue (which is how radio scripts are conventionally typed anyway) and still reads correctly in every other Fountain tool. Stage plays are the caveat: their act and scene headings are `#` sections, which other Fountain tools don't print, so a Drafter play printed elsewhere loses those headings, though the source still shows them. Drafter also reads a few things more generously than the spec, such as **multi-line parentheticals** for wrapped stage directions inside a speech, or a heading with no blank line after it. Each has a Strict Fountain lint rule that rewrites the source into spec form (technical design §2.5). This convention — "Fountain for the stage" — is a small spec that doesn't exist yet and ships in the Reference tab and `/docs`.

---

## 8. Pagination engine (`@drafter/layout`)

A pure function: `paginate(ast, template): Page[]`. No DOM, no side effects, runs in a Web Worker so typing never stutters.

- Measures in **lines**, not pixels: Courier at 12pt is monospace and 6 lines/inch, so a US letter page is 54–55 usable lines and every element's width is a known character count. This is why screenplays can be laid out without a browser. (Proportional fonts for some stage formats will be measured from the font file's own advance widths, so layout stays deterministic and identical in Node and the browser.)
- Handles: keep-with-next (headings, character cues), dialogue splitting with `(MORE)`/`(CONT'D)`, dual dialogue columns, scene numbers, page numbers, `===` forced breaks, title page, and template-driven header/footer.
- Emits a page model where each line carries its source range, so the HTML renderer and the PDF renderer are both thin and the right pane can map clicks back to the source.
- Layout is asynchronous: requests carry a sequence number, a result is rendered only if it's newer than the last one rendered, and the right pane always shows the newest finished layout, with a subtle "updating" state if it lags. A full paginate of a feature is single-digit milliseconds; the worker exists so a pathological document can never stall typing.
- The HTML pane waits for Courier Prime to load (`document.fonts.load`) before rendering, so `1ch` measurements are correct and screen matches PDF.

The regression suite is hand-counted position fixtures (frozen once verified) plus structural property tests — no page overflows, no page starts blank, no orphaned character cue, every line maps to its block.

---

## 9. Spellcheck

**One checker: nspell** (Hunspell dictionaries in JS), offline, running in its own worker on changed blocks. Browser-native spellcheck is **disabled** on the editor — two checkers that disagree about "Keokuk" is worse than either alone.

- `en_US` is bundled (SCOWL-derived, permissive license). Other languages are opt-in dictionary packs the user adds; each shows its license, which keeps GPL-licensed dictionary data out of the MIT app bundle.
- Character names and slugline locations are auto-harvested from the CST and never flagged. "Add to dictionary" writes to the file's metadata block so it travels with the script; "Add to personal dictionary" applies across all projects.
- A full-script check on demand lists results in the Problems tab under "Spelling."

---

## 10. Outline ⇄ Script

This is the feature to get right, because no app does it losslessly. The trick is that in Fountain the outline is *already in the file*: `#` sections, `=` synopses, scene headings. So:

- **Condense.** Fold every scene to its heading + synopsis (and sections to their title). What you're looking at is still the source — just folded. Export it as Markdown or a treatment document. Reorder scenes in this view and the full scene text moves with it.
- **Expand.** Start from an outline — a list of `#` sections, sluglines, and `=` synopses typed in the source or pasted as Markdown — and the editor scaffolds each into a scene stub. Writing fills in the stubs; the synopsis stays attached as the scene's summary in the Outline and Cards panes.
- **Synopsis sync.** Because synopses are real source lines, editing one in the Cards view is a text edit at a known range. No second document model to drift.
- **Treatment export.** Section titles + synopses + (optionally) the first action paragraph of each scene → a readable prose treatment. Final Draft can't do this.

A later, optional feature: "summarize this scene" via a local or user-supplied LLM to *propose* a synopsis. Keep it opt-in and keyless; never required.

---

## 11. The linter (Problems pane)

Rules run over the CST after each parse and surface in the gutter and the Problems tab, exactly like a compiler. Each rule is a tiny function with fixtures for both hits and *non-hits*; users can toggle rules per project, and templates can enable or disable them. The starter set, with the false-positive control each one needs (these are hypotheses to be tuned on real scripts, not promises):

- Unclosed `[[note` or `/* boneyard` — error
- `(CONT'D)` typed manually — the engine adds these; offers a fix
- Character cue cut off from its dialogue — an all-caps line, a blank line, then a parenthetical or dialogue-shaped line
- Scene heading missing a time of day — off in play templates. (A missing `INT.`/`EXT.` can only happen on a forced heading, so that check is off by default.)
- Similar character names (`MARGARET` / `MARGERET`) — Damerau-Levenshtein ≤ 1 *and* both names at least five letters *and* one of the names is used ≤ 2 times *and* neither is a prefix of the other (so MAX/MAC, too short, and ANN/ANNA, a prefix, aren't flagged); info-level, with "mark as distinct" stored in metadata
- First mention of a character in action not in caps — checks only the *first* action occurrence of the exact token, so `the WAITRESS` vs. `WAITRESS` is not flagged
- Dialogue block longer than N lines; scene longer than N pages (needs layout) — both configurable
- Transition not immediately before a heading/section/end
- Dual dialogue taller than a page
- Locked scene numbers out of order
- Strict Fountain — every place Drafter read the file more generously than the spec, with a fix that rewrites it into spec form

---

## 12. What makes Drafter different

Honest competitive framing — Beat already does a lot, and does it well on macOS. Drafter's distinct bets:

1. **The IDE split.** Source + compiled view, always both, with the source as the only document. Writers who came from Markdown, LaTeX, or code will immediately understand it; everyone else gets the Tab/Enter workflow they already know and can ignore the markup.
2. **Problems pane.** A real linter for scripts — continuity, naming, format, and portability to strict Fountain — with click-to-jump.
3. **Templates as data, including stage plays.** Every other app hard-codes two or three formats. Playwrights are badly served; a proper Dramatists Guild template with a documented Fountain convention is a real gap.
4. **Lossless outline ⇄ script.** Because outline structure lives in the source.
5. **Runs everywhere, installs nowhere.** Beat is Apple-only; Trelby and Scrite are desktop installs; most web options want an account. Drafter is a URL that works on a Chromebook, a Linux box, or a Windows machine with zero sign-up, and works offline once installed. (On Safari and iPad it works, with the storage caveats in §6.1 — install it as an app.)
6. **Accessibility as a first-class goal.** Screenwriting software is a wasteland for screen-reader users (and Final Draft's accessibility is weak). The source pane is the easy half; the real work is a rendered pane whose scene headings are real headings, so a screen-reader user navigates the script by structure, plus keyboard equivalents for every drag-and-drop. This is a feature in its own right and one you're unusually qualified to deliver. WCAG 2.2 AA from the first public release, with a11y work items in every phase (§13). Testing with NVDA and VoiceOver comes last, after every phase is built (decided; Phase 2 design §20). Until it's done, Drafter is built and tested to WCAG 2.2 AA but claims no conformance.
7. **Engine as a library.** `@drafter/layout` and `@drafter/fountain` on npm mean the pagination engine outlives the app and can power a CLI (`drafter build script.fountain --pdf`), CI checks, or other tools.
8. **Table-read.** Web Speech API reads the script aloud, a different voice per character, action in a neutral voice, skipping parentheticals. Voice quality and offline availability depend on the OS; the UI says so.

---

## 13. Phased plan

The ordering principle: **the reasons to choose Drafter over Beat must be on screen at the first public release.** That means the Problems pane, the stage-play template, and accessibility move up, and FDX/radio/TV move down.

**Phase 0 — Engine (no UI).** `@drafter/fountain` CST parser with lossless round-trip and fast full reparse; `@drafter/templates` schema + `us-screenplay` + `stage-play-standard`; `@drafter/layout` pagination; `@drafter/render-pdf`. A CLI that turns a `.fountain` into a correct PDF. Full test suite. *If this phase is right, everything else is UI.*

**Phase 1 — Minimum IDE (first public release).**
- **Layout:** a Nuxt shell laid out like Inform 7's, with two facing panes that can each show any tab. Dark by default, with a light theme.
- **First visit:** opens on the sample screenplay, with a welcome dialog and an optional guided tour.
- **Source pane:** CodeMirror with decoration-driven highlighting, keymap, autocomplete for characters and locations, and folding.
- **Writing sessions:** focus mode, typewriter scrolling, a sprint timer, a daily goal, and counts of pages, scenes, words, and running time.
- **Script and Problems:** a Script tab with live pagination, and a **Problems tab with the starter lint rules and Strict Fountain checks**.
- **Saving:** app-style per §6.2 (Save and Save As, an unsaved-changes warning, and an always-on recovery copy in IndexedDB with `storage.persist()` and honest warnings). Open and save `.fountain` (in place on Chromium, which syncs through synced folders, and by download elsewhere). Export PDF and `.txt`.
- **Templates:** a **template switcher with screenplay and stage play**, and a sample script for each.
- **Reach:** works on phones, one pane at a time. Keyboard-complete, heading-navigable rendered pane, axe-clean. Deploy to drafter.dev.

*A person can write a feature or a play in it, and the script is built for screen readers to read by its structure, checked by automated tests. Testing with NVDA and VoiceOver comes last, after every phase.* The details are in [the Phase 1 design](drafter-phase1-design.md).

**Phase 2 — Structure.** Outline, Cards, Notes tabs as source transactions; FDX import/export (moved up from Phase 3, decided 2026-10-28; built in v0.11.0, Plan FD, and not yet tested against real Final Draft files); Outline built in v0.10.0 and Cards and Notes in v0.12.0 (Plan B); snapshots, History, and Compare built in v0.13.0 (Plan C); a Beat Board of idea cards kept in the file as Fountain; storylines (A, B, and C plots) shown as lanes on the outline, on the cards, and in the margin; condense/expand; scene reordering with keyboard equivalents; snapshots, retention, and Compare; Stats, with screen time per character and who shares scenes; writing statistics by day, kept on the device; nspell with project dictionary; Reference tab. To see and work through a script: a script map (scenes as blocks sized by length, colored by INT/EXT, day or night, or storyline); a pacing view (scene length and dialogue-to-action balance along the page timeline, with optional structure guides as suggestions); a character-by-scene grid with each character's dialogue share; scene goals (goal, conflict, outcome, value shift) kept as Fountain notes; setups and payoffs, with the setups never paid off listed. Reader notes with no account: a reader mode at drafter.dev where a reader comments on lines or selections (name, category and colour, replies) and sends the comments back in the `.fountain` as Fountain notes; the author merges them into the current draft by quote, context, and scene (a preview of matched, approximate, and unplaced; none dropped), and replies and resolves them in the margin. Note categories and status in the Notes tab.

**Phase 3 — Formats.** Import from Highland, Fade In, and Celtx; TV single/multi-cam, radio, UK, and novel templates; user-added templates and template export; standalone `.html` export; PDF with notes in the margin or clean, with a watermark and header; a self-contained reader `.html` for commenting in any browser; for plays, French scenes, who is on stage (entrances and exits), and a doubling chart.

**Phase 4 — Craft.** Remaining lint rules; revision marks and colored-page PDF; production revisions (locked pages, OMITTED scenes, scene numbers that start anywhere); alternate versions of a line; "clean" display mode (markers hidden by decoration); table-read; a character pass (one character's lines alone); story order against script order for nonlinear scripts; a breakdown report (locations, time of day, cast per scene); accept or reject a co-writer's edited copy change by change; one character's dialogue exported for an actor; PWA install flow and offline dictionary caching.

**Later.** Direct Open and Save for Dropbox and Google Drive, signed in with those services, never with Drafter (§6).

**Phase 5 — Community.** Template gallery, docs site, `@drafter/*` on npm, `@drafter/cli`, VS Code extension; plugin API only if there's demand, worker-sandboxed per the technical design.

**Last — Testing with NVDA and VoiceOver.** After every phase is built, on Windows and with VoiceOver (Phase 2 design §20).

---

## 14. Open questions

Decided (see `drafter-technical-design.md` §17 for the full log): MIT license and no GPL code; one parser with decoration-driven highlighting; CST with lossless print; full reparse on every change; lenient readings backed by Strict Fountain lint rules; scene identity kept in the editor's session, with per-scene data in the scene's own text, so colors survive renaming (Phase 2 design §5.2); notes end at a blank line; role rules match exact names; nspell-only spellcheck; characters × lines as units; metadata in a trailing boneyard block; app-style saving with an always-on recovery copy; PDF import out of scope; no plugin API in v1.

Still open:

- **FDX fidelity.** Which Final Draft features are worth round-tripping beyond elements, title page, and scene numbers (ScriptNotes, revisions, scene properties)? Start minimal; add as users ask. Plan FD round-trips elements, title page, scene numbers, synopses, dual dialogue, emphasis, and notes; revisions and anchored notes are deferred (docs/DEFERRED.md).
- **Proportional-font templates** (some stage formats use Times). Proportional layout will measure from the font file's own advance widths (technical design §5.2), but all v1 built-in templates are monospace. Decide whether to ship a Times-based play template in Phase 3.
- **Multi-line parentheticals.** One of Drafter's lenient readings (technical design §2.5), with a Strict Fountain fix. Keep, or push for a Fountain spec amendment?
