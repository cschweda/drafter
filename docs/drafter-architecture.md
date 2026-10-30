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

- `en_US` and `en_GB` are bundled (SCOWL-derived, permissive license), as static files that are precached for offline use. Other languages are opt-in dictionary packs the user adds, in Phase 4; each will show its license, which keeps GPL-licensed dictionary data out of the MIT app bundle. Built in Phase 2, Plan D (v0.14.0).
- Character names and slugline locations are auto-harvested from the CST and never flagged. "Add to dictionary" writes to the file's metadata block so it travels with the script; "Add to personal dictionary" applies across all projects.
- A full-script check on demand lists results in the Problems tab under "Spelling."

---

## 10. Outline ⇄ Script

This is the feature to get right, because no app does it losslessly. The trick is that in Fountain the outline is *already in the file*: `#` sections, `=` synopses, scene headings. So:

- **Condense.** Fold every scene to its heading + synopsis (and sections to their title). What you're looking at is still the source — just folded. Export it as Markdown or a treatment document. Reorder scenes in this view and the full scene text moves with it.
- **Expand.** Start from an outline — a list of `#` sections, sluglines, and `=` synopses typed in the source or pasted as Markdown — and the editor turns each into a scene stub. Writing fills in the stubs; the synopsis stays attached as the scene's summary in the Outline and Cards panes.
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

