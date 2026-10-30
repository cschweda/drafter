// Copied from packages/outline/test/arbitraries.ts, with invented names and words in place of its
// own, and its action naming the speakers in capitals, capitalised, in lowercase, and possessive.
import fc from 'fast-check';

// Random scripts made of what a move works with: a title page, an opening, sections of three
// depths, and scenes (a heading, a synopsis, action, speech and dual dialogue, notes over one line
// or two, boneyard, a page break, a transition), one blank line apart as Drafter writes them, and a
// metadata block at the end. Screenplays and plays, with `\n` or `\r\n` line breaks, ending with a
// line break or not.

const word = fc.constantFrom(
  'vel',
  'stroms',
  'Quorra',
  'QUORRA',
  "Brix's",
  'BRIX',
  'brix',
  'TELLAN',
  'Tellan',
  'OBA RANE',
  'Oba Rane',
  'OBA',
  'MiVO',
  'Mivo',
  'pell',
  'dask',
);
const sentence = fc
  .array(word, { minLength: 1, maxLength: 6 })
  .map((words) => `${words.join(' ')}.`);
const name = fc.constantFrom('QUORRA', 'BRIX', 'TELLAN', 'OBA RANE', 'OBA', '@MiVO');
const place = fc.constantFrom('VELLAN', 'DASK - PELL', 'STROM', 'DASK');

const body = fc.array(
  fc.oneof(
    sentence,
    fc.tuple(name, sentence).map(([n, s]) => `${n}\n${s}`),
    sentence.map((s) => `= ${s}`),
    sentence.map((s) => `[[${s}]]`),
    sentence.map((s) => `[[${s}\n${s}]]`),
    sentence.map((s) => `/* ${s}\n\n${s} */`),
    fc.tuple(name, sentence, sentence).map(([n, a, b]) => `${n}\n${a}\n\nBRIX ^\n${b}`),
    fc.constant('==='),
    fc.constant('CUT TO:'),
  ),
  { minLength: 1, maxLength: 3 },
);

const screenplayScene = fc
  .tuple(fc.constantFrom('INT.', 'EXT.'), place, fc.boolean(), body)
  .map(([p, l, numbered, parts]) =>
    [`${p} ${l} - DAY${numbered ? ' #7#' : ''}`, ...parts].join('\n\n'),
  );
const section = fc
  .tuple(fc.integer({ min: 1, max: 3 }), sentence, fc.boolean())
  .map(([depth, text, synopsis]) =>
    [`${'#'.repeat(depth)} ${text}`, ...(synopsis ? [`= ${text}`] : [])].join('\n\n'),
  );

const titlePage = fc.constantFrom('', 'Title: Vel Dask\nAuthor: A. Writer');
const opening = fc.constantFrom('', '[[An opening note.]]', 'Vel dask.', 'TELLAN\nPell vel.');
const META = '/* drafter\n{"v":1}\n*/';
const PLAY_META = '/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/';

const join = (parts: string[]) => parts.filter((p) => p !== '').join('\n\n');
/** The script's line breaks and its ending, chosen at random. */
const finish = (text: fc.Arbitrary<string>) =>
  fc.tuple(text, fc.boolean(), fc.boolean()).map(([t, crlf, ending]) => {
    const out = ending ? `${t}\n` : t;
    return crlf ? out.replace(/\n/g, '\r\n') : out;
  });

export const screenplayScript: fc.Arbitrary<string> = finish(
  fc
    .tuple(
      titlePage,
      opening,
      fc.array(fc.oneof({ weight: 3, arbitrary: screenplayScene }, section), {
        minLength: 1,
        maxLength: 10,
      }),
      fc.boolean(),
    )
    .map(([tp, open, items, meta]) => join([tp, open, ...items, meta ? META : ''])),
);

const playScene = fc
  .tuple(sentence, body)
  .map(([title, parts]) => [`## ${title}`, ...parts.filter((p) => p !== 'CUT TO:')].join('\n\n'));
const act = sentence.map((title) => `# ${title}`);

export const playScript: fc.Arbitrary<string> = finish(
  fc
    .tuple(
      titlePage,
      fc.array(fc.oneof({ weight: 3, arbitrary: playScene }, act), { minLength: 1, maxLength: 10 }),
    )
    .map(([tp, items]) => join([tp, ...items, PLAY_META])),
);

export const anyScript = fc.oneof(screenplayScript, playScript);
