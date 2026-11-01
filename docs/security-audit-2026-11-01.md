# Security audit, 1 November 2026

Drafter's first formal security audit. It covers the web app at drafter.dev, the desktop app, the `drafter` command line, the packages, the build and release pipeline, and the security claims in the documentation. Earlier security work was a set of focused reviews: the desktop app's modules folder and updates (27 October), reopenable exports (v0.23.1), and the trap documents (v0.23.2). This audit checks what those reviews covered again and adds the areas they didn't. [Audits](AUDITS.md) lists every audit, newest first.

**Date:** 2026-11-01
**Auditor:** an AI agent (Claude), working read-only on the code. Only documentation was changed, in one commit (see "Changed with this audit").
**Overall result:** **PASS WITH FINDINGS.** No exploitable hole was found. Nothing in a file Drafter opens can run as script, nothing leaves the device unless the writer sends it, and every way a file comes in has a size cap before decoding. There is one thing to fix, and it is a setting, not code: GitHub's private vulnerability reporting is still off, so the first channel SECURITY.md names doesn't exist. The other findings are Low or Info: a desktop grant that leans on the renderer staying uncompromised, dependency advisories that sit only in build and dev-server tooling, no automated dependency updates, and one documentation sentence that claims slightly more than is true.

## Commits audited

| Ref | Commit | Notes |
|---|---|---|
| `clean-room-audit-2` | `9cd506dd33d81a2ac199f305c33c7fa385cbc9cb` ("fix: the clean-room audit's must-fix items, and the recommendations that were quick") | v0.24.0 plus the clean-room audit and its fixes: 3 commits after `main`. Everything below was read here |
| `main` | `aa6a81759e645f34a0b1f495c134f84c43a902fb` (v0.24.0-4) | The release branch these 3 commits go onto |
| `story-map` | `04f4306f018ac37927e4d7ae93672e71fef3cc2f` ("feat(story-map): lines of dialogue, scene summaries, hooks, and threads") | Read with `git show` and `git grep` only. It holds the model so far (`packages/story-map/src/model.ts`, `words.ts`), and no renderer yet |
| drafter.dev | live, fetched 2026-11-01 22:52 UTC | Response headers only (`curl -sI`), read-only |

Tools: Node 22.22.2, pnpm 10.33.4, Electron 45.0.0, Nuxt UI 4.12.0, Playwright's Chromium, Firefox, and WebKit. A production build (`pnpm -r build`, then `NETLIFY=true pnpm build` in `apps/web`) was made for checks 2 and 4.

## Compared with earlier security work

Earlier work was reviews of particular features, not audits of the whole app. "new" means that review didn't cover the area.

| Area | 2026-10-27 desktop review (v0.4.0) | v0.23.1 reopen review | v0.23.2 trap documents | This audit |
|---|---|---|---|---|
| 1. XSS and injection | new | Partly: the embedded source in an export is read as text | Partly: `inert` traps check the HTML export of hostile markup holds nothing live | **PASS.** Every sink in the code was read, including the one library `v-html`. One documentation finding (F5) |
| 2. CSP and headers | Partly: the folder module frame's CSP | new | new | **PASS with finding.** Live headers match the build. HSTS is Netlify's default (Info) |
| 3. Service worker and PWA | new | new | new | **PASS** |
| 4. Storage and privacy | Partly: the network block, WebRTC | new | Partly: "nothing fetched" in browsers | **PASS.** No request outside localhost in three browsers |
| 5. File opening | Partly: the modules folder | Reopen reader: caps before decode | Every entry point, 258 traps | **PASS.** Traps re-run: 400 and 455 tests pass. No gap found |
| 6. Electron desktop | Modules folder, WebRTC, updates | Desktop reopen | `desktop-open` | **PASS with finding.** The drop grant (F2, Low) |
| 7. Script modules | Folder modules: sandbox, RPC, consent | new | `desktop-modules` manifests | **PASS** |
| 8. CLI | new | `convert` of exports | `cli-convert`, `cli-build` | **PASS** |
| 9. Supply chain | Partly: `check-asar.mjs` | new | new | **PASS with findings.** Advisories only in tooling (F3); no Dependabot (F4) |
| 10. Repo hygiene | new | new | new | **FAIL, process only.** Private reporting is off (F1, Medium) |
| 11. Docs accuracy | new | Partly | Partly | **PASS with finding.** One overstatement (F5) |

### Since the earlier reviews

- **27 October** (DECISIONS, "After the security review"): still in place. The checks were WebRTC closed (`setWebRTCIPHandlingPolicy` and the refusing proxy), the module frame's CSP and sandbox, the `event.source`/`'null'` origin checks, consent tied to a hash of every module file, and the owner and writable walk. Its deferred items are still deferred: a session per module, the symlink TOCTOU at serve time, hard links, and DNS prefetch.
- **v0.23.1:** the reopen reader still uses `indexOf` and strict base64, with caps before decoding (32 MB for the file, 5 MB for the script), in the app (`packages/archive/src/reopen.ts:29`) and the command line (`packages/cli/src/convert.ts:124–147`).
- **v0.23.2:** of the trap documents' open items in [`DEFERRED.md`](DEFERRED.md#trap-documents), **private vulnerability reporting is still off.** It was to be turned on "before this merges" (`docs/DEFERRED.md:287`), and it has since been released. The rest (a late NUL, `build` laying out what Open refuses, inline styles, Trusted Types) are unchanged, and none is a way in.

---

## 1. Web app: XSS and injection: PASS

