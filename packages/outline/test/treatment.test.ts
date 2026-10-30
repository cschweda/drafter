import { describe, expect, test } from 'vitest';
import { treatment } from '../src';
import { indexOf, SAMPLE_STAGE_PLAY } from './helpers';

const SCRIPT = `Title: The Call
Author: A. Writer

# Act One

= The setup.

INT. A - DAY

= She waits.

The *phone* rings. [[A note.]]

ANN
Hi.

## The visit

INT. B - DAY #2#

Danny arrives
soaked.
`;

const of = (source: string, firstAction = false) => {
  const { doc, index } = indexOf(source);
  return treatment(doc, index, { firstAction });
};

describe('treatment', () => {
  test('writes the title, sections, scenes, and synopses as Markdown', () => {
    expect(of(SCRIPT)).toBe(
      '# The Call\n\n## Act One\n\nThe setup.\n\n### INT. A - DAY\n\nShe waits.\n\n### The visit\n\n#### INT. B - DAY\n',
    );
  });

  test("adds each scene's first action paragraph when asked", () => {
    expect(of(SCRIPT, true)).toBe(
      '# The Call\n\n## Act One\n\nThe setup.\n\n### INT. A - DAY\n\nShe waits.\n\nThe phone rings.\n\n### The visit\n\n#### INT. B - DAY\n\nDanny arrives soaked.\n',
    );
  });

  test("escapes Markdown in the writer's text", () => {
    expect(of('INT. A - DAY\n\n= 1. *Not* a [list] <b> # here_\n')).toBe(
      '# Treatment\n\n## INT. A - DAY\n\n1\\. \\*Not\\* a \\[list] \\<b> # here\\_\n',
    );
  });

  test("the treatment escapes as the script's Markdown does", () => {
    expect(of('INT. A - DAY\n\n= ---\n\n= Fish &amp; chips\n')).toBe(
      '# Treatment\n\n## INT. A - DAY\n\n\\---\n\nFish \\&amp; chips\n',
    );
  });

  test('escapes headings without the guards a line start needs', () => {
    expect(of('# 1. The *start* #\n\nINT. A - DAY\n')).toBe(
      '# Treatment\n\n## 1. The \\*start\\* \\#\n\n### INT. A - DAY\n',
    );
  });

  test("writes a play's acts and scenes", () => {
    const out = of(SAMPLE_STAGE_PLAY);
    expect(out.startsWith('# The Call\n\n## Act One\n\n### Scene 1\n')).toBe(true);
    expect(out).toContain('\n### Scene 2\n');
  });
});
