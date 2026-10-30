// Fade In archives built by makeZip, shaped as the public descriptions give the file
// (docs/DECISIONS.md): a zip holding the script as an Open Screenplay Format XML document. No
// public source names the entry, so the tests' own names are used. Every text is the tests' own.
import { OsfError } from '@drafter/fdx';
import { describe, expect, it } from 'vitest';
import { ArchiveError, type ArchiveReason } from '../src/errors';
import { fromFadeIn } from '../src/fadein';
import { makeZip } from './make-zip';

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8"?>
<document type="Open Screenplay Format document" version="40">
  <styles>
    <style name="Scene Heading" basestyle="Normal Text" allcaps="1"/>
    <style name="Character" basestyle="Normal Text" allcaps="1"/>
  </styles>
  <paragraphs>
    <para><style basestyle="Scene Heading"/><text>Int. ferry cabin - night</text></para>
    <para><style basestyle="Action"/><text>The engine knocks twice.</text></para>
    <para><style basestyle="Character"/><text>Abel</text></para>
    <para><style basestyle="Dialogue"/><text>She’s tired.</text></para>
  </paragraphs>
</document>`;

const SCRIPT = 'INT. FERRY CABIN - NIGHT\n\nThe engine knocks twice.\n\nABEL\nShe’s tired.\n';

async function refusal(bytes: Uint8Array): Promise<ArchiveError> {
  try {
    await fromFadeIn(bytes);
  } catch (error) {
    if (error instanceof ArchiveError) return error;
    throw error;
  }
  throw new Error('expected an ArchiveError');
}

const reasonOf = async (bytes: Uint8Array): Promise<ArchiveReason> => (await refusal(bytes)).reason;

describe('fromFadeIn', () => {
  it('reads the OSF document out of a Fade In archive', async () => {
    for (const method of [0, 8]) {
      const result = await fromFadeIn(
        makeZip([
          { name: 'screenplay.xml', data: DOCUMENT, method },
          { name: 'thumbnail.png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
        ]),
      );
      expect(result.text).toBe(SCRIPT);
      expect(result.mapped).toEqual([]);
      expect(result.ignored).toEqual(['styles']);
    }
    // A BOM and Windows line ends, as any UTF-8 text may carry.
    const result = await fromFadeIn(
      makeZip([{ name: 'screenplay.xml', data: `﻿${DOCUMENT.replace(/\n/g, '\r\n')}` }]),
    );
    expect(result.text).toBe(SCRIPT);
  });

  it('ignores __MACOSX and dot-files when finding the document', async () => {
    const result = await fromFadeIn(
      makeZip([
        { name: '__MACOSX/._screenplay.xml', data: 'not xml at all' },
        { name: '.hidden.xml', data: '<x/>' },
        { name: 'screenplay.xml', data: DOCUMENT },
      ]),
    );
    expect(result.text).toBe(SCRIPT);
  });

  it('refuses an archive with no document', async () => {
    expect(await reasonOf(makeZip([{ name: 'notes.txt', data: 'Hello.' }]))).toBe('no-script');
    expect(
      await reasonOf(
        makeZip([
          { name: 'one.xml', data: DOCUMENT },
          { name: 'two.xml', data: DOCUMENT },
        ]),
      ),
    ).toBe('many-scripts');
    expect(
      await reasonOf(makeZip([{ name: 'screenplay.xml', data: new Uint8Array([0xff, 0xfe]) }])),
    ).toBe('not-utf8');
    expect(await reasonOf(makeZip([{ name: 'screenplay.xml', data: `${DOCUMENT}\u0000` }]))).toBe(
      'not-text',
    );
    expect(await reasonOf(new TextEncoder().encode(DOCUMENT))).toBe('not-zip');
  });

  it('wraps an OsfError as an ArchiveError naming Fade In', async () => {
    const error = await refusal(
      makeZip([{ name: 'screenplay.xml', data: '<FinalDraft><Content/></FinalDraft>' }]),
    );
    expect(error.format).toBe('Fade In');
    expect(error.reason).toBe('not-osf');
    expect(error.cause).toBeInstanceOf(OsfError);
    expect(error.detail).toBe('it has no document root holding paragraphs');
    expect(error.message).toBe(
      'This isn’t a Fade In file Drafter can read: its document isn’t one Drafter can read (it has no document root holding paragraphs).',
    );
    expect(await reasonOf(makeZip([{ name: 'screenplay.xml', data: '<document>' }]))).toBe(
      'not-osf',
    );
  });

  it('refuses a Highland archive', async () => {
    const highland = makeZip([
      { name: 'text.fountain', data: 'INT. HOUSE - DAY\n' },
      { name: 'info.json', data: '{}' },
    ]);
    expect(await reasonOf(highland)).toBe('no-script');
  });
});
