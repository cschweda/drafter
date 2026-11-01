import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { cutText, findCuts, type WorkKind } from '../src';
import { anyScript } from './arbitraries';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

// Random Markdown documents: headings of four depths, paragraphs short and long, lists, quotes and
// fenced code (a heading inside it is not one), with `\n` or `\r\n` line breaks.

const word = fc.constantFrom(
  'tide',
  'lamp',
  'Mara',
  'gull',
  'rope',
  'salt',
  'storm',
  'boat',
  'the',
);
const paragraph = fc
  .array(word, { minLength: 1, maxLength: 70 })
  .map((words) => `${words.join(' ')}.`);
const heading = fc
  .tuple(fc.integer({ min: 1, max: 4 }), fc.array(word, { minLength: 0, maxLength: 3 }))
  .map(([depth, words]) => `${'#'.repeat(depth)} ${words.join(' ')}`.trimEnd());
const block = fc.oneof(
  { weight: 4, arbitrary: paragraph },
  { weight: 2, arbitrary: heading },
  { weight: 1, arbitrary: paragraph.map((p) => `- ${p}\n- ${p}`) },
  { weight: 1, arbitrary: paragraph.map((p) => `> ${p}`) },
  {
    weight: 1,
    arbitrary: fc.tuple(heading, paragraph).map(([h, p]) => `\`\`\`\n${h}\n${p}\n\`\`\``),
  },
);
const blocks = fc.array(block, { minLength: 0, maxLength: 14 });
const finish = (parts: readonly string[], crlf: boolean, ending: boolean) => {
  const text = parts.join('\n\n') + (ending ? '\n' : '');
  return crlf ? text.replace(/\n/g, '\r\n') : text;
};
const markdownDoc = fc
  .tuple(blocks, fc.boolean(), fc.boolean())
  .map(([parts, crlf, ending]) => finish(parts, crlf, ending));

/** A document and a later version of it: blocks dropped, moved, and added. */
const markdownPair = fc
  .tuple(blocks, fc.array(fc.nat(), { maxLength: 6 }), blocks, fc.boolean(), fc.boolean())
  .map(([parts, edits, added, crlf, ending]) => {
    const later = [...parts];
    for (const e of edits) {
      if (later.length === 0) break;
      const at = e % later.length;
      const [taken] = later.splice(at, 1);
      if (e % 3 === 0 && taken !== undefined) later.splice((e * 7) % (later.length + 1), 0, taken);
    }
    later.splice(later.length > 0 ? edits.length % later.length : 0, 0, ...added.slice(0, 3));
    return [finish(parts, crlf, ending), finish(later, crlf, ending)] as const;
  });

/** A script and a later version: scenes (paragraph-separated items) dropped, moved, and added. */
const scriptPair = fc
  .tuple(anyScript, anyScript, fc.array(fc.nat(), { maxLength: 6 }))
  .map(([a, b, edits]) => {
    const items = a.split(/\r?\n\r?\n/);
    // A closing metadata block stays last, as Drafter keeps it: it names the template.
    const meta = items[items.length - 1]?.startsWith('/* drafter') ? items.pop() : undefined;
    for (const e of edits) {
      if (items.length <= 1) break;
      const [taken] = items.splice(1 + (e % (items.length - 1)), 1);
      if (e % 3 === 0 && taken !== undefined) items.splice(1 + ((e * 7) % items.length), 0, taken);
    }
    const extra = b
      .split(/\r?\n\r?\n/)
      .slice(1, 3)
      .filter((p) => !p.startsWith('/* drafter'));
    return [a, [...items, ...extra, ...(meta ? [meta] : [])].join('\n\n')] as const;
  });

/**
 * `more` written after `text`. A script gains it as a new scene (a heading of its own; written
 * with none, it would be more of the last scene), before its closing metadata block if it has
 * one: Drafter keeps that block last, and a play read without it would be read as a screenplay.
 * `more`'s own block is left out, as it would name the template of the whole text.
 */
function appended(text: string, more: string, kind: WorkKind): string {
  if (kind === 'markdown') return `${text}\n\n${more}`;
  const play = text.includes('stage-play-standard');
  const words = more.replace(/\/\* drafter[\s\S]*\*\/\s*$/, '');
  const scene = `${play ? '## Later' : 'INT. LATER - NIGHT'}\n\n${words}`;
  const block = /\/\* drafter[\s\S]*\*\/\s*$/.exec(text);
  if (!block) return `${text}\n\n${scene}`;
  return `${text.slice(0, block.index)}${scene}\n\n${text.slice(block.index)}`;
}

const kinds: { kind: WorkKind; doc: fc.Arbitrary<string> }[] = [
  { kind: 'fountain', doc: anyScript },
  { kind: 'markdown', doc: markdownDoc },
];

