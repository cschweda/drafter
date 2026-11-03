# Privacy audit, 3 November 2026

Drafter's first privacy audit. Writers worry about a script getting out before it's ready, so this audit asks one question of every part of Drafter: **can anything about a script leave the writer's device, or be kept anywhere but on it, without the writer sending it?** It also checks that Drafter uses no AI. It covers the web app at drafter.dev, the desktop app, the packages and the command line, Drafter for Claude, the build and its analytics, and what the README and the help say about privacy.

**Date:** 2026-11-03
**Auditors:** two AI agents (Claude). One read the code, read-only, without seeing the other's work. The other ran the live tests and fixed what was found.
**Overall result:** **PASS WITH FINDINGS, all fixed the same day.**
- No server stores anything about a script, at drafter.dev or anywhere else.
- There is no AI anywhere in Drafter.
- In a full writing session on live drafter.dev, in Chromium, Firefox, and WebKit, no request carried the script.
- One real leak was found (finding 1, High). On drafter.dev, a report's text reached the site's analytics when the writer opened the report on GitHub. It was shown with Plausible's own script, fixed in code, tested, and live on drafter.dev within the hour.
- The other findings were wording that promised a little more than was true, and one browser feature outside Drafter's control. Both were fixed.

## What was audited

| Ref | Commit | Notes |
|---|---|---|
| `main` | `ee4de47a` (v0.25.0 + 3) | What drafter.dev served when the audit began, and the code the code review read |
| `main` | `d68b7ce7` | The fix for finding 1, deployed to drafter.dev on 2026-11-03 |
| `tech-details` | after `d68b7ce7` | The other fixes, with Technical details for reports (v0.25.1) |
| drafter.dev | live, 2026-11-03 | The writing session below, and the Plausible script it loads |

Tools: Node 22.22.2, pnpm 10.33.4, Playwright's Chromium, Firefox, and WebKit, `curl`, and `git grep`.

## Compared with earlier audits

The [security audit of 1 November 2026](security-audit-2026-11-01.md) checked storage and privacy as one of its eleven areas. It found no request leaving the device in three browsers, on a local build with no analytics. This audit goes further in three ways:
- It tests the live site, with Plausible.
- It reads Plausible's own script.
- It checks every feature that has an outside link.

| Area | Security audit, 2026-11-01 (area 4) | This audit |
|---|---|---|
| Requests from the web app | **PASS**: none outside localhost, on a local build | **PASS** on live drafter.dev, but see finding 1 for the analytics |
| Analytics | Not on the site yet (added 2026-11-02) | **Finding 1 (High)**, fixed |
| Storage on the device | Listed | **PASS**: every store listed below |
| The desktop app's network | Network block and WebRTC checked | **PASS**: only the update check, which can be turned off |
| AI | Not checked | **PASS**: none |
| The browser's own services | Not checked | **Finding 2 (Low)**, fixed |
| Docs | One overstatement | **Findings 3 to 5**, fixed |

---

## 1. Every way to the network: PASS, after finding 1

**Method.** Two passes:
- `git grep` over every shipped source file for every network call or link a browser or Node can make: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `new Image`, prefetch and preconnect, outside `<script>`, font, and CSS addresses, Electron's `net`, `node:http(s)`, `electron-updater`, `shell.openExternal`, `window.open`, and links to other sites.
- Then the live session below.

**The web app.**
- Every `fetch` goes to the app's own server: the fonts for a PDF (`apps/web/app/workers/export-compute.ts`), the spellcheck dictionaries (`workers/spell-compute.ts`), and the service worker's update check (`update/check.ts`).
- There is no `XMLHttpRequest`, WebSocket, EventSource, `sendBeacon`, prefetch, or preconnect.
- The app never writes into the page's address (no `pushState`, `replaceState`, or `location.hash`), so no address the analytics sees can hold anything from a script.
- The Markdown preview makes no links, and exports load nothing from anywhere.

**The packages.** No package under `packages/*/src` uses `fetch`, `node:http`, `node:https`, `node:net`, or `child_process`.

**The desktop app.**
- `apps/desktop/src/network.ts` cancels every http, https, ws, and wss request a page makes. The one exception is a module from the writer's own modules folder (area 6), and only to addresses the writer agreed to.
- WebRTC is closed (`webrtc.ts`, `main.ts`).
- Its own requests are the update check (`updates-main.ts`, `updates.ts`), which is on by default and can be turned off in Settings.
- Links go to the system browser only when clicked: https links, and the one `mailto:` address (`window.ts`, `protocol.ts`).
- Desktop tests hold all of this: `hardening.spec.ts` ("refuses network requests from pages"), `updates.spec.ts` ("makes no request when Check for updates is off"), and `modules.spec.ts` (a module reaches only the addresses agreed to, and no STUN or TURN). All 137 desktop tests passed on 2026-11-03.

**Every request Drafter can make:**

