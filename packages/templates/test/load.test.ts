import { loadTemplate, loadTemplates, type Template, TemplateError } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { rawTemplate, variant } from './helpers';

/** The problems a load reports, or [] if it loads. */
function problemsOf(load: () => unknown): string[] {
  try {
    load();
    return [];
  } catch (error) {
    if (error instanceof TemplateError) return error.problems;
    throw error;
  }
}

describe('loadTemplate', () => {
  it('loads a complete template and fills in the keep-with-next default', () => {
    const template = loadTemplate(rawTemplate());
    expect(template).toMatchObject(rawTemplate());
    expect(template.keepWithNextLines).toBe(2);
  });

  it('converts inches: horizontal values at 10 characters, vertical at 6 lines', () => {
    const template = loadTemplate(
      variant((t) => {
        t.page.margin.left = { in: 1.5 };
        t.page.margin.top = { in: 1 };
        t.roles.dialogue.indent = { in: 1 };
        t.roles.scene_heading.spaceBefore = { in: 0.5 };
        t.roles.transition.indent = { in: 4.0 };
      }),
    );
    expect(template.page.margin.left).toBe(15);
    expect(template.page.margin.top).toBe(6);
    expect(template.roles.dialogue?.indent).toBe(10);
    expect(template.roles.scene_heading?.spaceBefore).toBe(3);
    expect(template.roles.transition?.indent).toBe(40);
  });

  it('rejects an inch value that lands between characters', () => {
    const problems = problemsOf(() =>
      loadTemplate(variant((t) => (t.page.margin.left = { in: 1.25 }))),
    );
    expect(problems).toEqual([expect.stringMatching(/page\.margin\.left.*1\.25 in.*12\.5/)]);
  });

  it('rejects a negative width', () => {
    expect(problemsOf(() => loadTemplate(variant((t) => (t.roles.action.width = -5))))).toEqual([
      expect.stringMatching(/roles\.action\.width.*at least 1.*-5/),
    ]);
  });

  it('rejects a role wider than the text column', () => {
    expect(
      problemsOf(() => loadTemplate(variant((t) => (t.roles.transition.indent = 50)))),
    ).toEqual([expect.stringMatching(/roles\.transition.*70.*60-character/)]);
  });

  it('rejects a page grid larger than its paper', () => {
    expect(problemsOf(() => loadTemplate(variant((t) => (t.page.paper = 'a4'))))).toEqual([
      expect.stringMatching(/page\.width 85.*a4.*82/),
    ]);
  });

  it('rejects a missing role style that the catch-all rule needs', () => {
    const problems = problemsOf(() => loadTemplate(variant((t) => delete t.roles.dialogue)));
    expect(problems).toEqual([expect.stringMatching(/"dialogue" blocks.*no "dialogue" style/)]);
  });

  it('rejects a rule that produces an undefined role', () => {
    const problems = problemsOf(() =>
      loadTemplate(variant((t) => t.roleMap.unshift({ kind: 'action', role: 'stage_direction' }))),
    );
    expect(problems).toEqual([expect.stringMatching(/roleMap\[0\].*"stage_direction".*no style/)]);
  });

  it('rejects a kind that no rule maps unconditionally', () => {
    const problems = problemsOf(() =>
      loadTemplate(
        variant((t) => {
          t.roleMap = [
            { kind: ['section', 'synopsis', 'note', 'boneyard'], role: 'omit' },
            { kind: 'character', names: ['SFX'], role: 'character' },
            {
              kind: ['scene_heading', 'action', 'parenthetical', 'dialogue', 'transition'],
              role: '@kind',
            },
            { kind: ['centered', 'lyric'], role: '@kind' },
          ];
        }),
      ),
    );
    expect(problems).toEqual([expect.stringMatching(/no rule.*"character" blocks/)]);
  });

  it('rejects a pattern where a list of names belongs', () => {
    const problems = problemsOf(() =>
      loadTemplate(
        variant((t) => t.roleMap.unshift({ kind: 'character', names: '^SFX$', role: 'character' })),
      ),
    );
    expect(problems).toEqual([expect.stringMatching(/roleMap\[0\]\.names.*list of names/)]);
  });

  it('rejects an unknown block kind and an unknown field', () => {
    const problems = problemsOf(() =>
      loadTemplate(
        variant((t) => {
          t.roleMap.unshift({ kind: 'monologue', role: 'action' });
          t.roles.action.colour = 'blue';
        }),
      ),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/roleMap\[0\]\.kind.*"monologue"/),
        expect.stringMatching(/roles\.action\.colour.*unknown/),
      ]),
    );
    expect(problems).toHaveLength(2);
  });

  it('lists every problem in one error', () => {
    const problems = problemsOf(() =>
      loadTemplate(
        variant((t) => {
          t.roles.action.width = -5;
          t.page.paper = 'tabloid';
          delete t.titlePage;
        }),
      ),
    );
    expect(problems).toHaveLength(3);
  });

  it('rejects input that is not an object', () => {
    expect(problemsOf(() => loadTemplate('us-screenplay'))).toEqual([
      expect.stringMatching(/JSON object/),
    ]);
  });

  it('does not modify the JSON it was given', () => {
    const json = variant((t) => (t.page.margin.left = { in: 1.5 }));
    const before = structuredClone(json);
    loadTemplate(json);
    expect(json).toEqual(before);
  });
});

