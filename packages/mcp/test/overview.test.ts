import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { DEFAULT_WORDS_PER_MINUTE } from '@drafter/outline';
import { buildStoryMap, storyMapMeta } from '@drafter/story-map';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, describe, expect, it } from 'vitest';
import { buildScript } from '../../../fixtures/generators/script';
import { MAX_ANSWER_CHARS } from '../src/envelope';
import { answerOf, type Connected, connect } from './connect';
import { EPISODE_101, EPISODE_102, LIBRARY, makeLibrary, PLAY } from './library';
import { put, tempFolder } from './temp';

interface Scene {
  n: number;
  number: string | null;
  heading: string;
  place: string | null;
  inside: string | null;
  time: string | null;
  act: number | null;
  page: number | null;
  pages: number;
  minutes: number;
  synopsis: string | null;
  who: string[];
}
interface Overview {
  title_page: Record<string, string>;
  template: string;
  pages: number;
  minutes: number;
  acts: Array<{ title: string; synopsis: string | null; scenes: number[] }>;
  scenes: Scene[];
  characters?: Array<{
    name: string;
    speeches: number;
    words: number;
    share: number;
    scenes: number;
    first: number | null;
    last: number | null;
    absences: Array<{ after: number; before: number; pages: number }>;
    with: string[];
  }>;
  places?: Array<{ name: string; scenes: number }>;
  places_more?: number;
  characters_more?: number;
  gaps: {
    empty_acts: number[];
    planned_scenes: number[];
    todos: number;
    pages_to_write: number | null;
  };
  problems: number;
  left_out: { notes: number; boneyard: number };
  next?: string;
  restarted?: true;
}

let open: Connected | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
});

async function overview(folders: string[], args: object, notes = false) {
  open ??= await connect({ folders, notes });
  return answerOf<Overview>(await open.call('script_overview', args));
}

const SCREENPLAY = builtins['us-screenplay'] as Template;
const EP101 = `Scripts/Signal Hill/${EPISODE_101}`;

