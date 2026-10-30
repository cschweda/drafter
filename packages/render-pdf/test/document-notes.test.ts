import { PAPER_POINTS, type Paper } from '@drafter/templates';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { documentBlocks } from '../src/document/blocks';
import { type DocItem, type DocLayout, layoutDocument } from '../src/document/layout';
import type { DocLine } from '../src/document/lines';
import { footnotes } from '../src/document/notes';
import { paginate, paginateWithNotes } from '../src/document/paginate';
import { STYLE } from '../src/document/style';
import { fixedMeasure, md } from './document-helpers';

type Text = Extract<DocItem, { kind: 'text' }>;
const layout = (source: string, paper: Paper = 'letter') =>
  layoutDocument(md(source), { paper, measure: fixedMeasure });
const texts = (items: DocItem[]) => items.filter((i): i is Text => i.kind === 'text');
/** A page's text in the foot (the notes), in the order drawn. */
const footTexts = (layout: DocLayout, page: number) => {
  const p = layout.pages[page];
  if (!p || p.footTop === null) return [];
  const top = p.footTop;
  return texts(p.items).filter((t) => t.y < top && t.y > STYLE.margin - 1e-6);
};
/** A page's text above the foot, but the page number. */
const bodyTexts = (layout: DocLayout, page: number) => {
  const p = layout.pages[page];
  if (!p) return [];
  const top = p.footTop ?? STYLE.margin;
  return texts(p.items).filter((t) => t.y >= top);
};
/** Paragraphs of invented words, `count` of them, about five lines each on letter. */
const filler = (count: number, tag = 'ost') =>
  Array.from(
    { length: count },
    (_, i) => `${tag}${i} ${'vorn taleb quisp marrowy plenk dravish ulm senner '.repeat(9)}`,
  ).join('\n\n');

describe('footnotes', () => {
  it('numbers notes by first reference, and gives each note the last number of the notes inside it', () => {
    const tree = md('A[^z] B[^y] A[^z].\n\n[^y]: Y, see[^x].\n[^z]: Z.\n[^x]: X.\n[^w]: Unused.\n');
    const { numbers, notes, last } = footnotes(tree);
    expect([...numbers]).toEqual([
      ['z', 1],
      ['y', 2],
      ['x', 3],
    ]);
    expect(notes.map((n) => n.identifier)).toEqual(['z', 'y', 'x']);
    expect(last).toEqual([1, 3, 3]);
  });
});

describe('a footnote’s reference', () => {
  it('is a raised, smaller number that carries its note', () => {
    const [block] = documentBlocks(md('Ost[^a] vorn.\n\n[^a]: Note.\n'), 468);
    const sup = block?.runs.find((run) => run.note !== undefined);
    expect(sup).toMatchObject({ text: '1', note: 1 });
    expect(sup?.size).toBeLessThan(STYLE.textSize);
    expect(sup?.rise).toBeGreaterThan(0);
    // Two references side by side stay two numbers.
    const [two] = documentBlocks(md('Ost[^a][^b].\n\n[^a]: A.\n[^b]: B.\n'), 468);
    expect(two?.runs.filter((run) => run.note !== undefined).map((run) => run.text)).toEqual([
      '1',
      '2',
    ]);
  });

  it('prints no definition in the body', () => {
    const blocks = documentBlocks(md('Ost.\n\n[^a]: Note.\n'), 468);
    expect(blocks.map((b) => b.runs.map((r) => r.text).join(''))).toEqual(['Ost.']);
  });
});

