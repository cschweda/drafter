# Seeing the script (v0.20.0 and v0.21.0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 2's Plan E in two releases (design Call 1).

- **Part 1, v0.20.0, Scaffold and the Stats tab:** who is in each scene, speaking or silent, by §16's rule with the spell dictionary; the Stats tab replacing the window, with Characters (screen time, dialogue share, most often with) and the character-by-scene grid with its long absences; and **Scaffold**, a tab beside the script with a scene page that follows the cursor, a page for each character and each location, and the cast and places lists.
- **Part 2, v0.21.0, storylines, the map, and pacing:** storylines tagged, named, colored, renamed, and shown as chips, in the Outline's Timeline, and in the Script pane's margin; the script map as the Structure strip's **Color by**; and the pacing view with its guides, with Storylines and Pacing sections in the Stats tab.

**Architecture:** The scene index (`@drafter/outline`) gains `speeches` per scene and an `opening` tally, so speeches are counted once. A new pure package, `@drafter/cast`, works out presence, locations, and every per-character and per-location figure from the index, the parse, and an `isWord` answer that the spell worker gives. In `apps/web`, `useCast` computes the cast on the main thread only while a view needs it, after typing pauses. The Stats tab and Scaffold are view tabs. In Part 2, `@drafter/notes` gains storyline names, colors, and rename; `@drafter/outline` gains `storylineLanes` and `pacingSeries` on the strip's axis; the Timeline, the margin marks (through `decorate`), the strip's Color by, and the pacing chart read them.

**Tech Stack:** TypeScript, Vue 3.5 / Nuxt 4 / Nuxt UI 4, CodeMirror 6, Vitest with fast-check, Playwright 1.64, `@axe-core/playwright`. No new third-party dependency.

**Spec:** [`docs/drafter-seeing-the-script-design.md`](../drafter-seeing-the-script-design.md) (all of it; its 45 Calls are binding once the controller rules). Context: Phase 2 design §5.1 (scene index), §5.3–5.5 (keyed notes, headers, metadata), §5.7 (rules every view follows), §13–16, §22 (Plan E and Scaffold); the [Structure strip design](../drafter-structure-strip-design.md) §3, §4, §10; the [out-the-door design](../drafter-out-the-door-design.md) §3 (rates, `TimingTally`); `docs/DECISIONS.md` § Version history (`decorate`, `keywords`, axe on every view) and 2026-10-29 (growth-based timing tests).

## Global Constraints

- Branch `seeing-the-script` (worktree `scratchpad/drafter-se`), from `main` at v0.19.0 (`818ecf7`). Part 1 ends at Task 8 with a push of this branch; the controller merges and releases v0.20.0. **Part 2 starts from `main` after v0.20.0 is merged:** merge `main` into this branch (or branch `seeing-the-script-2` from it), then `pnpm install`, before Task 9.
- **The name is Scaffold.** Never "X-Ray" or "x-ray" in the UI, the code, the help pages, the README, the changelog, DECISIONS, or the palette's search words. The maintainer's message is quoted only in the design's "Asked for".
- **Clean room:** no code, markup, stylesheets, icons, or words from any streaming service's cast panel, any screenwriting app, any script-breakdown tool, or any beat-sheet book or brand. Presence, the figures, the charts, and the guides' labels are written for Drafter from the design. Every test script is original text written for Drafter, and generated scripts use invented words.
- **No new third-party dependency.** `@drafter/cast` depends on `@drafter/fountain`, `@drafter/outline`, and `@drafter/templates` (workspace) only. It gets a `docs/DEPENDENCIES.md` row (workspace package, no third-party code) in Task 2 before `apps/web` adds it. The charts are plain SVG.
- **Nothing is written to the file unasked.** Views read the script. The only edits are the writer's own: Storylines…, rename, merge, remove, a storyline's name or color, and the pacing guide, each one transaction through `useOutline().apply` (one undo), refused with its reason in a read-only tab. Storyline colors are shown, not written, until chosen (Call 31). Margin marks never print or export.
- **Count nothing twice.** Speeches, words, and timing come from the scene index (`speeches`, `spokenBy`, `timing`, `opening`). `characterTable`'s own pass is removed in Task 4. Scaffold, Stats, and the grid read one `Cast`.
- **Copy (exact):** "Scaffold"; "Follow the cursor"; "The cursor is before the first scene."; "In this scene ({n})"; "First seen here"; "Silent"; "Time speaking"; "{n} more" (other scenes); "This scene’s heading doesn’t name a place."; "In {n} of {m} scenes. First in scene {a} (page {p}); last in scene {b} (page {q})."; "Show all {n} speeches"; "When the pages are ready"; "Screen time waits for the pages."; "{NAME}: absent from page {a} to page {b} ({n} pages)."; "No one speaks yet. A character’s cue starts their row."; "A Markdown document has no scenes."; "List"; Part 2: "Storylines…"; "New storyline"; "Renamed storyline {a} to {b} in {n} scenes."; "{b} is already a storyline. Merge {a} into it?"; "Remove from every scene…"; "No storyline"; "No storylines yet. Add one from a scene’s menu: Storylines…"; "Color by"; "Inside or outside"; "Day or night"; "A guide, not a rule."; "Pacing waits for the pages."; "Longest scene: {heading}, {length}. Dialogue share is highest on pages {a} to {b}."
- **Budgets** (design §11): the scene index no more than 10% slower than v0.19.0's; `castOf` ≤ 15 ms for a 120-page script; Scaffold's scene page ≤ 4 ms after the cursor rests; the Stats tab open ≤ 300 ms; the grid's first paint ≤ 200 ms (120 × 30, and 300 × 60 with windowing); no long task while typing with Stats or Scaffold shown; Part 2: `storylineLanes` ≤ 10 ms, `pacingSeries` ≤ 20 ms, margin marks ≤ 2 ms per page. Unit timing is by growth (`scaling`: n and 4n, growth under 8, copied as `packages/outline/test/scaling.ts` was). Each e2e logs its time and fails only past 10× the budget (hang guard). Measured times go in DECISIONS.
- **Accessibility:** WCAG 2.2 AA, as the rest of Drafter. Every chart has an equivalent table that focus reaches. The grid follows the ARIA grid pattern. Keyboard reaches everything. Never color alone. Both themes, and phones (List toggles). **Axe runs on every new view in this release, in both themes at both widths** (Call 45, the v0.18.0 ruling). Each view task adds its axe states to `e2e/a11y.spec.ts`. Only the screen-reader listening pass waits for the final steps.
- **Personal project.** No employer names anywhere.
- Every task: tests first and watched failing; then `pnpm test`, `pnpm check`, `pnpm -r typecheck` green; `apps/web` e2e (with `E2E_PORT=4175`, after `cd apps/web && rm -rf .output && DRAFTER_TEST_MODULES=1 NETLIFY=true pnpm build`) for the specs the task touches; a CHANGELOG entry under `[Unreleased]` in the writer's words; choices in `docs/DECISIONS.md` under a new `## Seeing the script (`@drafter/outline`, `@drafter/cast`, `@drafter/notes`, `apps/web`)` section (each Call a line when it lands); conventional commits with **no AI co-author trailer and no session link**; the README kept in sync (Tasks 8 and 16 do the status line, roadmap, packages, and features).

## Review Focus

