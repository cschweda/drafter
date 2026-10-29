# Deferred

Work that Phase 0 deliberately leaves for later, with the phase it belongs to.

- **Windowed incremental reparse** (Phase 1, only if profiling demands it). `reparse` runs a full parse behind an API that a windowed version could replace without changing callers; see technical design §2.7 for the budget that would trigger it.
- **More title-page layouts** (Phase 3, with the TV, radio, and UK templates). Phase 0 implements `centered-feature` only. Copyright and Notes don't print on it; a layout that wants them can place them.
- **Widow and orphan control for action** (when a template needs it). Action splits wherever the page ends, as §5.3 says; a template could ask for a minimum number of lines on each side, the way speeches have.
- **PDF for Markdown documents** (after Phase 1). Export offers the Markdown file and plain text; a PDF of a Markdown document needs its own page layout (headings, lists, quotes, code in the interface's typeface), which the screenplay renderer doesn't do. The PDF item is not offered for a Markdown document, and asking for it says so.
- **Clickable links and images in the Markdown preview** (after Phase 1). The preview shows a link's text and an image's description and nothing else, so no address can run and nothing is fetched. Links that open in a new tab (http, https, and mailto only) could follow, as could images from the writer's own files.
- **Headings as scenes in a Markdown document** (after Phase 1). Go to scene is not offered for Markdown; a "Go to heading" built from the same tree as the preview would do the job.
- **Layout shift on a phone's first paint** (after Plan 5). Lighthouse on drafter.dev at v0.3.0 measured CLS 0.15 on mobile (good is under 0.1; performance still 93): the bars above the panes (the storage warning, the sample bar) appear after the first paint and push the panes down. Reserving their space, or drawing them in the first paint from what the page already knows, would close it. Courier Prime's `font-display` and the render-blocking entry stylesheet are the next small wins.
- **Licence housekeeping** (found by the clean-room audit, 2026-10-27; not clean-room problems): ship a third-party notices file with the web build (minification strips licence comments; dexie's Apache-2.0 text among them); serve Inter Tight's `OFL.txt` beside the font, as Courier Prime's is; add a `LICENSE` file to each `@drafter/*` package before they're published to npm.
- **A stage play from a Markdown outline** (when asked for). New screenplay from this outline makes a screenplay; a play's version would write `##` stubs under `#` acts and its metadata block.
- **More tabs in a very wide pane's row** (when asked for; Phase 2 design §5.8 leaves it to the builder). Today the row is always the four core tabs, one slot, and More.
- **Final Draft's own notes** (Plan FD, Phase 2; when the maintainer supplies real `.fdx` files). Real Final Draft notes anchor to ranges of a paragraph's text. Export writes a note on its own line as a `General` paragraph with `DrafterNote="Yes"`, and a note inside a line as `[[…]]` in the text; mapping to Final Draft's anchored notes waits for real files to test against.

## Plan FD: Final Draft files

What Plan FD (v0.11.0) left for later. Final Draft's own anchored notes are the item above.

- **Testing against real Final Draft files** (when the maintainer supplies them; the files are never committed). Import and export were built from the structure description in the technical design and from hand-made fixtures. Real files may use elements, attributes, or orderings the fixtures don't, and a round trip through Final Draft itself has not been tried.
- **Revisions** (when asked for). Final Draft's revision marks and colors are not read or written.
- **Final Draft's formatting and settings** (when asked for). Page layout, fonts, smart type, headers and footers, and the like are read and listed as ignored on import, and not written on export. Drafter's templates decide the look.
- **Scene Properties beyond the synopsis** (when asked for). A `Summary` (and a scene `Title`) comes in as a synopsis; Final Draft's other scene properties (color, page length, and the like) are attributes import doesn't read.
- **A visible backslash on some imported lines.** A line from Final Draft that begins with `#`, `=`, `(`, or `~` and would read as another element is written with a `\` in front, because Fountain has no escape for those. It prints, so the writer deletes it, or changes the line.
- **Small gaps in export.** The space before a note at the end of a line is not put back. `writeXml` does not check names or nesting depth (its input is always Drafter's own tree), and an element holding only an empty string does not round-trip.
- **Attribute values on import.** The reader keeps a tab or newline inside an attribute value as typed, where XML would turn it into a space; a scene's `Summary` with a line break is read as two synopsis lines, which is what Drafter's export means by it.
- **Import on the main thread.** Export runs in the export worker; import runs on the main thread, so a worst-case 5 MB file freezes the page for about 1.4 seconds. Move it into the worker if real files are slow.
- **An import can grow past 5 MB.** Escaping (`\*`, two-space lines, a tab as four spaces, `[[fdx: …]]` notes) makes the Fountain text longer than the file's text, so an adversarial `.fdx` near 5 MB can import as more than 5 MB of script, which Drafter's own 5 MB open limit would refuse once it is saved. Real scripts are far below it.
- **Stray text on an imported title page.** Text written directly in a title-page `Paragraph`, beside its `Text` runs, is not read, and nothing says so. Final Draft doesn't write that shape; body paragraphs keep such text as a `[[fdx: Paragraph text]]` note, and the title page should do the same.
- **Stray text joins its neighbours.** Text written directly in a `Paragraph` between child elements is joined without a space (`a<Text>b</Text>c` keeps `ac`), and stray text inside a speech ends the speech, so the lines after it come in as noted action. Nothing is lost; it only reads oddly, and Final Draft doesn't write that shape.
- **Error offsets.** An `XmlError`'s offset counts characters after line endings are normalized, not in the original file.
- **Speed on very large exports.** Exporting a note on its own line scans every region of the script for each note, which is quadratic in the number of notes. Nobody has noticed; fix it if a big script is slow.
- **A shorter `import.ts`.** The importer is about 800 lines; the emphasis writer could move into its own file.
- **The `.deb` file association.** The Linux package installs a system-wide `*.fdx` glob, which may compete with another application's for Open with. Drafter never asks to be the default, but where nothing else claims `.fdx` a file manager may open it in Drafter; `docs/desktop-install-linux.md` says how to change that.
- **Tests.** The round-trip property test runs under the default 5 second limit, which could be tight on a slow CI machine. The import property checks kinds only when nothing was mapped to a note. The phone-width WebKit accessibility specs time out when six workers run at once (the pages have no axe violations); run fewer workers.

## Plan B: Cards and notes

What Plan B (v0.12.0) leaves for later.

- **The synopsis field inside a card** (the final accessibility pass). Enter on a card opens an `<input>` inside the card's `role="option"` (`SceneCard.vue`), as the Outline puts one inside its `treeitem`. ARIA doesn't allow interactive content inside an option, so screen readers may announce it differently. Check it with NVDA and VoiceOver, and move the field out of the option if they stumble.
- **Timing tests under load** (when it costs a release). A few unit tests time work against a wall clock ("in under a second", "in linear time"), such as parsing, layout, and lint on large inputs. They fail when the machine is busy, for example while an e2e run shares it, and pass on a quiet machine. Run `pnpm test` on its own before trusting such a failure; giving them budgets in CPU time, or a separate suite, would make them steadier.
- **axe on Cards, Notes, and Scene details** (the final accessibility steps). The design's Done-when asks for axe to pass on all three, in both themes at both widths; the maintainer put accessibility work last, so no new axe tests were written. The existing axe specs stay green. Rows (`role="option"`) also hold pointer-only buttons that the pass should look at.
- **Notes for Markdown documents** (Call 8; when the maintainer decides). Design §5.7 says notes work in Markdown, but a Markdown document has no `[[…]]` parse to list, so Plan B shows no Cards, Notes, or Scene details there. A Notes tab for Markdown would need its own reader, and a decision on whether `[[…]]` there is a note or a link.
- **Reply** (Plan G). Plan B shows a reader's replies nested under the person's earlier note, but has no Reply button; it arrives with the reader mode.
- **Storyline labels on cards** (Plan E). Storyline is plain text in Scene details and on the card; names and colors in the metadata block come with storylines.
- **The package layering bend** (Call 1). `@drafter/outline`, `@drafter/lint`, and `@drafter/cm-fountain` now depend on `@drafter/notes`, which reads design §21's "each package depends only on fountain, templates, layout" as a bar on third-party and upward edges. If the maintainer wants it read strictly, the shared text helpers would move into `@drafter/fountain`.
- **`@drafter/notes` details.** The head length limit counts UTF-16 units, not characters. A change that takes a line out can span the notes beside it, and a save runs up to seven parses. Changing a synopsis that has text after a note rewrites only the text before the first note (a Plan A rule). Setup rules compute the note list twice, and `fields.ts` declares its `LABELS` constant after its first use. There is no direct test of the "alone on a line" edge.
- **The Cards and Notes views.** `groupSizes` repeats the grouping in `CardsPane`, `moveUp` and `moveDown` are named for keys rather than rows, and the drop line is drawn on the dragged card itself. Scene details picks a color by focusing a row while the menu is open, `emptyDraft` repeats the shape of `detailsDraft`, and the scene being gone at save time has no test. "Resolve all shown" stays enabled when only resolved notes are shown (it says so). When two notes have the same text, an open menu can sit on the new row after a change; the action still acts on the right note. `check-build.mjs` could look for the new fixture's title.
- **Label completion** (Call 18). A label used earlier in the same multi-line paragraph is not offered, and the open-mark pattern is not anchored to the line's start.

## Plan C: Snapshots and Compare

What Plan C (v0.13.0) leaves for later.

- **axe on History and Compare** (the final accessibility steps). The design's Done-when asks for axe to pass on both, in both themes at both widths; the maintainer put accessibility work last (2026-10-28), so Plan C adds no axe tests and the existing ones stay green. Screen-reader testing of the History list and the Compare marks waits for NVDA and VoiceOver.
- **Side-by-side Compare** (when asked for; Phase 2 design §2). Compare shows the newer version as pages with the older text struck through where lines were removed. Two versions in two columns is not built.
- **Move detection in Compare** (Phase 4, with revision marks). A scene that moved is shown as removed where it was and added where it is, which is what a line diff gives.
- **The snapshot's kind.** A snapshot does not record whether it was taken from a Fountain script or a Markdown document, so Restore and Save as a file use the script's kind now. Only matters if a script's kind can change after a snapshot was taken.
- **History's edges.** Restore does not check whether the script is busy saving; Restore does not mention a known storage failure; a refused Restore still closes History; and the paths where a snapshot vanished since the list was drawn have no tests. `HistoryDialog.vue` is about 900 lines and could be split (the list, the row menu, and Compare's chooser).
- **Compare's edges.** Closing Compare forgets which tab the slot held before; the newer text is parsed twice when a comparison opens; the Changes list names a change by the scene it falls in, and when two removals sit before the same line their gaps overlap; a snapshot's label in the Compare bar has a time but no date.
- **Snapshot timing details.** A clock set back can date a snapshot in the future, and thinning would then keep it as recent. Each take reads the script's whole history about three times, which is fine at hundreds of snapshots. The hour buckets use local time and are off by an hour's worth of grouping across a daylight-saving change. A take for a script that was just removed answers "unchanged". A failed snapshot on save restarts the 10-minute count, on purpose.
- **Diff performance.** `markPages` compares every change with every printed line, which is quadratic in the number of changes; a rewrite of a whole feature has not been timed. The diff's budget tests use cheap input shapes; a scrambled input from a small alphabet would be a harder test.

## Help: About, samples, and updates

What the Help menu's About Drafter, Sample scripts, and Check for updates (after v0.13.0) leave for later.

- **A slow web install says nothing for a minute.** On drafter.dev, Check for updates waits up to 60 seconds for a new service worker it found to install, with only "Checking for updates…" showing, and then calls it an error. A progress line ("Downloading the new version…") would say more.
- **A sample script that can't be stored fails silently.** When the browser's storage is full, opening a sample script makes nothing and says nothing (the command's error is swallowed, as New's is). It should say why, as a failed save does.
- **A sample script stays a sample script.** `sampleScript` stays on the project after the writer edits or saves it, so it never counts as their own document of that kind for the first New's annotated sample. Clearing it on the first edit or save would be more exact.
- **axe on About and Check for updates** (the final accessibility steps).