describe('footnotes on the page', () => {
  it('prints a note at the foot of its page, under a short rule, smaller, numbered to match', () => {
    const result = layout('Ost vorn[^a] ulm.\n\n[^a]: The note, ka.\n');
    expect(result.pages).toHaveLength(1);
    const page = result.pages[0];
    expect(page?.footTop).not.toBeNull();
    const foot = footTexts(result, 0);
    expect(foot.map((t) => t.text)).toEqual(['1.', 'The note, ka.']);
    expect(foot.every((t) => t.size === STYLE.notes.size)).toBe(true);
    // The rule: short, above the notes, below the text.
    const rule = page?.items.find(
      (i): i is Extract<DocItem, { kind: 'line' }> =>
        i.kind === 'line' && i.y1 < (page.footTop ?? 0) + 1e-6 && i.y1 > STYLE.margin,
    );
    expect(rule?.x1).toBe(STYLE.margin);
    expect((rule?.x2 ?? 0) - (rule?.x1 ?? 0)).toBe(STYLE.notes.ruleWidth);
    // The body's superscript says 1, and carries the note.
    const sup = bodyTexts(result, 0).find((t) => t.note === 1);
    expect(sup?.text).toBe('1');
    const line = bodyTexts(result, 0).find((t) => t.text.startsWith('Ost'));
    expect(sup?.y).toBeGreaterThan(line?.y ?? 0);
  });

  it('a page without notes has no foot', () => {
    expect(layout('Ost vorn.').pages[0]?.footTop).toBeNull();
  });

  it('moves a line to the next page when its notes don’t fit under it', () => {
    // Fill page 1 nearly to the bottom, then a line whose note needs more room than is left.
    const note = 'Taleb quisp. '.repeat(40);
    const source = `${filler(9)}\n\nLast[^a] line.\n\n[^a]: ${note}\n`;
    const result = layout(source);
    const pageOf = (pred: (t: Text) => boolean) =>
      result.pages.findIndex((p) => texts(p.items).some(pred));
    const refPage = pageOf((t) => t.note === 1);
    const notePage = result.pages.findIndex((_, i) =>
      footTexts(result, i).some((t) => t.text === '1.'),
    );
    expect(refPage).toBe(notePage);
    expect(refPage).toBeGreaterThan(0);
  });

  it('continues a note too long for its page at the foot of the next', () => {
    const long = Array.from({ length: 120 }, (_, i) => `note${i}`).join(' ');
    // The reference is the page's first line, so its note starts under it however long it is.
    const source = `Ost[^a] vorn.\n\n${filler(12, 'ulm')}\n\n[^a]: ${long}\n\n    ${long}\n\n    ${long}\n\n    ${long}\n\n    ${long}\n\n    ${long}\n`;
    const result = layout(source);
    const pages = result.pages.map((_, i) =>
      footTexts(result, i)
        .map((t) => t.text)
        .join(' '),
    );
    const first = pages.findIndex((t) => t.includes('note0'));
    expect(first).toBe(0);
    expect(pages[1]).toMatch(/note\d+/);
    // Every word of the note, once, in order.
    const words = pages
      .join(' ')
      .split(/\s+/)
      .filter((w) => /^note\d+$/.test(w));
    expect(words).toEqual(Array.from({ length: 6 }, () => long.split(' ')).flat());
  });
});

// Random documents with notes: invented words, so no sample text comes from anywhere else.
const WORDS = ['vorn', 'taleb', 'quisp', 'marrowy', 'ost', 'plenk', 'dravish', 'ulm', 'senner'];
const LABELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const arbWords = (min: number, max: number) =>
  fc.array(fc.constantFrom(...WORDS), { minLength: min, maxLength: max }).map((w) => w.join(' '));
const arbRef = fc.constantFrom(...LABELS).map((label) => `[^${label}]`);
const arbParagraph = fc
  .array(fc.oneof({ weight: 5, arbitrary: arbWords(1, 12) }, { weight: 1, arbitrary: arbRef }), {
    minLength: 1,
    maxLength: 30,
  })
  .map((parts) => parts.join(' '));
const arbBlock = fc.oneof(
  { weight: 6, arbitrary: arbParagraph },
  { weight: 1, arbitrary: arbWords(1, 5).map((w) => `## ${w}`) },
  {
    weight: 1,
    arbitrary: fc
      .array(arbParagraph, { minLength: 1, maxLength: 4 })
      .map((items) => items.map((i) => `- ${i}`).join('\n')),
  },
  { weight: 1, arbitrary: arbParagraph.map((p) => `> ${p}`) },
);
/**
 * A note's text: words tagged with its label, so each note's words can be told apart. Some notes
 * are long, so notes often don't fit under their line, and some are longer than a page.
 */
