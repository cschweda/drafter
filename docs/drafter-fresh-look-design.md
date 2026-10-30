# A fresh look — Design

**Status:** designed 2026-10-30; not built. Ships as **v0.23.0**, after Export as HTML and EPUB (v0.22.0) and before Drafts and Cuts (v0.24.0), so the features after it are built in the new look. The approved mockup is in `.superpowers/brainstorm/88841-1793393198/content/fresh-look.html` (local; the screenshots below are described in words so this document stands alone).

**Asked for (maintainer, 2026-10-30):** "please also give the overall UI a fresh look with adversarial eyes. Does the UI work and look good? Is it modern? Will it seem outdated in a year? Make adjustments so that it looks modern and sleek and full functional." Shown the mockup (today vs. proposed, dark, light, phone): "yes this works".

**Why:** an independent design review of drafter.dev v0.21.1 found it "competent but assembled rather than designed": five stacked bars before the writing, pastel circle icons, about six button styles, data views that look like plain HTML tables, dialogs from another design system, and a script page in dark mode that reads as a code block. It works, but it will look dated within a year — because of the chrome around the editor, not the editor.

**Clean room (binding).** Drafter's own design. "In the spirit of current pro writing and IDE tools" describes a feeling (calm, quiet chrome, paper-first), not a product to copy: no layouts, icons, or styles traced from any app.

Each choice open to the designer is marked **Call:**; they are listed in §12.

## 1. The direction

**Calm and paper-first.** The writing surface and the page are the only things with presence. The chrome is near-monochrome, one step off the background, drawn with fills rather than borders. **Goldenrod is the single accent**: caret, current line, active tab, primary button, focus. The revision-page colours (blue, pink, yellow, green, goldenrod, salmon, cherry, buff) stay where they mean something: the logo, the script's syntax colours, scene colours, and charts — never on controls.

**Goals:** two bars at most above the writing; one icon style; one button system; one dialog style; a page that looks like paper; designed (not merely styled) Stats and Scaffold pages; a phone layout made for a phone; every current feature still reachable in the same number of steps or fewer; WCAG 2.2 AA kept in both themes.

**Non-goals:** new features; changing what any command does; changing the script's own typesetting (Courier Prime pages are the product).

**Anti-goals (a failure even if it looks nice):** anything harder to find than today; lower contrast than AA anywhere; colour carrying meaning alone; motion that can't be turned off; a regression in any e2e, axe, or performance budget.

## 2. Tokens

One set of CSS custom properties on `:root` (dark) and `.light` (light), replacing the scattered colours in `main.css` and component styles. Nuxt UI's theme maps to them.

```
dark:  --bg #0f1013  --surface #15171b  --raised #1c1f24  --overlay #23262c  --border #262a31
       --text #e7e9ed  --muted #9aa1ad  --faint #6f7684
       --accent #e5b04a  --accent-soft rgb(229 176 74 / .14)  --on-accent #111216  --focus #f2cb7a
       --desk #0b0c0f  --paper #e8e4da  --paper-ink #1c1c1c
light: --bg #f6f5f2  --surface #ffffff  --raised #f0efeb  --overlay #e9e7e2  --border #e3e1dc
       --text #1b1c20  --muted #5d6372  --faint #8a909b
       --accent #e5b04a (fills only)  --accent-text #7a5200  --accent-soft rgb(229 176 74 / .20)  --focus #a06a00
       --desk #e9e7e2  --paper #ffffff  --paper-ink #1c1c1c
radius:  --radius-sm 6px  --radius 8px  --radius-lg 12px
space:   4 8 12 16 24 32 48
type:    Inter Tight for the interface; Courier Prime for the script.
         12/16·500 meta · 13/18·500 UI · 14/20 body · 15/20·600 h3 · 18/24·600 h2 · 22/28·650 h1
icons:   Lucide (already in the app's icon set), 16px, stroke 1.75, currentColor: --muted, --text on hover/active
focus:   2px solid --focus, offset 2px — controls only (§8)
motion:  140ms cubic-bezier(.2,.8,.2,1): fade + 4px slide for menus, popovers, dialogs; none under prefers-reduced-motion
```

- **Call:** `--faint` is for disabled and decorative text only; anything a reader must read uses `--muted` or `--text` (both AA on every surface, measured by a test).
- **Call:** the light theme's goldenrod is a **fill** (active tab underline, primary button, current-line bar); text in the accent colour uses `--accent-text` (AA on white and `--raised`).
- The syntax colours keep their current hues and their AA-on-surface tests; they move onto the new surfaces and are re-measured.

## 3. The frame

