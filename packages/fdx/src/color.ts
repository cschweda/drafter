// Final Draft colors an outline paragraph with any color at all (`Color="#7070B0B05050"`: red,
// green, and blue, each as four hex digits); Drafter's scene colors are nine words (Phase 2 design
// §5.4, `@drafter/notes`' `SCENE_COLORS`). A color comes in as the nearest word.

/** Drafter's colors that have a hue, each with its swatch's, in degrees. */
const HUES: ReadonlyArray<readonly [name: string, hue: number]> = [
  ['red', 2],
  ['orange', 27],
  ['yellow', 48],
  ['green', 138],
  ['teal', 177],
  ['blue', 215],
  ['purple', 267],
  ['pink', 328],
];

/** Below this saturation a color has no hue to speak of: gray. */
const GRAY_BELOW = 0.15;

/** `#RRGGBB` or Final Draft's `#RRRRGGGGBBBB`, as red, green, and blue from 0 to 1; else null. */
function channels(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6}|[0-9a-f]{12})$/i.exec(color.trim())?.[1];
  if (!hex) return null;
  const size = hex.length / 3;
  const max = size === 2 ? 0xff : 0xffff;
  const at = (k: number) => Number.parseInt(hex.slice(k * size, (k + 1) * size), 16) / max;
  return [at(0), at(1), at(2)];
}

/**
 * The scene color nearest a Final Draft color: `gray` for one with next to no color in it, else
 * the word whose hue is closest. Null for a value that isn't a color, so nothing is written.
 */
export function sceneColorOf(color: string | undefined): string | null {
  const rgb = color === undefined ? null : channels(color);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  const light = (max + min) / 2;
  const saturation = spread === 0 ? 0 : spread / (1 - Math.abs(2 * light - 1));
  if (saturation < GRAY_BELOW) return 'gray';
  const sixth =
    max === r
      ? ((g - b) / spread + 6) % 6
      : max === g
        ? (b - r) / spread + 2
        : (r - g) / spread + 4;
  const hue = sixth * 60;
  let best = 'gray';
  let nearest = Number.POSITIVE_INFINITY;
  for (const [name, at] of HUES) {
    const apart = Math.min(Math.abs(hue - at), 360 - Math.abs(hue - at));
    if (apart < nearest) {
      nearest = apart;
      best = name;
    }
  }
  return best;
}
