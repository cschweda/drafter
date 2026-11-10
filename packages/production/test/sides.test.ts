import { parse, type TextChange } from '@drafter/fountain';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { lock } from '../src/actions';
import { productionLayout } from '../src/layout';
import { scenesFor, sides, sidesChoices } from '../src/sides';

const screenplay = builtins['us-screenplay'] as Template;
const play = builtins['stage-play-standard'] as Template;

const filler = (n: number, word: string) =>
  Array.from({ length: n }, (_, i) => `${word} paragraph ${i + 1} of the scene goes on.`).join(
    '\n\n',
  );

/** Scenes 1..5: MARGARET speaks in 1 and 4, is named in 3, is absent from 2 and 5. */
const SCRIPT = [
  'INT. HALL - DAY',
  '',
  'MARGARET',
  'Hello there.',
  '',
  'INT. KITCHEN - DAY',
  '',
  filler(14, 'Kitchen'),
  '',
  'INT. STAIRS - DAY',
  '',
  'Jon looks up at MARGARET on the landing.',
  '',
  filler(10, 'Stairs'),
  '',
  'INT. ATTIC - NIGHT',
  '',
  'MARGARET',
  'Is anyone up here?',
  '',
  filler(10, 'Attic'),
  '',
  'EXT. YARD - NIGHT',
  '',
  filler(12, 'Yard'),
  '',
].join('\n');

async function laidOut(source: string, template = screenplay) {
  const { layout } = await productionLayout(source, template, {
    sceneNumbers: 'none',
    titlePage: 'none',
    marks: 'open',
  });
  return layout;
}

describe('scenesFor', () => {
  it('ticks the character’s scenes: where they speak and where they are named', () => {
    const doc = parse(SCRIPT);
    expect(scenesFor(doc, screenplay, ['MARGARET'])).toEqual([1, 3, 4]);
    expect(scenesFor(doc, screenplay, ['margaret'])).toEqual([1, 3, 4]);
    expect(scenesFor(doc, screenplay, ['NOBODY'])).toEqual([]);
  });
});

describe('sides', () => {
  it('spans pages and crosses out only the other scenes’ lines', async () => {
    const doc = parse(SCRIPT);
    const layout = await laidOut(SCRIPT);
    expect(layout.pages.length).toBeGreaterThan(2);
    const out = sides(layout, doc, screenplay, [1, 4]);
    // Every page holding scene 1 or 4's lines, in order, at their own numbers.
    const kept = out.layout.pages.map((p) => p.number);
    expect(kept).toEqual([...kept].sort((a, b) => a - b));
    expect(kept.length).toBeLessThan(layout.pages.length);
    expect(kept[0]).toBe(1);
    expect(out.crossOut.length).toBeGreaterThan(0);
    const text = (page: number, from: number, to: number) =>
      out.layout.pages
        .find((p) => p.number === page)
        ?.lines.slice(from, to + 1)
        .map((l) => l.runs.map((r) => r.text).join(''))
        .join('\n');
    for (const range of out.crossOut) {
      expect(kept).toContain(range.page);
      const crossed = text(range.page, range.from, range.to) ?? '';
      expect(crossed).not.toMatch(/Hello there|Is anyone up here/);
      expect(crossed.trim()).not.toBe('');
    }
    const all = out.crossOut.map((r) => text(r.page, r.from, r.to)).join('\n');
    expect(all).toContain('Kitchen paragraph 1');
    expect(all).toContain('Stairs paragraph 1');
  });

  it('crosses out exact runs: the unticked run ends just before a ticked heading, which is kept', async () => {
    const doc = parse(SCRIPT);
    const layout = await laidOut(SCRIPT);
    const out = sides(layout, doc, screenplay, [1, 4]);
    const lineText = (page: number, k: number) =>
      out.layout.pages
        .find((p) => p.number === page)
        ?.lines[k]?.runs.map((r) => r.text)
        .join('') ?? '';
    // Where scene 4's heading is printed, on the pages kept.
    let heading: { page: number; line: number } | undefined;
    for (const page of out.layout.pages) {
      page.lines.forEach((l, k) => {
        if (l.runs.map((r) => r.text).join('') === 'INT. ATTIC - NIGHT') {
          heading = { page: page.number, line: k };
        }
      });
    }
    expect(heading).toBeDefined();
    const at = heading as { page: number; line: number };
    // The heading is in no crossed range, and the range before it ends in the unticked scene's text.
    const hit = out.crossOut.filter(
      (r) => r.page === at.page && r.from <= at.line && at.line <= r.to,
    );
    expect(hit).toEqual([]);
    const before = out.crossOut.filter((r) => r.page === at.page && r.to < at.line);
    expect(before.length).toBeGreaterThan(0);
    const run = before.at(-1) as CrossOut;
    expect(lineText(run.page, run.to)).toMatch(/Stairs paragraph \d+ of the scene/);
    // Only blank lines lie between the run and the heading.
    for (let k = run.to + 1; k < at.line; k++) expect(lineText(at.page, k).trim()).toBe('');
    // Every range starts and ends on a line with text, and no two on a page touch or overlap.
    for (const r of out.crossOut) {
      expect(lineText(r.page, r.from).trim()).not.toBe('');
      expect(lineText(r.page, r.to).trim()).not.toBe('');
    }
  });

  it('crosses out nothing when every scene is ticked, and keeps every page', async () => {
    const doc = parse(SCRIPT);
    const layout = await laidOut(SCRIPT);
    const out = sides(layout, doc, screenplay, [1, 2, 3, 4, 5]);
    expect(out.crossOut).toEqual([]);
    expect(out.layout.pages).toHaveLength(layout.pages.length);
  });

  it('keeps the locked labels of the pages it prints, an A-page and a folded range too', async () => {
    const apply = (text: string, changes: readonly TextChange[]) => {
      let out = text;
      for (const c of [...changes].sort((a, b) => b.from - a.from)) {
        out = out.slice(0, c.from) + c.insert + out.slice(c.to);
      }
      return out;
    };
    const scene = (n: number, count: number) =>
      `INT. ROOM ${n} - DAY\n\n${filler(count, `Room${n}`)}\n\n`;
    const base = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => scene(n, 30)).join('');
    const locked = apply(
      base,
      await lock(base, screenplay, { today: '2026-11-09', draftId: 'd1', firstScene: 1 }),
    );
    // Room 2 grows by pages (A-pages), and Rooms 4 to 7 go whole (a folded label).
    const grown = locked.replace(
      'INT. ROOM 3 - DAY',
      `${filler(20, 'Extra')}\n\nINT. ROOM 3 - DAY`,
    );
    const lines = grown.split('\n');
    const start = lines.findIndex((l) => l.startsWith('INT. ROOM 4'));
    const end = lines.findIndex((l) => l.startsWith('INT. ROOM 8'));
    const edited = [...lines.slice(0, start), ...lines.slice(end)].join('\n');
    const layout = await laidOut(edited);
    const labels = layout.pages.map((p) => p.label);
    expect(labels.some((l) => /^\d+[A-Z]+$/.test(l))).toBe(true);
    expect(labels.some((l) => l.includes('-'))).toBe(true);
    const doc = parse(edited);
    const out = sides(layout, doc, screenplay, [2, 3, 4]);
    const wanted = new Map(layout.pages.map((p) => [p.number, p.label]));
    expect(out.layout.pages.length).toBeGreaterThan(0);
    for (const page of out.layout.pages) expect(page.label).toBe(wanted.get(page.number));
    const kept = out.layout.pages.map((p) => p.label);
    expect(kept.some((l) => /^\d+[A-Z]+$/.test(l))).toBe(true);
    expect(kept.some((l) => l.includes('-'))).toBe(true);
  });

  it('a stage play’s sides work by ## scene', async () => {
    const source = [
      '## Scene One',
      '',
      '@MARGARET',
      'Good evening.',
      '',
      filler(8, 'Parlour'),
      '',
      '## Scene Two',
      '',
      '@JON',
      'Not at all.',
      '',
      filler(30, 'Garden'),
      '',
    ].join('\n');
    const doc = parse(source);
    expect(scenesFor(doc, play, ['MARGARET'])).toEqual([1]);
    const layout = await laidOut(source, play);
    const out = sides(layout, doc, play, [1]);
    expect(out.layout.pages.length).toBeGreaterThan(0);
    expect(out.layout.pages.length).toBeLessThanOrEqual(layout.pages.length);
    expect(out.crossOut.length).toBeGreaterThan(0);
  });
});

