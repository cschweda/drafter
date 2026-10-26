# Phase 1, Plan 2: Editor Packages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the four libraries the editor needs, each framework-free and tested:
- the text renderer, moved out of the CLI
- the linter
- the Script pane's HTML renderer
- the CodeMirror integration

The app wires them up in Plan 3.

**Architecture:** Each is a workspace package under `packages/`, built like Phase 0's. Three small engine changes come first, because the packages depend on them:
- the parser exposes its note and boneyard regions
- templates can mark heading roles
- the stage play turns off two rules that don't apply to plays

Then the three packages:
- `@drafter/lint` turns a parsed script into diagnostics, with fixes.
- `@drafter/render-html` turns a layout into accessible, absolutely positioned DOM.
- `@drafter/cm-fountain` makes CodeMirror 6 a Fountain editor driven by the one parser.

**Tech Stack:** TypeScript 5.9; CodeMirror 6 (`@codemirror/state` 6.7, `@codemirror/view` 6.43, `@codemirror/language` 6.13, `@codemirror/autocomplete` 6.20, `@codemirror/lint` 6.9); jsdom 30 for DOM tests; Vitest 5; fast-check.

**Spec:** [`docs/drafter-phase1-design.md`](../drafter-phase1-design.md) §5.3, §5.5, §5.6, §10, and §13, and the technical design it points to:
- [`docs/drafter-technical-design.md`](../drafter-technical-design.md) §2.2–§2.5 (blocks and classification)
- §3 (`cm-fountain`), §6.1 (`render-html`), and §9 (`lint`)
- §13 (accessibility) and §14 (security)

**Where this fits:** this is Plan 2 of Phase 1's five plans; [Plan 1](2026-10-25-phase1-plan1-shell-and-deploy.md) lists them all. The app doesn't change in this plan.

## Global Constraints

- Node 22.13 or later, pnpm 10.33.4, strict TypeScript, ESM only.
- **Package conventions,** as in Phase 0 (copy `packages/layout` as the template):
  - `name` `@drafter/<name>`, `version` `0.0.1`, `license` `MIT`, `"type": "module"`, and `"sideEffects": false` (`render-html`: `["*.css"]`)
  - `exports` `{ "source": "./src/index.ts", "types": "./dist/index.d.ts", "default": "./dist/index.js" }` and `"files": ["dist"]`
  - scripts `build` (`tsdown`), `test` (`vitest run`), and `typecheck` (`tsc --noEmit`)
  - a `tsconfig.json` that extends `../../tsconfig.base.json`. DOM packages (`render-html`, `cm-fountain`) add `"lib": ["ES2023", "DOM", "DOM.Iterable"]`.
  - a `vitest.config.ts` that merges `../../vitest.shared.ts` with its own `name`. DOM packages set `environment: 'jsdom'`.
  - a `README.md`
  - the package's name added to the `packages` list in `vitest.shared.ts`
- **Dependencies:** only these, each with its row in `docs/DEPENDENCIES.md` before it's installed:
  - `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/autocomplete`, and `@codemirror/lint`: `cm-fountain`'s runtime
  - `jsdom` and `@types/jsdom`: development, at the root

  No Lezer grammar, and no Fountain package.
- Script text reaches the DOM only through `textContent` or CodeMirror's own rendering, never `innerHTML` (technical design §14).
- Anything that runs on each keystroke is linear in the script's size on any input, and a complexity test proves it, as in Phase 0.
- The editor keeps a file's line endings: commands insert `state.lineBreak`, never a literal `\n`.
- **Work on the branch `phase-1-editor-packages`.** Merge to `main` only when everything is green, since `main` deploys drafter.dev.
- Every push carries a CHANGELOG entry, and commit messages carry no AI co-author trailer and no session link. Choices this plan leaves open go in `docs/DECISIONS.md`, under each package's heading.

## Review Focus

1. **CRLF files.** A script written on Windows must keep its `\r\n` endings through every fix and every editor command. Covered by Task 4's test `inserts a CRLF blank line in a CRLF file` and Task 10's test `inserts the file's own line break`.
2. **Script text that looks like HTML.** A line such as `<img src=x onerror=alert(1)>` must show as text in the Script pane and never become an element. Covered by Task 7's test `renders text as text`.
3. **Hostile or huge scripts while typing.** Twenty thousand distinct character names, or a 200 KB script, must not stall linting or highlighting. Covered by Task 6's test `checks 20,000 names in under a second` and Task 9's test `decorates only the given range`.
4. **Characters outside the Basic Multilingual Plane** (emoji, rare CJK) in names and cues. Edit distance counts code points, and upper-casing never splits a pair. Covered by Task 6's test `counts code points, not UTF-16 units` and Task 10's test `upper-cases a cue without splitting surrogate pairs`.
5. **A layout older than the editor.** The worker's layout can lag the text, so a block index can point past the layout. That must never throw. Covered by Task 8's test `ignores a block index the layout doesn't have`.

---

### Task 1: Move the text renderer into `@drafter/render-text`

Phase 1 design §10: the app needs `renderText` without depending on the command line.

**Files:**
- Create: `packages/render-text/` (package files per Global Constraints)
- Move: `packages/cli/src/txt.ts` to `packages/render-text/src/index.ts`, and `packages/cli/test/txt.test.ts` to `packages/render-text/test/render-text.test.ts`
- Modify:
  - `packages/cli/src/cli.ts`: import from `@drafter/render-text`, and drop `export { renderText }`
  - `packages/cli/package.json`: the new dependency
  - `vitest.shared.ts`
  - `docs/DEPENDENCIES.md`: a row for `@drafter/render-text`, depending on `@drafter/layout` and `@drafter/templates`
  - `docs/DECISIONS.md`: the CLI's "Entry points" line, which now exports only `run`
  - the README's Packages section, and `CHANGELOG.md`

