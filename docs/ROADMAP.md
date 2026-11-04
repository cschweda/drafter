# Drafter's roadmap

The [README](../README.md#roadmap) has the short list: what's next, and what comes later. This page has the whole plan, phase by phase. Everything on it is free.

## Where things stand

Drafter is at **v0.25.1**, with Novel built on `main` for v0.26.0. You can write at [drafter.dev](https://drafter.dev), [install Drafter on Linux](../README.md#linux) or [on Windows](../README.md#windows), or [build it on your Mac](../README.md#mac).

Phase 1's web app is done, with its accessibility pass. Phase 2 is under way. Lately it brought:

- **a fresh look**: paper pages, a quiet status bar, and one pane with a bottom tab bar on a phone;
- a [**Why Drafter**](https://drafter.dev/docs/why/) page and a [**Download**](https://drafter.dev/docs/download/) page;
- **Export as HTML and EPUB**: a self-contained web page, or an e-book;
- **Scaffold**, which shows who is in the scene you're writing;
- the **Stats tab**, with a character-by-scene grid;
- version history, Highland and Fade In imports, footnotes in Markdown documents, and `drafter convert`;
- **HTML and EPUB exports Drafter can reopen** (v0.23.1);
- **Drafts and Cuts** (v0.24.0): numbered drafts, each kept for good with an ID of its own, Draft by draft, and Cuts, everything you cut, kept as plain files beside your script.
- **Story map** (v0.24.1): one dark page that answers "What are you writing?" in pictures, to send to anyone: the story's shape, its people, and every scene so far, with a few lines of dialogue and what is still to write. No code, no notes, nothing fetched.
- **Drafter for Claude** (v0.24.2): a local, read-only MCP server, so Claude Desktop, Claude Code, or any app that speaks MCP can read the scripts, drafts, and cuts in folders you choose: ten tools and seven prompts, on npm as `drafter-mcp` and on the GitHub Release ([help](https://drafter.dev/docs/drafter-for-claude/)). Drafter itself never calls an AI.
- **Self-hosting** (v0.24.3): `docker compose up -d` serves the web app from your own computer or server, with drafter.dev's security headers, no analytics, and nothing that stores scripts ([help](https://drafter.dev/docs/self-hosting/)).
- **Classic Mode** (v0.25.0): typing the way many screenwriters expect, for anyone who doesn't know Fountain's marks. Enter and Tab move between elements, names and places fill themselves in from the first letter, headings and names are capitalised as you type, and the marks are hidden, so the left side looks like a script. It isn't Fountain typing, but the file is still plain Fountain, key for key what a writer could have typed by hand, so nothing is locked in. **Fountain Mode stays the default**, and the **Fountain | Classic** switch in the top bar, Settings, the command palette, or `Mod+Alt+0` changes it at any time, and changes nothing you've written. Phones get a Next button for Tab. It's built from the convention screenwriting apps share, the maintainer's own words, and the Fountain specification, never by copying any app's screens ([help](https://drafter.dev/docs/classic-mode/), [design](drafter-classic-mode-design.md)).
- **Your script stays with you** (v0.25.1): a privacy audit and a red/blue team audit, both in the README's [Audit record](../README.md#audit-record), with every finding fixed or listed; a **Contrast** button with a slider for each pane and its WCAG 2.1 ratio; Typewriter sounds; and Copy technical details for bug reports and ideas.

Next, in order:

1. **Novel** (v0.26.0, built, waiting for its release): drafting a novel in Markdown, with chapters, sections, and parts, an Outline and Cards with a status and synopsis for each, focus on one passage, and word targets ([help](https://drafter.dev/docs/novel/), [design](drafter-novel-design.md)). Then **v0.26.1**, the manuscript exports: a PDF and a Word file in manuscript layout.
2. **Production**, free: revision colors, locked pages, OMITTED scenes, revised pages, breakdowns, and sides (v0.27.0).
3. Storylines and pacing (v0.28.0).
4. The **Workbook**, a story bible with your pasted, synced, and spoken notes (v0.29.0).
5. An optional one-file `.drafter` project (v0.30.0, open spec).
6. Plans G and H (v0.31.0 and v0.32.0).

A signed macOS download follows. The phases below have the detail.

## The phases

The ordering principle: the reasons to choose Drafter must be on screen at the first public release. That's why the Problems pane, the stage-play template, and accessibility come early, Final Draft files follow the outline, and radio and TV formats come later.

| Phase | Theme | Shipped | Still to come |
|---|---|---|---|
| 0 | Engine: parser, templates, pagination, PDF, CLI | **Done** | |
| 1 | Minimum IDE: the first public release | **Live at drafter.dev**; the desktop app for Linux (v0.4.0) and Windows (v0.8.0), and a Mac build (v0.7.0) | A signed macOS download |
| 2 | Structure | **Under way**: writing stats by day (v0.5.0), the Outline (v0.10.0), Final Draft import and export (v0.11.0), Cards and Notes with scene goals and setups and payoffs (v0.12.0), History and Compare (v0.13.0), spellcheck (v0.14.0), the Structure strip (v0.15.0), PDF export for Markdown documents (v0.16.0); guided starters, export options, running times by scene, and a Technical details page (v0.17.0); version history with deleted scenes, Show changes, and GitHub-style diffs (v0.18.0); Highland, Fade In, and Markdown imports, Open as screenplay, and Export as Markdown (v0.19.0); `drafter convert` and footnotes in Markdown documents (v0.20.0); Scaffold, the Stats tab, and the character grid (v0.21.0); Export as HTML and EPUB (v0.22.0); a fresh look (v0.23.0); HTML and EPUB exports Drafter can reopen (v0.23.1); Drafts and Cuts: numbered drafts, Draft by draft, and every cut kept, beside the script (v0.24.0); Story map, a visual page of your script to send to anyone (v0.24.1); Drafter for Claude, a local MCP server (v0.24.2); self-hosting with Docker (v0.24.3); Classic Mode, typing with Enter and Tab over a file that stays Fountain (v0.25.0) | **Next:** Novel, built for v0.26.0 and awaiting its release: chapters, sections, and parts in Markdown, an Outline and Cards with status and synopsis, focus on one passage, and word targets; then its manuscript PDF and Word exports (v0.26.1); **Production, free for everyone**: revision colors and marks, locked pages and scene numbers, OMITTED scenes, revised pages, a breakdown report, and sides for actors (v0.27.0); storylines, the strip's Color by, and pacing (v0.28.0); the Workbook: a story bible and scene cards, a place for pasted notes, a watched Dropbox, Google Drive, or OneDrive folder for notes, and voice notes kept on your device (v0.29.0); an optional `.drafter` project package (v0.30.0, open spec); then reader notes with no account and the Reference tab (v0.31.0 and v0.32.0) |
| 3 | Formats | Planned | Celtx import; **PDF import** (a script PDF with real text, so you can bring in a draft from any app); TV, radio, UK/BBC, and graphic-novel templates; user templates; French scenes and doubling charts for plays; PDF with notes in the margin or a watermark; a self-contained reader file |
| 4 | Craft | Planned | Alternate lines, a clean display mode, table read, a character pass, story order, accepting a co-writer's changes, the remaining lint rules, a PWA install flow (the production features moved up to v0.27.0) |
| 5 | Community | Planned | npm packages and the CLI, a VS Code extension, a template gallery and docs site, a plugin API only if there's demand |
| Later | | Planned, free | **Real-time co-writing**: write in the same script at the same time, each on your own device, from an invite link, with no account. It goes through a small relay that passes only end-to-end encrypted changes, so it can never read the script; anyone can run their own. Optional, off until you invite someone, and free like everything else |
| Later | | Planned | Open from and save to Dropbox and Google Drive directly, signed in with them, never with Drafter |
| Someday | | Possible future addition | A Windows on Arm (arm64) installer. Until then Windows 11 on Arm runs the x64 installer emulated |
| Someday | | Possible, not planned | A Tauri desktop shell: smaller downloads and less memory, but Linux would use WebKitGTK. Revisit if download size matters, or when the signed Mac app is serious. The shell is kept thin (file access behind `FileAccess`) so this stays open |
| Last | | Planned | Testing with NVDA and VoiceOver, after every phase is built. Until then every view is built for screen readers and checked automatically, and Drafter claims no conformance with any standard |

**Not planned:** accounts, a paid version, or a Drafter server that keeps your scripts. Everything Drafter does is free, including the big features: production, and real-time co-writing, whose relay only passes encrypted changes along and stores nothing it could read. From Phase 1, a script saved in a folder that Dropbox, Google Drive, iCloud, or Syncthing keeps in sync syncs like any other file, in browsers that save in place.

The full list for each phase, with what each item does and when Phase 0 counts as done, is in the [architecture document, §13](drafter-architecture.md#13-phased-plan); the [Phase 1](drafter-phase1-design.md) and [Phase 2](drafter-phase2-design.md) designs have the details.
