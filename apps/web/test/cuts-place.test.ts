import { findCuts } from '@drafter/history';
import { describe, expect, test } from 'vitest';
import { createCutInsert } from '../app/cuts/insert';
import { cutChanges, cutOrdinal, insertPlace, putBackPlace, unitsOf } from '../app/cuts/place';
import { foundCuts } from '../app/workers/cuts-compute';

// Where a cut goes back (drafts-and-cuts design §3.2): Put back between its old neighbours, the
// one nearest its old place when headings repeat; Insert at cursor at the next scene or paragraph.

const apply = (text: string, changes: { from: number; to: number; insert: string }[]) => {
  let out = text;
  for (const c of [...changes].sort((a, b) => b.from - a.from))
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  return out;
};

const scene = (heading: string, body: string) => `${heading}\n\n${body}\n`;
const HALL = scene(
  'INT. HALL - DAY',
  'Marra waits by the door, turning the brass key over in her hands.',
);
const CELLAR = scene(
  'INT. CELLAR - NIGHT',
  'A lamp swings from a hook and the shelves of jars tilt with it.',
);
const YARD = scene(
  'EXT. COAL YARD - DAWN',
  'Two carts wait under a tarpaulin, their wheels chocked.',
);
const script = (...scenes: string[]) => `Title: The Weir\n\n${scenes.join('\n')}`;

/** Records a cut as the worker does: found, with its own place. */
function cutOf(before: string, after: string, kind: 'fountain' | 'markdown', i = 0) {
  const cut = findCuts(before, after, kind)[i];
  if (!cut) throw new Error('no cut');
  const ordinal = cut.where.within ? cut.where.within.ordinal : cutOrdinal(before, cut.text, kind);
  return { ...cut, where: { ...cut.where, ...(ordinal === undefined ? {} : { ordinal }) } };
}

describe('Put back', () => {
  test('a scene goes back between its old neighbours', () => {
    const before = script(HALL, CELLAR, YARD);
    const now = script(HALL, YARD);
    const cut = cutOf(before, now, 'fountain');
    expect(cut.where.ordinal).toBe(2);
    const place = putBackPlace(cut.where, now, 'fountain');
    expect(place.said).toBe('after INT. HALL - DAY');
    expect(apply(now, cutChanges(now, place, cut.text, 'fountain'))).toBe(before);
  });

  test('with five scenes of one heading, it goes back by its old place, not the first', () => {
    const car = (n: number) =>
      scene(
        'INT. CAR - NIGHT',
        `The wipers beat ${n} times, slow, and then the radio crackles twice.`,
      );
    const gone = scene(
      'EXT. LAY-BY - NIGHT',
      'Rain hammers the bonnet while Osken checks the map again.',
    );
    const before = script(car(1), car(2), car(3), gone, car(4), car(5));
    const now = script(car(1), car(2), car(3), car(4), car(5));
    const cut = cutOf(before, now, 'fountain');
    expect(cut.where.after).toBe('INT. CAR - NIGHT');
    expect(cut.where.before).toBe('INT. CAR - NIGHT');
    const place = putBackPlace(cut.where, now, 'fountain');
    expect(apply(now, cutChanges(now, place, cut.text, 'fountain'))).toBe(before);
  });

  test('a passage goes back right after the line it followed, while that line is there', () => {
    const middle =
      'Osken shrugs and pockets the key before anyone else can claim it for themselves.';
    const before = script(
      scene('INT. HALL - DAY', `Marra waits by the door.\n\n${middle}\n\nThe clock strikes six.`),
      YARD,
    );
    const now = script(
      scene('INT. HALL - DAY', 'Marra waits by the door.\n\nThe clock strikes six.'),
      YARD,
    );
    const [cut] = foundCuts(before, now, 'fountain');
    expect(cut?.where.lineAfter).toBe('Marra waits by the door.');
    const place = putBackPlace(cut?.where as never, now, 'fountain');
    expect(place.said).toBe('in INT. HALL - DAY, where it was');
    expect(apply(now, cutChanges(now, place, cut?.text as string, 'fountain'))).toBe(before);
    // That line gone: at the end of the scene.
    const changed = now.replace('Marra waits by the door.', 'Marra sits.');
    expect(putBackPlace(cut?.where as never, changed, 'fountain').said).toBe(
      'at the end of INT. HALL - DAY',
    );
  });

  test('a passage goes back at the end of the scene it was cut from', () => {
    const speech = 'MARRA\nI never wanted the key, and I never wanted the house that came with it.';
    const before = script(scene('INT. HALL - DAY', `Marra waits by the door.\n\n${speech}`), YARD);
    const now = script(scene('INT. HALL - DAY', 'Marra waits by the door.'), YARD);
    const cut = cutOf(before, now, 'fountain');
    expect(cut.where.within).toEqual({ heading: 'INT. HALL - DAY', ordinal: 1 });
    const place = putBackPlace(cut.where, now, 'fountain');
    expect(place.said).toBe('at the end of INT. HALL - DAY');
    expect(apply(now, cutChanges(now, place, cut.text, 'fountain'))).toBe(before);
  });

  test('a Markdown section goes back after its old previous section, of three called Notes', () => {
    const notes = (n: number) =>
      `## Notes\n\nThe ${n} notes run to a page and a half, mostly crossed out.\n`;
    const ferry =
      '## The ferry\n\nThe ferry leaves at six and nobody on board admits to knowing the pilot.\n';
    const before = `# Boca\n\n${notes(1)}\n${notes(2)}\n${ferry}\n${notes(3)}`;
    const now = `# Boca\n\n${notes(1)}\n${notes(2)}\n${notes(3)}`;
    const cut = cutOf(before, now, 'markdown');
    expect(cut.title).toBe('The ferry');
    const place = putBackPlace(cut.where, now, 'markdown');
    expect(apply(now, cutChanges(now, place, cut.text, 'markdown'))).toBe(before);
  });

  test('with no neighbour left, it goes at the end, before the settings', () => {
    const where = { after: 'INT. GONE - DAY', before: null, within: null };
    const now = `${script(HALL)}\n/* drafter\n{"v":1}\n*/\n`;
    const place = putBackPlace(where, now, 'fountain');
    expect(place).toEqual({ at: null, said: 'at the end' });
    const out = apply(now, cutChanges(now, place, YARD, 'fountain'));
    expect(out.indexOf('EXT. COAL YARD')).toBeLessThan(out.indexOf('/* drafter'));
  });

  test('a cut from before places were kept (no ordinal) still finds its neighbour', () => {
    const now = script(HALL, YARD);
    const place = putBackPlace({ after: 'INT. HALL - DAY', before: null }, now, 'fountain');
    expect(place.said).toBe('after INT. HALL - DAY');
  });
});

