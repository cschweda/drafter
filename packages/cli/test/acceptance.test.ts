import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { beforeAll, describe, expect, it } from 'vitest';
import { extract } from '../../render-pdf/test/helpers';
import { repo, root, tempDir } from './helpers';

// The kickoff's acceptance tests 9 and 11, and its "Done means" command, run
// as a user runs them: `pnpm drafter …` from the repository root, against the
// built CLI.
const pnpmDrafter = (...args: string[]) =>
  spawnSync('pnpm', ['--silent', 'drafter', ...args], { cwd: root, encoding: 'utf8' });

beforeAll(() => {
  if (!existsSync(repo('packages/cli/dist/index.js'))) {
    throw new Error('The CLI is not built. Run `pnpm -r build` before these tests.');
  }
});

describe('pnpm drafter, from the repository root', () => {
  const dir = tempDir();

  it('builds the short fixture to PDF, text, and JSON (acceptance 9)', () => {
    const [pdf, txt, json] = ['out.pdf', 'out.txt', 'out.json'].map((name) => join(dir(), name));
    const result = pnpmDrafter(
      'build',
      'fixtures/layout/short.fountain',
      '--pdf',
      pdf as string,
      '--txt',
      txt as string,
      '--json',
      json as string,
    );
    expect(result.status, result.stderr).toBe(0);
    for (const file of [pdf, txt, json]) expect(existsSync(file as string)).toBe(true);
  });

  it('fails check on an unclosed boneyard (acceptance 9)', () => {
    const result = pnpmDrafter('check', 'fixtures/classification/29-unclosed-boneyard.fountain');
    expect(result.status).not.toBe(0);
  });

  it('checks and builds both samples, the play with its own template (acceptance 11)', () => {
    for (const file of ['samples/screenplay.fountain', 'samples/stage-play.fountain']) {
      const check = pnpmDrafter('check', file);
      expect(check.status, check.stdout + check.stderr).toBe(0);
      const out = join(dir(), 'sample.pdf');
      expect(pnpmDrafter('build', file, '--pdf', out).status).toBe(0);
      expect(existsSync(out)).toBe(true);
    }
    expect(pnpmDrafter('check', 'samples/stage-play.fountain').stdout).toContain(
      '(stage-play-standard)',
    );
  });

  it('produces a PDF whose page count and text match the fixture ("Done means")', async () => {
    const out = join(dir(), 'short.pdf');
    expect(pnpmDrafter('build', 'fixtures/layout/short.fountain', '--pdf', out).status).toBe(0);
    const expected = JSON.parse(readFileSync(repo('fixtures/layout/short.expected.json'), 'utf8'));
    const pdf = await extract(new Uint8Array(readFileSync(out)));
    expect(pdf.length).toBe(expected.pages);

    const template = builtins['us-screenplay'] as Template;
    const layout = paginate(
      parse(readFileSync(repo('fixtures/layout/short.fountain'), 'utf8')),
      template,
    );
    layout.pages.forEach((page, p) => {
      const printed = (pdf[p]?.items ?? []).map((item) => item.str).join(' ');
      for (const line of page.lines) {
        const text = line.runs
          .map((run) => run.text)
          .join('')
          .trim();
        if (text) expect(printed, `page ${page.number}`).toContain(text);
      }
    });
  });
});