### 3.1 Top bar (44px)

Left to right: **the Drafter mark and wordmark, which open the app menu, as they do today** (the maintainer, 2026-10-30: "i still want the drafter icon at the top -- with the button options"; the menu keeps every item it has now: New, Open, Save, Export, Template, History, Settings, Help, and the rest) · the script's title (13/600) · a **chip** for the script's state (a sample: "Sample · Start your own ▾", whose menu is New screenplay / New stage play / New Markdown document / Open a file…; a read-only tab; a draft label once Drafts and Cuts lands) · a separator · **Open**, **Save**, **Export ▾** as borderless buttons (icon + label) · (flexible space) · the command search ("Go to scene or command ⌘K", 260px, `--raised`) · icon buttons: **Structure strip**, **Focus**, **Theme**. There is no separate menu button: the Drafter mark at the left is the menu.

- The template switcher ("Screenplay") moves into the Menu and the status bar (§3.4). **Call:** the Structure strip toggle becomes an icon button in the top bar's right-hand group (beside Focus), always visible whatever the Inspector shows, and stays in the palette and Settings.
- **Call:** below 1024px the labels on Open/Save/Export drop (icons stay, with tooltips), and the app shows **one pane at a time with the bottom tab bar of §6** (Write · Script · Outline · More), as a phone does; the status bar stays from 640px up and is hidden below. (Today below 1024px is already one pane switched by tabs; the bottom bar replaces those tabs.)

### 3.2 The editor pane (left) — "Write"

- No tab strip: on a wide screen the left pane **is** the editor. **Call: the pane model changes.** Today either pane can hold any tab and choosing one open in the other pane swaps them; from v0.23.0 the left pane always holds the editor and every other view lives in the Inspector, so the swap rule and the left pane's tab choice go away (fixes "Show Script removes the editor"). A stored layout whose left pane held something else is migrated once: the editor goes left and that view becomes the Inspector's open tab. The commands keep their names ("Show Source" still shows the editor and gains the palette keyword "write").
- A 36px header holds the **element bar** (Scene · Action · Character · Dialogue · Paren · Transition, compact chips; the current element `--accent-soft`), shown while the editor has focus and replaced by the script's title when it doesn't, and on the right the editor's toggles as **icon buttons** (Line numbers, Typewriter, Sync scrolling) with pressed state = `--accent-soft`. The element bar never clips: it collapses to the current element + "More ▾" when narrow (fixes the clipped `?`/`⋯`).
- The element bar's typing hints ("Character @") move to tooltips.
- The current line: a 2px accent bar at the left edge and a faint tint.

### 3.3 The Inspector (right)

- A 36px header with its **own tabs**: Script, Outline, Cards, Stats, Scaffold, and More ▾ (Notes, Problems with a count badge, History views, Compare). Icon + label, 32px; the active tab = text colour + 2px accent underline, no fill.
- Right side of the header: the active view's few tools (the Script: "1 / 2", Changes toggle, Fit/100% as a **segmented control**; Outline/Cards: their sort/size controls).
- **Call:** palette "Show X" opens X in the Inspector, never in both panes (fixes "a view opened from the palette is added to both strips").
- **Call: which tabs show.** A script: Script, Outline, Cards, Stats, Scaffold in the row; More ▾ holds Notes, Problems (with its count badge), Compare, Deleted scenes (Cuts from v0.24.0), the history views, and script modules' tabs. A Markdown document: Preview and Stats in the row; More ▾ holds Problems and Compare. Compare and Deleted scenes open in the Inspector beside the editor, as they do today opposite Source. When the Inspector is too narrow for its row, tabs move into More ▾ from the right (measured, not a fixed count).
- **Call: view tools.** Each view renders its own tools into the Inspector header's right side through one slot (a Teleport target the header owns), so the header stays one component and each view keeps its tools' code. When tabs and tools would collide, the tools fold into a "⋯" menu first, then tabs move into More ▾.
- The Structure strip, when on, sits between the top bar and the panes as today, restyled to the tokens.

### 3.4 Status bar (24px)

Left: save state with a dot (Saved / Unsaved / Saving…) and the file name; the recovery-copy state only when it matters (a warning chip). Right: pages and running time, words, problems (a button), the template. Items are borderless buttons that fill on hover — **no dotted underlines**. **Call:** nothing repeats the top bar or the Inspector. Hidden on phones (§6).

### 3.5 Banners

The sample bar becomes the top bar's chip (§3.1). The storage warning ("This browser may clear your recovery copy…") becomes a **status-bar warning chip** plus a one-time toast with the same Install/Save actions. **Call:** no full-width banner above the panes in normal use; a banner remains only for something that blocks writing (an error loading the script).

