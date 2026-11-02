# Drafter

![Drafter: Fountain first. Fountain is a plain-text script format for screenplays and stage plays; novels and notes in Markdown; Classic mode coming soon. A script page fans out into a stack of colored revision pages.](brand/og-image-animated.svg)

**Drafter™ is a free, open-source writing app for screenplays and stage plays in plain-text [Fountain](https://fountain.io), and for novels and treatments in Markdown: you write on the left, and the formatted pages build on the right as you type.**

[![Latest release](https://img.shields.io/github/v/release/cschweda/drafter?label=release)](https://github.com/cschweda/drafter/releases/latest)
[![Desktop build](https://github.com/cschweda/drafter/actions/workflows/desktop.yml/badge.svg?branch=main)](https://github.com/cschweda/drafter/actions/workflows/desktop.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Write at drafter.dev](https://img.shields.io/badge/web-drafter.dev-0a7d5a)](https://drafter.dev)

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/images/drafter-ide-light.png">
  <img src="docs/images/drafter-ide-dark.png" alt="Drafter with a screenplay open. On the left, the Fountain source, with the scene heading, the synopsis, the scene color, and character names in color, and the element bar above. On the right, the same scene laid out on a sheet of paper in the Script tab.">
</picture>

**[Write now at drafter.dev](https://drafter.dev)** · **[Download](https://drafter.dev/docs/download/)** · **[What is Drafter?](https://drafter.dev/docs/what-is-drafter/)** · **[What's new](https://drafter.dev/docs/whats-new/)**

> [!NOTE]
> **Status: v0.24.0.** The web app and the desktop apps for Windows and Linux are ready to use, and Phase 2 is under way. Drafts and Cuts is out; next up is Story map (v0.24.1), a visual page of your script to send to anyone. See the [roadmap](#roadmap).

## Free, no login, private

Open it and write. Drafter is ready the moment the page loads or the app starts.

- **Free, with no catch.** No price, no trial, no subscription, no locked "free tier", and no ads. Drafter isn't a business: one writer makes it, for writers, and gives it away. There is no paid version, and there won't be one.
- **No login, ever.** No sign-up, no sign-in, no licence key, no activation. Close it, open it tomorrow, and you're back in your script.
- **Private.** No cookies, no analytics, no tracking, no telemetry. Drafter has no server that could receive your script, so it never leaves your device. See [Privacy](https://drafter.dev/docs/privacy/).
- **Open.** The code is MIT-licensed. Your script is a plain `.fountain` text file you own, which any app can open and which will still open in fifty years. A lapsed licence can never lock you out of your own work.
- **Instant, and offline.** No installer or setup is needed to begin. Once it has loaded, Drafter runs with no connection, on a plane or a train.
- **No forced updates.** The web app updates when you reload, or the next time you open it after closing every Drafter tab. The desktop app asks GitHub once at start-up whether there's a new version, never installs or restarts by itself, and can be told not to check at all.
- **Plays well with Final Draft.** It opens and saves Final Draft (`.fdx`) files, so you can trade scripts with anyone who uses it.
- **Built for working writers.** The production features a greenlit script needs come to the free app in v0.27.0: colored revision sets with marks in the margin, locked pages (12A) and scene numbers (5A), OMITTED scenes, revised pages to send out, a breakdown report, and sides for actors.

## Contents

- [Features](#features)
- [Security](#security)
- [How Drafter compares](#how-drafter-compares)
- [Get Drafter](#get-drafter)
- [Formats](#formats)
- [Roadmap](#roadmap)
- [For developers](#for-developers)
- [Clean-room implementation](#clean-room-implementation)
- [Acknowledgments](#acknowledgments)
- [License](#license)

## Features

- **Write.** The editor and its live, industry-standard pages, with page counts you can trust. An element bar writes Fountain for you, with a cheat sheet. Screenplay and Stage play templates, and Markdown documents with footnotes. A command palette, a Problems pane, offline spellcheck in US or British English, focus mode, typewriter scrolling, a daily goal, sprints, and writing stats.
- **Shape the story.** **Outline** (scenes and sections as a tree, with synopses, colors, running times, and a treatment export) and **Cards**, both rearranged by drag or keys. **Notes**, with categories, readers' names, and open or resolved status. Scene goals, setups and payoffs, and the **Structure strip**, a band of blocks above the panes to click and go.
- **Look back.** **History**, with every version restorable in one undo. **Compare**, with a GitHub-style view of what changed. **Show changes**, marked on the pages, and the history of one scene.
- **Drafts and Cuts.** Start a new draft when you choose: Draft 01, Draft 02, each kept for good with an ID of its own, to read, compare, or restore, and **Draft by draft** to see how the work changed. **Cuts** keeps everything you cut, a scene, a speech, or a paragraph, to browse for ideas, copy, or put back. Both sit as plain files beside your script.
- **Story map.** One dark page that answers "What are you writing?" in pictures, to send to anyone: the story's shape, its people, and every scene so far, with a few lines of dialogue and what is still to write. It opens on a phone, runs no code, and never includes your notes.
- **See the script.** **Scaffold** follows your cursor and shows who is in the scene, where, and for how long, with a page for each character and place. The **Stats tab** has each character's screen time and dialogue share, and a character-by-scene grid that shows who vanishes for 20 pages. Running times by scene and act, at your own minutes a page or from the dialogue.
- **Files and formats.** Real `.fountain` files, saved straight back in Chrome and Edge, with a recovery copy kept as you type. Final Draft, Highland, Fade In, and Markdown in; PDF, Final Draft, Markdown, plain text, HTML, EPUB, and a story map out. See [Formats](#formats).
- **Make it yours.** A calm dark theme by default, or light, or one that follows your system. Paper pages or a dark page for night, five text sizes, and optional script modules. Below 1024 pixels, one pane at a time, made for a phone.
- **Get started.** A guided tour on a first visit, a **guided first screenplay** and **stage play** that teach each element as you read, sample scripts under **Help**, and help pages.
- **Desktop.** Apps for Windows and Linux, and a Mac build, that always save in place and open a `.fountain` file with a double-click.

[Everything Drafter does today](docs/WHY.md#everything-drafter-does-today) has the full list.

### A look around

Each shot shows "Signal Hill", a short screenplay written for these pictures, in your GitHub theme.

<p>
<picture><source media="(prefers-color-scheme: light)" srcset="docs/images/drafter-outline-light.png"><img src="docs/images/drafter-outline-dark.png" width="49%" alt="The Outline tab beside the source: three acts of numbered scenes, each with its synopsis, its color, its page, length, and running time, and the characters in it."></picture>
<picture><source media="(prefers-color-scheme: light)" srcset="docs/images/drafter-cards-light.png"><img src="docs/images/drafter-cards-dark.png" width="49%" alt="The Cards tab beside the source: an index card for each scene, grouped by act, each with a colored band, its heading, its synopsis, and its length in pages."></picture>
</p>

**Outline and Cards.** Move a scene in either one, and the Fountain source is rewritten.

<p>
<picture><source media="(prefers-color-scheme: light)" srcset="docs/images/drafter-stats-light.png"><img src="docs/images/drafter-stats-dark.png" width="49%" alt="The Stats tab: a table of each character's speeches, scenes, words, dialogue share, and screen time, and a character-by-scene grid showing who appears in each of thirteen scenes."></picture>
<picture><source media="(prefers-color-scheme: light)" srcset="docs/images/drafter-scaffold-light.png"><img src="docs/images/drafter-scaffold-dark.png" width="49%" alt="Scaffold's page for the character June: her screen time, dialogue, and longest absence, the characters she shares scenes with, and the places she appears."></picture>
</p>

**Stats and Scaffold.** Who speaks, how much, where, and for how long.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/images/drafter-compare-light.png">
  <img src="docs/images/drafter-compare-dark.png" alt="The Compare tab: the opening kitchen scene's three changed lines since a snapshot, each old line in red with removed words struck through, and each new line in green with added words underlined.">
</picture>

**Compare.** What changed since any earlier version, scene by scene.

<p>
<picture><source media="(prefers-color-scheme: light)" srcset="docs/images/drafter-phone-light.png"><img src="docs/images/drafter-phone-dark.png" width="30%" alt="Drafter on a phone: the Fountain source of the opening kitchen scene, the element bar above it, and Write, Script, Outline, and More along the bottom."></picture>
<img src="docs/images/drafter-pdf-page.png" width="39%" alt="The script's first page as Drafter's PDF prints it: two scenes of headings, action, and dialogue in Courier on a white US Letter page.">
</p>

**On a phone, and on paper.** One pane at a time on a small screen, and a PDF that looks like what readers, agents, and productions expect.

## Security

Drafter is built to open files from anyone without putting you at risk.

- **Drafter never runs anything in a file it opens.** A script is read as text, and your words are shown as words, never as web code.
- **A strict content security policy.** The web app tells your browser to run only Drafter's own scripts, so nothing slipped into a page or a file can run there.
- **No accounts, no server keeping your scripts, no cookies, no analytics, no tracking.** Your files stay on your device.
- **Size limits are checked before anything is unpacked.** A Highland, Fade In, or EPUB file's entries can't point outside their archive. A Final Draft file never makes Drafter fetch or read anything else: the outside references XML allows are refused.
- **The desktop app** never loads an opened file into a window. It reads the bytes of only the files you chose, and hands them to the editor.
- **Reopening an HTML or EPUB file** reads only the script Drafter embedded in it, as text. A browser opening an HTML file outside Drafter is outside Drafter's control, so treat one someone sent you like any downloaded page (see [Open formats](https://drafter.dev/docs/open-formats/)).
- **The trap documents.** Drafter is tested against [262 deliberately broken and hostile files](fixtures/trap/README.md) for every format it opens: Fountain, Markdown, plain text, Final Draft, Highland, Fade In, HTML and EPUB, and the special files a desktop meets, such as pipes and links. Each has the one outcome it must have: opened with its text, or refused with a plain message. The suite checks that nothing crashes, runs, or fetches anything, and that each finishes within its time limit. The readers and the command line run in a worker that is stopped at the limit, so a hang fails the test. The app's own Open runs in the test's thread, so it is timed but can't be stopped mid-hang ([what is enforced](fixtures/trap/README.md#running-it)). The suite runs with `pnpm test` once the packages are built (`pnpm -r build`), and in the desktop app's CI on every push to `main`.
- **Found a security problem?** Please report it privately: choose **Report a vulnerability** on the repository's [Security tab](https://github.com/cschweda/drafter/security) ([SECURITY.md](SECURITY.md) says what to include), or email cschweda@gmail.com with the details. Never in a public issue.

The [Technical details](docs/technical-details.md#security) give the specifics. [Audits](docs/AUDITS.md) lists every security and clean-room audit, newest first.

The latest security audit: [1 November 2026](docs/security-audit-2026-11-01.md), no exploitable hole found.

## How Drafter compares

What each app's maker says on its own site, as of October 2026, at list prices (sales come and go). ✓ means it's there; *paid* means a higher plan; ? means the maker doesn't say. Drafter's not-yet-shipped features show the version they're planned for, never a ✓. Corrections are welcome: [open an issue](https://github.com/cschweda/drafter/issues). The same table is on [Why Drafter](https://drafter.dev/docs/why/), with the reasons behind it.

| | **Drafter** | Final Draft 13 | WriterDuet | Fade In | Highland Pro | Arc Studio | Celtx |
|---|---|---|---|---|---|---|---|
| **Price** | **Free, forever** | $249.99 once, or $99.99/yr | from $9.99/mo | $99.95 once | $59.99/yr | from $69/yr | from $11.24/mo |
| **Free version** | **Everything** | 5-day trial | 3 projects | Watermarked demo | 30-day trial | 2 scripts, watermark | 1 project |
| **Account or sign-in** | **Never** | Store sign-in, 2 computers | Yes | Registration key | App Store | Yes | Yes |
| **Open source** | **✓ MIT** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Your data** | **Stays on your device; no tracking** | On your computer | Cloud | On your computer | On your computer | Cloud | Cloud |
| Mac / Windows / Linux | build it / ✓ / ✓ | ✓ / ✓ / ✗ | ✓ / ✓ / ✓ | ✓ / ✓ / ✓ | ✓ / ✗ / ✗ | ✓ / ✓ / web | web; Mac app |
| Web, and phones | ✓ web, works on phones | iPhone app | ✓ | mobile apps | iPhone, iPad | ✓ | ✓ web |
| Works fully offline | ✓ | ✓ | paid plans | ✓ | ? | ✓ | ✗ |
| Final Draft (.fdx) open / save | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | open / ? |
| Fountain open / save | ✓ / ✓ (its own format) | as plain text only | ✓ / ✓ | open / ? | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| PDF import | planned, free | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Outline and index cards | ✓ | ✓ | ✓ | partial | partial | *paid* outline | ✓ |
| Notes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | *paid* |
| Version history and Compare | ✓ / ✓ | ✓ / ? | ✓ / partial | ✓ / ✓ | ? | *paid* | *paid* |
| Character and scene stats | ✓ | ✓ reports | *paid* reports | ✓ reports | partial | ✓ reports | *paid* |
| Revision colors and marks | v0.27.0, free | ✓ | *paid* | ✓ | ✓ | *paid* | *paid* |
| Locked pages and scene numbers, OMITTED | v0.27.0, free | ✓ | *paid* | ✓ | ? | ✓ | ? |
| Breakdown report and sides | v0.27.0, free | ✓ / ? | ✓ / partial | ✓ / ? | ✗ | partial | *paid* |
| Stage play | ✓ | ✓ | ✓ | ✓ | ✓ | ? | ✓ |
| TV templates | Phase 3, free | ✓ | ✓ | ✓ | ✓ | ✓ | *paid* |
| Spellcheck | ✓ offline | ? | ? | ✓ | ? | ✓ | ? |
| Focus mode, goals, sprints | ✓ | ✓ | ✓ | partial | ✓ | ✓ | ? |
| Read aloud (table read) | Phase 4, free | ✓ | *paid* | ✓ | ? | *paid* credits | ? |
| Dark mode | ✓ | ✓ | ✓ | page colors | ✓ | ✓ | page colors |
| Real-time co-writing | later, free | each writer needs a licence | inviter pays | ✓ | ✗ | *paid* | *paid* |

Sources: each maker's own pricing, features, and help pages (Final Draft, WriterDuet, Fade In, Quote-Unquote Apps for Highland Pro, Arc Studio, Celtx), read on 31 October 2026. Every app here is good at what it does; Drafter's difference is that all of it is free, open, and never asks you to sign in.

## Get Drafter

**On the web:** open [drafter.dev](https://drafter.dev) and write, on a computer or a phone, offline once it has loaded. Chrome and Edge save straight back to your file; other browsers download a copy ([Storage and browsers](docs/DEVELOPMENT.md#storage-and-browsers)). Install it as an app from the address bar to keep it in your Dock or Start menu.

**On the desktop:** the same editor in a window of its own, built with Electron. It always saves in place, keeps its recovery copy in its own folder where no browser can clear it (`~/.config/Drafter`; on Windows `%APPDATA%\Drafter`), opens a `.fountain` file with a double-click, has a menu bar and a modules folder, and asks **Save**, **Don't Save**, or **Cancel** before closing. It always works offline, and makes no network request but one update check at start, never installs by itself (the AppImage and Windows offer **Restart**, the `.deb` **Get it**), and the check can be turned off in Settings. [Drafter on the web and on the desktop](docs/web-and-desktop.md) compares the two.

### Windows

For Windows 10 and 11 on 64-bit Intel or AMD: `Drafter-<version>-windows-x64-setup.exe`, from the [Download page](https://drafter.dev/docs/download/) or the [latest release](https://github.com/cschweda/drafter/releases/latest) under *Assets*. It installs at once, for you alone, with no administrator, and adds Drafter to the Start menu. The installer isn't signed yet, so if **SmartScreen** says *"Windows protected your PC"*, choose **More info**, then **Run anyway**. There's no Windows on Arm (arm64) installer for now; on Windows 11 on Arm (a Snapdragon laptop, or a VM on an Apple silicon Mac) the x64 installer runs under Windows' built-in emulation, a little slower than a native app would. The [Windows install guide](docs/desktop-install-windows.md) has the steps, where everything is, updates and what they're checked for, uninstalling, the modules folder, and building the installer yourself.

### Linux

For 64-bit Intel and AMD (x64), from the [Download page](https://drafter.dev/docs/download/) or the [latest release](https://github.com/cschweda/drafter/releases/latest):

| Package | Use it on | File |
|---|---|---|
| `.deb` | Ubuntu, Debian, Linux Mint, Pop!_OS, and other Debian-based systems. **The one to use on Ubuntu 24.04 and later.** | `Drafter-<version>-linux-amd64.deb` |
| AppImage | Any other distribution (Fedora, Arch, openSUSE, and so on). Nothing to install. | `Drafter-x86_64.AppImage` |

```sh
sudo apt install ./Drafter-<version>-linux-amd64.deb             # the .deb; then start it with drafterdev
chmod +x Drafter-x86_64.AppImage && ./Drafter-x86_64.AppImage    # the AppImage
```

The AppImage needs FUSE 2 (`libfuse2`), and on Ubuntu 24.04 and later an AppArmor profile for Chromium's sandbox, so use the `.deb` there. The [Linux install guide](docs/desktop-install-linux.md) has starting, file types, removing it, the sandbox choices, and updates.

### Mac

There's no Mac download yet: a Mac app from the internet has to be signed and notarized with an Apple developer account, which Drafter doesn't have yet. A signed download that updates itself comes later. Until then, the same app builds on your own Mac with one command, and opens there without any warning. You need Node 22.13 or later, pnpm 10 (`corepack enable`), and `git`:

```sh
git clone https://github.com/cschweda/drafter.git
cd drafter
pnpm install
pnpm desktop:mac
```

Then drag `apps/desktop/release/mac-arm64/Drafter.app` (on an Intel Mac, `apps/desktop/release/mac/Drafter.app`) to **Applications**. To update, run `git pull`, `pnpm install`, and `pnpm desktop:mac` again. The [Mac guide](docs/desktop-install-macos.md) has what to install first, opening files, where Drafter keeps things, updating, removing it, and what to do if something goes wrong. Or skip the build, and install [drafter.dev](https://drafter.dev) as an app from Chrome or Edge: it sits in your Dock, works offline, and saves straight back to your files.

## Formats

Fountain is where you write. Everything else is a door in or a door out.

- **In:** Fountain (`.fountain`, `.txt`) opens as it is. Final Draft (`.fdx`), Highland (`.highland`), and Fade In (`.fadein`) open as a new script. Markdown (`.md`) opens as a document, or as a screenplay. Drafter's own HTML and EPUB exports open again when saved with **Let Drafter reopen this file**. Anything else (Word, RTF, PDF, other web pages and e-books, an image) is refused, with a sentence saying what to do instead.
- **Out:** PDF, Final Draft (`.fdx`), Markdown, plain text, Fountain, a typeset PDF of a Markdown document, a self-contained web page (HTML), an e-book (EPUB), and a **story map**, one picture-first HTML page of the script or play for someone who doesn't read scripts, with no code and no notes in it. Export options per script set the scene numbers, the title page, and whether your notes go along.
- **Beside your script:** a drafts folder (`Boca drafts/Boca – Draft 01.fountain`, each draft a complete Fountain or Markdown file) and a cuts file (`Boca.fountain.cuts.md`, plain Markdown), written by the desktop app and by Chrome and Edge once you allow the folder; elsewhere, a zip to download.

The file you open is never changed, and no words go missing silently: text Fountain has no element for comes in as a note, listed in Problems.

The same code runs in a terminal:

```sh
drafter build script.fountain --pdf script.pdf     # a PDF; --txt for plain text, --html for a web page
drafter build script.fountain --story-map map.html # a story map, to send to anyone
drafter convert ~/Scripts                          # every .fdx, .highland, and .fadein in the folder, to Fountain
```

[Formats](docs/FORMATS.md) has the tables, what each import keeps and leaves behind, reopening HTML and EPUB files, and every command-line option.

## Roadmap

**Done so far:** the engine, the web app with its accessibility pass, desktop apps for Linux and Windows and a Mac build, and most of Phase 2: Outline, Cards, Notes, History and Compare, spellcheck, the Structure strip, Scaffold and Stats, every main import, HTML and EPUB export, and Drafts and Cuts (v0.24.0): numbered drafts, and a permanent file of everything you cut. Story map (v0.24.1) is built and ready, but not yet released.

**Next:**

- **v0.24.1: Story map** (ready, not yet released), a visual page of your script or play to send to anyone.
- **v0.24.2: Drafter for Claude**, a local MCP server so Claude (or another AI app you use) can read your scripts, drafts, and cuts: storyboards, notes, and insights across a series. Nothing in Drafter itself ever calls an AI.
- **v0.25.0: Classic Mode**, for writers who know Final Draft rather than Fountain. Enter and Tab move between elements the way most screenwriting apps work, and the left side looks like a script, with the marks hidden. It's not Fountain typing, but the file is still plain Fountain underneath. Fountain Mode stays the default, and one switch changes it.
- **v0.26.0: Novel**, a comfortable place to draft a novel in Markdown.

**Later:**

- **Production, free (v0.27.0):** revision colors and marks, locked pages and scene numbers, OMITTED scenes, revised pages, a breakdown report, and sides.
- Storylines, the strip's Color by, and pacing (v0.28.0).
- The **Workbook** (v0.29.0): a story bible and scene cards, with your pasted, synced, and spoken notes.
- An optional one-file `.drafter` project (v0.30.0, open spec).
- Reader notes with no account, and the Reference tab (v0.31.0 and v0.32.0).
- A signed Mac download, **PDF import**, **real-time co-writing** (free, end-to-end encrypted, no account), and testing with NVDA and VoiceOver, last of all.

**Not planned:** accounts, a paid version, or a Drafter server that keeps your scripts. The [full roadmap](docs/ROADMAP.md) has every phase.

## For developers

Drafter is a pnpm monorepo in TypeScript: the Nuxt 4 web app in `apps/web`, the Electron desktop app in `apps/desktop`, and the engine as framework-free `@drafter/*` packages in `packages/`. With Node 22.13 or later and pnpm 10:

```sh
pnpm install
pnpm -r build
pnpm -r test
pnpm dev              # the app, at http://localhost:3000
```

Found a bug or have an idea? **Help → Report a problem…** or **Suggest an idea…** in the app fills in a [GitHub issue](https://github.com/cschweda/drafter/issues/new/choose) for you to submit, or email cschweda@gmail.com; security problems go through [SECURITY.md](SECURITY.md).

[How Drafter works](docs/HOW-IT-WORKS.md) has four diagrams of it. [Developing Drafter](docs/DEVELOPMENT.md) has how it works, the packages, the stack, storage and browsers, every command, the samples, contributing (commits, the changelog, releasing), and the design documents. [Why Drafter](docs/WHY.md) has the idea behind it and its principles, and [`docs/DECISIONS.md`](docs/DECISIONS.md) records the choices along the way.

## Clean-room implementation

Drafter is written from scratch, from public specifications, without reading anyone else's implementation. Nobody working on the code reads the source of other screenwriting apps or Fountain libraries, and none of them is a dependency. Drafter uses ordinary open-source libraries, but no code from any other screenwriting or playwriting application, and no Fountain library. That keeps the MIT license sound, and lets people trust where the engine came from.

A repository-wide audit on 27 October 2026 found no copied code, and [a second on 1 November 2026](docs/clean-room-audit-2026-11-01.md), over everything since, found none either. The rule binds every contributor, AI coding assistants included. [The clean-room rules](docs/DEVELOPMENT.md#clean-room-implementation) are in Developing Drafter, and [Clean-room implementation](docs/clean-room.md) has the whole statement.

[Audits](docs/AUDITS.md) lists every security and clean-room audit, newest first.

---

Made by Christopher Schweda ([cschweda](https://github.com/cschweda)), who also builds [metaincognita](https://metaincognita.com): open-source casino simulators that show the math behind the games.

## Acknowledgments

- [Fountain](https://fountain.io), the plain-text screenplay format created by John August and Stu Maschwitz, with many contributors.
- The [Inform 7](https://ganelson.github.io/inform-website/) IDE, Graham Nelson's environment for interactive fiction, whose two facing panes, plain source on one side and the result on the other, Drafter borrows ([in full](docs/WHY.md#acknowledgments-in-full)).
- [Courier Prime](https://fonts.google.com/specimen/Courier+Prime), the screenplay typeface, and [Inter Tight](https://fonts.google.com/specimen/Inter+Tight), the typeface of the wordmark and interface, both under the SIL Open Font License.

## License

[MIT](LICENSE) © 2026 Christopher Schweda. Courier Prime and Inter Tight are distributed under the SIL Open Font License, each with its license file alongside the fonts. The logo, icons, and share image are in [`brand/`](brand/). See the [Changelog](CHANGELOG.md) for every release.

**Trademark.** Drafter™ and the Drafter logo are trademarks of Christopher Schweda. The MIT License covers the code, so you are free to use, change, and share it; it doesn't grant use of the Drafter name or logo. A changed copy you share needs a name of its own.
