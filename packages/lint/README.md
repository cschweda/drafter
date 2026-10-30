# @drafter/lint

The linter for [Drafter](https://github.com/cschweda/drafter): finds problems in a parsed Fountain script and offers fixes as text changes. It reads a parsed document and a template, and touches no file and no DOM, so it runs in Node, in a browser, and in a worker.

```ts
import { parse } from '@drafter/fountain';
import { lint } from '@drafter/lint';
import { builtins } from '@drafter/templates';

const [problem] = lint(parse('INT. HALL - DAY\nShe waits.\n'), builtins['us-screenplay']);

problem.ruleId;   // 'heading-blank-after'
problem.severity; // 'info'
problem.span;     // { from: 0, to: 15 }: the heading's line
problem.fix;      // { title: 'Insert a blank line', changes: [{ from: 15, to: 15, insert: '\n' }] }
```

## API

| Export | What it does |
|---|---|
| `lint(doc, template, options?)` | Every enabled rule's diagnostics, sorted by `span.from`, then `ruleId`. It lints the whole script on every call. |
| `rules` | Every rule, in the order they run. |
| `STRICT_RULES` | The ids of the Strict Fountain rules: `heading-blank-after` and `multiline-parenthetical`. |
| `withinOneEdit(a, b)` | Whether two strings are at most one edit apart: the same, or one letter changed, added, or left out, or two letters side by side swapped (the restricted Damerau-Levenshtein distance is 1 or less). It counts code points, so an emoji is one letter. `similar-names` uses it. |
| `LintDiagnostic`, `Fix`, `LintOptions`, `Rule`, `RuleContext`, `Severity` | The types. |

**Options.**

- `strict`: Strict Fountain. The Strict rules report warnings instead of info. No other rule changes.
- `disable`: rule ids to skip. They add to the template's `lint.disable`, and an id that names no rule changes nothing.

## The rules

The first four carry over what the parser reports on its own (technical design §2.10). Each one sets the severity, and the two Strict rules supply the fix.

| Rule | Severity | Reports | Fix |
|---|---|---|---|
| `unclosed-region` | error for a boneyard, warning for a note | A `/*` with no `*/`, or a `[[` with no `]]` before the next blank line. The span is the two-character opener. | None |
| `invalid-meta` | warning | The `/* drafter … */` block at the end of the file isn't a JSON object. | None |
| `heading-blank-after` | info; warning when `strict` | A scene heading or transition with text right below it, which Drafter reads but the Fountain spec doesn't. | **Insert a blank line** |
| `multiline-parenthetical` | info; warning when `strict` | A parenthetical wrapped over several lines. | **Join onto one line** |

The other ten look at the structure of the script, and each has a control against false alarms.

| Rule | Severity | Reports | Fix |
|---|---|---|---|
| `character-without-dialogue` | warning | An upper-case line shaped like a cue (a name, extensions in any case, an optional `^`), alone in its block, then one blank line, then an action block that opens with `(` or is about a character cued elsewhere in the script. The parser reads both as action, and the blank line is the typo. Forced action (`!`) and lines with emphasis are left alone. | **Remove the blank line** |
| `manual-contd` | info | A cue with a typed `(CONT'D)` where the layout would add one itself: the template continues speeches after action and the same speaker spoke earlier in the scene. Not on the first speech in a scene, after someone else's, on dual dialogue, or in the stage play. | **Remove (CONT'D)**, with the spaces before it |
| `heading-no-time` | warning | A scene heading with no time of day. A forced heading (`.MONTAGE`) is how Fountain writes one without, so it is never reported. | None |
| `transition-not-last` | warning | A transition whose next block isn't a scene heading, a section, or a page break. Notes, boneyard, synopses, and centered text in between are skipped, so a transition before `> THE END <` passes, and a transition that ends the script passes. | None |
| `stub-heading` | info | A scene that still has the stand-in heading Expand outline writes, `INT. LOCATION - DAY` (in a play, `## New scene`), so the Problems tab lists the stubs left to name. | None |
| `fdx-note` | info | A `[[fdx: …]]` note, which an import from Final Draft (`@drafter/fdx`) leaves on what Drafter has no element for (a `Cast List` paragraph, a scene number Fountain can't hold), so the Problems tab lists what to check after an import. Only a closed note whose text starts with `fdx:`. | None |
| `highland-note` | info | The `[[highland: …]]` note an import from Highland (`@drafter/archive`) leaves at the script's end, naming the file's other entries, which it didn't bring in. Only a closed note whose text starts with `highland:`. Built, like `fdx-note`, by `importNote`, one rule per app so each can be turned off on its own. | None |
| `osf-note` | info | Each `[[osf: Name]]` note an import from Fade In (`@drafter/archive`, through `@drafter/fdx`'s Open Screenplay Format reader) leaves where a paragraph style or element had no element in Drafter, or a scene number Fountain can't hold. Only a closed note whose text starts with `osf:`, outside a boneyard. Built by `importNote`. | None |
| `setup-without-payoff` | info | A `[[Setup: label]]` with no `[[Payoff: label]]` after it (labels match without regard to case or spacing; only a later payoff pays a setup off). An empty label marks nothing. | None |
| `payoff-without-setup` | info | A `[[Payoff: label]]` before every setup of its label, or with none: "No setup for … comes before this payoff", or "This payoff comes before its setup" when the setup comes after. | None |
| `duplicate-field` | info | A second (or later) Goal, Conflict, Outcome, Shift, or Color note in one scene, since Drafter reads the first. A scene runs from its heading (in a play, its `##`) to the next heading or section. Storyline, Setup, Payoff, and Card notes may repeat, and an empty field (`[[Goal:]]`) is no field. | None |
| `similar-names` | info | Two character names one edit apart (`MARGERET` beside `MARGARET`: a letter changed, added, or left out, or two side by side swapped), probably one character typed two ways. Both names need at least five letters, one is cued twice or less, and neither is the start of the other, so `MAX` and `MAC` and `DANNY` and `DANNYS` are left alone. Names that differ only in case (`@McCLANE`, `MCCLANE`) are one name, and names that differ only in their digits (`GUARD 1`, `GUARD 2`) are numbered characters, never reported. Neither are names whose one edit falls inside a word of three letters or fewer (`MR. SMITH`, `MRS. SMITH`; `JOHN JR.`, `JOHN SR.`; `GUARD A`, `GUARD B`), where the short word is what tells two people apart; `MARIO` and `MARIA`, and `OFFICER DAVID` and `OFFICER DAVIS`, are still reported. One diagnostic for each pair, at the first cue of the rarer name, or of the one that appears later when they tie. | **Mark as distinct**: adds the pair to `meta.distinctNames` |

`stage-play-standard` turns off `heading-no-time` and `transition-not-last` through its `lint.disable`, since a play has no sluglines or transitions.

**Names marked as distinct.** A pair of names that really are two characters can be listed in the script's metadata block (technical design §8.6), and `similar-names` then never reports it, in either order and in any case:

```
/* drafter
{ "v": 1, "distinctNames": [["MARGARET", "MARGERET"]] }
*/
```

The rule reads `distinctNames` with care. A value that isn't a list is ignored, and so is any item in the list that isn't a list of two strings. The message reads `"MARGERET" is one letter from "MARGARET", which has 12 cues. A typo?`. Its fix, **Mark as distinct**, writes the pair (in upper case, the rarer name first) into the list through `setMeta` from `@drafter/fountain`, joining the pairs already there and keeping the rest of the block.

**Limits.** To find the pairs without comparing every name with every other, the rule enters each name in an index under its own letters and under its letters with any one code point left out, and compares only names that share a key. Two limits keep a hostile file from making that slow or the report long: a name of more than 32 code points isn't compared, and neither is a group of more than eight names that differ in one place (`SOLDIER A` to `SOLDIER I` are a series, not typos of one name). The five letters are letters, not characters, so `COP 1` and `COP 2` are never compared.

**Numbered characters.** Two names that are the same once every decimal digit is left out (a digit of any script, not only 0 to 9) are numbered characters, and the pair is never reported, whatever the edit: `GUARD 1` and `GUARD 2`, `GUARD 12` and `GUARD 2`, or `GUARD 12` and `GUARD 21`. A difference in anything else is still a typo. `AGENT 47` beside `AGENT47` differs by a space, and `GUARD 1` beside `GAURD 1` by two letters swapped, so both are reported.

A rule's `severity` is the highest it reports. `unclosed-region` says `error`, but each diagnostic carries its own: a note is a warning.

## Fixes

A fix is a list of `TextChange`s (`{ from, to, insert }`) in the offsets of the linted source, in order and never overlapping. The editor can send one fix, or all the Strict fixes together, as a single CodeMirror transaction.

- **Line endings are kept.** The blank line after a heading is `\r\n` when the heading's line ends in `\r`, and `\n` otherwise, and goes in front of the `\r`. Joining a parenthetical takes each line break with its `\r`, so a CRLF file stays CRLF.
- **Joining** turns each line break in the parenthetical into one space, along with the spaces and tabs around it and the next line's indent.
- **Removing the blank line** deletes its text and its line break: `\n`, or `\r\n` in a CRLF file, when it is empty. Every other line break stays.
- **Removing `(CONT'D)`** deletes each one on the cue, with the spaces and tabs before it, and nothing else.
- **No fix inside a note or a boneyard.** If a heading's line ends inside one that runs on to the next line, a blank line there would end the note or leave the text below the heading in place, so the problem is reported without a fix.
- **No fix that could change the line endings or cut a note.** A `(CONT'D)` with a note inside it, or on a cue that holds a carriage return of its own, and a blank line that holds one, are reported without a fix.

## License

MIT
