# Red/blue team audit, 23 November 2026

Drafter's second adversarial audit. Five red-team attackers each took one part of Drafter and tried to break it. Each had read the [red/blue audit of 3 November](redblue-audit-2026-11-03.md), the [security audit of 1 November](security-audit-2026-11-01.md), and the [privacy audit of 3 November](privacy-audit-2026-11-03.md), so each looked for what those had missed and checked that their fixes still hold. Each had to prove a weakness by running an attack where it could, say plainly where it could not, and report the attacks that failed. A blue team then:

- checked each finding against the code;
- fixed what was real, with a test that fails without the fix wherever the fix is in code a test can reach;
- left for the maintainer only what is a repository setting, or a choice that is theirs.

A second team then audited the findings and the fixes; its result is [at the end](#the-audit-of-this-audit).

**Date:** 2026-11-23
**Red team:** five AI agents (Claude), working read-only on the code but for throwaway proof-of-concept tests they deleted. No pushes, no publishing, and no requests to anyone but plain reads of drafter.dev's public files and of this repository's public settings.
**Blue team:** an AI agent (Claude), who checked and fixed.
**Code audited:** `staging` at `433eb449` (v0.27.4 and the tip jar) with the work then pending for v0.28.0: the guard tests, the save state in the status bar, the Story Atlas rename, and a count of conversions that was dropped the same day (`audit/red-blue-2026-11-23` at `41944a71`). **The fixes are on a branch from `433eb449`**, not from that audited tree: they were written and tested without the pending work, and meet it when both are merged into `staging`. So this record says "Story Atlas" where the fix branch's own code still says "story map".
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
| **P** Privacy | Every network path, every export's contents, what stays on the device, the claims | 8 (3 medium, 4 low, 1 info) |
| **M, C, K** Drafter for Claude, the command line, Classic Mode | Never audited before: paths, limits, read-only, private text; overwrites; the settings block | 18 (3 medium, 7 low, 8 info) |

## Findings and mitigations

"Fixed" means changed in the code or the documents with this audit. A fix in code has a test that fails without it; a fix in a workflow, a manifest, the lockfile, or a document (S3, S5, S6, S8, S12, P3, P5, P6) has none, and is marked so. Severity is the red team's.

### Medium and high

| ID | Finding | What an attacker gained | Outcome |
|---|---|---|---|
| S1 (high) | Git was pointed at the tracked `.githooks/` folder, so it ran whatever hook the branch being checked out held | Code on the maintainer's machine, beside their tokens, from a pull request merely checked out | **Fixed.** `pnpm install` copies the one hook into Git's own folder and unsets the path, and stops with an error if the path is still set where it can't reach (a global or per-worktree setting). A test tries it in a throwaway repository. **Until this is on every branch**, `pnpm install` on a branch with the old script sets the path again for the whole clone: it happened once during this audit, and was undone |
| S2 (high, conditional; open since 3 November) | No branch or tag protection, no release environment, releases that can be altered, a wide token | With one stolen credential: a release to every desktop user | **For the maintainer** (below) |
| S3 | A release build restored its toolchain cache from `main`'s scope, by prefix; electron-builder trusts a restored folder by file count | A backdoor in installers that the tagged source doesn't show | **Fixed** (no test: a workflow). A tag's build uses no cache, and no build matches a cache by prefix. Not yet run on a tag: the expression that turns the cache off is read from the action's documentation, not seen working |
| P1 | A locked script's file carries the whole text as it stood when the revision began, compressed in the settings block: scenes since cut or omitted, and their notes. So do Export → Fountain and a reopenable HTML or EPUB | Whoever is sent the file can read what the writer deleted | **Said plainly** (the maintainer's choice, 23 November): the Production help page, under Omit scene and under the long line, and the reopenable export's hint say that the file carries scenes since cut, and how to send a script without them. A copy without the revision's history is a later feature |
| P2 | Remove from this browser left the script's file name, its folder's handle, and two more rows | The next person at the browser learns the name and may reopen the folder | **Fixed.** A test fails on any row that names a removed script |
| P3 | Since reports by email (v0.26.2), drafter.dev has one server function and a second outside service; the README's "all of it" table and seven other statements said otherwise | Nothing; the statements were false | **Fixed** in the README, Privacy, Why, What is Drafter?, Help, and Technical details, and, after the audit of this audit, in the issue template, four more statements, and five code comments. The pages now also say that the function counts reports from an internet address for a minute, and that Resend keeps the email |
| W1 | A note of three thousand spaces: the pattern for a person's note tried the run every way it split in three | A 3 KB file held lint for 15 seconds at every pass | **Fixed**, in two passes: the same pattern was still slow on `on “` over and over (80 KB, 20 seconds), because the quoted part took in each new opening quote |
| W2 | The Source pane's Markdown grammar took the square of a run of spaces, and of a paragraph's brackets | 160 KB held the page for 16 seconds, again on reload | **Fixed.** After the second team, a paragraph crowded with HTML openers that never close is plain text too |
| W3 | Lint's rule for a transition with a trailing space scanned with a pattern anchored at the end | A 200 KB line: 14 seconds after each pause in typing | **Fixed.** Walked back from the end |
| W4, M1 | Who shares scenes with whom was counted pair by pair: a scene of 3,000 speakers made nine million entries | A 32 KB file ran Drafter for Claude's reader out of memory and stopped search for the whole folder; 79 KB exhausted 4 GB | **Fixed**, in two passes. A scene with more than 200 present is left out of that count, and the whole script has a budget. The second team then found the names themselves were searched for in time that grew with the square of the script (names that share their first words, that differ only in punctuation, or of thousands of words): names are now found by a tree, word by word, and by at most twelve words. What remains: once the budget is spent, later scenes add nothing, so a script of tens of thousands of scenes reports low counts with no word of it |
| W5 | Final Draft import flattened a note's line breaks with a pattern that started again from every space | A 160 KB file: 10 seconds to open | **Fixed.** Line by line |
| W6 | The Markdown parser took the square of nested brackets, and of headings written with a line under them (in the library itself) | 160 KB: 16 to 24 seconds in the Preview and every export | **Fixed**, in three passes. The first refused two shapes; the parser was still quadratic on a paragraph of `<!A`, `<?`, `<![CDATA[`, or `<!--` that never close (80 KB, 26 seconds). Those are counted, then budgeted by how far each looks (its paragraph's length). What remains, slower than it should be and not refused: a list item, a paragraph, a list item, over and over (5 seconds at 80 KB), and `[a](<b ` (1.5 seconds). A line of only `-` or `=` under a line of text counts as an underlined heading even inside a code block |
| M2 | Finding a scene's act looked through every act | A 600 KB script of many acts could never be loaded by Drafter for Claude | **Fixed**, in two passes. The lookup was found by halving; the second team found the test for it failed on the fixed code, because the next loop had every act look through every scene. The scenes are gathered once, and the test runs at a size where the old code fails clearly |
| M3 | The reader's cache held 20 parsed files of any size | A folder of twelve long scripts could never be searched | **Fixed**, in two passes. At most 4 MB, charged by the text parsed; then room is made before a file is parsed, and a page of a search parses no more than the cache holds, so a page ends and hands back a cursor. What remains: a single script of several megabytes can still run past the ten seconds on a busy machine, and nothing tests that the loader charges a packed file by its text |

### Low

| ID | Finding | Outcome |
|---|---|---|
| S5 | The docs said the pull request checks are required; nothing on GitHub enforces it. They named two Windows installers where there is one | **Fixed** in the docs (the development notes, and after the audit of this audit the Technical details page); enforcing it is S2 |
| S6 | The 23 workspace packages were publishable under `@drafter/*`, a scope on npm that isn't this project's, and the docs named `npx @drafter/cli` | **Fixed** (no test: manifests). All are `private`; five documents that said they are published under `@drafter/*` are corrected |
| S7 | A build made with the test module is checked against its own flag, so the flag left set in a release shell would pass | **Fixed.** Refused with anything that marks a public build, and a packaged desktop app that holds the test module is refused by the package check. A build deployed by hand is not checked by anything |
| S8 | `@nuxt/schema` 4.6.2 (GHSA-mjrq-cffv-q4qc, the dev server) still in the lockfile | **Fixed** (no test: the lockfile). Overridden to 4.6.4 |
| S4 | `pnpm diagrams` runs `npx` on a package outside the lockfile and the release-age wait | **Deferred**, in [DEFERRED](DEFERRED.md) |
| P4 | A Final Draft file with Title page: Full held the title page's lines that never print (Notes, Copyright, a key of the writer's own) | **Fixed.** They go only with Include notes |
| P5 | The notes option named three exports; Final Draft is a fourth that obeys it | **Fixed** in the option's label and the help (wording; the browser tests read the label) |
| P6 | The README said the desktop app's only request is one update check; it also downloads the update | **Fixed.** The Privacy page's wording, and the download is in both lists of everything that uses the network |
| P7, W11 | The report function took a cross-site plain-text post | **Fixed.** JSON only, and only from its own origin |
| W7 | Scene history, Cuts, and draft steps took the square of a run of spaces or dots | **Fixed**, in two passes. Put back, and Cuts and draft steps on a Markdown document, had the same kind of pattern and were missed. The first pass also changed what a scene holding a line or paragraph separator (U+2028, U+2029) hashes to; trailing spaces now come off at every line end the old pattern knew, and a test holds that |
| W8 | Screenplay from outline took the cube of a heading's run of spaces, and the square of a line of brackets | **Fixed**, in two passes: Expand outline, in the same file, read a list item with a pattern that took the square of a run of spaces (80 KB, 27 seconds) |
| W9 | A breakdown took the scenes times every character's appearances: 25 seconds for 0.4 MB | **Fixed.** The test first written for it passed without the fix; it now uses a shape the old code fails on |
| W10 | A tab in text outside a `<Text>` run made the Final Draft and Fade In importers throw | **Fixed** |
| W12 | The report email's subject kept a title's line breaks | **Fixed.** After the second team, every control character goes, U+0085 among them |
| W13, W14 | A download's name kept direction overrides and zero-width characters, could be a name Windows keeps for a device, and could run to 489 bytes | **Fixed**, in two passes. A device's name is known with anything after its first dot (`NUL.tar`), and in its superscript and console spellings; a name of only what draws nothing is Untitled; the drafts-and-cuts zip, and drafts named from a title, go through the same cleaner. The first pass also took the joiners out of real titles (Persian, a family emoji, Scotland's flag) and cut a Chinese title at 66 characters: joiners and a flag's tags stay, and the limit is 240 bytes. Windows was not run: the device names are from Microsoft's naming rules |
| W15 | The breakdown's CSV guarded a formula only at a field's start, and didn't quote a semicolon or a tab | **Fixed**, in two passes. The guard was at the field's start, where a reader that splits on `;` or a tab never looks; it goes before the sign itself. The full-width signs (W19) are guarded too. No spreadsheet was run |
| W16 | The breakdown's PDF ran out of stack at 130,000 rows | **Fixed.** The widths are measured by a function with a test of 200,000 rows; the first pass had none |
| D1 | Seven whole sites, and every page of this repository on GitHub, opened in the browser with no question, whatever the address carried | **Fixed.** Trusted only for an address shaped like Drafter's own links: written exactly, at most 160 characters, no query, nothing encoded, one slash at a time. The report for a new issue is trusted with the fields and the length the app's own report uses, and an email to the maintainer at the length the app writes, with a one-line subject. What remains: about 140 characters of plain text per opened address can still reach one of the seven sites' logs with no question. A test reads every such link from the web app |
| D3 | A module could still be named "Drafter" behind an unseen character, a look-alike letter, or another word | **Fixed**, in three passes: accents and figures are folded, dressed letters (small capitals, circled) and a word across two alphabets are refused, as are a joiner beside a Latin letter and an odd space, and the name may not be or start a word with "Drafter". What remains: a near-miss ("Drafler"), and a name wholly in another alphabet |
| D4 | Two scripts in one folder whose names clean to the same thing share drafts and cuts. So, by design, do a script and a document with one name (`Boca.fountain`, `Boca.md`): a work keeps its drafts when its kind changes | **Accepted.** It takes such files side by side and a compromised page; refusing every name that isn't clean would take drafts beside the file from a script with a colon in its name. The comment that overstated the guarantee is corrected, twice |
| D2 | The 3 November hidden-window fix doesn't pin the window's position (not proven) | **Deferred**, in DEFERRED: it needs a running desktop app |
| D5 | The refusing proxy leaves Chromium's implicit loopback bypass (not proven) | **Deferred**, in DEFERRED: the same |
| M4 | Past a folder link that leads out, a file that isn't there was answered differently from one that is | **Fixed**, in two passes. The first covered only a file that isn't there; with a part added after its name, an existing file outside still answered differently. Now every failure past a link out says outside, and so does a link that leads nowhere. Timing was not measured |
| M5 | "A whole drive is refused" held only for `/` | **Fixed**, and then narrowed. The folders that hold every user's files or every drive are refused by name, the data volume and its `Users` among them (the first fix missed those, and its comment said otherwise). The first fix also refused any mounted folder, which took a share or a drive kept for scripts away for no gain, since the folder above it reads straight through. A mounted drive or share is now taken, and the server says so when it starts: `/Volumes/Work` is read, with a warning |
| C1 | `drafter build` wrote over its input when the output named it in another case | **Fixed.** The two files are compared, not their names |
| C2 | `drafter convert --out` wrote through a folder link planted in the output folder | **Fixed**, in two passes: the first refused the file but had already made its folders outside. The check now comes before any folder is made. A link swapped in between the check and the write is not closed |
| C3 | `--story-atlas` had no bound | **Fixed** with M1 and M2, once those were finished; it has no test of its own |
| K1 | A comment opened above the settings block ended its protection in Classic Mode | **Fixed**, in two passes. The block at the foot of the file is protected by its text, found as the parser finds it; the first pass knew only the layout Drafter writes, and the parser reads others |
| K2 | With the block straight under a line, moving that line down left a stray opening line above it | **Fixed.** Such a move is refused. By the event's name, not by its cause: a change of that shape sent as a paste or a drop would still do it, and no command builds one |

### Informational

Fixed: C4 (two outputs to one file are refused: by where the file really is, after the second team found one file under two names was still written twice; a template given as a file is never written over), C5 (direction marks, overrides, line separators, the zero-width space, and the tag characters are shown as other control characters are), S12 (a branch trigger for a branch that no longer exists), W17 (the tip jar's address must be written exactly), W20 (a note category named for an `Object` property).

Fixed after the audit of this audit: S10 (the note in DEFERRED on dismissed advisories now says the `deepmerge` one was withdrawn), W19 (the full-width formula signs are guarded as the plain ones are), and W20 now has a test.

Recorded and left: S9 (`drafter-mcp@0.0.0-stage` is not deprecated, and no provenance is published: for the maintainer), S11 (the Buy Me a Coffee address in `FUNDING.yml` is the maintainer's, kept out of the app by their choice), P8 (small inconsistencies), W18 (the report's rate limit falls back to a header only where Netlify gives no address), D6 (a module's network consent is the page's word), M6 (a folder whose name starts with a dot lists and then refuses), M7 (a prototype lookup in the SDK), M8 (a forged cuts file's heading), C6 (`--template` echoes a file's first bytes in its error), K3 (a constant cost on very long lines), K4 (what the `classic` trap entry point doesn't press).

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
3. **npm** (S9, S6): deprecate `drafter-mcp@0.0.0-stage`; consider provenance; choose the command line's published name.

## Changed with this audit

The fixes are on `fix/redblue-2026-11-23`. Tests added in the first pass: 39, in the web app, the desktop app, and twelve packages. Each fix in code has one that fails without it; the fixes in workflows, manifests, the lockfile, and documents have none. Three of the limits were tightened again after an automated review of the commits: the cast's pair count got a budget for the whole script as well as each scene, the cache is charged by the text parsed and not by a file's size on disk, and an underlined heading is counted inside a block quote.

Not run with this audit:

- the desktop app itself (D2 and D5 are deferred for that reason);
- a browser on the red team's timings, which were measured in Node on the functions the page calls;
- a release build from a tag, so the change that turns its caches off (S3) has never executed;
- the report function on Netlify, whose new checks are tested against the handler alone;
- the fixes together with the pending work the red team read (above).

The browser tests for the parts of the app the fixes touch were run in all five browsers.

## The audit of this audit

Three fresh reviewers, who had not seen the fixes being written, each took a share of them: the supply chain, the desktop app, and privacy; Drafter for Claude, the command line, and Classic Mode; the web app and its formats. Each was asked four things of every fix: is it there, does its test fail without it, is there a way round it, and did it change anything it shouldn't have. They reverted fixes to watch tests fail, and wrote inputs of their own.

**What they found.** Of the fixes they checked, 24 were incomplete or had a way round, and three more had a test that proved nothing. None was wrong in what it did. The pattern was the same in most: the fix closed the input the red team had sent and left its neighbour open.

| Share | Held as claimed | Sent back |
|---|---|---|
| Supply chain, desktop, privacy | S3, S8, S12, D4's acceptance, P2, P4, P5, P7 | S1 (a global or per-worktree hooks path was left set, with no word and no test), S5 and S6 (the docs still said otherwise in five places), S7 (the desktop's package was not checked), S10, D1 (the report's link and an email were trusted at any length), D3 (many disguises passed, and plain names were refused), D4's comment, P3 (untrue lines left in eleven places) |
| Drafter for Claude, command line, Classic | C1, C5, K2, and the first attack of M1, M3, and M4 | M1 (the name search was still quadratic), M2 (its test failed on the fixed code), M3 (a search page could not finish), M4 (the same question, answered by adding `/x`), M5 (the data volume was accepted, and any mounted folder refused), C2 (folders were made outside first), C4 (one file under two names), K1 (only Drafter's own layout was protected) |
| Web app and formats | W3, W4, W5, W10, W11, W12, W17, P2, P4 | W1, W6, W7, W8 (each had a neighbouring pattern still slow), W13 and W14 (names still let through, and real titles mangled), W15 (the guard in the wrong place); W9, W16, and W20 had no test that proved them |

**What was done.** Every one sent back is fixed, each with a test that was seen to fail first, and the rows above say which fixes took more than one pass. The automated review of each commit found five further gaps in those second fixes (a joiner splitting a module's name, names that start with "Drafter", two more slow paths in the name tree, and a count where a budget was needed), and those are fixed too.

**What the second fixes changed on purpose.** A mounted drive or share is accepted by Drafter for Claude with a warning, where the first fix refused it. A page of a folder search parses 4 MB, not 20, so a long search comes back in more pages. A download's name may be 240 bytes, not 200.

**What is still open, and known.** Each row above says what its fix leaves. Together: about 140 characters of plain text per opened address can reach a trusted site's log from the desktop app with no question; a near-miss of "Drafter" (Drafler) is a module's to use; two Markdown shapes are slow and not refused; once the pair budget is spent a huge script's shared-scene counts are low; a link swapped in between the command line's check and its write is not closed; D2, D5, and S4 are deferred; S2 waits for settings only the maintainer can make.

**What the reviewers could not check.** Windows and any spreadsheet (the device names and the CSV guard rest on documented behaviour); a browser on the timings; the desktop app running; a release build from a tag; Netlify's and Resend's own behaviour; an idle machine, since all three shared one with each other and with the test runs.
