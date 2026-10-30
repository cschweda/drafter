# A Fresh Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle Drafter's web and desktop app to the approved "calm, paper-first" look — two bars, the editor always left and an Inspector right, paper pages, one icon/button/dialog system, designed Stats and Scaffold, a real phone layout — and fix the six bugs the review found.

**Architecture:** New design tokens replace `tokens.css`'s twenty (old names aliased until the end), then the frame (top bar, panes, status bar) is rebuilt on them, then shared components (buttons, menus, one dialog shell), then the views, then the narrow/phone layout. Behaviour, commands, accessible names and test hooks are kept; where a control moves, its command and palette entry stay the same.

**Tech Stack:** Vue 3.5, Nuxt 4, Nuxt UI 4, Tailwind 4, @nuxtjs/color-mode, CodeMirror 6, Lucide icons (`@iconify-json/lucide`), native `<dialog>`, Playwright, Vitest, axe.

**Spec:** `docs/drafter-fresh-look-design.md` (approved 2026-10-30; 21 Calls). The approved mockup: `.superpowers/brainstorm/88841-1793393198/content/fresh-look.html` (local).

**Starts from:** main after v0.22.0 (HTML and EPUB) merges. Ships as v0.23.0.

## Global Constraints

- Tokens (design §2) are the only colours in component styles; no hex literals outside `tokens.css` (and the brand mark's own SVG).
- AA contrast for every text/surface pair in both themes; `--faint` only for disabled/decorative text.
- At most two bars above the writing on a wide screen; the element bar never clips.
- Every existing command, palette entry, keyboard shortcut, accessible name, landmark, and `data-tour` target keeps working (renamed targets updated in the tour and its tests in the same task).
- Focus rings on controls only; programmatically focused non-controls (`tabindex="-1"` headings, the editor container, focus mode's frame) show none; WCAG 2.4.7/2.4.11 still met on every control.
- Motion: 140 ms `cubic-bezier(.2,.8,.2,1)`, fade + 4 px slide; none under `prefers-reduced-motion`.
- Pages: paper (`--paper`/`--paper-ink`) by default in both themes, full height (already), hairline + soft shadow, 24 px gaps; the Page colour setting (Paper · Dark) is app-wide and on-screen only — never print, PDF, or exports.
- Below 1024 px: one pane with the bottom tab bar (Write · Script · Outline · More); status bar from 640 px up only; a phone opens on Write.
- No regression in any existing budget (typing long-task, first paint, export times).
- Gates with `set -e`; never `(cmd; echo $?)`; build packages before typecheck; e2e never on 4190; never kill processes you didn't start; no Co-Authored-By or AI trailer.

## Review Focus

1. **Screen-reader and keyboard users after the move:** F6 between editor and Inspector, the tablist's arrow keys, Escape from menus/sheets, and the skip link all still work, and every moved control keeps its accessible name. → Task 3 (panes), Task 9 (phone).
2. **A long title or a long template name** in the top bar's title and chip: truncates with an ellipsis and a tooltip, never pushes the search off-screen. → Task 2.
3. **200% browser zoom / text size Large** (the app's text-size setting) at 1280 px: two bars still fit, no clipped controls, the Inspector's tabs fold into More. → Task 3, Task 4.
4. **Light theme with Page colour Dark, and dark theme with Paper:** Show changes marks, scene numbers, and notes on pages stay AA on both page colours. → Task 5.
5. **Phone with the on-screen keyboard open:** the element row sits above the keyboard and never covers the line being typed; rotating the phone keeps it attached. → Task 9.

---

### Task 1: Tokens, focus, and motion

**Files:** Modify `apps/web/app/assets/css/tokens.css`, `main.css` (global `:focus-visible` at 26–29), `apps/web/app/app.config.ts`, `apps/web/app/editor/theme.ts:20` (the `.cm-focused` outline), `tour.css` (colours to tokens); Test `apps/web/test/tokens.test.ts`, `apps/web/e2e/shell.spec.ts:135`.

**Interfaces — Produces:** tokens (design §2) `--bg --surface --raised --overlay --border --text --muted --faint --accent --accent-soft --on-accent --accent-text --focus --desk --paper --paper-ink`, radii `--radius-sm/--radius/--radius-lg`, motion `--ease`, `--dur`; old names (`--chrome`, `--chrome-2`, `--line`, `--heading`, `--tab-on`, `--page`, `--ink`, …) defined as aliases of the new ones (removed in Task 10). A utility class `.motion` (opacity + translateY 4px, `--dur`, `--ease`) disabled under reduced motion.

- [ ] **Step 1: failing tests.** `tokens.test.ts`: `both themes define every new token`; `every text token is AA on every surface it sits on` (pairs: text/muted/accent-text on bg, surface, raised, overlay; on-accent on accent; paper-ink on paper; existing diff/chart pairs re-run on the new surfaces); `--faint is used only by disabled or decorative rules` (grep the components' styles for `var(--faint)` and match an allow-list). e2e `shell.spec.ts`: `shows a focus ring on every control` updated — a `tabindex="-1"` heading focused by script and the editor container show `outline-style: none`; buttons, tabs, links, and inputs show the 2 px ring.
- [ ] **Step 2: run** → FAIL.
- [ ] **Step 3: implement.** Global rule: `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }` and `[tabindex="-1"]:focus, .cm-editor.cm-focused { outline: none }` (the caret and the current-line bar show editor focus); `app.config.ts` primary/neutral mapped to the tokens.
- [ ] **Step 4: run** the tests plus `a11y.spec.ts` (both themes) → PASS.
- [ ] **Step 5: commit** `feat(web): the fresh look's tokens, focus rings on controls only, and one motion`

### Task 2: The top bar

**Files:** Modify `components/AppToolbar.vue`, `AppMenu.vue` (gains the Template section's chip-free entry and keeps everything it has), `components/SampleBar.vue` and `StorageWarning.vue` (become the title chip's menu and a status-bar chip + toast), `ModuleButtons.vue` (no circle colours), `StructureStrip.vue` (restyled to the tokens), `pages/index.vue` (`.top` order); Test `e2e/a11y.spec.ts:586` (the banner's aria snapshot), `e2e/shell.spec.ts:41, 248`, `e2e/phone.spec.ts:37–84`, `e2e/first-visit.spec.ts:121, 238, 248, 261`, `e2e/recovery.spec.ts`.

**Interfaces — Produces:** the banner's controls in order: Drafter menu (mark + wordmark, `aria-label="Drafter menu"`, `data-tour="menu"`), the title, the state chip (`aria-label` "Sample: start your own" → menu with New screenplay / New stage play / New Markdown document / Open a file…; or "Read-only"), Open, Save (`data-tour="save"`), Export (`data-tour="export"`), the palette chip (`data-tour="palette"`), Structure strip (`aria-pressed`), Focus (`#focus-button`, `data-tour="focus"`), Theme. The template moves into the Drafter menu (already there) and the status bar (Task 6); `data-tour="template"` moves with it.

- [ ] **Step 1: failing tests.** Update the aria snapshot to the new order; `keeps the toolbar to one 44px bar` (bounding box ≤ 48); `the title and chip truncate without pushing the search off-screen` (a 120-character title at 1280 px: search box fully visible, title has an ellipsis and a `title` tooltip); `the sample chip offers New screenplay, New stage play, New Markdown document, and Open a file…`; `the storage warning is a status chip and a one-time toast, not a banner`; `no element above the panes is taller than the toolbar` except the Structure strip and a blocking error; phone `reaches every action at 320px` updated.
- [ ] **Step 2: run** → FAIL.
- [ ] **Step 3: implement** (Lucide icons 16 px, borderless 30×30 buttons, labels drop below 1024 px with tooltips).
- [ ] **Step 4: run** the tests plus `tour.spec.ts`, `template.spec.ts`, `markdown.spec.ts`, `offline.spec.ts` → PASS.
- [ ] **Step 5: commit** `feat(web): one quiet top bar, the Drafter mark still the menu`

### Task 3: The editor and the Inspector

**Files:** Modify `app/utils/panes.ts`, `composables/usePanes.ts`, `components/AppPane.vue`, `SourcePane.vue`, `commands/builtin.ts:150–164` (`showTab`), `stats/tab.ts`, `scaffold/show.ts`, `compare/use-compare.ts`, `history/deleted.ts`, `modules/context.ts:163`, `editor/session.ts:251`, `AppTour.vue` (`reveal`), `pages/index.vue` (subgrid rows); Create `components/InspectorTools.vue` (the header's Teleport target); Test `apps/web/test/panes.test.ts`, `compare-tabs.test.ts`, `stats-tab.test.ts`, `e2e/shell.spec.ts`, `tabs.spec.ts`, `pane-align.spec.ts`, `tour.spec.ts:382`.

**Interfaces — Produces:**
```ts
// utils/panes.ts — the left pane is always the editor on a wide screen
export type InspectorTabId = 'script' | 'preview' | 'outline' | 'cards' | 'stats' | 'scaffold' | 'notes' | 'problems' | 'compare' | 'deleted' | `module:${string}`;
export function inspectorTabs(kind: DocumentKind): { row: InspectorTabId[]; more: InspectorTabId[] };
export function showInInspector(state: PaneState, tab: InspectorTabId): PaneState;   // replaces chooseTab/revealTab/openBeside/openCompare for the wide layout
export const INSPECTOR_TOOLS_ID = 'inspector-tools';                                   // the Teleport target
```
`chooseTab`'s swap rule, `revealTab`'s pane choice, and `comparePane` go; every caller uses `showInInspector` (wide) or the phone tab (Task 9). Each view's tools (`OutlineSlim`, `CardsSlim`, `StatsSlim`, `ScaffoldSlim`, the Script's page label/Changes/Fit·100%) render into `#inspector-tools` via `<Teleport>`; when the header is too narrow the tools fold into a "⋯" menu, then tabs move into More ▾ from the right (ResizeObserver, no fixed count). The editor pane's 36 px header holds the element bar (Task 4) and the icon toggles (Line numbers, Typewriter, Sync scrolling, `aria-pressed`); the editor's current line gets a 2 px accent bar at the left and a faint tint (`editor/theme.ts`).

- [ ] **Step 1: failing tests.** `panes.test.ts`: `a script's Inspector row is Script, Outline, Cards, Stats, Scaffold; More holds Notes, Problems, Compare, Deleted scenes, and module tabs`; `a Markdown document's row is Preview and Stats; More holds Problems and Compare`; `showInInspector never touches the editor pane`. e2e: `Show Script keeps the editor on the left` (bug 1); `a view opened from the palette appears once, in the Inspector` (bug 2); `F6 moves between the editor and the Inspector`; `the Inspector's tabs fold into More when narrow, at 200% zoom too` (Review Focus 3); `the Script's tools sit in the Inspector header`; tour `brings the Problems pane in and puts the layout back`.
- [ ] **Step 2: run** → FAIL.
- [ ] **Step 3: implement.**
- [ ] **Step 4: run** the tests plus every spec that opens a tab (`outline`, `cards`, `notes`, `stats`, `scaffold`, `scaffold-pages`, `character-grid`, `compare`, `compare-changes`, `deleted-scenes`, `modules`, `panel-keys`, `editor`, `script`) on all five projects → PASS.
- [ ] **Step 5: commit** `feat(web): the editor always on the left, every other view in the Inspector`

### Task 4: The element bar that never clips

**Files:** Modify `components/ElementBar.vue`, `editor/element-bar.ts` (marks become tooltips); Test `e2e/element-bar.spec.ts`.

- [ ] **Step 1: failing tests:** `never clips at 1280 and 1440 with two panes, at text size Large too` (`scrollWidth <= clientWidth`); `collapses to the current element and More when narrow`; `marks show as tooltips, not inline`; `hidden when the editor doesn't have focus, replaced by the script's title` (and keyboard users can still reach it: it shows while focus is anywhere in the editor pane).
- [ ] **Step 2–4:** run → FAIL; implement (ResizeObserver; chips 12/500, current `--accent-soft`); run plus `keyboard.spec.ts`, `phone.spec.ts` → PASS.
- [ ] **Step 5: commit** `feat(web): an element bar that fits, folding into More instead of clipping`

### Task 5: Paper on a desk, and the Page colour setting

**Files:** Modify `components/ScriptPane.vue` (245–276: desk, paper, hairline, shadow, 24 px gaps, 24 px above the first page), `ComparePane.vue` (215–320), `settings/settings.ts` (`pageColor: 'paper' | 'dark'`, default `'paper'`), `SettingsDialog.vue`; Test `tokens.test.ts`, `e2e/script.spec.ts`, `show-changes.spec.ts`, `settings.spec.ts`.

- [ ] **Step 1: failing tests:** `the page is paper on the desk in both themes`; `Page colour Dark gives today's dark page`; `Show changes marks, scene numbers, and notes on pages are AA on both page colours in both themes` (Review Focus 4); `print and the PDF are unchanged` (the export bytes for a sample are identical before/after).
- [ ] **Step 2–4:** run → FAIL; implement; run → PASS.
- [ ] **Step 5: commit** `feat(web): pages as paper on a desk, with a Page colour setting`

### Task 6: The status bar

**Files:** Modify `components/AppStatusBar.vue` (225–247 dotted underlines go; items as borderless buttons; left: save state with a dot + file name, the recovery chip only when it matters; right: pages · running time, words, problems, the template (with `data-tour="template"` from Task 2)); Test `e2e/save.spec.ts`, `recovery.spec.ts`, `revert.spec.ts`, `snapshots.spec.ts`, `history.spec.ts`, `a11y.spec.ts`.

- [ ] **Step 1: failing tests:** `the status bar is one 24px row`; `nothing in it repeats the top bar or the Inspector` (no "Page 1 of 2" when the Script is shown; no sample notice); `no dotted underlines`; `hidden below 640px`; the existing History/Recovery/counts tests updated to the new names.
- [ ] **Step 2–4:** run → FAIL; implement; run → PASS.
- [ ] **Step 5: commit** `feat(web): a quiet status bar that repeats nothing`

### Task 7: Buttons, menus, and one dialog

**Files:** Create `components/ui/DButton.vue` (variants `primary | secondary | borderless | icon`), `components/ui/DSegmented.vue`, `components/ui/DDialog.vue` (wraps native `<dialog>` + `showModal()`: `--raised`, radius 12, 24 px padding, title 18/600, backdrop, widths `sm 440 | md 560 | lg 760`, the motion, focus return); Modify every dialog component (About, BothChanged, ExportOptions, History, Markdown, ModuleConfirm, MoveTo, NewNote, NoteCategory, NoteFilters, Remove, SameTitle, SceneDetails, SceneHistory, Settings, SnapshotLabel, Treatment, UpdateCheck) to use `DDialog`; menus/popovers (`MenuButton`, `CountsPanel`, `CommandPalette`) to the menu style; `SettingsDialog.vue` gains a section list (General, Writing, Script, Spelling, Files, Modules, About); `tour.css` restyles the welcome/intro/tour cards to the dialog style (no slate gradient, no blue button) sized to content; Test `a11y.spec.ts`, `settings.spec.ts`, `tour.spec.ts`, `test/tour-colors.test.ts`.

- [ ] **Step 1: failing tests:** `every dialog uses one style` (computed background, radius, backdrop on each); `Escape closes and focus returns to the opener` for each; `Settings has sections and every setting is still reachable by keyboard`; `the tour's buttons are the primary button, not blue`; `the welcome card is 440px and sized to its content`; reduced motion → no transition.
- [ ] **Step 2–4:** run → FAIL; implement; run plus every dialog's spec → PASS.
- [ ] **Step 5: commit** `feat(web): one button system, one menu style, and one dialog`

### Task 8: Stats, Scaffold, Cards, and empty states

**Files:** Modify `StatsPane.vue`, `StatsOverview.vue` (stat tiles for Pages, Scenes, Words, Running time; INT/EXT and DAY/NIGHT as two stacked bars), `StatsCharacters.vue` (124–152: the header overlap — bug 3), `CharacterGrid.vue`, `ScaffoldPane.vue`, `ScaffoldScene.vue`, `ScaffoldTable.vue`, `ScaffoldLists.vue`, `CardsPane`/card component (no synopsis → first action line in `--muted`), `ProblemsPane.vue` and the other empty states (centred icon + sentence), `HistoryDialog.vue`'s list and every other data table to the table style of design §5 (36 px rows, hairlines, sticky header, tabular figures, links underlined on hover); Test `e2e/stats.spec.ts`, `character-grid.spec.ts`, `scaffold*.spec.ts`, `cards.spec.ts`, `a11y.spec.ts`.

- [ ] **Step 1: failing tests:** `Stats column headers never overlap` (bounding boxes, both themes, text size Large); `jumping to a section leaves its heading fully visible` (scroll-margin-top); `stat tiles show pages, scenes, words, running time`; `the INT/EXT and DAY/NIGHT bars have their numbers as text`; `a card with no synopsis shows its first action line`; `No problems is centred with a check`.
- [ ] **Step 2–4:** run → FAIL; implement (centred 720 px column, page title 20/600, explanations behind an (i) popover); run → PASS.
- [ ] **Step 5: commit** `feat(web): Stats and Scaffold as designed pages, cards that are never empty, calm empty states`

### Task 9: One pane below 1024 px, and the phone

**Files:** Create `components/BottomTabBar.vue` (Write · Script · Outline · More; 56 px; touch targets ≥ 44 px); Modify `utils/panes.ts` (`PHONE_DEFAULT_TAB = 'source'`, the More list), `pages/index.vue`, `ElementBar.vue` (above the keyboard via `visualViewport`), `MenuButton`/`CommandPalette` (bottom sheets below 640 px via Nuxt UI `UDrawer` or a sheet variant of `DDialog`), `tour/tour.config.ts` (`buildSteps(wide)`: absent targets point at the Drafter menu or More); Test `e2e/phone.spec.ts`, `shell.spec.ts:174–264`, `tour.spec.ts:347`, `test/tour.test.ts:16`.

- [ ] **Step 1: failing tests:** `a phone opens on Write` (bug: opened on Script); `the bottom tab bar switches Write, Script, Outline, and More`; `between 640 and 1023px it's one pane with the bottom bar and a status bar`; `the element row sits above the on-screen keyboard and never covers the typed line, also after rotating` (Review Focus 5; emulate `visualViewport` resize); `menus and the palette open as bottom sheets on a phone`; `the tour keeps ten steps on a phone, each pointing at something on screen`.
- [ ] **Step 2–4:** run → FAIL; implement; run on phone and phone-webkit plus a 800×1000 context → PASS.
- [ ] **Step 5: commit** `feat(web): one pane and a bottom tab bar below 1024px, made for a phone`

### Task 10: Theme default, clean-up, screenshots, and docs

**Files:** Modify `settings/apply.ts` + `settings/appearance.ts` (a fresh visit — `isFirstVisit()` and no `nuxt-color-mode` stored — matches the system; otherwise unchanged), `tokens.css` (remove the old aliases once nothing uses them), `scripts/` (commit the screenshot sweep as `apps/web/scripts/ui-shots.mjs`, run from apps/web, both themes, 1440×900 and iPhone 14), `docs/images/drafter-ide-dark.png` and `-light.png` (retaken), README (the screenshots; What you can do today stays accurate), help pages for moved controls, CHANGELOG `[Unreleased]`, DECISIONS (the Calls as they landed), `docs/drafter-phase2-design.md` §22; Test `test/appearance.test.ts`, `e2e/settings.spec.ts:84`.

- [ ] **Step 1: failing tests:** `a fresh visit on a light system opens light` (bug 6); `a returning visitor's theme is untouched`; `no component uses an old token name` (grep), then remove the aliases.
- [ ] **Step 2–3:** run → FAIL; implement; run the sweep and look at every image (Review Focus 2–5 by eye too).
- [ ] **Step 4: full gates:** `set -e; pnpm install; pnpm -r --filter "./packages/*" build; pnpm check; pnpm -r typecheck; pnpm test` (timing failures re-run alone), a clean-checkout web build (`rm -rf packages/*/dist` then build), the full web e2e on all five projects, and `pnpm --filter @drafter/desktop e2e`.
- [ ] **Step 5: commit** `docs: the fresh look in the README, the help, and the decisions, with new screenshots`
