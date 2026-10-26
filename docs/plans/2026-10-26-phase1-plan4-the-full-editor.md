# Phase 1, Plan 4: The Full Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Phase 1's editor on top of Plan 3's:
- the metadata block written by the app, and **Mark as distinct** for similar names
- the command registry and the command palette
- settings, including line numbers
- the Problems pane, with its fixes
- the template switcher
- the host for script modules, which finds them in a `modules/` folder, and three sample modules
- the app menu, and Revert to Saved
- the check for a file changed somewhere else
- export to PDF and plain text

**Architecture:** As in [Plan 3](2026-10-26-phase1-plan3-write-and-keep.md): one editor, derived state, projects in IndexedDB. Commands live in one registry that the palette, the app menu, the keys, and Plan 5's shortcuts page all read. Problems come from CodeMirror's lint state, so the list and the gutter always agree.

**Tech Stack:** Plan 3's, plus `@drafter/render-pdf` and `@drafter/render-text` in a worker.

**Spec:** [`docs/drafter-phase1-design.md`](../drafter-phase1-design.md):
- §5.1: the app menu
- §5.4: commands and the palette
- §5.6: Problems
- §6: the template switcher
- §8: settings
- §9.4 and §9.6: Revert, and files changed elsewhere
- §10: export

Read it with technical design §8.6 and §9, and with §6.2 for `render-pdf`. The script-module host and line numbers were decided by the maintainer on 2026-10-26; Task 6 records the modules in the design.

**Where this fits.** Plan 4 of Phase 1, after [Plan 3](2026-10-26-phase1-plan3-write-and-keep.md). [Plan 5](2026-10-25-phase1-plan5-writing-aids-first-visit-launch.md) follows.

## Global Constraints

- Everything in Plan 3's Global Constraints, except the branch and the dependencies.
  - **Branch:** `phase-1-full-editor`, from `main` after Plan 3 merges. It merges to `main` when everything is green.
  - **New dependencies:** `@drafter/render-pdf` and `@drafter/render-text` (Task 10), and nothing else.
- **Modules ship off by default.** Task 6 builds the module host, the local `modules/` folder, and a test fixture; Task 7 adds three sample modules that need no network. The content security policy stays `connect-src 'self'`.

## Review Focus

1. **A fix chosen after the text changed** must never apply its offsets to newer text. Covered by Task 4's `applies no fix to text that changed after linting`.
2. **Script text that looks like markup,** in the palette's scene list and in problem messages, must show as text. Covered by Task 2's `shows a scene named like HTML as text`.
3. **The file and the browser both changed.** Both versions must survive. Covered by Task 9's `keeps both versions when the file and the browser both changed`.
4. **A module that throws** must never break the editor. Covered by Task 6's `catches a module that throws`.
5. **Fix all in Strict Fountain** must be one undoable step. Covered by Task 4's `fixes everything at once in Strict Fountain`.

---

### Task 1: `@drafter/fountain` writes the metadata block, and `similar-names` offers Mark as distinct and skips short-word differences

**Files:**
- Create: `packages/fountain/src/meta.ts`, `packages/fountain/test/meta.test.ts`
- Modify: `packages/fountain/src/index.ts`, `packages/fountain/README.md`, `packages/lint/src/rules/names.ts`, `packages/lint/test/names.test.ts`

**Interfaces (Produces):**
```ts
/**
 * The changes that make `meta` the script's metadata block (technical design §8.6): they
 * replace the existing block, or append one after a blank line. The JSON is on one line, with
 * every `/` in it written `\/`. `v` defaults to 1. An unchanged block gives [].
 */
export function setMeta(doc: Doc, meta: DrafterMeta): TextChange[];
```