**Interfaces:**
- Produces `renderText(layout: Layout, template: Template): string` from `@drafter/render-text`, with unchanged behavior.

- [ ] **Step 1: Move the tests first.** Point the moved test at `import { renderText } from '@drafter/render-text'`, and fix its `repo()` helper path.
- [ ] **Step 2: Run them.** `pnpm vitest run --project render-text` → FAIL, because the package doesn't exist.
- [ ] **Step 3: Create the package** with `git mv packages/cli/src/txt.ts packages/render-text/src/index.ts`, then point the CLI at it.
- [ ] **Step 4: Run them again.** `pnpm vitest run --project render-text --project cli` → PASS, the CLI's acceptance tests included, after `pnpm -r build`.
- [ ] **Step 5: Commit.** `refactor: move the text renderer into @drafter/render-text`

---

### Task 2: The parser exposes note and boneyard regions

`cm-fountain` colors notes and boneyard (Task 9), and the parser's pre-pass (technical design §2.4) already finds them.

**Files:**
- Modify: `packages/fountain/src/types.ts`, `parse.ts`, `index.ts`
- Test: `packages/fountain/test/parse.test.ts`, `reparse.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Region { kind: 'note' | 'boneyard'; span: Span; closed: boolean }
  // Doc gains:
  readonly regions: readonly Region[];
  ```
  The regions are in source order:
  - a note runs from `[[` through `]]`
  - a boneyard runs from `/*` through `*/`, or to the end of the source when unclosed (`closed: false`)
  - an unclosed note is no region, since it stays text

  `toJSON` doesn't change.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  it('lists notes and boneyard in source order', () => {
    expect(parse('A [[n1]] B\n\n/* bone */\n').regions).toEqual([
      { kind: 'note', span: { from: 2, to: 8 }, closed: true },
      { kind: 'boneyard', span: { from: 12, to: 22 }, closed: true },
    ]);
  });
  it('runs an unclosed boneyard to the end and leaves an unclosed note out', () => {
    expect(parse('[[open\n\nText /* to the end').regions).toEqual([
      { kind: 'boneyard', span: { from: 13, to: 26 }, closed: false },
    ]);
  });
  ```
  In `reparse.test.ts`'s property test, also compare `regions` with a fresh parse's.
- [ ] **Step 2: Run them.** `pnpm vitest run --project fountain` → FAIL: `regions` is undefined.
- [ ] **Step 3: Implement.** Keep the pre-pass's regions on the `Doc`, mapped from `{ from, to }` to `{ span }`.
- [ ] **Step 4: Run them again.** `pnpm vitest run --project fountain` → PASS, the 10,000-string round trip and 1,000 edit sequences included.
- [ ] **Step 5: Commit.** `feat(fountain): expose note and boneyard regions`

---

### Task 3: Templates mark heading roles, and the stage play turns off rules that don't apply

Technical design §13: headings in the rendered script follow what prints. Scene headings are level 2 in a screenplay; in a play, act headings are level 2 and scene headings level 3. Plays have no sluglines or transitions, and the layout already flags them as disabled elements, so the two lint rules about them stay off.

**Files:**
- Modify:
  - `packages/templates/src/types.ts` and `validate.ts`
  - `src/builtins/us-screenplay.json` and `stage-play-standard.json`
  - `packages/templates/README.md`
- Test: `packages/templates/test/` (the existing validation and built-in tests)

**Interfaces:**
- Produces `RoleStyle.heading?: number`: the heading level a role's blocks take in the rendered script, an integer from 2 to 6.
- The built-ins set it:
  - `us-screenplay`: `scene_heading.heading: 2`
  - `stage-play-standard`: `act_heading.heading: 2` and `scene_heading_play.heading: 3`
- `stage-play-standard` gains `"lint": { "disable": ["heading-no-time", "transition-not-last"] }`.

- [ ] **Step 1: Write the failing tests.**
  - `accepts heading levels 2 to 6 and rejects others`: 1, 7, and 2.5 each give a `TemplateError` naming `roles.<role>.heading`, in the format the existing tests use.
  - `marks the screenplay's scene headings, and the play's act and scene headings`: the built-in values above.
  - `turns off the heading and transition rules in the stage play`: `builtins['stage-play-standard'].lint`.
- [ ] **Step 2: Run them.** `pnpm vitest run --project templates` → FAIL.
- [ ] **Step 3: Implement** the field, its validation, and the built-in values.
- [ ] **Step 4: Run them again.** `pnpm vitest run --project templates --project layout` → PASS. The layout ignores `heading`.
- [ ] **Step 5: Commit.** `feat(templates): mark heading roles; turn off sluglines' rules in plays`

---

### Task 4: `@drafter/lint` — the rules, the runner, and the parse-diagnostic rules

**Files:**
- Create: `packages/lint/` (package files per Global Constraints)
  - `src/index.ts`, `src/types.ts`, `src/run.ts`, `src/rules/parse.ts`
  - `test/helpers.ts` (`applyFix(source, fix)`, applying changes from last to first) and `test/run.test.ts`
- Modify: `vitest.shared.ts`; `docs/DEPENDENCIES.md` (a row for `@drafter/lint`, depending on `@drafter/fountain` and `@drafter/templates`)

