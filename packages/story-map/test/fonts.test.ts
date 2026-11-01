import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STORY_MAP_FONT_FILES, type StoryMapFace, storyMapFontFaces } from '../src';
import { FONT_DIR, fakeFonts, realFonts } from './fonts';

const README = readFileSync(`${FONT_DIR}README.md`, 'utf8');

/** The SHA-256 the README's table gives `file`. */
function recorded(file: string): string | undefined {
  for (const line of README.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    const hash = cells.at(-2)?.replaceAll('`', '') ?? '';
    if (cells[1] === `\`${file}\`` && /^[0-9a-f]{64}$/.test(hash)) return hash;
  }
  return undefined;
}

describe('the story map fonts', () => {
  it('each committed font is WOFF2 and its checksum is the README’s', () => {
    const files = Object.values(STORY_MAP_FONT_FILES);
    expect(files).toHaveLength(4);
    for (const file of files) {
      const bytes = readFileSync(`${FONT_DIR}${file}`);
      expect(bytes.subarray(0, 4).toString('latin1'), file).toBe('wOF2');
      expect(createHash('sha256').update(bytes).digest('hex'), file).toBe(recorded(file));
    }
    for (const file of ['OFL-Anton.txt', 'OFL-Archivo.txt', 'OFL-CourierPrime.txt']) {
      const bytes = readFileSync(`${FONT_DIR}${file}`);
      expect(bytes.toString('utf8'), file).toContain('SIL Open Font License, Version 1.1');
      // No Reserved Font Name after the copyright line, so a subset may keep its name.
      expect(bytes.toString('utf8').split('\n')[0], file).not.toMatch(/Reserved Font Name/i);
      expect(createHash('sha256').update(bytes).digest('hex'), file).toBe(recorded(file));
    }
  });

  it('the four faces together are under 70 KB', () => {
    const fonts = realFonts();
    const total = Object.values(fonts).reduce((n, bytes) => n + bytes.length, 0);
    console.log(`story map fonts: ${total} bytes`);
    expect(total).toBeLessThan(70_000);
  });

  it('each face carries its copyright comment', () => {
    const css = storyMapFontFaces(realFonts());
    const rules = css.split('\n').filter(Boolean);
    expect(rules).toHaveLength(4);
    const want: Record<StoryMapFace, [string, string, number]> = {
      anton: ['Anton', 'Copyright 2020 The Anton Project Authors', 400],
      archivo: ['Archivo', 'Copyright 2020 The Archivo Project Authors', 400],
      archivoSemiBold: ['Archivo', 'Copyright 2020 The Archivo Project Authors', 600],
      courier: ['Courier Prime', 'Copyright 2015 The Courier Prime Project Authors', 400],
    };
    Object.values(want).forEach(([family, copyright, weight], i) => {
      const rule = rules[i] as string;
      expect(rule.startsWith(`/* ${family}: ${copyright}.`)).toBe(true);
      expect(rule).toContain('SIL Open Font License 1.1');
      expect(rule).toContain(`font-family:"${family}"`);
      expect(rule).toContain(`font-weight:${weight}`);
      expect(rule).toMatch(/src:url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\) format\("woff2"\)/);
    });
    expect(css).not.toContain('<');
  });

  it('refuses bytes that are not a font', () => {
    expect(() =>
      storyMapFontFaces({ ...fakeFonts(), anton: new Uint8Array([1, 2, 3, 4]) }),
    ).toThrow(RangeError);
  });
});
