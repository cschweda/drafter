# @drafter/cli

The [Drafter](https://github.com/cschweda/drafter) command line: lays out a Fountain script and writes it as a PDF, fixed-width text, or JSON, or checks it for problems.

```sh
drafter build script.fountain                       # writes script.pdf
drafter build script.fountain --pdf draft.pdf --txt draft.txt --json draft.json
drafter build play.fountain --template stage-play-standard --txt -
drafter check script.fountain                       # exits 1 if anything is an error
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

## Choosing the template

`--template` if it's given; otherwise the template named in the file's metadata block (`/* drafter { "template": "…" } */` at the end of the file); otherwise `us-screenplay`. A metadata block that names a template Drafter doesn't have gets a warning, and the script is laid out with `us-screenplay`. An unknown `--template` is an error, because you asked for it by name.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success. For `check`, no diagnostic is an error. |
| 1 | `check` found an error, or a file couldn't be read or written, or a template is invalid or unsupported, or the command line was wrong. |

## License

MIT