- [ ] **Step 1: Write the failing tests** (`meta.test.ts`). `apply(source, changes)` applies the changes from last to first.
  - `appends a block after a blank line`: `'INT. HALL - DAY\n\nShe waits.\n'` with `{ template: 'stage-play-standard' }` gives `'INT. HALL - DAY\n\nShe waits.\n\n/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/\n'`.
  - `replaces an existing block` and keeps everything before it byte for byte.
  - `gives no changes when the block already says it`.
  - `escapes slashes so no value can close the block`: the value `'a */ b'` round-trips, and `parse(result).meta` equals the input.
  - `writes the block with the file's own line break`: a CRLF script gets `\r\n` throughout the new block.
  - `round-trips through parse`: for the meta values above, `parse(apply(source, setMeta(parse(source), meta))).meta` equals `{ v: 1, ...meta }`.
  - In `packages/lint/test/names.test.ts`: `leaves names that differ inside a short word alone` (Plan 2's Ruling 11). The pairs `MR. SMITH`/`MRS. SMITH`, `JOHN JR.`/`JOHN SR.`, and `GUARD A`/`GUARD B` aren't reported. `MARIO`/`MARIA` and `OFFICER DAVID`/`OFFICER DAVIS` still are. The rule: when the one edit falls inside a whitespace-separated word of three letters or fewer, the pair is skipped.
  - In `packages/lint/test/names.test.ts`: `offers to mark two similar names as distinct`. The `similar-names` diagnostic's fix, titled `Mark as distinct`, adds the pair to `meta.distinctNames` (Plan 2, Task 6), and after it the rule reports nothing.
- [ ] **Step 2: Run them.** `pnpm vitest run --project fountain --project lint` → FAIL: `setMeta` isn't exported.
- [ ] **Step 3: Implement** `setMeta`, then give `similar-names` its fix through it: the pair, in upper case and in the order reported, joins any `distinctNames` already there. The existing block is `doc.meta`'s source: the last block, a boneyard opening with `/* drafter`. The line break is the first `\r\n` or `\n` in `doc.source`, else `\n`.
- [ ] **Step 4: Run them again.** `pnpm vitest run --project fountain --project lint` → PASS. Then `pnpm test`.
- [ ] **Step 5: Commit.** `feat(fountain): write the metadata block; let similar names be marked distinct`

---

### Task 2: Commands and the command palette

**Files:**
- Create:
  - `apps/web/app/commands/registry.ts`
  - `apps/web/app/commands/keys.ts` (`formatKeys`)
  - `apps/web/app/commands/builtin.ts`: the commands this plan defines
  - `apps/web/app/components/CommandPalette.vue`
  - `apps/web/test/keys.test.ts`, `apps/web/test/registry.test.ts`
  - `apps/web/e2e/palette.spec.ts`
- Modify: `AppToolbar.vue` (the palette field opens it and loses `aria-disabled`), `index.vue`

**Interfaces (Produces):**
```ts
export type CommandGroup = 'File' | 'Edit' | 'View' | 'Go' | 'Help';
export interface Command {
  id: string;
  title: string;
  group: CommandGroup;
  /** In CodeMirror's notation, such as `Mod-k` or `Mod-Alt-1`; the palette and the shortcuts page format it. */
  keys?: string;
  run(): void;
  /** Commands that don't apply yet are hidden from the palette. */
  enabled?(): boolean;
}
export function registerCommands(commands: readonly Command[]): void;
export function useCommands(): Readonly<Ref<readonly Command[]>>;
/** `Mod-Shift-s` → `⌘⇧S` on Apple platforms, `Ctrl+Shift+S` elsewhere. */
export function formatKeys(keys: string, apple: boolean): string;
```

The commands this plan registers (Plan 3's file features become commands here too):
- **File:** New screenplay (`Mod-Alt-n`), New stage play, Open… (`Mod-o`), Save (`Mod-s`), Save As… (`Mod-Shift-s`), and Remove from this browser. Plan 3 bound `Mod-s` and `Mod-Shift-s` directly; the registry now owns those bindings.
- **Go:** Go to scene…, Go to line…, Next problem (`F8`), Previous problem (`Shift-F8`).
- **View:** Show Source, Show Script, Show Problems, Switch theme, Fold all (`Ctrl-Alt-[`), Unfold all (`Ctrl-Alt-]`).
- **Edit:** Undo, Redo, Find (`Mod-f`).
- **Edit, the Fountain commands** (technical design §3.3): Make scene heading through Make lyric (`Mod-Alt-1` through `Mod-Alt-7`), Dual dialogue (`Mod-Shift-d`), Wrap in a note (`Mod-/`), and Cut to the boneyard (`Mod-Shift-/`). Each runs its `cm-fountain` command on the view.

Commands with editor keys run through CodeMirror's keymap. The registry lists their keys for the palette and for Plan 5's shortcuts page.

**The palette:**
- Nuxt UI's `UCommandPalette` in a `UModal`. `Mod+K` opens it from anywhere, including the editor, and so does the toolbar field.
- Its groups:
  - **Scenes:** every scene heading by its text, with its source line. Choosing one calls `goto`.
  - **Go to line N:** shown when the query is a number.
  - The commands, by group, each with its formatted keys.
- Esc closes it, and focus returns where it was.

- [ ] **Step 1: Write the failing tests.**
  - `test/keys.test.ts`:
    - `formats keys for Apple platforms`: `Mod-Shift-s` → `⌘⇧S`, `Mod-Alt-1` → `⌘⌥1`.
    - `formats keys elsewhere`: `Mod-Shift-s` → `Ctrl+Shift+S`.
  - `test/registry.test.ts`:
    - `lists every command once, by id`
    - `rejects two commands with the same id`
  - `e2e/palette.spec.ts`:
    - `opens with Mod+K and from the toolbar`
    - `goes to a scene by name`
    - `goes to a line by number`
    - `runs a command`: Switch theme changes the theme.
    - `closes with Escape and returns focus`
    - `shows a scene named like HTML as text`: add `INT. <img src=x onerror=alert(1)> - DAY`. The palette shows the text, and no `img` exists.
    - `has no accessibility violations with the palette open`: both themes.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): add the command registry and the command palette`

---

### Task 3: Settings

**Files:**
- Create:
  - `apps/web/app/settings/settings.ts` (`useSettings`)
  - `apps/web/app/components/SettingsDialog.vue`
  - `apps/web/test/settings.test.ts`
  - `apps/web/e2e/settings.spec.ts`
- Modify: `app/editor/extensions.ts`, `assets/css/main.css`. The settings live in the `settings` table of the database Plan 3 created.

**Interfaces (Produces):**
```ts
export interface Settings {
  /** Follow the system's light or dark appearance; off by default (Phase 1 design §8). */
  matchSystem: boolean;
  /** Scales both panes evenly: 0.9, 1, 1.15, 1.3, or 1.5. */
  textSize: number;
  spellcheck: boolean;
  /** Strict Fountain (§5.6). */
  strict: boolean;
  /** Source line numbers in the leftmost gutter, so a line can be referred to; off by default (decided 2026-10-26). */
  lineNumbers: boolean;
}
export const DEFAULT_SETTINGS: Settings; // { matchSystem: false, textSize: 1, spellcheck: true, strict: false, lineNumbers: false }
export function useSettings(): {
  settings: Readonly<Ref<Settings>>;
  set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void>;
};
```

How the settings apply:
- `matchSystem` sets the color mode's preference to `system`. Turning it off returns to the last explicit theme. The theme itself stays in localStorage (Plan 1's decision), so the first paint has no flash.
- `textSize` sets `--text-scale` on the root. The Source pane's font size multiplies by it. At 100%, the Script pane's zoom does too, so pagination never changes. Fit width ignores it.
- `spellcheck` reconfigures the `spellcheck` compartment.
- `strict` is what `fountain()`'s `lintOptions` returns, and a change calls `relint()`, so the Strict rules become warnings at once. Task 4 adds **Fix all**.
- `lineNumbers` reconfigures the `lineNumbersGutter` compartment with `lineNumbers()`. It's also a toggle button in the Source pane's slim bar, labeled "Line numbers" with `aria-pressed`. And it's a **Show line numbers** command (group View) in the palette. The numbers are the same 1-based source lines that the Problems pane and **Go to line** use.

The dialog opens from a **Settings…** command (group File, `Mod-,`). Each setting is a labeled switch, except text size, which is a select.

- [ ] **Step 1: Write the failing tests.**
  - `test/settings.test.ts`, with `fake-indexeddb`:
    - `starts from the defaults`
    - `keeps a change in the settings table`
    - `ignores an unknown or malformed value`
  - `e2e/settings.spec.ts`:
    - `remembers settings after a reload`
    - `turns the browser's spellcheck off in the Source pane`
    - `scales both panes with the text size`
    - `follows the system appearance when asked`: emulate `colorScheme: 'light'`, turn it on, and the page goes light.
    - `raises the Strict Fountain rules to warnings`: with a heading followed directly by action, the gutter's marker becomes a warning.
    - `toggles line numbers from the Source pane's bar and remembers them`: they're off at first. After the toggle, the leftmost gutter numbers the lines from 1 and line 17 reads `17`. They're still on after a reload.
    - `has no accessibility violations with the dialog open`: both themes, and on a phone.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): keep settings in IndexedDB`

---

### Task 4: The Problems pane

**Files:**
- Create:
  - `apps/web/app/editor/problems.ts` (`useProblems`; `mergeFixes`)
  - `apps/web/app/components/ProblemsPane.vue`
  - `apps/web/test/problems.test.ts`
  - `apps/web/e2e/problems.spec.ts`
- Modify: `AppPane.vue` (the tab's count badge and the slim bar), `AppStatusBar.vue` (the count), `e2e/shell.spec.ts` (the phone's tab-name assertion, if the badge changes the tab's text)

**Interfaces (Produces):**
```ts
export interface Problem {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** Mapped to the current text. */
  from: number;
  to: number;
  /** 1-based source line. */
  line: number;
  fix?: { title: string; apply(): void };
}
export function useProblems(): {
  problems: Readonly<ShallowRef<readonly Problem[]>>;
  /** Errors and warnings; info isn't counted (it's advice, not a fault). */
  count: Readonly<ComputedRef<number>>;
  /** Strict Fountain only: applies every Strict rule's fix in one undoable change. */
  fixAll(): void;
};
/** The changes of several fixes computed against one text, sorted, with any fix that overlaps an earlier one left out. */
export function mergeFixes(fixes: readonly { changes: readonly TextChange[] }[]): TextChange[];
```

- The list reads CodeMirror's lint state (`forEachDiagnostic`) after every update, so it shows exactly what the gutter shows, with positions mapped to the current text.
- A fix runs the diagnostic's own action, so it gets `cm-fountain`'s guard against stale text (Plan 2, Task 12).
- **Fix all** lints the current text then and there, so its fixes can't be stale, and dispatches the merged changes as one transaction.
- Each problem is a button reading its severity, message, and line ("Warning: … Line 12"). Choosing it calls `goto(from, { select: { from, to } })`.
- A problem with a fix has a second button, named by the fix's title.
- The Problems tab carries the count as a badge. The status bar reads "No problems", "1 problem", or "N problems".
- The slim bar holds **Fix all** while Strict Fountain is on and there's something to fix.

- [ ] **Step 1: Write the failing tests.**
  - `test/problems.test.ts`:
    - `mergeFixes sorts changes and skips overlapping fixes`
    - `mergeFixes keeps fixes that only touch`
  - `e2e/problems.spec.ts`:
    - `lists a problem as it appears`: type `INT. HALL\n\nShe waits.`, and within a second the list has `heading-no-time`'s message, with line 1 of the new text.
    - `jumps to a problem`: the editor selects its range, and the Source tab shows.
    - `applies a fix`: a manual `(CONT'D)` is removed, and Mod+Z brings it back.
    - `applies no fix to text that changed after linting`: change the text inside a problem's range, then press its fix within 300 ms. The text is left alone, and the list refreshes.
    - `counts problems on the tab and in the status bar`
    - `fixes everything at once in Strict Fountain`: two Strict problems, then **Fix all**, then one Mod+Z undoes both.
    - `has no accessibility violations with problems listed`: both themes, and on a phone.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): list problems, with their fixes`

---

### Task 5: The template switcher

**Files:**
- Create: `apps/web/e2e/template.spec.ts`
- Modify: `app/editor/template.ts` (`useTemplate`; `templateIdOf` and `TEMPLATE_NAMES` came in Plan 3), `AppToolbar.vue` (the chip becomes a menu)

**Interfaces (Produces):**
```ts
export function useTemplate(): {
  id: Readonly<ComputedRef<TemplateId>>;
  /** One undoable change to the metadata block, through `setMeta` (Task 1). */
  choose(id: TemplateId): void;
};
```

- The toolbar chip is a `UDropdownMenu` button reading the template's name, with **Screenplay** and **Stage play** as checkbox items. It drops its `aria-disabled`.
- The session's `template` already follows `templateIdOf(doc)` (Plan 3). A change re-lays out the script and calls `relint()`: the stage play turns off `heading-no-time` and `transition-not-last`.
- An unknown template id falls back to the screenplay. A visible warning about it is deferred, so add it to `docs/DEFERRED.md`.

- [ ] **Step 1: Write the failing tests.**
  - `e2e/template.spec.ts`:
    - `switches to a stage play and back with undo`: the metadata block appears in the source, and the pages re-lay out with the play's act heading. Mod+Z restores the screenplay and the original text.
    - `shows the template in the toolbar and the status bar`
    - `is reachable from the keyboard`
    - `has no accessibility violations with the menu open`
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS, with the whole suite. Then build as Netlify does: `rm -rf apps/web/.output && pnpm --filter @drafter/web... run build`.
- [ ] **Step 5: Commit.** `feat(web): switch templates through the metadata block`

---

### Task 6: Script modules — the host

A **script module** is an optional feature compiled into the app: Drafter's own code, never something downloaded at runtime. That keeps technical design §14's "no plugin API in v1". The module contract below follows §14's sketch, where a module reads the script and hands back edits and problems, so a sandboxed third-party API could reuse it later. This task builds the host, plus a fixture module that only test builds include. No real module ships in Phase 1. The AI Script Doctor (register a Claude API key; read the script; recommend changes) gets its own plan.

**Files:**
- Create:
  - `apps/web/app/modules/types.ts`
  - `apps/web/app/modules/registry.ts`
  - `apps/web/app/modules/context.ts`
  - `apps/web/app/modules/fixture.ts`: the test module
  - `apps/web/app/components/ModuleButtons.vue`
  - `apps/web/app/components/ModulesSettings.vue`
  - `apps/web/test/modules.test.ts`
  - `apps/web/e2e/modules.spec.ts`
- Modify:
  - `app/utils/panes.ts`: tab ids become strings, so module tabs join the core three
  - `AppPane.vue`, `AppToolbar.vue`, `SettingsDialog.vue`
  - `app/commands/registry.ts`
  - `app/editor/problems.ts`
  - `apps/web/package.json`: `e2e` builds with `DRAFTER_TEST_MODULES=1`
  - `nuxt.config.ts`
  - `docs/drafter-phase1-design.md`: a short §5.8, "Script modules", marked Decided 2026-10-26

**Interfaces (Produces):**
```ts
export interface ScriptModule {
  id: string;            // 'script-doctor'
  name: string;          // 'Script Doctor'
  description: string;   // one plain sentence, shown in Settings → Modules
  icon: string;          // an i-lucide-* name; bundled like every icon
  /** What turning it on allows. Shown, and agreed to, before the module is enabled. */
  permissions: { network?: readonly string[] /* origins, e.g. 'https://api.anthropic.com' */ };
  /** The module's round toolbar button. */
  action?: { label: string; run(ctx: ModuleContext): void | Promise<void> };
  /** A tab beside Source, Script, and Problems, shown in either pane. */
  tab?: { id: string; label: string; component: Component };
  commands?(ctx: ModuleContext): readonly Command[];
  /** Its section in Settings → Modules, shown while it's on (where a key would be entered). */
  settings?: Component;
}
export interface ModuleProblem { message: string; from: number; to: number; severity: 'info' | 'warning'; fix?: { title: string; changes: TextChange[] } }
export interface ModuleContext {
  // Read-only views of the script
  source(): string; doc(): Doc; layout(): Layout | null; template(): Template; title(): string;
  /** One undoable change, through the editor. */
  applyChanges(changes: readonly TextChange[]): void;
  /** Replaces this module's items in the Problems pane, labeled with the module's name; they don't count toward the problem total. */
  setProblems(items: readonly ModuleProblem[]): void;
  goto(offset: number): void;
  /** This module's own storage in the settings table (`module:<id>:<key>`), kept in this browser and never written to the script. */
  storage: { get<T>(key: string): Promise<T | undefined>; set<T>(key: string, value: T): Promise<void>; remove(key: string): Promise<void> };
  notify(message: string): void; // a toast and a polite announcement
}
/** Every module found in the repository's `modules/` folder at build time (`import.meta.glob('<root>/modules/*/index.ts', { eager: true })`), plus the fixture when built with DRAFTER_TEST_MODULES=1. */
export const MODULES: readonly ScriptModule[];
export function useModules(): { modules: readonly ScriptModule[]; enabled: Readonly<Ref<readonly string[]>>; setEnabled(id: string, on: boolean): Promise<void> };
```

**Behavior:**
- **Settings → Modules** lists every compiled-in module, with its name, description, and permissions, and an on/off switch. Modules are off by default, and the choice is remembered.
- **Turning on a module with `permissions.network`** first asks, in plain words: "Script Doctor sends your script to api.anthropic.com when you ask it to. Turn it on?" Without a yes, it stays off.
- **Turning a module on adds its parts:**
  - its toolbar button, after **Focus**;
  - its tab, which appears in the tab rows;
  - its commands, in the palette, under its name.

  Turning it off removes them all and clears its problems.
- **On phones,** where the toolbar shows icons only, module buttons stay round icon buttons while they fit at 320px. Past two, they move into a **Modules** menu button.
- **Errors:** a module's `run` that throws or rejects is caught and shown as a toast. It never breaks the editor.
- **The network.** The content security policy stays `connect-src 'self'`. A module that declares network origins can't work until its own plan adds those origins to `scripts/csp.mjs` and updates the Privacy page. Phase 1 design §2 says a script never leaves the device. A module like the Script Doctor changes that to "only when you turn on a module that says so, with your own key". That's the maintainer's decision, recorded when that module is planned.

**The `modules/` folder.** A module is a folder at the repository root, `modules/<id>/`, whose `index.ts` default-exports a `ScriptModule`. The build discovers every such folder, so:
- **On drafter.dev:** the modules are the ones in the repository when it was built, each off until the writer turns it on. A visitor can't add one, because a module is code, and the web version runs only the code drafter.dev serves.
- **In a local install** (`pnpm install`, then `pnpm --filter @drafter/web dev`, or `build` and `preview`): drop a module's folder into `modules/` and restart, and it appears in Settings → Modules. It persists because it's a file in your copy of the repository.
- **Bad modules:** a module whose default export doesn't have the shape above is skipped with a console warning naming its folder, and never breaks the build or the app. Two modules with the same `id` are a build error naming both folders.
- **Documentation:** `modules/README.md` explains how to write one (the contract, the context, a minimal example) and how to install one locally.

**The fixture module** (`fixture.ts`) is included only when the build sets `DRAFTER_TEST_MODULES=1`, through Vite's `define`, so production bundles never contain it. `pnpm e2e` sets it. It has:
- a button, "Count scenes", which calls `setProblems` with one info item per scene heading, reading "Scene N";
- a tab, "Fixture", that lists `title()`;
- a command, "Fixture: add a note", which `applyChanges` with `[[fixture]]` at the cursor;
- `permissions.network: ['https://example.invalid']`, so the consent prompt can be tested.

- [ ] **Step 1: Write the failing tests.**
  - `test/modules.test.ts`:
    - `finds every module folder, and skips a malformed one with a warning`
    - `refuses two modules with the same id`
    - `ships no fixture in a production build`
    - `keeps each module's storage separate`
    - `catches a module that throws`
  - `e2e/modules.spec.ts`, against a build with the fixture:
    - `turns a module on after its network consent, and off again`: the button, tab, and command appear, then disappear.
    - `runs the module's button and lists its problems with their lines`
    - `applies a module's change as one undoable step`
    - `remembers which modules are on after a reload`
    - `reaches the module's button, tab, and command from the keyboard`
    - `fits the toolbar at 320px with a module on`
    - `has no accessibility violations with a module on`: both themes, and on a phone.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.** Also update `e2e/security.spec.ts`, if needed, so it checks the fixture build too.
