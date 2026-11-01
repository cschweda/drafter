# How Drafter works

Four diagrams of how Drafter works: how a script flows, how saving works, how a file is opened safely, and how a release is made. GitHub draws them from the Mermaid below. The [What is Drafter?](https://drafter.dev/docs/what-is-drafter/#how-it-works) page shows the same diagrams, drawn ahead of time as images, so the app never loads Mermaid. [Technical details](technical-details.md) has more, and [Developing Drafter](DEVELOPMENT.md) has the code.

Each diagram's source is a file in [`diagrams/`](diagrams/). After changing one, run `pnpm diagrams`, which draws it again for the app (see [Developing Drafter](DEVELOPMENT.md#test-counts-and-diagrams)), and copy it here. A test checks that this page, the files, and the drawings agree.

## How a script flows

You type plain Fountain in the editor. The parser (`@drafter/fountain`) reads the whole script. From that come the editor's views (Problems, Outline, and Stats), a Final Draft `.fdx` file, and the layout (`@drafter/layout`), which puts the script on pages. From the pages come the Script pane, as you type, and the exports: PDF, plain text, HTML, and EPUB.

```mermaid
flowchart TD
  type["You type<br/>plain Fountain, in the editor"] --> parse["The parser<br/>reads the whole script"]
  parse --> views["The editor's views<br/>Problems, Outline, Stats"]
  parse --> layout["Layout<br/>puts it on pages"]
  parse --> fdx["Final Draft<br/>an .fdx file"]
  layout --> pane["The Script pane<br/>pages as you type"]
  layout --> files["Exports<br/>PDF, text, HTML, EPUB"]
```

## How saving works

The text in the editor goes three ways: a recovery copy, kept in your browser's IndexedDB as you type; Save, when you choose; and snapshots, the earlier versions History keeps. Save goes back to your file in Chrome and Edge, downloads a copy in other browsers, and in the desktop app always saves in place, with the recovery copy in its own folder.

```mermaid
flowchart TD
  type["You type<br/>the text in the editor"] --> recovery["Recovery copy<br/>kept as you type"]
  type --> save["Save<br/>when you choose"]
  type --> snapshots["Snapshots<br/>earlier versions"]
  save --> chrome["Chrome and Edge<br/>back to your file"]
  save --> others["Other browsers<br/>a downloaded copy"]
  save --> desktop["Desktop app<br/>always in place"]
```

## How a file is opened safely

First the size is checked, before the file is read: Open never reads a file over 32 MB, and a script over 5 MB is refused. Then Drafter works out what the file is, from its first bytes and its name, and refuses what isn't a script (Word, RTF, PDF, a picture) with a sentence saying what to do. Then a reader that takes only text reads it: strict UTF-8 for Fountain, Markdown, and plain text; the Final Draft, Highland, and Fade In readers, which never fetch or follow anything outside the file; and, for Drafter's own HTML and EPUB exports, only the script embedded in them, never the page. A file that passes opens as text, and nothing in it runs. The [trap documents](../fixtures/trap/README.md) test every step.

```mermaid
flowchart TD
  pick["You open a file"] --> size["1. Size<br/>checked before it is read"]
  size --> kind["2. What is it?<br/>by its first bytes and name"]
  kind --> read["3. A text-only reader<br/>strict UTF-8, text only"]
  read --> opens["Opens as text<br/>nothing in it runs"]
  size -. "too big" .-> refuse["Refused<br/>with a plain message"]
  kind -. "not a script" .-> refuse
  read -. "fails a check" .-> refuse
```

## How a release is made

On the maintainer's computer: `pnpm check` (Biome's formatting and lint), the build, and the tests (the packages', the web app's, the browser tests in five projects, and the trap documents). Then the tag is pushed, and the desktop workflow on GitHub Actions builds, tests, and packages the Linux and Windows apps, and publishes the GitHub Release only if every job passes. Then `main` is pushed, and Netlify builds and deploys drafter.dev. [Releasing](DEVELOPMENT.md#contributing) has the steps.

```mermaid
flowchart LR
  subgraph local["On the maintainer's computer"]
    direction TB
    check["pnpm check<br/>format and lint"] --> build["Build<br/>the packages and the site"]
    build --> tests["Tests<br/>unit, browser, and trap tests"]
  end
  subgraph online["On GitHub, then Netlify"]
    direction TB
    tag["Push a tag<br/>vX.Y.Z"] --> ci["GitHub Actions<br/>desktop builds and tests"]
    ci --> release["GitHub Release<br/>only if every job passed"]
    release --> deploy["Push main<br/>Netlify deploys drafter.dev"]
  end
  local --> online
```