| What | To | When | Could it carry the script? |
|---|---|---|---|
| The app's files, fonts, dictionaries, `/sw.js` | drafter.dev, or a self-hosted server | Loading; each open; Check for updates | No. The server sees an IP address and a browser, as any website does |
| Plausible's script | plausible.io | Each page load, drafter.dev only | No. It is the one outside code on the page (finding 1) |
| Plausible's events | plausible.io | Page views, time on page, outside-link clicks and downloads, drafter.dev only | **Before the fix, yes, indirectly:** the Open on GitHub address. Now no |
| GitHub's new-issue page | github.com | Only on a click of Open on GitHub | Only what the writer typed and saw in the report |
| An email to the maintainer | The writer's email app | Only on a click of Write an email | Only what the writer typed |
| Other outside links (releases, the changelog, fountain.io, and others) | Those sites | Only on a click | No |
| The update check, and the update | github.com | The desktop app, at start (can be turned off), or Help → Check for Updates | No. GitHub sees the IP address, version, and system |
| A module from the modules folder | The addresses it names | Desktop app only, after the writer agrees | Yes, by design (area 6) |

## 2. Analytics: FAIL, fixed (finding 1)

- **Where it runs.** Plausible is added in `apps/web/nuxt.config.ts` only when `DRAFTER_ANALYTICS=plausible` and the build is not the desktop app's. Only `netlify.toml` sets that. The Docker image doesn't set it, and the desktop build forces `DRAFTER_DESKTOP=1`. So only drafter.dev has analytics. The page's security policy names plausible.io only on a page that loads it (`scripts/csp.mjs`).
- **What Plausible's script does.** Its settings for drafter.dev are chosen on Plausible's dashboard, not in this repository. The script the site loads (`https://plausible.io/js/pa--lKXZsV2-N7mag-Pl4BV9.js`, 6,024 bytes on 2026-11-03) has `outboundLinks`, `fileDownloads`, and `formSubmissions` turned on. A click on a link to another site sends `{name: "Outbound Link: Click", props: {url: <the link's whole address>}}`.
- **Finding 1 (High): what a report said reached the analytics.**
  - Report a problem's **Open on GitHub** is a link to GitHub's new-issue page.
  - Its address holds the report: the title, what happened, what was expected, and the version info (`apps/web/app/report/issue.ts`).
  - So on drafter.dev, a click sent all of that to plausible.io.
  - The script was never sent. A report, though, could hold lines the writer pasted into it.
  - It reached only drafter.dev, and only when a report was opened on GitHub. Report a problem shipped on 1 November 2026.
  - **Shown:** in Chromium, with Plausible's real script and the snippet drafter.dev served, a click on a report link sent `"props":{"url":"https://github.com/cschweda/drafter/issues/new?template=bug.yml&title=Export%20fails&what-happened=INT.%20SECRET%20ROOM%20-%20NIGHT"}`. Every address was routed inside the test, so nothing went to plausible.io or GitHub. Plausible counts nothing from an automated browser, so the test turned off `navigator.webdriver` for this one check.
  - **Fixed** (`d68b7ce7`, live on drafter.dev the same hour). The snippet now gives Plausible a `transformRequest` that drops whatever follows `?` or `#` from the page's address, the referrer, and every property, before any event is sent (`apps/web/scripts/plausible.mjs`). The same test then sent `"props":{"url":"https://github.com/cschweda/drafter/issues/new"}`. `apps/web/test/plausible.test.ts` runs the snippet as a page would and holds this. The page's security policy gets the snippet's new hash on its own, at build time.
  - **Not changed:** Plausible's script still runs in the editor's page on drafter.dev. It is outside code, and the security policy lets it send to plausible.io. The help says so plainly. The desktop app and a self-hosted copy never load it. Two choices for later are in DEFERRED: loading it only on the help pages, or hosting a reviewed copy.

## 3. No AI: PASS

- **No AI package anywhere** in `pnpm-lock.yaml`. Searched for: anthropic, openai, google genai, langchain, huggingface, ollama, transformers, onnx, xenova, whisper, mistral, cohere.
- **No code calls an AI service**, and no model is downloaded.
- **Drafter for Claude** (`packages/mcp`, the `drafter-mcp` program) is not AI. It is a separate, read-only program that an AI app the writer sets up can start, to read the folders named on its command line. It talks only over its standard input and output and opens no network connection. Neither the web app nor the desktop app imports, starts, or contacts it.
- A module the writer adds to the desktop app's modules folder is the one way AI could come in (area 6).

## 4. The service worker: PASS

It caches Drafter's own files only. It has no runtime caching (`runtimeCaching: []`), no background sync, no push, and no POST. It fetches `/sw.js` to look for a new version, and nothing else (`nuxt.config.ts`; `plugins/service-worker.client.ts`).

## 5. What is stored, and where: PASS

Everything below is on the writer's device. None of it is a cookie, and none of it is sent anywhere.