describe('a stage play’s act headings', () => {
  it('go with the scene they open, not the one before', async () => {
    const source = [
      '# ACT ONE',
      '',
      '## Scene One',
      '',
      '@MARGARET',
      'Good evening.',
      '',
      '## Scene Two',
      '',
      filler(6, 'Parlour'),
      '',
      '# ACT TWO',
      '',
      '## Scene Three',
      '',
      '@JON',
      'Morning.',
      '',
    ].join('\n');
    const doc = parse(source);
    const layout = await laidOut(source, play);
    // Scene Three ticked, Scene Two not: ACT TWO is kept; with Scene Two ticked instead it is crossed out.
    const find = (out: ReturnType<typeof sides>, needle: string) => {
      for (const page of out.layout.pages) {
        for (const [k, l] of page.lines.entries()) {
          if (
            l.runs
              .map((r) => r.text)
              .join('')
              .includes(needle)
          )
            return { page: page.number, k };
        }
      }
      return undefined;
    };
    const crossed = (out: ReturnType<typeof sides>, at: { page: number; k: number }) =>
      out.crossOut.some((r) => r.page === at.page && r.from <= at.k && at.k <= r.to);
    const three = sides(layout, doc, play, [3]);
    const act = find(three, 'ACT TWO');
    expect(act).toBeDefined();
    expect(crossed(three, act as { page: number; k: number })).toBe(false);
    const two = sides(layout, doc, play, [2]);
    const act2 = find(two, 'ACT TWO');
    expect(act2).toBeDefined();
    expect(crossed(two, act2 as { page: number; k: number })).toBe(true);
  });
});

describe('sidesChoices', () => {
  it('lists the characters with their scenes, and each scene by number or ordinal', () => {
    const doc = parse(SCRIPT);
    const found = sidesChoices(doc, screenplay);
    expect(found.characters.find((c) => c.name === 'MARGARET')?.scenes).toEqual([1, 3, 4]);
    expect(found.scenes.map((s) => s.label)).toEqual(['1', '2', '3', '4', '5']);
    expect(found.scenes[0]).toMatchObject({ ordinal: 1, heading: 'INT. HALL - DAY' });
  });

  it('uses a scene’s locked number and leaves out an omitted scene', () => {
    const doc = parse(
      [
        'INT. A - DAY #4#',
        '',
        'Text.',
        '',
        '.OMITTED #5#',
        '',
        'INT. B - DAY #12A#',
        '',
        'More.',
      ].join('\n'),
    );
    const found = sidesChoices(doc, screenplay);
    expect(found.scenes.map((s) => s.label)).toEqual(['4', '12A']);
  });
});