describe('extends', () => {
  const parent = () => loadTemplate(rawTemplate());

  it('merges objects key by key, with the child winning', () => {
    const child = loadTemplate(
      { id: 'child', name: 'Child', extends: 'test', roles: { dialogue: { lineSpacing: 2 } } },
      new Map([['test', parent()]]),
    );
    expect(child.id).toBe('child');
    expect(child.roles.dialogue).toEqual({ indent: 10, width: 35, spaceBefore: 0, lineSpacing: 2 });
    expect(child.roles.action).toEqual({ indent: 0, width: 60, spaceBefore: 1 });
  });

  it("puts the child's role rules before the parent's", () => {
    const child = loadTemplate(
      {
        id: 'child',
        name: 'Child',
        extends: 'test',
        roles: { stage_direction: { indent: 10, width: 50, spaceBefore: 1 } },
        roleMap: [{ kind: 'action', role: 'stage_direction' }],
      },
      new Map([['test', parent()]]),
    );
    expect(child.roleMap.map((r) => r.role)).toEqual(['stage_direction', 'omit', '@kind']);
  });

  it('replaces every other array', () => {
    const base = loadTemplate(variant((t) => (t.lint = { enable: ['similar-names'] })));
    const child = loadTemplate(
      { id: 'child', name: 'Child', extends: 'test', lint: { enable: ['long-speech'] } },
      new Map([['test', base]]),
    );
    expect(child.lint?.enable).toEqual(['long-speech']);
  });

  it('validates the merged result, not the child alone', () => {
    const problems = problemsOf(() =>
      loadTemplate(
        { id: 'child', name: 'Child', extends: 'test', roles: { action: { width: 99 } } },
        new Map([['test', parent()]]),
      ),
    );
    expect(problems).toEqual([expect.stringMatching(/roles\.action.*99.*60-character/)]);
  });

  it('extends the built-in templates by default', () => {
    const child = loadTemplate({ id: 'mine', name: 'Mine', extends: 'us-screenplay' });
    expect(child.roles.dialogue).toBeDefined();
  });

  it('rejects an unknown parent', () => {
    expect(
      problemsOf(() => loadTemplate({ id: 'child', name: 'Child', extends: 'nowhere' })),
    ).toEqual([expect.stringMatching(/extends "nowhere".*isn't loaded/)]);
  });

  it('rejects a template that extends itself', () => {
    expect(
      problemsOf(() => loadTemplate({ ...rawTemplate(), extends: 'test' }, new Map())),
    ).toEqual([expect.stringMatching(/extends itself/)]);
  });
});

describe('loadTemplates', () => {
  const registry = () => new Map<string, Template>([['test', loadTemplate(rawTemplate())]]);

  it('loads a set in dependency order', () => {
    const templates = loadTemplates(
      [
        { id: 'b', name: 'B', extends: 'a', roles: { dialogue: { lineSpacing: 2 } } },
        { id: 'a', name: 'A', extends: 'test' },
      ],
      registry(),
    );
    expect(templates.map((t) => t.id)).toEqual(['b', 'a']);
    expect(templates[0]?.roles.dialogue?.lineSpacing).toBe(2);
  });

  it('rejects an extends cycle', () => {
    expect(
      problemsOf(() =>
        loadTemplates(
          [
            { id: 'a', name: 'A', extends: 'b' },
            { id: 'b', name: 'B', extends: 'a' },
          ],
          registry(),
        ),
      ),
    ).toEqual([expect.stringMatching(/cycle.*a → b → a/)]);
  });

  it('loads nothing and leaves the registry alone when any template fails', () => {
    const reg = registry();
    expect(() =>
      loadTemplates(
        [
          { id: 'good', name: 'Good', extends: 'test' },
          { id: 'bad', name: 'Bad', extends: 'test', roles: { action: { width: -1 } } },
        ],
        reg,
      ),
    ).toThrow(TemplateError);
    expect([...reg.keys()]).toEqual(['test']);
  });
});
