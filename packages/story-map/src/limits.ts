// The story map's fixed limits (Global Constraints), in one place so the model, the gaps, and the
// charts read the same numbers.

export const STORY_MAP_LIMITS = Object.freeze({
  leads: 8,
  ranked: 12,
  rest: 8,
  places: 24,
  arcs: 12,
  quotes: 12,
  foldOver: 80,
  minWidth: 0.0015,
  /** Below this many pages written, the draft is early: pages and scenes only, no acts. */
  earlyPages: 10,
  /** Below this many scenes written, the same. */
  earlyScenes: 6,
} as const);
