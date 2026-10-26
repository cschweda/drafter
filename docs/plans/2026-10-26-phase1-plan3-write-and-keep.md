# Phase 1, Plan 3: Write and Keep Your Work — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make drafter.dev a place to write a script and keep it:
- **The Source pane** is CodeMirror with `@drafter/cm-fountain`: highlighting, the Fountain keymap, completion, folding, and lint markers.
- **The Script pane** shows the real pages, laid out in a Web Worker.
- **A recovery copy** in the browser is written as you type.
- **One tab** edits a script at a time.
- **New screenplays and stage plays**, and switching between scripts.
- **Save, Save As, and Open:** in place on Chromium and by download elsewhere, keeping a file's line breaks.

The rest of the editor follows in Plan 4: the command palette, settings and line numbers, the Problems pane, the template switcher, the script-module host, the app menu and Revert to Saved, the changed-elsewhere check, and export.

**Architecture:**
- **One editor.** The app creates one `EditorView` on the client and keeps it for the whole visit. When the Source tab is showing, its DOM sits in that pane; otherwise it waits in a hidden holder. So pane swaps never lose the text, the selection, the undo history, or the lint state.
- **Derived state.** The parsed `Doc`, the cursor's element, and the layout are Vue `shallowRef`s, fed by the view's update listener and the layout worker.
- **Projects in IndexedDB.** A project is one script in this browser: a row in Dexie's `projects` table, whose `source` is the recovery copy. `useScript()` holds the current one, feeds it to the editor, and writes the editor's text back through a debounced writer.
- **Files.** On Chromium, files go through the File System Access API, with each project's handle in the `handles` table. Elsewhere, Save downloads a copy.
- **Line breaks.** The editor always holds `\n`; a project remembers its file's line break, and writing the file restores it.

**Tech Stack:** Nuxt 4.6, Nuxt UI 4.12, Vue 3.5, CodeMirror 6 (`@codemirror/state`, `view`, `commands`, `language`, `search`, `lint`, `autocomplete`), Dexie 4, the File System Access API (feature-detected), Web Locks and BroadcastChannel, the Drafter packages, Vitest 5 with `fake-indexeddb`, Playwright 1.64 with `@axe-core/playwright`.