**Method.** `grep -n -E 'v-html|innerHTML|outerHTML|insertAdjacentHTML|new Function|\beval\(|DOMParser|document\.write|srcdoc|createContextualFragment|setHTML'` over every tracked non-test `.ts`, `.vue`, `.js`, `.mjs`, and `.cjs` file. The same search ran over the Nuxt UI components the app uses, and over `nuxt-guided-tour`. Then every renderer that turns the writer's text into markup was read.

**Results.**
- **No sink in Drafter's own code.** The only matches are comments (`apps/desktop/src/grants.ts:17`, `apps/web/app/components/CommandPalette.vue:18`) and the export's refused-attribute list (`packages/render-html-file/src/escape.ts:61–64`). There is no `eval`, no `new Function`, no `DOMParser`, and no `innerHTML`.
- **The palette's scene headings.** Nuxt UI's `UCommandPalette` draws `labelHtml`, `suffixHtml`, and `descriptionHtml` with `v-html` (`@nuxt/ui/dist/runtime/components/CommandPalette.vue:280,283,288`). Drafter overrides the `item-label` slot with plain interpolation (`apps/web/app/components/CommandPalette.vue:283–287`), so a heading never reaches the first two. Its items have no `description`, so the third gets nothing. Even without the slot, Nuxt UI's `highlight` escapes `& < > " '` around its `<mark>`s (`dist/runtime/utils/search.js:1–10, 37–43`). Of the components the app uses (`UIcon`, `UTooltip`, `UModal`, `UDropdownMenu`, `UCommandPalette`, `UApp`), this is the only one with `v-html`. **Safe twice over.** No test pins it (recommended).
- **The Markdown Preview** builds DOM with `createElement`, `createTextNode`, and `textContent` only (`apps/web/app/markdown/render.ts:1–7`). Raw HTML is shown as text (`:63`, `:167`). A link is drawn as its text, so no `href` is ever made and a `javascript:` or `data:` address has nothing to run in. An image is drawn as its description (`:98–104`). The only attributes set are `aria-*`, `start` (a number), generated ids, and `data-from` (`:56, 91, 141, 199–215`).
- **HTML and EPUB exports** (`@drafter/render-html-file`). `escapeHtml` escapes `& < > " '`, makes control characters spaces, and turns lone surrogates and U+FFFE/U+FFFF into U+FFFD (`escape.ts:9–47`). `el()` writes names only from code: it throws on a name outside `^[a-z][a-z0-9-]*`, on any `on…` attribute, and on `style`, `srcdoc`, `formaction`, `srcset`, and `ping` (`:54–64`). Every URL attribute goes through `safeHref` (`:66–115`), which allows `#…` and absolute `http:`, `https:`, and `mailto:` as `new URL` reads them, so `java\tscript:` is still `javascript:`. It allows `data:image/…` only in an `<img src>`. The embedded source is base64 in `<script type="text/plain">`, which no browser runs and whose alphabet can't close the element. The EPUB carries no script.
- **PDF metadata and links.** The title goes through pdf-lib's `setTitle`, which writes UTF-16 hex (`packages/render-pdf/src/render.ts:83`). A link's URI must be `http:`, `https:`, or `mailto:` (`packages/render-pdf/src/document/blocks.ts:51–63`), is checked again before it becomes an annotation (`document/render.ts:150`), and is written as a hex string, so a `)` or `\` can't break the file (`:133–140`).
- **FDX XML export.** `escapeXml` escapes `& < >`, adds `"` and tab and line feed in attributes, writes CR as `&#13;`, and throws on characters XML forbids (`packages/fdx/src/xml.ts:279–300`). Attribute names come from code (`:343`).
- **SVG.** No shipped SVG holds the writer's text. The Stats charts are Vue templates with interpolation (`apps/web/app/components/StatsOverview.vue`), and the diagrams are static files made at build time from Drafter's own `.mmd` sources.
- **Story map** (`story-map` at `04f4306`) is not far enough along to audit as output: there is a model and no renderer. Its plan already requires what this audit would check: zero JavaScript, a CSP with no `script-src`, `escapeHtml` inside SVG `<text>` and `<title>`, and ids from indexes, never from names (`docs/plans/2026-11-01-story-map.md:21–24`), with `csp.test.ts` and `hostile.test.ts` planned (`:61, 287`). It needs this check when it lands.

## 2. CSP and headers: PASS, with an Info note

**Method.** Read `apps/web/scripts/csp.mjs`. Diffed the generated `.output/public/_headers` against drafter.dev's live headers on `/`, `/sw.js`, `/docs/what-is-drafter/`, and a 404 (`curl -sI`), and checked `http://` and `www.`. Read the exported HTML's CSP.

**Results.**
- **The policy** (`csp.mjs:39–54`): `default-src 'self'`; `script-src 'self'` plus the SHA-256 of each inline script the build wrote (`:23–33`; only types a browser runs are hashed, `:12`); `style-src 'self' 'unsafe-inline'`; `img-src 'self' data:`; `font-src`, `connect-src`, `worker-src`, `manifest-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'none'`; `frame-ancestors 'none'`. Also `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a `Permissions-Policy` turning off camera, microphone, geolocation, payment, and USB, and `Cross-Origin-Opener-Policy: same-origin` (`:63–90`).
- **Live:** drafter.dev sends all of these on every path, 404 included, with the same directives as the local build (with the hashes masked, the two are identical; the hashes differ only because the build differs). `http://` and `www.` redirect with a 301 to `https://drafter.dev/`.
- **HSTS** is `max-age=31536000`, added by Netlify, not by `_headers`. It has no `includeSubDomains` and no `preload` (**Info**, F6).
- **`'unsafe-inline'` styles and no Trusted Types:** already in DEFERRED (`docs/DEFERRED.md:294`), and still not a way in. No script can run but the build's own, and no code path writes the writer's text as HTML (check 1).
- **The exported HTML's own CSP** (`packages/render-html-file/src/shell.ts:51–60`, written as the first `<meta>` after `charset`, `:111–118`): `default-src 'none'`, the one style and the one script by hash, `font-src data:`, `img-src data:`, `base-uri 'none'`, and `form-action 'none'`. A `<meta>` policy can't carry `frame-ancestors`, which doesn't matter for a local file. Generated CSS that holds `<` or CR is refused (`:62–71`).

