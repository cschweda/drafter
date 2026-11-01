import { describe, expect, test } from 'vitest';
import { CUT_MIN_WORDS, findCuts } from '../src';
import {
  CABIN_TRIMMED,
  CAR,
  LANTERN_ROOM,
  LAST_FERRY,
  lanternRoom,
  lastFerry,
  nightFares,
  PLAY_SCENES,
  S,
  V,
} from './scripts';

const headingOf = (scene: string) => scene.split('\n')[0] as string;

// A Markdown document written for these tests: original text.

/** Made-up words, so no two runs of `prose` share much by chance. */
const STOCK = (() => {
  const syllables = [
    'ra',
    'mo',
    'ten',
    'sil',
    'vak',
    'ore',
    'lun',
    'dri',
    'pe',
    'cas',
    'tho',
    'wem',
  ];
  const out: string[] = [];
  for (const a of syllables)
    for (const b of syllables) for (const c of syllables) out.push(a + b + c);
  return out;
})();

/** `n` made-up words ending in a full stop, each run different by `seed`. */
function prose(n: number, seed: number): string {
  const words: string[] = [];
  let a = seed >>> 0;
  for (let i = 0; i < n; i++) {
    // mulberry32, a small seeded random number generator.
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    words.push(STOCK[((t ^ (t >>> 14)) >>> 0) % STOCK.length] as string);
  }
  return `${words.join(' ')}.`;
}

const KEEPER = {
  intro: 'The keeper writes in the ledger every night, whatever the weather does.',
  spring: `## Spring

The first boat of the year brings flour, paraffin, and a letter from the mainland. Mara reads it twice on the jetty and folds it into her coat.

She paints the gallery rail white again, because the gulls have had the winter to undo it.`,
  summer: `## Summer

Visitors climb the hill with picnic baskets and ask whether the lamp is real. Mara says it is, and that it has not missed a night in forty years.

A boy asks if she gets lonely. She tells him the lamp is good company, and it listens.`,
  autumn: `## Autumn

The storms come early. Mara tapes the windows and moves the radio to the kitchen, where the wall is thickest.

The supply boat is late by a week. She rations the tea and does not ration the paraffin.`,
  winter: `## Winter

Snow on the gallery. Mara wraps the lens cloth around her hands and climbs anyway, counting the steps aloud so the stair knows she is coming.

On the longest night a fishing boat answers her light with three short blasts of its horn.`,
};

const keeper = (parts: readonly string[]) => `${parts.join('\n\n')}\n`;
const YEAR = keeper([
  '# The Keeper’s Year',
  KEEPER.intro,
  KEEPER.spring,
  KEEPER.summer,
  KEEPER.autumn,
  KEEPER.winter,
]);

