import { readFileSync } from 'node:fs';
import { parse, type TextChange } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import {
  clearMarks,
  lock,
  omitScene,
  scriptText,
  startNextSet,
  unlock,
  writeSceneNumbers,
} from '../src/actions';
import { resolveAnchors } from '../src/anchors';
import { decodeBaseline } from '../src/baseline';
import { readProduction } from '../src/block';
import { productionMarks } from '../src/marks';
import { pageMapOf } from '../src/pages';

const screenplay = builtins['us-screenplay'] as Template;
const stagePlay = builtins['stage-play-standard'] as Template;
const sample = (name: string) =>
  readFileSync(new URL(`../../../samples/${name}`, import.meta.url), 'utf8');
const SCREENPLAY = sample('screenplay.fountain');
const STAGE_PLAY = sample('stage-play.fountain');

const today = '2026-11-09';
const draftId = 'a'.repeat(64);

/** Applies changes given against `text`; they must be sorted and must not overlap. */
function apply(text: string, changes: readonly TextChange[]): string {
  let out = '';
  let at = 0;
  for (const c of changes) {
    expect(c.from).toBeGreaterThanOrEqual(at);
    expect(c.to).toBeGreaterThanOrEqual(c.from);
    out += text.slice(at, c.from) + c.insert;
    at = c.to;
  }
  return out + text.slice(at);
}

const productionOf = (text: string) => readProduction(parse(text).meta);
const headings = (text: string) =>
  parse(text)
    .blocks.filter((b) => b.kind === 'scene_heading')
    .map((b) => b.lines[0]?.raw.trim());

/** The sample with one written number and a third scene added at the end. */
const WITH_SEVEN = `${SCREENPLAY.replace('EXT. BACK PORCH - LATER', 'EXT. BACK PORCH - LATER #7#')}\nINT. HALL - NIGHT\n\nShe waits.\n`;

async function locked(text = SCREENPLAY, firstScene = 1): Promise<string> {
  return apply(text, await lock(text, screenplay, { today, draftId, firstScene }));
}

/** Insert `added` before the first occurrence of `before`. */
const insertBefore = (text: string, before: string, added: string) =>
  text.replace(before, `${added}${before}`);

describe('scriptText', () => {
  it('drops the drafter block and nothing else', () => {
    const text = 'INT. A - DAY\n\nHi.\n\n/* drafter\n{"v":1}\n*/\n';
    expect(scriptText(text)).toBe('INT. A - DAY\n\nHi.\n\n\n');
    expect(scriptText('INT. A - DAY\n')).toBe('INT. A - DAY\n');
  });
});

describe('pageMapOf', () => {
  it('records each body page by its label and its first printed source line', () => {
    const layout = paginate(parse(SCREENPLAY), screenplay);
    const pages = pageMapOf(layout, SCREENPLAY);
    const body = layout.pages.filter((p) => p.number > 0);
    expect(pages.map((p) => p.label)).toEqual(body.map((p) => String(p.number)));
    const lines = SCREENPLAY.split('\n');
    // Page 1 starts at the first printed line of the script: Act One's heading is a section, so
    // the first scene heading.
    expect(lines[pages[0]?.line as number]).toBe('INT. KITCHEN - NIGHT');
    expect(pages[0]?.printed).toBe(0);
  });

  it('counts the printed lines of a paragraph that a page break splits', () => {
    const long = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
    const paragraph = Array.from({ length: 12 }, () => long).join(' ');
    const text = `INT. ROOM - DAY\n\n${paragraph}\n\nThe end.\n`;
    const layout = paginate(parse(text), screenplay);
    const pages = pageMapOf(layout, text);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages[1]?.line).toBe(2);
    expect(pages[1]?.printed).toBeGreaterThan(0);
  });

  it('lays the same text out on the same pages when resolved against itself', () => {
    const long = Array.from({ length: 900 }, (_, i) => `word${i}`).join(' ');
    const text = `${SCREENPLAY}\n${long}\n\nINT. HALL - NIGHT\n\nShe waits.\n`;
    const layout = paginate(parse(text), screenplay);
    const { anchors, dropped } = resolveAnchors(pageMapOf(layout, text), text, text);
    expect(dropped).toEqual([]);
    expect(paginate(parse(text), screenplay, { locked: { anchors, folded: [] } })).toEqual(layout);
  });
});

