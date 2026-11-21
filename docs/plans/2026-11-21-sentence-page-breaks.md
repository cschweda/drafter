# Page breaks at the end of a sentence: design

**Status:** for the maintainer's approval. Nothing here is built.

**Asked for:** the fix releases before v0.28.0, item 2 (2026-11-20), carried over from v0.27.1 as "needs a design". The maintainer's three decisions of 2026-11-21 are in §2.

## 1. What changes for a writer

Today a page can end in the middle of a sentence. A paragraph or a speech that doesn't fit is cut at the end of a printed line, and a printed line seldom ends where a sentence does:

```
                                        (foot of page 12)
The door gives. Marlow steps through into the dark,
feels for the switch, and finds only a hole in the
                                        (top of page 13)
plaster where it used to be. He waits.
```

After this change the page ends at the last sentence that fits, and the rest starts the next page as if it had been typed there:

```
                                        (foot of page 12)
The door gives.
                                        (top of page 13)
Marlow steps through into the dark, feels for the
switch, and finds only a hole in the plaster where it
used to be. He waits.
```

That is what a reader of a script expects, and what Final Draft does by default (its files carry `BreakDialogueAndActionAtSentences="Yes"`).

## 2. Decisions already made

1. **Scripts that are already locked keep their pages exactly.** Their page starts are converted when the script is read; nobody is asked to lock again (§5).
2. **Unlocked scripts repaginate, with no setting.** Breaks move, and a script's length can change by a page. It is the engine's behaviour, like the widow and orphan rule in v0.27.1, not an option. *This is my reading of "yes" to a question that offered two answers; say so if you wanted the setting (on by default) instead.*
3. **Action and dialogue both, two lines at least on each side, and today's rule when no sentence fits** (§3).

## 3. The rule

It applies where the engine splits text today: an action paragraph, and the spoken lines of a speech. Nothing else is ever split (headings, transitions, character cues, parentheticals, lyrics, centered text), and that stays so.

When a paragraph or speech doesn't fit in what is left of the page:

1. Find every place in it where a sentence ends (§4).
2. Take the **last** one for which the text before it fits on this page, at least **two printed lines** stay here, and at least **two** go to the next page once the rest is wrapped again. The template's own minimums are used where it has them (`keepWithNextLines` for action, `dialogueSplit` for speeches).
3. End the page there. The line that holds the sentence's end is printed short. The rest is wrapped afresh from the first word of the next sentence.
4. **If there is no such place** (one long sentence, or sentences too short to leave two lines on each side), do what v0.27.1 does: break at the end of a printed line with two lines on each side, or move the whole thing to the next page.

For a speech the rest is as now: `(MORE)` at the foot, the cue with `(CONT'D)` at the top, never a break straight after a parenthetical.

**What this costs in white space.** Ending at a sentence leaves the foot of a page shorter than ending at a line: usually a line or two, sometimes several when the last sentence that fits is long. There is no limit on that in this design, as there is none in Final Draft. If pages come out looking too ragged on real scripts, a limit ("no more than N lines short, else break at a line") is a one-line change, and I would rather set N from your scripts than guess it.

**Dual dialogue** stays as it is (two columns that break together by lines). It is rare across a page, and cutting two columns at two different sentences needs its own rule.

## 4. Where a sentence ends

A sentence ends at `.`, `!`, `?` or `…` (and `...`), with any closing quote or bracket after it, **when what follows is a space and then something that can start a sentence**: a capital letter, a digit, an opening quote or bracket, or a dash. So:

- `He stops... then goes on.` has one end, at the last period: a lower-case letter follows the dots.
- `Dr. Vance`, `Mr.`, `Mrs.`, `Ms.`, `St.`, `Lt.`, `Sgt.`, `Capt.`, `Col.`, `Gen.`, `Sen.`, `Rev.`, `Prof.`, `vs.`, `etc.`, and a single capital with a period (`J. Edgar`) do not end one. The scene summaries already skip `Dr`, `Mr`, `St` and a single capital (`docs/DECISIONS.md`, 2026-11-01); this is that list, made longer.
- A line the writer ended themselves (a new line inside a paragraph) always counts as an end, as it does today.

