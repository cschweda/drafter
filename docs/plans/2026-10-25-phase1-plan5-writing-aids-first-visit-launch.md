# Phase 1, Plan 5: Writing Aids, the First Visit, and Launch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Phase 1:
- the writing aids: focus mode, typewriter scrolling, counts, a daily goal, and sprints
- the first visit: the sample bar, the welcome dialog, and the guided tour
- offline use, with a prompt when an update arrives
- the help pages
- the accessibility suite that checks every major state

**Architecture:** Each aid is a small composable with its state in the settings table, or in the editor where it belongs:
- **Focus mode** is a layout state of the shell.
- **Typewriter scrolling** is a CodeMirror extension behind a compartment.
- **Counts** are a pure function of the parsed script and its layout.
- **The daily goal** keeps each day's starting counts per script.
- **Sprints** keep their timer in memory.
- **The tour** is `nuxt-guided-tour`, configured with Drafter's ten steps.
- **The service worker** comes from `@vite-pwa/nuxt`, registered so an update waits for the writer to choose to reload.

**Tech Stack:** Nuxt 4.6, Nuxt UI 4.12, CodeMirror 6, `nuxt-guided-tour` 0.5, `@vueuse/core`, `@iconify-json/heroicons`, `@vite-pwa/nuxt`, Vitest 5, Playwright 1.64 with `@axe-core/playwright`.

**Spec:** [`docs/drafter-phase1-design.md`](../drafter-phase1-design.md):
- §4: the first visit
- §5.4: the Keyboard shortcuts page
- §7: the writing aids
- §11: offline use
- §12: phones
- §16: tests

Read it with the [technical design](../drafter-technical-design.md) §13 and §16 and [architecture](../drafter-architecture.md) §6.1 (the browser table for **Saving and your browser**).

**Where this fits.** The last plan of Phase 1's web app (Plan 6 then wraps the finished app for the desktop), after [Plan 3](2026-10-26-phase1-plan3-write-and-keep.md) (write and keep your work) and [Plan 4](2026-10-26-phase1-plan4-the-full-editor.md) (the full editor). It consumes:
- Plan 3's editor session, layout, projects, and recovery copy
- Plan 4's command registry, settings, and app menu

## Global Constraints

- **Accessibility checking waits for the final stage** (decided 2026-10-26): tasks here add no axe checks, and Task 9's accessibility suite moves after Plan 6, the desktop app, as the project's last step. The guided tour (Task 6) stays: it's a feature. Functional keyboard tests stay.

- Everything in Plan 3's Global Constraints, except the branch and the dependencies.
  - **This plan's branch is `phase-1-launch`,** from `main` after Plan 4 merges. It merges to `main` when everything is green.
  - **New dependencies:** `nuxt-guided-tour`, `@vueuse/core` (its peer), `@iconify-json/heroicons` (its icons, bundled), and `@vite-pwa/nuxt`. Each gets its row before it's installed.
- **The tour never nags** (Phase 1 design §2):
  - It shows once.
  - It can be skipped from its first screen.
  - It works with the keyboard and a screen reader.
  - It comes back only from **Help → Take the tour**.
- **Motion:** under `prefers-reduced-motion`, nothing animates: typewriter scrolling, the tour's pulse, and dialogs.
- **Timers:** a sprint's countdown is never announced each second. Only its end is announced, once (§7.3).
- **No sound** unless the writer turns it on.

## Review Focus