describe('lock', () => {
  it('lock numbers scenes from firstScene and keeps written numbers', async () => {
    const after = await locked(WITH_SEVEN, 101);
    expect(headings(after)).toEqual([
      'INT. KITCHEN - NIGHT #101#',
      'EXT. BACK PORCH - LATER #7#',
      'INT. HALL - NIGHT #102#',
    ]);
    const production = productionOf(after);
    expect(production?.firstScene).toBe(101);
    expect(production?.lockedAt).toBe(today);
    expect(production?.numbers).toEqual(['101', '7', '102']);
    expect(production?.pages.length).toBeGreaterThan(0);
    expect(production?.pages[0]?.label).toBe('1');
  });

  it('numbers an unnumbered heading past the written number before it', async () => {
    const after = await locked(WITH_SEVEN, 1);
    expect(headings(after)).toEqual([
      'INT. KITCHEN - NIGHT #1#',
      'EXT. BACK PORCH - LATER #7#',
      'INT. HALL - NIGHT #8#',
    ]);
    expect(productionOf(after)?.numbers).toEqual(['1', '7', '8']);
  });

  it('lock opens Blue against the locked text', async () => {
    const after = await locked();
    const production = productionOf(after);
    expect(production?.sets.map((s) => s.name)).toEqual(['White', 'Blue']);
    const [white, blue] = production?.sets ?? [];
    expect(white).toMatchObject({ date: today, draft: draftId, lines: [], gaps: [] });
    expect(blue).toMatchObject({ date: today, draft: draftId });
    expect(blue?.lines).toBeUndefined();
    const baseline = await decodeBaseline(production?.baseline as string);
    expect(baseline).toBe(scriptText(after));
    // Nothing is marked until the writer edits.
    const none = await productionMarks({
      current: scriptText(after),
      baseline: baseline as string,
      open: 'Blue',
      closed: [],
    });
    expect(none.spans).toEqual([]);
    const edited = scriptText(after).replace('cleaner than it needs to be', 'spotless');
    const some = await productionMarks({
      current: edited,
      baseline: baseline as string,
      open: 'Blue',
      closed: [],
    });
    expect(some.spans.map((s) => edited.slice(s.from, s.to))).toEqual(['spotless']);
  });

  it('a stage play is locked without scene numbers', async () => {
    const changes = await lock(STAGE_PLAY, stagePlay, { today, draftId, firstScene: 1 });
    const after = apply(STAGE_PLAY, changes);
    // Only the block changes: the sample's own block, which keeps its template.
    expect(changes).toHaveLength(1);
    expect(scriptText(after)).toBe(scriptText(STAGE_PLAY));
    expect(parse(after).meta?.template).toBe('stage-play-standard');
    const production = productionOf(after);
    expect(production?.numbers).toEqual([]);
    expect(production?.pages.length).toBeGreaterThan(0);
  });

  it('does not lock a script twice', async () => {
    const after = await locked();
    expect(await lock(after, screenplay, { today, draftId, firstScene: 1 })).toEqual([]);
  });
});

