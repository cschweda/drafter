// Dates in draft and cuts files: ISO dates in UTC, compared as strings. Two ways of writing one
// moment (`…:00Z` and `…:00.000Z`) would compare as two, so every date read is turned into the one
// way `toISOString` writes it, and an impossible date (30 February, hour 24) is refused.

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/**
 * The moment `at` names, as `toISOString` writes it, or null when it isn't an ISO date in UTC or
 * names a day or time that doesn't exist (which `Date` would quietly roll over).
 */
export function isoInstant(at: unknown): string | null {
  if (typeof at !== 'string' || !ISO.test(at)) return null;
  const time = Date.parse(at);
  if (Number.isNaN(time)) return null;
  const canonical = new Date(time).toISOString();
  return canonical.slice(0, 19) === at.slice(0, 19) ? canonical : null;
}

/** Whether `at` is a date written exactly as `toISOString` writes it, as Drafter writes dates. */
export function isCanonicalIso(at: unknown): at is string {
  return isoInstant(at) === at;
}