- [ ] **Step 4: Run them again.** → PASS, with the whole suite. Then build as Netlify does, without the flag, and check the fixture isn't in the output: `grep -r "Count scenes" apps/web/.output/public` finds nothing.
- [ ] **Step 5: Commit.** `feat(web): add a host for script modules`

---

### Task 7: Sample modules

Three small modules show how a module works, and none needs the network. Each is a folder in `modules/` with an `index.ts`, a `README.md`, and its own tests. They're written only against `ModuleContext`, so they double as examples for whoever writes the next module.

**Files:**
- Create:
  - `modules/scene-list/`: **Scene list**
  - `modules/cast/`: **Cast**
  - `modules/notes/`: **Notes**
  - each with `index.ts`, `README.md`, and `index.test.ts` (Vitest, in a `modules` project added to `vitest.shared.ts` and the root config)
  - `apps/web/e2e/sample-modules.spec.ts`
- Modify: `modules/README.md` (it lists the samples)

| Module | Button | Tab | Command |
|---|---|---|---|
| **Scene list** (`scene-list`) | "Scenes": opens its tab. | Every scene heading, numbered, with its page and its length in eighths of a page, from `layout()`. Choosing one calls `goto`. | none |
| **Cast** (`cast`) | "Cast": opens its tab. | Every character, with the number of speeches and the scene of the first appearance. Choosing one goes to the first cue. | "Cast: copy the list" copies the list as plain text. |
| **Notes** (`notes`) | "Notes": calls `setProblems` with one info item per `[[note]]` in the script, so notes join the Problems pane with their line numbers. | none | "Notes: remove all notes" removes every note as one undoable change, after a confirmation that says how many. |

