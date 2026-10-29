import en from 'dictionary-en';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { fountainScript } from '../../../fixtures/generators/fountain';
import { createChecker } from '../src/checker';
import { type CheckInput, createSpellSession } from '../src/session';

const checker = createChecker(en);

/** Text an edit puts in: misspellings, names, notes, cues, and block breaks. */
const insert = fc.constantFrom(
  'x',
  ' ',
  '\n',
  '\n\n',
  'recieve ',
  'Brennigan',
  'BRENNIGAN\n',
  '\n\nODALYS\nHalloo, Odalys.\n\n',
  'INT. KEOKUK BARN - DAY\n\n',
  '[[a nnote]]',
  '/* zzqx */',
  'Ormsby',
  'un*believ*able',
  'café ',
  'e.g. ',
);
const edit = fc.record({
  at: fc.double({ min: 0, max: 1, noNaN: true }),
  remove: fc.nat({ max: 12 }),
  insert,
  notes: fc.boolean(),
  mine: fc.subarray(['recieve', 'Brennigan', 'odalys', 'Ormsby', 'nnote']),
});

describe('createSpellSession, for any script and edits', () => {
  test("an incremental check equals a fresh session's", () => {
    fc.assert(
      fc.property(
        fountainScript,
        fc.array(edit, { maxLength: 8 }),
        fc.boolean(),
        (start, edits, small) => {
          // Tiny caches too, so eviction is exercised.
          const session = createSpellSession(checker, small ? { units: 3, words: 5 } : undefined);
          let source = start;
          let last: CheckInput = { source, kind: 'fountain', notes: false, mine: [] };
          session.check(last);
          for (const e of edits) {
            const from = Math.floor(e.at * source.length);
            source = source.slice(0, from) + e.insert + source.slice(from + e.remove);
            last = { source, kind: 'fountain', notes: e.notes, mine: e.mine };
            expect(session.check(last)).toEqual(createSpellSession(checker).check(last));
          }
          // And the same as Markdown.
          const md: CheckInput = { ...last, kind: 'markdown' };
          expect(session.check(md)).toEqual(createSpellSession(checker).check(md));
        },
      ),
      { numRuns: 200 },
    );
  });
});
