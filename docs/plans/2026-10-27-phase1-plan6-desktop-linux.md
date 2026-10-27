# Phase 1, Plan 6: Drafter for the Desktop (Linux) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Drafter as a Linux desktop app (AppImage and `.deb`, v0.4.0): the same editor as drafter.dev, with real files, a menu bar, a close prompt, and updates that ask first.

**Architecture:** A new workspace package, `apps/desktop`, holds an Electron shell around the static web build (`apps/web/.output/public`, built with `DRAFTER_DESKTOP=1`), served from a privileged `app://drafter/` scheme. A sandboxed, context-isolated window talks to the main process only through a preload bridge (`window.drafterDesktop`); the web app's only desktop-aware code is a path-based `FileAccess`, a menu bridge, a close bridge, and an update source. electron-builder packages it; electron-updater reads GitHub Releases.

**Tech Stack:** Electron 45, electron-builder 26, electron-updater, TypeScript (main and preload built with tsdown to CommonJS), Playwright 1.64 `_electron`, Vitest, GitHub Actions (ubuntu-latest, xvfb).

**Spec:** [`docs/drafter-desktop-design.md`](../drafter-desktop-design.md) (§2–§5, §7–§9; §6, the modules folder, is a later release), with the spike's evidence in [`docs/desktop-spike.md`](../desktop-spike.md). The spike's throwaway code is on branch `spike-desktop` under `spike/desktop/` (`electron/main.cjs`, `electron/preload.cjs`, `adapters/electron-files.ts`, `electron/run.mjs`): read it with `git show spike-desktop:<path>` for what already worked; don't copy it wholesale.

## Global Constraints

- Branch `phase-1-desktop` (worktree `scratchpad/drafter-desk`), from `main` at v0.3.0. It merges to `main` when everything is green; the release is v0.4.0.
- **Clean room** and **dependencies** as before: `electron`, `electron-builder`, and `electron-updater` each get a `docs/DEPENDENCIES.md` row before they're installed; nothing else new without a row.
- **The web app keeps working exactly as before in browsers:** `pnpm e2e` (apps/web) stays green and unchanged in behaviour; desktop-only code runs only when `window.drafterDesktop` exists (checked in one place, `apps/web/app/desktop.ts`) or under `DRAFTER_DESKTOP=1` at build time.
- **Security:** the window has `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`; it never loads a remote URL; navigation and `window.open` to anything but `app://drafter/` are refused (help pages open in a second app window from local files; links to https open in the system browser via `shell.openExternal` only for `https:` URLs). The CSP from `_headers` is sent as a response header on `app://`, unchanged (`connect-src 'self'`).
- **Network:** the desktop app makes one request on its own, the update check (Task 6), and only when the **Check for updates** setting is on (on by default).
- **Names:** the product is "Drafter", the app id `dev.drafter.app`, the Linux binary `drafterdev` (after drafter.dev; the CLI already owns `drafter`), the desktop entry `drafter.desktop`.
- **No axe tests** (accessibility checks wait for the final stage, as in Plans 4 and 5); every new control works from the keyboard, with a test.
- Every task: a CHANGELOG entry under `[Unreleased]`, choices in `docs/DECISIONS.md` (a new `## apps/desktop` section), conventional commits with no AI co-author trailer and no session link, and `pnpm test`, `pnpm check`, `pnpm -r typecheck`, `pnpm --filter @drafter/desktop e2e` (from Task 1) green before committing; `apps/web` e2e green whenever a task touches `apps/web`.
- `E2E_PORT` and lane rules as in Plan 5 if two lanes run.

## Review Focus