describe('script_overview', () => {
  it('the title page, never Contact', async () => {
    const { scripts } = makeLibrary(tempFolder());
    const one = await overview([scripts], { script: EP101 });
    expect(one.title_page).toEqual({
      Title: 'Signal Hill',
      Credit: 'Written by',
      Author: 'A. Writer',
      'Draft date': 'November 2026',
    });
    expect(Object.keys(one.title_page)).toEqual(['Title', 'Credit', 'Author', 'Draft date']);
    const two = answerOf<Overview>(
      await (open as Connected).call('script_overview', {
        script: `Scripts/Signal Hill/${EPISODE_102}`,
        include: ['notes', 'boneyard'],
      }),
    );
    expect(two.title_page.Title).toBe('Signal Hill Episode 102');
    const text = JSON.stringify(two);
    expect(text).not.toContain('Contact');
    expect(text).not.toContain('555-0144');
    expect(text).not.toContain('care of');
    const pitch = answerOf<Overview>(
      await (open as Connected).call('script_overview', { script: 'Scripts/Pitch.txt' }),
    );
    expect(pitch.title_page).toEqual({
      Title: 'Signal Hill: A Pitch',
      Credit: 'Written by',
      Author: 'A. Writer',
    });
    expect(JSON.stringify(pitch)).not.toContain('Hollow Creek');
  });

  it('pages, minutes, and scenes are the story map’s', async () => {
    const { scripts } = makeLibrary(tempFolder());
    const got = await overview([scripts], { script: EP101 });
    const text = readFileSync(join(LIBRARY, EPISODE_101), 'utf8');
    const doc = parse(text);
    const layout = paginate(doc, SCREENPLAY);
    const meta = storyMapMeta(doc.meta);
    const map = buildStoryMap({
      doc,
      template: SCREENPLAY,
      layout,
      options: {
        status: null,
        plannedPages: meta.plannedPages,
        logline: null,
        greeting: '',
        explain: null,
        include: { summaries: true, lines: true, threads: true, contact: false },
        contact: null,
        hooks: meta.hooks,
        rates: { minutesPerPage: 1, wordsPerMinute: DEFAULT_WORDS_PER_MINUTE },
        draft: { number: 1, id: '0'.repeat(64) },
        updated: null,
        title: 'Signal Hill',
      },
    });
    expect(got.template).toBe('us-screenplay');
    expect(got.pages).toBe(map.facts.pages);
    expect(got.minutes).toBe(map.facts.minutes);
    expect(got.scenes).toHaveLength(map.facts.scenes);
    expect(got.scenes.map((s) => s.act)).toEqual(map.scenes.map((s) => s.act));
    expect(got.next).toBeUndefined();
    expect(got.scenes[0]).toEqual({
      n: 1,
      number: null,
      heading: "INT. JUNE'S KITCHEN - NIGHT",
      place: "JUNE'S KITCHEN",
      inside: 'inside',
      time: 'NIGHT',
      act: 1,
      page: 1,
      pages: expect.any(Number),
      minutes: expect.any(Number),
      synopsis: 'June hears a dead station come back to life.',
      who: expect.any(Array),
    });
    expect(got.scenes[0]?.who.sort()).toEqual(['ANNOUNCER', 'JUNE']);
    expect(got.scenes[2]?.who.sort()).toEqual(['ELI', 'JUNE', 'WES']);
    // Notes in the scenes are left out, and counted.
    expect(got.left_out.notes).toBeGreaterThan(13);
    expect(got.left_out.boneyard).toBe(0);
    expect(JSON.stringify(got)).not.toContain('Color: blue');
  });

  it('acts and their synopses', async () => {
    const { scripts } = makeLibrary(tempFolder());
    const got = await overview([scripts], { script: EP101 });
    expect(got.acts).toEqual([
      { title: 'Act One', synopsis: null, scenes: [1, 2, 3, 4] },
      { title: 'Act Two', synopsis: null, scenes: [5, 6, 7, 8, 9] },
      { title: 'Act Three', synopsis: null, scenes: [10, 11, 12, 13] },
    ]);
    const dir = tempFolder();
    put(
      join(dir, 'Lib', 'acts.fountain'),
      '# Act One\n\n= The farm. [[secret]]\n\nINT. FARM - DAY\n\nHay.\n\n# Act Two\n\nINT. BARN - NIGHT\n\n= Fire. [[hidden]]\n\nSmoke.\n',
    );
    await open?.close();
    open = undefined;
    const acts = await overview([join(dir, 'Lib')], { script: 'Lib/acts.fountain' });
    expect(acts.acts).toEqual([
      { title: 'Act One', synopsis: 'The farm.', scenes: [1] },
      { title: 'Act Two', synopsis: null, scenes: [2] },
    ]);
    expect(acts.scenes[1]?.synopsis).toBe('Fire.');
    expect(JSON.stringify(acts)).not.toContain('secret');
    const included = answerOf<Overview>(
      await (open as unknown as Connected).call('script_overview', {
        script: 'Lib/acts.fountain',
        include: ['notes'],
      }),
    );
    expect(included.acts[0]?.synopsis).toBe('The farm. [[secret]]');
  });

  it('characters with share, absences, and most often with', async () => {
    const { scripts } = makeLibrary(tempFolder());
    const got = await overview([scripts], { script: EP101 });
    const characters = got.characters ?? [];
    const june = characters.find((c) => c.name === 'JUNE');
    expect(june).toMatchObject({ first: 1, last: 13, absences: [] });
    expect(june?.speeches).toBeGreaterThan(10);
    expect(june?.with).toHaveLength(3);
    expect(june?.with).toContain('ELI');
    expect(characters.reduce((sum, c) => sum + c.share, 0)).toBe(100);
    for (const c of characters) expect(Number.isInteger(c.share)).toBe(true);
    const wes = characters.find((c) => c.name === 'WES');
    expect(wes).toMatchObject({ first: 3 });
    expect(got.places?.find((p) => p.name === 'SIGNAL HILL')).toEqual({
      name: 'SIGNAL HILL',
      scenes: 3,
    });

    // A long absence: twenty pages away and back.
    const dir = tempFolder();
    const filler = Array.from(
      { length: 40 },
      (_, i) => `INT. ROOM ${i} - DAY\n\n${'Bob waits. '.repeat(250)}\n\nBOB\nStill here.\n`,
    ).join('\n');
    put(
      join(dir, 'Lib', 'away.fountain'),
      `INT. DOCK - DAY\n\nANN\nI'm going.\n\n${filler}\nINT. DOCK - NIGHT\n\nANN\nI'm back.\n`,
    );
    await open?.close();
    open = undefined;
    const away = await overview([join(dir, 'Lib')], { script: 'Lib/away.fountain' });
    const ann = away.characters?.find((c) => c.name === 'ANN');
    expect(ann?.absences).toHaveLength(1);
    expect(ann?.absences[0]).toMatchObject({ after: 1, before: 42 });
    expect(ann?.absences[0]?.pages).toBeGreaterThanOrEqual(20);
  });

  it('gaps and the to-do count, never its text', async () => {
    const dir = tempFolder();
    put(
      join(dir, 'Lib', 'gaps.fountain'),
      '# Act One\n\nINT. FARM - DAY\n\nHay. [[TODO: the gull speech]] [[TODO: and the hat #todo]]\n\nINT. BARN - NIGHT\n\n= Fire.\n\n# Act Two\n\n# Act Three\n\nINT. HILL - DAY\n\nWind. [[done #todo #resolved]]\n',
    );
    const got = await overview([join(dir, 'Lib')], { script: 'Lib/gaps.fountain' });
    expect(got.gaps).toEqual({
      empty_acts: [2],
      planned_scenes: [2],
      todos: 2,
      pages_to_write: null,
    });
    expect(JSON.stringify(got)).not.toContain('gull');
    expect(got.left_out.notes).toBe(3);

    const planned = tempFolder();
    put(
      join(planned, 'Lib', 'p.fountain'),
      `INT. FARM - DAY\n\nHay.\n\n/* drafter\n{"v":1,"storyMap":{"plannedPages":90}}\n*/\n`,
    );
    await open?.close();
    open = undefined;
    const more = await overview([join(planned, 'Lib')], { script: 'Lib/p.fountain' });
    expect(more.gaps.pages_to_write).toBe(89);
    expect(JSON.stringify(more)).not.toContain('plannedPages');
  });

  it('a count of problems', async () => {
    const dir = tempFolder();
    put(join(dir, 'Lib', 'bad.fountain'), 'INT. FARM - DAY\n\nHay. /* never closed\n');
    const got = await overview([join(dir, 'Lib')], { script: 'Lib/bad.fountain' });
    expect(got.problems).toBeGreaterThan(0);
  });

  it('150 scenes a page, and the next cursor gives the rest', async () => {
    const dir = tempFolder();
    put(join(dir, 'Lib', 'long.fountain'), buildScript(300 * 1_000));
    const first = await overview([join(dir, 'Lib')], { script: 'Lib/long.fountain' });
    // The first page carries the characters and places too, so it may hold fewer.
    expect(first.scenes.length).toBeGreaterThan(50);
    expect(first.scenes.length).toBeLessThanOrEqual(150);
    expect(first.characters?.length).toBeGreaterThan(0);
    expect(first.next).toBeDefined();
    const seen = [...first.scenes.map((s) => s.n)];
    let cursor = first.next;
    let pages = 1;
    const sizes: number[] = [];
    while (cursor && pages < 20) {
      const page = answerOf<Overview>(
        await (open as Connected).call('script_overview', { script: 'Lib/long.fountain', cursor }),
      );
      expect(page.restarted).toBeUndefined();
      expect(page.characters).toBeUndefined();
      expect(page.places).toBeUndefined();
      expect(page.scenes.length).toBeLessThanOrEqual(150);
      sizes.push(page.scenes.length);
      seen.push(...page.scenes.map((s) => s.n));
      cursor = page.next;
      pages++;
    }
    expect(sizes[0]).toBe(150);
    expect(seen.length).toBeGreaterThanOrEqual(300);
    // Every place (one a scene here), or the most visited and a count of the rest.
    expect((first.places?.length ?? 0) + (first.places_more ?? 0)).toBe(seen.length);
    expect(seen).toEqual(seen.map((_, i) => i + 1));
  });

  it('every page is under 40,000 characters', async () => {
    const dir = tempFolder();
    // Long headings: the size cap, not the 150, ends each page.
    const text = Array.from(
      { length: 400 },
      (_, i) =>
        `INT. ${'VERY LONG PLACE NAME '.repeat(8)}${i} - DAY\n\n= ${'A long synopsis. '.repeat(10)}\n\nAction.\n`,
    ).join('\n');
    put(join(dir, 'Lib', 'wide.fountain'), text);
    open = await connect({ folders: [join(dir, 'Lib')] });
    let cursor: string | undefined;
    let total = 0;
    let pages = 0;
    do {
      const result = await open.call('script_overview', {
        script: 'Lib/wide.fountain',
        ...(cursor ? { cursor } : {}),
      });
      expect((result.content[0] as { text: string }).text.length).toBeLessThanOrEqual(
        MAX_ANSWER_CHARS,
      );
      const page = answerOf<Overview>(result);
      total += page.scenes.length;
      cursor = page.next;
      pages++;
    } while (cursor && pages < 50);
    expect(total).toBe(400);
    expect(pages).toBeGreaterThan(3);
  });

  it('a huge synopsis, heading, and title page are cut, and every page stays under the cap', async () => {
    const dir = tempFolder();
    const big = (word: string, n: number) => Array.from({ length: n }, () => word).join(' ');
    const scenes = Array.from(
      { length: 200 },
      (_, i) =>
        `INT. ${big('HALL', 400)} ${i} - DAY\n\n= ${big('synopsis', i === 0 ? 12_000 : 300)}\n\n${big('JUNE', 1)}\nHello.\n`,
    ).join('\n');
    put(
      join(dir, 'Lib', 'huge.fountain'),
      `Title: ${big('Signal', 10_000)}\nAuthor: ${big('Writer', 10_000)}\nDraft date: ${big('Today', 10_000)}\n\n# ${big('Act', 3_000)}\n\n= ${big('act', 20_000)}\n\n${scenes}`,
    );
    open = await connect({ folders: [join(dir, 'Lib')] });
    let cursor: string | undefined;
    let total = 0;
    let pages = 0;
    do {
      const result = await open.call('script_overview', {
        script: 'Lib/huge.fountain',
        ...(cursor ? { cursor } : {}),
      });
      expect((result.content[0] as { text: string }).text.length).toBeLessThanOrEqual(
        MAX_ANSWER_CHARS,
      );
      const page = answerOf<
        Overview & {
          title_page_cut?: true;
          acts: Array<{ synopsis_cut?: true }>;
          scenes: Array<Scene & { synopsis_cut?: true; heading_cut?: true }>;
        }
      >(result);
      expect(page.title_page_cut).toBe(true);
      expect(page.title_page.Title?.startsWith('Signal Signal')).toBe(true);
      expect(page.acts[0]?.synopsis_cut).toBe(true);
      for (const scene of page.scenes) {
        expect(scene.synopsis_cut).toBe(true);
        expect(scene.synopsis?.startsWith('synopsis synopsis')).toBe(true);
        expect(scene.heading_cut).toBe(true);
      }
      total += page.scenes.length;
      cursor = page.next;
      pages++;
    } while (cursor && pages < 200);
    expect(total).toBe(200);
  });

  it('a stage play’s scenes and acts', async () => {
    const { plays } = makeLibrary(tempFolder());
    const got = await overview([plays], { script: 'Plays/The Long Watch.fountain' });
    expect(got.template).toBe('stage-play-standard');
    expect(got.scenes.map((s) => s.heading)).toEqual(['Scene 1', 'Scene 2', 'Scene 3']);
    expect(got.acts.map((a) => a.scenes)).toEqual([[1, 2], [3]]);
    expect(PLAY).toContain('Margit');
  });

  it('a Markdown document is a title and sections', async () => {
    const { scripts } = makeLibrary(tempFolder());
    open = await connect({ folders: [scripts] });
    const got = answerOf<Record<string, unknown>>(
      await open.call('script_overview', { script: 'Scripts/Signal Hill/Series bible.md' }),
    );
    expect(got).toEqual({
      about: expect.any(String),
      title: 'Signal Hill: the bible',
      sections: [
        { n: 1, title: 'Signal Hill: the bible', words: 4 },
        { n: 2, title: 'June', words: 9 },
        { n: 3, title: 'Eli', words: 6 },
      ],
      words: 19,
      left_out: { notes: 0, boneyard: 0 },
    });
  });
});