**Spec:** [`docs/drafter-phase1-design.md`](../drafter-phase1-design.md):
- §5.1–§5.3, §5.5, and §5.7 (the panes and the status bar)
- §4.2 (a sample's edits stay in the browser, and Save on it works as Save As)
- §6 (new scripts)
- §9.1, §9.3, and §9.5 (saving, opening, and two tabs)

The [technical design](../drafter-technical-design.md) sections that apply:
- §1 (one parser, one buffer)
- §3 (`cm-fountain`)
- §5.7 (the worker)
- §6.1 (`render-html`)
- §8.1–§8.3, §8.5, and §8.6 (storage)
- §13 (accessibility)
- §14 (security)

**Where this fits.** Plan 3 of Phase 1. [Plan 1](2026-10-25-phase1-plan1-shell-and-deploy.md) built the shell, and [Plan 2](2026-10-25-phase1-plan2-editor-packages.md) the packages this plan wires up. Plan 1 split the remaining work into the editor (Plan 3), files and storage (Plan 4), and the first visit and launch (Plan 5). The maintainer wants to write in Drafter as soon as possible (2026-10-25), so the split changed:
- **This plan** holds only what writing needs, from the old Plans 3 and 4.
- **[Plan 4](2026-10-26-phase1-plan4-the-full-editor.md)** finishes the editor.
- **[Plan 5](2026-10-25-phase1-plan5-writing-aids-first-visit-launch.md)** adds the writing aids, the first visit, and the launch.
- **Plan 6, the last step,** wraps the finished app as a desktop app for Windows, macOS, and Linux: Tauri recommended, Electron the alternative. It's planned and built last, because the app will keep changing until then. This plan prepares for it only through the one seam for files.

**Deploys.** After Task 2 passes review, the branch merges into `main` once, so the editor and its pages go live, with Task 1's interim leave warning. The plan's final merge, after the whole-branch review, makes drafter.dev a place to write.

## Global Constraints

- Node 22.13 or later, pnpm 10.33.4, strict TypeScript, ESM only.
- **Clean room:** no code, tests, or fixtures from any screenwriting application or Fountain library, and no Fountain package.
- **Dependencies:** every new one gets its row in `docs/DEPENDENCIES.md` before it's installed. This plan adds only:
  - `@codemirror/state`, `view`, `commands`, `language`, `search`, `lint`, and `autocomplete`
  - `dexie`, and `fake-indexeddb` for development
  - the workspace packages `@drafter/fountain`, `@drafter/templates`, `@drafter/layout`, `@drafter/lint`, `@drafter/render-html`, and `@drafter/cm-fountain`
- **No network requests after the app loads.** A script never leaves the device on its own: files are read and written only through pickers, drops, and downloads the writer starts. The content security policy in `_headers` stays as Plan 1 wrote it, and `e2e/security.spec.ts` stays green. Workers run under `worker-src 'self'`.
- **No path loses typed text** (Phase 1 design §1, item 4). Every flow that replaces the editor's text either is one undoable change or first keeps the replaced text as a separate script.
- Script text reaches the DOM only through CodeMirror, `render-html` (`textContent`), or Vue's text interpolation. Never `v-html` or `innerHTML`.
- Feature-detect `showOpenFilePicker` and Web Locks; never sniff the browser.
- **One seam for files** (decided 2026-10-26, so a desktop build can come later): only `app/storage/files.ts` touches the File System Access API, file inputs, drops, or downloads. Everything else reads and writes files through its `FileAccess` interface.
- **Line breaks and BOMs:**
  - Read files as bytes and decode them with `new TextDecoder('utf-8', { ignoreBOM: true })`, so a byte-order mark survives.
  - The editor holds `\n`; the project remembers the file's line break (`\r\n` when its first line break is one, else `\n`), and writing the file restores it.
  - Text the app inserts uses `state.lineBreak`.
- **Accessibility:**
  - Every new state gets an axe check (the WCAG 2.2 AA tags, as in `e2e/shell.spec.ts`) in the dark theme. States with new colors, and states shown on a phone, get one in those too.
  - Every new control works from the keyboard, with a test.
  - New text colors go through `assets/css/tokens.css`, which `test/tokens.test.ts` checks.
- Typing never waits on layout or lint: layout runs in the worker, and lint after CodeMirror's 300 ms pause.
- **Branch `phase-1-write`,** from `main` after Plan 2 merges. It merges to `main`, which deploys drafter.dev: once after Task 2's review, and again when everything is green.
- **Every task:**
  - adds a CHANGELOG entry under [Unreleased];
  - records its choices in `docs/DECISIONS.md` under `## apps/web`, dated 2026-10-26;
  - commits in conventional style, with no AI co-author trailer and no session link;
  - runs `pnpm test`, `pnpm check`, `pnpm --filter @drafter/web typecheck`, and `pnpm --filter @drafter/web e2e` before committing, and all of them pass.

## Review Focus

1. **Pane swaps and phone tab switches while editing.** The one editor must keep its text, selection, and undo history. Covered by Task 1's `keeps the text and the undo history when the panes swap`.
2. **A long script.** Typing in a 120-page script must stay smooth. Covered by Task 2's `types into a 120-page script without a long task`.
3. **The tab closes during the debounce.** The last keystrokes must reach the recovery copy. Covered by Task 4's `keeps the last keystrokes when the page closes at once`.
4. **Two tabs.** They must never both write one script's recovery copy. Covered by Task 5's `opens read-only in a second tab and hands editing over`.
5. **A Windows file.** CRLF line breaks and a byte-order mark must come back out byte for byte. Covered by Task 8's `saves a CRLF file with a BOM byte for byte`.

---

### Task 1: The editor in the Source pane

**Files:**
- Create:
  - `apps/web/app/editor/session.ts` (`useEditor`)
  - `apps/web/app/editor/extensions.ts`: the extensions and their compartments
  - `apps/web/app/editor/theme.ts`: an `EditorView.theme` from the tokens
  - `apps/web/app/editor/template.ts` (`templateIdOf`, `TEMPLATE_NAMES`) and `apps/web/test/template.test.ts`
  - `apps/web/app/components/SourcePane.vue`
  - `apps/web/app/components/ElementAnnouncer.vue`
  - `apps/web/e2e/editor.spec.ts`
- Modify: `apps/web/package.json`, `nuxt.config.ts`, `app/components/AppPane.vue`, `AppToolbar.vue` and `AppStatusBar.vue` (the template's name), `app/pages/index.vue`, `app/utils/panes.ts`, `test/panes.test.ts`, `docs/DEPENDENCIES.md`

**Interfaces (Produces):**
```ts
// app/editor/session.ts
export interface EditorSession {
  /** The one editor, created once on the client. */
  readonly view: EditorView;
  /** `parsedDoc` after every change. */
  readonly doc: Readonly<ShallowRef<Doc>>;
  readonly cursor: Readonly<ShallowRef<CursorElement | null>>;
  /** The built-in that `templateIdOf(doc)` names (technical design §8.6); Plan 4 adds the switcher that writes it. */
  readonly template: Readonly<ShallowRef<Template>>;
  /** Selects `select` (default: the offset), scrolls it into view, shows the Source tab, and focuses the editor. */
  goto(offset: number, options?: { select?: Span }): void;
}
export function useEditor(): EditorSession;
// app/editor/template.ts
export type TemplateId = 'us-screenplay' | 'stage-play-standard';
export const TEMPLATE_NAMES: Record<TemplateId, string>; // 'Screenplay', 'Stage play'
/** `meta.template` when it's a built-in, otherwise us-screenplay. */
export function templateIdOf(doc: Doc): TemplateId;
// app/editor/extensions.ts
export const spellcheck: Compartment; // contentAttributes { spellcheck: 'true' | 'false' }; starts 'true' (Phase 1 design §5.3)
export const lineNumbersGutter: Compartment; // lineNumbers() when on; starts empty (Plan 4's setting)
/** Re-lints now; settings and template changes call it, since fountain() reads its options on each run. */
export function relint(): void; // forceLinting(view)
// app/utils/panes.ts
/** The tabs with `tab` showing. If it isn't already, it opens in the pane other than `from` (default: the left pane). */
export function revealTab(tabs: PaneTabs, tab: TabId, from?: PaneId): PaneTabs;
```

The editor's extensions:
- `fountain({ template, lintOptions, onCursorElement })` from Plan 2
- `history()`
- `drawSelection()`
- the `lineNumbers` compartment, first among the gutters so the numbers sit at the far left of the source. It's empty until Plan 4's setting turns it on.
- `foldGutter()`
- `search()`
- `EditorView.lineWrapping`
- `keymap.of([...searchKeymap, ...historyKeymap, ...foldKeymap, ...lintKeymap, ...completionKeymap, ...defaultKeymap])`, below `fountain()`'s keymap
- `EditorView.contentAttributes.of({ 'aria-label': 'Source' })`
- the `spellcheck` compartment
- the theme

It starts with the sample, `#samples/screenplay.fountain?raw`.

**The theme** follows Phase 1 design §5.2, using the existing tokens:
- Text is Courier Prime at 13.5px with a 21px line height.
- `cm-f-scene_heading` is `--heading`, bold.
- `cm-f-character` is `--cue`, bold.
- `cm-f-transition` is `--trans`, bold.
- `cm-f-note` is `--note`, italic.
- `cm-f-section` and title-page keys are `--title`.
- `cm-f-parenthetical` and `cm-f-synopsis` are `--paren`, italic.
- `cm-f-marker` is `--faint`.
- The gutter is `--gutter` on `--bg`.

If a class name differs from Plan 2's `fountainHighlighting`, follow the package.

The page uses the `source` export condition for the Drafter packages. So `nuxt build` compiles their TypeScript, and the app never uses a stale `dist/`.

**Until Task 4 keeps a recovery copy,** the browser asks before the page closes while the text differs from what the editor opened with. Register a `beforeunload` handler only while it differs, and remove it when the text matches again, so the page stays eligible for the back/forward cache. Task 4 replaces this with the leave warnings of technical design §8.2. Without it, the deploy after Task 2 would put an editor online that silently loses typed text, which Phase 1 design §2 forbids.

**The template's name** shows in the toolbar's chip and in the status bar, from `TEMPLATE_NAMES[templateIdOf(doc)]`. The chip stays a disabled placeholder until Plan 4's switcher.

**The element announcer** is a visually hidden `aria-live="polite"` region. When the cursor's element changes kind, it reads the kind in words: "Scene heading", "Action", "Character", "Parenthetical", "Dialogue", "Transition", "Centered", "Lyric", "Section", "Synopsis", "Note", "Boneyard", "Page break", or "Title page". It reads nothing on a blank line (technical design §13).

- [ ] **Step 1: Write the failing tests.**
  - `test/panes.test.ts`:
    - `revealTab leaves the tabs alone when the tab is showing`
    - `revealTab opens the tab in the pane other than the one asking`
    - `revealTab opens it on the left when no pane is asking`
  - `test/template.test.ts`:
    - `reads the template from the metadata`
    - `falls back to the screenplay for an unknown or missing id`
  - `e2e/editor.spec.ts`, on a desktop:
    - `edits the sample in the Source pane`: type at the end, and the text is in the editor.
    - `colors the source by element`: the first scene heading's line has `cm-f-scene_heading`.
    - `colors lines that scroll into view`: in a long script, scroll to the end, and the last scene heading's line has `cm-f-scene_heading`. jsdom can't check the visible ranges, so this is the browser's check.
    - `starts a character cue with Tab on a blank line`: after Tab, the line reads `@`.
    - `keeps the text and the undo history when the panes swap`: type, choose Source in the right pane, click into the editor, and Mod+Z restores the sample.
    - `announces the element under the cursor`: the live region reads `Character` on a cue line and `Dialogue` on the line below.
    - `asks before leaving with edits`: after typing, closing the page with `runBeforeUnload` raises a `beforeunload` dialog. Without edits, closing raises none.
    - `leaves the editor with Escape then Tab`: focus moves out of the content element. This is CodeMirror's tab focus mode; it keeps Tab from being a keyboard trap (WCAG 2.1.2).
    - `has no accessibility violations while editing`: axe in both themes.
  - The same spec, on a phone: `edits on a phone`: choose Source, type, and the text changes.
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/web test` and `pnpm --filter @drafter/web e2e` → the new tests FAIL.
- [ ] **Step 3: Implement.**
  - Add the dependency rows, then install.
  - `useEditor` creates the view on first use on the client and keeps it in module state. `SourcePane.vue` moves `view.dom` into its host on mount, calls `view.requestMeasure()`, and moves it back to a hidden holder in `index.vue` before unmounting.
  - `AppPane.vue` renders `SourcePane` for the Source tab, in place of the `<pre>`.
  - `goto` uses `revealTab`, with the pane that holds the focused element as `from`. On a phone it switches the phone tab instead.
- [ ] **Step 4: Run them again.** The whole suite and `pnpm --filter @drafter/web e2e` → PASS.
- [ ] **Step 5: Commit.** `feat(web): edit the script in CodeMirror`

---

### Task 2: The layout worker and the Script pane

**Files:**
- Create:
  - `apps/web/app/workers/layout.worker.ts`
  - `apps/web/app/editor/layout-client.ts` (`createLayoutClient`)
  - `apps/web/app/editor/layout.ts` (`useLayout`)
  - `apps/web/app/components/ScriptPane.vue`
  - `apps/web/test/layout-client.test.ts`
  - `apps/web/e2e/script.spec.ts`
- Modify: `AppPane.vue` (the Script tab and its slim bar), `AppStatusBar.vue` (the page), `assets/css/tokens.css` and `test/tokens.test.ts` (if the pages need new tones)

**Interfaces (Produces):**
```ts
// The worker's messages
type LayoutRequest = { seq: number; source: string; template: Template };
type LayoutReply = { seq: number; layout: Layout } | { seq: number; error: string };
// app/editor/layout-client.ts: pure, so it's unit-tested with a fake worker and fake timers
export interface LayoutClient {
  /** Sends the newest text 50 ms after the last call (trailing debounce). */
  request(source: string, template: Template): void;
  destroy(): void;
}
export function createLayoutClient(
  worker: Pick<Worker, 'postMessage' | 'addEventListener' | 'terminate'>,
  onLayout: (layout: Layout, seq: number) => void,
): LayoutClient;
// app/editor/layout.ts
export function useLayout(): {
  layout: Readonly<ShallowRef<Layout | null>>;
  /** True while the newest request hasn't come back. */
  updating: Readonly<Ref<boolean>>;
  /** The page holding the cursor's block, and the last page's number. Null before the first layout. `layout.index[i].page` is a page *number* (0 is the title page), not an index into `layout.pages`, so look pages up by `number`. */
  page: Readonly<ComputedRef<{ current: number; last: number } | null>>;
};
```

**The worker** sends the whole source with each request. Copying even a 200 KB string costs well under a millisecond, and the worker's copy can never drift from the editor's. Record that as a decision: technical design §5.7 sends change sets instead.

**The Script pane:**
- It mounts `createScriptView(host, { fontsReady })` and calls `update(layout, template)` whenever `useLayout().layout` changes. `fontsReady` is `Promise.race([document.fonts.load('12pt "Courier Prime"'), a 3-second timeout])`: `render-html` waits for it without limit, so a font load that never settles must not leave the pane blank.
- It imports `@drafter/render-html/style.css`, and sets `--drafter-page` and `--drafter-ink` from the `--page` and `--ink` tokens.
- `GOTO_EVENT` calls `goto(offset)`.
- A change to the cursor's block calls `reveal(blockIndex)`.
- The slim bar shows **Page N of M**, or **Title page**, with "Updating…" while `updating`. It also offers **Fit width** and **100%** as a two-button toggle group (`aria-pressed`). Fit width, the default, scales the pages with CSS `zoom` so a page fills the pane's width. 100% is real size.
- The status bar shows the same page as "Page N of M".

- [ ] **Step 1: Write the failing tests.**
  - `test/layout-client.test.ts`:
    - `sends one request per pause in typing`: three calls within 50 ms post once, with the last text.
    - `drops a result older than the newest one shown`: replies 2 then 1 render 2 only.
    - `reports an error without throwing`
  - `e2e/script.spec.ts`:
    - `shows the sample's pages`: a title page, then the numbered pages `node packages/cli/dist/index.js build samples/screenplay.fountain --txt` gives (pin the count). The `Script` region holds level-2 headings that read the scene headings.
    - `updates the pages as you type`: type a new scene heading at the end, and it appears as a heading.
    - `jumps to the source when a line is clicked`: the editor's selection moves to that line.
    - `follows the cursor`: moving the cursor to the last scene scrolls its page into view.
    - `shows the current page in the slim bar and the status bar`
    - `switches between Fit width and 100%`
    - `types into a 120-page script without a long task` (Chromium only): put the sample's body, repeated to about 120 pages, into the editor with `page.keyboard.insertText`, and wait for the pages. Type 40 characters. A `PerformanceObserver` must see no `longtask` during the typing. If it does, make the costly step cheaper; don't loosen the test.
    - `has no accessibility violations in the Script pane`: both themes, and on a phone.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.** Create the worker with `new Worker(new URL('../workers/layout.worker.ts', import.meta.url), { type: 'module' })`.
- [ ] **Step 4: Run them again.** → PASS, with the whole suite.
- [ ] **Step 5: Commit.** `feat(web): lay out the script in a worker and show its pages`

---

### Task 3: The database, the projects store, and the recovery-copy writer

**Files:**
This task shares no source files with Tasks 1 and 2, so it can run in parallel with them, in its own worktree.

- Create: `apps/web/app/storage/db.ts` (the Dexie database, with technical design §8.1's whole version-1 schema: `projects`, `snapshots`, `templates`, `handles`, and `settings`, so later plans add no migration), `apps/web/app/storage/projects.ts`, `apps/web/app/storage/hash.ts`, `apps/web/app/storage/writer.ts`, `apps/web/app/storage/text.ts`
- Modify: `apps/web/package.json` (`dexie`; `fake-indexeddb` for development) and `docs/DEPENDENCIES.md`. Write the rows first: `dexie` is a general-purpose IndexedDB library, and `fake-indexeddb` an in-memory IndexedDB for Node tests.
- Test: `apps/web/test/projects.test.ts`, `apps/web/test/writer.test.ts`, `apps/web/test/text.test.ts`

**Interfaces (Produces):**
```ts
// projects.ts
export interface Project {
  id: string; // crypto.randomUUID()
  title: string;
  templateId: TemplateId; // from Task 1's app/editor/template.ts
  /** The recovery copy, with `\n` line breaks. */
  source: string;
  /** The file's line break, used when writing it. */
  lineBreak: '\n' | '\r\n';
  meta: DrafterMeta | null;
  /** Set on the two samples (Phase 1 design §4.2). */
  sample?: 'screenplay' | 'stage-play';
  createdAt: number;
  updatedAt: number;
  savedHash?: string;
  savedAt?: number;
  /** The file's name, for the Source pane's slim bar. */
  fileName?: string;
  fsHandleId?: string;
}
export function createProject(init: { source: string } & Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Project>;
export function getProject(id: string): Promise<Project | undefined>;
/** Most recently updated first. */
export function listProjects(): Promise<Project[]>;
/** Also derives `title`, `templateId`, and `meta` from `source` when it's given (technical design §8.1). */
export function updateProject(id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<void>;
/** Also deletes its snapshot and its file handle; never touches the file. */
export function removeProject(id: string): Promise<void>;
export function getSavedText(id: string): Promise<string | undefined>;
export function setSavedText(id: string, source: string): Promise<void>;
// hash.ts
export function hashText(text: string): Promise<string>; // SHA-256, hex
// text.ts
export function decodeFile(bytes: Uint8Array): { text: string; lineBreak: '\n' | '\r\n' }; // BOM kept, text normalized to \n
export function encodeFile(text: string, lineBreak: '\n' | '\r\n'): string;
/** The title page's Title, as one line of plain text, else `fallback`. */
export function titleOf(doc: Doc, fallback?: string): string; // default fallback 'Untitled'
/** A file name: the title without / \ : * ? " < > |, trimmed, at most 120 characters, plus the extension. */
export function fileNameFor(title: string, extension: '.fountain' | '.pdf' | '.txt'): string;
// writer.ts
export interface Writer {
  /** Writes `source` 750 ms after the last call, or after 5 s of continuous calls. */
  schedule(source: string): void;
  flush(): Promise<void>;
  readonly pending: boolean;
}
export function createWriter(write: (source: string) => Promise<void>, options?: { delay?: number; maxWait?: number }): Writer;
```

- [ ] **Step 1: Write the failing tests** (`fake-indexeddb`, fake timers).
  - `projects.test.ts`:
    - `creates, reads, updates, lists newest first, and removes a project`
    - `derives the title and template from the source on update`
    - `removing a project removes its snapshot and handle`
  - `writer.test.ts`:
    - `writes once, 750 ms after the last change`
    - `writes at least every 5 seconds during continuous typing`
    - `flush writes what's pending at once`
    - `never runs two writes at the same time` (a slow write queues the next)
  - `text.test.ts`:
    - `keeps a BOM and finds a CRLF file's line break`
    - `round-trips a CRLF file through decode and encode`
    - `reads the title from the title page`
    - `makes a safe file name`
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/web test` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): store projects and write the recovery copy`

---

### Task 4: The current script and its recovery copy

**Files:**
- Create: `apps/web/app/storage/script.ts` (`useScript`), `apps/web/app/components/StorageWarning.vue`, `apps/web/e2e/recovery.spec.ts`
- Modify: `app/editor/session.ts` (load a project's text; replace Task 1's interim leave warning), `AppStatusBar.vue`, `AppPane.vue` (the Source slim bar shows `fileName`, or the title)

**Interfaces (Produces):**
```ts
export type RecoveryState = 'persistent' | 'not-persistent' | 'unavailable';
export function useScript(): {
  project: Readonly<ShallowRef<Project | null>>;
  /** The text differs from what was last saved to the file. A new script that hasn't been typed in has no changes. */
  dirty: Readonly<ComputedRef<boolean>>;
  recovery: Readonly<Ref<RecoveryState>>;
  /** Flushes the current script's recovery copy, then loads `id` into the editor as a fresh state (its own undo history). */
  open(id: string): Promise<void>;
};
```

- **On load:** open the most recently updated project. If there's none, create the screenplay sample's project (`sample: 'screenplay'`) and open that. Plan 5 adds the welcome dialog and the sample bar.
- **While editing:** every change schedules the writer. Pending writes flush on `visibilitychange` (hidden) and `pagehide`.
- **The recovery state:**
  - The first project created calls `navigator.storage.persist()`.
  - Each launch, and each failed write, checks `navigator.storage.persisted()` and whether IndexedDB opens.
  - If IndexedDB is unavailable, the editor still runs on the sample's text in memory.
  - The status bar reads "Recovery copy: kept in this browser", "Recovery copy: may be cleared", or "Recovery copy: unavailable", each a button that explains itself.
  - `StorageWarning.vue` shows technical design §8.3's warnings. "May be cleared" is dismissible for the visit. "Unavailable" stays until a write succeeds.
- **The status bar's first item:** "Sample · your edits stay in this browser" (§5.7) on a sample; "Not saved to a file yet" on a script that has no file. Task 7 adds the saved states.
- **Leaving:** Task 1's interim leave warning goes. While `dirty`, and the script isn't a sample, `beforeunload` asks (technical design §8.2). The handler is registered only while it applies.

- [ ] **Step 1: Write the failing tests** (`e2e/recovery.spec.ts`).
  - `restores your text after a reload`
  - `keeps the last keystrokes when the page closes at once`: type, then reload immediately, before 750 ms pass.
  - `opens the most recent script`: with two projects, the newer one opens.
  - `says the recovery copy is kept when storage is persistent`: an init script stubs `navigator.storage.persisted` and `persist` to resolve true.
  - `warns that the recovery copy may be cleared, and the warning can be dismissed`: they resolve false.
  - `keeps editing and warns when IndexedDB is unavailable`: an init script makes `indexedDB.open` fail. Typing still works, and the warning stays.
  - `never asks before leaving a sample`, and `asks before leaving a script with changes`
  - `has no accessibility violations with a storage warning showing`: both themes, and on a phone.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS, with the whole suite.
- [ ] **Step 5: Commit.** `feat(web): keep a recovery copy as you type`

---

### Task 5: The two-tab guard

**Files:**
- Create: `apps/web/app/storage/guard.ts`, `apps/web/app/components/ReadOnlyBar.vue`, `apps/web/e2e/tabs.spec.ts`
- Modify: `app/editor/extensions.ts` (a `readOnly` compartment: `EditorState.readOnly` and `EditorView.editable`), `app/storage/script.ts`

**Interfaces (Produces):**
```ts
export function useGuard(): {
  /** Another tab holds this script: editing is off here. */
  readOnly: Readonly<Ref<boolean>>;
  /** Asks the other tab to let go, then takes over editing with the latest recovery copy. */
  editHere(): Promise<void>;
};
```

- **Holding the lock.** Opening a project requests the Web Lock `drafter:project:<id>` with `ifAvailable: true`. A tab that gets it holds it until the script closes.
- **When another tab holds it,** the script opens read-only. A bar reads "This script is open for editing in another tab", with **Edit here instead**.
- **Handing over editing.** **Edit here instead** sends `{ type: 'release', id }` on the `BroadcastChannel` `drafter`. The holder flushes its recovery copy, turns read-only with the same bar, and releases the lock. The asking tab then takes the lock and reloads the project from IndexedDB.
- Without Web Locks, there's no guard. Record that as a decision.

- [ ] **Step 1: Write the failing tests** (`e2e/tabs.spec.ts`, two pages in one context).
  - `opens read-only in a second tab and hands editing over`: text typed in tab A appears in tab B after the handover, and tab A becomes read-only.
  - `lets a script edit again when the other tab closes`: after a reload, the lock is free.
  - `has no accessibility violations with the read-only bar showing`
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): open a script in one tab at a time`

---

### Task 6: New scripts and switching between them

**Files:**
- Create: `apps/web/app/storage/new-script.ts`, `apps/web/app/components/ScriptsMenu.vue`, `apps/web/test/new-script.test.ts`, `apps/web/e2e/scripts.spec.ts`
- Modify: `AppToolbar.vue` (**Open** opens the scripts menu, and loses `aria-disabled`)

**Interfaces (Produces):**
```ts
/** A new script's text: a title page to fill in, then a blank line, and for a stage play the metadata block naming its template (Phase 1 design §6). */
export function newScriptText(kind: 'screenplay' | 'stage-play', today: Date): { text: string; cursor: number };
```

The new screenplay's text, with the cursor at the end:

```
Title: Untitled Screenplay
Credit: Written by
Author: Your Name
Draft date: October 25, 2026

```

The new stage play's is the same, titled "Untitled Play". Its last lines are `/* drafter`, `{"v":1,"template":"stage-play-standard"}`, and `*/`, written as fixed text; nothing in it needs escaping. Its cursor sits on the blank line before the metadata block.

**The scripts menu,** on the toolbar's **Open**, holds:
- **New screenplay** and **New stage play**
- **Open a file…**, which Task 8 adds
- this browser's scripts, most recent first, each with **Remove from this browser**, which confirms first and says the file isn't touched
- **Samples:** Screenplay and Stage play

Plan 4 registers these as commands, with shortcuts, and adds the app menu behind the mark.

- [ ] **Step 1: Write the failing tests.**
  - `test/new-script.test.ts`:
    - `starts a screenplay with a title page to fill in`: `parse(text).titlePage.fields` keys are Title, Credit, Author, and Draft date, and the cursor is at the end.
    - `starts a stage play that names its template`: `parse(text).meta.template` is `stage-play-standard`.
  - `e2e/scripts.spec.ts`:
    - `starts a new screenplay`: the title page shows on the Script pane's title page.
    - `starts a new stage play`: the template chip reads Stage play.
    - `switches between scripts from the Open menu, each with its own undo history`
    - `opens a sample beside your own scripts`
    - `removes a script from this browser after confirming`
    - `has no accessibility violations with each menu open`
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): start new scripts and switch between them`

---

### Task 7: Save and Save As

**Files:**
- Create: `apps/web/app/storage/files.ts` (the `FileAccess` interface and its browser version), `apps/web/app/storage/save.ts`, `apps/web/test/files.test.ts`, `apps/web/e2e/fs-stub.ts` (test helper), `apps/web/e2e/save.spec.ts`
- Modify: `AppToolbar.vue` (**Save** works), `AppStatusBar.vue`, `ScriptsMenu.vue` (**Save As…**), `index.vue` (the tab title, and a `keydown` listener in the capture phase for the keys)

**Interfaces (Produces):**
```ts
// app/storage/files.ts: the only module that touches files
/** A file the writer chose. It must be structured-cloneable, so it can be kept in the `handles` table: the browser version holds a FileSystemFileHandle, and a desktop version would hold a path. */
export interface FileRef { readonly name: string }
export interface PickedFile { ref: FileRef | null; name: string; bytes: Uint8Array; lastModified: number }
export class FileGoneError extends Error {}  // moved, deleted, or its drive is gone
export interface FileAccess {
  /** Save writes back to the file it came from (Chromium's API; a desktop version: always). */
  readonly canSaveInPlace: boolean;
  pickToOpen(): Promise<PickedFile | null>;                  // null: cancelled
  fromDrop(item: DataTransferItem): Promise<PickedFile | null>;
  pickToSave(suggestedName: string, kind: 'fountain' | 'pdf' | 'txt'): Promise<FileRef | null>;
  read(ref: FileRef): Promise<{ bytes: Uint8Array; lastModified: number }>; // throws FileGoneError
  write(ref: FileRef, data: string | Uint8Array): Promise<void>;           // asks for permission if needed
  permission(ref: FileRef, ask: boolean): Promise<'granted' | 'prompt' | 'denied'>;
  sameFile(a: FileRef, b: FileRef): Promise<boolean>;
  /** The fallback where !canSaveInPlace. */
  download(name: string, data: string | Uint8Array, type: string): void;
}
export const browserFiles: FileAccess;
/** The FileAccess in use: browserFiles, or a test's or a desktop build's own. */
export function useFiles(): FileAccess;
export function setFiles(files: FileAccess): void;
// app/storage/save.ts
export function save(): Promise<'saved' | 'cancelled'>;   // Mod-s
export function saveAs(): Promise<'saved' | 'cancelled'>; // Mod-Shift-s
```

- **Save** on a script bound to a file writes through `useFiles().write`. A sample, a script without a file, or **Save As** asks where with `pickToSave` (the browser version: `showSaveFilePicker`): the suggested name is `fileNameFor(title, '.fountain')`, and the type is `text/plain` with `.fountain`.
- Without the API, **Save** and **Save As** download the whole script under the same name.
- **After a save:**
  - `savedHash`, `savedAt`, and `fileName` are set, and the saved snapshot is updated.
  - A sample saved this way becomes the writer's own script: a new project, with the sample's project left as it was.
  - A cancelled picker changes nothing.
- **The status bar** reads "Saved just now", then "Saved N min ago" (refreshed every 30 s), "Saved at 3:42 PM" after an hour, or "Unsaved changes".
- **The tab title** is `• The Call — Drafter` while `dirty`, otherwise `The Call — Drafter`.
- `Mod+S` and `Mod+Shift+S` work from anywhere, and the browser's own Save Page never opens: a window `keydown` listener in the capture phase, plus the same keys in the editor's keymap. Plan 4's command registry takes them over and lists them.

`e2e/fs-stub.ts` is an init script for Chromium. It replaces `showSaveFilePicker` and `showOpenFilePicker` with versions that return handles from the origin-private file system (`navigator.storage.getDirectory()`), named by `window.__nextFileName`. The tests then read the file back from that system. Tests of the download path delete the pickers instead, and wait for Playwright's `download` event.

- [ ] **Step 1: Write the failing tests** (`test/files.test.ts` and `e2e/save.spec.ts`).
  - `test/files.test.ts`: `saves and reopens a script through any FileAccess`. An in-memory `FileAccess` passed to `setFiles` takes a save, a Save As, and a read, with no browser file API touched. This proves the seam a desktop build will use.
  - Chromium, with the stub:
    - `saves a new script to a file and then saves in place`
    - `saves as a new file`
    - `turns a saved sample into the writer's own script`
    - `does nothing when the picker is cancelled`
  - Every engine, with the pickers removed: `downloads the script when the browser can't save in place`. The file is named after the title, and its text equals the editor's.
  - `shows the save state in the status bar and the tab title`
  - `saves with Mod+S from anywhere`
  - `has no accessibility violations after saving`
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): save scripts to files`

---

### Task 8: Open a file

**Files:**
- Create: `apps/web/app/storage/open.ts`, `apps/web/app/components/DropZone.vue`, `apps/web/app/components/SameTitleDialog.vue`, `apps/web/e2e/open.spec.ts`
- Modify: `ScriptsMenu.vue` (**Open a file…**)

**Interfaces (Produces):**
```ts
/** Opens a file as a project: from the picker (keeping its handle where the API exists), from an <input type=file>, or from a drop. */
/** Opens a picked file (from `useFiles().pickToOpen`, `fromDrop`, or a file input) as a project. */
export function openFile(file: PickedFile): Promise<void>;
export function pickAndOpen(): Promise<void>;
```

- **Choosing a file.** **Open a file…** uses `showOpenFilePicker` where it exists. Elsewhere it uses a hidden `<input type="file" accept=".fountain,.txt,text/plain">`.
- **Dropping a file.** A file dropped anywhere on the window opens it. While a file is dragged over, a drop zone shows "Drop a .fountain or .txt file to open it". On Chromium, `DataTransferItem.getAsFileSystemHandle()` keeps the handle.
- **What opening does:**
  - It creates a project from the decoded text, with its `lineBreak` and `fileName`. Its title is the title page's Title, else the file name without its extension. `savedHash` is the opened text's, so the script opens clean.
  - It refuses, with a message, a file over 5 MB or one with a NUL byte in its first 8 KB, since that isn't a script.
- **A file that's already open.** If its handle `isSameEntry` as a project's handle, that project opens instead of a duplicate.
- **A title that's already taken.** Where saving downloads (no API), opening a file whose title matches a script already in the browser asks first (§9.6): **Replace that script**, **Open beside it**, or **Cancel**. Replacing keeps the old text, so it's one undoable change once open.

- [ ] **Step 1: Write the failing tests** (`e2e/open.spec.ts`).
  - `opens a file from the picker` (Chromium, with the stub)
  - `opens a file from the file input`, in every engine: set the input's files with Playwright.
  - `opens a dropped file`
  - `saves a CRLF file with a BOM byte for byte` (Chromium, with the stub): open, edit, undo, and save. The bytes equal the original.
  - `opens a file that's already open as the same script`
  - `asks before replacing a script with the same title` (pickers removed)
  - `refuses a file that isn't text`
  - `has no accessibility violations with the drop zone and the dialog showing`
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): open scripts from files`

---

**Plan 3 is done when** a writer can start a script on drafter.dev and see its pages. They can close the browser and come back to it, edit it in one tab at a time, and save it to a file and open it again, in place on Chromium and by download elsewhere, keeping its line breaks. All of it works from the keyboard, passes axe in both themes and on a phone, and passes in every engine. The branch then merges to `main`, and drafter.dev deploys it.