1. **Esc means several things at once:** closing completion, closing the search panel, the tour, and leaving focus mode. The innermost goes first. Covered by Task 1's `closes completion before leaving focus mode`.
2. **A day boundary during a session.** The goal's "today" must roll over at local midnight. Covered by Task 3's `starts a new day at local midnight`.
3. **A tour step aimed at a hidden pane on a phone.** The pane must show before the step does. Covered by Task 6's `shows each step's target on a phone`.
4. **An update arriving with unsaved changes.** Reload must say so first, and never reload by itself. Covered by Task 7's `asks before reloading with unsaved changes`.
5. **The first visit and a returning one.** Only a browser with no scripts gets the welcome dialog. Covered by Task 5's `welcomes only a first visit`.

---

### Task 1: Focus mode

**Files:**
- Create: `apps/web/app/composables/useFocusMode.ts`, `apps/web/app/components/FocusMarker.vue`, `apps/web/e2e/focus.spec.ts`
- Modify: `app/pages/index.vue`, `AppToolbar.vue` (**Focus** works), `app/commands/builtin.ts`

**Interfaces (Produces):** `useFocusMode(): { on: Readonly<Ref<boolean>>; toggle(): void; leave(): void }`. **Toggle focus mode** is in group View, with keys `Mod-Shift-Enter`.

**Behavior** (§7.1):
- **What it hides:** the toolbar, the rows of tabs, the slim bars, the status bar, and the other pane.
- **The source** shows in a column 64 characters wide, centered, with the editor keeping focus.
- **Leaving:** Esc leaves, once CodeMirror has nothing of its own to close (completion, search). So does the command that entered.
- **The corner marker** shows the save state ("Saved", or "Unsaved changes") and, during a sprint, the time left (Task 4). The tab title keeps its dot.
- **On a phone** it does the same, with the Source pane.
- **Full screen:** it never requests it.

- [ ] **Step 1: Write the failing tests.**
  - `enters and leaves focus mode from the toolbar, the shortcut, and Esc`
  - `hides everything but the source and the marker`
  - `closes completion before leaving focus mode`
  - `shows the save state in the corner`
  - `has no accessibility violations in focus mode`: both themes, and on a phone.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): add focus mode`

---

### Task 2: Typewriter scrolling

**Files:**
- Create: `apps/web/app/editor/typewriter.ts`, `apps/web/e2e/typewriter.spec.ts`
- Modify:
  - `app/editor/extensions.ts`: a `typewriter` compartment
  - `app/settings/settings.ts`: `typewriter: boolean`, false by default
  - `SettingsDialog.vue`
  - `AppPane.vue`: the toggle in the Source slim bar
  - `app/commands/builtin.ts`

**Interfaces (Produces):** `typewriterScrolling(): Extension`.

**Behavior** (§7.2):
- **Centering:** after each change or cursor move the writer makes, it scrolls so the cursor's line sits at the middle of the Source pane (`EditorView.scrollIntoView(pos, { y: 'center' })`).
- **Room to center:** padding of half the pane's height above and below the content lets the first and last lines reach the middle.
- **Reduced motion:** the scroll is instant. It's also never animated without it, since CodeMirror's scrolling is instant; record that.
- **A separate setting:** it works with or without focus mode. Its toggle is in the Source slim bar (`aria-pressed`), the settings dialog, and the palette.