The ordering principle: **the reasons to choose Drafter over Beat must be on screen at the first public release.** That means the Problems pane, the stage-play template, and accessibility move up, Final Draft files follow the outline, and radio and TV formats come later. The [README's roadmap](../README.md#roadmap) has the summary, with what has shipped.

**Not planned:** accounts, a Drafter server, or sync through Drafter. From Phase 1, a script saved in a folder that Dropbox, Google Drive, iCloud, or Syncthing keeps in sync syncs like any other file, in browsers that save in place (§6). PDF import is out of scope through Phase 4.

### Phase 0 — Engine (no UI)

The engine as standalone packages, with no UI. The phase ends when a CLI turns a `.fountain` file into a correctly paginated PDF and the full test suite passes. If this phase is right, everything after it is UI.

**Builds**

- `@drafter/fountain`: a concrete-syntax-tree parser and printer that reparses in full on every change. Every block keeps its raw text, so printing is lossless. Where the spec's strict reading would garble a common mistake, the parser reads leniently and flags the spot.
- `@drafter/templates`: the template schema and loader (validation, `extends`, inch-to-character conversion) and two built-in templates, **US Screenplay (Feature)** and **Stage Play (Dramatists Guild standard)** (`us-screenplay` and `stage-play-standard`).
- `@drafter/layout`: `paginate(doc, template)`, covering word wrap, keep-with-next, dialogue splitting with `(MORE)` and `(CONT'D)`, dual dialogue, scene numbers, forced page breaks, and the title page.
- `@drafter/render-pdf`: PDF output with Courier Prime embedded. It runs in Node and in a browser worker.
- `@drafter/cli`: `drafter build <file> [--pdf] [--txt] [--json] [--template] [--scene-numbers]` and `drafter check <file>`.

**Done when**

- Printing a parse reproduces the input exactly, for 10,000 random strings and every fixture.
- Reparsing after multi-range edits matches a fresh parse across 1,000 random edit sequences.
- Every classification fixture matches its expected element sequence.
- Layout property tests pass: no overfull page, no page that starts blank, no character cue stranded at the bottom of a page, and every line maps back to its source.
- Hand-checked position fixtures match, the PDF's text and page count match the layout, and pagination is deterministic.
- Malformed templates are rejected with a complete list of errors and are never partially applied.
- The CLI writes PDF, text, and JSON output, and `drafter check` fails on an unclosed boneyard.
- Build, tests, and lint are clean from a fresh clone.

The exact criteria are in the [Phase 0 kickoff prompt](drafter-phase0-kickoff-prompt.md).

### Phase 1 — Minimum IDE (first public release)

**Builds**

- The Nuxt 4 single-page app, with Nuxt UI v4 for panes, menus, the command palette, and dialogs, laid out like the Inform 7 IDE: two facing panes that can each show any tab, a toolbar of round buttons, and a status bar. Dark by default, with a light theme.
- A first visit that opens on a sample screenplay, with a welcome dialog, an optional two-minute guided tour, and New screenplay, New stage play, and Open a file one click away.
- The CodeMirror 6 source pane: highlighting driven by the one parser, Tab and Enter conveniences that insert plain Fountain, autocomplete for characters, locations, transitions, and sections, and folding by scene and section.
- Focus mode, which leaves only the page you're writing on, and typewriter scrolling, which keeps the line you're typing in the middle of the screen.
- A sprint timer, a daily goal, and a count of pages, scenes, words, and running time.
- The Script tab, with live pagination in a Web Worker.
- The Problems tab, with the starter set of lint rules and the Strict Fountain checks.
- Saving like a desktop app: Open, Save, and Save As for `.fountain` files (in place on Chromium, by download elsewhere), a warning before leaving with unsaved changes, and an always-on recovery copy in the browser, with a warning when the browser may clear it (per §6.2: the recovery copy is in IndexedDB, with `storage.persist()` and honest warnings). On Chrome and Edge, saving in place means a script kept in a Dropbox, Google Drive, or iCloud folder syncs through that service's own app.
- Export to PDF and plain text.
- A template switcher for screenplay and stage play, and a sample script for each.
- Phones and tablets, with one pane at a time on a phone.
- Accessibility: keyboard-complete, a rendered pane navigable by headings, and axe-clean.
- Deployment to drafter.dev.

**Done when** a person can write a feature or a play in it, with the script built for screen readers to read by its structure and checked by automated tests. The [Phase 1 design](drafter-phase1-design.md) has the details.

### Phase 2 — Structure

Every change in the Outline, Cards, and Notes tabs is an edit to the source.

**Built**

- The Outline: condense to outline and expand from outline, and scene reordering with a keyboard equivalent for every drag (v0.10.0).
- Final Draft `.fdx` import and export (v0.11.0, Plan FD; moved up from Phase 3, decided 2026-10-28), with nothing dropped silently on import: an import comes in as a new, unsaved script, anything Drafter has no element for becomes a `[[fdx: …]]` note that Problems lists, and the `.fdx` itself is never changed. Import has been checked against Final Draft 13's own Outline, Script, and Shooting Script samples; a round trip through Final Draft itself is still to come.
- Cards and Notes, with Scene details (v0.12.0, Plan B). Notes has categories and status (open, resolved).
- Scene goals (v0.12.0): optional goal, conflict, outcome, and value shift for each scene, kept in the file as Fountain notes. Scene details writes and edits them, and the Outline and the cards show the goal; the script map will too.
- Setups and payoffs (v0.12.0): mark a setup, link it to its payoff, and see the setups that never pay off.
- Snapshots with a retention schedule, and a Compare view that renders two snapshots as script pages with changed lines marked, and History (v0.13.0, Plan C).
- Writing statistics by day, kept on your device (v0.5.0).
- Spellcheck with nspell and a per-script dictionary that knows your character names (v0.14.0, Plan D): offline, in US or British English, with a right-click menu, a dictionary of your own, and a Spelling list in Problems.
- The Structure strip (v0.15.0), described in the [README](../README.md#the-idea) and the [Structure strip design](drafter-structure-strip-design.md).
- PDF export for Markdown documents (v0.16.0, the [Markdown PDF design](drafter-markdown-pdf-design.md)): headings, lists, quotes, code, and clickable links on numbered US Letter or A4 pages, in Inter Tight with Courier Prime for code, drawn in the export worker and working offline. The PDF isn't tagged yet, and has no bookmarks; both wait for the final accessibility steps.
- Getting a script out the door (v0.17.0, the [out-the-door design](drafter-out-the-door-design.md)): a guided first screenplay and first stage play that teach each element as you read; export options for scene numbers (none, as written, or every scene) and the title page (full, title and author only, or none), kept per script; the running time at a rate set per script, with an estimate from the dialogue, and each scene's and act's time in the Outline and the Structure strip; and a Technical details help page.
- Version history (v0.18.0, the [version-history design](drafter-version-history-design.md)): **Deleted scenes**, every scene in a snapshot that is in no scene of the script now, with **Put back** to its old place in one undo; **Show changes**, the Script pane's pages marked against the last save or a chosen snapshot, never printed; a **Changes** view in Compare, a GitHub-style diff of the Fountain text grouped by scene, with + and −, the changed words marked, folds, and side by side, in red and green or blue and orange (Compare's Pages view keeps its asterisks); and **History of this scene**, every version of one scene, with **Use this version**. The scenes are matched across versions by `@drafter/history` in a worker of its own, with its notes cached in a second database, `drafter-cache`.

**Next:**

- v0.19.0: import from Highland and Fade In (moved up from Phase 3), with `.md` listed among the imports.
- Then Plans E to H (v0.20.0 to v0.23.0, Phase 2 design §22), Plan E with Scaffold.

**To come**

- A Beat Board: a free canvas of idea cards to color, link, and move into the outline. The ideas live in the file as Fountain.
- Storylines: tag scenes with A, B, and C plots, each in its own color, and see them as lanes along the outline's page timeline, on the cards, and in the script's margin.
- The Stats tab, including screen time per character and who shares scenes with whom.
- Scaffold (Plan E, named by the maintainer): a panel beside the script that shows who is in the current scene (speaking or silent, with each one's words and share of its time), where it is, and how long it runs; a page for each character (their scenes, screen time, dialogue share, absences, and lines) and for each location. Built on the Stats tab and v0.17.0's per-scene timing.
- The built-in Reference tab.
- A script map: every scene as a block sized by its length beside the editor, colored by INT/EXT, day or night, or storyline, and clicked to jump there. It builds on the Structure strip's geometry, and Plan E decides whether it is still wanted beside the strip.
- A pacing view: scene lengths and the balance of dialogue and action along the page timeline, with optional structure guides (three acts, five acts, fifteen beats, each with Drafter's own plain labels) laid over it as suggestions, never rules.
- A character-by-scene grid: who is in each scene, as a heat map, with each character's share of the dialogue, so a character who vanishes for 40 pages shows.
- Reader notes, with no account and nothing passing through a server:
  - A reader opens your script at drafter.dev in a reader mode, adds comments to lines or selections (their name, a category and color, replies), and sends them back as a file: the `.fountain` itself, with the comments kept as Fountain notes any Fountain tool can show.
  - You add a reader's file to your current draft, even after you kept writing. Each comment finds its place by its quote, its context, and its scene; a preview says how many matched, how many matched approximately, and how many found no place, and none is ever dropped. Notes typed by hand (`[[Name: comment]]`) merge too.
  - You reply and resolve them in the margin, filter by reader or category, and send your replies back the same way.

### Phase 3 — Formats

- Import from Celtx (Highland and Fade In imports moved up to Phase 2).
- TV single-camera, TV multi-camera (sitcom), radio and audio drama, and UK/BBC (A4) templates, and a template for novels or graphic novels.
- User-added templates, dropped in as JSON, and template export.
- For plays: French scenes, who is on stage at every moment (entrances and exits), and a doubling chart of roles one actor could play because they never share the stage.
- Standalone `.html` export.
- PDF export with notes in the margin, or a clean copy, and a watermark and header for drafts you send out (for example "CONFIDENTIAL" or the reader's name).
- A self-contained reader file: one `.html` a reader opens in any browser to read and comment, for readers who won't visit a site.

### Phase 4 — Craft

- The remaining lint rules.
- Revision marks and colored-page PDF.
- Production revisions: locked pages (12A), scenes marked OMITTED, and scene numbers that start anywhere.
- Alternate versions of a line, switchable in place.
- A "clean" display mode that hides Fountain markers without changing the file.
- Table read, using speech synthesis with a different voice per character.
- A character pass: one character's lines alone, with their cues and context, to read a voice straight through.
- Story order and script order: arrange the scenes of a nonlinear script in story time, and compare the two orders.
- A breakdown report: locations, time of day, and cast for each scene, to export for production.
- Accept or reject a co-writer's edited copy change by change, from Compare.
- One character's dialogue, exported for an actor.
- A PWA install flow. (Offline dictionary caching, planned here, shipped early with spellcheck in v0.14.0.)

### Phase 5 — Community

- A template gallery and a docs site.
- The `@drafter/*` packages and `@drafter/cli` published on npm, so `npx @drafter/cli build script.fountain` works without the app.
- A VS Code extension.
- A plugin API, only if there's demand, sandboxed in a Web Worker per the technical design.

### Later

- Open from and save to Dropbox and Google Drive directly. You sign in with Dropbox or Google in their own window, never with Drafter, and nothing passes through a Drafter server (§6).

### Last — Testing with NVDA and VoiceOver

After every phase is built, the whole app is tested with NVDA on Windows and VoiceOver. Until then every view is built for screen readers and checked automatically (axe, keyboard-only tests, and the accessibility tree), and Drafter claims no conformance with any standard. The [Phase 2 design](drafter-phase2-design.md) (§20) has the reasoning.

---

## 14. Open questions

Decided (see `drafter-technical-design.md` §17 for the full log): MIT license and no GPL code; one parser with decoration-driven highlighting; CST with lossless print; full reparse on every change; lenient readings backed by Strict Fountain lint rules; scene identity kept in the editor's session, with per-scene data in the scene's own text, so colors survive renaming (Phase 2 design §5.2); notes end at a blank line; role rules match exact names; nspell-only spellcheck; characters × lines as units; metadata in a trailing boneyard block; app-style saving with an always-on recovery copy; PDF import out of scope; no plugin API in v1.

Still open:

- **FDX fidelity.** Which Final Draft features are worth round-tripping beyond elements, title page, and scene numbers (ScriptNotes, revisions, scene properties)? Start minimal; add as users ask. Plan FD round-trips elements, title page, scene numbers, synopses, dual dialogue, emphasis, and notes; revisions and anchored notes are deferred (docs/DEFERRED.md).
- **Proportional-font templates** (some stage formats use Times). Proportional layout will measure from the font file's own advance widths (technical design §5.2), but all v1 built-in templates are monospace. Decide whether to ship a Times-based play template in Phase 3.
- **Multi-line parentheticals.** One of Drafter's lenient readings (technical design §2.5), with a Strict Fountain fix. Keep, or push for a Fountain spec amendment?
