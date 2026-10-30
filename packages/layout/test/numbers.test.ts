import { parse } from '@drafter/fountain';
import { type Layout, paginate, type SceneNumbering, sceneNumbersFor } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fountainScript } from '../../../fixtures/generators/fountain';

const screenplay = builtins['us-screenplay'] as Template;
const play = builtins['stage-play-standard'] as Template;
const OPTIONS: SceneNumbering[] = ['none', 'written', 'all'];

const scenes = 'INT. A - DAY\n\nOne.\n\nINT. B - DAY #12A#\n\nTwo.\n\nINT. C - DAY\n\nThree.';
const numbers = (source: string, numbering: SceneNumbering, template = screenplay) =>
  [...sceneNumbersFor(parse(source), template, numbering)].map(([i, n]) => `${i}:${n}`);

/** The numbers a layout prints, in order. */
const printed = (layout: Layout) =>
  layout.pages.flatMap((page) => page.sceneNumbersLeft.map((n) => n.text));

describe('sceneNumbersFor', () => {
  it('numbers nothing, the written numbers, or every scene, as paginate prints them', () => {
    expect(numbers(scenes, 'none')).toEqual([]);
    expect(numbers(scenes, 'written')).toEqual(['2:12A']);
    expect(numbers(scenes, 'all')).toEqual(['0:1', '2:12A', '4:3']);
  });

  it('a written number keeps it under Number every scene, so two scenes can share one', () => {
    const source = 'INT. A - DAY #2#\n\nOne.\n\nINT. B - DAY\n\nTwo.';
    expect(numbers(source, 'all')).toEqual(['0:2', '2:2']);
  });

  it("a disabled scene heading (a stage play's) gets no number", () => {
    const source = '# Act One\n\n## Scene 1\n\nINT. KITCHEN - NIGHT\n\nDANNY\nHi.';
    expect(numbers(source, 'all', play)).toEqual([]);
    expect(numbers(source, 'written', play)).toEqual([]);
  });

  it("paginate's layout numbers are sceneNumbersFor's", () => {
    fc.assert(
      fc.property(
        fountainScript,
        fc.constantFrom(...OPTIONS),
        fc.constantFrom(screenplay, play),
        (source, numbering, template) => {
          const doc = parse(source);
          const layout = paginate(doc, template, { sceneNumbers: numbering });
          expect(printed(layout)).toEqual([...sceneNumbersFor(doc, template, numbering).values()]);
        },
      ),
      { numRuns: 200 },
    );
  });
});