## 4. The page

- **The paper fills the view (maintainer, 2026-10-30: "extend the script all the way to the bottom … It's a page of paper … even if it's not full -- that's fine").** Every page is drawn at its full paper height (US Letter or A4 proportions), never shrunk to its text, so the paper always runs from the top of the Inspector to its bottom edge (and on past it, as real pages do); a short last page is still a whole sheet with white space below the text. There is never an empty desk under a page that ends early.
- **Call:** the script page is **paper on a desk** in both themes: `--paper` with `--paper-ink`, a 1px hairline and a soft two-layer shadow, a 24px gap between pages, 24px space above the first page. Dark mode's paper is "dim" (`#e8e4da`), not white.
- A setting **Page colour: Paper (default) · Dark** keeps today's dark page for writers who want it (it is a real preference for night writing). **Call:** it is an app-wide setting, stored with the other settings; it applies to every page drawn on screen (the Script tab, Compare's Pages, Show changes) and never to print, the PDF, or any export. The contrast test measures the page's marks (Show changes, notes on pages, scene numbers) on both page colours, and the editor's syntax colours on both themes.
- Show changes' marks, notes on pages, and scene numbers are re-checked for AA on the paper colour.

## 5. Components

- **Buttons — four variants only:** primary (accent fill, `--on-accent` text), secondary (`--raised` fill, no border), borderless (transparent, `--raised` on hover), and the **segmented control** for either/or choices. Icon buttons are borderless 30×30. Today's outlined rectangles, pill toggles, dotted links, and the tour's blue button all map to these.
- **Tabs:** as §3.3, everywhere tabs appear (Stats sections become a segmented control or in-page links styled as tabs).
- **Menus and popovers:** `--overlay`, radius 8, 1px `--border`, shadow, 6px padding, 30px rows with a 16px icon column and right-aligned shortcuts; the motion of §2.
- **Dialogs — one style:** `--raised`, radius 12, large shadow, 24px padding, title 18/600, a real backdrop (`rgb(0 0 0 / .5)` dark, `/ .25` light), widths 440 (welcome, confirm) / 560 (forms) / 760 (Settings). Footer: secondary left-to-right then primary. The **welcome and tour** cards are restyled to this (overriding the tour module's slate gradient and blue button, as `tour.css` already overrides its colours), sized to content.
- **Settings:** a left-hand section list (General, Writing, Script, Spelling, Files, Modules, About) and the section's controls on the right, instead of one 30-row scroll.
- **Tables (Stats, Scaffold, History):** `--surface` rows, 36px, hairline row dividers, sticky header, numbers right-aligned in tabular figures; links underlined on hover only.
- **Empty states:** centred, a 20px icon in `--muted`, one sentence, an action if there is one ("No problems — the script reads cleanly." ✓).
- **Cards (Outline's Cards view):** a card without a synopsis shows the scene's first action line in `--muted`, so no card is an empty box.

## 6. The phone

- One 44px top bar: the Drafter mark (the app menu, as on a wide screen), title, search. (The same one-pane layout serves every width below 1024px; §3.1.)
- A **56px bottom tab bar**: Write · Script · Outline · More (More: Cards, Stats, Scaffold, Notes, Problems, History). **Call:** a **fresh** visit on a phone opens on **Write** (fixes "the phone opened on the Script tab"); a returning visit keeps the tab it last had (the stored phone tab), so nobody's habit changes.
- The element bar is a row **above the on-screen keyboard** while typing (positioned with `visualViewport`), scrolling horizontally, never cut mid-word.
- Menus and the palette open as **bottom sheets**; dialogs full-height sheets.
- No status bar; save state is the top bar's title colour/dot, and the counts live in Stats.

## 7. Stats and Scaffold as designed pages

- A centred column (max 720px, 24px padding), page title 20/600 (not a repeated "Characters / Characters").
- **Stat tiles** for Pages, Scenes, Words, Running time (value 22/650, label 12/500 `--muted`).
- Explanations behind an (i) popover, not running full-width.
- Interior/Exterior and Day/Night as two stacked 100% bars with labels, instead of a seven-row table.
- The character grid fills its section (no mostly-empty box).
- Fixes the review's overlapping column headers ("Screen timeMost often with") and the half-hidden heading after jumping to a section (scroll-margin-top under the sticky links).

## 8. Focus and motion

- **Call:** the visible focus ring is for **controls** (buttons, links, tabs, inputs, cells). Elements the app focuses for screen readers (headings with `tabindex="-1"`, the editor container, the focus-mode frame) get **no outline** — the caret shows editor focus, and a heading needs none. This removes the review's gold boxes around headings and around the whole screen in focus mode, without losing any keyboard focus indication on controls (WCAG 2.4.7 and 2.4.11 still met; tested).
- Motion as §2, off under `prefers-reduced-motion`.

## 9. Theme default

**Call:** dark stays the default (the brand and the maintainer's preference), and **"Match system appearance"** stays a setting, now **on by default for a fresh visit** — one with no stored theme choice and no stored settings at all — so a light-system reader isn't surprised by dark; once the writer picks a theme, that choice wins. Existing visitors who have settings stored are left exactly as they are. (The review noted "a browser set to light still opened dark".)

## 10. How it's built

- **Tokens first** (`main.css`, `app.config.ts` for Nuxt UI, and a contrast test over every text/surface pair), then the frame (top bar, panes, status bar), then components, then views (Stats, Scaffold, dialogs, Settings), then the phone layout.
- Every component keeps its accessible names, roles, keyboard behaviour and test hooks (`data-tour`, roles, labels the e2e tests use); where a control moves (template switcher, Structure toggle, sample actions), the commands and palette entries stay the same, and the help pages and tour steps are updated to the new places.
- The guided tour keeps its **ten steps**, re-pointed to the new targets (the template step points at the Drafter mark's menu, the status step at the new status bar). **Call:** in the one-pane layout (below 1024px), a step whose target isn't on screen points at where that thing now lives — the Menu, or More in the bottom tab bar — as today's template step already does on a phone; no step is dropped.
- The desktop app needs no change beyond what the web app gives it.

## 10a. Which numbers bind

**Call:** the bar heights, widths, and type sizes in §2–§6 are targets the builder may adjust by a few pixels to make a layout fit. What binds: at most two bars above the writing on a wide screen; the element bar never clips (tested at 1280 and 1440 with two panes, and on a phone); AA contrast for every text/surface pair; touch targets of at least 24×24 CSS px (44 on phones for the bottom tab bar); and no regression in any existing budget.

## 11. Testing

- **Visual:** a Playwright screenshot sweep (the review's list: editor, Outline, Cards, Notes, Problems, Stats ×3, Scaffold ×2, palette, Settings, Export menu, Export options, History, focus mode, welcome, tour) in both themes at 1440×900 and on an iPhone 14, kept as reviewable images (not pixel-diff tests).
- **axe** on every view in both themes (the existing a11y spec, extended to the new Settings sections and bottom sheets).
- **Contrast test** over the token pairs (§2) and the syntax colours on both surfaces.
- **Functional:** the review's bugs each get a regression test: Show Script keeps the editor; a palette view opens in the Inspector only; Stats column headers don't overlap (bounding boxes); the element bar never clips (scrollWidth ≤ clientWidth at 1280 and 1440 with two panes, and on a phone); no outline on a programmatically focused heading while controls keep theirs; a light-system first visit opens light.
- **Budgets:** the existing typing/long-task and first-paint budgets must hold.
- The whole web e2e suite on all five projects, and the desktop e2e.

## 12. The calls

1. `--faint` only for disabled/decorative text (§2).
2. Light theme goldenrod as fill; accent text uses `--accent-text` (§2).
3. Labels drop below 1024px; phone layout below 640px (§3.1).
4. The left pane is the editor; palette views never replace it (§3.2).
5. Palette "Show X" opens in the Inspector only (§3.3).
6. Status bar repeats nothing; hidden on phones (§3.4).
7. No full-width banners except blocking errors (§3.5).
8. Paper page by default in both themes; a "Page colour" setting keeps the dark page (§4).
9. Four button variants, one dialog style, Settings with sections (§5).
10. Phone opens on Write; bottom tab bar; element bar above the keyboard; sheets (§6).
11. Focus rings on controls only; no outline on programmatically focused non-controls (§8).
12. Dark default; a fresh visit matches the system (§9).
13. The left pane is always the editor; no swap rule; old layouts migrated once (§3.2).
14. The Inspector's tab row and More ▾ by document kind; overflow measured (§3.3).
15. View tools teleport into the Inspector header; fold into "⋯" when tight (§3.3).
16. The Structure toggle is a top-bar icon (§3.1).
17. Below 1024px: one pane with the bottom tab bar (§3.1, §6).
18. Page colour is app-wide, on-screen only (§4).
19. A returning phone visit keeps its tab (§6).
20. The tour keeps ten steps; absent targets point at the Menu or More (§10).
21. Bar sizes are targets; the binding limits are listed (§10a).
