# Red/blue team audit, 3 November 2026

Drafter's first adversarial audit. Four red-team attackers each took one part of Drafter and tried to break it. Each had read the [security audit of 1 November](security-audit-2026-11-01.md) and the [privacy audit of 3 November](privacy-audit-2026-11-03.md), so each looked for what those had missed. Each had to prove a weakness by running an attack where it could, and to report the attacks that failed and why. The blue team then:

- checked each finding itself, against the code and with its own test
- fixed what was real, with a test that fails without the fix
- left for the maintainer only what is a repository setting, or a choice that is theirs

**Date:** 2026-11-03
**Red team:** four AI agents (Claude), working read-only on the code. Each worked from its own scratch folder: no edits, no pushes, no publishing, and no attacks on drafter.dev beyond reading its public files.
**Blue team:** an AI agent (Claude), who checked and fixed.
**Code audited:** `main` at `d4598bfa` (v0.25.0 and the v0.25.1 work: technical details for reports, and the privacy section).
**Overall result:** **PASS WITH FINDINGS.**
- **No attack ran code from a script, a file, or an export.** None got past the security policy, and none reached the network from a page.
- **Real findings:** 2 High, 5 Medium, and some Low and Info.
  - Every High and Medium that is code is fixed and tested.
  - One High is a repository setting, and only the maintainer can change it (S1).

## The four areas

| Red team | Covered |
|---|---|
| **Web** | The web app, and every format it reads or writes: script injection into the page, exports used against their readers, security-policy bypasses, denial of service, prototype pollution, the service worker |
| **Desktop** | The Electron app: page-to-main privilege, the `app://` handler, navigation and new windows, the preload bridge, folder modules, updates, hardening flags and fuses |
| **Supply chain** | GitHub Actions, release integrity, dependencies, the npm package `drafter-mcp` and its runtime, the command line, Docker and Caddy, secrets in the history |
| **Privacy** | Every way a script, its title, notes, or file names could leave the device or be read by someone else, beyond what the privacy audit tested |

## Findings and mitigations

Status: **Fixed** (in code, with a test), **Mitigated** (the risk is cut and the rest is written down), **Maintainer** (a setting or a choice only the maintainer can make), **Deferred** (in [`DEFERRED.md`](DEFERRED.md)).

