# Why Drafter

The [What is Drafter?](https://drafter.dev/docs/what-is-drafter/) page on drafter.dev starts at the beginning, for writers, productions, and technical people, and the [Why Drafter](https://drafter.dev/docs/why/) page makes the case for writers, with the full comparison. This page keeps the longer notes behind it: the idea Drafter is built on, its principles, what makes it different, and the whole list of what it does today. How the code works is in [Developing Drafter](DEVELOPMENT.md#how-it-works).

## Contents

- [The idea](#the-idea)
- [Principles](#principles)
- [What makes it different](#what-makes-it-different)
- [Everything Drafter does today](#everything-drafter-does-today)
- [The pitch, in full](#the-pitch-in-full)
- [Acknowledgments, in full](#acknowledgments-in-full)

## The idea

Drafter does for screenwriting what the [Inform 7](https://ganelson.github.io/inform-website/) IDE does for interactive fiction. You work in a plain-text **source** on the left and see the **compiled** result, a paginated script, on the right. Everything Drafter knows about the script is derived from the source. There is no hidden document model, no proprietary file format, no account, and no server.

```
┌──────────────────────────────┬──────────────────────────────────┐
│ SOURCE · Fountain            │ SCRIPT · OUTLINE · CARDS · NOTES │
│                              │ PROBLEMS · STATS · REFERENCE     │
│                              │                              7.  │
│ INT. KITCHEN - NIGHT         │  INT. KITCHEN - NIGHT            │
│                              │                                  │
│ MARGARET sits at the table,  │  MARGARET sits at the table,     │
│ not eating.                  │  not eating.                     │
│                              │                                  │
│ MARGARET                     │              MARGARET            │
│ (quietly)                    │           (quietly)              │
│ You said you'd call.         │        You said you'd call.      │
│                              │                                  │
├──────────────────────────────┴──────────────────────────────────┤
│ The Call.fountain         94 pages · 2 problems · US Screenplay │
└─────────────────────────────────────────────────────────────────┘
```

The left pane is always a [CodeMirror 6](https://codemirror.net) editor showing the raw Fountain, markup and all. The right pane, the Inspector, has its own tabs, and every other view opens there:

| Tab | What it shows | Arrives in |
|---|---|---|
| **Script** | The paginated, formatted script, built from the same page model as the PDF export. Click a line to jump to it in the source. | Phase 1 |
| **Problems** | Lint results, like a compiler's error list. Click to jump. | Phase 1 |
| **Outline** | Sections, scenes, synopses, scene colors, page counts, and running times. Reorder scenes by drag or keyboard, and the source is rewritten. | Phase 2 (built) |
| **Cards** | An index-card view of scenes with synopsis and color, moved by drag or keyboard. | Phase 2 (built) |
| **Beat Board** | A free canvas of idea cards to color, link, and move into the outline, with storylines shown in color. | Phase 2 |
| **Notes** | Every `[[note]]` and `/* boneyard */` in one place, linked to its position, with categories, readers, and open or resolved status. | Phase 2 (built) |
| **Stats** | Page count, running time at your own rate and an estimate from the dialogue, each character's screen time and dialogue share, a character-by-scene grid, INT/EXT and DAY/NIGHT breakdowns, and, next, pacing. | Phase 2 (built) |
| **Scaffold** | Who is in the cursor's scene, where, and for how long, with a page for each character and place. | Phase 2 (built) |
| **Reference** | Fountain syntax and the active template's formatting rules, built in. | Phase 2 |

Above both panes, the **Structure strip** (Phase 2, built) shows the whole script at once: your sections and scenes as a band of blocks, each as wide as its share of the pages and tinted by its scene color, with a page ruler. Click a block, or press Enter on it, to go there. It's off until you turn it on from the toolbar, the palette, Settings, or Ctrl+Alt+O (⌘⌥O on a Mac).

The editor stays on the left and can't be closed. To just write, turn on focus mode (Ctrl+Shift+Enter, ⌘⇧Enter on a Mac), which hides everything but the text. To just read, drag the divider toward the editor and give the Inspector most of the window.

## Principles

1. **The source is the truth.** A `.fountain` file is the whole project. Anything Drafter adds, such as scene colors, a script dictionary, or revision marks, is stored in Fountain syntax or in a single metadata block at the end of the file that other Fountain tools ignore. The file stays readable in Beat, Highland, Slugline, BetterFountain, or any text editor.
2. **Local-first, offline-first.** Your work lives in files on your own disk, with a recovery copy in your browser. Drafter is a static site: nothing to pay for, nothing to log into, nothing that can be shut off.
3. **Formats are templates, and templates are data.** US screenplay, stage play, sitcom, radio drama: each is a declarative JSON template that the engine applies. You can add your own.

## What makes it different

- **Source and script side by side, always.** You edit text, not a rich document, and the markup stays visible. Tab and Enter insert plain Fountain, so the familiar screenwriting-app keystrokes still work.
- **A Problems pane.** A linter for scripts: unclosed notes, cues with no dialogue, near-duplicate character names, and more, with click-to-jump. Drafter reads common Fountain mistakes leniently, and its Strict Fountain checks can rewrite the file into spec form for other tools.
- **Stage plays as a first-class format.** A Dramatists Guild–style template and a documented convention for writing plays in standard Fountain.
- **Runs anywhere with a browser.** Chromebook, Linux, Windows, Mac, or iPad, with no install and no sign-up, and offline once installed as an app.
- **Accessibility as a feature.** WCAG 2.2 AA is the target, checked automatically with axe in every major state; testing with screen readers comes [last](ROADMAP.md). A screen-reader user can navigate the rendered script by structure, and every drag-and-drop has a keyboard equivalent.
- **The engine is a library.** The parser and pagination engine are standalone packages, so they also power a CLI (`drafter build script.fountain --pdf script.pdf`, or `--html script.html`), CI checks, and other tools.
- **Table read** (Phase 4). The browser's speech synthesis reads the script aloud with a different voice for each character.

## Everything Drafter does today

- **Write:** the editor and its live pages; an element bar that writes Fountain for you, with a cheat sheet; Screenplay and Stage play templates, and plain Markdown documents, with footnotes; the command palette, settings, the Problems pane, and optional script modules.
- **Shape the story:** **Outline** (scenes and sections as a tree, with synopses, colors, each one's running time, and a treatment export) and **Cards** (an index card for every scene), both rearranged by drag or keys; **Notes** (every note and boneyard in one list, with categories, readers' names, and open or resolved status); scene goals; setups and payoffs; and the [**Structure strip**](#the-idea), a band of blocks above the panes to click and go.
- **Look back:** **History** (earlier versions, each restorable in one undo); **Compare**, with a GitHub-style **Changes** view beside the script's **Pages**; **Show changes**, marked on the pages; and **History of this scene**.
- **Drafts and Cuts** (v0.24.0, ready, not yet released): numbered drafts, each kept for good with an ID worked out from its text, to read beside the script, compare, or restore as a new draft; **Draft by draft**, how the work changed from one draft to the next; and **Cuts**, everything you cut (a scene, chapter, or section, a speech or paragraph, or 12 words or more), to browse for ideas, copy, insert at the cursor, or put back. Both are kept as plain files beside the script, in the desktop app and in Chrome and Edge, and can be exported as a zip anywhere.
- **See the script:** [**Scaffold**](#the-idea), which follows your cursor and shows who is in the scene, where, and for how long, with a page for each character (scenes, screen time, absences, every line) and each place; and the **Stats tab**, with each character's screen time and dialogue share and a **character-by-scene grid** that shows who vanishes for 20 pages.
- **Check spelling:** Drafter's own spellcheck, offline, in US or British English, with a dictionary of your own and one for each script.
- **Keep going:** focus mode, typewriter scrolling, counts, a daily goal, sprints, and writing stats.
- **Time it:** the running time at your own minutes a page and an estimate from the dialogue, set per script in Stats, with each scene's and act's time in the Outline and the Structure strip.
- **Files:** Save and Open for real `.fountain` files (saved straight back to the file in Chrome and Edge on a computer, downloaded elsewhere), with a recovery copy kept in your browser as you type; every main format in and out, from Final Draft to Markdown, and `drafter convert` for a folder at once (see [Formats](FORMATS.md)); **Export as HTML**, one page that opens in any browser with no connection, and **Export as EPUB**, an e-book for an e-reader or a tablet, either of which Drafter can reopen when you turn on **Let Drafter reopen this file**; a progress bar on a long export; and **export options** per script for scene numbers, the title page, and notes.
- **Get started:** a welcome and a guided tour on a first visit; a **guided first screenplay** and **stage play** (File → New guided screenplay) that teach each element as you read; offline use and installing as an app; help pages, among them **Technical details** (how Drafter is built, with diagrams); and, in the **Help** menu at the top right, **About Drafter** (the version, for a bug report, and the links), [**Sample scripts**](DEVELOPMENT.md#samples), and **Check for updates**.
- **Make it yours:** a calm dark theme by default, or light, or one that follows your system, paper pages or a dark page for night, five text sizes, and Settings in sections; below 1024 pixels, one pane at a time with Write, Script, Outline, and More along the bottom, made for a phone.
- **On the desktop:** an app for Linux (an AppImage or a `.deb`) and Windows (an installer) that always saves in place and loads script modules from a folder. It builds on a Mac with one command.

## The pitch, in full

The README's opening, as it read at v0.23.2, before it was cut down to one list.

**Fountain first, every main format out.** Drafter is built around Fountain, plain text that any app can open and that will still open in fifty years. But a script is never locked in: Drafter opens Final Draft, Highland, Fade In, Markdown, and plain-text files, and exports PDF, Final Draft (`.fdx`), Markdown, plain text, a self-contained web page (HTML), and an e-book (EPUB), so it can go wherever it needs to go. See [Formats](FORMATS.md).

**Open it and write. It's free, and there's no catch.** No sign-up, no sign-in, no licence key, no activation, ever. Drafter is ready the moment the page loads or the app starts.

- **No login, ever.** There is no account to make, and nothing to sign in to every time you start. Close it, open it again tomorrow, and you're back in your script.
- **Instant.** [drafter.dev](https://drafter.dev) opens straight into a script, and the desktop app starts the same way. No installer is needed to begin, and no setup.
- **Free, really. There's no catch.** No price, no trial, no subscription, no "free tier" with the good parts locked away, no ads, and nothing collected about you to sell. Drafter isn't a business: it's made by one writer, for writers, and given away. The production features professionals need are in it too.
- **Open.** The code is MIT-licensed and on GitHub, and your script is a plain `.fountain` text file you own, so a lapsed licence can never lock you out of your own work.
- **Private.** No cookies, no analytics, no tracking, and no telemetry. Your script never leaves your device: Drafter has no server that could receive it. See [Privacy](https://drafter.dev/docs/privacy/).
- **Works offline.** Once it has loaded, Drafter runs with no connection, on a plane or a train.
- **No forced updates.** The web app updates when you reload, or the next time you open it after closing every Drafter tab. The desktop app asks GitHub once at start-up whether there's a new version, never installs or restarts by itself, and can be told not to check at all.
- **Built for working writers, free.** Production features, the kind a script needs once it's greenlit, come to the free app in v0.27.0: colored revision sets with marks in the margin, locked pages (12A) and scene numbers, OMITTED scenes, revised pages to send out, a breakdown report, and sides for actors. There is no paid version, and there won't be one.
- **Plays well with Final Draft.** It opens and saves Final Draft (`.fdx`) files, so you can trade scripts with anyone who uses it.

**The big features, all free**

- **Industry-standard pages.** Screenplay and stage-play formatting laid out live as you type, with page counts you can trust, and a PDF that looks like what readers, agents, and productions expect.
- **Final Draft files in and out.** Open the `.fdx` a producer sends and hand one back; Highland, Fade In, Fountain, and Markdown open too.
- **Structure tools.** Outline, index cards, the Structure strip, scene colors, synopses, notes with readers' names, setups and payoffs, and running times by scene and act.
- **See the script.** Scaffold follows your cursor and shows who is in the scene; the Stats tab has each character's screen time, dialogue share, and a character-by-scene grid.
- **Every draft kept.** Version history, Compare with a GitHub-style view of what changed, Show changes on the pages, and the history of one scene; numbered drafts, each kept for good; and Cuts, everything you cut, to read, copy, or put back.
- **Production, coming free in v0.27.0.** Colored revision sets with marks in the margin, locked pages (12A) and scene numbers (5A), OMITTED scenes, revised pages to send out, a breakdown report, and sides.
- **Writing help.** Focus mode, typewriter scrolling, daily goals, sprints, writing stats, and its own offline spellcheck.
- **Everywhere you write.** A web app, desktop apps for Windows and Linux (and a Mac build), and it works on a phone, offline.

## Acknowledgments, in full

- [Fountain](https://fountain.io), the plain-text screenplay format created by John August and Stu Maschwitz, with many contributors.
- The [Inform 7](https://ganelson.github.io/inform-website/) IDE, Graham Nelson's environment for writing interactive fiction. Drafter takes none of the interactive fiction itself (the parser games in the line of Zork and Enchanter), only the IDE: two facing panes, plain source on one side and the result on the other, tabs that either pane can show, and how easily that lets you write, see the outcome, and go straight back to the line that produced it.
- [Courier Prime](https://fonts.google.com/specimen/Courier+Prime), the screenplay typeface Drafter targets, released under the SIL Open Font License.
- [Inter Tight](https://fonts.google.com/specimen/Inter+Tight), the typeface of Drafter's wordmark and interface, also under the SIL Open Font License.