It will sometimes be wrong (`He works for the U.S. Marshals arrive at dawn.`). A wrong guess costs nothing but a page ending at a place that isn't quite a sentence, which is where every page ends today.

## 5. Locked pages

**The problem.** A locked page's start is stored as a source line and a count: "the 3rd printed line of line 214". Once a paragraph can be cut inside a printed line and wrapped again, "the 3rd printed line" has no fixed meaning.

**The change.** A locked page's start becomes a place in the text: line 214, character 131. Laying a locked script out, the engine cuts the paragraph at that character and wraps the rest from there, the same operation as §3.

**Scripts locked before this change** have only the count. When one is read, each count is turned into a character: the paragraph is wrapped the plain way, as it was when the lock was made, and the character that opens the counted line is the page's start. That is a calculation, not a guess, so **every locked page starts at the same word it does today**. The file is not rewritten for it; the next time the lock is written for any other reason (a new revision set, a rebase) both forms are stored.

**Both forms stay in the file.** A script locked in the new version still carries the count beside the character, so an older Drafter (or `drafter-mcp` before its update) opens it and puts its pages where it always would have. The count is then only as good as it is today.

**New locks** record where the page starts under the new rule, so locking keeps the pages you see.

**Inside a locked script,** text that overflows a locked page onto an A-page (12A) breaks by the new rule. Locked starts don't move; only the breaks between them can.

**Final Draft imports.** A locked `.fdx` brings its pages in as line and count today. Final Draft's own breaks are at sentences, so the character form should match its pages more closely. I want to check that against the real round-trip file before claiming it.

## 6. What does not change

- Anything a writer types, and the Fountain file. This is printing only.
- The Fountain, FDX, HTML and EPUB exports' content. (Final Draft paginates for itself.)
- Markdown documents and the Novel manuscript: a different engine.
- Scene numbers, revision marks, A-pages and omitted scenes.

What follows from it, with no work of its own: the Script pane, the PDF, sides, revised pages, the page count in the status bar, running time and the story map all read the same layout, so all show the new breaks together.

## 7. Risks

| Risk | What guards it |
|---|---|
| A locked page moves | A test that lays out scripts locked by v0.27.1 (stored fixtures of its anchors) and compares every page's first word before and after. This is the test that must not fail. |
| Words lost or doubled at a cut | The existing coverage check (every character of the source printed once) run over every fixture and the trap documents, plus generated cases cut at every possible sentence. |
| Slower layout | The cut and re-wrap happen only at a page's foot, once per page. The timed tests (`long task`, `budget`) already bound a 120-page script's layout. |
| A page count a writer relied on changes | Expected (decision 2). The changelog and What's new say so plainly. |
| The fixtures' expected pages all shift | They will. Each changed fixture is read page by page before its new pages are accepted, not regenerated blind. |

## 8. Order of work

Each step is tested before the next starts, and all of it goes to `staging` behind one pull request per step.

1. **The sentence finder** (§4): a function from a paragraph's text to its sentence ends. Unit tests only.
2. **Cut and re-wrap for action** (§3): `Filler` splits a block at a character. Coverage and widow/orphan tests.
3. **The same for speeches**, with `(MORE)` and `(CONT'D)`.
4. **Locked pages by character** (§5): the anchor's new field, the conversion of old anchors, both forms written. The must-not-move test.
5. **Fixtures and docs:** each changed fixture read; technical design §5.3 and §5.4, the in-app Why and What's new, the changelog, `DEFERRED.md` (entry removed).
6. **Release gates** in WebKit, Firefox and at phone sizes before `main`, as for v0.27.1.

It is a patch release (v0.27.2) under the freeze unless you say otherwise.

## 9. Questions still open

1. **Decision 2**, as flagged: no setting. Confirm, or ask for the setting.
2. **A limit on white space** (§3): none to start, set from real scripts if needed. Agree?
3. **Dual dialogue left as it is** (§3). Agree?