describe('Insert at cursor', () => {
  test('a scene goes in at the start of the next scene after the cursor', () => {
    const now = script(HALL, YARD);
    const cursor = now.indexOf('brass');
    const place = insertPlace(now, cursor, 'fountain', true);
    expect(place.at).toBe(now.indexOf('EXT. COAL YARD'));
    const out = apply(now, cutChanges(now, place, CELLAR, 'fountain'));
    expect(out).toBe(script(HALL, CELLAR, YARD));
  });

  test('after the last scene, at the end of the body', () => {
    const now = script(HALL, YARD);
    expect(insertPlace(now, now.length - 2, 'fountain', true).at).toBeNull();
  });

  test('a paragraph goes in at the start of the next paragraph', () => {
    const now = '# One\n\nFirst paragraph here.\n\nSecond paragraph here.\n';
    const place = insertPlace(now, 3, 'markdown', false);
    expect(place.at).toBe(now.indexOf('First'));
    const later = insertPlace(now, now.indexOf('paragraph here.'), 'markdown', false);
    expect(later.at).toBe(now.indexOf('Second'));
    const out = apply(now, cutChanges(now, later, 'A cut paragraph.', 'markdown'));
    expect(out).toBe(
      '# One\n\nFirst paragraph here.\n\nA cut paragraph.\n\nSecond paragraph here.\n',
    );
  });

  test('a document’s end is before its trailing comment', () => {
    const now = '# One\n\nOnly paragraph.\n\n<!-- drafter {"v":1} -->\n';
    const place = insertPlace(now, 8, 'markdown', false);
    expect(place.at).toBeNull();
    const out = apply(now, cutChanges(now, place, 'Added.', 'markdown'));
    expect(out).toBe('# One\n\nOnly paragraph.\n\nAdded.\n\n<!-- drafter {"v":1} -->\n');
  });
});

describe('units', () => {
  test('a document’s opening is unit 0, and its sections are numbered from 1', () => {
    const units = unitsOf('Intro.\n\n# A\n\nOne.\n\n## B\n\nTwo.\n', 'markdown');
    expect(units.map((u) => u.heading)).toEqual(['', 'A', 'B']);
    expect(cutOrdinal('Intro.\n\n# A\n\nOne.\n\n## B\n\nTwo.\n', '## B\n\nTwo.', 'markdown')).toBe(
      2,
    );
  });
});

describe('Put back and Insert, applied', () => {
  const row = {
    id: 'a'.repeat(64),
    title: 'INT. CELLAR - NIGHT',
    text: CELLAR.trimEnd(),
    kind: 'fountain' as const,
    cuts: [{ at: '2026-11-01T10:00:00.000Z', draft: 1 }],
    where: { after: 'INT. HALL - DAY', before: 'EXT. COAL YARD - DAWN', within: null, ordinal: 2 },
  };
  function deps(readOnly: string | null) {
    let text = script(HALL, YARD);
    const said: string[] = [];
    const marked: string[] = [];
    const insert = createCutInsert({
      readOnly: () => readOnly,
      text: () => text,
      cursor: () => 0,
      kind: () => 'fountain',
      apply: (changes) => {
        text = apply(text, changes as never);
        return true;
      },
      say: (m) => said.push(m),
      mark: async (id) => {
        marked.push(id);
      },
    });
    return { insert, said, marked, text: () => text };
  }

  test('one change, said, and marked put back', async () => {
    const d = deps(null);
    expect(await d.insert.putBack(row)).toBe(true);
    expect(d.text()).toBe(script(HALL, CELLAR, YARD));
    expect(d.said).toEqual([
      'Put back “INT. CELLAR - NIGHT” after INT. HALL - DAY. Undo takes it out.',
    ]);
    expect(d.marked).toEqual([row.id]);
  });

  test('a read-only tab changes nothing and says why', async () => {
    const d = deps('You can’t type here because this script is open in another Drafter tab.');
    expect(await d.insert.insertAtCursor(row)).toBe(false);
    expect(d.text()).toBe(script(HALL, YARD));
    expect(d.said).toEqual([
      'You can’t type here because this script is open in another Drafter tab.',
    ]);
    expect(d.marked).toEqual([]);
  });
});
