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
| `LintDiagnostic`, `Fix`, `LintOptions`, `Rule`, `RuleContext`, `Severity` | The types. |

**Options.**

- `strict`: Strict Fountain. The Strict rules report warnings instead of info. No other rule changes.
- `disable`: rule ids to skip. They add to the template's `lint.disable`, and an id that names no rule changes nothing.

## The rules

These rules carry over what the parser reports on its own (technical design §2.10). Each one sets the severity, and the two Strict rules supply the fix.

| Rule | Severity | Reports | Fix |
|---|---|---|---|
| `unclosed-region` | error for a boneyard, warning for a note | A `/*` with no `*/`, or a `[[` with no `]]` before the next blank line. The span is the two-character opener. | None |
| `invalid-meta` | warning | The `/* drafter … */` block at the end of the file isn't a JSON object. | None |
| `heading-blank-after` | info; warning when `strict` | A scene heading or transition with text right below it, which Drafter reads but the Fountain spec doesn't. | **Insert a blank line** |
| `multiline-parenthetical` | info; warning when `strict` | A parenthetical wrapped over several lines. | **Join onto one line** |

A rule's `severity` is the highest it reports. `unclosed-region` says `error`, but each diagnostic carries its own: a note is a warning.

## Fixes

A fix is a list of `TextChange`s (`{ from, to, insert }`) in the offsets of the linted source, in order and never overlapping. The editor can send one fix, or all the Strict fixes together, as a single CodeMirror transaction.

- **Line endings are kept.** The blank line after a heading is `\r\n` when the heading's line ends in `\r`, and `\n` otherwise, and goes in front of the `\r`. Joining a parenthetical takes each line break with its `\r`, so a CRLF file stays CRLF.
- **Joining** turns each line break in the parenthetical into one space, along with the spaces and tabs around it and the next line's indent.
- **No fix inside a note or a boneyard.** If a heading's line ends inside one that runs on to the next line, a blank line there would end the note or leave the text below the heading in place, so the problem is reported without a fix.

## License

MIT