describe('findCuts properties', () => {
  for (const { kind, doc } of kinds) {
    test(`a text never cuts from itself (${kind})`, () => {
      fc.assert(fc.property(doc, (text) => findCuts(text, text, kind).length === 0));
    });

    test(`appending never cuts (${kind})`, () => {
      fc.assert(
        fc.property(doc, doc, (text, more) => {
          expect(findCuts(text, appended(text, more, kind), kind)).toEqual([]);
        }),
      );
    });
  }

  test('every cut’s text occurs in before (fountain)', () => {
    fc.assert(
      fc.property(scriptPair, ([before, after]) => {
        for (const cut of findCuts(before, after, 'fountain')) {
          expect(cutText(before)).toContain(cut.text);
          expect(cut.title).not.toBe('');
        }
      }),
    );
  });

  test('every cut’s text occurs in before, once each (markdown)', () => {
    fc.assert(
      fc.property(markdownPair, ([before, after]) => {
        const cuts = findCuts(before, after, 'markdown');
        expect(new Set(cuts.map((c) => c.text)).size).toBe(cuts.length);
        for (const cut of cuts) {
          expect(cutText(before)).toContain(cut.text);
          expect(cut.text.trim()).toBe(cut.text);
          expect(cut.text).not.toBe('');
        }
      }),
    );
  });

  test('a cut’s text is never in after unchanged', () => {
    const check = (before: string, after: string, kind: WorkKind) => {
      for (const cut of findCuts(before, after, kind)) {
        expect(cutText(after).includes(cut.text), cut.text).toBe(false);
      }
    };
    fc.assert(fc.property(markdownPair, ([before, after]) => check(before, after, 'markdown')));
    fc.assert(fc.property(scriptPair, ([before, after]) => check(before, after, 'fountain')));
  });

  test('removing a section of words found nowhere else always gives a cut that holds it', () => {
    const unique = fc
      .tuple(fc.integer({ min: 1, max: 3 }), fc.integer({ min: 1, max: 70 }), fc.nat())
      .map(([level, n, seed]) => {
        const body = `${words(n, seed + 1)}.`;
        return { section: `${'#'.repeat(level)} ${words(2, seed + 2)}\n\n${body}`, body };
      });
    fc.assert(
      fc.property(blocks, unique, fc.nat(), fc.boolean(), (parts, { section, body }, at, crlf) => {
        // Where a section ends: before a heading (levels 1 to 3), or at the end.
        const places = parts
          .map((p, i) => (/^#{1,3}( |$)/.test(p) ? i : -1))
          .filter((i) => i >= 0)
          .concat(parts.length);
        const k = places[at % places.length] as number;
        const after = finish(parts, crlf, true);
        const before = finish([...parts.slice(0, k), section, ...parts.slice(k)], crlf, true);
        const cuts = findCuts(before, after, 'markdown');
        expect(cuts.some((c) => c.text.includes(body))).toBe(true);
      }),
    );
  });

  test('moving paragraphs or sections never gives a cut (markdown)', () => {
    fc.assert(
      fc.property(
        blocks,
        fc.array(fc.nat(), { minLength: 1, maxLength: 4 }),
        fc.boolean(),
        (parts, moves, crlf) => {
          const later = [...parts];
          for (const m of moves) {
            if (later.length < 2) break;
            const [taken] = later.splice(m % later.length, 1);
            later.splice((m * 7 + 3) % (later.length + 1), 0, taken as string);
          }
          expect(
            findCuts(finish(parts, crlf, true), finish(later, crlf, true), 'markdown'),
          ).toEqual([]);
        },
      ),
    );
  });

  test('moving scenes never gives a cut (fountain)', () => {
    const scenes = Array.from({ length: 8 }, (_, i) => `INT. ROOM ${i} - DAY\n\n${words(30, i)}.`);
    fc.assert(
      fc.property(fc.shuffledSubarray(scenes, { minLength: 8, maxLength: 8 }), (order) => {
        expect(findCuts(scenes.join('\n\n'), order.join('\n\n'), 'fountain')).toEqual([]);
      }),
    );
  });

  test('every cut’s neighbours are headings still in after (markdown)', () => {
    fc.assert(
      fc.property(markdownPair, ([before, after]) => {
        for (const cut of findCuts(before, after, 'markdown')) {
          for (const n of [cut.where.after, cut.where.before]) {
            if (n !== null) expect(after).toContain(n);
          }
        }
      }),
    );
  });
});

// Long texts, made of original prose from a seeded stock of words, so no two scenes share much.

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

/** A small seeded random number generator (mulberry32), from 0 to 1. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function words(n: number, seed: number): string {
  const out: string[] = [];
  const next = mulberry32(seed);
  for (let i = 0; i < n; i++) out.push(STOCK[Math.floor(next() * STOCK.length)] as string);
  return out.join(' ');
}

/** A script of `n` scenes of about `size` words each, and a version with every tenth scene cut,
 * every seventh edited, and two moved. */
function longScript(n: number, size = 600): [string, string] {
  const scenes: string[] = [];
  for (let i = 0; i < n; i++) {
    const paras: string[] = [];
    for (let w = 0; w < size; w += 60) paras.push(`${words(60, i * 1000 + w)}.`);
    scenes.push(`INT. ROOM ${i} - DAY\n\n${paras.join('\n\n')}`);
  }
  const later = scenes
    .filter((_, i) => i % 10 !== 5)
    .map((s, i) => (i % 7 === 3 ? s.replace(/\.\n/, ' and then the lamp.\n') : s));
  const [moved] = later.splice(2, 1);
  later.push(moved as string);
  return [`${scenes.join('\n\n')}\n`, `${later.join('\n\n')}\n`];
}

/** The same as a Markdown document of `n` sections, with passages cut and replaced too. */
function longDocument(n: number, size = 600): [string, string] {
  const sections: string[][] = [];
  for (let i = 0; i < n; i++) {
    const paras: string[] = [];
    for (let w = 0; w < size; w += 60) paras.push(`${words(60, i * 1000 + w)}.`);
    sections.push([`${i % 20 === 0 ? '#' : '##'} Part ${i}`, ...paras]);
  }
  const later = sections
    .filter((_, i) => i % 10 !== 5)
    .map((s, i) => {
      if (i % 7 === 3) return [s[0] as string, ...s.slice(2)]; // a passage cut
      if (i % 7 === 4) return [s[0] as string, `${words(60, 999_999 - i)}.`, ...s.slice(2)]; // replaced
      if (i % 7 === 5) return s.map((p, k) => (k === 1 ? `${p} The lamp.` : p)); // edited
      return s;
    });
  const [moved] = later.splice(2, 1);
  later.push(moved as string[]);
  const join = (all: string[][]) => `${all.map((s) => s.join('\n\n')).join('\n\n')}\n`;
  return [join(sections), join(later)];
}

describe('findCuts on long texts', () => {
  test(
    '300 scenes and 200,000 words, each under a second',
    () => {
      const cases = [
        { kind: 'fountain' as const, texts: longScript(300, 670), cuts: 30 },
        // 30 sections cut; of the 270 left, 39 lose a passage and 38 have one replaced.
        { kind: 'markdown' as const, texts: longDocument(300, 670), cuts: 30 + 39 + 38 },
      ];
      for (const { kind, texts, cuts } of cases) {
        const [before, after] = texts;
        expect(before.split(/\s+/).length).toBeGreaterThan(200_000);
        expect(findCuts(before, after, kind)).toHaveLength(cuts); // and a warm-up
        let best = Number.POSITIVE_INFINITY;
        for (let i = 0; i < 3; i++) {
          const start = performance.now();
          findCuts(before, after, kind);
          best = Math.min(best, performance.now() - start);
        }
        expect(best).toBeLessThan(1_000);
      }
    },
    SCALING_TIMEOUT,
  );

  test(
    'is linear enough in the number of scenes',
    () => {
      const { growth } = scaling(
        (n) => longScript(n, 200),
        ([a, b]) => findCuts(a, b, 'fountain'),
        40,
      );
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  test(
    'is linear enough in the number of sections',
    () => {
      const { growth } = scaling(
        (n) => longDocument(n, 200),
        ([a, b]) => findCuts(a, b, 'markdown'),
        40,
      );
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  test(
    'many sections with one heading stay linear',
    () => {
      const notes = (n: number): [string, string] => {
        const all = Array.from({ length: n }, (_, i) => `## Notes\n\n${words(40, i)}.`);
        return [all.join('\n\n'), all.filter((_, i) => i % 3 !== 1).join('\n\n')];
      };
      const { growth } = scaling(notes, ([a, b]) => findCuts(a, b, 'markdown'), 400);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  test(
    'nearly identical sections and scenes stay linear',
    () => {
      const body = words(40, 7);
      const make =
        (heading: string) =>
        (n: number): [string, string] => {
          const all = Array.from({ length: n }, (_, i) => `${heading}\n\n${body} ${i}.`);
          const later = all.filter((_, i) => i % 3 !== 1).map((s) => `${s} more`);
          return [all.join('\n\n'), later.join('\n\n')];
        };
      for (const [heading, kind] of [
        ['## Notes', 'markdown'],
        ['INT. ROOM - DAY', 'fountain'],
      ] as const) {
        const { growth } = scaling(make(heading), ([a, b]) => findCuts(a, b, kind), 1000, 3);
        expect(growth, kind).toBeLessThan(MAX_GROWTH);
      }
    },
    SCALING_TIMEOUT,
  );

  test(
    'a document with no headings, rewritten throughout, stays linear',
    () => {
      const rewritten = (n: number): [string, string] => {
        const a = Array.from({ length: n }, (_, i) => `${words(60, i)}.`);
        const b = a.map((p, i) => (i % 2 === 0 ? `${words(60, i + 500_000)}.` : p));
        return [a.join('\n\n'), b.join('\n\n')];
      };
      const { growth } = scaling(rewritten, ([a, b]) => findCuts(a, b, 'markdown'), 200);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
