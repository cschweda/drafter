# Desktop spike: Electron vs Tauri on Linux

Date: 2026-10-26/27. Branch: `spike-desktop` (throwaway, from v0.3.0), commits `92ce728`, `19a11aa`, `fbe06e1`.
Code: `spike/desktop/` (bench, electron, tauri, adapters) and `.github/workflows/spike-desktop.yml` (it runs only on pushes to `spike-desktop` and on `workflow_dispatch`).

The CI runs, all green:

- Run 1: https://github.com/cschweda/drafter/actions/runs/40434063807 (first pass; it found a Tauri CSP bug)
- Run 2: https://github.com/cschweda/drafter/actions/runs/40435230635 (CSP fixed; two runs per shell, plus Tauri variants)
- Run 3: https://github.com/cschweda/drafter/actions/runs/40438337281 (the same again, plus startup timed with no driver attached)

Artifacts from each run: `electron-results` and `tauri-results` (JSON and screenshots), and `electron-installers` and `tauri-installers` (AppImage and .deb files, kept for 7 days).

## Setup

- **The app:** `apps/web` built unchanged (`NETLIFY=true pnpm build`), so the static output and its CSP are exactly what drafter.dev serves. Nothing in `apps/web` was changed.
- **Electron 45.0.0** (Chromium 156, Node 24) packaged with electron-builder 26.18. The pages come from a privileged `app://drafter/` scheme registered with `protocol.handle` (standard, secure, supportFetchAPI, corsEnabled). The CSP from `_headers` is sent as a response header. The window uses `contextIsolation` and `sandbox`, and a preload bridge exposes a few named IPC calls. The app was driven with Playwright 1.64.1 `_electron.launch`, against the **packaged** `linux-unpacked/drafter` binary.
- **Tauri 2.12** (CLI 2.12.4, tauri 2.12.5, tauri-plugin-dialog 2.8.3) built in release mode with LTO and strip. The app is embedded through `frontendDist` and served from `tauri://localhost`. It ran on **WebKitGTK 2.52.6** (`libwebkit2gtk-4.1-0 2.52.6-0ubuntu0.24.04.1`) on Ubuntu 24.04.5, driven by `tauri-driver` + WebKitWebDriver + WebdriverIO 10.1. **Tauri automation worked.** Nothing had to fall back to partial measurement.
- **One harness for both** (`spike/desktop/bench/bench.js`, injected into the page):
  - **Keystroke time:** from `keydown` to the end of the next frame (requestAnimationFrame, then a MessageChannel task).
  - **Long tasks:** a `longtask` PerformanceObserver, which only Chromium has. Because WebKit lacks it, an engine-neutral **heartbeat stall** counter (a 10 ms timer with a gap over 60 ms) and rAF frame gaps were recorded in both shells.
  - **Startup:** `bench/startup.js` runs at document start in both shells (the Electron preload, and a Tauri `initialization_script`). It also records CSP violations.
- **The script:** the e2e test's 120-page fixture (`apps/web/e2e/script.spec.ts`): the sample from `# Act One` on, repeated 85 times. That is 206,295 characters, which made 122 pages in Electron and 123 in WebKit. It was pasted in one paste, and 200 characters were typed at the very start of the script (the worst place to type), one every 60 ms.
- **The machine:** ubuntu-latest x64 under `xvfb-run` at 1600x1000x24. There is no GPU, so both shells render in software.

## Results

