# @drafter/cli

The [Drafter](https://github.com/cschweda/drafter) command line: lays out a Fountain script and writes it as a PDF, fixed-width text, or JSON, or checks it for problems; and converts Final Draft, Highland, and Fade In files to Fountain, many at once.

```sh
drafter build script.fountain                       # writes script.pdf
drafter build script.fountain --pdf draft.pdf --txt draft.txt --json draft.json
drafter build play.fountain --template stage-play-standard --txt -
drafter check script.fountain                       # exits 1 if anything is an error
drafter convert "The Call.fdx"                      # writes The Call.fountain beside it
drafter convert old-scripts --recursive --out fountain
```

In this repository, run it from the root as `pnpm drafter …` after `pnpm -r build`. Publishing it to npm, for `npx @drafter/cli`, is planned for Phase 5.

## Commands

### `drafter build <input> [options]`

| Option | What it does |
|---|---|
| `--pdf <file>` | Write a PDF, with Courier Prime embedded. With no output named, `script.fountain` becomes `script.pdf`. |
| `--txt <file>` | Write fixed-width text: each page the full width and height of its grid, margins included, pages separated by form feeds. |
| `--json <file>` | Write the parsed script as JSON (`toJSON` from `@drafter/fountain`). |
| `--template <id\|file>` | A built-in template (`us-screenplay`, `stage-play-standard`) or a template JSON file. |
| `--scene-numbers`, `--no-scene-numbers` | Print scene numbers, or don't, whatever the template says. |

An output of `-` goes to standard output; only one output can. Errors and warnings print to standard error as the script builds, and a summary line follows. `build` still writes its outputs when the script has errors, since an unclosed boneyard, say, still lays out; `check` is the command that fails.

### `drafter check <input> [--template <id|file>]`

Prints the page count and template, then every parse and layout diagnostic, then a summary:

```
samples/stage-play.fountain: 3 pages (stage-play-standard)
samples/stage-play.fountain:43:1: note: Strict Fountain keeps a parenthetical on one line; other apps show the rest as dialogue. [multiline-parenthetical]
1 note
```

Each diagnostic is `file:line:column: severity: message [code]`, a form terminals and editors link to. Severity is `error`, `warning`, or `note`. `check` exits 1 when any diagnostic is an error.

### `drafter convert <path...> [options]`

Converts Final Draft (`.fdx`), Highland (`.highland`), and Fade In (`.fadein`) files to Fountain, with the same functions the app's Open uses (`fromFdx` from `@drafter/fdx`, `fromHighland` and `fromFadeIn` from `@drafter/archive`), so each `.fountain` holds exactly the text the app would import: UTF-8, every line ending a line feed, with what Drafter has no element for kept as notes (`[[fdx: …]]`, `[[highland: …]]`, `[[osf: …]]`).

Each path is a file or a folder. A folder's `.fdx`, `.highland`, and `.fadein` files are converted, in name order; its other files, and names starting with `.` (such as macOS's `._` files), are left alone.

| Option | What it does |
|---|---|
| `--out <dir>` | Write the `.fountain` files here, made if it is missing, instead of beside each file. With `--recursive`, a file in a subfolder goes in the same subfolder under `--out`. |
| `--force` | Replace a `.fountain` that is already there. Without it, that file is skipped and left as it is. |
| `--recursive` | Convert the scripts in a folder's subfolders too (never following a link to a folder). |

`script.fdx` becomes `script.fountain`. Each one is written in full to a temporary file first, then put in place, so a full disk never leaves half a file. (On a drive with no hard links, such as FAT or exFAT, it is copied into place, and a copy cut off by a crash can still be short.) The file converted is never written, and neither is anything a `.fountain` there links to: `--force` replaces the link itself, keeping the replaced file's permissions. Two files that would make the same `.fountain` in one run (`a.fdx` and `a.fadein`, or `Call.fdx` and `call.fdx` on a disk that doesn't tell case apart) aren't both written; the second is refused. A folder that can't be read, or made under `--out`, is refused too.

A file is refused, with the reason the app gives, when it is a kind that isn't a script (a Word, RTF, PDF, OpenDocument, or Pages document, an older Final Draft `.fdr`, a Celtx project, a zip), judged by its name and its first bytes; when it isn't a kind `convert` reads (a `.txt` or `.fountain` named on its own); and when its importer refuses it (not a Final Draft file, a damaged or encrypted archive, a name inside that isn't safe, no script inside). The app's limits apply: a Final Draft file over 5 MB, or that isn't UTF-8 text, and an archive over 32 MB are refused before they are read, and the archive reader's own limits hold inside.

It prints a line for each file, then a summary:

```
scripts/Call.fdx → scripts/Call.fountain (2 items came in as notes)
scripts/Old.fdx: skipped: scripts/Old.fountain is already there (--force replaces it)
scripts/Draft.highland: refused: This isn’t a Highland file Drafter can read: it is damaged.
1 converted, 1 skipped, 1 refused
```

## Choosing the template

`--template` if it's given; otherwise the template named in the file's metadata block (`/* drafter { "template": "…" } */` at the end of the file); otherwise `us-screenplay`. A metadata block that names a template Drafter doesn't have gets a warning, and the script is laid out with `us-screenplay`. An unknown `--template` is an error, because you asked for it by name.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success. For `check`, no diagnostic is an error. For `convert`, no file was refused (a skipped file isn't a failure). |
| 1 | `check` found an error, or `convert` refused a file or found nothing to convert, or a file couldn't be read or written, or a template is invalid or unsupported, or the command line was wrong. |

## License

MIT