| ID | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| P1 | **High** | A Final Draft (.fdx) export always carried the writer's notes, scene notes (goal, setups and payoffs), and synopses as text Final Draft prints, even with **Include notes** at Leave out. The help said a Final Draft file "never prints them". | `toFdx` takes the notes option, and the app passes the writer's choice: Leave out (the default) writes no note, note block, scene note, or synopsis anywhere. With Include, notes are `[[…]]` in the text, and the help and the dialog say so. Tested by a fixed case, a property test, and a browser test that exports the sample (it has ten notes). | Fixed |
| D1 | **High** (needs another flaw first) | If a page in the desktop app were ever made to run code, it could hand the browser an address holding the script (`window.open` or `location.href` to any https site), past the network block, the security policy, and the WebRTC block, with no click. Proved with a stand-in compromised page. | A page's request to open an outside address goes at once only for Drafter's own links (its help, About, and Report a problem). Anything else shows a box from the app itself, naming the site, which no page can answer. Tested by a unit test of which addresses are trusted, and a desktop test of the attack. | Fixed |
| S1 | **High** (conditional) | One stolen credential could put a release in front of every desktop user. `main` and the `v*` tags have no protection, there is no release environment, the local `gh` token has `workflow` scope, and updates are unsigned (F8). A malicious dependency running in the local gates could read the token and push a tag. | Partly fixed in the repository: Dependabot's `cooldown` (7 days) and pnpm's `minimumReleaseAge` (7 days), so a package published with malware and pulled within days never arrives. The rest is GitHub settings for the maintainer: a tag ruleset on `refs/tags/v*`, a ruleset on `main` requiring the `e2e` check, a `release` environment with the maintainer as reviewer, a `gh` token without `workflow` scope, and dropping the stored npm token. | Maintainer |
| W1 | Medium | A Markdown file of about 160 KB of `*_` froze the editor's tab for over 14 seconds, and again on every reload, since Drafter reopens the last document. | In a paragraph with more than 4,000 `*` or `_`, the Source pane's grammar reads them as plain text. That paragraph stays linear, and every other paragraph is highlighted as before. A test parses the attack in under 2 seconds; without the fix it took 25.9. | Fixed |
| W2 | Medium | The same file stalled the Preview, and every later export, which queue behind one another, until a reload (micromark took over a minute). | `parseMarkdown` refuses a paragraph with more than 4,000 `*` or `_`, or 4,000 `]` with no `[`, before parsing, as it already refused a document nested too deeply. The Preview says why, and exports say so too. A new trap, `md-emphasis-quadratic`, holds it. A deadline on each export job is deferred. | Fixed |
| P2 | Medium | The script's title is the tab's title, so the browser keeps it in its history and can sync open tabs to Google, Microsoft, Apple, or Mozilla, after Remove from this browser too. | A setting, **Hide the script's title in the tab**: the tab and the window say only "Drafter". The Privacy help page says what the browser keeps on its own. | Mitigated |
| P3 | Medium | The Story map's logline, greeting, explanation, and contact, and the synopsis fields in the Outline and on cards, went into the browser's form history. That outlasts Remove from this browser and can sync. | `autocomplete="off"` on each, and a test that scans every component and fails on any text field without it. | Fixed |
| P4 | Medium | On drafter.dev, Plausible's script runs in the editor's page. If plausible.io or the script were compromised, it could read the page and post it to plausible.io, which the security policy allowed whole. | The policy now names only Plausible's one script file and its one event address. A real browser check showed a send to any other plausible.io address refused. The help says plainly that Drafter can't check Plausible's own code, and that the desktop app has none. Serving a reviewed copy from drafter.dev would close the rest; the maintainer kept Plausible on every page. | Mitigated |
| S2 | Medium | `drafter build` followed a link planted where its PDF goes (`script.pdf -> ../elsewhere`), and overwrote the file outside the folder. Proved. | The output is written beside the target and then renamed over it, so a link is replaced, never written through. Tested: it fails before the fix and passes after. | Fixed |
| D2 | Low–Medium | A page could open an app window that was hidden, see-through, and unfocusable, with the app's full bridge. | A new app window always gets the app's own chrome: shown, solid, focusable, and centred. Tested. | Fixed |
| S3 | Low | One 3 MB file of one-line scenes ran Drafter for Claude's reader out of memory, and `list_scripts` failed for the whole folder on every call. | A file with more than 300,000 paragraphs is refused on its own, in Open's words, and the folder lists. A 2 MB file of 360,000 still lists. Tested. | Fixed |
| S4 | Low | The pull-request checks weren't enforced by GitHub, and two comments said otherwise. | The comments are corrected. The ruleset is the maintainer's (S1). | Maintainer |
| S5 | Low | In the self-hosted Docker image, a 404 under `/_nuxt/` was cached as immutable for a year. | The error handler sends `Cache-Control: no-cache`. | Fixed |
| W3 | Low | A script naming its template `constructor` or `__proto__` broke Cuts, which then silently kept nothing, along with Scene history and Compare. | The template lookup takes only a built-in's own name. Tested. | Fixed |
| W4 | Low | The spellcheck's word splitter took time in a hyphen chain's length squared (`a-a-a-…`), pinning a core. | Each run's compound is worked out once and shared. Tested as linear. | Fixed |
| P5 | Low | Every cut is kept, including text pasted by mistake and deleted, and there's no way to delete a cut. In a shared Dropbox, Drive, or OneDrive folder, others can read it. | The help warns about shared folders. A Delete this cut action is deferred. | Mitigated |
| P6 | Low | One EPUB identifier linked every copy of a script, so a blind contest copy could be tied to the named one, or to a guessed author. | An EPUB with no title page gets a new random identifier. Tested. | Fixed |
| P7 | Low | The command line's help said the Story map leaves notes out; it shows synopses and setups and payoffs. | The help says exactly what it shows. | Fixed |
| D3 | Low | The desktop app has no `will-download` handler, so a page can start a download with a name it chose (a Save box still asks). | Deferred: a handler that refuses downloads from pages, once it's clear no feature uses one. | Deferred |
| W5 | Info | A Story map contact could carry another address (`me@x.co,spy@evil.co`, or encoded). | `,`, `;`, and `%` are refused in a contact. Tested. | Fixed |
| W6 | Info | A scene's color note naming `constructor` read the object's prototype (harmless: invalid CSS). | The lookup takes only Drafter's own colors. | Fixed |
| S6 | Info | `publish.sh` accepted any desktop run on a branch named like the tag. | It takes only a push of the tag, at the tag's own commit. Checked against v0.25.0's real run. | Fixed |
| S7 | Info | `.gitignore` didn't cover signing keys and credentials. | `*.p12`, `*.pfx`, `*.pem`, `*.key`, `.npmrc`, and `electron-builder.env` are ignored. | Fixed |
| S8 | Info | A hardlink in a named folder reads its target (it needs someone who can already write as the user). No npm provenance. A stray `drafter-mcp@0.0.0-stage` on npm. `packageManager` has no hash. | Recorded. The npm stub is the maintainer's to deprecate. | Deferred |
| D4 | Info | The module consent fingerprint is 64 bits. A collision needs both files beforehand, which gains nothing, and the served files are pinned by full SHA-256. | Recorded; the defence holds. | Deferred |
| P8 | Info | The desktop app keeps up to 1,000 opened paths. Technical details in a report are public on GitHub. Plausible's time on a page is, in practice, a session's length. | Disclosed in the help; the paths list is deferred. | Deferred |

## Attacks that failed, and the defence that held