The numbers are ranges over the 4 measured runs per shell in runs 2 and 3 (run 1's Tauri numbers were taken with broken styles, see "What broke" item 1).

| Measure | Electron 45 | Tauri 2.12 / WebKitGTK 2.52.6 (default) | Tauri + `WEBKIT_DISABLE_COMPOSITING_MODE=1` |
|---|---|---|---|
| **Typing, 120 pages, real key events**: keydown to next frame, p50 / p95 / max | **16.1–17.7 / 47.5–49.3 / 53–109 ms** | 77–92 / 192–209 / 417–522 ms | 31–33 / 46–49 / 320–337 ms |
| Long tasks over 50 ms while typing 200 keys (Chromium API) | 1–3 per run, max 120–146 ms | n/a (WebKit has no API) | n/a |
| Heartbeat stalls over 50 ms (both engines) | 5–10, max 146–199 ms | 34–40, max 297–336 ms | 7–9, max 320–324 ms |
| Frame interval while typing, p50 / p95 | 16.7 / 16.8 ms | 48–51 / 80–87 ms | 15 / 35 ms |
| Typing in-page (`execCommand`, no driver), 120 pages, p50 / p95 | 15.6–17.5 / 32–48 ms | 98–100 / 124–130 ms | 29–30 / 39–40 ms |
| Baseline: typing into the 3-page sample, p50 / p95 | 9–11 / 17–18 ms | 14–16 / 27–31 ms | 12–13 / 17–19 ms |
| Idle frame interval, p50 | 16.7 ms | 16 ms | 6 ms |
| **Script pane**: paste to 110+ pages drawn, nothing "Updating" | **242–284 ms** (122 pages) | 442–457 ms (123 pages) | 401–405 ms |
| **PDF export** of the 120-page script (export worker, font fetches) | **788–929 ms**, valid `%PDF-`, 255 KB | 1,121–1,282 ms, valid, 257 KB | 1,121–1,179 ms |
| **Startup**, process start to pages drawn, no driver, 5 launches | **294–500 ms** (500 is the cold first visit) | **26–31 s with no D-Bus session bus**; 1.17 s under `dbus-run-session` | 0.6–1.1 s (with a D-Bus session) |
| Navigation to ready (in-page) | 279–415 ms | 422–549 ms | 386–394 ms |
| **Persistence** (type, quit, relaunch) | Restored (IndexedDB in `userData`). `navigator.storage.persisted()` is `true` | Restored (`~/.local/share/dev.drafter.spike/storage`). `navigator.storage.persist`/`persisted` are **missing**, so the app shows "This browser may clear your recovery copy" | same |
| Memory (RSS summed over the process tree), sample / 120 pages | 744–746 / 1,030–1,058 MB (6 procs) | 763–789 / 1,023–1,050 MB (3 procs) | 567–569 / 790–800 MB |
| **File dialogs**: IPC path with a stubbed dialog, a write to disk, and a refusal of a path that was never granted | Pass. `dialog.showOpenDialog`/`showSaveDialog` are functions. A real GTK open dialog appeared under Xvfb and Escape cancelled it (`{"canceled":true}`) | Pass, through the app's own Rust commands and tauri-plugin-dialog. A real GTK dialog appeared and Escape closed it | same |
| File System Access API | **Present** (`showOpenFilePicker`/`showSaveFilePicker` exist in Electron's Chromium) | Absent | Absent |
| Service worker | `register()` succeeds, the worker goes `installing` → `redundant` (precache fails), no controller | `register()` throws `TypeError: ... protocol is either HTTP or HTTPS` | same |
| Module workers, IndexedDB, secure context, CSP | All work. The CSP is applied as a header with 0 violations | All work after the style-src fix (0 violations). Before the fix there were 12 | same |
| **AppImage** | **127.2 MB** | **82.6 MB** (bundles WebKitGTK and GStreamer) | |
| **.deb** | **102.3 MB** (290.6 MB unpacked; the binary alone is 224 MB) | **3.8 MB** (7.5 MB installed). It depends on `libwebkit2gtk-4.1-0` and `libgtk-3-0` | |
| **Packaging time** (AppImage + deb) | **82–100 s** (`npm ci` takes about 5 s) | **203–252 s** cold release build (no cache), plus about 30 s of extra apt packages. An incremental rebuild takes 62–65 s | |
| CI job wall time, run 1 (one measurement) | **4 min 18 s** | **8 min 3 s** (including about 20 s for the `cargo install tauri-driver` that tests need) | |
| AppImage launch smoke test (15 s under Xvfb) | Started, both with Ubuntu 24.04's `apparmor_restrict_unprivileged_userns=1` and with it lifted | Started | |

### Rendering correctness

The screenshots are in the results artifacts: `*-sample-root-*.png` is the X root window, `*-sample-*.png` is the driver's capture, `*-long-*.png` is the 120-page script, and `*-native-dialog-*.png` is the GTK picker.

After the CSP fix, both shells draw the same:

- Courier Prime in the editor and on the pages
- Inter Tight in the chrome
- the same syntax colours
- the title page and the page breaks
- the Lucide icons

The differences are small:

- WebKitGTK's Inter Tight has slightly wider letter spacing.
- Electron shows its default menu bar (File, Edit, View, Window) until a menu is set.
- Tauri shows the "may clear your recovery copy" banner, and "Recovery copy: may be cleared" in the status bar.

`tauri-sample-root-default-csp.png` (run 2 and run 3) shows what Tauri's default CSP handling does: a blank, unstyled editor and missing icons.

## What broke, and what it would take

1. **Tauri, the CSP (fixed in the spike).** Tauri rewrites the CSP and adds hashes and nonces for its own injected scripts and styles. Once `style-src` holds a nonce or hash, browsers **ignore `'unsafe-inline'`**. That blocked the `<style>` elements that CodeMirror (style-mod) and Nuxt Icon inject: 12 `style-src-elem` violations, an editor with no styles and no visible text, and blank icons. The fix is `"dangerousDisableAssetCspModification": ["style-src"]` in `tauri.conf.json`. Electron sends the site's CSP unchanged and had 0 violations.
2. **Tauri, startup takes 26–31 s without a D-Bus session bus.** The page itself is ready about 0.4 s after navigation. The process spends about 30 s before navigating, which is a D-Bus timeout (the AT-SPI/portal lookups; the log shows `org.a11y.Bus was not provided`). Setting `NO_AT_BRIDGE=1` did not help, and `dbus-run-session` did (1.17 s). A normal desktop session always has a bus, so writers would rarely hit this. Containers, minimal window managers, and CI do hit it. Electron had no bus either and started in 0.3–0.5 s.
3. **Tauri, slow typing in WebKitGTK's compositing mode without a GPU.** With the defaults, every keystroke in the 120-page script cost about 80–100 ms (p50) and frames ran at about 50 ms. The 3-page sample was fine, at 14–16 ms. `WEBKIT_DISABLE_COMPOSITING_MODE=1` brought typing to 31–33 ms p50 and 46–49 ms p95, which is close to Electron's p95 but about twice its p50. On real hardware with a GPU, the default mode may do much better; CI can't show that. This is the known WebKitGTK risk: rendering depends on the Mesa/NVIDIA/DMABUF stack on each writer's machine, and Tauri apps commonly ship env-var workarounds such as `WEBKIT_DISABLE_DMABUF_RENDERER` and `WEBKIT_DISABLE_COMPOSITING_MODE`. Chromium's rendering in Electron is the same one Drafter's e2e suite already tests.
4. **Tauri, `navigator.storage.persist()` and `persisted()` are missing in WebKitGTK.** The app's storage-health check therefore warns that the recovery copy may be cleared. The data was in fact persisted and restored. A desktop build needs to tell the app that it is a desktop shell (a build-time or runtime flag), so the warning is skipped. Electron reports `persisted: true`, and the app says "kept in this browser".
5. **The service worker in both shells.** It is useless on the desktop, because the files are local, and it fails in different ways in each shell (see the table). Neither failure broke the app or threw a page error. A desktop build should not register it. A build-time flag that skips `plugins/service-worker.client.ts` is the one `apps/web` change a desktop build needs, together with the "desktop" flag in item 4.
6. **Electron has the File System Access API.** The brief expected it to be absent in both shells. In fact Chromium's pickers exist in Electron, so the app's `browserFiles` already opens and saves in place through native dialogs; the spike's PDF export check had to hide the pickers, as `e2e/fs-stub.ts` does. That is a free fallback, but a desktop build should still install a path-based `FileAccess` adapter. Paths survive a relaunch without permission prompts, and handle permission persistence in Electron needs session permission handlers.
7. **The harness.** Playwright's `waitForFunction` compiles its predicate in the page, and the app's CSP has no `'unsafe-eval'`, so it timed out. Polling with `evaluate` fixed it. The WebDriver round trip per key made the Tauri real-key run take 19.9 s of wall time against 13.6 s for Electron. The latency is measured in the page from `keydown`, so that overhead isn't in the numbers.
8. **The Electron AppImage started even with the 24.04 user-namespace restriction on.** I did not check whether the Chromium sandbox was active in that run (electron-builder's launcher may fall back). Check this before shipping an AppImage, because some Electron AppImages need an AppArmor profile or `--no-sandbox` on 24.04+.

## FileAccess adapter sketches

The full files are `spike/desktop/adapters/electron-files.ts` and `spike/desktop/adapters/tauri-files.ts`. In both, `FileRef` is `{ name, path }`. It is plain data, so Dexie's `handles` table keeps it unchanged, and `canSaveInPlace` is always true. The native side keeps the set of paths the writer picked and refuses any other path; the spike tested this with `/etc/passwd`. `setFiles(adapter)` installs the adapter at startup.

**Electron:** the preload bridge maps to `ipcMain.handle` handlers that the spike tested.

```ts
// preload.cjs: contextBridge.exposeInMainWorld('drafterDesktop', { pickToOpen, pickToSave, read, write, ... })
export const electronFiles: FileAccess = {
  canSaveInPlace: true,
  pickToOpen: () => bridge().pickToOpen(),               // main: dialog.showOpenDialog → fs.readFile → { ref:{name,path}, bytes, lastModified }
  pickToSave: (name, kind) => bridge().pickToSave(name, kind), // main: dialog.showSaveDialog with filters per kind
  read: (ref) => bridge().read(ref),                     // ENOENT → FileGoneError
  write: (ref, data) => bridge().write(ref, data),       // main: write temp + rename
  fromDrop: (item) => /* webUtils.getPathForFile(file) via preload */,
  permission: (ref, ask) => bridge().regrant(ref),       // re-grant a stored path after relaunch
  sameFile: async (a, b) => a.path === b.path,
  download: (name, data, type) => pickToSave → write,    // no Downloads-folder fallback needed
};
```

Uint8Array crosses Electron IPC by structured clone, so a PDF goes through unchanged.

**Tauri:** the app's own Rust commands, which the spike tested: `pick_to_open`, `pick_to_save`, `read_file`, `write_file`, `dialog_info`.

```ts
import { invoke } from '@tauri-apps/api/core';
export const tauriFiles: FileAccess = {
  canSaveInPlace: true,
  pickToOpen: () => invoke('pick_to_open'),                       // Rust: app.dialog().file().blocking_pick_file()
  pickToSave: (suggestedName, kind) => invoke('pick_to_save', { suggestedName, kind }),
  read: (ref) => invoke('read_file', { fileRef: ref }),
  write: (ref, data) => invoke('write_file', { fileRef: ref, text }), // bytes: tauri::ipc::Response / raw body, not JSON
  fromDrop: async () => null,                                     // WebKitGTK gives no path; use Tauri's onDragDropEvent (paths)
  permission: (ref, ask) => invoke('regrant', { fileRef: ref, ask }),
  sameFile: async (a, b) => a.path === b.path,
  download: (name, data, type) => pick_to_save → write,
};
```

The alternative is `@tauri-apps/plugin-dialog` plus `plugin-fs` from JavaScript. The dialog plugin adds picked paths to the fs scope by itself. That is less Rust, but the page then gets a broader filesystem API.

In both shells the adapter is about 60 lines of TypeScript. On the native side it is about 80 lines of JavaScript (Electron) or Rust (Tauri). Tauri's version is a little more ceremony, and binary data needs `tauri::ipc::Response` to avoid JSON number arrays.

## The modules folder at runtime

Today a module is TypeScript and Vue, compiled in at build time, and it runs in the app's main world with the full `ModuleContext`. A desktop build could load extra modules from a user folder (for example `~/.config/Drafter/modules/<id>/`). Done safely, it would look the same in both shells:

1. **Load compiled ESM, and keep the build out of the app.** A module folder holds a prebuilt `index.js`. A `drafter module build` CLI would compile it, and both TypeScript and `.vue` need compiling. The host exposes `vue` and the module types at stable URLs through an import map, because Nuxt's chunk names are hashed, so a build-time re-export such as `/_drafter/vue.js` is needed.
2. **Serve modules from their own origin, not the app's.**
   - Electron: a second privileged scheme, `drafter-module://<id>/…`, handled by `protocol.handle`. It resolves only inside that module's folder, as the spike's `app://` handler does, and sends a strict per-module CSP: `connect-src` is exactly the module's `permissions.network`, which Drafter's existing consent flow already collects. `session.webRequest.onBeforeRequest` can also enforce the network list for that origin.
   - Tauri: `register_asynchronous_uri_scheme_protocol("drafter-module", …)`, which does the same path confinement and per-module CSP. Tauri's capability system (`windows`/`webviews`/`remote` URLs) keeps the IPC commands away from that origin by default.
3. **Isolate them.** Today's in-process model gives a module everything the page has, and on the desktop that includes the file bridge. A safe runtime loader would run each module in a sandboxed iframe (`sandbox="allow-scripts"`) on its own origin. The `ModuleContext` would cross `postMessage` as an RPC layer, and tabs and settings components would render inside the iframe.
   - Electron: the preload doesn't run in subframes (`nodeIntegrationInSubFrames: false`), so `drafterDesktop` is never exposed to module frames.
   - Tauri: IPC from an origin that no capability lists is refused.
   - In both: hash the module's files when the writer turns it on, and ask again when the hash changes, as Drafter already does when a module declares new network origins.
4. **The engine matters here.** In Electron, every module runs in the same Chromium on every OS. In Tauri, a module author must test on WebKitGTK, WebView2 (Chromium), and WKWebView.

Both shells can do this safely, with the same amount of work. Neither shell gives isolation for free.

## Auto-update

- **Electron (electron-updater with GitHub Releases).** electron-builder publishes the installers plus `latest-linux.yml` to a GitHub Release, using `GH_TOKEN` in CI. `autoUpdater.checkForUpdatesAndNotify()` downloads, checks the sha512 in the yml, and installs on quit.
  - Linux: AppImage updates itself in place. deb and rpm are supported in current electron-updater, by downloading and installing through `pkexec`.
  - Windows: NSIS, with differential (blockmap) downloads.
  - macOS: zip and dmg; the app **must be signed** for Squirrel.Mac.
  - This fits Drafter's release process (tag + GitHub Release per plan) directly. The cost is a larger download per update, about 100 MB on Linux, less with blockmap deltas.
- **Tauri (tauri-plugin-updater).** Every update needs a **mandatory Tauri signature**: generate a minisign keypair with `tauri signer generate`, ship the public key in the config, and keep `TAURI_SIGNING_PRIVATE_KEY` as a CI secret. The endpoint is a static JSON file, and `tauri-action` writes `latest.json` to the GitHub Release.
  - Linux: the AppImage is the documented update target. I did not verify current deb/rpm support in this spike.
  - Windows: NSIS/MSI. macOS: `.app.tar.gz`.
  - Updates are small: about 4–8 MB for the binary, though the AppImage is 83 MB.
- Both fit GitHub Releases. Electron needs no extra key on Linux and Windows. Tauri needs a signing key that must never be lost, because losing it strands every installed copy.

## Code signing per OS

- **Linux:** neither shell needs signing. Options:
  - GPG-sign the AppImage (both shells support it),
  - sign an apt repository if one is ever hosted,
  - Flathub, if Drafter goes there.
- **Windows:** signing is needed to avoid SmartScreen warnings, in both shells.
  - The cheapest current route is Azure Trusted Signing (a monthly subscription; it needs a verified identity).
  - An OV or EV certificate on a hardware token or in a cloud HSM also works. EV no longer bypasses SmartScreen reputation instantly.
  - Both electron-builder and Tauri support signtool or a custom sign command.
  - Tauri additionally depends on WebView2: it is preinstalled on Windows 10/11, and the bootstrapper can be embedded.
- **macOS:** both shells need an Apple Developer ID ($99/yr), plus hardened runtime and notarization, or Gatekeeper blocks the app.
  - electron-builder signs, and notarizes through `@electron/notarize`.
  - The Tauri bundler signs and notarizes when `APPLE_*` env vars are set.
  - Electron also needs entitlements for its JIT. Electron's updater needs the signature; Tauri's updater needs its own key as well.

Signing is the same burden in both shells and does not decide the choice.

## Recommendation

**Electron.** The maintainer's lean holds up under measurement. It is not just a preference for having Chromium everywhere:

- **Typing on the 120-page script:** Electron's median keystroke is 16–18 ms. Tauri's default WebKitGTK is 77–92 ms. Even with the compositing workaround, Tauri is 31–33 ms, with fewer frames on time and longer worst-case stalls (320 ms against 146–199 ms).
- **Every other measure:** the Script pane redraw is 1.6x faster, the PDF export 1.4x, and startup 0.3–0.5 s against 1.2 s (or 30 s without a session bus). Persistence works in both shells, and so do dialogs, IndexedDB, and the workers.
- **What Tauri needed:** three Linux-specific workarounds before it behaved — the CSP `style-src` exemption, a desktop flag for the missing `navigator.storage.persist`, and a WebKitGTK rendering env var — and it would bring two more engines on Windows (WebView2) and macOS (WKWebView).
- **What Electron needed:** a scheme handler, and the same service-worker flag that both shells need.
- **Where Tauri wins:** size (a 3.8 MB .deb against 102 MB; an 83 MB AppImage against 127 MB), fewer processes, and lower memory in its software-compositing mode. Those are real advantages, but they don't outweigh the measured typing gap and the engine spread for a writing app whose main job is to type smoothly in a long script.

**Caveat:** CI has no GPU. Tauri's default compositing mode should be checked on one or two real Linux desktops, one Intel/AMD and one NVIDIA, before ruling it out entirely. Nothing measured here favours Tauri on anything except size.

**Next steps if Electron is chosen (Plan 6):**

- Keep the `app://` scheme handler with the site's CSP as a header.
- Add a build-time `DRAFTER_DESKTOP` flag that skips the service worker and the storage-persistence warning.
- Ship the path-based `FileAccess` adapter over the preload bridge.
- Set a real menu.
- Package an AppImage and a .deb through electron-builder, with electron-updater on GitHub Releases.
- Verify the Chromium sandbox on Ubuntu 24.04+.
