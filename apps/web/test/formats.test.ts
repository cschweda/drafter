import { describe, expect, test } from 'vitest';
import { notAScript, refusalMessage } from '../app/storage/formats';

const text = (s: string) => new TextEncoder().encode(s);
const PLAIN = text('INT. HALL - DAY\n\nA door opens.\n');

describe('notAScript', () => {
  test('names each refused extension, in any case', () => {
    const formats: [string, RegExp][] = [
      ['Notes.rtf', /RTF document/],
      ['Notes.doc', /Word document/],
      ['Notes.docx', /Word document/],
      ['Notes.odt', /OpenDocument text/],
      ['Notes.pages', /Pages document/],
      ['Notes.pdf', /PDF/],
      ['Notes.fdr', /older Final Draft file/],
      ['Notes.celtx', /Celtx project/],
      ['Notes.zip', /zip archive/],
    ];
    for (const [name, format] of formats) {
      for (const cased of [
        name,
        name.toUpperCase(),
        name.replace(/\.(\w)/, (_, c) => `.${c.toUpperCase()}`),
      ]) {
        const refusal = notAScript(cased, PLAIN);
        expect(refusal?.format, cased).toMatch(format);
        expect(refusal?.advice, cased).not.toBe('');
      }
    }
    // An older Final Draft file is saved again as a .fdx.
    expect(notAScript('Old.fdr', PLAIN)?.advice).toMatch(/Final Draft.*\.fdx/);
  });

  test('refuses an RTF file named .txt by its first bytes', () => {
    const rtf = text('{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Courier;}}\\f0 INT. HALL - DAY\\par}');
    expect(notAScript('Draft.txt', rtf)?.format).toMatch(/RTF document/);
    expect(notAScript('Draft.fountain', rtf)?.format).toMatch(/RTF document/);
    expect(notAScript(undefined, rtf)?.format).toMatch(/RTF document/);
    // Only at the very start: a script that mentions RTF control words is a script.
    expect(notAScript('Draft.txt', text('INT. HALL\n\n{\\rtf1}\n'))).toBeNull();
  });

  test('refuses a PDF, an OLE file, and a zip by their first bytes, whatever the name', () => {
    const pdf = text('%PDF-1.7\n%âãÏÓ\n');
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 8, 0]);
    for (const name of ['Script.fountain', 'Script.txt', 'Script.fdx', 'Script.md', undefined]) {
      expect(notAScript(name, pdf)?.format, name).toMatch(/PDF/);
      expect(notAScript(name, ole)?.format, name).toMatch(/older Office or Final Draft file/);
      expect(notAScript(name, zip)?.format, name).toMatch(
        /Word, OpenDocument, or other packed file/,
      );
    }
    // Too short to be the signature, or nearly it, is not refused here.
    expect(notAScript('a.txt', text('%PDF'))).toBeNull();
    expect(notAScript('a.txt', new Uint8Array([0x50, 0x4b, 0x03]))).toBeNull();
    expect(notAScript('a.txt', text('PK and friends\n'))).toBeNull();
    expect(notAScript('a.txt', new Uint8Array())).toBeNull();
  });

  test('lets UTF-8 text with any other name through', () => {
    for (const name of [
      'Notes.csv',
      'Notes.text',
      'Notes',
      'Notes.rtf.txt',
      'rtf',
      '.docx.md',
      undefined,
    ]) {
      expect(notAScript(name, PLAIN), String(name)).toBeNull();
    }
  });

  test('lets a .md, .markdown, .fountain, .txt, and .fdx through', () => {
    for (const name of ['a.md', 'a.markdown', 'a.fountain', 'a.txt', 'a.fdx', 'A.FOUNTAIN']) {
      expect(notAScript(name, PLAIN), name).toBeNull();
    }
    expect(notAScript('a.fdx', text('<?xml version="1.0"?><FinalDraft/>'))).toBeNull();
  });

  test('the message names the format, the file, and what to do', () => {
    const word = notAScript('Notes.docx', PLAIN);
    if (!word) throw new Error('expected a refusal');
    expect(refusalMessage('Notes.docx', word)).toBe(
      'Drafter can’t open a Word document (Notes.docx). Save it as plain text or Fountain in the app that made it, then open that.',
    );
    const old = notAScript('Pilot.fdr', PLAIN);
    if (!old) throw new Error('expected a refusal');
    const said = refusalMessage('Pilot.fdr', old);
    expect(said).toMatch(/^Drafter can’t open an older Final Draft file \(Pilot\.fdr\)\. /);
    expect(said).toContain('Open it in Final Draft and save it as .fdx');
  });
});
