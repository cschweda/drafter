# @drafter/layout

Pagination for [Drafter](https://github.com/cschweda/drafter): lays a parsed Fountain script out on pages, line by line, the way a template describes. The result is plain data, so the HTML preview, the PDF renderer, and the plain-text export all draw the same pages.

```ts
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { builtins } from '@drafter/templates';

const doc = parse('INT. KITCHEN - NIGHT\n\nMARGARET\nYou said you’d call.\n');
const layout = paginate(doc, builtins['us-screenplay']);

layout.pages[0].lines[2]; // { col: 22, runs: [{ text: 'MARGARET', … }], role: 'character', blockIndex: 1, … }
layout.index[2];          // { page: 1, line: 3 }: where the dialogue starts
```

Pure and deterministic: no DOM, no globals, no clock. The same document and template always give deep-equal output. A 190-page script lays out in about 7 ms.

## API

| Export | What it does |
|---|---|
| `paginate(doc, template, opts?)` | Lays out a document. `opts.sceneNumbers` overrides the template's `sceneNumbers.enabled`: `'none'`; `'written'`, only the scenes with a number written in the script (`#12A#`); or `'all'`, every scene, a written number kept and the rest counted by position. `true` is `'all'` and `false` is `'none'`. Throws `UnsupportedTemplateError` for a proportional font or anything other than 12 pt. |
| `titlePageFor(titlePage, mode)` | A title page cut to `mode`: `'full'` returns it as is, `'none'` gives null, and `'title-author'` keeps only Title, Credit, Author or Authors, and Source (by the names the layout reads), in their order. Never changes the one it is given. A title page left with nothing that prints lays out as none, and the script still starts on page 1. |
| `wrap(text, runs, width)` | Word-wraps one line of styled runs to a width, keeping styles and source spans across breaks. One array of runs per output line. |
| `Layout`, `Page`, `LayoutLine`, `LayoutRun`, `LayoutDiagnostic`, `PaginateOptions`, `SceneNumbering`, `TitlePageMode` | The result and option types. |

## The result

- **`pages`**: the title page, when the script has one that prints, is `pages[0]` with number 0; the script starts on page 1.
- **`page.lines`**: body lines only, exactly the template's body height (`height − margin.top − margin.bottom`), blank lines included. Line 0 is the first line inside the top margin.
- **`LayoutLine`**: `col` (characters from the left margin), `runs` (styled text, already wrapped and cased), `role`, `blockIndex`, and `span` (where the text came from). A row with two parts, such as dual dialogue, carries the right part in `right`.
- **Synthetic lines** have `blockIndex: -1` and say what they are: `more`, `contd`, `blank`, or `title`. A run the engine adds to a source line, such as a continued-speech `(CONT'D)`, is marked `synthetic: true`.
- **`page.pageNumber`**, **`sceneNumbersLeft`** and **`sceneNumbersRight`**, **`header`**, and **`footer`** sit outside the body lines.
- **`index`**: by block, the first printed line. A block that prints nothing, such as a note, maps to the next printed line.
- **`diagnostics`**: `disabled-element` (a block the format doesn't have, printed as action), `unpaired-dual`, `dual-overflow`, and `title-page-overflow`, in document order.

## How pages fill

Each block prints in its role: indented, wrapped to its width, aligned, and cased as the role says, with the role's space before (dropped at the top of a page). Pages fill first-fit, with these rules:

- **Keep with next.** Headings and cues never end a page: before placing one, the engine checks that it fits along with the start of what follows, and starts a new page if not.
- **Speeches split** with `(MORE)` at the foot of the page and the cue repeated with `(CONT'D)` at the top of the next, leaving at least `minLinesBefore` dialogue lines behind and taking at least `minLinesAfter` along; a speech never splits right after a parenthetical. When it can't split, the whole speech moves.
- **Continued speeches.** When the template asks for it, a cue gets `(CONT'D)` when the same character spoke last in the scene and only action came between.
- **Dual dialogue** (`^`) prints as two columns and never splits; a pair taller than a page prints one speech after the other instead.
- **Forced breaks** (`===`) end the page unless it is still empty, so they never make a blank page.

Technical design §5 has the full rules, and `docs/DECISIONS.md` records the choices it leaves open.

## License

MIT
