# Deferred

Work that Phase 0 deliberately leaves for later, with the phase it belongs to.

- **Windowed incremental reparse** (Phase 1, only if profiling demands it). `reparse` runs a full parse behind an API that a windowed version could replace without changing callers; see technical design §2.7 for the budget that would trigger it.
- **More title-page layouts** (Phase 3, with the TV, radio, and UK templates). Phase 0 implements `centered-feature` only. Copyright and Notes don't print on it; a layout that wants them can place them.
- **Widow and orphan control for action** (when a template needs it). Action splits wherever the page ends, as §5.3 says; a template could ask for a minimum number of lines on each side, the way speeches have.