1. **A save that fails halfway** (disk full, the folder made read-only, the app killed) must leave the writer's file as it was. Covered by Task 2's `keeps the old file when a write fails`.
2. **Paths that aren't plain ASCII** (spaces, accents, CJK, a leading dot, a symlink) open, save, and reopen. Covered by Task 2's `saves and reopens files with unusual names`.
3. **Quitting with unsaved changes by any route** (the close button, Ctrl+Q, the window manager, the OS shutting down) asks or keeps the recovery copy. Covered by Task 5's `asks before closing with unsaved changes` and `flushes the recovery copy when the app is told to quit`.
4. **The same file opened twice** (double-clicked while it's open) focuses the one window and the one script. Covered by Task 3's `opens a file that is already open in the same window, once`.
5. **An update arriving with unsaved changes** never installs by itself and asks first. Covered by Task 6's `never restarts to update by itself`.

---

### Task 1: The shell

**Files:**
- Create: `apps/desktop/package.json` (`@drafter/desktop`, private), `apps/desktop/src/main.ts`, `apps/desktop/src/protocol.ts`, `apps/desktop/src/window.ts`, `apps/desktop/src/preload.ts`, `apps/desktop/tsdown.config.ts`, `apps/desktop/playwright.config.ts`, `apps/desktop/e2e/helpers.ts`, `apps/desktop/e2e/shell.spec.ts`, `apps/desktop/test/protocol.test.ts`, `apps/web/app/desktop.ts`
- Modify: `apps/web/nuxt.config.ts` (`DRAFTER_DESKTOP=1`: no PWA module, a `__DRAFTER_DESKTOP__` define), `apps/web/app/components/StorageWarning.vue` (no warning on the desktop), `pnpm-workspace.yaml` (if needed), `vitest.config.ts` (a `desktop` project), `docs/DEPENDENCIES.md`, root `package.json` scripts (`desktop:dev`)

**Interfaces (Produces):**
```ts
// apps/desktop/src/protocol.ts
/** Maps an app://drafter/ URL to a file under `root`, or null for anything outside it (.., absolute, other hosts). */
export function resolveAppUrl(url: string, root: string): string | null;
/** The response headers for a file: Content-Type by extension, and the CSP from _headers on HTML. */
export function headersFor(path: string, csp: string): Record<string, string>;
// apps/web/app/desktop.ts
export interface DesktopBridge { version: string; platform: NodeJS.Platform /* … extended by later tasks */ }
export function desktop(): DesktopBridge | null; // window.drafterDesktop, or null in a browser
```

- The web build for the desktop is `DRAFTER_DESKTOP=1 NETLIFY=true pnpm --filter @drafter/web build` into `apps/web/.output/public`; `apps/desktop` copies it to `apps/desktop/web/` at build time (git-ignored). `check-build.mjs` must pass for both builds (the desktop build has no `sw.js`: teach it that).
- `main.ts`: single-instance lock; registers `app` as privileged (standard, secure, supportFetchAPI, corsEnabled) before ready; serves `web/` through `protocol.handle` using `resolveAppUrl`/`headersFor`; unknown paths under `/docs/` serve their `index.html`, anything else unknown 404s (no SPA fallback is needed: the app is one page). The window per Global Constraints; `will-navigate` and `setWindowOpenHandler` enforce the navigation rules.
- The Linux sandbox: confirm `app.enableSandbox()` and that the renderer reports sandboxed (`process.sandboxed` in the preload is true); record how it behaves under Ubuntu 24.04's user-namespace restriction (Task 7 ships the AppArmor profile if needed).

- [ ] **Step 1: Write the failing tests.**
  - `test/protocol.test.ts`: `resolves files under the root`, `refuses paths that leave the root` (`app://drafter/../etc/passwd`, `%2e%2e`, encoded slashes, other hosts → null), `sends the CSP on HTML only`.
  - `e2e/shell.spec.ts` (Playwright `_electron.launch` on the built main, `HOME`/`XDG_CONFIG_HOME` in a temp dir per test): `opens the editor with the sample on a first run`, `keeps typed text across a restart` (type, close, relaunch, text is back), `has no service worker and no storage warning`, `refuses to navigate away from the app`, `runs the renderer sandboxed`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.** Add the DEPENDENCIES rows first (electron, electron-builder).
- [ ] **Step 4: Run them again,** plus the whole web suite (`apps/web` e2e unchanged). → PASS.
- [ ] **Step 5: Commit.** `feat(desktop): run Drafter in an Electron window from its own files`

---

### Task 2: Files

**Files:**
- Create: `apps/desktop/src/files.ts` (main-process file IPC), `apps/web/app/storage/desktop-files.ts` (`desktopFiles`), `apps/desktop/test/files.test.ts`, `apps/web/test/desktop-files.test.ts`, `apps/desktop/e2e/files.spec.ts`
- Modify: `apps/desktop/src/preload.ts`, `apps/web/app/desktop.ts` (the bridge's file calls), `apps/web/app/storage/files.ts` (install `desktopFiles` when `desktop()` is set)

**Interfaces (Produces):**
```ts
// The bridge (preload → main), all paths absolute:
interface DesktopFilesBridge {
  showOpen(): Promise<string | null>;
  showSave(suggestedName: string, extension: '.fountain' | '.md' | '.txt' | '.pdf'): Promise<string | null>;
  read(path: string): Promise<{ bytes: Uint8Array; lastModified: number }>; // rejects 'gone' when missing
  write(path: string, bytes: Uint8Array): Promise<void>;                     // atomic: temp file + rename
  realPath(path: string): Promise<string>;
  pathOfDropped(file: File): string;                                          // webUtils.getPathForFile
  watch(path: string, onChange: () => void): () => void;
}
// apps/web/app/storage/desktop-files.ts
export function desktopFiles(bridge: DesktopFilesBridge): FileAccess; // FileRef = { path: string }
```

- `canSaveInPlace` is true; `permission` is always `'granted'`; `sameFile` compares `realPath`s; `download` writes through `showSave` (so Export saves where the writer chooses). A `FileGoneError` for a missing file, as the browser's.
- `write` is atomic in the main process: write `.<name>.drafter-tmp` beside the file, `fsync`, `rename` over it; on failure the temp file is removed and the original is untouched. The file's mode is kept.
- The changed-elsewhere check keeps working through `read`'s `lastModified` and bytes; `watch` (debounced, ~300 ms) triggers the same check while the window is in front.
- E2E needs dialogs without a person: the main process honours `DRAFTER_E2E_DIALOG=<json file>` (only when `!app.isPackaged`) to answer `showOpen`/`showSave` from a queue in that file.

- [ ] **Step 1: Write the failing tests.**
  - `apps/desktop/test/files.test.ts` (real temp dirs): `writes atomically` (no partial file visible during write), `keeps the old file when a write fails` (folder made read-only, and a write whose bytes source throws mid-way → original bytes unchanged, no temp file left), `reports a missing file as gone`, `keeps the file's permissions`.
  - `apps/web/test/desktop-files.test.ts` (fake bridge): the `FileAccess` contract the browser version's tests check (picked file round trip, `canSaveInPlace`, `permission`, `sameFile` through realPath).
  - `e2e/files.spec.ts`: `saves a new script to a real file and reopens it`, `saves and reopens files with unusual names` (`My Script (2).fountain`, `Café — draft.fountain`, `脚本.fountain`, `.hidden.fountain`, a symlinked folder), `keeps line breaks and the byte-order mark`, `notices the file changed by another program` (write to the file from the test → "Updated from …"), `exports a PDF to a chosen path`, `opens a dropped file`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `apps/web` unit and e2e. → PASS.
- [ ] **Step 5: Commit.** `feat(desktop): open and save real files, atomically`

---

### Task 3: Opening files from the system

**Files:**
- Create: `apps/desktop/src/open-files.ts`, `apps/desktop/e2e/open-from-system.spec.ts`, `apps/desktop/test/open-files.test.ts`
- Modify: `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts`, `apps/web/app/desktop.ts` (`onOpenFile(cb)`), `apps/web/app/storage/open.ts` (open a path through the same path as Open)

**Interfaces (Produces):** `filesFromArgv(argv: string[], cwd: string): string[]` (absolute paths of `.fountain`, `.md`, `.markdown`, `.txt` arguments that exist; flags ignored); the bridge's `onOpenFile(cb: (path: string) => void): () => void`.

- Files named on the command line at launch, and in a second instance's argv (`second-instance`), open in the one window, which is focused and restored. A file that is already open (same `realPath`) just focuses its script — no second project.
- (macOS's `open-file` event is wired now but untested until the macOS build.)

- [ ] **Step 1: Write the failing tests.** `test/open-files.test.ts`: `takes script files from the arguments` (relative paths resolved against cwd; `--flags` and missing files dropped). `e2e/open-from-system.spec.ts`: `opens a file named on the command line`, `opens a file from a second launch in the first window`, `opens a file that is already open in the same window, once`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(desktop): open scripts from the command line and a second launch`

---

### Task 4: The menu bar

**Files:**
- Create: `apps/desktop/src/menu.ts`, `apps/desktop/test/menu.test.ts`, `apps/desktop/e2e/menu.spec.ts`, `apps/web/app/commands/desktop-menu.ts`
- Modify: `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts`, `apps/web/app/desktop.ts`, `apps/web/app/pages/index.vue`

**Interfaces (Produces):**
```ts
// apps/desktop/src/menu.ts
export interface MenuCommand { id: string; title: string; group: string; keys?: readonly string[]; enabled: boolean }
/** The menu template: File, Edit, View, Go, Help (Help also has About Drafter and Open the Releases Page). */
export function menuTemplate(commands: readonly MenuCommand[], run: (id: string) => void): Electron.MenuItemConstructorOptions[];
/** 'Mod-Shift-s' → 'CmdOrCtrl+Shift+S'. */
export function accelerator(key: string): string;
```

- The renderer sends the command list (from `COMMAND_DATA`, with each command's current `enabled`) once at start and whenever enablement changes (debounced); the main process rebuilds the menu. Choosing an item sends its id back; the renderer runs the registered command — one path, as the app menu and palette.
- Keys: a command whose key the menu owns must not run twice (the registry's window handler and the accelerator). Rule: on the desktop, menu accelerators are `registerAccelerator: false` and the page's own handlers keep the keys, so the menu only shows them; verify with a test that Mod+S saves once.
- Help: Keyboard Shortcuts, Saving, Privacy open the local help pages in a second app window; Take the tour and Reset sample run their commands.

- [ ] **Step 1: Write the failing tests.** `test/menu.test.ts`: `groups commands into File, Edit, View, Go, and Help`, `turns keys into accelerators` (`Mod-s` → `CmdOrCtrl+S`, `Mod-Alt-n` → `CmdOrCtrl+Alt+N`, `F8`, `Shift-F8`), `disables items whose command is off`. `e2e/menu.spec.ts`: `runs a command from the menu` (File → New Screenplay via `app.applicationMenu` click in the main process), `saves once on Mod+S`, `opens a help page in its own window`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(desktop): add the menu bar, built from Drafter's commands`

---

### Task 5: Closing and quitting

**Files:**
- Create: `apps/desktop/src/close.ts`, `apps/desktop/e2e/close.spec.ts`
- Modify: `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts`, `apps/web/app/desktop.ts` (`onCloseRequest`), `apps/web/app/storage/script.ts` (answer it from `dirty`, flush the recovery copy)

**Interfaces (Produces):** the bridge's `onCloseRequest(cb: () => Promise<'close' | 'stay'>)`; main's `closeDialog(title: string): Promise<'save' | 'discard' | 'cancel'>` (native `dialog.showMessageBox`: "Save", "Don't Save", "Cancel"; message "Save the changes to “The Call” before closing?"; detail "Your unsaved changes stay in Drafter's recovery copy either way.").

- On the window's `close` (and `before-quit` from Ctrl+Q or the menu), the main process asks the renderer; with no changes it closes at once. With changes it shows the dialog: **Save** runs Save (a new script asks where) and closes only if it saved; **Don't Save** closes; **Cancel** stays. The recovery copy is flushed before the window goes, in every case.
- When the OS ends the session (`session-end`, SIGTERM), there's no time to ask: flush the recovery copy and quit.

- [ ] **Step 1: Write the failing tests.** `e2e/close.spec.ts` (the dialog answered through a test hook as in Task 2): `closes at once with nothing unsaved`, `asks before closing with unsaved changes` (Cancel keeps the window; Don't Save closes and the recovery copy has the text on the next launch; Save writes the file then closes), `flushes the recovery copy when the app is told to quit` (send SIGTERM right after typing → relaunch shows the text).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(desktop): ask before closing with unsaved changes`

---

### Task 6: Updates

**Files:**
- Create: `apps/desktop/src/updates.ts`, `apps/desktop/e2e/updates.spec.ts`, `apps/web/app/update/desktop-source.ts`
- Modify: `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts`, `apps/web/app/update/state.ts` (an update source: the service worker on the web, the bridge on the desktop), `apps/web/app/components/UpdatePrompt.vue` (the desktop wording), `apps/web/app/settings/settings.ts` (`checkForUpdates: boolean`, true by default, desktop only), `SettingsDialog.vue`, `apps/web/app/pages/docs/privacy.vue`, `docs/DEPENDENCIES.md` (electron-updater)

**Interfaces (Produces):** the bridge's `updates: { onAvailable(cb: (version: string) => void): () => void; install(): Promise<void>; openReleasePage(): void; setEnabled(on: boolean): void }`.

- electron-updater with the GitHub provider (`cschweda/drafter`), `autoDownload: true` in the background only after the check finds a newer version, `autoInstallOnAppQuit: false`. One check at start when the setting is on; none otherwise.
- The same toast as the web: "A new version of Drafter is ready" with **Restart** and **Later**; Restart runs the same unsaved-changes question as Reload (Save first / Restart anyway / Cancel) and then `quitAndInstall`. It never installs by itself.
- A `.deb` install can't update itself: the toast's button is **Get it** (opens the release page in the browser).
- Privacy page: a paragraph on the desktop app's one network request (the update check, which sends no script content, and the setting that turns it off).

- [ ] **Step 1: Write the failing tests.** `e2e/updates.spec.ts` with a local HTTP server serving a fake `latest-linux.yml` (electron-updater pointed at it with `DRAFTER_UPDATE_FEED`, honoured only when `!app.isPackaged`): `offers an update and installs only when asked`, `never restarts to update by itself` (unsaved changes + an available update + time passes → still running; Restart asks first), `makes no request when Check for updates is off` (the server sees nothing).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `apps/web` e2e (the web update flow unchanged). → PASS.
- [ ] **Step 5: Commit.** `feat(desktop): offer updates from GitHub Releases, and never install by itself`

---

### Task 7: Packages and the release workflow

**Files:**
- Create: `apps/desktop/electron-builder.config.cjs`, `apps/desktop/build/` (icons from `brand/`, `drafter.desktop` metadata, the AppArmor profile and `.deb` after-install script if Task 1 found them needed), `.github/workflows/desktop.yml`, `apps/desktop/e2e/packaged.spec.ts`
- Modify: `apps/desktop/package.json` (`dist` script), root `package.json`

- AppImage and `.deb` for x64 (arm64 too if the runner supports it without cross-compiling problems; otherwise record it as later). File associations: `.fountain` (`text/x-fountain`), `.md`/`.markdown` (`text/markdown`), category `Office;TextEditor;`, binary `drafterdev`.
- `.github/workflows/desktop.yml`: on `push` to `phase-1-desktop` and `main` (build + desktop e2e under xvfb), and on tags `v*` (build, desktop e2e against the **packaged** app, then publish the AppImage, `.deb`, and `latest-linux.yml` to the tag's GitHub Release with `GITHUB_TOKEN`). Never on pull requests from forks with secrets.
- `packaged.spec.ts` (tag runs and a manual dispatch): the packaged AppImage launches, shows the editor, opens a file from argv, and runs sandboxed.

- [ ] **Step 1: Write the failing test** (`packaged.spec.ts`) and the workflow.
- [ ] **Step 2: Run it** on a `workflow_dispatch` of the branch. → FAIL (no package yet).
- [ ] **Step 3: Implement** the builder config and the workflow.
- [ ] **Step 4: Run it again** on GitHub. → PASS; the artifacts download and the AppImage size is recorded.
- [ ] **Step 5: Commit.** `build(desktop): package an AppImage and a .deb, and publish them on release`

---

### Task 8: Downloads and docs

**Files:**
- Modify: `apps/web/app/pages/docs/saving.vue` (a **Download Drafter for Linux** section: the AppImage and the `.deb`, what each is for, that Windows and macOS follow, and how the desktop app saves), `README.md` (the desktop app and its releases), `docs/DECISIONS.md`, `CHANGELOG.md`

- The links point at `https://github.com/cschweda/drafter/releases/latest`. No ICJIA anywhere.

- [ ] **Step 1: Write the failing test.** `apps/web/e2e/docs.spec.ts`: `links the Linux download from the Saving page`.
- [ ] **Step 2–4:** run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit.** `docs: say where to download Drafter for Linux`

---

### Task 9: Release v0.4.0

- [ ] **Step 1:** Full gates on the branch: `pnpm test`, `pnpm check`, `pnpm -r typecheck`, the Netlify build, `apps/web` e2e, the desktop e2e, and a green `desktop.yml` run.
- [ ] **Step 2:** CHANGELOG `[0.4.0]` with a plain-language summary; every package at 0.4.0 (`apps/desktop` too); README status.
- [ ] **Step 3:** Merge to `main`, push, tag `v0.4.0` (the workflow builds and attaches the Linux packages), publish the GitHub Release notes, and check drafter.dev and that the release has the AppImage, `.deb`, and `latest-linux.yml`.
- [ ] **Step 4:** Smoke-test the published AppImage on the CI runner (the `packaged.spec.ts` job against the downloaded artifact).
