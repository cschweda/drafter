import fc from 'fast-check';

// Random scripts made of what a move works with: a title page, an opening, sections of three
// depths, and scenes (a heading, a synopsis, action, speech, notes, a transition), one blank line
// apart as Drafter writes them, and a metadata block at the end. Screenplays and plays.

const word = fc.constantFrom('the', 'phone', 'rings', 'Margaret', 'waits', 'cake', 'rain', 'door');
const sentence = fc
  .array(word, { minLength: 1, maxLength: 6 })
  .map((words) => `${words.join(' ')}.`);
const name = fc.constantFrom('MARGARET', 'DANNY', 'HANS');
const place = fc.constantFrom('KITCHEN', 'PORCH', 'CAR', 'HALL');

const body = fc.array(
  fc.oneof(
    sentence,
    fc.tuple(name, sentence).map(([n, s]) => `${n}\n${s}`),
    sentence.map((s) => `= ${s}`),
    sentence.map((s) => `[[${s}]]`),
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

const titlePage = fc.constantFrom('', 'Title: The Call\nAuthor: A. Writer');
const opening = fc.constantFrom('', '[[An opening note.]]', 'A door slams.');
const META = '/* drafter\n{"v":1}\n*/';
const PLAY_META = '/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/';

const join = (parts: string[]) => `${parts.filter((p) => p !== '').join('\n\n')}\n`;

export const screenplayScript: fc.Arbitrary<string> = fc
  .tuple(
    titlePage,
    opening,
    fc.array(fc.oneof({ weight: 3, arbitrary: screenplayScene }, section), {
      minLength: 1,
      maxLength: 10,
    }),
    fc.boolean(),
  )
  .map(([tp, open, items, meta]) => join([tp, open, ...items, meta ? META : '']));

const playScene = fc
  .tuple(sentence, body)
  .map(([title, parts]) => [`## ${title}`, ...parts.filter((p) => p !== 'CUT TO:')].join('\n\n'));
const act = sentence.map((title) => `# ${title}`);

export const playScript: fc.Arbitrary<string> = fc
  .tuple(
    titlePage,
    fc.array(fc.oneof({ weight: 3, arbitrary: playScene }, act), { minLength: 1, maxLength: 10 }),
  )
  .map(([tp, items]) => join([tp, ...items, PLAY_META]));

export const anyScript = fc.oneof(screenplayScript, playScript);
