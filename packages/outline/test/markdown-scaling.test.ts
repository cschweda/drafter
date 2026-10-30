import { type Doc, parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { describe, expect, test } from 'vitest';
import { type SceneIndex, sceneIndex, scriptMarkdown } from '../src';
import { screenplay } from './helpers';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

// A scene of every kind of block the Markdown writes, notes included, with emphasis and
// Markdown's own characters in it.
const scene = (n: number) => `# Part ${n}

= What happens in part ${n}.

INT. ROOM ${n} - DAY #${n}#

Mara crosses to the *window* and looks down at the **street** -- where the _rain_ has not stopped [[Check: the rain]] since morning. 1. # > & | ~ <b>

MARA
(quietly)
If he comes back, tell him I waited.

DANNY ^
I'm not telling him that.

>INTERMISSION<

~Rain on the roof,
~rain on the road.

/* An old line. */

===

CUT TO:

`;

/** `n` scenes, parsed, with their scene index. */
function make(n: number): { doc: Doc; index: SceneIndex } {
  let text = 'Title: The Long Rain\nAuthor: M. Ito\n\n';
  for (let i = 0; i < n; i++) text += scene(i);
  const doc = parse(text);
  for (const block of doc.blocks) for (const line of block.lines) void line.inline;
  return { doc, index: sceneIndex(doc, screenplay, null) };
}

describe('scriptMarkdown at length', () => {
  test(
    'a 120-page script and one four times as long export in linear time',
    () => {
      const n = 120;
      const { doc } = make(n);
      const pages = paginate(doc, screenplay).pages.length;
      expect(pages).toBeGreaterThanOrEqual(120);
      const { growth } = scaling(
        make,
        ({ doc, index }) =>
          scriptMarkdown(doc, index, screenplay, { sceneNumbers: 'all', notes: 'include' }),
        n,
      );
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
