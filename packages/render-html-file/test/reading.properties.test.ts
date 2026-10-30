import { type Block, parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { readingHtml } from '../src/reading';
import { dom } from './scripts';

const screenplay = builtins['us-screenplay'] as Template;
const stagePlay = builtins['stage-play-standard'] as Template;

/** Words, some of them trouble: markup, quotes, an ampersand, wide and combined characters. */
const word = fc.constantFrom(
  'rain',
  'lamp',
  'harbour',
  '<img src=x onerror=alert(1)>',
  '</div>',
  '"quoted"',
  "it's",
  'a&b',
  '东京',
  '🎬',
  'café',
);
const words = (max: number) =>
  fc.array(word, { minLength: 1, maxLength: max }).map((w) => w.join(' '));
/** A sentence of action: a capital, then lower case, so it never reads as a cue or a heading. */
const sentence = words(10).map((w) => `The ${w}.`);
const note = fc.oneof(
  words(4).map((w) => `[[mind the ${w}]]`),
  fc.constantFrom(
    '[[Goal: the key]]',
    '[[Color: red]]',
    '[[Setup: the gun]]',
    '[[Note: fix this]]',
  ),
);
const action = fc
  .tuple(sentence, fc.option(note, { nil: undefined }), fc.option(sentence, { nil: undefined }))
  .map(([a, n, b]) => [a, n, b].filter(Boolean).join(' '));
const name = fc.constantFrom('MARA', 'JONAH', 'TESSA', 'OLD PELL', 'Ann');
const extension = fc.constantFrom('', ' (V.O.)', ' (O.S.)', " (CONT'D)");
/** A speech: a cue (with an extension, maybe `^`), maybe a parenthetical, and dialogue, sometimes long enough to split. */
const speech = fc
  .tuple(
    name,
    extension,
    fc.boolean(),
    fc.boolean(),
    fc.oneof(
      sentence,
      sentence.map((s) => `${s} `.repeat(45).trim()),
    ),
    fc.option(fc.constant('~la la, the boats come home'), { nil: undefined }),
  )
  .map(([who, ext, dual, paren, said, lyric]) =>
    [
      `${who === 'Ann' ? '@Ann' : who}${ext}${dual ? ' ^' : ''}`,
      paren ? '(quietly)' : undefined,
      said,
      lyric,
    ]
      .filter(Boolean)
      .join('\n'),
  );
const element = fc.oneof(
  { weight: 2, arbitrary: fc.integer({ min: 1, max: 9 }).map((n) => `INT. ROOM ${n} - DAY`) },
  {
    weight: 1,
    arbitrary: fc
      .tuple(fc.integer({ min: 1, max: 3 }), fc.integer({ min: 1, max: 9 }))
      .map(([depth, n]) => `${'#'.repeat(depth)} PART ${n}`),
  },
  { weight: 3, arbitrary: action },
  { weight: 4, arbitrary: speech },
  { weight: 1, arbitrary: fc.constant('~Bring the boats home') },
  { weight: 1, arbitrary: fc.constantFrom('CUT TO:', '> FADE OUT.') },
  { weight: 1, arbitrary: words(3).map((w) => `> ${w} <`) },
  { weight: 1, arbitrary: note },
  { weight: 1, arbitrary: fc.constant('/* BONEYARD-WORD cut this */') },
);
const script = fc.array(element, { minLength: 1, maxLength: 24 }).map((e) => `${e.join('\n\n')}\n`);

/** Text with all whitespace taken out, so a line break and a space compare equal. */
const squash = (text: string) => text.replace(/\s+/g, '');

/** What Reading should say for a block: its heading's or cue's text, or its printed lines. */
function expectedText(block: Block): string {
  if (block.kind === 'section' || block.kind === 'scene_heading') return block.sem.text.trim();
  if (block.kind === 'character') return block.sem.name + (block.sem.extension ?? '');
  return block.lines
    .filter((line) => !line.transparent)
    .map((line) => line.inline.map((run) => run.text).join(''))
    .join('');
}

describe('readingHtml, over random scripts', () => {
  for (const [label, template] of [
    ['screenplay', screenplay],
    ['stage play', stagePlay],
  ] as const) {
    it(`every printed block once, in source order, and nothing that doesn't print (${label})`, () => {
      fc.assert(
        fc.property(script, (source) => {
          const doc = parse(source);
          const layout = paginate(doc, template);
          const printed = new Set<number>();
          for (const page of layout.pages) {
            for (const line of page.lines) {
              if (line.blockIndex >= 0) printed.add(line.blockIndex);
              if (line.right && line.right.blockIndex >= 0) printed.add(line.right.blockIndex);
            }
          }
          const kept = doc.blocks.filter((b, i) => b.kind === 'section' || printed.has(i));
          const host = dom(readingHtml(doc, layout, 'include').html);
          const reading = host.querySelector('section.reading') as HTMLElement;

          // Never a note's brackets, a boneyard, or its words.
          const all = reading.textContent ?? '';
          expect(all).not.toContain('[[');
          expect(all).not.toContain('/*');
          expect(all).not.toContain('BONEYARD-WORD');

          // One speech per printed cue.
          expect(reading.querySelectorAll('.speech').length).toBe(
            kept.filter((b) => b.kind === 'character').length,
          );

          // The printed blocks' text, once each, in source order: no notes, no scene numbers.
          const copy = reading.cloneNode(true) as HTMLElement;
          for (const e of copy.querySelectorAll('aside, .sn')) e.remove();
          expect(squash(copy.textContent ?? '')).toBe(squash(kept.map(expectedText).join('')));

          // Unique ids, each a heading's.
          const ids = [...reading.querySelectorAll('[id]')].map((e) => e.id);
          expect(new Set(ids).size).toBe(ids.length);

          // Heading levels never skip, under the file's h1.
          let level = 1;
          for (const h of reading.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
            const next = Number(h.tagName[1]);
            expect(next).toBeGreaterThanOrEqual(2);
            expect(next).toBeLessThanOrEqual(level + 1);
            level = next;
          }
          expect(reading.outerHTML).not.toMatch(/style=/i);
        }),
        { numRuns: 60 },
      );
    });
  }
});
