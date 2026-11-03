# The trap documents

Deliberately broken and hostile files for every format Drafter opens or imports, each with the
one outcome every way in must give it. A trap either **opens** with specific text, **opens with a
warning** (a note count, a notice), or is **refused** with a specific plain message. It never
crashes or hangs, never runs anything, never fetches anything, and never uses unbounded memory.

[MANIFEST.md](MANIFEST.md) lists every trap, generated from [`traps.ts`](traps.ts): 278 of them,
across Fountain, Markdown, plain text, Final Draft (`.fdx`), Highland, Fade In, HTML and EPUB
reopening, special files (pipes, links, folders), the desktop app's modules folder, and the
drafts and cuts files read back from beside a work.

## Running it

```sh
pnpm -r build                                     # the built `drafter` runs the special files
pnpm vitest run --project trap                    # packages, the command line, the modules folder
pnpm vitest run --project web test/trap-open.test.ts   # the app's Open, web and desktop (from apps/web)
pnpm vitest run --project web test/trap-classic.test.ts   # every Fountain trap in Classic Mode (from apps/web)
pnpm vitest run --project trap -u                 # after changing a trap: rewrites MANIFEST.md
TRAP_OUT=/tmp/traps pnpm vitest run --project trap -t TRAP_OUT   # every trap as a file, to open by hand

# Real browsers and the desktop app, a few of each kind:
cd apps/web && rm -rf .output && DRAFTER_TEST_MODULES=1 NETLIFY=true pnpm build && E2E_PORT=4198 npx playwright test e2e/trap.spec.ts
cd apps/desktop && npx tsdown && npx playwright test e2e/trap.spec.ts
```

`pnpm test` runs both Vitest parts with everything else, once the packages are built
(`pnpm -r build`: the special files go to the built `drafter`, and the harness refuses to start
without it). In CI, the desktop workflow's Linux job runs both Vitest parts (the app's Open and Classic Mode with them) after its build, and
the Electron part with the desktop e2e, on every push to `main` and every release.

Each trap at each entry point is checked for its outcome (the text, the key lines, or the
message), that nothing threw, that it finished within its time (2 seconds unless the trap says
more), and that the memory it kept, measured after a `gc`, stays within a few copies of its size
(or the trap's own allowance, for the few a parser's tree makes larger).

**What is enforced, and what is only measured.** In `harness.test.ts` (`package`, `cli-convert`,
`cli-build`, `desktop-modules`) each trap runs in a worker thread (`pool.ts`, `worker/run.ts`)
that is terminated at the trap's time limit, or when its heap, sampled from outside while it runs
(synchronous parsing included), grows past 3 GB: a hang, a quadratic regression, or an unbounded
parse there fails its test. The special files go to the built `drafter` in a process of its own,
killed after 10 seconds. The browser and Electron runs (`e2e/trap.spec.ts`) are separate
processes too, so a page that hangs fails on Playwright's timeout. **Not enforced:** the jsdom
harness, `apps/web/test/trap-open.test.ts` (`web-open` and `desktop-open`), runs the app's real
Open in the test's own thread, where Vue, the database, and jsdom make a worker impractical; its
time and memory are measured after each trap and checked, but a trap that never returned would
stall it until Vitest's test timeout, which can't interrupt synchronous code. The same readers run
enforced in `harness.test.ts`, and a few of each kind in real browsers.

## The entry points

Every way a file comes into Drafter, and the harness that runs each one
([`entry-points.ts`](entry-points.ts)):