describe('startNextSet', () => {
  it('startNextSet closes Blue with its marks and opens Pink', async () => {
    const after = await locked(SCREENPLAY, 1);
    let edited = after.replace('cleaner than it needs to be', 'spotless');
    edited = insertBefore(
      edited,
      'EXT. BACK PORCH - LATER',
      'INT. HALLWAY - NIGHT\n\nShe listens.\n\n',
    );
    const changes = await startNextSet(edited, '2026-11-12', 'b'.repeat(64));
    const next = apply(edited, changes);
    expect(headings(next)).toEqual([
      'INT. KITCHEN - NIGHT #1#',
      'INT. HALLWAY - NIGHT #1A#',
      'EXT. BACK PORCH - LATER #2#',
    ]);
    const production = productionOf(next);
    expect(production?.numbers).toEqual(['1', '1A', '2']);
    expect(production?.sets.map((s) => s.name)).toEqual(['White', 'Blue', 'Pink']);
    const [, blue, pink] = production?.sets ?? [];
    expect(blue?.lines?.length).toBeGreaterThanOrEqual(3);
    expect(pink).toMatchObject({ date: '2026-11-12', draft: 'b'.repeat(64) });
    expect(pink?.lines).toBeUndefined();
    expect(await decodeBaseline(production?.baseline as string)).toBe(scriptText(next));
    // Blue's marks survive in its fingerprints; Pink has none yet.
    const marks = await productionMarks({
      current: scriptText(next),
      baseline: scriptText(next),
      open: 'Pink',
      closed: production?.sets.slice(0, -1) ?? [],
    });
    const marked = marks.spans.map((s) => scriptText(next).slice(s.from, s.to));
    expect(marked).toContain('INT. HALLWAY - NIGHT #1A#');
    expect(marks.spans.every((s) => s.set === 'Blue')).toBe(true);
    // Page 1 is pinned to the top of the script (Ruling 27).
    expect(production?.pages[0]).toMatchObject({ label: '1', line: 0, printed: 0 });
  });

  it('a stage play starts its next set without numbering anything', async () => {
    const after = apply(
      STAGE_PLAY,
      await lock(STAGE_PLAY, stagePlay, { today, draftId, firstScene: 1 }),
    );
    const edited = after.replace('A kitchen, late at night.', 'A kitchen, very late.');
    const next = apply(edited, await startNextSet(edited, today, draftId));
    expect(scriptText(next)).toBe(scriptText(edited));
    expect(productionOf(next)?.sets.map((s) => s.name)).toEqual(['White', 'Blue', 'Pink']);
  });
});

describe('writeSceneNumbers', () => {
  it('writes A-numbers and records them', async () => {
    const after = await locked(SCREENPLAY, 1);
    const edited = insertBefore(after, 'INT. KITCHEN', 'EXT. STREET - NIGHT\n\nRain.\n\n');
    const next = apply(edited, await writeSceneNumbers(edited));
    expect(headings(next)).toEqual([
      'EXT. STREET - NIGHT #A1#',
      'INT. KITCHEN - NIGHT #1#',
      'EXT. BACK PORCH - LATER #2#',
    ]);
    const production = productionOf(next);
    expect(production?.numbers).toEqual(['A1', '1', '2']);
    // The baseline is the open set's and stays as it was.
    expect(production?.baseline).toBe(productionOf(after)?.baseline);
    expect(await writeSceneNumbers(next)).toEqual([]);
  });
});

describe('issued numbers', () => {
  it('never revive: a deleted 1A is not given out again', async () => {
    const after = await locked(SCREENPLAY, 1);
    const added = insertBefore(after, 'EXT. BACK', 'INT. HALL - NIGHT\n\nShe listens.\n\n');
    const numbered = apply(added, await writeSceneNumbers(added));
    expect(headings(numbered)).toContain('INT. HALL - NIGHT #1A#');
    // The writer deletes the 1A heading by hand, then adds another scene in the same place.
    const deleted = numbered.replace('INT. HALL - NIGHT #1A#\n\n', '');
    const again = insertBefore(deleted, 'EXT. BACK', 'INT. ATTIC - DAY\n\nDust.\n\n');
    const next = apply(again, await writeSceneNumbers(again));
    expect(headings(next)).toEqual([
      'INT. KITCHEN - NIGHT #1#',
      'INT. ATTIC - DAY #1B#',
      'EXT. BACK PORCH - LATER #2#',
    ]);
    expect(productionOf(next)?.numbers).toEqual(['1', '1A', '1B', '2']);
  });
});