- [ ] **Step 1: Write the failing tests.**
  - Each module's `index.test.ts` runs the module against a fake `ModuleContext` built from a parsed sample script. Its assertions:
    - Scene list: the rows for `samples/screenplay.fountain`.
    - Cast: names, counts, and first scenes.
    - Notes: one problem per note, at the right lines.
    - `removes all notes as one change`.
  - `e2e/sample-modules.spec.ts`:
    - `turns on each sample module and uses it`: the button, the tab or the problems, and a jump to the source.
    - `undoes Notes' removal in one step`
    - `has no accessibility violations with each sample module's tab open`
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS, with the whole suite. Check the samples are in the production build and are off by default.
- [ ] **Step 5: Commit.** `feat(modules): add three sample modules`

---

### Task 8: The app menu, and Revert to Saved

**Files:**
- Create: `apps/web/app/components/AppMenu.vue`, `apps/web/e2e/revert.spec.ts`, `apps/web/e2e/app-menu.spec.ts`
- Modify: `AppToolbar.vue` (the mark opens the app menu), `app/storage/save.ts` (`revertToSaved`), `app/commands/builtin.ts`

**The app menu** (Nuxt UI `UDropdownMenu` on the mark, labeled "Drafter menu") holds:
- New screenplay and New stage play
- Open…
- the recent scripts
- the samples
- Save, Save As…, and Revert to Saved
- Export (Task 10 adds it)
- Settings…
- Help: Keyboard shortcuts and Take the tour arrive in Plan 5.

