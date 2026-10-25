import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { drafter, repo, tempDir } from './helpers';

const short = 'fixtures/layout/short.fountain';
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('drafter build', () => {
  const dir = tempDir();

  it('writes a PDF, plain text, and JSON', async () => {
    const [pdf, txt, json] = ['s.pdf', 's.txt', 's.json'].map((name) => join(dir(), name));
    const result = await drafter('build', short, '--pdf', pdf, '--txt', txt, '--json', json);
    expect(result.code).toBe(0);
    expect(decode(readFileSync(pdf as string).subarray(0, 5))).toBe('%PDF-');
    const text = readFileSync(txt as string, 'utf8');
    expect(text).toContain('INT. HALL - DAY');
    expect(text.split('\f')).toHaveLength(4);
    const parsed = JSON.parse(readFileSync(json as string, 'utf8'));
    expect(parsed.v).toBe(1);
    expect(parsed.titlePage.fields[0].key).toBe('Title');
    expect(result.err).toContain('4 pages');
  });

  it('writes a PDF beside the script when no output is named', async () => {
    const script = join(dir(), 'script.fountain');
    copyFileSync(repo(short), script);
    expect((await drafter('build', script)).code).toBe(0);
    expect(existsSync(join(dir(), 'script.pdf'))).toBe(true);
  });

  it('writes to standard output for -', async () => {
    const result = await drafter('build', short, '--txt', '-');
    expect(result.code).toBe(0);
    expect(result.out).toContain('INT. HALL - DAY');
    const pdf = await drafter('build', short, '--pdf', '-');
    expect(decode(pdf.bytes.subarray(0, 5))).toBe('%PDF-');
  });

  it('sends only one output to standard output', async () => {
    const result = await drafter('build', short, '--txt', '-', '--json', '-');
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/standard output/);
  });

  it('prints scene numbers when asked', async () => {
    const result = await drafter('build', short, '--txt', '-', '--scene-numbers');
    expect(result.out).toMatch(/^ {5}1 {9}INT\. HALL - DAY {46}1$/m);
    const plain = await drafter('build', short, '--txt', '-');
    expect(plain.out).toMatch(/^ {15}INT\. HALL - DAY$/m);
  });

  it("won't write an output over its input", async () => {
    const script = join(dir(), 'script.fountain');
    copyFileSync(repo(short), script);
    const result = await drafter('build', script, '--txt', script);
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/won't write over the input/);
    expect(readFileSync(script, 'utf8')).toBe(readFileSync(repo(short), 'utf8'));
  });

  it('prints warnings as it builds, not just errors', async () => {
    const result = await drafter('build', 'fixtures/layout/play.fountain', '--txt', '-');
    expect(result.err).toMatch(/play\.fountain:25:1: warning: .+ \[disabled-element\]/);
    expect(result.err).not.toMatch(/note:/);
  });

  it('prints errors and warnings as it builds, but still builds', async () => {
    const out = join(dir(), 'b.pdf');
    const result = await drafter(
      'build',
      'fixtures/classification/29-unclosed-boneyard.fountain',
      '--pdf',
      out,
    );
    expect(result.code).toBe(0);
    expect(result.err).toMatch(/error: .*\[unclosed-boneyard\]/);
    expect(existsSync(out)).toBe(true);
  });
});

