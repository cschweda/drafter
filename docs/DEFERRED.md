# Deferred

Work that Phase 0 deliberately leaves for later, with the phase it belongs to.

- **Windowed incremental reparse** (Phase 1, only if profiling demands it). `reparse` runs a full parse behind an API that a windowed version could replace without changing callers; see technical design §2.7 for the budget that would trigger it.
- **More title-page layouts** (Phase 3, with the TV, radio, and UK templates). Phase 0 implements `centered-feature` only. Copyright and Notes don't print on it; a layout that wants them can place them.
- **Widow and orphan control for action** (when a template needs it). Action splits wherever the page ends, as §5.3 says; a template could ask for a minimum number of lines on each side, the way speeches have.
- **A visible warning for an unknown template** (Plan 4 follow-up, with the templates work of Phase 3). A script whose `/* drafter */` block names a template Drafter doesn't have falls back to the US screenplay without saying so; the chip shows "Screenplay" and the lint is the screenplay's. A notice (and a way to keep the unknown name) is deferred.