describe('omitScene', () => {
  it('omitScene leaves .OMITTED #12# and returns the scene', async () => {
    const after = await locked(SCREENPLAY, 12);
    const { changes, removed } = await omitScene(after, 0, screenplay);
    const next = apply(after, changes);
    expect(removed.startsWith('INT. KITCHEN - NIGHT #12#\n')).toBe(true);
    expect(removed.endsWith('\n\n')).toBe(true);
    expect(removed).not.toContain('BACK PORCH');
    expect(next).toBe(after.replace(removed, '.OMITTED #12#\n\n'));
    expect(headings(next)).toEqual(['.OMITTED #12#', 'EXT. BACK PORCH - LATER #13#']);
    expect(parse(next).blocks.find((b) => b.kind === 'scene_heading')?.sem).toMatchObject({
      number: '12',
    });
  });

  it('omits the last scene up to the block', async () => {
    const after = await locked(SCREENPLAY, 1);
    const { changes, removed } = await omitScene(after, 1, screenplay);
    const next = apply(after, changes);
    expect(removed.startsWith('EXT. BACK PORCH - LATER #2#')).toBe(true);
    expect(removed).toContain('END OF SAMPLE');
    expect(productionOf(next)).toEqual(productionOf(after));
    expect(headings(next)).toEqual(['INT. KITCHEN - NIGHT #1#', '.OMITTED #2#']);
  });

  it('refuses an unnumbered scene, a missing one, and an unlocked script', async () => {
    const after = await locked(SCREENPLAY, 1);
    const edited = insertBefore(after, 'EXT. BACK', 'INT. HALL - NIGHT\n\nShe listens.\n\n');
    expect(await omitScene(edited, 1, screenplay)).toEqual({ changes: [], removed: '' });
    expect(await omitScene(edited, 9, screenplay)).toEqual({ changes: [], removed: '' });
    expect(await omitScene(WITH_SEVEN, 1, screenplay)).toEqual({ changes: [], removed: '' });
  });
});

describe('omitScene in a stage play', () => {
  it('refuses even a scene the writer numbered by hand', async () => {
    const after = apply(
      STAGE_PLAY,
      await lock(STAGE_PLAY, stagePlay, { today, draftId, firstScene: 1 }),
    );
    const edited = insertBefore(after, 'MARGARET\n(quietly)', 'INT. HALL - NIGHT #3#\n\nDust.\n\n');
    expect(await omitScene(edited, 0, stagePlay)).toEqual({ changes: [], removed: '' });
    // The same text as a screenplay would omit it.
    expect((await omitScene(edited, 0, screenplay)).removed).toContain('INT. HALL - NIGHT #3#');
  });
});

describe('CRLF scripts', () => {
  const crlf = (text: string) => text.replace(/\r?\n/g, '\r\n');
  const onlyCrlf = (text: string) => expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);

  it('lock, startNextSet and omitScene keep the line breaks', async () => {
    const text = crlf(SCREENPLAY);
    const after = await locked(text, 1);
    onlyCrlf(after);
    expect(
      after.startsWith(
        text
          .replace('INT. KITCHEN - NIGHT\r\n', 'INT. KITCHEN - NIGHT #1#\r\n')
          .replace('EXT. BACK PORCH - LATER\r\n', 'EXT. BACK PORCH - LATER #2#\r\n'),
      ),
    ).toBe(true);
    expect(after.endsWith('\r\n*/\r\n')).toBe(true);
    expect(productionOf(after)?.numbers).toEqual(['1', '2']);

    const added = insertBefore(after, 'EXT. BACK', crlf('INT. HALL - NIGHT\n\nShe listens.\n\n'));
    const next = apply(added, await startNextSet(added, today, draftId));
    onlyCrlf(next);
    expect(
      next.startsWith(
        added
          .slice(0, added.indexOf('/* drafter'))
          .replace('INT. HALL - NIGHT\r\n', 'INT. HALL - NIGHT #1A#\r\n'),
      ),
    ).toBe(true);
    expect(await decodeBaseline(productionOf(next)?.baseline as string)).toBe(scriptText(next));

    const { changes, removed } = await omitScene(next, 1, screenplay);
    const omitted = apply(next, changes);
    onlyCrlf(omitted);
    expect(omitted).toBe(next.replace(removed, '.OMITTED #1A#\r\n\r\n'));
    expect(removed).toBe('INT. HALL - NIGHT #1A#\r\n\r\nShe listens.\r\n\r\n');
  });
});