- [ ] **Step 1: Write the failing tests.**
  - `keeps the line being typed at the middle of the pane`: after typing 60 lines, the cursor's line is within one line height of the pane's middle.
  - `lets the first line reach the middle`
  - `remembers the setting after a reload`
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): add typewriter scrolling`

---

### Task 3: Counts and a daily goal

**Files:**
- Create:
  - `apps/web/app/stats/count.ts` (`countScript`)
  - `apps/web/app/stats/goal.ts` (`useGoal`)
  - `apps/web/app/components/CountsPanel.vue`
  - `apps/web/test/count.test.ts`, `apps/web/test/goal.test.ts`
  - `apps/web/e2e/counts.spec.ts`
- Modify: `AppStatusBar.vue` (the page item becomes the panel's button; goal progress)

**Interfaces (Produces):**
```ts
export interface Counts { pages: number; scenes: number; words: number; /** minutes, at a page a minute */ minutes: number }
/** Words count the text that prints: notes, boneyard, and the metadata block don't count. Pages leave out the title page. */
export function countScript(doc: Doc, layout: Layout | null): Counts;
export interface Goal { unit: 'pages' | 'words'; target: number }
export function useGoal(): {
  goal: Readonly<Ref<Goal | null>>;
  /** Growth since the day began, which a cut counts against; null without a goal. */
  progress: Readonly<ComputedRef<{ done: number; target: number; unit: 'pages' | 'words' } | null>>;
  setGoal(goal: Goal | null): Promise<void>;
};
```

- The goal and each day's starting counts live in the settings table, under `goal:<projectId>` and `day:<projectId>:<YYYY-MM-DD>` (local date), so the schema doesn't change.
- **The panel** opens from the status bar's page item. It shows pages, scenes, words, and running time, and sets or clears the goal.
- **The status bar** shows "1.5 of 3 pages today" or "420 of 1,000 words today". Pages are to one decimal, from the cursor's line position on the last page.

- [ ] **Step 1: Write the failing tests.**
  - `test/count.test.ts`:
    - `counts the sample's pages, scenes, and words`: pin the numbers once, computed by hand from the sample.
    - `doesn't count notes, boneyard, or the metadata block`
  - `test/goal.test.ts`, with fake timers and `fake-indexeddb`:
    - `measures progress as growth since the day began`
    - `counts a cut against the goal`
    - `starts a new day at local midnight`
  - `e2e/counts.spec.ts`:
    - `opens the counts from the status bar`
    - `sets a daily goal and shows progress`
    - `has no accessibility violations with the panel open`
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): count the script and track a daily goal`

---

### Task 4: Sprints

**Files:**
- Create: `apps/web/app/stats/sprint.ts` (`createSprint`, `useSprint`), `apps/web/test/sprint.test.ts`, `apps/web/e2e/sprint.spec.ts`
- Modify: `CountsPanel.vue` (start a sprint), `AppStatusBar.vue`, `FocusMarker.vue`, `app/commands/builtin.ts`, `app/settings/settings.ts` (`sprintSound: boolean`, false by default)

**Interfaces (Produces):**
```ts
export type SprintState = { status: 'idle' } | { status: 'running' | 'paused'; endsAt: number; remaining: number; startWords: number; startPages: number };
/** Pure timing over an injected clock, so it's unit-tested with fake timers. */
export function createSprint(clock: { now(): number }): {
  start(minutes: number, counts: Counts): void;
  pause(): void;
  resume(): void;
  stop(): void;
  tick(): SprintState;
};
export function useSprint(): {
  state: Readonly<Ref<SprintState>>;
  hidden: Ref<boolean>;
  start(minutes: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
};
```

**Behavior** (§7.3):
- **Starting:** sprints of 15, 25, or 45 minutes, or any whole number from 1 to 180, start from the panel or the palette.
- **The countdown** shows in the status bar and focus mode's marker. It's in a region that isn't live.
- **Controls:** **Pause**, **Stop**, and **Hide** (WCAG 2.2.2).
- **The end:**
  - A toast, and one polite announcement, says "Sprint done: 312 words (1.2 pages)."
  - A short tone plays only if the setting is on. It's made with the Web Audio API, with no audio file.

- [ ] **Step 1: Write the failing tests.**
  - `test/sprint.test.ts`:
    - `counts down and ends`
    - `pauses and resumes without losing time`
    - `stops without announcing`
  - `e2e/sprint.spec.ts`, with Playwright's clock (`page.clock.install`):
    - `runs a 15-minute sprint and reports what it added`
    - `announces only the end`: the live region's text changes once.
    - `can be paused, stopped, and hidden`
    - `has no accessibility violations during a sprint`
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): add sprints`

---

### Task 5: The first visit and the samples

**Files:**
- Create: `apps/web/app/components/SampleBar.vue`, `apps/web/e2e/first-visit.spec.ts`
- Modify: `app/storage/script.ts` (the first visit), `app/commands/builtin.ts` (**Reset sample**), `AppMenu.vue`

**Behavior** (§4.1–§4.3):
- **A first visit** is a browser with no projects. It opens the screenplay sample with the cursor on its first scene heading, source line 17, scrolled so the line is near the top. The Script pane shows the same place.
- **The sample bar** sits above the Source pane while a sample is open: "This is a sample. Start your own:", with **New screenplay**, **New stage play**, and **Open a file…**. It's a `region` labeled "Sample".
- **Reset sample** is in the palette and the Help menu. It restores the sample's original text as one undoable change.
- **A returning visit** opens the most recent script, with no welcome dialog and no sample bar unless that script is a sample.

- [ ] **Step 1: Write the failing tests.**
  - `opens a first visit on the sample's first scene heading`
  - `offers new scripts and Open from the sample bar`
  - `resets the sample, and undo brings the edits back`
  - `welcomes only a first visit`: the welcome dialog itself arrives in Task 6. This test asserts that `isFirstVisit()` is true only without projects, and Task 6 extends it.
  - `has no accessibility violations on a first visit`: both themes, and on a phone.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): open the sample on a first visit`

---

### Task 6: The welcome dialog and the guided tour

**Files:**
- Create: `apps/web/app/tour/tour.config.ts`, `apps/web/app/components/AppTour.vue`, `apps/web/e2e/tour.spec.ts`
- Modify: `apps/web/package.json`, `docs/DEPENDENCIES.md`, `nuxt.config.ts` (the module; `guidedTour.highlightColor: '#E5B04A'`; the Heroicons names the module uses, added to `icon.clientBundle.icons`), `AppMenu.vue` (**Help → Take the tour**), `app/commands/builtin.ts`

**The tour** follows Phase 1 design §4.4:
- **`TourWelcome`** on a first visit only: **Take the tour**, or "No thanks, I'll look around."
- **`TourIntro`'s card,** "Fountain in 30 seconds". Its examples: `INT. KITCHEN - NIGHT`, a name in capitals with a line under it, `(quietly)`, `CUT TO:`, and `[[a note]]`.
- **The ten steps** of the table there, targeting the existing `data-tour` attributes: `source`, `script`, `source`, `problems`, `template`, `save`, `status`, `export`, `focus`, and `palette`. Polish the wording; keep the tour near two minutes.
- **Its version** is `1`, and `storageKeyPrefix` is `drafter-tour`.

**On a phone,** `AppTour.vue` watches the current step. If the step's target is a pane that isn't showing, it switches the phone's tab to it first. A toolbar target is always showing.

**The content security policy** needs no change. The module's inline `<style>` is allowed by `style-src 'unsafe-inline'`, which Plan 1 recorded. Its icons are bundled. `e2e/security.spec.ts` must stay green.

- [ ] **Step 1: Write the failing tests** (`e2e/tour.spec.ts`).
  - `welcomes a first visit and takes the tour with the keyboard`: Enter on **Take the tour**, ArrowRight through all ten steps, and each step's target is highlighted.
  - `skips the tour from the welcome, and never shows it again`: reload, and there's no dialog.
  - `replays the tour from Help`
  - `shows each step's target on a phone`
  - `announces each step to screen readers`: the module's live region changes with each step.
  - `has no accessibility violations at any step`: axe at the welcome, the intro, and every step, in the dark theme, and on a phone at three steps.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.** Add the dependency rows, then install.
