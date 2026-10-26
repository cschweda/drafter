# @drafter/render-html

The Script pane's renderer for [Drafter](https://github.com/cschweda/drafter): draws the pages `@drafter/layout` produces as accessible DOM, one absolutely positioned element for each line that prints, so the screen follows the same character grid as the PDF and the text export. It is framework-free and touches the DOM, so it runs in a browser, and in jsdom for tests, but not in a worker.

```ts
import { createScriptView } from '@drafter/render-html';
import '@drafter/render-html/style.css';

const view = createScriptView(container);
view.element; // <section class="drafter-script" aria-label="Script">, the last child of container
```

## API

| Export | What it does |
|---|---|
| `createScriptView(container, options?)` | Appends the Script region, `<section class="drafter-script" aria-label="Script">`, to `container` and returns a `ScriptView`. `options` takes `fontsReady`, a promise that resolves when Courier Prime is ready, and `now`, a clock for the view's timing. |
| `ScriptView` | `element`, the region; `update(layout, template)`, which draws a layout into it; `reveal(blockIndex)`, which scrolls to where a block starts; and `destroy()`, which removes the region. |
| `GOTO_EVENT` | `'drafter:goto'`, the name of the `CustomEvent<{ offset: number }>` that a click on a line of the script dispatches from the region, bubbling, with the line's source offset for the editor to select. |
| `speechRoles(template)` | `{ cue, speech }`, two sets of role names read from the template's role map: the roles that open a speech, and the roles that carry it on. |
| `@drafter/render-html/style.css` | The stylesheet, described below. |

In this version `createScriptView` is a shell: it adds and removes the region, and `update` and `reveal` do nothing yet and nothing dispatches `GOTO_EVENT`.

## What it draws

Each page is a `div.drafter-page`, drawn by the same code for the title page and the body pages. Script text reaches the DOM only through `textContent`, never `innerHTML`, so a script can't put markup on the page.

| Element | Markup | Content and attributes |
|---|---|---|
| A page | `div.drafter-page[data-page=N]` | The style variables `--cols` and `--rows`, the template's width and height in characters. It starts with `span.drafter-sr-only`, which reads `Page N`, or `Title page` for page 0. |
| A line with text | `div.drafter-line.role-<role>` | `--row` and `--col`, which count the margins in, and `data-from` and `data-to`, the line's span in the source. Lines are absolutely positioned, so blank lines aren't drawn. |
| Runs in a line | `span` | `.b`, `.i`, and `.u` for bold, italic, and underline, and `.added` on text the layout added, such as `(CONT'D)`. |
| Consecutive lines of one block | `div.drafter-block[data-block=i]` | `role="heading"` and `aria-level` when the block's role has a `heading` level in the template: scene headings are level 2 in the screenplay, and act headings level 2 and scene headings level 3 in the stage play. |
| A speech | `div.drafter-speech[role=group]` | `aria-labelledby` the cue's lines, which get ids. It holds a cue, the speech's parentheticals, dialogue, and lyrics, and the `(MORE)` line that ends a split speech. |
| The page's furniture | `div.drafter-line.drafter-furniture` | The page number, scene numbers, header, and footer, each with its own class (`drafter-page-number`, `drafter-scene-number`, `drafter-header`, `drafter-footer`), and no `data-from`. |
| Hidden from screen readers | `aria-hidden="true"` | `(MORE)` lines and the furniture. |

- **Speeches** are found by role, with `speechRoles`: a line whose role is a cue role opens a group, which takes the lines that follow in a speech role. A speech split across pages continues in a group of its own on the next page, labelled by the cue the layout repeats, `MARGARET (CONT'D)`, which is read, not hidden. A cue that wraps is labelled by every one of its lines.
- **Reading order** follows the script, not the grid. A row's right part, such as the right column of dual dialogue, is a line of its own, and it comes after the left lines of its run of rows, so a screen reader reads the left speech whole and then the right, whichever column is longer.
- **Furniture** stands where the text export puts it: the page number on row `numbering.line`, its column counted from the left margin; scene numbers on their body row, at the template's `sceneNumbers.left` and `sceneNumbers.right`; the header on the page number's row, at the left margin; and the footer as far from the bottom edge as the page number is from the top.
- **Control characters** (C0, DEL, C1) and the Unicode line and paragraph separators print as spaces, each keeping its column, as they do in the PDF and the text export, so a stray character can't shift the rest of its line off the grid.
- **Role names** are free text in a template, and a space in one becomes a hyphen in the class: `role-odd-role`.

## Styling

`style.css` positions everything. A column is `1ch` and a row is `1in / 6`, which at Courier Prime's 12 pt is the PDF's grid: a US letter page is 85 columns by 66 rows, 8.5 by 11 inches. The app loads the font, with its own `@font-face` rules for Courier Prime's four styles, and `1ch` is the loaded font's, so nothing should be drawn before the font is ready; that is what `fontsReady` is for.

Two custom properties set the paper and the type, so the page can follow a theme:

| Property | Default | Sets |
|---|---|---|
| `--drafter-page` | `#fff` | The paper |
| `--drafter-ink` | `#000` | The type |

## License

MIT
