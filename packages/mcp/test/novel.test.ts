import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { answerOf, type Connected, connect } from './connect';
import { put, tempFolder } from './temp';

// A novel is a Markdown file whose comment names the novel template (Novel plan, Task 9). The
// server reads it as Markdown, names its kind `novel`, and numbers its parts, chapters, and
// sections as the units the other tools read.

const META = {
  template: 'novel',
  novel: {
    nodes: {
      'chapter:the-salt-road:0': {
        status: 'draft',
        synopsis: 'She walks out at low tide.',
        target: 3000,
      },
      'section:low-tide:0': { status: 'done' },
    },
  },
};
const NOVEL = `# Part One

# The Salt Road

She walked out.

## Low Tide

The gulls wheeled.

***

A second beat.

# The Light

An ending.

<!-- drafter ${JSON.stringify(META)} -->
`;

let open: Connected | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
});

async function novel(text = NOVEL) {
  const scripts = join(tempFolder(), 'Scripts');
  put(join(scripts, 'Low Tide.md'), text);
  put(join(scripts, 'Notes.md'), '# Notes\n\nPlain.\n');
  open = await connect({ folders: [scripts] });
  return open;
}

describe('a novel through Drafter for Claude', () => {
  it('list_scripts names its kind novel, and a plain Markdown file stays markdown', async () => {
    const server = await novel();
    const got = answerOf<{ files: Array<{ path: string; kind: string; scenes: number }> }>(
      await server.call('list_scripts', {}),
    );
    const byName = Object.fromEntries(got.files.map((f) => [f.path.split('/').pop(), f]));
    expect(byName['Low Tide.md']?.kind).toBe('novel');
    // A part, two chapters, a section, and an untitled section.
    expect(byName['Low Tide.md']?.scenes).toBe(5);
    expect(byName['Notes.md']?.kind).toBe('markdown');
  });

  it('script_overview returns its parts, chapters, and sections with what the writer keeps', async () => {
    const server = await novel();
    const got = answerOf<{ sections: Array<Record<string, unknown>> }>(
      await server.call('script_overview', { script: 'Scripts/Low Tide.md' }),
    );
    expect(got.sections.map((s) => [s.kind, s.title])).toEqual([
      ['part', 'Part One'],
      ['chapter', 'The Salt Road'],
      ['section', 'Low Tide'],
      ['section', '(untitled section)'],
      ['chapter', 'The Light'],
    ]);
    expect(got.sections[1]).toMatchObject({
      status: 'draft',
      synopsis: 'She walks out at low tide.',
      target: 3000,
    });
    expect(got.sections[2]).toMatchObject({ status: 'done' });
    expect(got.sections[4]).not.toHaveProperty('status');
  });

  it('read_scene reads a unit by its number, and the comment is never shown', async () => {
    const server = await novel();
    const got = answerOf<{ scenes: Array<{ heading: string; text: string }> }>(
      await server.call('read_scene', { script: 'Scripts/Low Tide.md', scene: '5' }),
    );
    expect(got.scenes[0]?.heading).toBe('The Light');
    expect(got.scenes[0]?.text).toContain('An ending.');
    expect(got.scenes[0]?.text).not.toContain('drafter');
  });

  it('hostile facts are capped or ignored, never thrown', async () => {
    const hostile = {
      template: 'novel',
      novel: {
        nodes: {
          'chapter:the-salt-road:0': { status: 'nope', synopsis: 'x'.repeat(50_000), target: -1 },
          __proto__: { status: 'done' },
        },
      },
    };
    const text = NOVEL.replace(
      /<!-- drafter .* -->/,
      `<!-- drafter ${JSON.stringify(hostile)} -->`,
    );
    const server = await novel(text);
    const got = answerOf<{ sections: Array<{ synopsis?: string; status?: string }> }>(
      await server.call('script_overview', { script: 'Scripts/Low Tide.md' }),
    );
    expect(got.sections[1]?.status).toBeUndefined();
    expect((got.sections[1]?.synopsis ?? '').length).toBeLessThanOrEqual(2000);
  });
});
