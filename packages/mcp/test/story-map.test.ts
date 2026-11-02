import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { DEFAULT_WORDS_PER_MINUTE } from '@drafter/outline';
import { buildStoryMap, type StoryMap, storyMapMeta } from '@drafter/story-map';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, describe, expect, it } from 'vitest';
import { ABOUT, MAX_ANSWER_CHARS } from '../src/envelope';
import { answerOf, type Connected, connect, refusalOf } from './connect';
import { EPISODE_101, EPISODE_102, makeLibrary } from './library';
import { put, tempFolder } from './temp';

type Answer = StoryMap & { about: string; next?: string; restarted?: true };

const SCREENPLAY = builtins['us-screenplay'] as Template;
const EP101 = `Scripts/Signal Hill/${EPISODE_101}`;
const EP102 = `Scripts/Signal Hill/${EPISODE_102}`;

let open: Connected | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
});

const storyMap = async (args: object) =>
  answerOf<Answer>(await (open as Connected).call('story_map', args));

async function library(): Promise<string> {
  const { scripts } = makeLibrary(tempFolder());
  open = await connect({ folders: [scripts] });
  return scripts;
}

/** The title page's field, its lines joined by spaces. */
function field(text: string, key: string): string {
  const doc = parse(text);
  const found = doc.titlePage?.fields.find((f) => f.key.toLowerCase() === key);
  return (found?.runs ?? [])
    .map((runs) =>
      runs
        .map((r) => r.text)
        .join('')
        .trim(),
    )
    .filter((line) => line !== '')
    .join(' ');
}

describe('story_map', () => {
  it('the model equals the story map’s for 101', async () => {
    const scripts = await library();
    const got = await storyMap({ script: EP101 });
    const path = join(scripts, 'Signal Hill', EPISODE_101);
    const text = readFileSync(path, 'utf8');
    const doc = parse(text);
    const meta = storyMapMeta(doc.meta);
    const logline = field(text, 'logline');
    const map = buildStoryMap({
      doc,
      template: SCREENPLAY,
      layout: paginate(doc, SCREENPLAY),
      options: {
        status: null,
        plannedPages: meta.plannedPages,
        logline: logline === '' ? null : logline,
        greeting: "What I'm writing",
        explain: null,
        include: { summaries: true, lines: true, threads: true, contact: false },
        contact: null,
        hooks: meta.hooks,
        rates: { minutesPerPage: 1, wordsPerMinute: DEFAULT_WORDS_PER_MINUTE },
        draft: { number: 1, id: createHash('sha256').update(text).digest('hex') },
        updated: statSync(path).mtimeMs,
        title: field(text, 'title'),
      },
    });
    const { about, ...model } = got;
    expect(about).toBe(ABOUT);
    expect(model).toEqual(JSON.parse(JSON.stringify(map)));
    expect(got.scenes).toHaveLength(13);
    expect(got.acts).toHaveLength(3);
    expect(got.writer).toEqual({ name: 'A. Writer', initials: expect.any(String) });
  });

  it('contact is never there', async () => {
    await library();
    const got = await storyMap({ script: EP102 });
    expect(got.contact).toBeNull();
    expect(JSON.stringify(got)).not.toContain('Hollow Creek');
    expect(JSON.stringify(got)).not.toContain('<');
  });

  it('finished drops planned scenes', async () => {
    const dir = tempFolder();
    put(
      join(dir, 'Plan', 'Plan.fountain'),
      `INT. QUARRY - DAY

Rain fills the quarry, one drop at a time.

NELL
It'll be a lake by spring.

EXT. QUARRY ROAD - NIGHT

= Nell drives away. Still to write.

INT. DINER - NIGHT

Nell orders pie she won't eat.

NELL
Just the coffee, then.
`,
    );
    open = await connect({ folders: [join(dir, 'Plan')] });
    const going = await storyMap({ script: 'Plan/Plan.fountain' });
    expect(going.status).toBe('in-progress');
    expect(going.scenes).toHaveLength(3);
    expect(going.scenes[1]?.planned).toBe(true);
    const done = await storyMap({ script: 'Plan/Plan.fountain', status: 'finished' });
    expect(done.status).toBe('finished');
    expect(done.scenes).toHaveLength(2);
    expect(done.scenes.every((s) => !s.planned)).toBe(true);
    const back = await storyMap({ script: 'Plan/Plan.fountain', status: 'in-progress' });
    expect(back.scenes).toHaveLength(3);
  });

  it('a long script is paged by act', async () => {
    const dir = tempFolder();
    const act = (name: string, from: number) =>
      `# ${name}\n\n${Array.from(
        { length: 160 },
        (_, i) =>
          `INT. ROOM ${from + i} - DAY\n\n= A summary of scene ${from + i}.\n\nWren looks at the clock.\n\nWREN\nNot yet.\n`,
      ).join('\n')}`;
    put(
      join(dir, 'Long', 'Long.fountain'),
      [act('Act One', 1), act('Act Two', 161), act('Act Three', 321)].join('\n'),
    );
    open = await connect({ folders: [join(dir, 'Long')] });
    const pages: Answer[] = [];
    let page = await storyMap({ script: 'Long/Long.fountain' });
    for (;;) {
      expect(JSON.stringify(page).length).toBeLessThanOrEqual(MAX_ANSWER_CHARS);
      pages.push(page);
      if (!page.next) break;
      page = await storyMap({ script: 'Long/Long.fountain', cursor: page.next });
    }
    expect(pages.length).toBeGreaterThan(1);
    // The rest of the model is on the first page only.
    expect(pages[0]?.characters.length).toBeGreaterThan(0);
    for (const later of pages.slice(1)) {
      expect(later.characters).toBeUndefined();
      expect(later.title).toBeUndefined();
    }
    // Every scene once, in order, each with its act on the same page.
    const scenes = pages.flatMap((p) => p.scenes);
    expect(scenes.map((s) => s.n)).toEqual(Array.from({ length: 480 }, (_, i) => i + 1));
    for (const p of pages)
      for (const s of p.scenes) expect(p.acts.map((a) => a.n)).toContain(s.act);
    expect(new Set(pages.flatMap((p) => p.acts.map((a) => a.n)))).toEqual(new Set([1, 2, 3]));
  });

  it('a document has no story map', async () => {
    await library();
    const bible = await (open as Connected).call('story_map', {
      script: 'Scripts/Signal Hill/Series bible.md',
    });
    expect(refusalOf(bible).error).toBe('A story map is for a screenplay or a stage play.');
  });
});
