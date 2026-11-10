/**
 * An export with nothing to make (a revised-pages PDF with no pages): its message is said as it
 * is, not as a failure (`ExportReply.refused`). Its own module, so the main thread can tell one
 * apart without loading the export worker's code.
 */
export class ExportRefusal extends Error {}

/** Said when revised pages are asked of a script that isn't locked. */
export const NOT_LOCKED_REVISED = 'Only a locked script prints revised pages.';

/**
 * Said when a locked script's pages couldn't be placed (`ProductionLayoutResult.degraded`): revised
 * pages, the breakdown, and the sides print nothing rather than unlocked labels.
 */
export const DEGRADED = "The locked pages couldn't be placed, so nothing was exported.";
