// The HTML file's size and speed budgets (design §11, plan Task 8): a 120-page screenplay under
// 2 MB and 1 s, a 300-page one under 4 MB and 3 s, with all four Courier Prime styles embedded.
// The measured figures are in DECISIONS. Original text throughout.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stylesUsed } from '../src/fonts';
import { renderScriptHtml } from '../src/script';
import { lay } from './scripts';

const fontFile = (name: string) =>
  new Uint8Array(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../render-pdf/fonts', name)),
  );
const FONTS = {
  regular: fontFile('CourierPrime-Regular.ttf'),
  bold: fontFile('CourierPrime-Bold.ttf'),
  italic: fontFile('CourierPrime-Italic.ttf'),
  boldItalic: fontFile('CourierPrime-BoldItalic.ttf'),
};

const NAMES = ['MARA', 'JONAH', 'TESSA', 'DECLAN', 'ODILE', 'BASTIEN', 'IRIS', 'COSMO'];
const PLACES = ['LIGHTHOUSE KITCHEN', 'CLIFF PATH', 'HARBOUR WALL', 'FERRY DECK', 'BOATHOUSE'];

/** One scene: a heading, action in all four styles, and speeches by two of the cast. */
function scene(n: number): string {
  const a = NAMES[n % NAMES.length] as string;
  const b = NAMES[(n * 3 + 1) % NAMES.length] as string;
  const place = PLACES[n % PLACES.length] as string;
  return [
    `${n % 2 ? 'INT.' : 'EXT.'} ${place} ${n} - ${n % 3 ? 'NIGHT' : 'DAY'}`,
    `${a} sets down the lamp. **The wind** finds the gap under the door, *the flame leans*, and ***for a moment*** it is out.`,
    `${a}\nYou kept the boats in tonight. All of them, number ${n}?`,
    `${b}\n(quietly)\nEvery one. The tide turned early and the gulls went inland before noon.`,
    `${a}\nThen we wait for morning, and we count them again when the light comes up over the rocks.`,
    `${b} nods. Neither of them moves. Down on the shingle, a rope knocks against a hull, slow and patient.`,
    `${b}\nI will sit up. You sleep. Somebody has to keep the lamp, and it has been you every night this week.`,
  ].join('\n\n');
}

/** A screenplay of `scenes` scenes in three acts, with a title page. */
function screenplayOf(scenes: number): string {
  const parts = ['Title: The Long Watch\nAuthor: Wren Okafor\nDraft date: 30 October 2026'];
  for (let n = 1; n <= scenes; n++) {
    if (n === 1 || n === Math.ceil(scenes / 3) || n === Math.ceil((2 * scenes) / 3)) {
      parts.push(`# ACT ${parts.length}`);
    }
    parts.push(scene(n));
  }
  return `${parts.join('\n\n')}\n`;
}

/** The fewest scenes that lay out to at least `pages` body pages, and that layout. */
function ofPages(pages: number) {
  let scenes = Math.ceil(pages * 1.2);
  for (;;) {
    const laid = lay(screenplayOf(scenes));
    const body = laid.layout.pages.filter((p) => p.number > 0).length;
    if (body >= pages) return { laid, body };
    scenes += Math.max(1, Math.ceil((pages - body) * 1.1));
  }
}

/**
 * The median of `runs` renders after one warm-up: a busy machine slows some runs, rarely half of
 * them (the repo's pattern for a load-sensitive budget, as in outline's strip budget).
 */
function timed(render: () => string, runs: number): { ms: number; bytes: number } {
  const html = render();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const started = performance.now();
    render();
    times.push(performance.now() - started);
  }
  times.sort((x, y) => x - y);
  return {
    ms: times[Math.floor(runs / 2)] as number,
    bytes: new TextEncoder().encode(html).length,
  };
}

describe('the HTML file’s budget', () => {
  for (const [pages, maxBytes, maxMs] of [
    [120, 2 * 1024 * 1024, 1000],
    [300, 4 * 1024 * 1024, 3000],
  ] as const) {
    it(`${pages} pages: under ${maxBytes / 1024 / 1024} MB and under ${maxMs / 1000} s`, () => {
      const { laid, body } = ofPages(pages);
      expect(body).toBeGreaterThanOrEqual(pages);
      expect(body).toBeLessThan(pages * 1.1);
      // All four styles, as the budget asks.
      expect(stylesUsed(laid.layout)).toEqual(new Set(['regular', 'bold', 'italic', 'boldItalic']));
      const render = () =>
        renderScriptHtml({
          ...laid,
          notes: 'leave-out',
          fonts: FONTS,
          title: 'The Long Watch',
          lang: 'en',
          generator: 'Drafter 0.22.0',
          kindLine: `Screenplay · ${body} pages · About ${body} min`,
        });
      const { ms, bytes } = timed(render, 5);
      console.info(
        `budget: ${body} pages, ${(bytes / 1024 / 1024).toFixed(2)} MB, ${ms.toFixed(0)} ms (median of 5)`,
      );
      expect(bytes).toBeLessThan(maxBytes);
      expect(ms).toBeLessThan(maxMs);
    }, 60_000);
  }
});