1. **Presence on hard names** ("Will", "Hope", "Grace", "THE DRIVER", "ANN LEE" next to "ANN", "McCLANE", possessives `TOM'S` and `Tom’s`, a name at the start of a sentence, a name only in dialogue or a parenthetical, a name in a note or the boneyard): each counts exactly as design §3.2 says, before and after the dictionary answers. Task 2's fixtures `Will counts only in capitals`, `ANN LEE is not also ANN`, `a name in dialogue is not presence`, and Task 3's `before the dictionary answers, names count only in capitals`.
2. **One count, everywhere** (a dual-dialogue pair, a lyric, a speech before the first scene, a cue with only a parenthetical, a forced `@` name, names that differ in case): the Stats tab, Scaffold, and the grid show the same numbers, and they equal the scene index's. Task 1's property `speeches add up to spokenBy`, Task 2's property `shares add up to 100%`, and Task 7's e2e `Scaffold's figures match the Stats tab's`.
3. **Cheap while typing** (a 120-page and a 300-page script, typing fast with Stats or Scaffold shown, the layout lagging, the dictionary loading): no long task; the panel never flickers to empty; a lagging layout keeps the last pages-based figures, as the strip does (`nextView`). Task 3's `typing with Scaffold shown makes no long task`, Task 5's `a 300-scene grid paints within budget`.
4. **Storyline edits keep the file exact** (rename with labels in many notes, mixed case, a merge, a label inside a list `A, B, C`, a scene with two Storyline notes, an unclosed `/*`, a read-only tab): one undo, nothing else in the text changes, and `print(parse(text)) === text`. Task 9's properties `rename changes only Storyline notes and the metadata block` and `rename then rename back restores the text`.
5. **The fifteen-mark guide's labels** (design Call 41): plain, Drafter's own, and owing nothing to any book's beat names. The controller is asked to confirm or replace them before Task 15.

---

## Part 1 — v0.20.0: Scaffold and the Stats tab

### Task 1: Speeches in the scene index (`@drafter/outline`)

**Files:**
- Modify: `packages/outline/src/{timing.ts,scene-index.ts,types.ts,index.ts}`, `packages/outline/README.md`
- Test: `packages/outline/test/{timing.test.ts,scene-index.test.ts,timing.properties.test.ts}`, create `packages/outline/test/scene-index-scaling.test.ts`

**Interfaces (Produces):**
```ts
// types.ts
export interface Speech { name: string; block: number; words: number } // name as `speakers` gives it
export interface Scene { /* … */ speeches: Speech[] }
export interface Opening { speeches: Speech[]; spokenBy: Record<string, number>; timing: Timing }
export interface SceneIndex { /* … */ opening: Opening | null } // null when no speech is before the first scene
// timing.ts
export class TimingTally { /* … */ speeches(): ReadonlyArray<{ key: string; block: number; words: number }> } // key: name in capitals
```