describe('findCuts in a script', () => {
  test('a scene deleted is one cut, titled by its heading', () => {
    const cuts = findCuts(LAST_FERRY, V.waterCut, 'fountain');
    expect(cuts).toEqual([
      {
        title: headingOf(S.water),
        text: S.water,
        where: { after: headingOf(S.wheelhouse), before: headingOf(S.coastguard), within: null },
      },
    ]);
  });

  test('a scene moved is not a cut', () => {
    expect(findCuts(LAST_FERRY, V.moved, 'fountain')).toEqual([]);
  });

  test('a scene lightly edited or renamed is not a cut', () => {
    expect(findCuts(LAST_FERRY, V.renamed, 'fountain')).toEqual([]);
    const edited = LAST_FERRY.replace('counts the float twice', 'counts the float three times');
    expect(findCuts(LAST_FERRY, edited, 'fountain')).toEqual([]);
  });

  test('a scene trimmed by most of its words: what left it is cut, passage by passage', () => {
    const cuts = findCuts(LAST_FERRY, V.trimmed, 'fountain');
    expect(cuts.length).toBeGreaterThan(0);
    for (const cut of cuts) {
      expect(S.cabin).toContain(cut.text);
      expect(cut.text).not.toBe(S.cabin);
      // Nothing kept is in a cut.
      for (const line of CABIN_TRIMMED.split('\n').slice(1)) {
        if (line.trim() !== '' && line !== 'NELL') expect(cut.text).not.toContain(line);
      }
      expect(cut.where.within).toEqual({ heading: headingOf(S.cabin), ordinal: 4 });
      expect(cut.where.after).toBe(headingOf(S.cabin));
    }
    // Every word that left is in a cut.
    const kept = new Set(CABIN_TRIMMED.split(/\s+/));
    const cutWords = new Set(cuts.flatMap((c) => c.text.split(/\s+/)));
    for (const word of S.cabin.split(/\s+/)) if (!kept.has(word)) expect(cutWords).toContain(word);
  });

  describe('a short scene heavily rewritten under its own heading', () => {
    const stock =
      'The rain keeps on falling past the window while the old radio hums its tired old song.';
    const other =
      'Somebody has left a pink umbrella dripping on the bench beside the stuffed heron.';
    const scenes = (line: string) =>
      Array.from(
        { length: 30 },
        (_, i) => `INT. ROOM ${i + 1} - NIGHT\n\n${line}\n\nMara counts to ${i + 1}.`,
      );
    const script = (line: string) => `${scenes(line).join('\n\n')}\n`;

    test('a stock line replaced across 30 scenes is 1 cut, the line', () => {
      expect(stock.split(' ').length).toBe(17);
      expect(findCuts(script(stock), script(other), 'fountain').map((c) => c.text)).toEqual([
        stock,
      ]);
    });

    test('gives passage cuts only, never its kept lines', () => {
      const before = `INT. SHED - DAY\n\n${stock}\n\n${other}\n\nMara waits.\n\nEXT. YARD - DAY\n\nGeese.\n`;
      const after = 'INT. SHED - DAY\n\nMara waits.\n\nEXT. YARD - DAY\n\nGeese.\n';
      const cuts = findCuts(before, after, 'fountain');
      expect(cuts.map((c) => c.text)).toEqual([`${stock}\n\n${other}`]);
      for (const cut of cuts) {
        expect(cut.text).not.toContain('Mara waits.');
        expect(cut.where.within).toEqual({ heading: 'INT. SHED - DAY', ordinal: 1 });
      }
    });

    test('a scene truly removed is still a whole-scene cut', () => {
      // A scene of its own (near-identical templated scenes read as one: see DEFERRED).
      const all = scenes(stock);
      all[4] = `INT. ROOM 5 - NIGHT\n\n${other}\n\nMara counts to 5.`;
      const before = `${all.join('\n\n')}\n`;
      const after = `${[...all.slice(0, 4), ...all.slice(5)].join('\n\n')}\n`;
      expect(findCuts(before, after, 'fountain')).toEqual([
        {
          title: 'INT. ROOM 5 - NIGHT',
          text: all[4],
          where: { after: 'INT. ROOM 4 - NIGHT', before: 'INT. ROOM 6 - NIGHT', within: null },
        },
      ]);
    });
  });

  describe('passages that leave a scene still there', () => {
    const jetty = S.jetty;
    const swap = (from: string, to: string) => LAST_FERRY.replace(jetty, jetty.replace(from, to));
    const one = (after: string) => {
      const cuts = findCuts(LAST_FERRY, after, 'fountain');
      for (const c of cuts)
        expect(c.where.within).toEqual({ heading: headingOf(jetty), ordinal: 2 });
      return cuts.map((c) => c.text);
    };
    test('a dropped speech is a cut', () => {
      const speech = 'SCHOOLBOY\nIs it running today or is it broken like Tuesday?';
      expect(one(swap(`${speech}\n\n`, ''))).toEqual([speech]);
    });
    test('a dropped action paragraph is a cut, however short', () => {
      const action =
        'Gulls argue over a split bag of chips. The ferry, a stubby green boat called the MARGARET ROSE, knocks against old tyres roped to the pilings.';
      expect(one(swap(`${action}\n\n`, ''))).toEqual([action]);
      const short = LAST_FERRY.replace(jetty, `${jetty}\n\nNell nods.`);
      expect(findCuts(short, LAST_FERRY, 'fountain').map((c) => c.text)).toEqual(['Nell nods.']);
    });
    test('12 words taken out of a paragraph are a cut; 11 are not', () => {
      const twelve = ' elbow, while a SCHOOLBOY in an oversized blazer waits with a bicycle';
      expect(twelve.trim().split(/\s+/)).toHaveLength(12);
      expect(one(swap(twelve, ''))).toEqual([twelve.trim()]);
      const eleven = ' while a SCHOOLBOY in an oversized blazer waits with a bicycle';
      expect(eleven.trim().split(/\s+/)).toHaveLength(11);
      expect(one(swap(eleven, ''))).toEqual([]);
    });
    test('a typo fixed or a word changed is not a cut', () => {
      expect(one(swap('Gulls argue', 'Gulls argeu'))).toEqual([]);
      expect(one(swap('split bag of chips', 'torn bag of chips'))).toEqual([]);
    });
    test('an element moved within the scene is not a cut', () => {
      const speech = 'SCHOOLBOY\nIs it running today or is it broken like Tuesday?';
      const moved = jetty.replace(`${speech}\n\n`, '').concat(`\n\n${speech}`);
      expect(one(LAST_FERRY.replace(jetty, moved))).toEqual([]);
    });
    test('a paragraph replaced by a different one of 12 words or more is a cut of the old one', () => {
      const old =
        'Nell coils a mooring line, hand over elbow, while a SCHOOLBOY in an oversized blazer waits with a bicycle.';
      const other =
        'A dog sleeps under the bench by the ticket hut, dreaming of the gulls it never catches.';
      expect(one(swap(old, other))).toEqual([old]);
    });
  });

  test('a scene split in two, or two merged into one, is not a cut', () => {
    expect(findCuts(LAST_FERRY, V.split, 'fountain')).toEqual([]);
    expect(findCuts(LAST_FERRY, V.splitRenamed, 'fountain')).toEqual([]);
    expect(findCuts(LAST_FERRY, V.merged, 'fountain')).toEqual([]);
    expect(findCuts(LAST_FERRY, V.mergedRenamed, 'fountain')).toEqual([]);
    expect(findCuts(V.split, LAST_FERRY, 'fountain')).toEqual([]);
  });

  test('a scene rewritten from nothing under a new heading is a cut', () => {
    const cuts = findCuts(LAST_FERRY, V.rewrite, 'fountain');
    expect(cuts.map((c) => c.title)).toEqual([headingOf(S.wheelhouse)]);
    expect(cuts[0]?.text).toBe(S.wheelhouse);
  });

  test('one of five scenes under the same heading cut is that scene, no other', () => {
    const before = nightFares(CAR);
    const after = nightFares([CAR[0], CAR[1], CAR[3], CAR[4]]);
    const cuts = findCuts(before, after, 'fountain');
    expect(cuts).toHaveLength(1);
    expect(cuts[0]?.text).toBe(CAR[2]);
    expect(cuts[0]?.where).toEqual({
      after: 'INT. CAR - NIGHT',
      before: 'INT. CAR - NIGHT',
      within: null,
    });
  });

  test('where names the surviving neighbours, skipping scenes cut beside it', () => {
    const after = lastFerry([S.office, S.cabin, S.landing, S.pub], []);
    const cuts = findCuts(LAST_FERRY, after, 'fountain');
    const jetty = cuts.find((c) => c.title === headingOf(S.jetty));
    const car = cuts.find((c) => c.title === headingOf(S.arrival));
    expect(jetty?.where).toEqual({
      after: headingOf(S.office),
      before: headingOf(S.cabin),
      within: null,
    });
    expect(car?.where).toEqual({
      after: headingOf(S.office),
      before: headingOf(S.cabin),
      within: null,
    });
    // Act two cut whole: the last scene kept is the pub, and nothing comes after it.
    const morning = cuts.find((c) => c.title === headingOf(S.morning));
    expect(morning?.where).toEqual({ after: headingOf(S.pub), before: null, within: null });
    // In the order they stood.
    expect(cuts.map((c) => c.title)[0]).toBe(headingOf(S.jetty));
  });

  test('the first scene cut has no neighbour before it', () => {
    const after = lastFerry(ACT_ONE_WITHOUT_OFFICE, [
      S.kitchen,
      S.storm,
      S.wheelhouse,
      S.water,
      S.coastguard,
      S.morning,
    ]);
    const cuts = findCuts(LAST_FERRY, after, 'fountain');
    expect(cuts).toEqual([
      {
        title: headingOf(S.office),
        text: S.office,
        where: { after: null, before: headingOf(S.jetty), within: null },
      },
    ]);
  });

  test('the same scene twice, both cut, is one cut', () => {
    const before = lastFerry([S.office, S.jetty, S.jetty, S.arrival], []);
    const after = lastFerry([S.office, S.arrival], []);
    const cuts = findCuts(before, after, 'fountain');
    expect(cuts.map((c) => c.text)).toEqual([S.jetty]);
  });

  test('a stage play’s scene cut is one cut', () => {
    const after = lanternRoom(PLAY_SCENES.slice(0, 3), [
      PLAY_SCENES[3],
      PLAY_SCENES[5],
    ] as string[]);
    const cuts = findCuts(LANTERN_ROOM, after, 'fountain');
    expect(cuts).toHaveLength(1);
    expect(cuts[0]?.text).toBe(PLAY_SCENES[4]);
  });

  test('nothing is reported when nothing left', () => {
    expect(findCuts(LAST_FERRY, LAST_FERRY, 'fountain')).toEqual([]);
    expect(findCuts('', LAST_FERRY, 'fountain')).toEqual([]);
    expect(findCuts(LAST_FERRY.replace(/\n/g, '\r\n'), LAST_FERRY, 'fountain')).toEqual([]);
  });
});

