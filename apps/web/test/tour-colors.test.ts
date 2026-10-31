import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// The welcome, intro, and step cards (app/assets/css/tour.css) are the one dialog style (fresh-look
// design §5, Task 7): --raised with the tokens' text, no slate gradient, and the goldenrod primary
// button instead of the tour module's blue one. The tokens' own contrast (--text and --muted on
// --raised, --on-accent on --accent and --accent-hover) is measured in tokens.test.ts, so this
// checks that the cards use the tokens and nothing else.
const css = readFileSync(new URL('../app/assets/css/tour.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** The declarations of the rules whose selector names `part`. */
function rulesFor(part: string): string {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => (selector as string).includes(part))
    .map(([, , body]) => body as string)
    .join('\n');
}

describe('the tour cards', () => {
  test('have no colour of their own: only the tokens', () => {
    expect(css.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
  });

  test.each(['.welcome-card', '.intro-card', '.tour-card'])(
    '%s is --raised, with no gradient, and a 12px radius',
    (card) => {
      const rules = rulesFor(card);
      expect(rules).toMatch(/background: var\(--raised\) !important;/);
      expect(rules).toMatch(/background-image: none !important;/);
      expect(rules).toMatch(/border-radius: var\(--r-lg\)/);
    },
  );

  test('their text is the tokens’ text', () => {
    const rules = rulesFor('.welcome-card');
    expect(rules).toMatch(/--ui-text: var\(--text\);/);
    expect(rules).toMatch(/--ui-text-muted: var\(--muted\);/);
    expect(rules).toMatch(/--ui-text-dimmed: var\(--muted\);/);
  });

  test('the primary button is the accent fill with --on-accent text, and its hover --accent-hover', () => {
    const next = rulesFor('.tour-next-btn');
    expect(next).toMatch(/background: var\(--accent\);/);
    expect(next).toMatch(/color: var\(--on-accent\);/);
    expect(rulesFor('.bg-primary')).toMatch(/background-color: var\(--accent\)/);
    expect(rulesFor(':hover')).toMatch(/var\(--accent-hover\)/);
  });

  test('the welcome card is 440px wide, and no card is a fixed height', () => {
    expect(rulesFor('.welcome-card')).toMatch(/width: min\(440px, calc\(100vw - 32px\)\)/);
    expect(rulesFor('.tour-body')).toMatch(/height: auto/);
  });
});