- [ ] **Step 4: Run them again.** → PASS, with `e2e/security.spec.ts`.
- [ ] **Step 5: Commit.** `feat(web): welcome first-time visitors with a guided tour`

---

### Task 7: Offline use and updates

**Files:**
- Create: `apps/web/app/components/UpdatePrompt.vue`, `apps/web/e2e/offline.spec.ts`
- Modify: `apps/web/package.json`, `docs/DEPENDENCIES.md`, `nuxt.config.ts` (`@vite-pwa/nuxt`), `scripts/csp.mjs` (if the registration adds an inline script; the existing hashing must cover it), `test/csp.test.ts`

**Configuration:**
- **The manifest:**
  - name "Drafter", short name "Drafter"
  - `display: standalone`
  - background and theme color `#0F1013`
  - icons `icon-192.png`, `icon-512.png`, and `icon-maskable-512.png` (purpose `maskable`)
- **The service worker:**
  - It precaches the app shell, its scripts and styles, Inter Tight, the four Courier Prime files, the workers, and the icons.
  - It has no runtime caching of anything else.
  - `registerType: 'prompt'`.
- **When an update is waiting,** `UpdatePrompt.vue` shows a toast: "A new version of Drafter is ready", with **Reload**.
  - With unsaved changes, **Reload** first says: "Your unsaved changes stay in this browser's recovery copy, but they aren't in your file yet." It offers **Save first**, **Reload anyway**, and **Cancel**.
  - It never reloads by itself.
- **Safari's storage warning** (Plan 4) gains the install advice: Add to Dock, or Add to Home Screen.

