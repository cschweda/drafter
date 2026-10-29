import { type Doc, parse } from '@drafter/fountain';
import { builtins, resolveRole, type Template } from '@drafter/templates';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fountainScript } from '../../../fixtures/generators/fountain';
import { fromFdx, readXml, toFdx } from '../src';

// RT_RUNS raises the count for a local hunt; CI uses the default.
const TIMEOUT = process.env.RT_RUNS ? 600_000 : 5000;
const NUM_RUNS = Number(process.env.RT_RUNS ?? 250);

interface Item {
  kind: string;
  text: string;
  /** Export treats it as a scene: it carries the synopses that follow it. */
  scene: boolean;
}

// Kinds and printable text, minus boneyard (export omits it). Two print-neutral
// differences are normalized, and only these (Plan FD ruling 6): consecutive
// own-line notes may come back as separate note blocks, so adjacent notes merge;
// and a scene's synopses come back right after its heading.
function view(doc: Doc, template: Template): Item[] {
  const items: Item[] = [];
  for (const block of doc.blocks) {
    if (block.kind === 'boneyard') continue;
    const text = block.lines.map((l) => l.inline.map((r) => r.text).join('')).join('\n');
    const scene =
      block.kind === 'scene_heading' ||
      (block.kind === 'section' && resolveRole(template, block, null) === 'scene_heading_play');
    items.push({ kind: block.kind, text, scene });
  }
  return items;
}

// Export omits boneyard, so it is taken out of the source before anything is compared.
const withoutBoneyard = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');

function normalize(items: Item[]): Item[] {
  const out: Item[] = [];
  let scene = -1;
  for (const item of items) {
    if (item.scene) {
      scene = out.length;
      out.push(item);
    } else if (item.kind === 'synopsis' && scene >= 0) {
      let at = scene + 1;
      while (out[at]?.kind === 'synopsis') at++;
      out.splice(at, 0, item);
    } else {
      if (item.kind === 'section') scene = -1;
      out.push(item);
    }
  }
  const merged: Item[] = [];
  for (const item of out) {
    const last = merged[merged.length - 1];
    if (item.kind === 'note' && last?.kind === 'note') last.text = `${last.text}\n${item.text}`;
    else merged.push({ ...item });
  }
  // Export marks the next paragraph as starting a page: a page break right after another
  // adds nothing, and one with no paragraph after it is dropped (ruling 3).
  const pages = merged.filter(
    (item, i) => !(item.kind === 'page_break' && merged[i - 1]?.kind === 'page_break'),
  );
  while (pages[pages.length - 1]?.kind === 'page_break') pages.pop();
  return pages;
}

describe('the round trip: shrunk failures', () => {
  const screenplay = builtins['us-screenplay'];

  it('keeps a page break between a speech and a lyric', () => {
    const source = 'MARGARET\nthe.\n\n===\n\n~the.';
    const before = parse(source);
    const after = parse(fromFdx(toFdx(before, screenplay)).text);
    expect(after.blocks.map((b) => b.kind)).toEqual(before.blocks.map((b) => b.kind));
  });
});

describe.each([
  ['us-screenplay', builtins['us-screenplay']],
  ['stage-play-standard', builtins['stage-play-standard']],
])('the round trip through Final Draft: %s', (_name, template) => {
  it(
    'exports the same file after an import',
    () => {
      fc.assert(
        fc.property(fountainScript, (source) => {
          const x1 = toFdx(parse(source), template);
          const x2 = toFdx(parse(fromFdx(x1).text), template);
          expect(readXml(x2)).toEqual(readXml(x1));
        }),
        { numRuns: NUM_RUNS },
      );
    },
    TIMEOUT,
  );

  it(
    'imports the kinds and printable text it exported',
    () => {
      fc.assert(
        fc.property(fountainScript, (source) => {
          const before = parse(withoutBoneyard(source));
          const after = parse(fromFdx(toFdx(before, template)).text);
          expect(normalize(view(after, template))).toEqual(normalize(view(before, template)));
        }),
        { numRuns: NUM_RUNS },
      );
    },
    TIMEOUT,
  );
});
