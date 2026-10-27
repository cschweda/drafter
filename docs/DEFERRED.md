# Deferred

Work that Phase 0 deliberately leaves for later, with the phase it belongs to.

- **Windowed incremental reparse** (Phase 1, only if profiling demands it). `reparse` runs a full parse behind an API that a windowed version could replace without changing callers; see technical design §2.7 for the budget that would trigger it.
- **More title-page layouts** (Phase 3, with the TV, radio, and UK templates). Phase 0 implements `centered-feature` only. Copyright and Notes don't print on it; a layout that wants them can place them.
- **Widow and orphan control for action** (when a template needs it). Action splits wherever the page ends, as §5.3 says; a template could ask for a minimum number of lines on each side, the way speeches have.
- **PDF for Markdown documents** (after Phase 1). Export offers the Markdown file and plain text; a PDF of a Markdown document needs its own page layout (headings, lists, quotes, code in the interface's typeface), which the screenplay renderer doesn't do. The PDF item is not offered for a Markdown document, and asking for it says so.
- **Clickable links and images in the Markdown preview** (after Phase 1). The preview shows a link's text and an image's description and nothing else, so no address can run and nothing is fetched. Links that open in a new tab (http, https, and mailto only) could follow, as could images from the writer's own files.
- **Headings as scenes in a Markdown document** (after Phase 1). Go to scene is not offered for Markdown; a "Go to heading" built from the same tree as the preview would do the job.
