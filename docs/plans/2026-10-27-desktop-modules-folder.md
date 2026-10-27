# The desktop modules folder — Implementation Plan

**Goal:** A writer using the desktop app adds a script module without rebuilding Drafter: they drop a folder into their Drafter folder's `modules` folder and restart (the maintainer's ask: "drop them into a /modules folder and restart the app"). The module is listed in Settings → Modules, off until turned on, and runs isolated from Drafter, the writer's files, other modules, and the network.

**Spec:** [`docs/drafter-desktop-design.md` §6](../drafter-desktop-design.md#6-script-modules-from-a-folder) (approved). Everything marked **Call** below is the builder's, recorded in `docs/DECISIONS.md` (apps/desktop, 2026-10-27).

**Architecture:** The main process reads `<userData>/modules` once at start and serves each valid module's folder at its own privileged scheme origin, `drafter-module://<id>/`, with a strict CSP. The editor's page (app://drafter) gets the list through the preload bridge and turns each folder module into an ordinary `ScriptModule` whose parts are proxies: its button, commands, tab, and settings run inside `<iframe sandbox="allow-scripts">` frames on that origin, and the module's calls cross `postMessage` as a small RPC answered by the same `ModuleContext` a compiled-in module gets. drafter.dev's build has no bridge, so it has no folder modules and none of this runs.

**Tech stack:** what is there already (Electron 45 `protocol.handle`, `webRequest`, `will-frame-navigate`; Vue 3.5; Vitest; Playwright's Electron driver). **No new dependencies.**

## Global constraints

- Branch `modules-folder` from `main` at v0.5.0. Not pushed, merged, or tagged by the builder.
- The compiled-in modules (`modules/<id>/index.ts`) stay exactly as they are, and so does their API.
- drafter.dev is unaffected: its build has no `window.drafterDesktop`, so `folderModules` stays empty; its CSP (`apps/web/scripts/csp.mjs`) is not changed. The `frame-src` the desktop needs is added by the desktop shell to the policy it sends on app://.
- The existing desktop security model stays: the app window sandboxed and context-isolated; the preload runs in the main frame only (`nodeIntegrationInSubFrames: false`); permissions deny-by-default; the `webRequest` backstop refuses every network request a page makes, except (new) a module frame's request to an origin the writer agreed to.
- Clean room; plain-English UI wording; no new axe tests; conventional commits with no AI attribution.

## 1. The folder module format

A folder module is a folder in the modules folder:

```
~/.config/Drafter/modules/          (Linux: app.getPath('userData') + '/modules')
  tidy/
    module.json                     who it is: read without running any code
    index.js                        the module: a built ES module (no bare imports)
    …                               anything else index.js imports or fetches, served from this folder only
```

`module.json`:

```json
{
  "id": "tidy",
  "name": "Tidy",
  "description": "Finds spaces at the ends of lines, and removes them when you ask.",
  "permissions": { "network": [] }
}
```

`index.js` default-exports the module description:

```js
export default {
  id: 'tidy',                                    // must equal module.json's id
  action: { label: 'Tidy', async run(ctx) { … } },              // the toolbar button
  commands: [{ id: 'trim', title: 'Tidy: remove spaces at line ends', async run(ctx) { … } }],
  tab: { id: 'tidy', label: 'Tidy', mount(root, ctx) { …; return () => {} } },
  settings: { mount(root, ctx) { … } },
};
```

- **Call: identity in `module.json`, code in `index.js`.** Settings must show a module's name, description, and network origins *before* the writer turns it on, and "off until turned on" means its code hasn't run. So what consent needs is static JSON the main process reads; `index.js` runs only once the module is on. The export repeats `id`, and a mismatch is refused, so a folder can't pair one module's description with another's code. This differs from §6's "an `index.js` that default-exports a `ScriptModule`" in form only: the export is the folder counterpart of `ScriptModule` (§2 below).
- **Call: a folder module's icon is always the puzzle (`i-lucide-puzzle`).** Icons are bundled at build time and the page can fetch none, so a folder module can't name its own.
- `commands` is a list, not a function of the context: each run is handed its own context (as the compiled-in host already does by calling `commands(ctx)` afresh per run).
- A tab and a settings section are DOM, drawn by the module into a root element inside its own frame (`mount(root, ctx)`, which may return a function that unmounts). No Vue is offered: a folder module brings whatever it was built with, bundled into `index.js`.

**Valid**, checked by the main process at start (`apps/desktop/src/module-folder.ts`, pure): a directory (a symlink to one is allowed: the writer put it there) holding a `module.json` of at most 64 KB that parses to an object with an `id` (lowercase letters and digits joined by single hyphens, at most 63 characters, so it is a valid host name), a `name` and `description` (text, at most 80 and 400 characters), and `permissions` (an object; `network`, if present, a list of at most 16 origins, each `https://host[:port]` or `http://localhost`/`http://127.0.0.1[:port]`, written as an origin and nothing more), and an `index.js` that is a regular file inside the folder (its real path checked). At most 50 modules are read. **Malformed** ones are skipped with a message naming the folder — `Drafter skipped the folder “broken”: its module.json has no name.` — logged by the main process and listed in Settings → Modules. Two folders with the same id: the second is skipped, naming both. An id a compiled-in module already has is skipped by the page (it alone knows the built-in ids), naming the folder.

**Loading at start.** The folder is read once, when the app is ready, before the window opens; the list is fixed for the run (restart to add, remove, or update one), so the scheme serves exactly the folders listed.

## 2. The author's API (inside the frame)

The module's code runs in its frame with a context that is the asynchronous, message-shaped counterpart of `ModuleContext`. Every call is a message to the page, answered by the module's `ModuleContext` there:

| In the frame | Answered by | Notes |
| --- | --- | --- |
| `await ctx.source()` | `source()` | the text |
| `await ctx.doc()` | `toJSON(doc())` | **serialised**: `DocJSON` v1 (as `drafter build --json` writes), blocks with `kind`, `span`, `lines`, `sem`; no lazy getters, no `regions` |
| `await ctx.layout()` | `layout()` | plain data already (`pages`, `index`, `diagnostics`), or `null` |
| `await ctx.layoutFailed()`, `template()`, `title()`, `kind()`, `cursor()` | the same | plain data |
| `await ctx.applyChanges(changes)` | `applyChanges` | one undoable change; rejects with the host's message where the host throws |
| `await ctx.setProblems(items)` | `setProblems` | |
| `await ctx.goto(offset)`, `await ctx.openTab()` | the same | |
| `await ctx.confirm(message, options)` | `confirm` | Drafter's own dialog, headed with the module's name |
| `await ctx.storage.get/set/remove` | `storage` | `module:<id>:<key>` in the app's settings table; values must be JSON |
| `await ctx.notify(message)` | `notify` | |
| `ctx.onChange(cb)` → stop | pushed by the page | for a tab or settings: called (at most every 250 ms) when the script, its layout, or the open script changes |

A button's or a command's run gets a context bound to that run (the page answers its calls with `runContextFor(module)`, so the stale-run rules hold exactly as for compiled-in modules); a tab's and settings' calls are answered by `contextFor(module)`.

## 3. Isolation: each module in its own frame

**Frames.** For a module that is on, the page keeps up to three frames, each loading `drafter-module://<id>/?surface=<surface>`:

- `background`: hidden; loaded while the module is on; runs the button and the commands, and reports the module's parts (`ready`: the button's label, the tab's id and label, the commands' ids and titles, whether it has settings). Until it is ready the module has no button, tab, or commands.
- `tab`: inside the module's tab panel, filling it; drawn afresh when another script opens (as compiled-in tabs are).
- `settings`: inside the module's section of Settings → Modules, sized to its content (the frame reports its height, clamped to 800 px).

Each is `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" allow="">`. Without `allow-same-origin` the frame's origin is **opaque**: it has no cookies, no `localStorage`, no IndexedDB, and can't reach any other frame's DOM. Without `allow-popups`, `allow-top-navigation`, `allow-forms`, `allow-modals`, it can't open windows, navigate the app, submit forms, or show `alert`. The URL's host still names the folder, which is how the main process knows what to serve.

**The scheme.** `drafter-module` is registered privileged (standard, secure, fetch, CORS-enabled; not `bypassCSP`) and handled by `moduleHandler` (pure, unit-tested):

- `/` → a small page made by the main process: the base styles, a root element, and `<script type="module" src="/__drafter__/runtime.js">`.
- `/__drafter__/runtime.js` → the frame runtime (`apps/desktop/src/module-runtime.ts`, built by tsdown to `dist/module-runtime.js`, packaged with the app).
- anything else → that file under the module's folder: the same path rules as app:// (`..`, encoded separators, NULs, empty segments, drive letters refused before and after decoding), the real path checked to be inside the folder's real path (a symlink that leaves the folder is a 404), GET and HEAD only, at most 20 MB, a content type by extension, `X-Content-Type-Options: nosniff`, and `Access-Control-Allow-Origin: *` (an opaque origin's module scripts are CORS requests).
- an unknown host → 404.

**The frame's CSP** (sent on its page): `default-src 'none'; script-src drafter-module://<id>; style-src drafter-module://<id> 'unsafe-inline'; img-src drafter-module://<id> data: blob:; font-src drafter-module://<id>; connect-src drafter-module://<id> <agreed origins>; base-uri 'none'; form-action 'none'; frame-ancestors app://drafter; sandbox allow-scripts`. So a module can load only its own folder's code, can fetch only its folder and the origins the writer agreed to, can't frame or be framed by another module, and is sandboxed even if the attribute were dropped.

**The app page's CSP** gets `frame-src drafter-module:` added by the desktop shell (main.ts), and nothing else changes.

**Navigation.** `guard` (window.ts) allows a sub-frame navigation to `drafter-module://<id>/` only for an id that was loaded and only when the app page started it (the initiator is an app:// frame); a module frame can't navigate itself, or its frame, anywhere (another module's origin included). The main frame never navigates to the scheme.

**The bridge.** The preload runs only in the main frame, so a module frame has no `window.drafterDesktop`, and the IPC handlers already refuse senders that aren't app:// frames. `window.parent` is cross-origin from the frame, so `parent.document`, `parent.drafterDesktop`, and the app's storage are out of reach.

## 4. The RPC

`apps/web/app/modules/folder-protocol.ts` (pure; imported by the page and by the frame runtime) defines the messages; `folder-rpc.ts` (pure) answers them against a `ModuleContext`; `folder-channel.ts` (pure) is one frame's end in the page.

Frame → page: `{ drafter: 1, kind: 'ready', parts }`, `{ drafter: 1, kind: 'call', id, run?, method, args }`, `{ drafter: 1, kind: 'done', run, error? }`, `{ drafter: 1, kind: 'failed', error }`, `{ drafter: 1, kind: 'size', height }`.
Page → frame: `{ drafter: 1, kind: 'init', theme }`, `{ drafter: 1, kind: 'reply', id, ok, value | error }`, `{ drafter: 1, kind: 'run', run, what: 'action' | 'command', command? }`, `{ drafter: 1, kind: 'changed' }`.

- **Source checks.** The page takes a message only when `event.source` is that frame's `contentWindow` and `event.origin` is `'null'` (opaque); the runtime takes one only when `event.source` is `window.parent` and `event.origin` is `app://drafter`. A module can `postMessage` another module's frame (`parent.frames[i]`), but that frame's runtime ignores it; and a module posting to the page is heard only as itself.
- **Capability scoping.** Each frame's channel answers with its own module's context only, so storage is that module's rows, problems are that module's, and a run's calls go to that run's context. The method list is closed (§2); anything else is refused (`Drafter has no “x”.`).
- **Arguments** are checked by method: `applyChanges` a list of at most 10 000 `{ from, to, insert }`; `setProblems` at most 5 000 items (the host already cleans each); text arguments at most 2 000 characters (`notify` and `confirm`); storage keys text of at most 200 characters, values JSON of at most 1 MB. Anything else is refused with a message naming what was wrong.
- **Size and flood limits.** A message over 4 MB (its JSON) is refused; at most 64 calls may wait at once per frame.
- **Timeouts.** A frame that hasn't said `ready` within 15 s is reported (`Tidy couldn’t start: it didn’t answer.`) and its parts never appear; a run that hasn't finished in 5 minutes is ended: the toast says it took too long, and its later calls are refused (`that run has ended`).
- **Errors.** A run that throws comes back as `done` with `error`, shown as the usual toast naming the module (`runModuleAction`). A module whose `index.js` won't load, or whose export is the wrong shape or the wrong id, sends `failed`, shown as a toast naming its folder.

## 5. Settings → Modules

The compiled-in modules are listed as now. Below them, in the desktop app only, **From your modules folder**:

- "Modules you add to Drafter's modules folder. Help → Open Modules Folder shows it; restart Drafter after adding one."
- The warning, plainly: "A module from this folder is code that Drafter didn't write and hasn't checked. It runs on its own, with only its own permissions, apart from Drafter and your files, but while it is on it can read the open script and change it. Turn one on only if you trust where it came from."
- Each module, off until turned on, with the same switch and the same network consent dialog as the compiled-in ones (the origins come from `module.json`; a module that later asks for more is off until agreed again, as today).
- What was skipped, one line per folder.

## 6. The network

A folder module asks for nothing by default and gets nothing: its CSP's `connect-src` is its own folder, and the `webRequest` backstop cancels every http(s)/ws(s) request a page makes. When the writer turns on a module that declares `permissions.network` and agrees, the page tells the main process (`modules.setNetwork(id, origins)`, awaited before the module's frames load); the main process keeps, per module id, the agreed origins that `module.json` also declares, adds them to that module's frame CSP, and lets its backstop pass a request **only** when the request's frame is that module's (`details.frame.url` on `drafter-module://<id>/`) and its origin is one of them. Turning the module off sets the list to none. Every other request from a page is refused as before.

## 7. Help → Open Modules Folder

A native Help item (`id: 'modules-folder'`, beside Open the Releases Page): it creates the folder if it is missing and shows it with `shell.openPath`. An unpackaged app run by the e2e suite writes the path to `DRAFTER_E2E_OPENED_FOLDER` instead.

## Threat model

| Threat | Closed by |
| --- | --- |
| A module reads or changes the app page (DOM, Vue state, the editor) | Cross-origin frame (opaque origin); preload not in sub-frames |
| A module reaches the file bridge (`drafterDesktop.files`) | No preload in sub-frames; `parent` is cross-origin; IPC handlers refuse non-app:// senders (`fromApp`) |
| A module reads the app's IndexedDB/localStorage (recovery copies, other modules' rows) | Opaque origin has no storage; module storage goes through the page, keyed `module:<id>:` |
| A module reaches another module (DOM, storage, files, messages) | Each frame opaque; CSP limits loads and fetches to its own folder; `frame-ancestors app://drafter`; runtimes ignore messages not from the app page; the page routes by `event.source` |
| A module sends the script over the network without consent | CSP `connect-src` + main-process backstop keyed by frame URL and agreed origins |
| A module serves or reads files outside its folder (`..`, encoded, symlinks) | `resolveModuleUrl` + real-path check, per request |
| A module navigates the app or itself elsewhere, opens windows, submits forms | sandbox flags; `will-frame-navigate` guard; CSP `form-action 'none'`; window-open handler |
| A module asks for permissions (camera, notifications…) | deny-by-default handlers (the requesting URL isn't app://) and `allow=""` |
| A module floods the page (huge messages, endless calls, a run that never ends) | 4 MB message cap, 64 calls in flight, argument limits, 5-minute run limit, 15 s start limit |
| A module's code runs before the writer agreed | identity in `module.json`; frames exist only while the module is on |
| A broken module breaks the app | skipped with a message at start; a frame's failure is a toast; `ModuleBoundary` around tab and settings |
| A module spoofs the page to another module | the runtime checks `event.source === parent` and the app origin |

**Not closed (stated in Settings and the README):** a module that is on can read the open script and change it, and one granted a network origin can send the script there. That is what turning it on means. CPU use by a frame is not limited.

## Tasks (TDD: each test first, watched failing)

1. **Plan** (this file). Commit.
2. **Main: the folder** — `module-folder.ts`: `readModulesFolder`, `resolveModuleUrl`, `moduleCsp`, `framePage`, `moduleHandler`. `test/module-folder.test.ts`: valid folder; each malformed case named; duplicate ids; index.js symlinked out; path traversal (`..`, `%2e%2e`, `%2f`, `\`, NUL, `//`); symlink escape at serve time; unknown host; CSP with and without origins.
3. **Main: network and navigation** — `refusesRequest` takes the frame's URL and a grants lookup; `moduleNavigation(url, initiatorUrl, known)`. Tests in `network.test.ts`, `window.test.ts`.
4. **Main: wiring** — scheme privileges, `protocol.handle`, CSP `frame-src`, IPC (`modules:list`, `modules:set-network`), Help → Open Modules Folder (`menu.ts`, `NATIVE_IDS`), preload `modules`, runtime entry in tsdown, electron-builder `files`, `check-asar` must-haves. Menu test first.
5. **Page: protocol and RPC** — `folder-protocol.ts`, `folder-rpc.ts`, `folder-channel.ts` with `test/folder-rpc.test.ts`: message reading and size cap; method allowlist; argument checks; doc serialisation; storage limits; run routing; in-flight cap; timeouts (fake timers); source checks.
6. **Page: folder modules as `ScriptModule`s** — `folder.ts` (`folderModuleOf`, the reactive list, network sync), registry/host using the reactive list, commands re-registered when parts arrive, `FolderModuleFrame.vue`, `FolderModuleRunners.vue`, ModulesSettings' folder section. `test/folder-modules.test.ts`.
7. **The frame runtime** — `module-runtime.ts`; unit-tested where pure (`readExport`).
8. **The example module and README** — `modules/from-a-folder/tidy/` and the README section.
9. **Desktop e2e** — `e2e/modules.spec.ts`: listed off with the warning; turned on, button/command/tab work; an edit is one undo; a malformed module reported; probes for `window.parent`, the file bridge, the app's IndexedDB, another module's origin, the network without consent (and with consent only the agreed origin); Help → Open Modules Folder.
10. **Docs** — DECISIONS, CHANGELOG, design §6 status line, the report.
