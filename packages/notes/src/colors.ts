/** Drafter's scene colors (Phase 2 design §5.4), written in the file as these words. */
export type SceneColor =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'gray';

export const SCENE_COLORS: readonly SceneColor[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  'gray',
];

/**
 * Each scene color's hex value, for the Outline's, the Cards', and the strip's swatches and the HTML
 * export's band: decoration only, since a color's name is always shown or said beside it.
 */
export const SCENE_SWATCH: Readonly<Record<SceneColor, string>> = {
  red: '#d9534f',
  orange: '#e8883a',
  yellow: '#e5c13a',
  green: '#4caf6a',
  teal: '#2fa7a0',
  blue: '#4a86d9',
  purple: '#9a6ad6',
  pink: '#e06aa8',
  gray: '#8c93a1',
};