- `TimingTally` records each speech when it opens (its cue's block) and adds its words as its parts come. `sceneIndex` maps keys to names as `speakers` does. The opening tally runs over the preamble's blocks in the same loop that finds the first structural block.

- [ ] **Step 1: Write the failing tests.** `timing.test.ts`: `records one speech per cue with its words`, `a cue with only a parenthetical is a speech of 0 words`, `both sides of a dual pair are speeches in full`, `a lyric's words are the speech's`. `scene-index.test.ts`: `each scene lists its speeches in order`, `speeches before the first scene are the opening`, `no opening without a speech before the first scene`, `a forced @McCLANE keeps its name`. `timing.properties.test.ts` (Outline's arbitraries): `speeches add up to spokenBy for every scene and the opening`, `timing is unchanged by recording speeches`. `scene-index-scaling.test.ts`: `sceneIndex grows linearly` (logs the time against a baseline run without speeches, for DECISIONS).
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/outline test` → FAIL.
- [ ] **Step 3: Implement** in `timing.ts`, then `scene-index.ts`; export `Speech` and `Opening`.
- [ ] **Step 4: Run them again,** plus `pnpm -r typecheck` (the app's `EMPTY` index needs `opening: null`). → PASS.
- [ ] **Step 5: Commit.** `feat(outline): each scene's speeches, and the speeches before the first scene`

---

### Task 2: Presence, locations, and figures (`@drafter/cast`)

**Files:**
- Create: `packages/cast/{package.json,README.md,tsconfig.json,tsdown.config.ts,vitest.config.ts}`, `packages/cast/src/{index.ts,names.ts,presence.ts,place.ts,figures.ts,absences.ts,grid.ts}`, `packages/cast/test/{scripts.ts,arbitraries.ts,names.test.ts,presence.test.ts,place.test.ts,figures.test.ts,absences.test.ts,grid.test.ts,cast.properties.test.ts,scaling.test.ts,scaling.ts}`
- Modify: `docs/DEPENDENCIES.md` (first: a row for `@drafter/cast`)

**Interfaces (Consumes):** `Doc`, `Block` (`@drafter/fountain`); `SceneIndex`, `Scene`, `Speech`, `structureStrip`, `linesPerPage` (`@drafter/outline`); `Template` (`@drafter/templates`). **(Produces):**
```ts
export type IsWord = (name: string) => boolean | undefined; // undefined: not known yet → capitals only (Call 7)
export interface Character { key: string; name: string; order: number } // key: name in capitals
export interface Presence { scene: number; speaking: boolean; speeches: number; words: number; firstMention: number | null } // scene: index into index.scenes; firstMention: a source offset for a silent cell's Enter
export interface Place { location: string | null; key: string | null; inside: 'inside' | 'outside' | 'both' | 'none'; time: string | null }
export const TIMES_OF_DAY: readonly string[]; // design §3.6, Call 13
export function placeOf(scene: Scene, doc: Doc, template: Template): Place;
export const LONG_ABSENCE_PAGES = 20;
export interface Absence { from: { scene: number; page: number }; to: { scene: number; page: number }; pages: number }
export interface CharacterFigures {
  character: Character; scenes: Presence[]; speaksIn: number; speeches: number; words: number;
  share: number; // 0–1 (Call 10)
  screenEighths: number | null; first: number | null; last: number | null;
  absences: Absence[] | null; longest: Absence | null; // null without pages
  sharedWith: Array<{ key: string; scenes: number }>; // all, most first; the top three are "most often with"
  locations: Array<{ key: string; scenes: number }>;
}
export interface LocationFigures { key: string; location: string; scenes: number[]; eighths: number | null; inside: Record<Place['inside'], number>; times: Record<string, number>; people: Array<{ key: string; scenes: number; speaksIn: number }> }
export interface Cast { characters: Character[]; byScene: Presence[][] /* per character, by scene index */; places: Place[]; figures: Map<string, CharacterFigures>; locations: Map<string, LocationFigures>; firstIn: Map<number, string[]> /* scene → keys first seen there */ }
export function castOf(index: SceneIndex, doc: Doc, template: Template, perPage: number | null, isWord: IsWord): Cast;
export interface GridModel { rows: string[]; columns: number; cell(row: number, column: number): { speeches: number; silent: boolean } | null; shade(speeches: number): 0 | 1 | 2 | 3 | 4; gaps: Array<{ row: number; from: number; to: number; absence: Absence }> }
export function gridModel(cast: Cast, index: SceneIndex): GridModel;
```

- `names.ts`: the accepted spellings of a name (capitals; first letter of each word capitalised; as the cue spells it), and the map from a first word to its names, longest first. Words are runs of letters, digits, `'`, `’`, and `-`, with a trailing `'s` or `’s` stripped.
- `presence.ts`: each scene's action blocks (`action` kind; the printed runs of lines that aren't transparent) are split once and matched. A name is "a word" when `isWord` says true; `undefined` counts as true (capitals only).
- `headingSplit`'s inside and outside rules and `timeOfDay` move here (`place.ts`). `apps/web/app/stats/script-stats.ts` imports them in Task 4.

- [ ] **Step 1: Update `docs/DEPENDENCIES.md`,** scaffold the package as `@drafter/history` is (same scripts, `version` matching the others), then `pnpm install`.
- [ ] **Step 2: Write the failing tests.** `scripts.ts` holds original fixtures: a 14-scene screenplay with WILL, HOPE, ANN, ANN LEE, McCLANE, a silent GUARD with no cue, a cold open with a speech, dual dialogue, and a lyric; a 5-scene stage play. `names.test.ts`: `capitals, capitalised, and as the cue spells it`, `strips a possessive`, `longest name first`. `presence.test.ts`: `speaking puts a character in the scene`, `a name in the action in capitals puts them in`, `Tom capitalised counts`, `Will counts only in capitals`, `Hope in lowercase never counts`, `THE DRIVER counts only in capitals when both words are words`, `ANN LEE is not also ANN`, `a name in dialogue is not presence`, `a name in a parenthetical, note, synopsis, or boneyard is not presence`, `a character with no cue is not in the cast`, `undefined from isWord reads as a word`. `place.test.ts`: `INT. and EXT. of one place are one location`, `the time part comes off when it is a known time`, `HOUSE - KITCHEN and HOUSE are two locations`, `dashes and spaces fold in the key`, `a locked number comes off`, `a play's ## scene has no location`, `INT./EXT. and I/E are both`. `figures.test.ts`: `screen time adds the eighths of every scene a character is in`, `screen time is null without pages`, `dialogue share uses both sides of a dual pair`, `first and last appearance`, `shares scenes with, most first, ties by speeches`, `locations visited`, `firstIn lists who is first seen in each scene`, `location figures count inside, outside, and times`. `absences.test.ts`: `a gap of 20 pages or more between appearances is long`, `nothing before the first or after the last`, `the longest is kept whatever its length`. `grid.test.ts`: `rows in the Characters table's order`, `a silent cell`, `four shades by speeches`, `gaps span the empty cells between two appearances`. `cast.properties.test.ts` (Outline's arbitraries, copied into `test/`, with invented names): `shares add up to 100% when anyone speaks`, `a speaker is always present where they speak`, `screen time is never more than the script's length`, `figures equal a slow reference count`. `scaling.test.ts`: `castOf grows linearly in scenes` and `castOf grows linearly in characters`.
- [ ] **Step 3: Run them.** `pnpm --filter @drafter/cast test` → FAIL.
- [ ] **Step 4: Implement** the modules in the order names, place, presence, figures, absences, grid.
- [ ] **Step 5: Run them again,** `pnpm -r typecheck`, `pnpm check`. → PASS.
- [ ] **Step 6: Commit.** `feat(cast): who is in each scene, where it is, and each character's figures`

---

### Task 3: The dictionary's answer and the cast session (`apps/web`)

**Files:**
- Create: `apps/web/app/cast/{use-cast.ts,words.ts}`, tests `apps/web/test/cast-words.test.ts`, `apps/web/test/use-cast.test.ts`, e2e `apps/web/e2e/cast-budget.spec.ts`
- Modify: `apps/web/package.json` (`@drafter/cast`), `apps/web/app/workers/spell-compute.ts` (`words` request), `apps/web/app/spell/spell-client.ts` (`words(names)`), `apps/web/test/spell-compute.test.ts` (or the file that tests the worker's logic)

**Interfaces (Consumes):** Task 2's `castOf`; Task 1's index through `useOutline().index`; `useLayout`, `useEditor`, `useSettings().spellLanguage`. **(Produces):**
```ts
// spell-compute.ts
export type SpellRequest = /* … */ | { type: 'words'; seq: number; names: string[]; language: SpellLanguage }; // loads the language if needed (Call 7)
export type SpellReply = /* … */ | { type: 'words'; seq: number; words: string[] }; // the names whose every word, lowercased, is correct
// spell-client.ts
export interface SpellClient { /* … */ words(names: string[]): Promise<string[] | null> } // null when the worker can't answer
// cast/words.ts: answers kept for the visit, by language and name
export function useWordAnswers(): { isWord: IsWord; ask(names: readonly string[]): void; version: Ref<number> };
// cast/use-cast.ts
export const CAST_PAUSE_MS = 300;
export interface CastSession { cast: Readonly<ShallowRef<Cast | null>>; need(): () => void /* a view holds it while shown; the returned function releases */ }
export function useCast(): CastSession;
```

- `useCast` computes only while at least one view holds it. It recomputes `CAST_PAUSE_MS` after the parse, the layout, or the word answers change, in `requestIdleCallback` (a `setTimeout` fallback). It keeps the last cast until then, and it keeps the last pages-based figures while the layout lags (as the strip's `nextView` does).

- [ ] **Step 1: Write the failing tests.** `cast-words.test.ts`: `the worker answers names whose every word is a dictionary word`, `it loads the dictionary for words even with spellcheck off`, `before the answer every name reads as a word`, `answers are kept per language`, `a failed worker leaves names as words`. `use-cast.test.ts` (fake timers): `computes nothing while no view needs it`, `recomputes once after a 300 ms pause`, `keeps the last cast while typing`, `keeps pages-based figures while the layout lags`, `the word answers recompute it`. e2e `cast-budget.spec.ts` (a generated 120-page script, seeded with `e2e/seed.ts`): `castOf on a 120-page script is within budget` (logs; fails past 150 ms), `typing with Scaffold shown makes no long task` (PerformanceObserver `longtask`; written now against the Stats tab, and extended in Task 6).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement** the worker request and the client first, then `words.ts`, then `use-cast.ts`.
- [ ] **Step 4: Run them again,** plus `spell.spec.ts`. → PASS. Record the measured time in DECISIONS.
- [ ] **Step 5: Commit.** `feat(web): the cast, worked out while a view needs it, with names checked against the dictionary`

---

### Task 4: The Stats tab replaces the window

**Files:**
- Create: `apps/web/app/components/{StatsPane.vue,StatsSlim.vue,StatsOverview.vue,StatsCharacters.vue}`, `apps/web/app/stats/{tab.ts,characters.ts}`, tests `apps/web/test/stats-characters.test.ts`, `apps/web/test/stats-tab.test.ts`
- Modify: `apps/web/app/utils/panes.ts` (`VIEW_TABS` gains Stats; `viewTabs('markdown')` is `[Stats]`), `components/AppPane.vue`, `components/AppStatusBar.vue` (Stats… opens the tab), `components/CountsPanel.vue` if it names the window, `commands/builtin.ts` (`show-stats` opens the tab), `commands/desktop-menu.ts` if it lists by hand, `stats/script-stats.ts` (`characterTable` removed; `headingSplit` reads `@drafter/cast`'s place rules), `test/script-stats.test.ts`, e2e `stats.spec.ts`, `counts.spec.ts`, `tabs.spec.ts`, `a11y.spec.ts`, `phone.spec.ts`, `pages/docs/shortcuts.vue`
- Delete: `apps/web/app/components/StatsDialog.vue`, `apps/web/app/stats/dialog.ts`

**Interfaces (Consumes):** Task 3's `useCast`; `useRates`, `pageSeconds`, `timeWords`, `lengthLabel`. **(Produces):**
```ts
// utils/panes.ts
export type ViewTabId = 'cards' | 'notes' | 'stats' | 'scaffold';
export const STATS_TAB_ID = 'stats';
// stats/tab.ts
export function showStats(section?: 'overview' | 'characters' | 'grid'): void; // openBeside, then focus the section's heading
// stats/characters.ts
export interface CharacterRowView { key: string; name: string; speeches: number; scenes: number; speaksIn: number; words: number; share: string; screen: { text: string; words: string } | null; often: string }
export function characterRows(cast: Cast, rates: Rates): CharacterRowView[];
```

- Overview is the window's three sections moved, unchanged, with the rate fields. Each section has an `h2`, and the link list at the top goes to each.

- [ ] **Step 1: Write the failing tests.** `stats-characters.test.ts`: `rows in order of speeches`, `words include lyrics`, `scenes count silent scenes and speaks in does not`, `screen time in pages and minutes at the script's rate`, `screen time is null without pages`, `most often with names three, with counts`. `stats-tab.test.ts`: `a Markdown document's view tabs are Stats alone`, `showStats opens the tab beside the Source`. Update `script-stats.test.ts` (no `characterTable`; `headingSplit` unchanged in results). e2e `stats.spec.ts` (rewritten): `Show stats opens the Stats tab beside the Source`, `the Counts panel's Stats… opens the tab`, `Overview has today, the script with its rates, and the last 30 days`, `the rates can still be set`, `Characters shows screen time, dialogue share, and most often with`, `the links at the top go to each section`, `a Markdown document's Stats tab has Overview only`, `a sample has no Today or Last 30 days` (as the window), `on a phone it is the one pane's tab`. `a11y.spec.ts`: `Stats tab: Overview and Characters` in both themes.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.** Panes and the tab first, then Overview (moved from the window), Characters, commands and the status bar, and last remove the window.
- [ ] **Step 4: Run them again,** plus `counts.spec.ts`, `tabs.spec.ts`, `palette.spec.ts`, `markdown.spec.ts`, `phone.spec.ts`, `a11y.spec.ts`, and `pnpm --filter @drafter/desktop e2e` (the View menu). → PASS.
- [ ] **Step 5: Commit.** `feat(web): Stats is a tab, with screen time, dialogue share, and who each character is most often with`

---

### Task 5: The character-by-scene grid

**Files:**
- Create: `apps/web/app/stats/{grid-keys.ts,grid-window.ts,grid-labels.ts,chart-colors.ts}`, `apps/web/app/components/{CharacterGrid.vue,CharacterList.vue}`, tests `apps/web/test/{grid-keys.test.ts,grid-window.test.ts,grid-labels.test.ts,chart-colors.test.ts}`, e2e `apps/web/e2e/character-grid.spec.ts`
- Modify: `components/StatsPane.vue` (the section), `settings/settings.ts` + `SettingsDialog.vue` if it lists device choices (`gridAsList`), `assets/css` tokens (`--grid-shade-1`…`4`), `pages/docs/shortcuts.vue` (the grid's keys), `e2e/a11y.spec.ts`

**Interfaces (Consumes):** Task 2's `gridModel`, `Absence`; Task 4's tab. **(Produces):**
```ts
export interface GridPlace { row: number; column: number }
export function gridKey(model: { rows: number; columns: number }, at: GridPlace, key: string, ctrl: boolean): GridPlace | 'enter' | 'menu' | null; // arrows, Home/End, Ctrl+Home/End, PageUp/PageDown by 10
export const WINDOW_EXTRA = 10;
export function visibleColumns(scrollLeft: number, width: number, columnPx: number, total: number): { from: number; to: number };
export function cellName(name: string, sceneNumber: string, cell: { speeches: number; silent: boolean } | null): string; // "TOM, scene 12, 4 speeches" / "…, silent" / "…, not in it"
export function absenceLine(name: string, a: Absence): string;
export function listLine(name: string, presence: readonly Presence[], numberOf: (scene: number) => string): string; // "TOM: in 23 scenes. Speaks in 1, 2, 5 to 9… Silent in 6, 31."
export const CHART_TOKENS: Record<'light' | 'dark', Record<string, string>>; // --grid-shade-1..4 here; Part 2 adds --chart-*
```

- `role="grid"`, `aria-rowcount`, `aria-colcount`, a `columnheader` per scene and a `rowheader` per character, `aria-colindex` on drawn cells, and a roving `tabindex`. Enter goes to the cue or the first mention (`Presence.firstMention`); the menu has Go to, and from Task 6, **Scaffold for this character** and **Scaffold for this scene**.

- [ ] **Step 1: Write the failing tests.** `grid-keys.test.ts`: `arrows move and stop at edges`, `Home and End go along a row`, `Ctrl+Home and Ctrl+End go to the corners`, `Page Down moves ten scenes`, `Enter and the menu keys`. `grid-window.test.ts`: `draws the columns in view and ten each side`, `clamps at both ends`. `grid-labels.test.ts`: `names a speaking, a silent, and an empty cell`, `an absence line says the pages`, `the list line folds runs into ranges`. `chart-colors.test.ts`: `grid text on every shade is at least 4.5:1`, `each shade is at least 3:1 against the page` (both themes). e2e `character-grid.spec.ts`: `shows a row per character and a column per scene, with numbers`, `a silent cell shows a dot and reads silent`, `arrow keys move and Enter goes to the cue`, `Enter on a silent cell goes to the first mention`, `a long absence is outlined and listed`, `List shows each character's scenes as text, and is remembered`, `on a phone the first column stays as the grid scrolls`, `a 120 by 30 grid paints within budget` (logs; fails past 2 s), `a 300-scene grid paints within budget` (logs; fails past 2 s). `a11y.spec.ts`: `Stats tab: the grid and List` in both themes.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `stats.spec.ts`, `phone.spec.ts`, `a11y.spec.ts`. → PASS. Record the grid's times in DECISIONS.
- [ ] **Step 5: Commit.** `feat(web): the character-by-scene grid, with long absences and a List view`

---

### Task 6: Scaffold — the tab and the scene page

**Files:**
- Create: `apps/web/app/scaffold/{session.ts,labels.ts,follow.ts}`, `apps/web/app/components/{ScaffoldPane.vue,ScaffoldSlim.vue,ScaffoldScene.vue}`, tests `apps/web/test/{scaffold-session.test.ts,scaffold-labels.test.ts,scaffold-follow.test.ts}`, e2e `apps/web/e2e/scaffold.spec.ts`
- Modify: `utils/panes.ts` (Scaffold after Stats), `components/AppPane.vue`, `commands/data.ts` + `builtin.ts` (`show-scaffold`, `scaffold-scene`, with `keywords`), `outline/scene-menu.ts` (Scaffold for this scene), `components/StructureStrip.vue` + `strip/keys.ts` (the block menu item), `components/CharacterGrid.vue` (its menu items), `commands/desktop-menu.ts` if it lists by hand, `e2e/cast-budget.spec.ts` (with Scaffold shown), `e2e/a11y.spec.ts`

**Interfaces (Consumes):** Task 3's `useCast`; `currentBlocks`; `useOutline`; `useRates`; `estimateSeconds`, `pageSeconds`, `shortTime`, `timeWords`, `lengthLabel`. **(Produces):**
```ts
export type ScaffoldPage = { kind: 'scene'; pinned: string | null } | { kind: 'character'; key: string } | { kind: 'location'; key: string } | { kind: 'cast' } | { kind: 'places' };
export interface ScaffoldSession { page: Ref<ScaffoldPage>; follow: Ref<boolean>; open(page: ScaffoldPage): void; back(): boolean; canGoBack: ComputedRef<boolean>; sceneShown: ComputedRef<Scene | null> }
export function useScaffold(): ScaffoldSession; // follow is true at every visit (Call 26); open(...) pushes Back; a pinned scene turns follow off
export const FOLLOW_REST_MS = 150;
export function sceneFacts(scene: Scene, place: Place, rates: Rates): Array<{ term: string; value: string; words?: string }>;
export interface SceneRow { key: string; name: string; speeches: string; words: number; time: { text: string; words: string; share: string } | null; first: boolean; more: number }
export function sceneRows(cast: Cast, sceneIndex: number, scene: Scene, rates: Rates): SceneRow[]; // speakers by first speech, then silent by first mention; Call 28
```

- [ ] **Step 1: Write the failing tests.** `scaffold-session.test.ts`: `starts on the scene page, following`, `open pushes Back and back pops it`, `a pinned scene turns follow off`, `follow is not remembered`. `scaffold-follow.test.ts` (fake timers): `updates 150 ms after the cursor rests`, `never moves focus`. `scaffold-labels.test.ts`: `facts give where, when, and length with minutes at the page rate`, `before pages, the length is from the dialogue and says so`, `rows list speakers first, then the silent`, `time speaking is a share of the scene's estimate, capped at 100%`, `a silent character says Silent and has no share`, `first seen here is marked`, `a play's scene says its heading names no place`. e2e `scaffold.spec.ts`: `Show Scaffold opens it beside the Source`, `it follows the cursor into the next scene`, `it shows who speaks and who is silent, with words and time`, `first seen here is listed`, `Follow the cursor off keeps the scene`, `Scaffold for this scene from the Outline, the Cards, the strip, and the grid pins it`, `Go to puts the cursor at the scene and focus stays in Scaffold`, `before the first scene it says so`, `a Markdown document has no Scaffold`, `the palette finds it by "cast"`, `on a phone it is the pane's tab`. `cast-budget.spec.ts`: `typing with Scaffold shown makes no long task`, `the scene page updates within budget` (logs; fails past 40 ms). `a11y.spec.ts`: `Scaffold: the scene page` in both themes.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `outline.spec.ts`, `cards.spec.ts`, `strip.spec.ts`, `tabs.spec.ts`, `palette.spec.ts`, `phone.spec.ts`, `a11y.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): Scaffold, a tab that shows who is in the cursor's scene`

---

### Task 7: Scaffold — character and location pages, cast and places

**Files:**
- Create: `apps/web/app/components/{ScaffoldCharacter.vue,ScaffoldLocation.vue,ScaffoldLists.vue,ScaffoldLines.vue}`, `apps/web/app/scaffold/{pages.ts,lines.ts}`, tests `apps/web/test/{scaffold-pages.test.ts,scaffold-lines.test.ts}`, e2e `apps/web/e2e/scaffold-pages.spec.ts`
- Modify: `components/ScaffoldPane.vue`, `ScaffoldSlim.vue` (Back, the menu: This scene, Cast, Places), `components/StatsCharacters.vue` (names link to Scaffold), `commands/data.ts` + `builtin.ts` (`scaffold-cast`, `scaffold-places`), `pages/docs/shortcuts.vue` (Alt+Left), `e2e/a11y.spec.ts`

**Interfaces (Consumes):** Task 2's `CharacterFigures`, `LocationFigures`; Task 6's session. **(Produces):**
```ts
export function characterSummary(f: CharacterFigures, index: SceneIndex, total: number): string; // "In 23 of 61 scenes. First in scene 1 (page 1); last in scene 58 (page 104)."
export function characterFacts(f: CharacterFigures, rates: Rates): Array<{ term: string; value: string; words?: string }>;
export function locationSummary(f: LocationFigures, rates: Rates): string;
export const LINES_SHOWN = 100;
export interface SpokenLine { scene: number; block: number; text: string } // the speech's printed text, parentheticals in their parentheses
export function linesOf(doc: Doc, speeches: readonly Speech[]): SpokenLine[]; // reads text only; counts nothing
export function filterFold(text: string): string; // case and accents folded, for the lists' filters
```

- [ ] **Step 1: Write the failing tests.** `scaffold-pages.test.ts`: `the character summary names the first and last scene with pages`, `facts give screen time, dialogue, and the longest absence`, `absences wait for the pages`, `a location summary gives scenes, pages, minutes, inside and outside`, `filters fold case and accents`. `scaffold-lines.test.ts`: `every speech's printed text, in order`, `a parenthetical stays in its parentheses`, `notes inside a speech are left out`. e2e `scaffold-pages.spec.ts`: `a character's name opens their page`, `the page lists scenes, shared scenes, locations, and lines`, `a line goes to its cue`, `Show all 212 speeches shows the rest`, `a location opens its page with its scenes and who appears`, `Back and Alt+Left return`, `Cast and Places list everyone and every place, with a filter`, `a name in the Stats tab opens the same page`, `Scaffold's figures match the Stats tab's` (screen time, speeches, words, and share for every character of the fixture), `every page works by keyboard alone`. `a11y.spec.ts`: `Scaffold: a character page, a location page, Cast, and Places` in both themes.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `scaffold.spec.ts`, `stats.spec.ts`, `a11y.spec.ts`, `keyboard.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): a Scaffold page for each character and each location`

---

### Task 8: Docs and release prep for v0.20.0

**Files:**
- Modify: `README.md`, `docs/drafter-phase2-design.md` (§14, §16, §22, §26), `docs/drafter-architecture.md` (§13), `docs/DECISIONS.md`, `docs/DEFERRED.md`, `CHANGELOG.md`, `docs/technical-details.md` and `pages/docs/technical.vue` (`@drafter/cast`), `pages/docs/index.vue` or a section of an existing help page for Stats and Scaffold (what "in a scene" means, and that a mention counts), `packages/outline/README.md`, `packages/cast/README.md`

- [ ] **Step 1: README** (stay near 5,000 words): the status line names Scaffold and the Stats tab, and "Next" names v0.21.0 (storylines, the map, and pacing), then Plans F to H (v0.22.0 to v0.24.0). The Phase 2 roadmap row adds "Scaffold, the Stats tab, and the character grid (v0.20.0)". The Packages table gets `@drafter/cast`. Features gets a line each for Scaffold, the Stats tab, and the grid. Design documents links this design.
- [ ] **Step 2: The Phase 2 design.** §22: Plan E becomes two headings, `### Plan E, part 1 — v0.20.0: Scaffold and the Stats tab` (**Status:** built, axe on every new view, linking this design and plan) and `### Plan E, part 2 — v0.21.0: Storylines, the map, and pacing`, the done-when split between them, with the map's line changed to the strip's Color by (Call 38). Plans F, G, and H become v0.22.0, v0.23.0, and v0.24.0. A "Decided" paragraph (the controller's ruling on Call 1, with its date) says so. §14 gets a "Since v0.21.0" note pointing to design §7. §16 notes `speeches` and the retired `characterTable`. §26 records the changes. **Architecture §13:** the same order.
- [ ] **Step 3: DECISIONS, DEFERRED, CHANGELOG.** Every Part 1 Call (design §16, Calls 2–30, 43–45) and this plan's in the Seeing the script section, as each landed, with measured times. DEFERRED gets a `## Seeing the script` group with design §14's list. CHANGELOG `[Unreleased]` has Scaffold, the Stats tab, and the grid under Added, in the writer's words, and Words (now with lyrics) and Scenes (now with silent scenes) under Changed.
- [ ] **Step 4: Run the whole suite:** `pnpm -r build`, `pnpm -r typecheck`, `pnpm test`, `pnpm check`, the web e2e (`E2E_PORT=4175`), and `pnpm --filter @drafter/desktop e2e`. → PASS.
- [ ] **Step 5: Commit.** `docs: Scaffold and the Stats tab`
- [ ] **Step 6: Push** `seeing-the-script` and watch CI. Don't merge or tag: the controller releases v0.20.0.

---

## Part 2 — v0.21.0: Storylines, the map, and pacing

Starts after v0.20.0 is merged (Global Constraints).

### Task 9: Storylines in the file (`@drafter/notes`)

**Files:**
- Create: `packages/notes/src/storylines.ts`, tests `packages/notes/test/{storylines.test.ts,storylines.properties.test.ts}`
- Modify: `packages/notes/src/index.ts`, `packages/notes/README.md`

**Interfaces (Produces):**
```ts
export interface StorylineInfo { label: string; name: string | null; color: SceneColor; chosen: boolean; scenes: number }
/** Every label in use (first appearance order) or named in the metadata block; colors shown by Call 31. */
export function storylineInfo(doc: Doc, scenes: ReadonlyArray<{ storylines: readonly string[] }>): StorylineInfo[];
export function setStorylineInfo(doc: Doc, label: string, info: { name?: string | null; color?: SceneColor | null }): TextChange[]; // one setMeta change
export function setSceneStorylines(doc: Doc, scene: { span: Span }, labels: readonly string[]): TextChange[]; // one header note, others in the scene removed (Call 32)
export function renameStoryline(doc: Doc, from: string, to: string): { changes: TextChange[]; scenes: number; merged: boolean }; // Call 33
export function removeStoryline(doc: Doc, label: string): { changes: TextChange[]; scenes: number };
```

- Matching is by `normalizeLabel`. Rewriting a note keeps its spacing style and writes `[[Storyline: A, B]]` exactly, as §5.3 says. An empty list drops the note and its line, as clearing a field does. Every function returns [] with a stray `/*`. Notes inside the Beat Board block are left alone (Call 34).

- [ ] **Step 1: Write the failing tests.** `storylines.test.ts`: `lists labels in order of first appearance`, `shown colors skip gray and chosen colors and cycle`, `a chosen color and name come from the metadata block`, `setStorylineInfo writes one metadata change`, `setSceneStorylines writes one header note and removes the others`, `rename rewrites every note and moves the metadata entry`, `rename matches any case`, `rename into a label in use merges without repeats`, `remove drops the label and empty notes`, `nothing with a stray /*`. `storylines.properties.test.ts` (Outline's arbitraries with Storyline notes): `rename changes only Storyline notes and the metadata block`, `rename then rename back restores the text`, `print(parse(text)) equals text after every edit`, `the layout is unchanged by every edit`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** and `pnpm -r typecheck`. → PASS.
- [ ] **Step 5: Commit.** `feat(notes): storyline names, colors, rename, and tagging`

---

### Task 10: Lanes, pacing, and guides (`@drafter/outline`)

**Files:**
- Create: `packages/outline/src/{lanes.ts,pacing.ts}`, tests `packages/outline/test/{lanes.test.ts,lanes.properties.test.ts,pacing.test.ts,pacing-scaling.test.ts}`
- Modify: `packages/outline/src/index.ts`, `packages/outline/README.md`

**Interfaces (Produces):**
```ts
export interface Lane { label: string | null /* null: No storyline */; blocks: StripBlock[] }
export function storylineLanes(strip: Strip, index: SceneIndex): Lane[]; // first-appearance order, then No storyline; Call 36
export interface PacingPage { page: number; share: number; smooth: number } // dialogue and lyric lines over printed lines; smooth over three pages (Call 39)
export interface PacingScene { scene: number; from: number; to: number; eighths: number; share: number }
export function pacingSeries(index: SceneIndex, layout: Layout): { pages: PacingPage[]; scenes: PacingScene[]; highest: { from: number; to: number } }; // Call 42
export type GuideId = 'three-acts' | 'five-acts' | 'fifteen';
export const GUIDES: Record<GuideId, { name: string; marks: Array<{ label: string; at: number; to?: number }> }>; // design §8.1, Call 41
```

- [ ] **Step 1: Write the failing tests.** `lanes.test.ts`: `one lane per storyline in order, then No storyline`, `a scene with two storylines is in both lanes`, `lanes keep the strip's axis`. `lanes.properties.test.ts`: `every scene is in at least one lane`, `a lane's blocks are the strip's blocks`. `pacing.test.ts`: `a page's share counts dialogue and lyric lines over printed lines`, `smoothing over three pages`, `the highest stretch is a 15-page window`, `a script under 15 pages is its own stretch`, `guides' marks are inside 0–1 and in order`. `pacing-scaling.test.ts`: `pacingSeries grows linearly`, `storylineLanes grows linearly`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(outline): storyline lanes, the pacing series, and guides`

---

### Task 11: Storylines in the app: chips, Storylines…, and the Stats section

**Files:**
- Create: `apps/web/app/storylines/{use-storylines.ts,labels.ts}`, `apps/web/app/components/{StorylineChip.vue,StorylinesDialog.vue,StatsStorylines.vue}`, tests `apps/web/test/{storyline-labels.test.ts,use-storylines.test.ts}`, e2e `apps/web/e2e/storylines.spec.ts`
- Modify: `components/OutlinePane.vue` (chips on rows), `components/SceneCard.vue` (chips), `components/ScaffoldScene.vue` (chips), `outline/scene-menu.ts` (Storylines…), `components/SceneDetailsDialog.vue` (suggestions), `components/StatsPane.vue` (the section and its link), `commands/data.ts` + `builtin.ts` (`scene-storylines`), `e2e/a11y.spec.ts`

**Interfaces (Consumes):** Task 9; `useOutline().apply`, `readOnly`. **(Produces):**
```ts
export interface StorylinesSession { info: ComputedRef<StorylineInfo[]>; colorOf(label: string): SceneColor; tag(scene: Scene, labels: string[]): boolean; rename(from: string, to: string): Promise<boolean>; remove(label: string): Promise<boolean>; setInfo(label: string, info: { name?: string | null; color?: SceneColor | null }): boolean }
export function useStorylines(): StorylinesSession; // each edit one apply, said in the polite region
export function chipName(info: StorylineInfo): string; // "storyline A, Margaret's job"
```

- [ ] **Step 1: Write the failing tests.** `storyline-labels.test.ts`: `a chip's name gives the label and the name`, `the rename message counts scenes`. `use-storylines.test.ts`: `tag is one undo`, `rename asks before a merge`, `refused with the reason in a read-only tab`. e2e `storylines.spec.ts`: `Storylines… tags a scene and the chip shows in the Outline, the card, and Scaffold`, `New storyline adds a label`, `Rename in Stats rewrites every scene in one undo`, `renaming onto a label in use asks and merges`, `Color… writes the metadata block and the chips follow`, `Remove from every scene asks first`, `Stats lists storylines with scenes, pages, and share, and No storyline`, `a read-only tab shows the actions disabled with the reason`. `a11y.spec.ts`: `the Storylines dialog`, `Stats: Storylines`, chips in the Outline and Cards, in both themes.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `outline.spec.ts`, `cards.spec.ts`, `notes.spec.ts`, `stats.spec.ts`, `a11y.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): storylines on scenes, with chips, names, colors, and rename`

---

### Task 12: The Outline's Timeline

**Files:**
- Create: `apps/web/app/timeline/{keys.ts,labels.ts}`, `apps/web/app/components/{OutlineTimeline.vue,TimelineList.vue}`, tests `apps/web/test/{timeline-keys.test.ts,timeline-labels.test.ts}`, e2e `apps/web/e2e/timeline.spec.ts`
- Modify: `components/OutlinePane.vue` + `OutlineSlim.vue` (Tree | Timeline), `settings/settings.ts` (`outlineView`), `commands/data.ts` + `builtin.ts` (`outline-timeline`, `outline-tree`), `pages/docs/shortcuts.vue`, `e2e/a11y.spec.ts`

**Interfaces (Consumes):** Task 10's `storylineLanes`; `structureStrip`, `rulerMarks`, `stripKey`'s model, `cardLines`. **(Produces):**
```ts
export function timelineKey(lanes: readonly Lane[], at: { lane: number; block: number }, key: string): { lane: number; block: number } | 'enter' | 'menu' | null; // Up/Down to the nearest block by position
export function timelineBlockName(scene: Scene, label: string | null, rates: Rates): string; // "Scene 12, INT. KITCHEN, storyline A, page 12, 1 3/8 pages"
```

- [ ] **Step 1: Write the failing tests.** `timeline-keys.test.ts`: `Left and Right move along a lane`, `Up and Down go to the nearest block in the next lane`, `Home and End`, `Enter and the menu keys`. `timeline-labels.test.ts`: `a block's name`. e2e `timeline.spec.ts`: `Timeline shows a lane per storyline and No storyline`, `a scene with two storylines is in both lanes`, `arrow keys move and Enter goes to the scene`, `the menu offers Storylines… and Scaffold for this scene`, `the choice is remembered`, `on a phone it is a list grouped by storyline`, `a script without pages lays out by words`. `a11y.spec.ts`: `Outline: Timeline` and its phone list, in both themes.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `outline.spec.ts`, `strip.spec.ts`, `phone.spec.ts`, `a11y.spec.ts`. → PASS. Record the lanes' time.
- [ ] **Step 5: Commit.** `feat(web): a Timeline of storylines in the Outline`

---

### Task 13: Storylines in the Script pane's margin

**Files:**
- Create: `apps/web/app/storylines/margin.ts`, `apps/web/app/components/StorylineMarksToggle.vue`, tests `apps/web/test/storyline-margin.test.ts`, e2e `apps/web/e2e/storyline-margin.spec.ts`
- Modify: `components/ScriptPane.vue` (a second `decorate` user beside Show changes' marks), `components/AppPane.vue` (the toggle on the Script slim bar), `settings/settings.ts` (`storylineMarks`), `commands/data.ts` + `builtin.ts` (`storyline-marks`), `commands/desktop-menu.ts` if it lists by hand, `e2e/a11y.spec.ts`

**Interfaces (Consumes):** `decorate`/`redecorate` (v0.18.0); the layout's `index` (block → page and line); Task 11's `colorOf`. **(Produces):**
```ts
export interface MarginBar { line: number; lines: number; labels: string[]; more: number } // up to three labels, then "+n"
export function marginBars(page: Page, layout: Layout, index: SceneIndex): MarginBar[];
export function drawMargin(el: HTMLElement, bars: readonly MarginBar[], colorOf: (label: string) => SceneColor): void; // aria-hidden; replaces its own layer only
```

- Show changes' marks and the margin bars each own a layer in the page element, so either redraws without touching the other.

- [ ] **Step 1: Write the failing tests.** `storyline-margin.test.ts`: `a scene across two pages has a bar on each`, `past three storylines it says +n`, `a page with no tagged scene has none`, `drawing replaces only its own layer`. e2e `storyline-margin.spec.ts`: `Storylines on the slim bar draws bars with labels`, `the bars are hidden from the accessibility tree`, `off by default and remembered`, `the PDF is the same with the marks on and off` (export bytes equal), `with Show changes on too, both draw`, `typing in a 120-page script with marks on makes no long task`. `a11y.spec.ts`: `Script pane with storyline marks` in both themes.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `script.spec.ts`, `show-changes.spec.ts`, `export.spec.ts`, `a11y.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): storylines in the Script pane's margin`

---

### Task 14: The script map: the strip's Color by

**Files:**
- Create: `apps/web/app/strip/color-by.ts`, `apps/web/app/components/StripLegend.vue`, tests `apps/web/test/strip-color-by.test.ts`, e2e additions in `apps/web/e2e/strip.spec.ts`
- Modify: `components/StructureStrip.vue` (the menu, stripes, legend), `strip/labels.ts` (`blockName` gains the value; `cardLines` gains storylines and the goal), `settings/settings.ts` (`stripColorBy`), `commands/data.ts` + `builtin.ts` (`strip-color-by`; Show the Structure strip gains `keywords: ['script map', 'map']`), `e2e/a11y.spec.ts`

**Interfaces (Consumes):** `placeOf` (Task 2); Task 11's `colorOf`. **(Produces):**
```ts
export type ColorBy = 'scene' | 'inside' | 'time' | 'storyline';
export interface BlockPaint { stripes: Array<{ color: string; label: string }> } // one stripe, or one per storyline
export function paintOf(scene: Scene, place: Place, by: ColorBy, colorOf: (label: string) => SceneColor): BlockPaint;
export function legendOf(strip: Strip, paints: ReadonlyMap<number, BlockPaint>): Array<{ color: string; label: string }>; // only what's in use
```

- [ ] **Step 1: Write the failing tests.** `strip-color-by.test.ts`: `scene color is today's tint`, `inside or outside and day or night use fixed colors`, `a scene with two storylines is striped`, `the legend lists only the colors in use`, `a block's name says its value`. e2e `strip.spec.ts`: `Color by Day or night recolors the blocks and the legend names them`, `the choice is remembered`, `the hover card shows storylines and the goal`, `the palette finds the strip by "script map"`. `a11y.spec.ts`: `the strip colored by each choice, with its legend`, in both themes.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `strip.spec.ts`, `palette.spec.ts`, `a11y.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): color the Structure strip by place, time of day, or storyline`

---

### Task 15: The pacing view

**Files:**
- Create: `apps/web/app/pacing/{chart.ts,labels.ts,guide.ts}`, `apps/web/app/components/{StatsPacing.vue,PacingChart.vue}`, tests `apps/web/test/{pacing-chart.test.ts,pacing-labels.test.ts,pacing-guide.test.ts}`, e2e `apps/web/e2e/pacing.spec.ts`
- Modify: `components/StatsPane.vue` (the section and its link), `stats/chart-colors.ts` + `test/chart-colors.test.ts` (`--chart-bar`, `--chart-line`, `--chart-guide`), `e2e/a11y.spec.ts`

**Interfaces (Consumes):** Task 10's `pacingSeries`, `GUIDES`; `rulerMarks`; `setMeta`. **(Produces):**
```ts
export function chartGeometry(series: ReturnType<typeof pacingSeries>, widthPx: number, heightPx: number): { bars: Array<{ scene: number; x: number; w: number; h: number }>; line: string /* SVG path */; guides: Array<{ x: number; label: string; page: number }> };
export function pacingSummary(index: SceneIndex, series: ReturnType<typeof pacingSeries>): string;
export function guideOf(doc: Doc): GuideId | null; // from the metadata block's `guides`
export function setGuide(doc: Doc, guide: GuideId | null): TextChange[]; // one setMeta change (Call 40)
```

- [ ] **Step 1: Write the failing tests.** `pacing-chart.test.ts`: `bars sit at their pages with widths by length`, `the line follows the smoothed share`, `guides sit at their shares of the script`. `pacing-labels.test.ts`: `the summary names the longest scene and the highest stretch`. `pacing-guide.test.ts`: `reads and writes the guide in the metadata block`, `None removes it`. `chart-colors.test.ts`: `bars, line, and guides are at least 3:1 against the page` (both themes). e2e `pacing.spec.ts`: `Pacing draws bars and a line with a table beside it`, `the chart is hidden from the accessibility tree and the table is reachable by Tab`, `a table row goes to its scene`, `clicking a bar goes to its scene`, `Guides: Three acts draws two marks and is one undo`, `the guide opens the same after reload`, `the guide is disabled in a read-only tab`, `without pages it says it waits`, `on a phone the chart fits and the table is below`. `a11y.spec.ts`: `Stats: Pacing`, with and without a guide, in both themes.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `stats.spec.ts`, `a11y.spec.ts`. → PASS. Record the series' time.
- [ ] **Step 5: Commit.** `feat(web): a pacing view in Stats, with guides`

---

### Task 16: Docs and release prep for v0.21.0

**Files:**
- Modify: `README.md`, `docs/drafter-phase2-design.md` (§13, §14, §15, §22, §26), `docs/drafter-architecture.md` (§13), `docs/drafter-structure-strip-design.md` (§10: the map's question settled), `docs/DECISIONS.md`, `docs/DEFERRED.md`, `CHANGELOG.md`, `docs/technical-details.md` and `pages/docs/technical.vue`, the help page Task 8 wrote (storylines, the Timeline, the margin, Color by, pacing), `packages/notes/README.md`, `packages/outline/README.md`

- [ ] **Step 1: Merge `main`** if anything landed since Task 9 started; `pnpm install`.
- [ ] **Step 2: README:** the status line names storylines, the map, and pacing, and "Next" names Plan F, the Beat Board (v0.22.0), then G and H (v0.23.0, v0.24.0). The roadmap row adds "storylines with a Timeline and margin marks, the strip colored as a script map, and a pacing view (v0.21.0)". Features lines are added.
- [ ] **Step 3: The Phase 2 design:** Plan E part 2's **Status:** built, axe on every new view. §13, §14, and §15 get "Since v0.21.0" notes, and §26 records them. **Strip design §10:** the open question is answered (Call 38).
- [ ] **Step 4: DECISIONS, DEFERRED, CHANGELOG:** Part 2's Calls (31–42) and measured times; DEFERRED's Seeing the script group gets storyline rows in the strip and Beat Board rename; CHANGELOG `[Unreleased]` in the writer's words.
- [ ] **Step 5: Run the whole suite,** as Task 8 Step 4. → PASS.
- [ ] **Step 6: Commit.** `docs: storylines, the map, and pacing`
- [ ] **Step 7: Push** and watch CI. Don't merge or tag: the controller releases v0.21.0.

---

## Calls in this plan

The design's 45 Calls (its §16) are binding once ruled on. This plan adds:

46. **Sixteen tasks in two parts,** packages first in each (Tasks 1–2 and 9–10 pure), then the session, then each view, so each view's task starts on tested models.
47. **Part 2 starts from `main` after v0.20.0 merges** (Global Constraints), so the second release's conflicts with the first are settled once, before any code.
48. **`useCast` holds a reference count of the views that need it** (`need()` returns a release), so closing the last view stops the work (Task 3).
49. **The spell worker's new `words` request reuses its loaded checker** and loads one for the language when needed. It is a request, not a second worker (Task 3).
50. **Chart and grid token values are the implementer's,** bound by the contrast tests, not chosen in the plan (Tasks 5 and 15).
51. **Timing in e2e fails only past 10× the budget;** the measured times go in DECISIONS (Tasks 3, 5, 6, 12, 15).
52. **If the controller rules against the split (Call 1),** Task 8 is skipped, Tasks 9–16 follow at once on the same branch, and Task 16 does Task 8's docs as well, with Plans F to H staying v0.21.0 to v0.23.0.

## Controller rulings

_None yet._

- **Call 1 (two releases):** accepted. Part 1 ships as v0.20.0 (Scaffold, the Stats tab, the character grid) and Part 2 as v0.21.0 (storylines, the Timeline, margin marks, the map, pacing). Plans F–H move to v0.22.0–v0.24.0, and Task 8's docs say so.
- **Call 23 (Scaffold as a tab):** accepted. Drafter's panes show any tab, so Scaffold sits beside the Source in the other pane. That is the "panel beside the script" the maintainer asked for, without a third column.
- **Calls 5 and 7 (a mention counts; the dictionary loads for this check):** accepted. The dictionaries are local and cached for offline use, so loading one costs no network use and asks nothing of the writer.
- **Call 9 (Words and Scenes change meaning):** accepted. The changelog says so plainly, and the new Speaks in column keeps the old Scenes figure.
- **Call 38 (the map as the strip's Color by):** accepted. It reuses the Structure strip the writer already has. The Phase 2 design's §14 and §22 are updated in Task 16.
- **Call 41 (fifteen guide labels):** overruled. A fifteen-mark guide at fixed positions reads as a well-known commercial beat sheet, however it is renamed. Drafter's pacing guides are its own and generic instead:
  - **Thirds and quarters**, marks at 25%, 50% and 75%.
  - **Three acts**, with breaks at 25% and 75% and a midpoint.
  - **Your own marks**, at page numbers the writer sets, kept in the metadata block.
  
  No named beat set is shipped. Task 15 and the design's pacing section change to match.
- **All other Calls:** accepted as recommended.
