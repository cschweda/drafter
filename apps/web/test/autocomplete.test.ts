import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// Every text field in Drafter says `autocomplete="off"`: a browser saves what is typed in a field
// to its form history, which outlasts Remove from this browser and can sync to the browser's
// maker, and a logline, a synopsis, or a scene's name is the script's own words (red/blue audit,
// 2026-11-03: the Story map's logline was found in Chrome's form history).

const COMPONENTS = fileURLToPath(new URL('../app/components', import.meta.url));
const NOT_TEXT = /\btype="(checkbox|radio|range|file|button|submit|color|number)"/;

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? vueFiles(join(dir, entry.name))
      : entry.name.endsWith('.vue')
        ? [join(dir, entry.name)]
        : [],
  );
}

describe('text fields and the browser’s form history', () => {
  test('every text input in a component turns autocomplete off', () => {
    const missing: string[] = [];
    for (const file of vueFiles(COMPONENTS)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/<input\b[^>]*>/g)) {
        if (NOT_TEXT.test(match[0]) || match[0].includes('autocomplete=')) continue;
        const line = source.slice(0, match.index).split('\n').length;
        missing.push(`${file.slice(COMPONENTS.length + 1)}:${line}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