## 3. Service worker and PWA: PASS

**Method.** Read `apps/web/nuxt.config.ts:57–110, 202–220`, `apps/web/app/plugins/service-worker.client.ts`, and `apps/web/app/update/{state,check}.ts`, and the built `sw.js`.

**Results.**
- **What it caches:** the precache manifest only: 67 `_nuxt/` files, 38 docs pages, 10 fonts, 4 licence texts, 4 dictionary files, the icons, the logos, and the manifest. Each carries a revision (`globPatterns`, `nuxt.config.ts:86–93`). `runtimeCaching: []` (`:104`): nothing fetched at run time is ever cached, so a response can't be planted for later. All of it comes from the site's own origin over HTTPS. Poisoning the cache would mean serving bad files from drafter.dev itself (see "What this audit cannot prove").
- **Scope** is `/` (manifest `scope`, `id`, `start_url`). The navigation fallback is the shell, never for a path that names a file or for `/docs/` (`:98–99`, and the built `NavigationRoute` denylist).
- **No forced update.** `registerType: 'prompt'`, `skipWaiting: false`, the module's own auto-reloading client off (`:58–59, 107–108`). A new worker waits, and only the tab whose writer chose Reload reloads, after the recovery copy is written (`service-worker.client.ts:36–49`). Help → Check for updates calls `registration.update()`, the browser's own request for `/sw.js` (`update/check.ts:4–9`). `sw.js` and the manifest are `Cache-Control: no-cache` (live, and `csp.mjs:83–86`). As with every service worker, a waiting version also takes over once every Drafter tab is closed (Info, F10).
- **Offline:** `cleanupOutdatedCaches: true`. The fallback serves the precached shell.

## 4. Storage and privacy: PASS