- [ ] **Step 1: Write the failing tests** (`e2e/offline.spec.ts`, Chromium).
  - `works offline after the first visit`: load, wait for the service worker to control the page, set the context offline, and reload. The editor loads and the sample's pages render.
  - `serves the web app manifest`
  - `asks before reloading with unsaved changes`: simulate a waiting worker through the registration's update hook.
  - `keeps the content security policy`: `e2e/security.spec.ts` passes on the service-worker build.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): work offline and offer updates`

---

### Task 8: The help pages

**Files:**
- Create:
  - `apps/web/app/pages/docs/saving.vue`, `apps/web/app/pages/docs/shortcuts.vue`, `apps/web/app/pages/docs/privacy.vue`
  - `apps/web/app/layouts/docs.vue`
  - `apps/web/e2e/docs.spec.ts`
- Modify:
  - `app/commands/builtin.ts`: split each command's data (id, title, group, keys) from its `run`, so the shortcuts page can import the data without an editor
  - `nuxt.config.ts`: `/docs/**` prerendered, with SSR on
  - `AppMenu.vue`: **Help** gains the three pages
  - `apps/web/app/spa-loading-template.html`: the description links the pages

**Pages** (§4.5), in plain language, each with its title and description meta:
- **Saving and your browser:**
  - the browser table from architecture §6.1
  - what Save does on Chrome and Edge, and what it does elsewhere
  - synced folders (§9.2): Dropbox, Google Drive, and iCloud Drive
  - the recovery copy and its warnings
- **Keyboard shortcuts:** generated from the command data, grouped. Each key appears in both notations (⌘ and Ctrl), so the prerendered page doesn't depend on the reader's platform.
- **Privacy:** Drafter never sends a script anywhere; there's no account, no analytics, and no telemetry; everything stays in the browser and the files the writer chooses.

- [ ] **Step 1: Write the failing tests** (`e2e/docs.spec.ts`).
  - `prerenders each help page with its title and description`: fetch the HTML without JavaScript.
  - `lists every registered command on the shortcuts page`: compare with the command data's titles.
  - `reaches the pages from Help`
  - `has no accessibility violations on any help page`: both themes, and on a phone.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): add the help pages`

---

### Task 9: The accessibility suite, phones, and the unknown-template warning

**Files:**
- Create: `apps/web/e2e/a11y.spec.ts`, `apps/web/e2e/keyboard.spec.ts`
- Modify: `AppMenu.vue` (the template choice, for phones, where the toolbar's chip is hidden), `app/editor/template.ts` (the unknown-template warning), `docs/DEFERRED.md` (take the warning off)

**What it covers:**
- **Phones** (§12): every toolbar action is reachable at 320px: the icon buttons, the app menu, and the template choice in the app menu. Record that the icon toolbar plus the app menu is this design's "toolbar folds into a menu".
- **The unknown-template warning** (technical design §8.6, deferred by Plan 3): when `doc.meta.template` names a template Drafter doesn't have, the template chip reads "Screenplay (fallback)". Its menu says "This script asks for “…”, which Drafter doesn't have, so it's shown as a screenplay."
- **The suite** (§1, item 5, and §16):
  - axe on every major state, in both themes, at desktop and phone sizes: the first visit, editing, Problems, focus mode, each dialog, and each menu. The tour is covered by Task 6.
  - Accessibility-tree assertions with `toMatchAriaSnapshot`:
    - the landmarks: banner (the toolbar), main, and the status bar's `contentinfo`
    - the Script region's headings
    - the labels of every control
    - the live regions' text
  - A keyboard-only journey (`keyboard.spec.ts`): start a new screenplay; type a scene with a cue, a parenthetical, and dialogue; go to it from the palette; fix a problem; switch to a stage play and back; save by download; and export a PDF. No mouse event is used.

- [ ] **Step 1: Write the failing tests.**
- [ ] **Step 2: Run them.** → FAIL where a gap exists. Each gap gets its fix, with the test that found it.
- [ ] **Step 3: Implement** the fixes, the phone template choice, and the warning.
- [ ] **Step 4: Run them again.** → PASS, with the whole suite in every engine.
- [ ] **Step 5: Commit.** `test(web): check every state's accessibility, and the keyboard journey`

---

### Task 10: Launch

**Files:**
- Modify: `README.md` (Phase 1's status, and what drafter.dev does now), `CHANGELOG.md`, `docs/DECISIONS.md`, `docs/DEFERRED.md`

**Steps:**
- [ ] **Step 1:** Build as Netlify does: `rm -rf apps/web/.output && pnpm --filter @drafter/web... run build`. Run the full suite: `pnpm test`, `pnpm check`, the typechecks, and `pnpm --filter @drafter/web e2e`.
- [ ] **Step 2:** Update the README's roadmap (Phase 1 done) and its description of the app, and move the CHANGELOG's Phase 1 entries under a `0.1.0` heading dated the day of the merge.
- [ ] **Step 3: Commit.** `docs: mark Phase 1 done`
- [ ] **Step 4:** After the merge deploys, audit https://drafter.dev/ with the `lightcap` MCP server (`run_audit`: performance, accessibility, best practices, SEO). Record the scores in the CHANGELOG entry's follow-up, and fix anything under 90 that's in reach, with tests.

---

**Phase 1 is done when** every item of Phase 1 design §1's "Done when" holds on drafter.dev. The NVDA and VoiceOver passes are Phase 2's, as decided.