| Entry point | What comes in | Code | Harness |
| --- | --- | --- | --- |
| `web-open` | The web app's Open: the picker, the file input where there is none, a file dropped on the window, Open as screenplay…, and a file read again from its handle. Every one hands a `PickedFile` to `openFile`, which sends it to the text check, an import (Final Draft, Highland, Fade In), or a reopen (HTML, EPUB). | `apps/web/app/storage/files.ts` (`browserFiles.fromDrop`, `pickedFrom` and its 32 MB check before reading) → `apps/web/app/storage/open.ts` (`openFile`) | `apps/web/test/trap-open.test.ts` (jsdom), `apps/web/e2e/trap.spec.ts` (Chromium, Firefox, WebKit, two phones) |
| `desktop-open` | The desktop app's files named by the system: the command line, a second launch, macOS's open-file event, a dropped file with a path. Each goes through the arguments' sorting, the grant (a script by where it leads), the main process's read (a regular file, at most 64 MB), then the same `openFile`, through `desktopFiles`. The Open dialog's choice takes the same read. | `apps/desktop/src/open-files.ts` → `file-handlers.ts` (`grantScript`) → `files.ts` (`readFileAt`) → `apps/web/app/storage/desktop-files.ts` → `open.ts` (`openPath`) | `apps/web/test/trap-open.test.ts` (the real code on real temp files, only Electron's IPC left out), `apps/desktop/e2e/trap.spec.ts` (Electron) |
| `cli-convert` | `drafter convert`: Final Draft, Highland, and Fade In files, and Drafter HTML and EPUB exports, to Fountain. | `packages/cli/src/convert.ts` | `harness.test.ts`, in process, and the built `drafter` for special files |
| `cli-build` | `drafter build` and `drafter check`: a Fountain file read, parsed, and laid out, and a `--template` JSON file. | `packages/cli/src/cli.ts` (`readInput`, `load`) | `harness.test.ts` |
| `package` | Each format's reader on its own: `parse`, `parseMarkdown`, `fromFdx`, `fromHighland`, `fromFadeIn`, `embeddedSource`; and Drafter's HTML export and story map of a hostile script, which must hold nothing live. | `packages/fountain`, `markdown`, `fdx`, `archive`, `render-html-file`, `story-map` | `harness.test.ts` |
| `desktop-modules` | The desktop app's modules folder: each `module.json`, read once at start. | `apps/desktop/src/module-folder.ts` | `harness.test.ts` |
| `beside-read` | Drafts and cuts read back from beside the work when it opens: the cuts file (`Boca.fountain.cuts.md`), each entry checked by its ID and merged, and draft files (`Boca drafts/Boca – Draft 03.fountain`), each ID checked against its text. Untrusted: they may have been edited anywhere. | `apps/web/app/beside/read.ts` → `@drafter/history` | `harness.test.ts` |
| `mcp` | Drafter for Claude: each tool’s read of a file in a configured folder, and every path a tool is given. | `packages/mcp/src` (`paths.ts`, `load.ts`, `inside.ts`, `tools/`) → `@drafter/archive` (`notAScript`, `reopenFormatOf`, `embeddedSource`), `@drafter/archive/node` (`readCapped`, `strictText`), and each format’s reader | `harness.test.ts`, in the trap worker, through the SDK’s in-memory transport |
| `classic` | A hostile script open in Classic Mode: the left pane drawn, the cursor walked through every line, and a mode switched. Every trap that opens as Fountain text (not Markdown) goes through it, after the web app's Open has made it text. | `apps/web/app/storage/open.ts` (`openFile`) → `packages/cm-fountain/src/classic` (`classic()`) | `apps/web/test/trap-classic.test.ts` (jsdom, a real `EditorView`) |

### Drafter for Claude (`mcp`)