**In the browser (and in the desktop app's own copy of the same storage):**
- **IndexedDB `drafter`:**
  - each script's recovery copy, title, and settings (`projects`)
  - its earlier versions (`snapshots`)
  - file handles and their names (`handles`)
  - settings, goals, and writing stats (`settings`)
  - `drafts` and `cuts`
  - `templates`
- **IndexedDB `drafter-cache`:** for each kept version, each scene's heading, first lines, and a fingerprint of its wording.
- **localStorage:**
  - text not yet in the recovery copy, for a moment while a page closes
  - the unsent report
  - which What's new notes and tips were seen
  - the theme
- **Cache Storage:** Drafter's own files only.

**In the desktop app's folder** (`~/.config/Drafter`, `%APPDATA%\Drafter`, or Application Support):
- the same storage
- the list of files the writer opened (`granted-files.json`)
- desktop settings
- the modules folder
- dictionaries
- the updater's download

**Beside each script, when the writer uses them:** a drafts folder and a `.cuts.md` file.

## 6. Modules from the desktop app's folder: PASS WITH NOTE

- The desktop app can load modules the writer puts in its modules folder. That is code nobody at Drafter checked.
- While one is on, it can read and change the open script.
- A module that names addresses in its `module.json` can reach those addresses and no others, and only after the writer agrees when turning it on. The writer must agree again if a later version names more (`modules/README.md`; `apps/desktop/src/network.ts`).
- The three built-in modules name no address.
- The help's Privacy page didn't mention folder modules. It does now (finding 4).

## 7. The browser's own services: Finding 2 (Low), fixed

- **The problem.** Chrome's Enhanced spell check and Edge's Microsoft Editor send what is typed in a text field to Google or Microsoft. Both are the browser's features, outside Drafter. The script editor already turned the browser's spellcheck off, since Drafter's own spellcheck runs on the device. Note, card, scene-details, draft-note, and report fields still had it on. Notes and scene details hold the script's words.
- **Fixed.** The page's root now has `spellcheck="false"` (`nuxt.config.ts`), which every field inherits. Report a problem turns it back on for its own fields, since that text is about to go to GitHub anyway. The help says so.

## 8. Dependencies with telemetry: PASS

- Nuxt's telemetry is off (`telemetry: false`).
- No error reporter or product-analytics library (Sentry, PostHog, and the like) is in the lockfile.
- The desktop app's only runtime dependency is `electron-updater`, used for the update check.

## 9. What the docs say: findings 3 to 5, fixed

- **Finding 3 (Medium): "the desktop app sends nothing"** (the Privacy help page). It checks GitHub for updates at start unless that is turned off. Now: "no analytics", and "nothing about you, your scripts, or your use of it", with what GitHub sees.
- **Finding 4 (Medium):**
  - "No telemetry… usage" and "No outside services" didn't account for Plausible on drafter.dev.
  - The README's security-policy line said "only Drafter's own scripts".
  - `docs/WHY.md` said "no analytics".
  - Each now names Plausible, on drafter.dev only.
  - The modules paragraph now covers folder modules.
- **Finding 5 (Low): what Plausible records.** The help said "the page's address" and nothing else. It now lists everything: the address cut before any `?` or `#`, the referrer, device and browser, country, scroll depth and time on the page, and outside links and downloads clicked.

## The live writing session

**Method.** `apps/web/scripts/privacy-check.mjs`, a Playwright script anyone can run again, drove each browser through a session on live drafter.dev:
- write a new screenplay with a made-up phrase in its heading, action, dialogue, and title
- switch to Classic Mode and type, then back
- export a PDF, an HTML page, an EPUB, a Final Draft file, and a Markdown file
- save
- open Stats, Scaffold, and the Outline
- open Settings
- take a snapshot
- read a help page
- reload, and find the script still there, from the device

Every request each browser made was recorded: its address, its headers, and its body. Plausible's requests were recorded, then stopped, so the audit added no visits to the site's numbers. Plausible also sends no events from an automated browser, which is why its events were tested separately (finding 1).

**Results** (2026-11-03, 15:59 UTC, after the fix for finding 1 was live). The made-up phrase was `QUILLFERN ZEBRA 7731`, in the heading, the action, and the dialogue, and the title was `Pomegranate Lighthouse 4402`.

| Browser | Steps done | Requests | Went to | Uploads (anything but GET) | Requests holding the phrase or the title | Where the script was afterward |
|---|---|---|---|---|---|---|
| Chromium | 17 of 17 | 373 | drafter.dev, plausible.io (its script only) | 0 | **0** | This browser's IndexedDB (`drafter`), found again after the reload |
| Firefox | 17 of 17 | 199 | drafter.dev, plausible.io (its script only) | 0 | **0** | The same |
| WebKit | 17 of 17 | 143 | drafter.dev, plausible.io (its script only) | 0 | **0** | The same |

Every request was a GET for Drafter's own files, its fonts, its dictionaries, and Plausible's script. The phrase and the title were searched for in each request's address, headers, and body, as typed and as URL-encoded. They were in none of them. The script was in one place afterward: this browser's own storage.

## Changed with this audit

- `d68b7ce7` (on `main`, live on drafter.dev): finding 1.
- On the `tech-details` branch, for v0.25.1:
  - findings 2 to 5
  - the README's new **Privacy** section and this audit in its Security section
  - the Privacy help page's **Your script stays with you**
  - [`AUDITS.md`](AUDITS.md)
