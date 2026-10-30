// `drafter convert`: Final Draft, Highland, and Fade In files to Fountain, many at once. Every
// file here is the test's own: Final Draft XML written inline, and archives built by
// `@drafter/archive`'s `makeZip`, with original text.
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fromFadeIn, fromHighland } from '@drafter/archive';
import { fromFdx } from '@drafter/fdx';
import { describe, expect, it } from 'vitest';
import { makeZip } from '../../archive/test/make-zip';
import { drafter, repo, tempDir } from './helpers';

const fdx = (content: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<FinalDraft DocumentType="Script" Template="No" Version="5"><Content>${content}</Content></FinalDraft>\n`;
const P = (type: string, text: string) =>
  `<Paragraph Type="${type}"><Text>${text}</Text></Paragraph>`;

/** A plain scene: no notes. */
const PLAIN = fdx(
  P('Scene Heading', 'INT. BOATHOUSE - DAWN') +
    P('Action', 'Oars drip on the boards.') +
    P('Character', 'MARGIT') +
    P('Dialogue', 'Late again.'),
);
/** Two paragraph types Drafter has no element for, which come in as `[[fdx: …]]` notes. */
const WITH_NOTES = fdx(
  P('Action', 'The bell rings.') +
    P('Cast List', 'MARGIT, a rower') +
    P('Cast List', 'IVO, a coach'),
);

const HIGHLAND = makeZip([
  { name: 'Regatta.textbundle/text.fountain', data: 'EXT. RIVER - DAY\n\nEight boats wait.\n' },
  { name: 'Regatta.textbundle/info.json', data: '{}' },
]);

const OSF = `<?xml version="1.0" encoding="UTF-8"?>
<document type="Open Screenplay Format document" version="40">
  <paragraphs>
    <para><style basestyle="Scene Heading"/><text>Int. clubhouse - night</text></para>
    <para><style basestyle="Action"/><text>Trophies, dusty.</text></para>
  </paragraphs>
</document>`;
const FADEIN = makeZip([{ name: 'document.xml', data: OSF }]);

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('drafter convert', () => {
  const dir = tempDir();
  const at = (...parts: string[]) => join(dir(), ...parts);
  const put = (name: string, data: string | Uint8Array) => {
    writeFileSync(at(name), data);
    return at(name);
  };
  const read = (...parts: string[]) => readFileSync(at(...parts), 'utf8');

  it('writes a Final Draft file as Fountain beside it, exactly as the app imports it', async () => {
    const source = put('Boathouse.fdx', PLAIN);
    const result = await drafter('convert', source);
    expect(result.code).toBe(0);
    expect(read('Boathouse.fountain')).toBe(fromFdx(PLAIN).text);
    expect(read('Boathouse.fdx')).toBe(PLAIN);
    expect(result.out).toContain(`${source} → ${at('Boathouse.fountain')}`);
    expect(result.out).toMatch(/^1 converted$/m);
  });

  it('writes Highland and Fade In files as the app imports them', async () => {
    put('Regatta.highland', HIGHLAND);
    put('Clubhouse.fadein', FADEIN);
    const result = await drafter('convert', at('Regatta.highland'), at('Clubhouse.fadein'));
    expect(result.code, result.out).toBe(0);
    expect(read('Regatta.fountain')).toBe((await fromHighland(HIGHLAND)).text);
    expect(read('Clubhouse.fountain')).toBe((await fromFadeIn(FADEIN)).text);
    expect(result.out).toMatch(/^2 converted$/m);
  });

  it('says how many items came in as notes', async () => {
    const one = put('One.fdx', fdx(P('Action', 'A.') + P('Cast List', 'MARGIT')));
    const two = put('Two.fdx', WITH_NOTES);
    const result = await drafter('convert', one, two);
    expect(result.out).toMatch(/One\.fountain \(1 item came in as a note\)$/m);
    expect(result.out).toMatch(/Two\.fountain \(2 items came in as notes\)$/m);
    expect(read('Two.fountain')).toContain('[[fdx: Cast List]]');
  });

  it('writes UTF-8 with line feeds only, whatever line breaks the source had', async () => {
    put('Crlf.fdx', PLAIN.replace(/\n/g, '\r\n').replace('Late again.', 'Late&#13;again. Ça va'));
    expect((await drafter('convert', at('Crlf.fdx'))).code).toBe(0);
    const bytes = readFileSync(at('Crlf.fountain'));
    expect(bytes.includes(0x0d)).toBe(false);
    expect(decode(bytes)).toContain('Ça va');
  });

  it('converts the scripts in a folder, leaving other files and subfolders alone', async () => {
    put('a.fdx', PLAIN);
    put('b.HIGHLAND', HIGHLAND);
    put('c.fadein', FADEIN);
    put('notes.txt', 'not a script');
    put('draft.docx', 'PK\x03\x04');
    put('d.fountain', 'INT. HALL - DAY\n');
    put('._a.fdx', '\x00\x05\x16\x07'); // a macOS resource fork beside a.fdx on a FAT drive
    mkdirSync(at('older'));
    writeFileSync(at('older', 'e.fdx'), PLAIN);
    const result = await drafter('convert', dir());
    expect(result.code, result.out).toBe(0);
    for (const name of ['a', 'b', 'c']) expect(existsSync(at(`${name}.fountain`)), name).toBe(true);
    expect(existsSync(at('notes.fountain'))).toBe(false);
    expect(existsSync(at('draft.fountain'))).toBe(false);
    expect(existsSync(at('._a.fountain'))).toBe(false);
    expect(existsSync(at('older', 'e.fountain'))).toBe(false);
    expect(result.out).not.toMatch(/notes\.txt|draft\.docx|d\.fountain →|\._a/);
    expect(result.out).toMatch(/^3 converted$/m);
    // In name order, so a run's report reads the same every time.
    const order = ['a.fdx', 'b.HIGHLAND', 'c.fadein'].map((name) => result.out.indexOf(name));
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });

  it('goes into subfolders with --recursive', async () => {
    mkdirSync(at('older', 'oldest'), { recursive: true });
    writeFileSync(at('older', 'e.fdx'), PLAIN);
    writeFileSync(at('older', 'oldest', 'f.fadein'), FADEIN);
    mkdirSync(at('.hidden'));
    writeFileSync(at('.hidden', 'g.fdx'), PLAIN);
    const result = await drafter('convert', dir(), '--recursive');
    expect(result.code, result.out).toBe(0);
    expect(existsSync(at('older', 'e.fountain'))).toBe(true);
    expect(existsSync(at('older', 'oldest', 'f.fountain'))).toBe(true);
    expect(existsSync(at('.hidden', 'g.fountain'))).toBe(false);
  });

  it('writes into --out, making it, with subfolders kept', async () => {
    mkdirSync(at('scripts', 'older'), { recursive: true });
    writeFileSync(at('scripts', 'a.fdx'), PLAIN);
    writeFileSync(at('scripts', 'older', 'e.fdx'), WITH_NOTES);
    const out = at('converted', 'today');
    const result = await drafter('convert', at('scripts'), '--recursive', '--out', out);
    expect(result.code, result.out).toBe(0);
    expect(readFileSync(join(out, 'a.fountain'), 'utf8')).toBe(fromFdx(PLAIN).text);
    expect(readFileSync(join(out, 'older', 'e.fountain'), 'utf8')).toBe(fromFdx(WITH_NOTES).text);
    expect(existsSync(at('scripts', 'a.fountain'))).toBe(false);
  });

  it('puts a file named on its own straight into --out', async () => {
    mkdirSync(at('deep', 'er'), { recursive: true });
    writeFileSync(at('deep', 'er', 'a.fdx'), PLAIN);
    const result = await drafter('convert', at('deep', 'er', 'a.fdx'), '--out', at('out'));
    expect(result.code, result.out).toBe(0);
    expect(existsSync(at('out', 'a.fountain'))).toBe(true);
  });

  it('never writes over a .fountain that is there, unless --force', async () => {
    put('a.fdx', PLAIN);
    put('a.fountain', 'MY OWN EDITS\n');
    put('b.fdx', PLAIN);
    const result = await drafter('convert', at('a.fdx'), at('b.fdx'));
    expect(result.code).toBe(0);
    expect(read('a.fountain')).toBe('MY OWN EDITS\n');
    expect(result.out).toMatch(
      /a\.fdx: skipped: .*a\.fountain is already there \(--force replaces it\)$/m,
    );
    expect(result.out).toMatch(/^1 converted, 1 skipped$/m);

    const forced = await drafter('convert', at('a.fdx'), '--force');
    expect(forced.code).toBe(0);
    expect(read('a.fountain')).toBe(fromFdx(PLAIN).text);
  });

  it('with --force, replaces a link at the output, never the file it points to', async () => {
    const source = put('a.fdx', PLAIN);
    symlinkSync(source, at('a.fountain'));
    const kept = await drafter('convert', source);
    expect(kept.out).toMatch(/skipped/);
    expect(read('a.fdx')).toBe(PLAIN);
    const forced = await drafter('convert', source, '--force');
    expect(forced.code, forced.out).toBe(0);
    expect(read('a.fdx')).toBe(PLAIN);
    expect(lstatSync(at('a.fountain')).isSymbolicLink()).toBe(false);
    expect(read('a.fountain')).toBe(fromFdx(PLAIN).text);
  });

  it('with --force, refuses a folder at the output and leaves no temporary file', async () => {
    put('a.fdx', PLAIN);
    mkdirSync(at('a.fountain'));
    writeFileSync(at('a.fountain', 'inside'), 'kept');
    const result = await drafter('convert', at('a.fdx'), '--force');
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/a\.fdx: refused: can't write .*a\.fountain/);
    expect(readdirSync(dir()).sort()).toEqual(['a.fdx', 'a.fountain']);
  });

  it("doesn't write two sources to one .fountain in a run", async () => {
    put('a.fdx', PLAIN);
    put('a.fadein', FADEIN);
    const result = await drafter('convert', dir(), '--force');
    expect(result.code).toBe(1);
    expect(read('a.fountain')).toBe((await fromFadeIn(FADEIN)).text);
    expect(result.out).toMatch(
      /a\.fdx: refused: .*a\.fountain was already written from .*a\.fadein/,
    );
  });

  it('refuses a file that is not a script, with the reason the app gives', async () => {
    put('Notes.docx', 'PK\x03\x04 a Word document');
    put('Fake.fdx', '%PDF-1.7 a PDF named .fdx');
    put('ok.fdx', PLAIN);
    const result = await drafter('convert', at('Notes.docx'), at('Fake.fdx'), at('ok.fdx'));
    expect(result.code).toBe(1);
    expect(result.out).toContain(
      `${at('Notes.docx')}: refused: Drafter can’t open a Word document (Notes.docx). Save it as plain text or Fountain in the app that made it, then open that.`,
    );
    expect(result.out).toMatch(/Fake\.fdx: refused: Drafter can’t open a PDF \(Fake\.fdx\)/);
    expect(existsSync(at('Fake.fountain'))).toBe(false);
    expect(existsSync(at('ok.fountain'))).toBe(true);
    expect(result.out).toMatch(/^1 converted, 2 refused$/m);
  });

  it('refuses a file of a kind it does not convert, named on its own', async () => {
    put('notes.txt', 'INT. HALL - DAY\n');
    put('script.fountain', 'INT. HALL - DAY\n');
    const result = await drafter('convert', at('notes.txt'), at('script.fountain'));
    expect(result.code).toBe(1);
    expect(result.out).toMatch(
      /notes\.txt: refused: drafter convert reads Final Draft \(\.fdx\), Highland \(\.highland\), and Fade In \(\.fadein\) files$/m,
    );
    expect(result.out).toMatch(/script\.fountain: refused: /);
    expect(read('script.fountain')).toBe('INT. HALL - DAY\n');
  });

  it('refuses a Final Draft file that is not one, or is not text', async () => {
    put('xml.fdx', '<?xml version="1.0"?><html/>');
    put('broken.fdx', '<FinalDraft><Content>');
    put('latin1.fdx', Buffer.from(PLAIN.replace('Late', 'Läte'), 'latin1'));
    put('nul.fdx', `${PLAIN}\0`);
    const result = await drafter('convert', dir());
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/xml\.fdx: refused: This isn’t a Final Draft file: /);
    expect(result.out).toMatch(/broken\.fdx: refused: This isn’t a Final Draft file: /);
    expect(result.out).toMatch(/latin1\.fdx: refused: it isn’t UTF-8 text/);
    expect(result.out).toMatch(/nul\.fdx: refused: it holds more than text/);
    expect(result.out).toMatch(/^4 refused$/m);
  });

  it('refuses a damaged or unsafe archive with the reason the app gives', async () => {
    const damaged = HIGHLAND.slice();
    damaged[damaged.length - 22 + 16] ^= 0xff; // the central directory's offset, wrong
    put('damaged.highland', damaged);
    put('unsafe.highland', makeZip([{ name: '../text.fountain', data: 'EXT. RIVER\n' }]));
    put('empty.fadein', makeZip([{ name: 'readme.txt', data: 'hello' }]));
    put('notzip.highland', 'just text');
    const result = await drafter('convert', dir());
    expect(result.code).toBe(1);
    expect(result.out).toMatch(
      /damaged\.highland: refused: This isn’t a Highland file Drafter can read: /,
    );
    expect(result.out).toContain(
      'unsafe.highland: refused: This isn’t a Highland file Drafter can read: it holds a file with an unsafe name.',
    );
    expect(result.out).toContain(
      'empty.fadein: refused: This isn’t a Fade In file Drafter can read: it holds no script.',
    );
    expect(result.out).toContain(
      'notzip.highland: refused: This isn’t a Highland file Drafter can read: it isn’t a zip archive.',
    );
    expect(existsSync(at('unsafe.fountain'))).toBe(false);
  });

  it('refuses a file over the size caps without reading it', async () => {
    put('huge.fdx', '');
    truncateSync(at('huge.fdx'), 5 * 1024 * 1024 + 1);
    put('huge.highland', '');
    truncateSync(at('huge.highland'), 32 * 1024 * 1024 + 1);
    const result = await drafter('convert', dir());
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/huge\.fdx: refused: it is larger than 5 MB/);
    expect(result.out).toMatch(
      /huge\.highland: refused: This isn’t a Highland file Drafter can read: it is larger than 32 MB\./,
    );
  });

  it('refuses a deeply nested Final Draft file quickly', async () => {
    put('deep.fdx', `<FinalDraft>${'<a>'.repeat(200_000)}`);
    const started = performance.now();
    const result = await drafter('convert', at('deep.fdx'));
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/deep\.fdx: refused: This isn’t a Final Draft file/);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('prints a hostile file name as escapes, never raw', async () => {
    const name = '\u001b]0;pwned\u0007.fdx';
    put(name, PLAIN);
    const result = await drafter('convert', dir());
    expect(result.code).toBe(0);
    expect(result.out).not.toContain('\u001b');
    expect(result.out).toContain('\\u001b]0;pwned\\u0007.fdx');
    expect(existsSync(at('\u001b]0;pwned\u0007.fountain'))).toBe(true);
  });

  it("says when a path isn't there, and goes on with the rest", async () => {
    put('a.fdx', PLAIN);
    const result = await drafter('convert', at('missing.fdx'), at('a.fdx'));
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/missing\.fdx: refused: can't read it: no such file$/m);
    expect(result.out).toMatch(/^1 converted, 1 refused$/m);
  });

  it.skipIf(process.platform === 'win32')('refuses a pipe without opening it', async () => {
    execFileSync('mkfifo', [at('pipe.fdx')]);
    const result = await drafter('convert', at('pipe.fdx'));
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/pipe\.fdx: refused: it isn’t a file or a folder$/m);
  });

  it('fails when there is nothing to convert', async () => {
    put('notes.txt', 'hello');
    const result = await drafter('convert', dir());
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/nothing to convert/);
  });

  it('refuses an --out that is a file', async () => {
    put('a.fdx', PLAIN);
    put('taken', 'a file');
    const result = await drafter('convert', at('a.fdx'), '--out', at('taken'));
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/can't write to .*taken/);
  });

  it('is in the help, and in the README', async () => {
    const help = await drafter('convert', '--help');
    expect(help.code).toBe(0);
    for (const flag of ['--out', '--force', '--recursive']) expect(help.out).toContain(flag);
    expect(help.out).toMatch(/\.fdx.*\.highland.*\.fadein/s);
    expect((await drafter('--help')).out).toMatch(/convert/);
    const readme = readFileSync(repo('packages/cli/README.md'), 'utf8');
    expect(readme).toMatch(/### `drafter convert <path\.\.\.> \[options\]`/);
    for (const flag of ['--out', '--force', '--recursive']) expect(readme).toContain(flag);
  });
});