**Interfaces (Produces):**
```ts
export type Severity = 'error' | 'warning' | 'info';
export interface Fix { title: string; changes: TextChange[] }
export interface LintDiagnostic { ruleId: string; severity: Severity; span: Span; message: string; fix?: Fix }
export interface LintOptions {
  /** Strict Fountain (Phase 1 design §5.6): the Strict rules become warnings. */
  strict?: boolean;
  /** Rule ids to skip, besides the template's `lint.disable`. */
  disable?: readonly string[];
}
export interface RuleContext { doc: Doc; template: Template; options: LintOptions }
export interface Rule { id: string; severity: Severity; run(ctx: RuleContext): LintDiagnostic[] }
export const STRICT_RULES: readonly string[]; // ['heading-blank-after', 'multiline-parenthetical']
export const rules: readonly Rule[];
/** Every enabled rule's diagnostics, sorted by `span.from`, then `ruleId`. */
export function lint(doc: Doc, template: Template, options?: LintOptions): LintDiagnostic[];
```

**The rules in this task**, carried over from the parse diagnostics (technical design §2.10 and §9):

| Rule | Comes from | Severity | Fix |
|---|---|---|---|
| `unclosed-region` | `unclosed-boneyard` and `unclosed-note` | the parse diagnostic's: error for a boneyard, warning for a note | none |
| `invalid-meta` | `invalid-meta` | warning | none |
| `heading-blank-after` | the portability diagnostic | info, or warning when `strict` | **Insert a blank line:** a line break at the end of the heading's text, before any `\r`. It's `\r\n` when the line ends in `\r`, otherwise `\n`. |
| `multiline-parenthetical` | the portability diagnostic | info, or warning when `strict` | **Join onto one line:** each line break inside the span, with any `\r` before it and the next line's leading whitespace, becomes one space. |

The template's `enable` list is for Phase 4's off-by-default rules; Phase 1 has none, so the runner reads only `disable`.

The runner lints the whole script every time. Every rule is linear, and the editor's linter waits 300 ms after typing stops (Task 12), so technical design §9's `local` flag, which limits a rule to the edited scene, isn't needed yet. Record that in DECISIONS.

- [ ] **Step 1: Write the failing tests** (`test/run.test.ts`).
  ```ts
  const screenplay = builtins['us-screenplay'] as Template;
  const run = (source: string, options?: LintOptions) => lint(parse(source), screenplay, options);

  it('finds nothing in a clean script', () => {
    expect(run('INT. HALL - DAY\n\nShe waits.\n\nMARGARET\nYou said you\'d call.\n')).toEqual([]);
  });
  it('reports an unclosed boneyard as an error and an unclosed note as a warning', () => {
    expect(run('Hi [[open\n\nThere /* cut').map((d) => [d.ruleId, d.severity])).toEqual([
      ['unclosed-region', 'warning'], ['unclosed-region', 'error']]);
  });
  it('offers a blank line after a heading with text right below it', () => {
    const [d] = run('INT. HALL - DAY\nShe waits.\n');
    expect([d?.ruleId, d?.severity, d?.fix?.title]).toEqual(['heading-blank-after', 'info', 'Insert a blank line']);
    expect(applyFix('INT. HALL - DAY\nShe waits.\n', d!.fix!)).toBe('INT. HALL - DAY\n\nShe waits.\n');
  });
  it('inserts a CRLF blank line in a CRLF file', () => {
    const source = 'INT. HALL - DAY\r\nShe waits.\r\n';
    const [d] = run(source);
    expect(applyFix(source, d!.fix!)).toBe('INT. HALL - DAY\r\n\r\nShe waits.\r\n');
  });
  it('joins a wrapped parenthetical onto one line', () => {
    const source = 'MARGARET\n(quietly,\n   then louder)\nHi.\n';
    const [d] = run(source);
    expect(d?.ruleId).toBe('multiline-parenthetical');
    expect(applyFix(source, d!.fix!)).toBe('MARGARET\n(quietly, then louder)\nHi.\n');
  });
  it('raises the Strict Fountain rules to warnings in strict mode', () => {
    expect(run('INT. HALL - DAY\nShe waits.\n', { strict: true })[0]?.severity).toBe('warning');
  });
  it('skips rules the template or the options turn off', () => { /* disable: ['heading-blank-after'] → [] */ });
  it('sorts diagnostics by position', () => { /* two problems in reverse rule order → by span.from */ });
  ```
- [ ] **Step 2: Run them.** `pnpm vitest run --project lint` → FAIL: the package doesn't exist.
- [ ] **Step 3: Implement** the types, the runner, and the four rules.
- [ ] **Step 4: Run them again.** `pnpm vitest run --project lint` → PASS.
- [ ] **Step 5: Commit.** `feat(lint): add the runner and the parse-diagnostic rules`

---

### Task 5: The structural lint rules

**Files:**
- Create: in `packages/lint/src/rules/`, `cue.ts`, `contd.ts`, `heading.ts`, and `transition.ts`
- Create: `packages/lint/test/rules.test.ts`
- Modify: `src/index.ts` (register each rule in `rules`)

**Interfaces:**
- Consumes `Rule`, `LintDiagnostic`, and `lint` from Task 4, and `characters` from `@drafter/fountain`.

**The rules** (technical design §9, each with its false-positive control):