const ACT_ONE_WITHOUT_OFFICE = [S.jetty, S.arrival, S.cabin, S.landing, S.pub];

describe('findCuts in a Markdown document', () => {
  test('a section cut is one cut, titled by its heading', () => {
    const after = keeper([
      '# The Keeper’s Year',
      KEEPER.intro,
      KEEPER.spring,
      KEEPER.autumn,
      KEEPER.winter,
    ]);
    expect(findCuts(YEAR, after, 'markdown')).toEqual([
      {
        title: 'Summer',
        text: KEEPER.summer,
        where: { after: 'Spring', before: 'Autumn', within: null },
      },
    ]);
  });

  test('a chapter cut with its sections is one cut', () => {
    const second = `# The Second Year\n\nThe ledger fills faster now.\n\n## Thaw\n\n${prose(40, 21)}\n\n## Frost\n\n${prose(40, 22)}`;
    const before = keeper([
      YEAR.trimEnd(),
      second,
      '# Afterword',
      'Mara keeps the last ledger in a tin.',
    ]);
    const after = keeper([YEAR.trimEnd(), '# Afterword', 'Mara keeps the last ledger in a tin.']);
    expect(findCuts(before, after, 'markdown')).toEqual([
      {
        title: 'The Second Year',
        text: second,
        where: { after: 'Winter', before: 'Afterword', within: null },
      },
    ]);
  });

  test('a moved chapter or section is not a cut', () => {
    const moved = keeper([
      '# The Keeper’s Year',
      KEEPER.intro,
      KEEPER.winter,
      KEEPER.spring,
      KEEPER.summer,
      KEEPER.autumn,
    ]);
    expect(findCuts(YEAR, moved, 'markdown')).toEqual([]);
    const chapters = keeper(['# One', KEEPER.spring, '# Two', KEEPER.summer]);
    const swapped = keeper(['# Two', KEEPER.summer, '# One', KEEPER.spring]);
    expect(findCuts(chapters, swapped, 'markdown')).toEqual([]);
  });

  test('a section renamed, or lightly edited, is not a cut', () => {
    const renamed = YEAR.replace('## Summer', '## High Summer');
    expect(findCuts(YEAR, renamed, 'markdown')).toEqual([]);
    const edited = YEAR.replace('picnic baskets', 'cool boxes');
    expect(findCuts(YEAR, edited, 'markdown')).toEqual([]);
  });

  test('a section split in two, or two merged into one, is not a cut', () => {
    const [head, first, second] = KEEPER.autumn.split('\n\n');
    const split = YEAR.replace(
      KEEPER.autumn,
      `${head}\n\n${first}\n\n## The Late Boat\n\n${second}`,
    );
    expect(findCuts(YEAR, split, 'markdown')).toEqual([]);
    expect(findCuts(split, YEAR, 'markdown')).toEqual([]);
    const summerBody = KEEPER.summer.split('\n\n').slice(1).join('\n\n');
    const merged = YEAR.replace(`\n\n${KEEPER.summer}`, '').replace(
      KEEPER.spring,
      `${KEEPER.spring}\n\n${summerBody}`,
    );
    expect(findCuts(YEAR, merged, 'markdown')).toEqual([]);
  });

  test('of three sections with one heading, the one cut is that one', () => {
    const notes = [1, 2, 3].map((i) => `## Notes\n\n${prose(30, i)}`);
    const before = keeper(['# Notes kept', ...notes]);
    const after = keeper(['# Notes kept', notes[0] as string, notes[2] as string]);
    expect(findCuts(before, after, 'markdown')).toEqual([
      { title: 'Notes', text: notes[1], where: { after: 'Notes', before: 'Notes', within: null } },
    ]);
  });

  test('a removed paragraph is a cut, whatever its length', () => {
    const long = prose(CUT_MIN_WORDS, 1);
    const short = 'Fog again.';
    const kept = 'The lamp is lit at dusk.';
    const before = keeper(['# A', KEEPER.intro, long, kept, short, KEEPER.spring]);
    const after = keeper(['# A', KEEPER.intro, kept, KEEPER.spring]);
    const cuts = findCuts(before, after, 'markdown');
    expect(cuts.map((c) => c.text)).toEqual([long, short]);
    const words = long.split(' ');
    expect(cuts[0]?.title).toBe(`${words.slice(0, 8).join(' ')}…`);
    expect(cuts[0]?.where).toEqual({
      after: 'A',
      before: 'Spring',
      within: { heading: 'A', ordinal: 1 },
    });
  });

  test(`${CUT_MIN_WORDS} words taken from inside a paragraph are a cut; ${CUT_MIN_WORDS - 1} are not`, () => {
    const start = prose(20, 50);
    const end = prose(20, 51);
    const doc = (middle: string) => keeper(['# A', `${start} ${middle}${end}`]);
    const twelve = prose(CUT_MIN_WORDS, 52).slice(0, -1);
    expect(findCuts(doc(`${twelve} `), doc(''), 'markdown').map((c) => c.text)).toEqual([twelve]);
    const eleven = prose(CUT_MIN_WORDS - 1, 53).slice(0, -1);
    expect(findCuts(doc(`${eleven} `), doc(''), 'markdown')).toEqual([]);
  });

  test('a passage cut starts and ends on a word', () => {
    const kept = 'She looked out of the window';
    const gone = ', and the street was empty and the lamps were out along the pier';
    const before = keeper(['# A', KEEPER.intro, `${kept}${gone}.`]);
    const after = keeper(['# A', KEEPER.intro, `${kept}.`]);
    expect(findCuts(before, after, 'markdown').map((c) => c.text)).toEqual([
      'and the street was empty and the lamps were out along the pier',
    ]);
    const dash = keeper([
      '# A',
      KEEPER.intro,
      `${kept} — and the street was empty and the lamps were out along the pier.`,
    ]);
    expect(findCuts(dash, after, 'markdown').map((c) => c.text)).toEqual([
      'and the street was empty and the lamps were out along the pier',
    ]);
  });

  test('a list item removed is a cut, however short', () => {
    const before = keeper(['# A', KEEPER.intro, '- Paraffin.\n- Flour and tea.\n- Rope.']);
    const after = keeper(['# A', KEEPER.intro, '- Paraffin.\n- Rope.']);
    expect(findCuts(before, after, 'markdown').map((c) => c.text)).toEqual(['- Flour and tea.']);
  });

  test('two short paragraphs removed together are one passage', () => {
    const a = prose(30, 3);
    const b = prose(30, 4);
    const before = keeper(['# A', KEEPER.intro, a, b, KEEPER.spring]);
    const after = keeper(['# A', KEEPER.intro, KEEPER.spring]);
    expect(findCuts(before, after, 'markdown').map((c) => c.text)).toEqual([`${a}\n\n${b}`]);
  });

  test('a paragraph rewritten lightly is not a cut; replaced by something else, it is', () => {
    const old = prose(60, 5);
    const before = keeper(['# A', KEEPER.intro, old, KEEPER.spring]);
    const light = old.replace(/^(\S+ \S+ \S+)/, 'and so $1').replace(/\.$/, ' again.');
    expect(
      findCuts(before, keeper(['# A', KEEPER.intro, light, KEEPER.spring]), 'markdown'),
    ).toEqual([]);
    const other = prose(60, 99).toUpperCase();
    expect(
      findCuts(before, keeper(['# A', KEEPER.intro, other, KEEPER.spring]), 'markdown').map(
        (c) => c.text,
      ),
    ).toEqual([old]);
  });

  test('a long run taken out of a paragraph that stays is a cut', () => {
    const start = prose(20, 6);
    const middle = prose(60, 7);
    const end = prose(20, 8);
    const before = keeper(['# A', `${start} ${middle} ${end}`]);
    const after = keeper(['# A', `${start} ${end}`]);
    const cuts = findCuts(before, after, 'markdown');
    expect(cuts.map((c) => c.text)).toEqual([middle]);
  });

  test('a sentence deleted from the end of the last paragraph is exactly that sentence', () => {
    const kept = prose(40, 30);
    for (const n of [CUT_MIN_WORDS - 1, CUT_MIN_WORDS]) {
      const gone = prose(n, 31);
      const expected = n >= CUT_MIN_WORDS ? [gone] : [];
      const before = keeper(['# A', KEEPER.intro, `${kept} ${gone}`]);
      const at = findCuts(before, keeper(['# A', KEEPER.intro, kept]), 'markdown');
      expect(at.map((c) => c.text)).toEqual(expected);
      // Just before a heading, too.
      const mid = keeper(['# A', `${kept} ${gone}`, KEEPER.spring]);
      const there = findCuts(mid, keeper(['# A', kept, KEEPER.spring]), 'markdown');
      expect(there.map((c) => c.text)).toEqual(expected);
    }
  });

  test('60 words deleted from the end of a 150-word last paragraph are exactly those 60', () => {
    const kept = prose(90, 32);
    const gone = prose(60, 33);
    const before = keeper(['# A', KEEPER.intro, `${kept} ${gone}`]);
    const cuts = findCuts(before, keeper(['# A', KEEPER.intro, kept]), 'markdown');
    expect(cuts.map((c) => c.text)).toEqual([gone]);
    const mid = keeper(['# A', `${kept} ${gone}`, KEEPER.spring]);
    const there = findCuts(mid, keeper(['# A', kept, KEEPER.spring]), 'markdown');
    expect(there.map((c) => c.text)).toEqual([gone]);
  });

  test('a paragraph moved elsewhere is not a cut', () => {
    const para = prose(70, 9);
    const before = keeper(['# A', para, KEEPER.spring, KEEPER.summer]);
    const after = keeper(['# A', KEEPER.spring, KEEPER.summer.replace('\n\n', `\n\n${para}\n\n`)]);
    expect(findCuts(before, after, 'markdown')).toEqual([]);
  });

  test('a passage in a section that is cut is not reported again', () => {
    const big = `## Big\n\n${prose(80, 10)}`;
    const before = keeper(['# A', KEEPER.spring, big]);
    expect(
      findCuts(before, keeper(['# A', KEEPER.spring]), 'markdown').map((c) => c.title),
    ).toEqual(['Big']);
  });

  test('a heading inside fenced code is not a section', () => {
    const fenced = `## Code\n\nThe log:\n\n\`\`\`\n## Not a section\n${prose(60, 11)}\n\`\`\``;
    const before = keeper(['# A', KEEPER.spring, fenced]);
    const cuts = findCuts(before, keeper(['# A', KEEPER.spring]), 'markdown');
    expect(cuts.map((c) => c.title)).toEqual(['Code']);
  });

  test('CRLF line breaks find the same cuts', () => {
    const after = keeper([
      '# The Keeper’s Year',
      KEEPER.intro,
      KEEPER.spring,
      KEEPER.autumn,
      KEEPER.winter,
    ]);
    const crlf = (s: string) => s.replace(/\n/g, '\r\n');
    const cuts = findCuts(crlf(YEAR), crlf(after), 'markdown');
    expect(cuts.map((c) => c.title)).toEqual(['Summer']);
    // Kept with LF line breaks, so the cut has one ID wherever it was made.
    expect(cuts[0]?.text).toBe(KEEPER.summer);
  });

  test('a section emptied to its heading loses its words as a cut; a bare heading cut is not one', () => {
    const emptied = YEAR.replace(KEEPER.summer, '## Summer');
    expect(findCuts(YEAR, emptied, 'markdown').map((c) => c.text)).toEqual([KEEPER.summer]);
    const bare = keeper(['# A', '## Later', KEEPER.spring]);
    expect(findCuts(bare, keeper(['# A', KEEPER.spring]), 'markdown')).toEqual([]);
  });

  describe('a short section rewritten under its own heading is never lost', () => {
    const body = prose(10, 40);
    const notes = `## Notes\n\n${body}`;
    const before = keeper(['# A', KEEPER.spring, notes, KEEPER.summer]);
    const now = (newBody: string) =>
      findCuts(
        before,
        keeper(['# A', KEEPER.spring, `## Notes\n\n${newBody}`, KEEPER.summer]),
        'markdown',
      );
    test('replaced by a few words', () => {
      expect(now('TBD more later.')).toEqual([
        { title: 'Notes', text: notes, where: { after: 'Spring', before: 'Summer', within: null } },
      ]);
    });
    test('replaced by a different paragraph of the same length', () => {
      expect(now(prose(10, 41)).map((c) => c.text)).toEqual([notes]);
    });
    test('trimmed to 3 words', () => {
      expect(now(`${body.split(' ').slice(0, 3).join(' ')}.`).map((c) => c.text)).toEqual([notes]);
    });
    test('but grown, or lightly edited, it is no cut', () => {
      expect(now(`${body} ${prose(200, 42)}`)).toEqual([]);
      expect(now(body.replace(/^\S+/, 'And'))).toEqual([]);
    });
    test('a longer body replaced or cut down is a passage cut in its section', () => {
      const long = prose(40, 43);
      const was = keeper(['# A', KEEPER.spring, `## Notes\n\n${long}`, KEEPER.summer]);
      const to = (b: string) => keeper(['# A', KEEPER.spring, `## Notes\n\n${b}`, KEEPER.summer]);
      expect(findCuts(was, to('TBD more later.'), 'markdown')).toEqual([
        {
          title: `${long.split(' ').slice(0, 8).join(' ')}…`,
          text: long,
          where: { after: 'Notes', before: 'Summer', within: { heading: 'Notes', ordinal: 3 } },
        },
      ]);
      const words = long.split(' ');
      const trimmed = findCuts(was, to(`${words.slice(0, 10).join(' ')}.`), 'markdown');
      // The full stop stays, after the words kept.
      expect(trimmed.map((c) => c.text)).toEqual([words.slice(10).join(' ').slice(0, -1)]);
    });
  });

  test('nothing is reported when nothing left', () => {
    expect(findCuts(YEAR, YEAR, 'markdown')).toEqual([]);
    expect(findCuts('', YEAR, 'markdown')).toEqual([]);
    expect(findCuts(YEAR, `${YEAR}\n## Spring again\n\nMore.\n`, 'markdown')).toEqual([]);
  });
});