**Web**
- **No HTML from a writer:** writer text reaches the page only as text nodes and `textContent`. No `v-html` takes the writer's words: the palette, Classic Mode's lists, the Markdown Preview, What's new, Report.
- **Exports are inert:** a `default-src 'none'` policy, element names from code only, `on*`, `style`, and `srcdoc` refused, and `safeHref` on every address.
- **No CSS injection:** only numbers and checked `#rrggbb` colours reach generated CSS.
- **Zip bombs:** the inflated size is checked before inflating.
- **Reopen:** linear, with caps before decoding.
- **Fountain:** 50 hostile patterns are linear through parse, lint, outline, notes, and layout.
- **Framing:** `frame-ancestors 'none'`.
- **Messages from frames:** `postMessage` checks the sending frame and its origin.

**Desktop**
- **Module frames stay sealed:** no Worker, parent, storage, or other module's files are reachable from a module's frame, and it can't navigate out.
- **Writes need a script:** a write goes only to a granted file with a script's or an export's extension.
- **`app://`:** refuses every traversal and device name, before and after decoding.
- **Email links:** a `mailto:` can't add recipients.
- **Other ways out:** `smb:`, `file:`, and custom schemes never reach the system.
- **Permissions:** denied by default.
- **Updates:** no downgrade, and every download is checked by SHA-512.
- **Hardening:** the fuses (`runAsNode`, `NODE_OPTIONS`, inspect) are off, ASAR integrity is on, and every window is sandboxed and isolated.

**Supply chain**
- **Workflows:** no `${{ github.event }}` value in a `run:` step, and no `pull_request_target`.
- **Pins:** every action is pinned to a SHA that matches its upstream tag.
- **Caches and artifacts:** a PR's cache is scoped to its ref, and `publish` uses only its own run's artifacts.
- **Checkouts:** `persist-credentials: false` on every checkout.
- **The bundle:** `drafter-mcp.js` has no network, process, or write calls.
- **MCP paths:** `..`, absolute paths, links out of the folder, loops, pipes, and long or control-character paths are all refused. Reads are pinned by device and inode.
- **MCP cursors:** HMAC-signed, so they can't be forged.
- **Command line:** terminal escapes are made visible, and `convert` writes a temp file and links it into place.
- **Docker:** unprivileged, read-only, with no capabilities, on localhost only, with its images pinned by digest.
- **Secrets:** none found in 1,018 commits.
- **`publish.sh`:** byte for byte with the Release's file, with `--ignore-scripts`.

**Privacy**
- **What exports carry:** PDF metadata is only the title, creator, and producer. HTML and Story map exports fetch nothing. Notes stay out of PDF, plain text, and Markdown when left out.
- **Analytics:** Plausible's page address can't carry script data, since there are no dynamic routes or history changes. Scroll depth leaks nothing, as the page height is fixed.
- **Headers:** live drafter.dev sends `Referrer-Policy: no-referrer` and COOP.
- **Storage:** separate for each origin. The unsaved-text stash is cleared after it's written. Remove from this browser clears every store.
- **The desktop app:** writes no logs in a packaged build, has no crash reporter, and bundles its dictionaries.

## Left for the maintainer

These are GitHub and npm settings that only the maintainer can change. Each is one step:

1. **A tag ruleset** on `refs/tags/v*`: restrict creating, updating, and deleting tags to the maintainer, and block changes to workflow files in a tagged commit.
2. **A ruleset on `main`:** require the `e2e` check, and block force pushes and deletion.
3. **A `release` environment,** with the maintainer as required reviewer, used by `desktop.yml`'s `publish` job.
4. **A fine-grained `gh` token** without the `workflow` scope for everyday work.
5. **Remove the stored npm token** (`~/.npmrc`'s `_authToken`). `publish.sh` uses npm's browser approval and doesn't need it.
6. **Deprecate `drafter-mcp@0.0.0-stage`** on npm.

## Changed with this audit

All on the `redblue-audit` branch, with a `CHANGELOG.md` entry for each:
- **Final Draft:** `packages/fdx/src/export.ts` and `apps/web/app/workers/export-compute.ts` (P1); EPUB identifier (P6).
- **Desktop:** `apps/desktop/src/window.ts` and `protocol.ts` (D1, D2).
- **Markdown:** `packages/markdown/src/marks.ts` and `parse.ts`, and `apps/web/app/markdown/editor.ts`, `preview.ts`, and `use-markdown.ts` (W1, W2), with the trap `md-emphasis-quadratic`.
- **Command line:** `packages/cli/src/cli.ts` (S2, P7).
- **Drafter for Claude:** `packages/mcp/src/inside.ts` (S3).
- **Docker:** `apps/web/scripts/caddyfile.mjs` (S5).
- **Lookups and the contact link:** `packages/history/src/print.ts` (W3), `apps/web/app/outline/labels.ts` (W6), `packages/story-map/src/mailto.ts` (W5).
- **Spellcheck:** `packages/spell/src/tokens.ts` (W4).
- **Settings and fields:** the Hide the title setting (P2), and `autocomplete="off"` with its test (P3).
- **Security policy:** `apps/web/scripts/csp.mjs` (P4).
- **Repository files:** Dependabot and pnpm cooldowns (S1), `publish.sh` (S6), `.gitignore` (S7).
- **The help:** Privacy, Drafts and Cuts, and Saving.
