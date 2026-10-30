import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { type FontStyle, fontFaces, stylesUsed } from '../src/fonts';

const screenplay = builtins['us-screenplay'] as Template;
const used = (source: string) => stylesUsed(paginate(parse(source), screenplay));

/** Bytes that start as a TrueType file does, with a style's own tail so each face differs. */
const ttf = (tail: number) => new Uint8Array([0x00, 0x01, 0x00, 0x00, tail, 0xff, 0xfe]);
const FAKE: Record<FontStyle, Uint8Array> = {
  regular: ttf(1),
  bold: ttf(2),
  italic: ttf(3),
  boldItalic: ttf(4),
};
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

describe('stylesUsed', () => {
  it('is regular alone for plain text, and regular always', () => {
    expect(used('INT. ROOM - DAY\n\nA chair.\n')).toEqual(new Set(['regular']));
    expect(used('')).toEqual(new Set(['regular']));
  });

  it('adds each style the text needs', () => {
    expect(used('A **bold** step.\n')).toEqual(new Set(['regular', 'bold']));
    expect(used('An *italic* step.\n')).toEqual(new Set(['regular', 'italic']));
    expect(used('A ***both*** step.\n')).toEqual(new Set(['regular', 'boldItalic']));
    expect(used('An _underlined_ step.\n')).toEqual(new Set(['regular']));
  });

  it("counts the right column of dual dialogue, and the template's own styles", () => {
    const dual = 'INT. ROOM - DAY\n\nAVA\nYes.\n\nBO ^\nNo, *never*.\n';
    expect(used(dual).has('italic')).toBe(true);
    const lyricPlay = builtins['stage-play-standard'] as Template;
    const play = stylesUsed(
      paginate(parse('# ACT ONE\n\nA bare stage.\n\nODILE\nHello.\n'), lyricPlay),
    );
    expect(play.has('regular')).toBe(true);
  });
});

describe('fontFaces', () => {
  it('writes one @font-face per style used, with its weight and style', () => {
    const css = fontFaces(FAKE, new Set<FontStyle>(['regular', 'bold']));
    const faces = css.match(/@font-face\{[^}]*\}/g) ?? [];
    expect(faces.length).toBe(2);
    expect(faces[0]).toContain('font-family:"Courier Prime"');
    expect(faces[0]).toContain('font-weight:400');
    expect(faces[0]).toContain('font-style:normal');
    expect(faces[0]).toContain(`url(data:font/ttf;base64,${base64(FAKE.regular)})`);
    expect(faces[1]).toContain('font-weight:700');
    expect(faces[1]).toContain('font-style:normal');
    expect(faces[1]).toContain(base64(FAKE.bold));
    expect(css).not.toContain(base64(FAKE.italic));
  });

  it('writes all four in a fixed order', () => {
    const all = new Set<FontStyle>(['boldItalic', 'italic', 'bold', 'regular']);
    const css = fontFaces(FAKE, all);
    const faces = css.match(/@font-face\{[^}]*\}/g) ?? [];
    expect(
      faces.map((f) => [/font-weight:(\d+)/.exec(f)?.[1], /font-style:(\w+)/.exec(f)?.[1]]),
    ).toEqual([
      ['400', 'normal'],
      ['700', 'normal'],
      ['400', 'italic'],
      ['700', 'italic'],
    ]);
  });

  it('uses only data: URLs, and nothing that could end the style', () => {
    const css = fontFaces(FAKE, new Set<FontStyle>(['regular', 'bold', 'italic', 'boldItalic']));
    const urls = css.match(/url\(([^)]*)\)/g) ?? [];
    expect(urls.length).toBe(4);
    for (const url of urls) expect(url.startsWith('url(data:font/')).toBe(true);
    expect(css).not.toMatch(/[<\r]/);
  });

  it('carries a WOFF2 file as WOFF2', () => {
    const woff2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 9, 9]);
    const css = fontFaces({ regular: woff2 }, new Set<FontStyle>(['regular']));
    expect(css).toContain(`url(data:font/woff2;base64,${base64(woff2)}) format("woff2")`);
  });

  it('refuses a style it is asked for but not given, and bytes that are not a font', () => {
    expect(() => fontFaces({ regular: FAKE.regular }, new Set<FontStyle>(['bold']))).toThrow(
      TypeError,
    );
    const html = new TextEncoder().encode('<html>');
    expect(() => fontFaces({ regular: html }, new Set<FontStyle>(['regular']))).toThrow(RangeError);
  });

  it('embeds the real Courier Prime, whole', () => {
    // A path, not a URL: jsdom's URL is not the one node:fs accepts.
    const here = dirname(fileURLToPath(import.meta.url));
    const bytes = new Uint8Array(
      readFileSync(join(here, '../../render-pdf/fonts/CourierPrime-Regular.ttf')),
    );
    const css = fontFaces({ regular: bytes }, new Set<FontStyle>(['regular']));
    expect(css).toContain(base64(bytes));
  });
});