describe('drafter check', () => {
  const dir = tempDir();

  it('prints the page count and passes a clean script', async () => {
    const result = await drafter('check', short);
    expect(result.code).toBe(0);
    expect(result.out).toContain(`${short}: 4 pages (us-screenplay)`);
    expect(result.out).toMatch(/no problems/);
  });

  it('fails on an error, listing each diagnostic with its line and column', async () => {
    const file = 'fixtures/classification/29-unclosed-boneyard.fountain';
    const result = await drafter('check', file);
    expect(result.code).toBe(1);
    expect(result.out).toMatch(
      /29-unclosed-boneyard\.fountain:\d+:\d+: error: .+ \[unclosed-boneyard\]/,
    );
    expect(result.out).toMatch(/1 error/);
  });

  it("doesn't count a byte-order mark as a column", async () => {
    const script = join(dir(), 'bom.fountain');
    writeFileSync(script, '\ufeffA [[note\n\nB\n');
    expect((await drafter('check', script)).out).toContain('bom.fountain:1:3: warning:');
  });

  it('lists layout diagnostics too', async () => {
    const result = await drafter('check', 'fixtures/layout/play.fountain');
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/play\.fountain:25:1: warning: .+ \[disabled-element\]/);
  });

  it('takes the template from the flag, then the metadata block, then the default', async () => {
    expect((await drafter('check', 'samples/stage-play.fountain')).out).toContain(
      '(stage-play-standard)',
    );
    const flagged = await drafter(
      'check',
      'samples/stage-play.fountain',
      '--template',
      'us-screenplay',
    );
    expect(flagged.out).toContain('(us-screenplay)');
    const script = join(dir(), 'unknown.fountain');
    writeFileSync(script, 'Action.\n\n/* drafter\n{ "v": 1, "template": "no-such" }\n*/\n');
    const fallback = await drafter('check', script);
    expect(fallback.code).toBe(0);
    expect(fallback.out).toContain('(us-screenplay)');
    expect(fallback.err).toMatch(/"no-such".*us-screenplay/);
  });

  it("treats a template name that isn't a built-in, such as constructor, as unknown", async () => {
    for (const name of ['constructor', '__proto__', 'toString']) {
      const script = join(dir(), `${name}.fountain`);
      writeFileSync(script, `Action.\n\n/* drafter\n{ "v": 1, "template": "${name}" }\n*/\n`);
      const result = await drafter('check', script);
      expect([result.code, result.out.includes('(us-screenplay)')], name).toEqual([0, true]);
      expect((await drafter('check', short, '--template', name)).code, name).toBe(1);
    }
  });

  it('loads a template from a JSON file', async () => {
    const result = await drafter(
      'check',
      'fixtures/layout/dialogue-split.fountain',
      '--template',
      'fixtures/layout/templates/split-test.json',
    );
    expect(result.out).toContain('5 pages (split-test)');
  });

  it('rejects an unknown template, listing the built-in ones', async () => {
    const result = await drafter('check', short, '--template', 'no-such');
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/no-such.*us-screenplay.*stage-play-standard/s);
  });

  it('reports every problem in a bad template file', async () => {
    const bad = join(dir(), 'bad.json');
    writeFileSync(
      bad,
      JSON.stringify({
        id: 'bad',
        name: 'Bad',
        extends: 'us-screenplay',
        roles: { action: { width: -5 } },
      }),
    );
    const result = await drafter('check', short, '--template', bad);
    expect(result.code).toBe(1);
    expect(result.err).toContain('roles.action.width');
  });

  it('rejects a template it cannot lay out', async () => {
    const proportional = join(dir(), 'proportional.json');
    writeFileSync(
      proportional,
      JSON.stringify({
        id: 'p',
        name: 'P',
        extends: 'us-screenplay',
        page: { font: { monospace: false } },
      }),
    );
    const result = await drafter('check', short, '--template', proportional);
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/monospace/);
  });

  it('fails cleanly on a file it cannot read', async () => {
    const result = await drafter('check', join(dir(), 'missing.fountain'));
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/can't read .*missing\.fountain/);
  });
});

describe('drafter', () => {
  it('prints its version and help, and exits 0', async () => {
    const version = await drafter('--version');
    expect([version.code, version.out.trim()]).toEqual([0, '0.0.1']);
    const help = await drafter('--help');
    expect(help.code).toBe(0);
    expect(help.out).toMatch(/build.*check/s);
  });

  it('fails on an unknown command', async () => {
    expect((await drafter('publish', short)).code).toBe(1);
  });
});
