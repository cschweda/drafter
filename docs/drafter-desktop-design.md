# Drafter for the desktop — design (Phase 1, Plan 6)

*Drafter as an app you install on Linux, then Windows, then macOS: the same editor as drafter.dev, with real files, menus, and a modules folder.*

Status: approved by the maintainer, 2026-10-27: Electron (§2); the Linux app first as v0.4.0, with the modules folder (§6) in a follow-up release. Decided by the maintainer (2026-10-26): the desktop app is the last step of Phase 1's build, after the web app; Linux first, then Windows, then macOS once the $99 Apple developer account is bought; the choice between Electron and Tauri is made on evidence from a Linux test on GitHub's runners. Everything else marked **Call** is the builder's recommendation, open to change.

## 1. Why a desktop app

The web app already installs as a PWA, works offline, and saves in place in Chrome and Edge. A desktop build adds what a browser can't give every writer:

- **Saving in place everywhere.** Firefox and Safari can't write back to a file; a desktop app always can, on every OS.
- **A recovery copy no browser will clear.** The app's own profile isn't subject to Safari's seven-day eviction or "clear site data".
- **Opening a `.fountain` file by double-clicking it**, and recent files in the OS's own lists.
- **A modules folder** on disk, so a writer can add a script module without rebuilding Drafter (the maintainer's request: "drop them into a /modules folder and restart the app").

Non-goals: a different editor, accounts, sync through Drafter, or anything the web app can't also do except where a browser forbids it.

## 2. One app, two shells

The desktop app wraps **the same static build** as drafter.dev (`apps/web/.output/public`), loaded from the app's own files, never from the network. A new workspace package, `apps/desktop`, holds the shell: its main process, a preload script, packaging, and its tests. The web app learns it's in the desktop shell through one injected object (`window.drafterDesktop`), checked in one place, and otherwise behaves exactly as on the web.

- **Engine: Electron** (decided on the spike's evidence, 2026-10-26; report in `docs/desktop-spike.md`). On GitHub's Ubuntu runners, typing in a 120-page script took 16–18 ms per key (p50) in Electron against 77–92 ms in Tauri's WebKitGTK (31–33 ms with compositing turned off); the pages drew in 242–284 ms against 401–457 ms; PDF export 0.8–0.9 s against 1.1–1.3 s; startup under half a second against 1.2 s (30 s without a D-Bus session). Tauri also needed three Linux-only workarounds (its CSP rewriting blanked the editor; WebKitGTK has no `navigator.storage.persist()`; the D-Bus startup stall). Electron's cost is size: a 127 MB AppImage and a 102 MB `.deb`, against 83 MB and 3.8 MB. Electron runs the same Chromium the web app is tested hardest in, on every OS.
- **The shell:** Electron with electron-builder. Pages come from a privileged `app://drafter/` scheme (standard, secure, fetch-enabled) serving the static build, with the CSP from `_headers` sent as a response header. The window runs with `contextIsolation` and `sandbox`, and a preload script exposes a few named IPC calls. Chromium's sandbox must be confirmed active on Ubuntu 24.04+ (its user-namespace restriction), with an AppArmor profile in the `.deb` if needed.
- **One build flag** (`DRAFTER_DESKTOP=1`) makes the web build skip the service worker and the storage warning (the app's profile is never cleared), and installs the desktop `FileAccess`.
- **No service worker** in the desktop build: its files are local, and updates come from the updater (§7). The update prompt stays, fed by the updater instead.
- Electron also has the File System Access API, so the web build's own pickers would work there; the desktop adapter uses paths instead, which survive a restart without asking for permission again.
- **The content security policy** is applied by the shell (a response header on its own protocol, or a meta tag), the same policy as `_headers`, and still `connect-src 'self'`.

## 3. Files

A desktop `FileAccess` (`apps/web/app/storage/files.ts` is the only seam) replaces the browser's:

- `canSaveInPlace` is always true. `pickToOpen` and `pickToSave` are the OS's own dialogs; `read` and `write` go through the shell to the file system. A `FileRef` is the file's absolute path, which the projects table already stores structured-cloned.
- `permission` is always `granted`, so the "Check for changes" bar never appears; the changed-elsewhere check (§9.6 of the Phase 1 design) runs on open, on focus, and before Save, as on the web, reading the file's bytes and modification time. **Call:** also watch the open file (`fs.watch`) so a sync from another computer is noticed while the window is in front.
- Writes are atomic (write a temporary file beside it, then rename), keeping the file's line breaks and byte-order mark as today.
- **Opening from the OS:** double-clicking a `.fountain`, `.md`, or `.markdown` file, dropping one on the window or the dock icon, or `drafter script.fountain` on the command line opens it, through the same path as Open.
- **One window** (Call): the two-tab guard already handles a second window as read-only; Phase 1 keeps one window per app and focuses it when a file is opened again.

## 4. Menus and keys

The app menu bar (File, Edit, View, Go, Help; on macOS the app menu too) is built from the same command data the palette and the Keyboard shortcuts page use (`app/commands/data.ts`), so every menu item runs its registered command and shows its keys. The in-page Drafter menu stays. Global keys that the OS menu owns (Save, Open, New) go through the menu, never twice.

## 5. Closing and the recovery copy

Closing the window with changes not in a file asks first, in a native dialog ("Save", "Don't Save", "Cancel"), using the same `dirty` state as the web's leave warning. The recovery copy lives in the app's profile and is kept on quit.

## 6. Script modules from a folder

The compiled-in modules stay as they are. **Call (a follow-up release, v0.4.x, after the Linux app ships):** the desktop app also loads modules from a `modules` folder in the user's Drafter folder (`~/.config/Drafter/modules` on Linux, `%APPDATA%\Drafter\modules` on Windows, `~/Library/Application Support/Drafter/modules` on macOS), each a folder with a built `index.js` that default-exports a `ScriptModule`. They load at start (restart to add one), are listed in Settings → Modules **off until the writer turns them on**, with the network consent as today, and Settings says plainly that a module from this folder is code that runs with Drafter's permissions. A malformed one is skipped with a message naming its folder. **Help → Open Modules Folder** shows the folder. Because a module from a folder is code nobody reviewed, it runs isolated: each in a sandboxed `<iframe sandbox="allow-scripts">` on its own origin (`drafter-module://<id>/`), with `ModuleContext` crossing `postMessage` as a small RPC, so it never reaches the file bridge or the page. That is real work (the context's calls and a tab's component become messages), which is why it follows the first release.

## 7. Updates and distribution

- **Where:** GitHub Releases, from a tag, built by GitHub Actions (Linux first: an AppImage and a `.deb`; then Windows: an installer; then macOS: a notarized `.dmg`).
- **Updates (Call):** electron-updater with GitHub Releases (`latest-linux.yml`, sha512-checked); the AppImage updates in place. The app checks GitHub Releases once at start for a newer version and offers it with the same "A new version of Drafter is ready" prompt; it never updates by itself, and with unsaved changes asks as the web does. This is the one network request the desktop app makes; it is a setting (on by default) and the Privacy page says so. The `.deb` is updated by the writer (the prompt links to the release).
- **Signing:** Linux needs none. Windows without a certificate shows SmartScreen's "unknown publisher" warning (a certificate or Azure Trusted Signing can come later). macOS needs the $99 account for notarization, which is why it's last.
- **drafter.dev** gets a **Download** section on the Saving page and the README links the releases.

## 8. Platform order and versions

1. **Linux** (v0.4.0): AppImage and `.deb`, x64 (arm64 if the CI cost is small).
2. **Windows** (v0.4.x): an NSIS installer, unsigned at first.
3. **macOS** (v0.5.0 or with Phase 2): a notarized universal `.dmg`, after the Apple account.

## 9. Testing

- The web app's whole e2e suite keeps running in browsers, unchanged.
- `apps/desktop` has its own e2e (Playwright's Electron driver, or the engine's WebDriver) run on GitHub's Linux runner: launch, open the sample, type, save to a real file in a temp folder, reopen it, the close prompt, a file opened from the command line, a module loaded from the folder, the update prompt from a fake release feed.
- Packaging is checked in CI on every tag (the artifact exists, launches, and shows the editor).

## 10. Left to the builder

The exact IPC names, the updater library, the packaging tool, the folder layout inside `apps/desktop`, and anything the spike shows is easier one way than another, as long as the web app's only desktop-aware code is the `FileAccess` adapter, the menu bridge, and the update source.