const arbNote = (label: string) =>
  fc
    .array(
      fc.oneof(
        { weight: 4, arbitrary: fc.integer({ min: 1, max: 60 }) },
        { weight: 1, arbitrary: fc.integer({ min: 200, max: 900 }) },
      ),
      { minLength: 1, maxLength: 4 },
    )
    .map((paragraphs) =>
      paragraphs
        .map((words, p) => Array.from({ length: words }, (_, i) => `n${label}${p}x${i}`).join(' '))
        .join('\n\n    '),
    );
const arbDocument = fc
  .tuple(
    fc.array(arbBlock, { minLength: 1, maxLength: 40 }),
    fc.tuple(...LABELS.map((label) => fc.option(arbNote(label)))),
  )
  .map(([blocks, notes]) => {
    const defs = notes.flatMap((note, i) => (note === null ? [] : [`[^${LABELS[i]}]: ${note}`]));
    const body = blocks.join('\n\n');
    return { body, source: `${body}\n\n${defs.join('\n\n')}\n` };
  });
const arbPaper = fc.constantFrom<Paper>('letter', 'a4');
const RUNS = { numRuns: 120 };
const EPS = 1e-6;

/** The words of note `label` as written: `n<label><paragraph>x<word>`. */
const isNoteWord = (word: string) => /^n[a-h]\d+x\d+$/.test(word);