The real server (`createServer`, its reader inline in the trap worker, which is stopped from
outside at the trap's limit) is given one folder, `Scripts`, and called through the SDK's
in-memory transport, as an AI app calls it.

- **Every trap** of a format the server reads (Fountain, plain text, Markdown, Final Draft,
  Highland, Fade In, HTML, EPUB) goes through `read_scene` (scene 1), `script_overview`, and
  `search_scripts` (`the`), from a folder holding only it. Its outcome is derived from Open's:
  a trap that opens gives a valid answer (`about` first, its text the same JSON as its structured
  content, at most 40,000 characters), or "There’s no scene 1." for a script with none; a trap
  that is refused is refused in the server's words, with the envelope, never a stack or a full
  path. The server judges every file by what is inside it, in Open's order (`inside.ts`): a web
  page or e-book is an export or refused, then a PDF, RTF, Word, or other known non-script is
  refused in Open's words whatever its name, then an import by its name, then strict text. So a
  PDF named `.fountain` is refused, and an export named `.fountain` is read for its script, as
  Open does. Only the caps' words are the server's (“it is larger than 5 MB”); no trap has an
  `mcp` outcome of its own. One is kept out (`keptOut`, with its reason in the manifest):
  `classic-5mb`, whose overview takes longer than the server's 10-second call limit
  (docs/DEFERRED.md).
- **Path traps** ([`mcp-traps.ts`](mcp-traps.ts), `MCP_PATH_TRAPS`): `..` first, in the middle,
  and last; a full path; a link to a file and to a folder outside (refused as outside); a loop of
  links; a folder named `x.fountain`; a pipe; a socket; `/dev/zero` behind a link; a file swapped
  for a link between the check and the read (through `__afterCheckForTests` in `load.ts`); a
  Windows stream, a trailing dot, a drive-relative path, and a UNC path (checked through
  `pathProblem(…, 'win32')` on every system, and for real on Windows); a NUL; a
  10,000-character name (refused by the schema, in the SDK's own words); and a cursor from
  another file and a forged one, which start again from the beginning (`restarted`), reading
  nothing else.
- **Size traps** (`MCP_SIZE_TRAPS`): a 300-scene script read whole, its overview paged and its
  scenes ten a call; a speech of 100,000 words through `character_lines`, in parts; a search that
  matches every word (it stops at 500 hits); and a folder of 2,000 scripts eight levels deep
  (`list_scripts` stops at 500 and says it was cut short). Every page is under the cap.
- **Nothing fetched or run, and the folder unchanged:** before the worker first imports the server, it replaces
  `fetch`, `WebSocket`, and every function of `node:net`, `tls`, `http`, `https`, `http2`,
  `dgram`, `dns`, and `child_process` with one that records the call and throws (and
  `syncBuiltinESMExports`, so ESM imports see them too); every job's answer carries what was
  tried, which must be nothing, as must the guard's own failures (a function it couldn't
  replace, or a call tried while the server loaded); tests check the guard catches each kind. The
  trap's folder is listed, and its every file hashed, before and after each job: the same. Writes
  anywhere else are covered by the package's read-only scan of its source
  (`packages/mcp/test/read-only.test.ts`).

### Classic Mode (`classic`)

Every trap whose Open outcome opens as Fountain gets a `classic` outcome, by a mapping in
`traps.ts` (`withDefaults`): a Markdown file by its name, or an export whose block is Markdown
(`opensAs`), doesn't. Its text comes through the app's own `openFile`, as in `trap-open.test.ts`
(the app's harness is shared, `trap-app.ts`), and goes into a real `EditorView` with `classic()`
and the script's template. The left pane must be drawn with nothing live in it; the cursor is sent
to the start of every line by transactions alone, and to at most 2,000 evenly spaced lines
through the view, both ends of each; the mode is switched off and on. The text must come out byte
for byte as it went in, with the one change Classic Mode's design allows (§3.4: two breaks above
the metadata block of a blank script), nothing may throw, nothing is fetched, and the walk must
end in the trap's time. Fifteen traps are Classic Mode's own (`classic-*`): a script of nothing
but marks; an unclosed `/*` on line 1, an unclosed `[[`, a boneyard in a note, a note across
lines; a metadata block damaged, not last, and twice; a 100,000-character line, a 5 MB script, a
heading of 50,000 spaces, and 100,000 forced marks; bidirectional and combining characters on a
hidden mark's edge; and a name and a place made to break the autofill list, which must show in
the list as text.

Not entry points, so no trap goes through them, but part of the survey:

- **Settings and the desktop app's own JSON** (`desktop-settings.json`, `granted-files.json`):
  written and read only by the app, in its profile folder; a damaged one is read as empty.
- **Snapshots, scene history, and Restore:** kept in the browser's own database, written only by
  the app. There is no backup file to import.
- **The web app's script modules:** compiled into the app at build time, never loaded from a file.
- **`drafter build --template file.json`:** read through the same capped reader as the script.

## Adding a trap

1. Small, readable text goes in `files/<format>/` as a file you write yourself. Anything large
   (over about 50 KB), binary, or packed is made by a function in `traps.ts`, with `zip.ts` for
   archives, so nothing big is ever committed.
2. Add an entry to the right list in `traps.ts`: an `id`, the `format`, the file's `name`, a
   sentence of what it `tests`, its `bytes` (or `place`, for a special file), and its `expect`ed
   outcome at `web-open`. The desktop app, `convert` (for `.fdx`, `.highland`, `.fadein`, `.html`,
   `.epub`), `build` (for `.fountain`), and the format's reader are added for you, with the same
   outcome; give one of them its own when it differs (a message in the command line's words).
3. Set `inert: true` if the text is hostile markup: it is then written into Drafter's HTML export
   and its story map (by the reader and by `drafter build --story-map`), and both are checked for
   anything live.
4. Run `pnpm vitest run --project trap -u` to rewrite MANIFEST.md, then both harnesses.
5. If Drafter gets it wrong, that is a bug: fix it with the trap as its test, or, when the fix is
   large or a judgement call, give the trap today's outcome and add the question to
   [docs/DEFERRED.md](../../docs/DEFERRED.md#trap-documents).

## The clean room

Every fixture is text written for this suite, or bytes `traps.ts` generates. Nothing is copied
from another app, converter, test suite, or public corpus, and no `.highland`, `.fadein`, or
`.fdx` file from anyone else is committed (the synthetic ones are made at test time, or, for
`.fdx`, written here by hand). Element and attribute names come only from what Drafter's own
readers already read. See [docs/clean-room.md](../../docs/clean-room.md).