**Method.** Grep over shipped source for `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `EventSource`, `importScripts`, `new Image(`, `.src =`, and analytics names. A list of storage use (`localStorage`, `sessionStorage`, `document.cookie`, Dexie stores). A Playwright run of the production build in all three browsers (script kept outside the repository). It served `.output/public` on `127.0.0.1:4198` with the build's CSP, and blocked and logged every request to any other host. It loaded `/`, `/docs/`, What is Drafter, Privacy, Third-party licences, and Why. Then it typed a scene with misspellings and `<img src=x onerror=…>` into the editor, so the spell worker loaded its dictionary, and opened the palette.

**Results.**
- **Nothing leaves the device.** The only `fetch` calls in the web app load Courier Prime, Inter Tight, and the dictionaries from the app's own origin (`apps/web/app/workers/export-compute.ts:150–180`, `spell-compute.ts:37–48`). There is no XHR, WebSocket, beacon, or analytics anywhere. **Playwright: 278 local requests, 0 outside, no CSP reports, in Chromium, Firefox, and WebKit.** Inter Tight and Courier Prime loaded from `/fonts/` in each.
- **What is stored:** the scripts, snapshots, scene history, settings, and folder handles in IndexedDB (`apps/web/app/storage/db.ts:69–79`, `history/cache.ts:33`). In `localStorage` there is an unsaved-text recovery copy (`storage/unwritten.ts:34–67`), the Report a problem draft (`report/dialog.ts:11–20`), the theme, the tour, the "what's new" and storage notices, and a test-only flag. In `sessionStorage` there is the "just updated" mark (`update/updated.ts:40`). No cookies. All of it is plain on the device, which is what a local app means (Info).
- **Update checks.** On the web there is none of Drafter's own (check 3). The desktop app asks GitHub Releases, once at start-up and only if the setting is on (check 6).
- **Report a problem** builds a GitHub new-issue URL or a `mailto:` with `encodeURIComponent` (`apps/web/app/report/issue.ts:147, 237–245`), drawn as links the writer clicks (`components/ReportDialog.vue:235–262`). Nothing is sent by the app.

## 5. File opening: PASS

**Method.** Read `fixtures/trap/README.md`, `entry-points.ts`, and the readers. Re-ran the suite. Searched for inputs the entry-point table doesn't list: `location.search`, `location.hash`, `URLSearchParams`, `launchQueue`, `share_target`, `file_handlers`, `route.query`, and clipboard reads.

```sh
pnpm -r build
pnpm vitest run --project trap                          # 1 file, 400 tests passed (11.9 s)
cd apps/web && pnpm vitest run --project web test/trap-open.test.ts   # 455 tests passed (16.5 s)
```

**Results.**
- **Every entry point is covered:** `web-open`, `desktop-open`, `cli-convert`, `cli-build`, `package`, `desktop-modules`, and `beside-read`. The search found no other way in. The app reads nothing from its URL, has no launch queue or share target, and pastes as plain text through CodeMirror.
- **Size caps before decoding:** web Open, 32 MB from `File.size` before reading (`apps/web/app/storage/files.ts:34, 125, 237`). Zip: 32 MB, 1,000 entries, 5 MB each, 256 MB declared in all, checked from the central directory before inflating. Script inside an archive: 5 MB (`packages/archive/src/formats.ts:178`). Reopen: 32 MB and 5 MB (`reopen.ts:29`). Desktop: a regular file of at most 64 MB. Command line: `readCapped` opens with `O_NONBLOCK`, refuses a non-file, and reads at most the cap plus one byte (`packages/cli/src/convert.ts:456–481`).
- **XML:** any `<!` other than a comment or CDATA is refused, DOCTYPE included (`packages/fdx/src/xml.ts:173–187`), so no entity is ever defined. XXE and entity expansion have nothing to work with. A trap holds the classic `<!ENTITY secret SYSTEM "file:///etc/passwd">` and is refused.
- **Symlinks:** the desktop grant judges a file by its real path (check 6). `convert` follows a link to a file in a folder but never walks through a linked folder (`convert.ts:263–302`).
- **Drafts and cuts readers:** capped at 32 MB before reading (`apps/web/app/beside/read.ts:24`, `beside/web.ts:178–180`), then strict UTF-8, each entry's ID checked.
- **The File System Access folder grant:** the chosen folder must hold the script's own file by `isSameEntry`, not just its name (`apps/web/app/beside/web.ts:40–47`). A folder that isn't the one kept before is compared the same way (`:82–95`). Paths inside are made by Drafter from the script's name (`:121–142`), and the browser's API refuses `/` and `..` in a name anyway.

## 6. Electron desktop: PASS, with one Low finding

**Method.** A read of `apps/desktop/src/` and `electron-builder.config.cjs`, and the desktop unit tests (`pnpm vitest run` in `apps/desktop`: 28 files, 434 passed, 3 skipped). The packaged e2e suite wasn't run.

**Results.**
- **webPreferences:** every window is made by `windowOptions()` (`apps/desktop/src/window.ts:45–73`), with `contextIsolation`, `sandbox`, `nodeIntegration: false` (in sub-frames and workers too), `webSecurity`, `allowRunningInsecureContent: false`, `webviewTag: false`, and `navigateOnDragDrop: false`. A `window.open` page gets the same (`:131`). `app.enableSandbox()` is set (`main.ts:74`). There is no other `new BrowserWindow`.
- **The preload** (`preload.ts:104–192`) exposes these calls:
  - **Files:** `showOpen`, `showSave`, `read`, `write`, `realPath`, `writeBeside`, `readBeside`, `listBeside`, `grantDropped`, `watch`, `unwatch`.
  - **The app:** the menu's commands, close ready and reply, back to the editor, updates (listen, enabled, open release, check, install), modules (list, set network), open ready, and the renderer report.

  How each is checked:
  - **The sender.** Every file call checks first that it comes from an app page (`files-ipc.ts:103–113`). The menu, close, and update calls must come from the editor's main frame (`menu-main.ts:120`, `close.ts:196, 222`, `updates-main.ts:166–187`), and the modules calls from an app page's main frame (`main.ts:272–282`).
  - **The arguments.** A path must be absolute, with no NUL, at most 4,096 characters, and within Windows' name rules (`files.ts:92–107`). Bytes must be a `Uint8Array` of at most 256 MB (`:110`). File names (`file-handlers.ts:83`) and watch ids (32 per page at most, `:91, 99`) are checked, and so are menu payloads (`menu.ts:445–461`). A module's network grant is cut down to what its `module.json` declares (`module-folder.ts:745`).
- **Navigation:** `will-frame-navigate` keeps main frames and sub-frames on `app://drafter/` (`window.ts:115–122`), redirects are cancelled (`:123–125`), `window.open` allows only app pages (`:126–136`), and a webview can't attach (`:137`). `shell.openExternal` takes `https:` with no user name or password (`protocol.ts:238`). The `mailto:` exception needs the path to equal the maintainer's address exactly, case aside, with only `subject` and `body` parameters (`:244–250`), so a `cc`, a `bcc`, a second address, or an `attach` is refused.
- **`app://` and `drafter-module://`:** `%2f`, `%5c`, `%00`, backslashes, `..` (before and after decoding), `//`, drive letters, and Windows device names are refused. The result must stay inside the root (`protocol.ts:74–102`), and a link must stay inside it by its real path (`:215`). `app://` serves only the packaged `web/` folder, GET and HEAD only, with a 404 and no fallback for anything missing (`main.ts:101`). A module's files are served only if they are unchanged since start, by SHA-256 (`module-folder.ts:694–704`).
- **Grants** (`grants.ts`). A path is granted only by the Open or Save dialog, a drop, or the command line. It is recorded by its real path and checked again at each use (`:128–173`). A write must be a script or an export extension, and `.fdx`, `.html`, and `.epub` only where a Save dialog chose them (`file-handlers.ts:204–222`).
  - **F2 (Low).** The drop channel takes a path from the renderer (`files-ipc.ts:120`, `file-handlers.ts:199`). Main can't tell a real drop from a call the page makes itself, so a renderer running someone else's script could be granted, and could rewrite, any `.fountain`, `.md`, `.markdown`, or `.txt` file the writer's account can read, and make a drafts folder and a cuts file beside it. The comment at `grants.ts:13–18` accepts this as needing "a compromised renderer to begin with", which is true: check 1 found no way to get one. But it says "only script-type files are within reach". That is narrower than it is: `.md` and `.txt` cover any project's README, notes, or an AI tool's instructions file.
- **Beside-the-script writes** (`beside.ts`, `work-names.ts`). Names are worked out in main from the script's real name (`beside.ts:118–173`). `..`, separators, and Windows names are refused (`:89–101`). Links are refused (`lstat`, `O_NOFOLLOW`, device and inode checks), and a draft file is only ever created, never replaced (a hard link with exclusive create). A page can't name another file.
- **The updater:**
  - **What the code does.** `autoDownload` and `autoInstallOnAppQuit` are off (`updates.ts:289–290`). An update installs only from Restart (`:219`). It comes from GitHub over HTTPS, and the AppImage and Windows installer are checked against the SHA-512 in the release's feed, with differential and web-installer downloads off (`updates-main.ts:119–121`). The Mac app's own check reads `latest-linux.yml` from the latest release in its own session, at most 64 KB with a 15-second timeout, takes only `version:`, and offers a fixed download page (`updates.ts:13, 229, 349`).
  - **What that doesn't prove.** Nothing is signed (Windows is unsigned, so no publisher is checked), so the SHA-512 proves the download is intact, not who made it. Authenticity rests on the GitHub account and its release (Info, F8; known, and the reason the signed Mac app waits).
- **Fuses** (`electron-builder.config.cjs:111–120`): `runAsNode`, `enableNodeOptionsEnvironmentVariable`, `enableNodeCliInspectArguments`, and `grantFileProtocolExtraPrivileges` are off; `enableEmbeddedAsarIntegrityValidation` and `onlyLoadAppFromAsar` are on. Checked on the packaged binary by `e2e/packaged.spec.ts:343–379` (Linux), `win-packaged.spec.ts:265`, and `mac-packaged.spec.ts:160`. Two Info notes: `enableCookieEncryption` is off, and the app keeps no cookies. By Electron's documentation, asar integrity is enforced only on macOS and Windows.
- **AppArmor:** the `.deb` installs electron-builder's profile (`/etc/apparmor.d/drafterdev`, shown in CI at `.github/workflows/desktop.yml:155–156`). It is unconfined and only allows the user namespace Chromium's sandbox needs. It confines nothing, and no document says it does. The AppImage ships none; the docs give a narrow one to add by hand. **Signing:** Windows unsigned (`electron-builder.config.cjs:175`); the Mac is signed ad hoc with the hardened runtime off (`:137–138`), not distributed.
- **argv and second launches:** an argument starting with `-` is dropped, a bare `--` is honoured, and only local `file://` URLs are read. Each file is granted before it opens (`open-files.ts:93–138`), and macOS `open-file` paths go after `--` (`main.ts:230`). There is no `setAsDefaultProtocolClient` and no `open-url` handler. Chromium switches given at a *first* launch still apply (no fuse covers them), but that needs someone who can already run programs as the writer.
- **Permissions:** denied by default; only `persistent-storage`, and only for app pages (`permissions.ts:15–44`). Requests with no `webContentsId` pass `refusesRequest` (`network.ts:28`), which covers workers. They can only be the app's own (`worker-src 'self'`), and the refusing proxy stops them anyway.

## 7. Script modules: PASS

**Method.** Read `apps/web/app/modules/registry.ts`, `folder*.ts`, `components/FolderModuleFrame.vue`, `apps/desktop/src/module-folder.ts`, and `module-runtime.ts`.

**Results.**
- **Built-in modules** are compiled in with `import.meta.glob` (`apps/web/app/modules/registry.ts:118`). They are Drafter's own code, with the editor's trust. The test module is only in builds made with `DRAFTER_TEST_MODULES=1`. Nothing is loaded at run time from outside the build except the desktop's folder modules.
- **Folder modules** (desktop only):
  - **The frame.** Each runs in `<iframe sandbox="allow-scripts" allow="">` (`FolderModuleFrame.vue:121`), which gives it an opaque origin with no storage, no popups, and no access to the page. Its CSP is made per module: `default-src 'none'`, its own folder only, `connect-src` only the origins the writer agreed to, `frame-ancestors app://drafter`, and `sandbox allow-scripts` (`module-folder.ts:599–613`). Frames have no preload, so they have no IPC.
  - **Messages.** The page hears a message only when `event.source` is that frame and `event.origin` is `'null'`, and only as plain data under 4 MB (`folder-channel.ts:126–139`). The runtime hears only its parent at `app://drafter` (`module-runtime.ts:118`). The page posts with target `'*'` (`FolderModuleFrame.vue:74`), which an opaque origin requires, and the frame's CSP keeps it on its module.
  - **The network** is closed by `webRequest` (`network.ts:24–38`), the refusing proxy, and `disable_non_proxied_udp` for WebRTC.
- **What a module can do:** read the script, its parse, its layout, and the cursor; make changes (a background frame only during a run the writer started, `folder-channel.ts:17`); show problems, go to a line, ask to confirm, and notify; and keep storage of its own (4 MB, 500 keys). It can't touch the file system. Loading needs a modules folder the writer owns that no one else can write, and links that stay inside the module (`module-folder.ts:166–308`). Turning a module on takes consent bound to a hash of every file in it.

## 8. CLI: PASS

**Method.** Read `packages/cli/src/cli.ts` and `convert.ts`.

**Results.**
- **Reading:** every input, `--template` JSON included (`cli.ts:276–318`), goes through `readCapped` (check 5).
- **`build` output:** it won't write a PDF to a terminal, and won't write over its own input (`cli.ts:175–183`). The default name is `<name>.pdf`, which can never match the input (`:366–367`). Other targets are the paths the user named, written as given (`:352–361`). That is ordinary command-line behaviour, and the user chose them.
- **`convert` naming** comes from the source's base name with its known extension swapped (`convert.ts:229–255`). It lands beside the source, or under `--out` with the argument's subfolders kept; the folder walk adds only entry names from `readdir`, so it can't climb out. A file already there is skipped unless `--force`. `publish` writes a temp file with `wx`, then hard-links it into place, which fails on anything there, a dangling link included, and never follows one. With `--force` it renames over the target, replacing a link rather than following it (`:370–400`). One run never writes the same target twice (`:194–226`).

## 9. Supply chain: PASS, with findings

**Method.** `pnpm audit --prod` and `pnpm audit` (both with `--json`, summarised by package and path). A check of the lockfile's resolutions. A read of `.github/workflows/desktop.yml`, `apps/web/netlify.toml`, and the repository's security settings (`gh api repos/cschweda/drafter`).

**`pnpm audit --prod`: 25 advisories (6 high, 14 moderate, 5 low). `pnpm audit`: 26 (6 high, 15 moderate, 5 low).** None reaches what ships:

| Package | Advisories | Path | Ships? |
|---|---|---|---|
| `node-forge` ≤1.4.0 | 6 high, 3 moderate, 3 low (TLS, PKCS#12, X.509, ASN.1, PEM) | `nuxt › @nuxt/nitro-server › nitropack › listhen` | No: the dev server's self-signed HTTPS |
| `nuxt`, `@nuxt/nitro-server` <4.6.3 | 2 moderate: dot segments bypass `server/middleware` | `apps/web` (`"nuxt": "^4.6.2"`, `apps/web/package.json:50`) | No: drafter.dev is static (`nuxt generate`), and there is no `apps/web/server/` |
| `@nuxt/vite-builder` <4.6.3 | 3 moderate: dev server file read and config exposure | `nuxt` | No: `nuxt dev` only |
| `glob` 9–14.0.1, `minimatch` <11.0.1 | 2 moderate: DoS | workbox-build, @vercel/nft, electron-builder | No: build tooling |
| `esbuild` 0.27.x | 1 low: dev server file read | `@nuxt/fonts › fontless` | No |
| `deepmerge` 4.2–4.3.1 | 1 low: prototype poisoning | workbox-build | No |

`--prod` counts them because `nuxt` and `@vite-pwa/nuxt` are runtime dependencies of `apps/web`, which builds a static site. The dev-server advisories matter only to someone running `pnpm dev` on a network others can reach (F3, Low).

- **Lockfile:** lockfile v9, 1,384 resolutions, every one with a `sha512` integrity, and no git, tarball, or `codeload` sources. CI installs with `--frozen-lockfile` (`desktop.yml:82, 265, 394`). pnpm 10 runs no dependency's install scripts unless allowed, and none is allowed.
- **Actions:**
  - **Pinning.** Every `uses:` is pinned by a full commit SHA, with its tag in a comment (`desktop.yml:52–59, 116, 242–249, 379–386, 439–446`).
  - **Permissions.** The workflow is `permissions: contents: read` (`:34–35`); only `publish` gets `contents: write`, and only on a `v*` tag after the Linux and Windows jobs pass (`:430–437`). The only secret is the repository's own `GITHUB_TOKEN`, in `publish` (`:452`).
  - **Triggers.** There is no `pull_request` trigger, so a fork's code never runs here (`:24–32`), and no `${{ github.event… }}` value is put into a shell.
  - **Credentials.** Only `publish` sets `persist-credentials: false` (`:441`). The other jobs' checkouts keep their read-only token in `.git/config` (Info, F7).
- **Dependabot or Renovate: none.** There is no `.github/dependabot.yml` or `renovate.json`. GitHub reports Dependabot security updates `disabled`, and vulnerability alerts aren't on (`GET …/vulnerability-alerts` is 404). Secret scanning and push protection are on (F4, Low).
- **Netlify** (`apps/web/netlify.toml`): `pnpm --filter @drafter/web... run build`, publishing `apps/web/.output/public`, on Node 22. The build script runs `csp.mjs` and `check-build.mjs` after `nuxt generate` (`apps/web/package.json:9`), so a deploy can't go out without its `_headers`. No secrets or environment values beyond `NODE_VERSION`.

## 10. Repo hygiene: FAIL (process only)

**Method.** `git check-ignore`, `git ls-files` for key-shaped names, and a history scan: `git log --all -p | grep -iE "api[_-]?key|secret|token|password|BEGIN (RSA|OPENSSH)"`, 943 matching lines over 863 commits on every ref. Each distinct line was read. Then a scan for shaped secrets: `ghp_`, `github_pat_`, `gho_`, `AKIA…`, `sk-…`, `xox?-`, `-----BEGIN … PRIVATE KEY`, `nfp_`, `AIza…`, and `key = '…'`-style assignments. `gh api repos/cschweda/drafter/private-vulnerability-reporting`.

**Results.**
- **`.gitignore`** ignores `.env` and `.env.*`, except `.env.example` and `.env.sample` (`.gitignore:24–28`). Verified with `git check-ignore` on `.env`, `apps/web/.env`, and `apps/desktop/.env.local`. No `.pem`, `.key`, `.p12`, `.pfx`, `id_rsa`, or credentials file is tracked.
- **No secrets in history.** Every match is code or test text: a lexer's `token`, `CancellationToken`, the test fixtures `'secret'`, `'PRIVATE KEY'`, and `SECRETDATA` (written by the desktop tests to prove they can't be read), the XXE trap's `file:///etc/passwd`, `GH_TOKEN: 'not-a-token'` in a test, `${{ secrets.GITHUB_TOKEN }}`, and the lockfile's `@azure/keyvault-secrets` (an electron-builder optional dependency). The shaped scan found nothing.
- **F1 (Medium). Private vulnerability reporting is off.** `{"enabled":false}` on 2026-11-01, as on the trap documents' review. SECURITY.md's first instruction is to choose **Report a vulnerability** on the Security tab (`SECURITY.md:9–12`), and that button doesn't exist. The email fallback beside it works, so a reporter isn't stranded, but the documented channel is missing and DEFERRED's "before this merges" (`docs/DEFERRED.md:287`) has passed.
- **SECURITY.md** is otherwise accurate: what is covered, the supported version, and where the defences are described.

## 11. Docs accuracy: PASS, with one finding

Every security claim in the README's Security section, SECURITY.md, What is Drafter? (`apps/web/app/pages/docs/what-is-drafter.vue:95–324`), Privacy, and Technical details' Security section (`apps/web/app/about/tech.ts`, written out as `docs/technical-details.md:188–204`) was checked against checks 1–10.

| Claim | Where | Verdict |
|---|---|---|
| Drafter never runs anything in a file it opens; words shown as words | README:98, technical-details.md:188, What is Drafter | True (check 1). The desktop's folder modules do run code, but they come from a folder the writer installs, not from a file Drafter opens, and Technical details says so |
| A strict CSP; only Drafter's own scripts run | README:99, technical-details.md:194 | True, and the directive list matches the live headers exactly (check 2) |
| No accounts, no server keeping scripts, no cookies, no analytics, no tracking | README:100, Privacy, What is Drafter | True (check 4). Privacy says the host sees requests, like any website |
| Size limits before unpacking; archive entries can't point outside; FDX never fetches | README:101, technical-details.md:196–198 | True (check 5) |
| The desktop app reads only files you chose, and never loads one into a window | README:102, technical-details.md:199 | True for the page as built. The drop channel's limit (F2) is recorded in the code, not in the docs, which is a fair place for it |
| Reopening reads only the embedded script, as text | README:103, technical-details.md:197 | True (checks 1, 5) |
| 258 trap documents; what is enforced and what is only measured | README:104, trap README | True: 258 in the manifest, and both harnesses pass |
| Updates: checks once at start, never installs by itself | technical-details.md:186, What is Drafter:281 | True (check 6) |
| "The web app updates when you reload" | What is Drafter:281 | True, if a little narrow: a waiting version also loads when Drafter is next opened with every tab closed (F10, Info) |
| **"The app has no `v-html`"** | tech.ts:500, technical-details.md:195 | **Overstated (F5, Low).** Drafter's own code has none, but Nuxt UI's palette, which the app uses, does. Drafter neutralises it (check 1), so the user-facing point stands; the sentence should say so |
| Report privately via the Security tab | SECURITY.md:9–12, README:105, What is Drafter:316 | **The tab's button is missing** while private reporting is off (F1). The email route stated beside it is true |

## Must fix

1. **F1 (Medium, process). Turn on private vulnerability reporting:** Settings → Code security → Private vulnerability reporting → Enable. SECURITY.md (`SECURITY.md:9–12`) names it as the way to report, and `gh api repos/cschweda/drafter/private-vulnerability-reporting` gives `{"enabled":false}`. Then mark `docs/DEFERRED.md:287` done. This is a repository setting, so this audit didn't change it.

There is nothing Critical or High, and no code change is required.

## Recommended

- **F2 (Low). Narrow the drop grant** (`apps/desktop/src/files-ipc.ts:120`, `file-handlers.ts:199`, `grants.ts:13–18`). For example, grant a dropped file read-only until the writer saves it (Save then takes the write grant, as a Save dialog's choice does), or ask in main before granting a drop outside a folder already in use. At the least, make the comment say `.md` and `.txt` files of any kind are in reach, not only scripts.
- **F3 (Low). Update Nuxt to ^4.6.3** (`apps/web/package.json:50`), which clears the five Nuxt advisories. Take `node-forge`, `glob`, `minimatch`, `esbuild`, and `deepmerge` as their parents release fixes, or with a pnpm `overrides` entry if the dev server is ever run on a shared network.
- **F4 (Low). Add Dependabot** (`.github/dependabot.yml`) for npm and for GitHub Actions (the SHA pins then get update PRs with their tags), and turn on Dependabot alerts. With no `pull_request` trigger, its PRs run no CI here; that is safe, and worth knowing.
- **F5 (Low, docs). Reword "the app has no `v-html`"** in `apps/web/app/about/tech.ts:500` (and so `docs/technical-details.md:195`). For example: "Drafter's own code has no `v-html`; the one library component that has it, Nuxt UI's palette, is given text-only slots." Add a test that puts `<img src=x onerror=…>` in a scene heading, opens the palette, and expects no `img` in it, so a Nuxt UI update or a removed slot can't undo it silently.
- **F7 (Info). Set `persist-credentials: false`** on the Linux, Windows, and Mac jobs' checkouts (`.github/workflows/desktop.yml:52, 242, 379`), as `publish` already has. They never push.
- **F6 (Info).** Consider sending HSTS from `_headers` with `includeSubDomains` (and `preload`, once every subdomain is HTTPS-only), rather than relying on Netlify's default.
- **F8 (Info).** When the Windows build is signed (or the signed Mac app comes), set the publisher name so electron-updater checks the signature too. Until then, updates are checked for integrity, not authenticity.
- **F10 (Info).** "The web app updates when you reload" could add "or the next time you open it", in What is Drafter (`what-is-drafter.vue:281`).
- **When Story map lands:** run check 1 on its renderer, and check that its `hostile.test.ts` covers SVG `<text>`, `<title>`, and every attribute that takes a number from the model.

## What this audit cannot prove

- **Absence of bugs.** This audit read the code and ran the tests. It didn't fuzz beyond the trap documents, and it wasn't a penetration test of a running desktop app. A hole the readers and harnesses didn't think of can still exist.
- **The hosting and release accounts.** drafter.dev's code is whatever Netlify serves, and the desktop updates are whatever the GitHub release holds. Neither is signed in a way the app checks: a compromised Netlify or GitHub account would reach writers on their next reload or update. Nothing in the repository can rule that out. The service worker is checked over HTTPS from the same origin, with no subresource integrity.
- **Third-party code.** Vue, Nuxt, Nuxt UI, CodeMirror, pdf-lib, dexie, Workbox, and Electron/Chromium were trusted, apart from the specific behaviour checked here (Nuxt UI's palette and its escaping). `pnpm audit` knows only published advisories.
- **What shipped.** The live headers were fetched. The deployed JavaScript, the published npm tarballs, and the GitHub Releases' installers weren't unpacked and compared with this build.
- **The desktop's packaged behaviour.** Fuses, AppArmor, and the sandbox were read from the configuration and their CI checks, not run here. The packaged e2e suite wasn't run.
- **The browsers.** The Playwright run proves no outside request on the paths it exercised, in the three engines Playwright ships, not every feature or every browser version.
- **The AI auditor.** This audit was done by an AI agent, like most of the code it audits. An independent human review, ideally by someone who has never contributed, would see it with other eyes.

## Changed with this audit

Documentation only, in one commit:

- This audit, `docs/security-audit-2026-11-01.md`.
- [Audits](AUDITS.md): this audit at the top of Security audits, in place of the note that it was coming.
- SECURITY.md and the README's Security section: one line linking it.
- CHANGELOG.md: a line under [Unreleased].

## Follow-up, the same day

Fixed after the audit, one commit per finding on the `security-fixes` branch (from `main` at `d8be830`):

- **F1 (Medium), private vulnerability reporting:** fixed on 2026-11-01. The maintainer had the setting turned on (`gh api repos/cschweda/drafter/private-vulnerability-reporting` now gives `{"enabled":true}`). SECURITY.md, the README, and What is Drafter? now name **Report a vulnerability** on the Security tab plainly, with the email as the alternative, and the DEFERRED item that waited for it is gone (`ce225fb`).
- **F2 (Low), the drop grant:** fixed (`7191f71`). The page no longer hands main a path for a drop. The preload's own listener, on the window in the capture phase and added before the page's scripts, takes only a trusted `drop` event, reads each file's path with `webUtils.getPathForFile`, and tells main; main answers an opaque id for each and grants nothing yet. The page asks for a file's id (`dropGrant`) and claims it (`claimDrop`): main grants it then, once, only for the window it was dropped on, within a minute, and only if it is an existing script or a file to import. Unit tests show a path, or an id main never gave out, is refused and grants nothing, and that a real drop is accepted; the desktop e2e drops with Chromium's own drag events and checks a drop the page dispatches itself opens unbound. The threat note in `grants.ts` now says what is still in reach of a renderer compromised below the page, Markdown and text files of every kind included. Kept in DEFERRED: main still can't see the drop itself.
- **F3 (Low), Nuxt:** fixed (`072a907`). Nuxt 4.6.3, lockfile refreshed. `pnpm audit --prod`: **25 before** (6 high, 14 moderate, 5 low), **20 after** (6 high, 9 moderate, 5 low); `pnpm audit`: 26 before, 21 after. The rest are in build and dev-server tooling, listed in DEFERRED.
- **F4 (Low), Dependabot:** fixed (`51533a8`). `.github/dependabot.yml` asks for weekly version updates for npm (the root, minor and patch grouped) and for GitHub Actions, with security updates grouped the same way. Dependabot alerts and security updates are repository settings, the maintainer's to change; the maintainer had both turned on on 2026-11-01. Its PRs run no CI (there is no `pull_request` trigger), so the gates are run locally before one is merged.
- **F5 (Low, docs), `v-html`:** fixed (`ce8e925`). Technical details (and `docs/technical-details.md`) says Drafter's own code has no `v-html`, and that Nuxt UI's palette, which does, has its label slot replaced with text. A test did pin it already (`apps/web/e2e/palette.spec.ts`, "shows a scene named like HTML as text": `<img src=x onerror=alert(1)>` in a scene heading, no `img` in the palette, no dialog); it now also searches for a word inside the tag, checks the label's text exactly, and says what it pins.
- **F6 (Info), HSTS:** no change; DEFERRED names it as a known limit (`0bf6f5f`).
- **F7 (Info), CI tokens:** fixed (`9dc758f`). The Linux, Windows, and Mac jobs check out with `persist-credentials: false`, as `publish` did. `desktop.yml` is the only workflow; it was already `permissions: contents: read` at the top, with `contents: write` on `publish` alone, which makes the release.
- **F8 (Info), unsigned updates:** no change; DEFERRED names it as a known limit (`0bf6f5f`).
- **F10 (Info), updates on the web:** fixed (`0f1a0e0`). The README, What is Drafter?, Why Drafter, and Technical details say the web app updates when you reload, or the next time you open it after closing every Drafter tab.

Gates, run on the branch after the last fix: `pnpm check`; the clean build (`rm -rf packages/*/dist; NETLIFY=true pnpm build`); the package and module tests (2,669 passed, 2 skipped); the trap suite (400 passed); the web typecheck; the web unit tests (2,255 passed); the web e2e on all five projects (4,971 passed, 1,276 skipped, and 3 that failed under the whole suite's load and passed alone: `scripts.spec.ts:431` on WebKit, `focus.spec.ts:243` and `notes.spec.ts:227` on the phone); the desktop unit tests (437 passed, 3 skipped); and the desktop e2e (134 passed, 2 skipped).

Still open: HSTS and signed updates (F6, F8), what the drop grant still trusts, and the advisories left in tooling, all in [DEFERRED](DEFERRED.md#security-audit-1-november-2026).
