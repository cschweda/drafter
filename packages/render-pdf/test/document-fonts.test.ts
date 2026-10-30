import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { describe, expect, it } from 'vitest';
import { DOCUMENT_FONT_FILES } from '../src/document/fonts';
import { documentFonts } from './helpers';

const dir = new URL('../fonts/inter-tight/', import.meta.url);
const read = (file: string) => readFileSync(new URL(file, dir));
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** The SHA-256 table in `fonts/inter-tight/README.md`, by file name. */
const checksums = () =>
  new Map(
    [
      ...read('README.md')
        .toString('utf8')
        .matchAll(/^\| `([^`]+)` \| `([0-9a-f]{64})` \|$/gm),
    ].map(([, file, hash]) => [file as string, hash as string]),
  );

/** The parts of a fontkit font these tests read that `@pdf-lib/fontkit`'s types leave out. */
interface FontTables {
  getName(key: string): string | null;
  'OS/2': { usWeightClass: number };
}

const INTER_TIGHT = [
  'InterTight-Regular.ttf',
  'InterTight-Italic.ttf',
  'InterTight-SemiBold.ttf',
  'InterTight-SemiBoldItalic.ttf',
];

describe('Inter Tight for documents', () => {
  it('each Inter Tight file matches the SHA-256 in its README', () => {
    const table = checksums();
    for (const file of [...INTER_TIGHT, 'OFL.txt']) {
      expect(table.get(file), file).toBeDefined();
      expect(sha256(read(file)), file).toBe(table.get(file));
    }
  });

  it("SemiBold is the brand's file", () => {
    const brand = readFileSync(
      new URL('../../../brand/fonts/InterTight-SemiBold.ttf', import.meta.url),
    );
    expect(sha256(read('InterTight-SemiBold.ttf'))).toBe(sha256(brand));
    expect(sha256(brand)).toBe('a40a1fdc93cadcbb0e3ba16d6010988118a1a3add06a097330b09cb41c2b8d45');
  });

  it('each face opens in fontkit with the family Inter Tight and its weight and style', () => {
    const expected = {
      text: { weight: 400, italic: false },
      textItalic: { weight: 400, italic: true },
      textBold: { weight: 600, italic: false },
      textBoldItalic: { weight: 600, italic: true },
    } as const;
    for (const [face, want] of Object.entries(expected)) {
      const font = fontkit.create(documentFonts[face as keyof typeof expected]);
      const tables = font as unknown as FontTables;
      // Weights other than Regular name their family "Inter Tight SemiBold" and
      // put "Inter Tight" in the typographic family (name ID 16).
      const family = tables.getName('preferredFamily') ?? font.familyName;
      expect(family, face).toBe('Inter Tight');
      expect(tables['OS/2'].usWeightClass, face).toBe(want.weight);
      expect(font.italicAngle !== 0, face).toBe(want.italic);
      expect(font.version, face).toBe('Version 3.004');
    }
  });

  it('the code face is Courier Prime Regular', () => {
    expect(DOCUMENT_FONT_FILES.code).toBe('CourierPrime-Regular.ttf');
    expect(fontkit.create(documentFonts.code).fullName).toBe('Courier Prime Regular');
  });

  it('OFL.txt is the SIL Open Font License 1.1', () => {
    const text = read('OFL.txt').toString('utf8');
    expect(text).toMatch(/^Copyright 2022 The Inter Project Authors/);
    expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });
});