describe('clearMarks', () => {
  it('keeps the lock and the pages, and starts White and Blue again', async () => {
    const after = await locked(SCREENPLAY, 1);
    const edited = after.replace('cleaner than it needs to be', 'spotless');
    const pinked = apply(edited, await startNextSet(edited, '2026-11-12', draftId));
    const cleared = apply(pinked, await clearMarks(pinked, '2026-11-20', 'c'.repeat(64)));
    const before = productionOf(pinked);
    const production = productionOf(cleared);
    expect(production?.lockedAt).toBe(before?.lockedAt);
    expect(production?.numbers).toEqual(before?.numbers);
    expect(production?.pages).toEqual(before?.pages);
    expect(production?.sets.map((s) => [s.name, s.date, s.lines])).toEqual([
      ['White', '2026-11-20', []],
      ['Blue', '2026-11-20', undefined],
    ]);
    expect(await decodeBaseline(production?.baseline as string)).toBe(scriptText(cleared));
  });
});

describe('unlock', () => {
  it('unlock leaves written numbers and OMITTED headings', async () => {
    const text = `${SCREENPLAY.trimEnd()}\n\n/* drafter\n{"v":1,"template":"us-screenplay"}\n*/\n`;
    const after = await locked(text, 1);
    const omitted = apply(after, (await omitScene(after, 0, screenplay)).changes);
    const open = apply(omitted, await unlock(omitted));
    expect(productionOf(open)).toBeNull();
    expect(parse(open).meta).toEqual({ v: 1, template: 'us-screenplay' });
    expect(headings(open)).toEqual(['.OMITTED #1#', 'EXT. BACK PORCH - LATER #2#']);
    expect(scriptText(open)).toBe(scriptText(omitted));
  });
});

describe('every action', () => {
  it('returns nothing for an unlocked script', async () => {
    expect(await startNextSet(SCREENPLAY, today, draftId)).toEqual([]);
    expect(await writeSceneNumbers(SCREENPLAY)).toEqual([]);
    expect(await clearMarks(SCREENPLAY, today, draftId)).toEqual([]);
    expect(await unlock(SCREENPLAY)).toEqual([]);
  });

  it('every action is one setMeta plus heading edits, never touching other text', async () => {
    const onlyHeadings = (before: string, after: string) => {
      // Trailing blank lines aside: a script without a block gets one after a blank line.
      const a = scriptText(before).trimEnd().split('\n');
      const b = scriptText(after).trimEnd().split('\n');
      expect(b).toHaveLength(a.length);
      const heads = new Set(headings(before));
      for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) continue;
        expect(heads.has(a[i]?.trim())).toBe(true);
        expect(b[i]?.startsWith(a[i]?.trimEnd() as string)).toBe(true);
        expect(b[i]).toMatch(/ #[0-9A-Z]+#$/);
      }
    };
    const check = async (before: string, changes: TextChange[]) => {
      const after = apply(before, changes);
      onlyHeadings(before, after);
      // At most one change reaches past the last heading: the block's.
      const doc = parse(before);
      const lastHeading = doc.blocks.filter((b) => b.kind === 'scene_heading').at(-1);
      const tail = changes.filter((c) => c.from > (lastHeading?.span.to ?? -1));
      expect(tail.length).toBeLessThanOrEqual(1);
      return after;
    };
    const after = await check(
      WITH_SEVEN,
      await lock(WITH_SEVEN, screenplay, { today, draftId, firstScene: 1 }),
    );
    const edited = insertBefore(after, 'INT. HALL', 'INT. ATTIC - DAY\n\nDust.\n\n');
    const added = insertBefore(edited, 'INT. KITCHEN', 'EXT. YARD - DAY\n\nSun.\n\n');
    const numbered = await check(added, await writeSceneNumbers(added));
    const again = insertBefore(numbered, 'INT. HALL', 'INT. CELLAR - DAY\n\nDark.\n\n');
    const pinked = await check(again, await startNextSet(again, today, draftId));
    const cleared = await check(pinked, await clearMarks(pinked, today, draftId));
    await check(cleared, await unlock(cleared));
  });
});
