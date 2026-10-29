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
- **A snapshot before Expand outline** (Plan C, Phase 2). The design takes one before every bulk operation (§6.5, §11.1); snapshots with history arrive in Plan C, and until then one undo reverses an expand.
- **A stage play from a Markdown outline** (when asked for). New screenplay from this outline makes a screenplay; a play's version would write `##` stubs under `#` acts and its metadata block.
- **More tabs in a very wide pane's row** (when asked for; Phase 2 design §5.8 leaves it to the builder). Today the row is always the four core tabs, one slot, and More.
- **Final Draft's own notes** (Plan FD, Phase 2; when the maintainer supplies real `.fdx` files). Real Final Draft notes anchor to ranges of a paragraph's text. Export writes a note on its own line as a `General` paragraph with `DrafterNote="Yes"`, and a note inside a line as `[[…]]` in the text; mapping to Final Draft's anchored notes waits for real files to test against.

## Plan FD: Final Draft files

What Plan FD (v0.11.0) left for later. Final Draft's own anchored notes are the item above.

- **Testing against real Final Draft files** (when the maintainer supplies them; the files are never committed). Import and export were built from the structure description in the technical design and from hand-made fixtures. Real files may use elements, attributes, or orderings the fixtures don't, and a round trip through Final Draft itself has not been tried.
- **Revisions** (when asked for). Final Draft's revision marks and colors are not read or written.
- **Final Draft's formatting and settings** (when asked for). Page layout, fonts, smart type, headers and footers, and the like are read and listed as ignored on import, and not written on export. Drafter's templates decide the look.
- **Scene Properties beyond the synopsis** (when asked for). A synopsis on a scene heading comes in. A `Summary` on the outer paragraph of a dual-dialogue pair, and bare text directly inside that paragraph, are dropped without a note.
- **A visible backslash on some imported lines.** A line from Final Draft that begins with `#`, `=`, `(`, or `~` and would read as another element is written with a `\` in front, because Fountain has no escape for those. It prints, so the writer deletes it, or changes the line.
- **Small gaps in export.** The space before a note at the end of a line is not put back. A tab or newline inside an attribute value is kept as typed, where XML would turn it into a space. `writeXml` does not check names or nesting depth (its input is always Drafter's own tree), and an element holding only an empty string does not round-trip.
- **Error offsets.** An `XmlError`'s offset counts characters after line endings are normalized, not in the original file.
- **Speed on very large exports.** Exporting a note on its own line scans every region of the script for each note, which is quadratic in the number of notes. Nobody has noticed; fix it if a big script is slow.
- **A shorter `import.ts`.** The importer is about 800 lines; the emphasis writer could move into its own file.
- **The `.deb` file association.** The Linux package installs a system-wide `*.fdx` glob, which may compete with another application's for Open with. It is offered, never made the default.
- **Tests.** The round-trip property test runs under the default 5 second limit, which could be tight on a slow CI machine. The import property checks kinds only when nothing was mapped to a note. The phone-width WebKit accessibility specs time out when six workers run at once (the pages have no axe violations); run fewer workers.
