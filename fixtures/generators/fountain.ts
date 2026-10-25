import fc from 'fast-check';

// Random, valid-ish Fountain for property tests: blocks of every kind, joined by
// separators that are usually blank lines but sometimes not, so lenient readings,
// two-space connections, and CRLF endings all get exercised.

const word = fc.constantFrom(
  'the',
  'phone',
  'rings',
  'Margaret',
  'waits',
  'cake',
  'rain',
  'door',
  'kitchen',
  'night',
  'again',
  'slowly',
  'nobody',
  'knows',
  '*soft*',
  '**loud**',
  '_now_',
  '[[a note]]',
  '\\*literal\\*',
);
const sentence = fc
  .array(word, { minLength: 1, maxLength: 10 })
  .map((words) => `${words.join(' ')}.`);
const lines = (max: number) => fc.array(sentence, { minLength: 1, maxLength: max });

const name = fc.constantFrom('MARGARET', 'DANNY', 'HANS', 'MOM', 'DR. VOSS', 'R2D2');
const extension = fc.constantFrom('', ' (V.O.)', ' (O.S.)', ' (on the radio)', ' ^');
const prefix = fc.constantFrom('INT.', 'EXT.', 'INT./EXT.', 'I/E', 'EST.');
const location = fc.constantFrom('KITCHEN', 'BACK PORCH', 'CAR - MOVING', 'HALLWAY');
const time = fc.constantFrom('DAY', 'NIGHT', 'LATER', 'CONTINUOUS');

const sceneHeading = fc
  .tuple(prefix, location, time, fc.boolean())
  .map(([p, l, t, numbered]) => `${p} ${l} - ${t}${numbered ? ' #12A#' : ''}`);
const action = lines(4).map((ls) => ls.join('\n'));
const parenthetical = fc.constantFrom(
  '(quietly)',
  '(beat)',
  '(to Danny)',
  '(crossing to the window,\nnot looking at him)',
);
const speech = fc
  .tuple(name, extension, fc.option(parenthetical, { nil: undefined }), lines(3))
  .map(([n, e, p, d]) => [n + e, ...(p ? [p] : []), ...d].join('\n'));
const transition = fc.constantFrom('CUT TO:', 'SMASH CUT TO:', '> FADE OUT.', 'DISSOLVE TO:');
const section = fc
  .tuple(fc.integer({ min: 1, max: 3 }), sentence)
  .map(([depth, text]) => `${'#'.repeat(depth)} ${text}`);
const synopsis = sentence.map((text) => `= ${text}`);
const centered = sentence.map((text) => `> ${text} <`);
const lyric = lines(2).map((ls) => ls.map((l) => `~${l}`).join('\n'));
const note = sentence.map((text) => `[[${text}]]`);
const boneyard = lines(3).map((ls) => `/* ${ls.join('\n\n')} */`);
const forced = fc.constantFrom('!LOUD NOISE.\nThe walls shake.', '.FLASHBACK', '@McCLANE\nHello.');

const block = fc.oneof(
  sceneHeading,
  action,
  speech,
  transition,
  section,
  synopsis,
  centered,
  lyric,
  note,
  boneyard,
  fc.constant('==='),
  forced,
);
const separator = fc.constantFrom('\n\n', '\n\n', '\n\n\n', '\r\n\r\n', '\n  \n', '\n');
const titlePage = fc.constantFrom(
  '',
  'Title: The Call\nAuthor: A. Writer\n\n',
  'Title:\n    _**THE CALL**_\nCredit: Written by\nDraft date: October 2026\n\n',
);
const meta = fc.constantFrom('', '\n\n/* drafter\n{ "v": 1, "template": "us-screenplay" }\n*/');
const ending = fc.constantFrom('', '\n', '\n\n');

// `size: 'max'` lets scripts reach 30 blocks; fast-check's default stops near ten.
export const fountainScript: fc.Arbitrary<string> = fc
  .tuple(
    titlePage,
    fc.array(fc.tuple(block, separator), { maxLength: 30, size: 'max' }),
    meta,
    ending,
  )
  .map(
    ([tp, parts, m, end]) =>
      tp + parts.map(([b, sep], i) => (i === parts.length - 1 ? b : b + sep)).join('') + m + end,
  );
