// `drafter build --story-map`: one picture-first HTML page of the script so far (story-map design
// §10.1). Every script here is the test's own, with original text.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { drafter, tempDir } from './helpers';

const SCRIPT = [
  'Title: The Lamp Keeper',
  'Author: Wren Abernathy',
  'Logline: A keeper who never lets the lamp go out lets it go out.',
  '',
  'INT. LAMP ROOM - NIGHT',
  '',
  'WREN (40s), a keeper with soot on her cuffs, trims the wick.',
  '',
  'WREN',
  'Somebody has to keep this light burning all night.',
  '',
  'PIM',
  'Then let it be somebody else for once.',
  '',
  'EXT. BREAKWATER - DAY',
  '',
  'Spray over the wall. PIM runs with a coil of rope.',
  '',
  'PIM',
  'The ferry is turning back to the harbour now.',
  '',
  'INT. HARBOUR OFFICE - DAY',
  '',
  '',
].join('\n');

const doc = (html: string) => new JSDOM(html).window.document;

describe('drafter build --story-map', () => {
  const dir = tempDir();
  const script = (text = SCRIPT, name = 'Lamp.fountain') => {
    const path = join(dir(), name);
    writeFileSync(path, text);
    return path;
  };

  it('--story-map writes a story map beside --pdf', async () => {
    const input = script();
    const pdf = join(dir(), 'Lamp.pdf');
    const map = join(dir(), 'Lamp map.html');
    const result = await drafter('build', input, '--pdf', pdf, '--story-map', map);
    expect(result.code, result.err).toBe(0);
    expect(existsSync(pdf)).toBe(true);
    const html = readFileSync(map, 'utf8');
    const page = doc(html);
    expect(page.querySelector('h1')?.textContent).toContain('The Lamp Keeper');
    expect(page.querySelectorAll('script')).toHaveLength(0);
    const csp = page.querySelector('meta[http-equiv="Content-Security-Policy"]');
    expect(csp?.getAttribute('content')).toMatch(/^default-src 'none'; style-src 'sha256-/);
    expect(csp?.getAttribute('content')).not.toContain('script-src');
    expect(html).toMatch(/name="generator" content="Drafter \d/);
    expect(page.body.textContent).toContain('A keeper who never lets the lamp go out');
    expect(page.body.textContent).toContain("What I'm writing");
    // The hook from WREN's introduction, and the writer's name, but never the contact.
    expect(page.body.textContent).toContain('a keeper with soot on her cuffs');
    expect(result.err).toContain('Lamp map.html');
  });

  it('--status finished drops the planned scenes', async () => {
    const input = script();
    const going = doc((await drafter('build', input, '--story-map', '-')).out);
    expect(going.querySelectorAll('li.sc.stub').length).toBe(1);
    expect(going.body.textContent).toContain('A screenplay in progress');
    const done = await drafter('build', input, '--story-map', '-', '--status', 'finished');
    expect(done.code, done.err).toBe(0);
    const finished = doc(done.out);
    expect(finished.querySelectorAll('li.sc.stub').length).toBe(0);
    expect(finished.body.textContent).toContain('A finished screenplay');
    const wrong = await drafter('build', input, '--story-map', '-', '--status', 'done');
    expect(wrong.code).toBe(1);
    expect(wrong.err).toContain('--status is in-progress or finished');
  });

  it('a draft file’s number and id are on the last line', async () => {
    const id = 'c0ffee'.repeat(10).concat('c0ff');
    const block = `/* drafter\n{"v":1,"draft":3,"id":"${id}","frozen":"2026-10-30T12:00:00.000Z","note":""}\n*/\n`;
    const drafted = await drafter(
      'build',
      script(`${SCRIPT}\n${block}`, 'Lamp – Draft 03.fountain'),
      '--story-map',
      '-',
    );
    expect(drafted.code, drafted.err).toBe(0);
    expect(doc(drafted.out).querySelector('#soon')?.textContent).toContain(
      `The Lamp Keeper · Draft 03 · ${id.slice(0, 7)}`,
    );
    // Anything else is Draft 01, by the SHA-256 of its text, updated when the file last changed.
    const input = script();
    utimesSync(input, new Date('2026-10-31T09:00:00Z'), new Date('2026-10-31T09:00:00Z'));
    const sha = createHash('sha256').update(SCRIPT).digest('hex');
    const plain = doc((await drafter('build', input, '--story-map', '-')).out);
    expect(plain.querySelector('#soon')?.textContent).toContain(
      `The Lamp Keeper · Draft 01 · ${sha.slice(0, 7)}`,
    );
    expect(plain.body.textContent).toContain('updated 31 Oct 2026');
    // A block whose draft facts don't read strictly is no draft.
    const bad = `/* drafter\n{"v":1,"draft":"3","id":"${id}"}\n*/\n`;
    const text = `${SCRIPT}\n${bad}`;
    const loose = doc(
      (await drafter('build', script(text, 'Loose.fountain'), '--story-map', '-')).out,
    );
    const looseSha = createHash('sha256').update(text).digest('hex');
    expect(loose.querySelector('#soon')?.textContent).toContain(
      `Draft 01 · ${looseSha.slice(0, 7)}`,
    );
  });

  it('--reopenable without --html still refuses', async () => {
    const result = await drafter('build', script(), '--story-map', '-', '--reopenable');
    expect(result.code).toBe(1);
    expect(result.err).toContain('--reopenable needs --html');
  });

  it('a story map to standard output', async () => {
    const result = await drafter('build', script(), '--story-map', '-');
    expect(result.code, result.err).toBe(0);
    expect(result.out.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(result.err).toContain('standard output');
    // It never carries the script.
    expect(result.out).not.toContain('drafter-source');
    const both = await drafter('build', script(), '--story-map', '-', '--html', '-');
    expect(both.code).toBe(1);
    expect(both.err).toContain('only one output');
  });

  it('the planned length and hooks come from the metadata block', async () => {
    const meta = {
      v: 1,
      storyMap: { plannedPages: 90, hooks: { PIM: 'runs the harbour on string and luck' } },
    };
    const text = `${SCRIPT}\n/* drafter\n${JSON.stringify(meta)}\n*/\n`;
    const page = doc((await drafter('build', script(text), '--story-map', '-')).out);
    expect(page.body.textContent).toContain('runs the harbour on string and luck');
    expect(page.body.textContent).toMatch(/\d+% written/);
    // Values that don't read strictly are left out: no planned length, the found hooks.
    for (const storyMap of [
      { plannedPages: '90', hooks: { PIM: 7 } },
      { plannedPages: 0, hooks: ['runs'] },
      { plannedPages: 1000, hooks: { PIM: 'x'.repeat(201) } },
      { plannedPages: Number.NaN, hooks: null },
    ]) {
      const loose = `${SCRIPT}\n/* drafter\n${JSON.stringify({ v: 1, storyMap })}\n*/\n`;
      const out = doc((await drafter('build', script(loose), '--story-map', '-')).out);
      expect(out.body.textContent, JSON.stringify(storyMap)).not.toMatch(/% written/);
      expect(out.body.textContent).toContain('a keeper with soot on her cuffs');
      expect(out.body.textContent).not.toContain('xxxxxxxxxx');
    }
  });

  it('lists --story-map and --status in the help, in plain words', async () => {
    const help = await drafter('build', '--help');
    const out = help.out.replace(/\s+/g, ' ');
    expect(out).toContain('--story-map <file>');
    expect(out).toContain(
      'write a story map: one picture-first HTML page of the script so far, to send to anyone (notes left out)',
    );
    expect(out).toContain('--status <in-progress|finished>');
  });
});