describe('footnotes, over random documents', () => {
  it('prints every referenced note exactly once, in number order, and no other', () => {
    fc.assert(
      fc.property(arbDocument, arbPaper, ({ source }, paper) => {
        const tree = md(source);
        const { notes } = footnotes(tree);
        const result = layoutDocument(tree, { paper, measure: fixedMeasure });
        const printed = result.pages
          .flatMap((_, i) => footTexts(result, i).map((t) => t.text))
          .join(' ')
          .split(/\s+/)
          .filter(isNoteWord);
        const expected = notes.flatMap((note) =>
          (note.children ?? []).flatMap((p) =>
            (p.children ?? []).flatMap((t) => (t.value ?? '').split(/\s+/).filter(isNoteWord)),
          ),
        );
        expect(printed).toEqual(expected);
        // The markers count 1, 2, 3 down the pages.
        const markers = result.pages.flatMap((_, i) =>
          footTexts(result, i)
            .filter((t) => /^\d+\.$/.test(t.text))
            .map((t) => Number.parseInt(t.text, 10)),
        );
        expect(markers).toEqual(notes.map((_, i) => i + 1));
        // And no note's word is in the body.
        for (let i = 0; i < result.pages.length; i++) {
          for (const t of bodyTexts(result, i))
            expect(t.text.split(/\s+/).some(isNoteWord)).toBe(false);
        }
      }),
      RUNS,
    );
  });

  it('starts each note on the page of its first reference, unless the notes before it fill that foot', () => {
    fc.assert(
      fc.property(arbDocument, arbPaper, ({ source }, paper) => {
        const tree = md(source);
        const { numbers } = footnotes(tree);
        const result = layoutDocument(tree, { paper, measure: fixedMeasure });
        const refPage = new Map<number, number>();
        /** Each note's first reference. */
        const refItem = new Map<number, Text>();
        const startPage = new Map<number, number>();
        /** The last page each note's words are on. */
        const endPage = new Map<number, number>();
        result.pages.forEach((_, i) => {
          for (const t of bodyTexts(result, i))
            if (t.note !== undefined && !refPage.has(t.note)) {
              refPage.set(t.note, i);
              refItem.set(t.note, t);
            }
          for (const t of footTexts(result, i)) {
            if (/^\d+\.$/.test(t.text)) startPage.set(Number.parseInt(t.text, 10), i);
            for (const word of t.text.split(/\s+/).filter(isNoteWord))
              endPage.set(numbers.get(word.charAt(1)) as number, i);
          }
        });
        expect([...startPage.keys()].sort((a, b) => a - b)).toEqual(
          [...refPage.keys()].sort((a, b) => a - b),
        );
        for (const [n, start] of startPage) {
          const ref = refPage.get(n) as number;
          if (start === ref) continue;
          // Later only when the reference's line is first on its page and the notes before this one
          // fill that page's foot: the note before it started by then (or waited too), and this one
          // starts on the next page with room, the page that note ends on or the one after.
          expect(start).toBeGreaterThan(ref);
          const sup = refItem.get(n) as Text;
          expect(bodyTexts(result, ref).filter((t) => t.y > sup.y + EPS)).toEqual([]);
          const before = startPage.get(n - 1) as number;
          expect(before <= ref || before > (refPage.get(n - 1) as number)).toBe(true);
          expect([start - 1, start]).toContain(endPage.get(n - 1));
        }
      }),
      RUNS,
    );
  });

  it('keeps the notes below the text and above the bottom margin, and nothing overlaps', () => {
    fc.assert(
      fc.property(arbDocument, arbPaper, ({ source }, paper) => {
        const result = layout(source, paper);
        const { width, height } = PAPER_POINTS[paper];
        const top = height - STYLE.margin;
        result.pages.forEach((page, i) => {
          const box = (t: Text) => ({
            x1: t.x,
            x2: t.x + fixedMeasure.width(t.text, t.face, t.size),
            y1: t.y - 0.2 * t.size,
            y2: t.y + 0.8 * t.size,
          });
          const body = bodyTexts(result, i).filter(
            (t) => !(result.pages.length > 1 && t.y === STYLE.pageNumber.baselineFromBottom),
          );
          const foot = footTexts(result, i);
          for (const t of foot) {
            const b = box(t);
            expect(b.y1).toBeGreaterThanOrEqual(STYLE.margin - EPS);
            expect(b.y2).toBeLessThanOrEqual((page.footTop ?? 0) + EPS);
            expect(b.x2).toBeLessThanOrEqual(width - STYLE.margin + EPS);
            expect(b.x1).toBeGreaterThanOrEqual(STYLE.margin - EPS);
          }
          for (const t of body) {
            const b = box(t);
            expect(b.y2).toBeLessThanOrEqual(top + EPS);
            // The body's lines stand above the foot, whose top is where they end at the lowest.
            expect(b.y1).toBeGreaterThanOrEqual((page.footTop ?? STYLE.margin) - EPS);
          }
          // Every item but the page number is inside the margins.
          for (const item of page.items) {
            if (item.kind === 'text' && item.y === STYLE.pageNumber.baselineFromBottom) continue;
            const ys =
              item.kind === 'text'
                ? [item.y - 0.2 * item.size, item.y + 0.8 * item.size]
                : item.kind === 'line'
                  ? [item.y1, item.y2]
                  : [item.y, item.y + item.height];
            for (const y of ys) {
              expect(y).toBeGreaterThanOrEqual(STYLE.margin - EPS);
              expect(y).toBeLessThanOrEqual(top + EPS);
            }
          }
          // No two text items overlap.
          const boxes = [...body, ...foot]
            .filter((t) => t.text.trim() !== '')
            .map(box)
            .sort((p, q) => p.y1 - q.y1);
          for (let a = 0; a < boxes.length; a++) {
            const p = boxes[a] as ReturnType<typeof box>;
            for (let b = a + 1; b < boxes.length; b++) {
              const q = boxes[b] as ReturnType<typeof box>;
              if (q.y1 >= p.y2 - EPS) break;
              expect(Math.min(p.x2, q.x2) - Math.max(p.x1, q.x1)).toBeLessThanOrEqual(EPS);
            }
          }
        });
      }),
      RUNS,
    );
  });

  it('draws every word of the body once, in order, a reference with no note as written', () => {
    fc.assert(
      fc.property(arbDocument, arbPaper, ({ body, source }, paper) => {
        const tree = md(source);
        const { numbers } = footnotes(tree);
        const result = layoutDocument(tree, { paper, measure: fixedMeasure });
        const drawn = result.pages
          .flatMap((_, i) => bodyTexts(result, i))
          .filter((t) => !(result.pages.length > 1 && t.y === STYLE.pageNumber.baselineFromBottom))
          .filter((t) => t.note === undefined && !/^(•|◦|▪)$/.test(t.text))
          .flatMap((t) => t.text.split(/\s+/))
          .filter((w) => w !== '');
        const written = body
          .split(/\s+/)
          .filter((w) => w !== '' && !/^(-|>|##)$/.test(w))
          .filter((w) => !(/^\[\^[a-h]\]$/.test(w) && numbers.has(w.slice(2, -1))));
        expect(drawn).toEqual(written);
      }),
      RUNS,
    );
  });

  it('pagination, given any heights: every line and every note line once, in order, and each page’s text and notes within it', () => {
    const line = (height: number): DocLine => ({ fragments: [], height, ascent: 0 });
    const arb = fc
      .tuple(
        fc.array(
          fc.record({
            heights: fc.array(fc.integer({ min: 5, max: 30 }), { minLength: 1, maxLength: 8 }),
            spaceBefore: fc.integer({ min: 0, max: 12 }),
            keepWithNext: fc.boolean(),
            notes: fc.array(fc.nat({ max: 3 }), { minLength: 8, maxLength: 8 }),
          }),
          { maxLength: 14 },
        ),
        fc.array(
          fc.array(
            fc.record({
              heights: fc.array(fc.integer({ min: 4, max: 20 }), { minLength: 1, maxLength: 12 }),
              spaceBefore: fc.integer({ min: 0, max: 8 }),
            }),
            { minLength: 1, maxLength: 3 },
          ),
          { maxLength: 30 },
        ),
      )
      .map(([specs, noteSpecs]) => {
        // Notes are carried in order: each line takes the next few, until there are none left.
        let next = 0;
        const blocks = specs.map((spec) => ({
          lines: spec.heights.map(line),
          spaceBefore: spec.spaceBefore,
          keepWithNext: spec.keepWithNext,
          notes: spec.heights.map((_, i) => {
            const count = Math.min(spec.notes[i] ?? 0, noteSpecs.length - next);
            const mine = Array.from({ length: count }, (_, k) => next + k);
            next += count;
            return mine.length > 0 ? mine : undefined;
          }),
        }));
        const notes = noteSpecs
          .slice(0, next)
          .map((note) =>
            note.map((b) => ({ lines: b.heights.map(line), spaceBefore: b.spaceBefore })),
          );
        return { blocks, notes };
      });
    const H = 100;
    fc.assert(
      fc.property(arb, ({ blocks, notes }) => {
        const { pages, feet } = paginateWithNotes(blocks, H, notes);
        expect(feet).toHaveLength(pages.length);
        // The body, as paginate would place it with no notes: every line once, in order.
        const placed = pages
          .flat()
          .flatMap((s) =>
            Array.from({ length: s.to - s.from }, (_, i) => `${s.block}:${s.from + i}`),
          );
        expect(placed).toEqual(blocks.flatMap((b, i) => b.lines.map((_, j) => `${i}:${j}`)));
        const noted = feet.flatMap((f) =>
          f.slices.flatMap((s) =>
            Array.from({ length: s.to - s.from }, (_, i) => `${s.note}:${s.block}:${s.from + i}`),
          ),
        );
        expect(noted).toEqual(
          notes.flatMap((n, k) => n.flatMap((b, i) => b.lines.map((_, j) => `${k}:${i}:${j}`))),
        );
        pages.forEach((slices, p) => {
          const foot = feet[p] as (typeof feet)[number];
          const bottom = slices.reduce(
            (low, s) =>
              Math.max(
                low,
                s.top +
                  (blocks[s.block]?.lines ?? [])
                    .slice(s.from, s.to)
                    .reduce((h, l) => h + l.height, 0),
              ),
            0,
          );
          // The text never reaches into the foot, nor the foot past the page, but for a page's one
          // line placed with no room (a forced line over the rest of a note, which never happens).
          expect(bottom + foot.height).toBeLessThanOrEqual(H + EPS);
          // The foot's slices run down it without overlapping.
          let at = 0;
          for (const s of foot.slices) {
            expect(s.top).toBeGreaterThanOrEqual(at - EPS);
            at =
              s.top +
              (notes[s.note]?.[s.block]?.lines ?? [])
                .slice(s.from, s.to)
                .reduce((h, l) => h + l.height, 0);
          }
          if (foot.slices.length > 0)
            expect(at + STYLE.notes.ruleSpace).toBeCloseTo(foot.height, 6);
        });
        // With no notes, the pages are paginate's.
        const bare = blocks.map(({ notes: _notes, ...rest }) => rest);
        expect(paginateWithNotes(bare, H, []).pages).toEqual(paginate(bare, H));
      }),
      { numRuns: 400 },
    );
  });
});
