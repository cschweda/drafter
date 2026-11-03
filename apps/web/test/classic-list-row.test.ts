import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The highlighted row of the list is the one Enter and Tab write, so Classic Mode marks it with a
// bar a writer can see. The background alone is barely different from the list's.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const tokens = read('../app/assets/css/tokens.css');
const theme = read('../app/editor/theme.ts');
const main = read('../app/assets/css/main.css');

const luminance = (hex: string) => {
  const parts = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = parts.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string) => {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y) as [number, number];
  return (high + 0.05) / (low + 0.05);
};

/** Each of the token's values, dark first. */
const values = (name: string) =>
  [...tokens.matchAll(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'g'))].map((match) => match[1]);

describe('the highlighted row in Classic Mode', () => {
  it('has a bar of 3:1 in both themes', () => {
    const bars = values('--accent-text').slice(0, 2);
    const rows = values('--overlay').slice(0, 2);
    expect(bars).toHaveLength(2);
    expect(rows).toHaveLength(2);
    bars.forEach((bar, i) => {
      expect(contrast(bar as string, rows[i] as string)).toBeGreaterThanOrEqual(3);
    });
  });

  it('is Classic Mode’s alone', () => {
    expect(theme).toMatch(
      /\$\{CLASSIC\} \.cm-tooltip-autocomplete ul li\[aria-selected\]`\]: \{\s*borderLeft: '3px solid var\(--accent-text\)'/,
    );
  });

  it('is CanvasText where colours are forced', () => {
    expect(main).toMatch(
      /@media \(forced-colors: active\) \{[\s\S]*?\.cm-classic \.cm-tooltip-autocomplete ul li\[aria-selected\]\[aria-selected\] \{\s*border-left-color: CanvasText;/,
    );
  });
});