Each item runs its registered command, so the menu, the palette, and the keys never disagree.

**Revert to Saved:** `revertToSaved(): void`.
- It's enabled while `dirty` and a saved snapshot exists.
- It replaces the editor's text with the saved snapshot in one undoable change.
- It says "Reverted to the text last saved to The Call.fountain. Undo brings your changes back." in a polite live region and a toast.

- [ ] **Step 1: Write the failing tests.**
  - `app-menu.spec.ts`:
    - `opens the app menu from the mark, with the keyboard too`
    - `runs each item's command`
    - `has no accessibility violations with the menu open`: both themes, and on a phone.
  - `revert.spec.ts`:
    - `reverts to the text last saved, and undo brings the changes back`
    - `is unavailable when there's nothing to revert`
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): add the app menu and Revert to Saved`

---

### Task 9: A file changed somewhere else

**Files:**
- Create: `apps/web/app/storage/check.ts` (`compareVersions`, `useFileCheck`), `apps/web/app/components/FileBar.vue`, `apps/web/app/components/BothChangedDialog.vue`, `apps/web/test/check.test.ts`, `apps/web/e2e/changed.spec.ts`
- Modify: `app/storage/script.ts`, `app/storage/save.ts` (check before writing)

**Interfaces (Produces):**
```ts
export type Comparison = 'same' | 'file-changed' | 'browser-changed' | 'both-changed';
/** savedHash is the text as last saved; the file and the browser each changed if their hash differs from it. */
export function compareVersions(hashes: { saved: string; file: string; browser: string }): Comparison;
export function useFileCheck(): { check(): Promise<void> }; // runs on open, on window focus, and before Save writes
```

**The flow** (Phase 1 design §9.6):

| Situation | What happens |
|---|---|
| The handle's permission isn't `granted` | The script opens read-only under the bar "This script is saved in The Call.fountain", with **Check for changes**. That button asks for permission and checks in one click. |
| `same` or `browser-changed` | Nothing; editing goes on. |
| `file-changed` | The file wins. Its text replaces the editor's as one change, and a toast and the live region say "Updated from The Call.fountain." |
| `both-changed` | A dialog asks which to keep working on: **Open the file** or **Keep this browser's version**. The other is kept as a new script named "The Call (from the file)" or "The Call (this browser's copy)", so nothing is lost. |
| The file can't be read (`NotFoundError`, or `NotReadableError`) | The bar reads "Drafter can't find The Call.fountain. It may have been moved or deleted.", with **Save As** and **Edit this browser's copy**. The second unbinds the handle. |

Before **Save** writes, the same check runs. When the file changed, the save stops and the dialog takes over.

- [ ] **Step 1: Write the failing tests.**
  - `test/check.test.ts`: `compares the saved, file, and browser versions`, covering all four results.
  - `e2e/changed.spec.ts` (Chromium, with the stub):
    - `loads the file when only the file changed`: the test rewrites the private file, then focuses the window.
    - `keeps both versions when the file and the browser both changed`: both choices, and in each the other script exists.
    - `stops a save that would overwrite a changed file`
    - `offers Save As when the file is gone`
    - `opens read-only until the file can be checked`: permission is stubbed as `prompt`.
    - `has no accessibility violations with the bar and the dialog showing`
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): check for a file changed somewhere else`

