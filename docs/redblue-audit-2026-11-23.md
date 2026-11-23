# Red/blue team audit, 23 November 2026

Drafter's second adversarial audit. Five red-team attackers each took one part of Drafter and tried to break it. Each had read the [red/blue audit of 3 November](redblue-audit-2026-11-03.md), the [security audit of 1 November](security-audit-2026-11-01.md), and the [privacy audit of 3 November](privacy-audit-2026-11-03.md), so each looked for what those had missed and checked that their fixes still hold. Each had to prove a weakness by running an attack where it could, say plainly where it could not, and report the attacks that failed. A blue team then:

- checked each finding against the code;
- fixed what was real, with a test that fails without the fix;
- left for the maintainer only what is a repository setting, or a choice that is theirs.

A second team then audited the findings and the fixes; its result is [at the end](#the-audit-of-this-audit).

**Date:** 2026-11-23
**Red team:** five AI agents (Claude), working read-only on the code but for throwaway proof-of-concept tests they deleted. No pushes, no publishing, and no requests to anyone but plain reads of drafter.dev's public files and of this repository's public settings.
**Blue team:** an AI agent (Claude), who checked and fixed.
**Code audited:** `staging` at `433eb449` (v0.27.4 and the tip jar) with the work then pending for v0.28.0: the guard tests, the save state in the status bar, and the Story Atlas rename (`audit/red-blue-2026-11-23` at `41944a71`).
**Overall result:** **PASS WITH FINDINGS.**

- **No attack ran code from a script, a file, or an export**, made file content into markup, got past the security policy, or reached the network from a page.
- **No path sends a script's text, its title, or a file's name anywhere without the writer acting.**
- **No file outside the folders a writer chose was read**, by the desktop app or by Drafter for Claude, and no private text (notes, the boneyard, the settings block, contact details) leaked from Drafter for Claude.
- **What broke was mostly denial of service:** nine small hostile files that froze the editor, a tool, or an export, each by a pattern or a loop that took the square or the cube of its input.
- **One finding reached the maintainer's own machine:** a pull request could run code at checkout, through the tracked hooks folder.
- **Several privacy statements had become untrue** when reports by email were added in v0.26.2.

## The five areas

| Area | Attacker's brief | Findings |
|---|---|---|
| **W** The web app and its formats | Every way a hostile file gets in or out; the app's own pages, storage, and file names | 20 (6 medium, 10 low, 4 info) |
| **D** The desktop app | The custom protocol, trusted addresses, every channel from the page, modules, updates | 6 (5 low, 1 info) |
| **S** The supply chain and release | Workflows, caches, dependencies, the published package, hooks | 12 (2 high, 1 medium, 5 low, 4 info) |
| **P** Privacy | Every network path, every export's contents, what stays on the device, the claims | 8 (3 medium, 3 low, 2 info) |
| **M, C, K** Drafter for Claude, the command line, Classic Mode | Never audited before: paths, limits, read-only, private text; overwrites; the settings block | 18 (3 medium, 7 low, 8 info) |

## Findings and mitigations

"Fixed" means changed in the code or the documents with this audit, with a test where the finding is in code. Severity is the red team's.

### Medium and high

| ID | Finding | What an attacker gained | Outcome |
|---|---|---|---|
| S1 (high) | Git was pointed at the tracked `.githooks/` folder, so it ran whatever hook the branch being checked out held | Code on the maintainer's machine, beside their tokens, from a pull request merely checked out | **Fixed.** `pnpm install` copies the one hook into Git's own folder and unsets the path. Proven both ways in a throwaway repository |
| S2 (high, conditional; open since 3 November) | No branch or tag protection, no release environment, releases that can be altered, a wide token | With one stolen credential: a release to every desktop user | **For the maintainer** (below) |
| S3 | A release build restored its toolchain cache from `main`'s scope, by prefix; electron-builder trusts a restored folder by file count | A backdoor in installers that the tagged source doesn't show | **Fixed.** A tag's build uses no cache, and no build matches a cache by prefix |
| P1 | A locked script's file carries the whole text as it stood when the revision began, compressed in the settings block: scenes since cut or omitted, and their notes. So do Export → Fountain and a reopenable HTML or EPUB | Whoever is sent the file can read what the writer deleted | **For the maintainer** (below): a choice between saying so and stripping it from copies |
| P2 | Remove from this browser left the script's file name, its folder's handle, and two more rows | The next person at the browser learns the name and may reopen the folder | **Fixed.** A test fails on any row that names a removed script |
| P3 | Since reports by email (v0.26.2), drafter.dev has one server function and a second outside service; the README's "all of it" table and seven other statements said otherwise | Nothing; the statements were false | **Fixed** in the README, Privacy, Why, What is Drafter?, Help, and Technical details |
| W1 | A note of three thousand spaces: the pattern for a person's note tried the run every way it split in three | A 3 KB file held lint for 15 seconds at every pass | **Fixed.** The name in that pattern can't start or end on a space |
| W2 | The Source pane's Markdown grammar took the square of a run of spaces, and of a paragraph's brackets | 160 KB held the page for 16 seconds, again on reload | **Fixed.** Such a paragraph's spaces and brackets are plain text |
| W3 | Lint's rule for a transition with a trailing space scanned with a pattern anchored at the end | A 200 KB line: 14 seconds after each pause in typing | **Fixed.** Walked back from the end |
| W4, M1 | Who shares scenes with whom was counted pair by pair: a scene of 3,000 speakers made nine million entries | A 32 KB file ran Drafter for Claude's reader out of memory and stopped search for the whole folder; 79 KB exhausted 4 GB | **Fixed.** A scene with more than 200 present is left out of that count, and the whole script has a budget |
| W5 | Final Draft import flattened a note's line breaks with a pattern that started again from every space | A 160 KB file: 10 seconds to open | **Fixed.** Line by line |
| W6 | The Markdown parser took the square of nested brackets, and of headings written with a line under them (in the library itself) | 160 KB: 16 to 24 seconds in the Preview and every export | **Fixed.** Past limits no real document reaches (4,000 closes of a bracket nested more than 32 deep; 2,000 underlined headings, in a block quote too), the document is refused as too densely marked, as `*_` already was |
| M2 | Finding a scene's act looked through every act | A 600 KB script of many acts could never be loaded by Drafter for Claude | **Fixed.** Found by halving |
| M3 | The reader's cache held 20 parsed files of any size | A folder of twelve long scripts could never be searched | **Fixed.** At most 4 MB, charged by the text parsed |

### Low

| ID | Finding | Outcome |
|---|---|---|
| S5 | The docs said the pull request checks are required; nothing on GitHub enforces it. They named two Windows installers where there is one | **Fixed** in the docs; enforcing it is S2 |
| S6 | The 23 workspace packages were publishable under `@drafter/*`, a scope on npm that isn't this project's, and the docs named `npx @drafter/cli` | **Fixed.** All are `private`; the docs say the name is still to be chosen |
| S7 | A build made with the test module is checked against its own flag, so the flag left set in a release shell would pass | **Fixed.** Refused with anything that marks a public build |
| S8 | `@nuxt/schema` 4.6.2 (GHSA-mjrq-cffv-q4qc, the dev server) still in the lockfile | **Fixed.** Overridden to 4.6.4 |
| S4 | `pnpm diagrams` runs `npx` on a package outside the lockfile and the release-age wait | **Deferred**, in [DEFERRED](DEFERRED.md) |
| P4 | A Final Draft file with Title page: Full held the title page's lines that never print (Notes, Copyright, a key of the writer's own) | **Fixed.** They go only with Include notes |
| P5 | The notes option named three exports; Final Draft is a fourth that obeys it | **Fixed** in the option's label and the help |
| P6 | The README said the desktop app's only request is one update check; it also downloads the update | **Fixed.** The Privacy page's wording |
| P7, W11 | The report function took a cross-site plain-text post | **Fixed.** JSON only, and only from its own origin |
| W7 | Scene history, Cuts, and draft steps took the square of a run of spaces or dots | **Fixed.** Tests hold the new trimming to exactly what the patterns gave |
| W8 | Screenplay from outline took the cube of a heading's run of spaces, and the square of a line of brackets | **Fixed** |
| W9 | A breakdown took the scenes times every character's appearances: 25 seconds for 0.4 MB | **Fixed** |
| W10 | A tab in text outside a `<Text>` run made the Final Draft and Fade In importers throw | **Fixed** |
| W12 | The report email's subject kept a title's line breaks | **Fixed** |
| W13, W14 | A download's name kept direction overrides and zero-width characters, could be a name Windows keeps for a device, and could run to 489 bytes | **Fixed.** `cleanWorkName`, which names drafts beside a file after the writer's own file, is unchanged (it is mirrored in the desktop app, and the name is the writer's) |
| W15 | The breakdown's CSV guarded a formula only at a field's start, and didn't quote a semicolon or a tab | **Fixed** |
| W16 | The breakdown's PDF ran out of stack at 130,000 rows | **Fixed** |
| D1 | Seven whole sites, and every page of this repository on GitHub, opened in the browser with no question, whatever the address carried | **Fixed.** Trusted only for an address shaped like Drafter's own links: short, no query, nothing encoded. A test reads every such link from the web app |
| D3 | A module could still be named "Drafter" behind an unseen character, a look-alike letter, or another word | **Fixed** |
| D4 | Two scripts in one folder whose names clean to the same thing share drafts and cuts | **Accepted.** It takes such a pair and a compromised page; refusing every name that isn't clean would take drafts beside the file from a script with a colon in its name. The comment that overstated the guarantee is corrected |
| D2 | The 3 November hidden-window fix doesn't pin the window's position (not proven) | **Deferred**, in DEFERRED: it needs a running desktop app |
| D5 | The refusing proxy leaves Chromium's implicit loopback bypass (not proven) | **Deferred**, in DEFERRED: the same |
| M4 | Past a folder link that leads out, a file that isn't there was answered differently from one that is | **Fixed** |
| M5 | "A whole drive is refused" held only for `/` | **Fixed.** A mounted volume and the folders of every user are refused |
| C1 | `drafter build` wrote over its input when the output named it in another case | **Fixed.** The two files are compared, not their names |
| C2 | `drafter convert --out` wrote through a folder link planted in the output folder | **Fixed** |
| C3 | `--story-atlas` had no bound | **Fixed** with M1 and M2 |
| K1 | A comment opened above the settings block ended its protection in Classic Mode | **Fixed.** A well-formed block at the foot of the file is protected by its text |
| K2 | With the block straight under a line, moving that line down left a stray opening line above it | **Fixed.** Such a move is refused |

### Informational

Fixed: C4 (two outputs to one file are refused), C5 (direction overrides and line separators are shown as other control characters are), S12 (a branch trigger for a branch that no longer exists), W17 (the tip jar's address must be written exactly), W20 (a note category named for an `Object` property).

Recorded and left: S9 (`drafter-mcp@0.0.0-stage` is not deprecated, and no provenance is published: for the maintainer), S10 (a dismissal note for an alert since withdrawn), S11 (the Buy Me a Coffee address in `FUNDING.yml` is the maintainer's, kept out of the app by their choice), P8 (small inconsistencies), W18 (the report's rate limit falls back to a header only where Netlify gives no address), W19 (full-width formula characters), D6 (a module's network consent is the page's word), M6 (a folder whose name starts with a dot lists and then refuses), M7 (a prototype lookup in the SDK), M8 (a forged cuts file's heading), C6 (`--template` echoes a file's first bytes in its error), K3 (a constant cost on very long lines), K4 (what the `classic` trap entry point doesn't press).

## Attacks that failed, and the defence that held

The red team's reports list these in full; the main ones:

- **File content as markup or code.** 21 hostile strings in every element, through the HTML, EPUB, Story Atlas, Word, and Final Draft exports: all escaped, every XML reparsed, no field code, no external relationship.
- **A planted settings block.** 2,080 Final Draft documents and 8,000 random Final Draft and Fade In documents: none planted one.
- **Trusted addresses.** 30 variants of the tip jar's address and 25 path tricks on the app's own protocol: none counted.
- **Files not chosen.** Every file call with no grant, a drop claimed by another page, a granted script swapped for a link: refused.
- **Drafter for Claude's paths.** `..`, absolute paths, links out, link loops, hidden files, devices, forged cursors, patterns as search words: all held. 44 canaries in notes, the boneyard, and contact lines across 110 calls: none returned.
- **Fork pull requests.** No secret, no write token, no script injection, no cache a release reads; every action pinned to a commit that still matches its tag.
- **The network.** The tip jar's link sends nothing and is not counted; Plausible's 3 November fix holds; no route or query ever carries script data.

## Left for the maintainer

1. **GitHub's settings** (S2, open since 3 November). A ruleset on `main` and on `v*` tags, an environment with a reviewer for the publish job, **immutable releases** (which closes both a swapped asset and a moved tag), `sha_pinning_required`, and a token without `workflow` scope for daily use.
2. **Netlify's environment.** Confirm that `RESEND_API_KEY`, `REPORT_TO`, and `REPORT_FROM` are marked secret and limited to production, so a pull request's preview build can't read them. The red team could not see these settings.
3. **A locked script's stored text** (P1). Say plainly, where a script is locked and where it is exported, that the file carries scenes since cut; or strip it from exported copies, which loses that copy's revision marks.
4. **npm** (S9, S6): deprecate `drafter-mcp@0.0.0-stage`; consider provenance; choose the command line's published name.

## Changed with this audit

The fixes are on `fix/redblue-2026-11-23`. Tests added: 39, in the web app, the desktop app, and twelve packages; each code fix has one that fails without it. Three of the limits were tightened again after an automated review of the commits: the cast's pair count got a budget for the whole script as well as each scene, the cache is charged by the text parsed and not by a file's size on disk, and an underlined heading is counted inside a block quote.

Not run with this audit: the desktop app itself (D2 and D5 are deferred for that reason), and a browser on the red team's timings, which were measured in Node on the functions the page calls.

## The audit of this audit

To be written by the second team.