| Rule | Severity | Reports | Fix |
|---|---|---|---|
| `character-without-dialogue` | warning | An `action` block of one line (block A) whose printed text is entirely upper case and shaped like a cue: a name, then optional parenthesized extensions. It's followed, after exactly one blank line, by an `action` block (block B). B must start with `(`, or A's text must be the name of a character cued elsewhere in the script. | **Remove the blank line** (delete B's second line break, `\r` included) |
| `manual-contd` | info | A `character` block whose extension matches `/\(\s*CONT['’]?D\s*\)/i` | **Remove (CONT'D)**, with the spaces before it |
| `heading-no-time` | warning | A scene heading that isn't forced (`forced: false`) and has `sem.time === null`. A forced heading (`.MONTAGE`) is how Fountain writes one with no time. | none |
| `transition-not-last` | warning | A transition whose next block isn't a scene heading, section, or page break. The check skips notes, boneyard, and synopses, and a transition at the end of the script passes. | none |

The messages name the thing in plain language. For example: `"MARGARET" looks like a character cue, but the blank line after it turns the speech into action.`

- [ ] **Step 1: Write the failing tests**, one `describe` per rule, with hits and non-hits.
  ```ts
  // character-without-dialogue
  hit('MARGARET\nHello.\n\nShe sits.\n\nMARGARET\n\nYou said you\'d call.\n');           // a known name
  hit('NARRATOR\n\n(quietly)\nOnce upon a time.\n');                                      // B starts with (
  fixesTo('NARRATOR\n\n(quietly)\nOnce.\n', 'NARRATOR\n(quietly)\nOnce.\n');
  miss('BANG!\n\nThe door flies open.\n');                                                // unknown name, no (
  miss('MARGARET (60s), cardigan buttoned wrong.\n\nShe waits.\n');                       // not cue-shaped
  miss('MARGARET\n\n\n(quietly)\nHi.\n');                                                 // two blank lines
  miss('THE END\n');                                                                      // nothing after
  // manual-contd
  fixesTo("MARGARET (CONT'D)\nStill here.\n", 'MARGARET\nStill here.\n');
  fixesTo('@McCLANE (V.O.) (cont’d)\nYippee.\n', '@McCLANE (V.O.)\nYippee.\n');
  miss('MARGARET (V.O.)\nHi.\n');
  miss("MARGARET\nHe said (CONT'D) twice.\n");                                            // in dialogue, not a cue
  // heading-no-time
  hit('INT. HALL\n\nShe waits.\n');
  miss('INT. HALL - DAY\n\nShe waits.\n');
  miss('.MONTAGE\n\nShe waits.\n');                                                       // forced
  missIn(stagePlay, 'INT. HALL\n\nShe waits.\n');                                         // template turns it off
  // transition-not-last
  hit('CUT TO:\n\nShe waits.\n');
  miss('CUT TO:\n\nINT. HALL - DAY\n');
  miss('CUT TO:\n\n[[a note]]\n\nINT. HALL - DAY\n');                                     // the note is skipped
  miss('CUT TO:\n\n# Act Two\n');
  miss('>FADE OUT.\n');                                                                   // the end of the script
  ```
  `hit`, `miss`, `missIn`, and `fixesTo` are helpers: exactly one diagnostic of the `describe`'s rule, none, none in that template, and the fix's result.
- [ ] **Step 2: Run them.** `pnpm vitest run --project lint` → FAIL: the rules aren't registered.
- [ ] **Step 3: Implement** the four rules, each a single pass over `doc.blocks`.
- [ ] **Step 4: Run them again.** `pnpm vitest run --project lint` → PASS.
- [ ] **Step 5: Commit.** `feat(lint): add the cue, CONT'D, heading, and transition rules`

---

### Task 6: The `similar-names` lint rule

**Files:**
- Create: `packages/lint/src/rules/names.ts` and `packages/lint/src/distance.ts`
- Create: `packages/lint/test/names.test.ts` and `packages/lint/test/complexity.test.ts`

**Interfaces:**
- Produces `withinOneEdit(a: string, b: string): boolean`: whether the restricted Damerau-Levenshtein distance is at most 1, counting code points.
- **Rule `similar-names`** (info):
  - **Which names:** names from `characters(doc)`, compared in upper case. Names equal in upper case are one name, typed two ways, and are never reported.
  - **When:** both names are at least five letters, `withinOneEdit` holds, one of them is cued at most twice, and neither is a prefix of the other.
  - **Opt-out:** a pair listed in `doc.meta.distinctNames` (`string[][]`, either order, compared in upper case) is never reported. That's where Plan 3's **Mark as distinct** writes.
  - **Where:** once, at the first cue line of the rarer name. With a tie, it reports the name that first appears later.
  - **Message:** `"MARGERET" is one letter from "MARGARET", which has 12 cues. A typo?`
  - **Fix:** none.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  it.each([['MARGARET', 'MARGERET'], ['MARGARET', 'MARGARETT'], ['MARGARET', 'MARGRET'], ['MARGARET', 'MAGRARET'], ['DANNY', 'DANNY']])(
    'counts %s and %s as within one edit', (a, b) => expect(withinOneEdit(a, b)).toBe(true));
  it('counts two edits as more than one', () => expect(withinOneEdit('MARGARET', 'MAGRARETT')).toBe(false));
  it('counts code points, not UTF-16 units', () => {
    expect(withinOneEdit('A😀BCDE', 'A😁BCDE')).toBe(true);
    expect(withinOneEdit('A😀BCDE', 'ABCDE')).toBe(true);
  });
  it('flags a rare name one letter from a common one, at its first cue', () => { /* MARGARET ×12, MARGERET ×1 */ });
  it.each([['MAX', 'MAC'], ['ANN', 'ANNA'], ['DANNY', 'DANNYS']])('leaves %s and %s alone', …); // too short, or a prefix
  it('leaves two common names alone', () => { /* each cued 3 or more times */ });
  it('leaves names marked as distinct alone', () => { /* meta.distinctNames [["margaret", "margeret"]] */ });
  it('treats names that differ only in case as one name', () => { /* @McCLANE and MCCLANE */ });

  // complexity.test.ts
  it('checks 20,000 names in under a second', () => { /* 20,000 distinct random six-letter cues */ });
  ```
- [ ] **Step 2: Run them.** `pnpm vitest run --project lint` → FAIL.
- [ ] **Step 3: Implement.** To find candidate pairs, index each name and each of its one-code-point deletions in a map; names sharing a key are candidates, so the work grows with the number of names, not its square. Then check each candidate with `withinOneEdit`. That function needs no table: compare once for equality, once for a single substitution or an adjacent swap, and once for a single insertion.
- [ ] **Step 4: Run them again.** `pnpm vitest run --project lint` → PASS.
- [ ] **Step 5: Commit.** `feat(lint): add the similar-names rule`

---

### Task 7: `@drafter/render-html` — pages as accessible DOM

**Files:**
- Create: `packages/render-html/` (a DOM package per Global Constraints, `"exports"` also `"./style.css": "./style.css"`, `"files": ["dist", "style.css"]`)
  - `src/index.ts`, `src/page.ts`, `src/roles.ts`, `src/view.ts` (shell only; Task 8 fills it)
  - `style.css`
  - `test/page.test.ts`
- Modify: `vitest.shared.ts`; `docs/DEPENDENCIES.md` (a row for `@drafter/render-html`, depending on `@drafter/layout` and `@drafter/templates`, plus the `jsdom` and `@types/jsdom` development rows)

**Interfaces (Produces):**
```ts
export const GOTO_EVENT = 'drafter:goto'; // CustomEvent<{ offset: number }>, bubbles
export interface ScriptViewOptions {
  /** Resolves when Courier Prime is ready; the first render waits for it (technical design §6.1). */
  fontsReady?: Promise<unknown>;
  /** The clock for the manual-scroll guard (Task 8). */
  now?: () => number;
}
export interface ScriptView {
  /** `<section class="drafter-script" aria-label="Script">`, appended to the container. */
  readonly element: HTMLElement;
  update(layout: Layout, template: Template): Promise<void>;
  reveal(blockIndex: number): void;
  destroy(): void;
}
export function createScriptView(container: HTMLElement, options?: ScriptViewOptions): ScriptView;
/** Roles that blocks of kind `character` can take (cues), and of `parenthetical`, `dialogue`, `lyric` (speech), read from the role map. */
export function speechRoles(template: Template): { cue: ReadonlySet<Role>; speech: ReadonlySet<Role> };
```

**The DOM contract** (technical design §6.1 and §13; the tests assert it):

| Element | Markup | Content and attributes |
|---|---|---|
| A page | `div.drafter-page[data-page=N]` | Style variables `--cols` (`page.width`) and `--rows` (`page.height`). It starts with `span.drafter-sr-only`, reading `Page N`, or `Title page` for page 0. |
| A line with text | `div.drafter-line.role-<role>` | Style variables `--row` (`margin.top` plus the line's index) and `--col` (`margin.left` plus `col`), and `data-from` and `data-to` from its span. Lines are absolutely positioned, so blank lines aren't rendered. |
| Runs inside a line | spans | `.b`, `.i`, and `.u` for the styles; `.added` on synthetic runs. |
| A row's `right` part | its own line | It goes after every left line of the same block run, so the left speech of dual dialogue reads before the right. |
| Consecutive lines of one block | `div.drafter-block[data-block=i]` | `role="heading"` and `aria-level=N` when the role's template style has `heading` (Task 3). |
| A speech | `div.drafter-speech[role=group]` | `aria-labelledby` its cue's first line, which gets an `id`. It runs from a cue-role block through the speech-role blocks after it, and their `(MORE)` line. |
| The page's furniture | lines | The page number, scene numbers, header, and footer, at the positions `renderText` uses. |
| Hidden from screen readers | `aria-hidden="true"` | `(MORE)` lines, the page number, scene numbers, the header, and the footer. |

- [ ] **Step 1: Write the failing tests** (jsdom). Build each layout with `paginate(parse(source), template)`.
  - `renders one page per layout page, each with its marker`
  - `positions a line by row and column, margins included`. In a screenplay, `INT. HALL - DAY` gets `--row` 6 and `--col` 15.
  - `styles emphasis and marks text the engine added`
  - `makes scene headings level-2 headings in a screenplay`
  - `makes act headings level 2 and scene headings level 3 in a stage play`
  - `groups each speech under its cue`: the group's `aria-labelledby` element reads `MARGARET`.
  - `hides (MORE), page numbers, and scene numbers from screen readers`
  - `reads dual dialogue's left speech before its right`
  - `renders text as text`: a line `<img src=x onerror=alert(1)>` creates no `img`, and the line's `textContent` equals it.
  - `speechRoles reads cue and speech roles from the role map`: screenplay cues are `{character}`. A template with `{ kind: 'character', names: ['SFX'], role: 'sfx_cue' }` adds `sfx_cue`.
- [ ] **Step 2: Run them.** `pnpm vitest run --project render-html` → FAIL.
- [ ] **Step 3: Implement** `page.ts`, which builds one page's element, and `roles.ts`. `style.css` positions everything:
  ```css
  .drafter-script { --line: calc(1in / 6); font: 12pt/1 "Courier Prime", monospace; }
  .drafter-page { position: relative; width: calc(var(--cols) * 1ch); height: calc(var(--rows) * var(--line)); background: var(--drafter-page, #fff); color: var(--drafter-ink, #000); }
  .drafter-line { position: absolute; top: calc(var(--row) * var(--line)); left: calc(var(--col) * 1ch); line-height: var(--line); white-space: pre; }
  ```
  The file also defines `.b`, `.i`, `.u`, and a visually hidden `.drafter-sr-only`.
- [ ] **Step 4: Run them again.** `pnpm vitest run --project render-html` → PASS.
- [ ] **Step 5: Commit.** `feat(render-html): render laid-out pages as accessible DOM`

---

### Task 8: `render-html` — updates, clicks, and following the cursor

**Files:**
- Modify: `packages/render-html/src/view.ts`
- Test: `packages/render-html/test/view.test.ts`

**Interfaces:**
- Consumes the page builder from Task 7.
- Behavior of the `ScriptView` from Task 7:

| Method or event | Behavior |
|---|---|
| `update` | Waits for `fontsReady` before the first render. After that, it replaces only the pages whose content changed (each page is compared as JSON with the previous render's) and removes pages that are gone. |
| A click on a line with `data-from` | Dispatches `GOTO_EVENT` from the section with `{ offset }`. |
| `reveal(blockIndex)` | Calls `scrollIntoView({ block: 'nearest' })` on the first line at or after `layout.index[blockIndex]`. It does nothing when the index is out of range, or within 2,000 ms (by `now`) of the reader scrolling the container. Wheel, touch, and the scrolling keys count as the reader scrolling. |
| `destroy` | Removes the section and its listeners. |

- [ ] **Step 1: Write the failing tests.**
  - `waits for the fonts before the first render`
  - `keeps unchanged pages and replaces changed ones` (by node identity)
  - `removes pages that are gone`
  - `reports the source offset of a clicked line`
  - `reveals the line where a block starts`: a `scrollIntoView` spy, called on that line
  - `leaves the view alone for two seconds after the reader scrolls`
  - `ignores a block index the layout doesn't have`
- [ ] **Step 2: Run them.** `pnpm vitest run --project render-html` → FAIL.
- [ ] **Step 3: Implement** the behavior above.
- [ ] **Step 4: Run them again.** `pnpm vitest run --project render-html` → PASS.
- [ ] **Step 5: Commit.** `feat(render-html): update by page, report clicks, and follow the cursor`

---

### Task 9: `@drafter/cm-fountain` — the parsed state and highlighting

**Files:**
- Create: `packages/cm-fountain/` (a DOM package per Global Constraints; it depends on `@drafter/fountain`, `@drafter/lint`, `@drafter/templates`, and the five CodeMirror packages)
  - `src/index.ts`, `src/state.ts`, `src/highlight.ts`
  - `test/state.test.ts` and `test/highlight.test.ts`
- Modify: `vitest.shared.ts`; `docs/DEPENDENCIES.md` (the `@drafter/cm-fountain` row and the CodeMirror rows: a general-purpose editor, not a screenwriting tool)

**Interfaces (Produces):**
```ts
/** The parse of the editor's text: `parse` at creation, `reparse(doc, changes)` on every change (technical design §3.1). */
export const parsedDoc: StateField<Doc>;
/** The highlighting decorations for the ranges given, read from `parsedDoc` (technical design §3.2). */
export function fountainDecorations(state: EditorState, ranges: readonly { from: number; to: number }[]): DecorationSet;
/** A view plugin that keeps `fountainDecorations` for the visible ranges. */
export function fountainHighlighting(): Extension;
```

**The class names**, which the app's theme styles:

| Class | Applied to |
|---|---|
| `cm-f-<kind>` | Each line of each block, as a line decoration. |
| `cm-f-title` | Each title-page line. |
| `cm-f-title-key` | Each title field's `Key:`. |
| `cm-f-b`, `cm-f-i`, `cm-f-u` | Marks over the runs' styles. |
| `cm-f-note`, `cm-f-boneyard` | Marks over the regions from Task 2. |
| `cm-f-marker` | Every other character of a line that is in no run and no region, except leading and trailing whitespace. That covers forced markers, `#`, `=`, emphasis markers, scene numbers, and escapes. |

- [ ] **Step 1: Write the failing tests.**
  ```ts
  it('parses on creation and reparses on every change', () => { /* toJSON(state.field(parsedDoc)) equals toJSON(parse(text)) after each of several edits */ });
  it('matches a fresh parse after random edits', () => { /* fast-check, 200 runs */ });
  it('classes each line by its block kind', () => { /* INT. HALL - DAY → cm-f-scene_heading; MARGARET → cm-f-character; … */ });
  it('marks emphasis runs', () => { /* "**bold** and *it*" → cm-f-b over "bold", cm-f-i over "it" */ });
  it('dims markers and leaves printed text alone', () => {
    // "!SILENCE." → the "!" ; "@McCLANE" → the "@" ; "INT. HALL - DAY #12#" → "#12#" ; "**bold**" → each "**"
  });
  it('classes notes and boneyard', () => { /* "A [[n]] B" → cm-f-note over "[[n]]" */ });
  it('decorates only the given range', () => { /* 5,000-line script: a 50-line range gets fewer than 120 line decorations */ });
  ```
  The decoration tests call `fountainDecorations` directly and read the set's ranges and classes. jsdom has no layout, so a view's visible ranges can't be tested there.
- [ ] **Step 2: Run them.** `pnpm vitest run --project cm-fountain` → FAIL.
- [ ] **Step 3: Implement.** `parsedDoc.update` converts each transaction's `changes` into sorted `TextChange`s for `reparse`. Decorations come from the blocks overlapping the ranges (found with `blockAt`), plus `titlePage` and `regions`.
- [ ] **Step 4: Run them again.** `pnpm vitest run --project cm-fountain` → PASS.
- [ ] **Step 5: Commit.** `feat(cm-fountain): parse in the editor state and highlight from it`

---

### Task 10: `cm-fountain` — the keymap and input filters

**Files:**
- Create: `packages/cm-fountain/src/keymap.ts` and `src/input.ts`
- Create: `packages/cm-fountain/test/helpers.ts` and `test/keymap.test.ts`
  - `editor(text)` takes `|` as the cursor and `[`…`]` as a selection.
  - `press(state, command)` returns `[text, cursor]`.

**Interfaces (Produces):**
```ts
export const fountainEnter: StateCommand;
export const fountainTab: StateCommand;
export const fountainShiftTab: StateCommand;
export const convertToCharacter: StateCommand; // upper-cases the line and prefixes @ (technical design §3.3)
export const convertToAction: StateCommand;    // removes @, lower-cases all but the first letter
export function forceKind(kind: 'scene_heading' | 'action' | 'character' | 'parenthetical' | 'transition' | 'centered' | 'lyric'): StateCommand;
export const toggleDual: StateCommand;
export const wrapInNote: StateCommand;
export const wrapInBoneyard: StateCommand;
/** Enter, Tab, Shift-Tab, Mod-Alt-1…7, Mod-Shift-d, Mod-/, Mod-Shift-/. Save keys belong to the app. */
export const fountainKeymap: readonly KeyBinding[];
/** True after Tab starts a cue, until Enter or the cursor leaves the line. */
export const cueMode: StateField<boolean>;
/** The input filters: upper-case typing in cue mode, and in a scene heading whose prefix matched (technical design §2.5, rule 11). */
export function fountainInput(): Extension;
```

The behaviors follow technical design §3.3's table, plus these calls:
- **Enter in a heading or transition:** it inserts two line breaks only at the end of the line. Mid-line, it's a plain line break.
- **`forceKind`:** it replaces a marker the line already has, and never changes case. `parenthetical` and `centered` wrap the line's text, in `(…)` and `>…<`.
- **Wrapping with nothing selected:** it inserts an empty `[[]]` or `/**/`, with the cursor inside.

- [ ] **Step 1: Write the failing tests.** These are table-driven, with the cursor as `|`; the key is applied to the "before" text, giving the "after" text.

  | Before | Key | After |
  |---|---|---|
  | `MARGARET\|` | Enter | `MARGARET\n\|` |
  | `MARGARET\n(quietly\|)` | Enter | `MARGARET\n(quietly)\n\|` |
  | `INT. HALL - DAY\|` | Enter | `INT. HALL - DAY\n\n\|` |
  | `INT. HALL\| - DAY` | Enter | `INT. HALL\n\| - DAY` |
  | `CUT TO:\|` | Enter | `CUT TO:\n\n\|` |
  | `She waits.\n\n\|` | Tab | `She waits.\n\n@\|`, with `cueMode` on |
  | `MARGARET\n\|` | Tab | `MARGARET\n(\|)` |
  | `MARGARET\|` | Tab, three times | `MARGARET (V.O.)\|`, then `MARGARET (O.S.)\|`, then `MARGARET\|` |
  | `margaret\|` | Tab (in action with text) | `@MARGARET\|` |
  | `@MARGARET\|` | Shift-Tab | `Margaret\|` |
  | `MARGARET\nHi.\|` | Mod-Shift-d | `MARGARET ^\nHi.\|` |
  | `[a b]` | Mod-/ | `[[a b]]` |
  | `[cut]` | Mod-Shift-/ | `/*cut*/` |
  | `!She waits.\|` | Mod-Alt-3 | `@She waits.\|` |

  Also:
  - `upper-cases a cue while typing after Tab, until Enter`: Tab, then typing `margaret`, gives `@MARGARET`; after Enter, `hi` stays `hi`.
  - `upper-cases a scene heading as it's typed`: typing `hall - day` after `INT. ` gives `INT. HALL - DAY`.
  - `never changes case anywhere else`
  - `upper-cases a cue without splitting surrogate pairs`
  - `inserts the file's own line break`: with `EditorState.lineSeparator.of('\r\n')`, Enter in a heading inserts `\r\n\r\n`.
  - `makes every command one undo step`
  - `never indents after Enter`
- [ ] **Step 2: Run them.** `pnpm vitest run --project cm-fountain` → FAIL.
- [ ] **Step 3: Implement.** Each command decides its context from `parsedDoc`, with `blockAt` at the cursor and the previous line's block. Cue mode is a `StateField` set by an effect from `fountainTab`. The filters are `EditorState.transactionFilter`s that rewrite inserted text with `toUpperCase()` over whole code points.
- [ ] **Step 4: Run them again.** `pnpm vitest run --project cm-fountain` → PASS.
- [ ] **Step 5: Commit.** `feat(cm-fountain): add the Fountain keymap and input filters`

---

### Task 11: `cm-fountain` — autocomplete

**Files:**
- Create: `packages/cm-fountain/src/complete.ts` and `packages/cm-fountain/test/complete.test.ts`

**Interfaces (Produces):**
```ts
export function fountainCompletionSource(context: CompletionContext): CompletionResult | null;
/** `autocompletion({ override: [fountainCompletionSource] })` */
export function fountainCompletion(): Extension;
```

This follows technical design §3.4, with these calls:

| Context | Offers |
|---|---|
| **A cue line:** the line before is blank or absent, and the text before the cursor starts with `@`, or has two or more letters and no lower case. (While a cue is typed, the parser still reads it as action, so the context is read from the text.) | Character names, nearest last cue before the cursor first, then by number of cues. After a name and a space, the extensions `(V.O.)`, `(O.S.)`, and any used in the script. |
| **A scene heading** | After the prefix and a space, locations, most used first. After ` - `, times: `DAY`, `NIGHT`, `CONTINUOUS`, `LATER`, `MOMENTS LATER`, and any used in the script. |
| **A line starting with `>`** | `CUT TO:`, `DISSOLVE TO:`, `SMASH CUT TO:`, `FADE OUT.`, and transitions used in the script. |
| **After `#`** | The script's section titles. |

The list opens when asked (`context.explicit`) or once the word before the cursor has two characters.

- [ ] **Step 1: Write the failing tests.**
  - `offers character names on a cue line, the nearest last cue first`
  - `offers nothing for one letter unless asked`
  - `offers extensions after a name and a space`
  - `offers locations after INT.`
  - `offers times after the dash`
  - `offers transitions on a > line`
  - `offers section titles after #`

  Each test builds `new CompletionContext(state, pos, explicit)` and reads the `label`s of `options`.
- [ ] **Step 2: Run them.** `pnpm vitest run --project cm-fountain` → FAIL.
- [ ] **Step 3: Implement**, reading names, locations, and times from `parsedDoc` through `characters()` and `locations()`.
- [ ] **Step 4: Run them again.** `pnpm vitest run --project cm-fountain` → PASS.
- [ ] **Step 5: Commit.** `feat(cm-fountain): complete names, places, times, transitions, and sections`

---

### Task 12: `cm-fountain` — folding, the cursor's element, lint, and `fountain()`

**Files:**
- Create: in `packages/cm-fountain/src/`, `fold.ts`, `cursor.ts`, and `lint.ts`
- Create: in `packages/cm-fountain/test/`, `fold.test.ts`, `cursor.test.ts`, `lint.test.ts`, and `fountain.test.ts`
- Modify: `src/index.ts`, `packages/cm-fountain/README.md`, `CHANGELOG.md`, and `docs/DECISIONS.md`

**Interfaces (Produces):**
```ts
/** Folds sections to the next section of equal or shallower depth, and scenes to the next heading or section (technical design §3.5). */
export function fountainFolding(): Extension;
export interface CursorElement { blockIndex: number; lineIndex: number; kind: BlockKind | 'title_page' }
/** The element under the main cursor, or null on a blank line (technical design §3.6). The title page has blockIndex -1. */
export function cursorElement(state: EditorState): CursorElement | null;
/** Calls back when the element under the cursor changes (the app's live region and scroll-sync use it). */
export function onCursorElement(callback: (element: CursorElement | null) => void): Extension;
export function toCodeMirror(diagnostics: readonly LintDiagnostic[]): Diagnostic[];
/** `@codemirror/lint`'s linter (300 ms delay) and gutter, running `lint` on `parsedDoc`. */
export function fountainLint(config: { template: () => Template; options?: () => LintOptions }): Extension;
export interface FountainOptions {
  template?: () => Template;
  lintOptions?: () => LintOptions;
  onCursorElement?: (element: CursorElement | null) => void;
}
/** parsedDoc, highlighting, input filters, keymap (at Prec.high), completion, folding, and, when given, lint and the cursor callback. */
export function fountain(options?: FountainOptions): Extension;
```

**Folding:** a folded scene shows its heading and the first synopsis line inside it. A folded section shows its title.

**`toCodeMirror` mapping:** each diagnostic becomes `{ from: span.from, to: span.to, severity, message, source: ruleId }`. A fix becomes one action, named by `fix.title`, that dispatches `fix.changes`.

- [ ] **Step 1: Write the failing tests.**
  - `folds a scene to the line before the next heading`
  - `folds a section over deeper sections, up to one as deep or shallower`
  - `reports the block, line, and kind under the cursor`
  - `reports null on a blank line, and the title page as blockIndex -1`
  - `maps diagnostics and turns a fix into an action that applies it`
  - `fountain() runs the sample screenplay in an EditorView without errors`: this loads `samples/screenplay.fountain`, then checks `parsedDoc` and `cursorElement` after a click.
- [ ] **Step 2: Run them.** `pnpm vitest run --project cm-fountain` → FAIL.
- [ ] **Step 3: Implement**, with `foldService` from `@codemirror/language` and `linter` and `lintGutter` from `@codemirror/lint`.
- [ ] **Step 4: Run them again.**
  - `pnpm vitest run --project cm-fountain` → PASS.
  - Then `pnpm -r build`, `pnpm test`, `pnpm check`, and each new package's `typecheck` → all clean.
- [ ] **Step 5: Record and commit.**
  - In `docs/DECISIONS.md`, record the choices this plan made:
    - the lint severities
    - `character-without-dialogue`'s fix
    - `similar-names` reporting once
    - `distinctNames` in the metadata
    - absolutely positioned lines in `render-html`
    - the cue-line context for completion
    - Enter in headings only at the line's end
  - Add the CHANGELOG entries.
  - Commit `feat(cm-fountain): fold, track the cursor's element, lint, and compose fountain()`, and push the branch.

---

**Plan 2 is done when** all four packages build, pass their tests, typecheck, and lint clean, and so do the engine's existing tests. The branch then merges to `main`, where the app is unchanged and drafter.dev deploys as before.