---

### Task 10: Export

**Files:**
- Create: `apps/web/app/workers/export.worker.ts`, `apps/web/app/storage/export.ts`, `apps/web/app/components/ExportMenu.vue`, `apps/web/e2e/export.spec.ts`
- Modify: `apps/web/package.json` and `docs/DEPENDENCIES.md` (`@drafter/render-pdf`, `@drafter/render-text`), `AppToolbar.vue` (**Export** opens the menu), `AppMenu.vue`, `app/commands/builtin.ts`

**Interfaces (Produces):**
```ts
type ExportRequest = { kind: 'pdf' | 'txt'; source: string; template: Template };
type ExportReply = { data: Uint8Array | string } | { error: string };
export function exportScript(kind: 'pdf' | 'txt'): Promise<'saved' | 'cancelled'>;
```

- **The worker** parses and paginates, then calls `renderPdf(layout, template, { fonts })` or `renderText(layout, template)`.
  - It fetches the four Courier Prime files once, from `/fonts/courier-prime/` (`FONT_FILES`), and keeps them.
  - Plain text is what `drafter build --txt` writes.
- **Saving the export:**
  - Where `showSaveFilePicker` exists, the picker suggests `fileNameFor(title, '.pdf')`, or `'.txt'`.
  - Elsewhere, the export downloads.
- **The menu** (toolbar **Export**, and the app menu) offers **PDF** and **Plain text (.txt)**.
- A toast says when the export is ready. Errors show as a toast and never throw.

- [ ] **Step 1: Write the failing tests** (`e2e/export.spec.ts`).
  - `exports the sample as a PDF`: it downloads with the pickers removed, the bytes start with `%PDF-`, and the file is named after the title.
  - `exports plain text that matches the command line`: the text equals `node packages/cli/dist/index.js build samples/screenplay.fountain --txt`'s output, run in the test's setup.
  - `exports through the save picker where the browser has one` (Chromium, with the stub)
  - `has no accessibility violations with the export menu open`
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS, with the whole suite. Then build as Netlify does: `rm -rf apps/web/.output && pnpm --filter @drafter/web... run build`.
- [ ] **Step 5: Commit.** `feat(web): export PDF and plain text`

---

**Plan 4 is done when** these all work, from the keyboard, passing axe in both themes and on a phone, and in every engine:
- the palette, the app menu, settings, and line numbers
- Problems with their fixes
- the template switcher, the module host with its test fixture and local `modules/` folder, and the three sample modules
- Revert to Saved, the changed-elsewhere check, and both exports

The branch then merges to `main`, and drafter.dev deploys it.
