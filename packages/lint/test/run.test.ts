import { parse } from '@drafter/fountain';
import {
  type LintDiagnostic,
  type LintOptions,
  lint,
  type Rule,
  type RuleContext,
  rules,
  type Severity,
  STRICT_RULES,
} from '@drafter/lint';
import { builtins, loadTemplate, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { applyFix } from './helpers';

const screenplay = builtins['us-screenplay'] as Template;
const run = (source: string, options?: LintOptions) => lint(parse(source), screenplay, options);
const ids = (found: LintDiagnostic[]) => found.map((d) => d.ruleId);

/** The one diagnostic a script is expected to produce. */
function only(source: string, options?: LintOptions): LintDiagnostic {
  const found = run(source, options);
  expect(found).toHaveLength(1);
  return found[0] as LintDiagnostic;
}

/** The script with a diagnostic's fix made. */
function fixed(source: string, diagnostic: LintDiagnostic | undefined): string {
  if (!diagnostic?.fix) throw new Error('expected a diagnostic with a fix');
  return applyFix(source, diagnostic.fix);
}

/** A script that produces exactly one diagnostic, with that diagnostic's fix made. */
const fixedOnce = (source: string) => fixed(source, only(source));

/** Runs `fn` with extra rules at the end of the registry, and takes them out again. */
function withRules<T>(extra: Rule[], fn: () => T): T {
  const registry = rules as Rule[];
  registry.push(...extra);
  try {
    return fn();
  } finally {
    registry.length -= extra.length;
  }
}

/** Runs `fn` with the registry in the opposite order, and puts it back. */
function withReversedRules<T>(fn: () => T): T {
  const registry = rules as Rule[];
  registry.reverse();
  try {
    return fn();
  } finally {
    registry.reverse();
  }
}

describe('lint', () => {
  it('finds nothing in a clean script', () => {
    expect(run("INT. HALL - DAY\n\nShe waits.\n\nMARGARET\nYou said you'd call.\n")).toEqual([]);
  });

  it('reports an unclosed boneyard as an error and an unclosed note as a warning', () => {
    expect(run('Hi [[open\n\nThere /* cut').map((d) => [d.ruleId, d.severity])).toEqual([
      ['unclosed-region', 'warning'],
      ['unclosed-region', 'error'],
    ]);
  });

  it('offers a blank line after a heading with text right below it', () => {
    const source = 'INT. HALL - DAY\nShe waits.\n';
    const [d] = run(source);
    expect([d?.ruleId, d?.severity, d?.fix?.title]).toEqual([
      'heading-blank-after',
      'info',
      'Insert a blank line',
    ]);
    expect(fixed(source, d)).toBe('INT. HALL - DAY\n\nShe waits.\n');
  });

  it('inserts a CRLF blank line in a CRLF file', () => {
    const source = 'INT. HALL - DAY\r\nShe waits.\r\n';
    expect(fixedOnce(source)).toBe('INT. HALL - DAY\r\n\r\nShe waits.\r\n');
  });

  it('joins a wrapped parenthetical onto one line', () => {
    const source = 'MARGARET\n(quietly,\n   then louder)\nHi.\n';
    const [d] = run(source);
    expect(d?.ruleId).toBe('multiline-parenthetical');
    expect(fixed(source, d)).toBe('MARGARET\n(quietly, then louder)\nHi.\n');
  });

  it('raises the Strict Fountain rules to warnings in strict mode', () => {
    expect(run('INT. HALL - DAY\nShe waits.\n', { strict: true })[0]?.severity).toBe('warning');
  });

  it('skips rules the template or the options turn off', () => {
    // A heading with text below it, and a note that never closes.
    const source = 'INT. HALL - DAY\nShe waits. [[fix this\n\nThe end.\n';
    expect(ids(run(source))).toEqual(['heading-blank-after', 'unclosed-region']);

    // The template's own list, loaded the way a user's template is.
    const quiet = loadTemplate({
      id: 'quiet',
      name: 'Quiet',
      extends: 'us-screenplay',
      lint: { disable: ['heading-blank-after'] },
    });
    expect(ids(lint(parse(source), quiet))).toEqual(['unclosed-region']);

    // The options' list.
    expect(ids(run(source, { disable: ['heading-blank-after'] }))).toEqual(['unclosed-region']);

    // The two lists add up, and an id that names no rule changes nothing.
    expect(lint(parse(source), quiet, { disable: ['unclosed-region'] })).toEqual([]);
    expect(ids(run(source, { disable: ['no-such-rule'] }))).toEqual([
      'heading-blank-after',
      'unclosed-region',
    ]);
  });

  it('sorts diagnostics by position', () => {
    // The unclosed note comes from a rule that runs first, but sits further down the script.
    const order = rules.map((r) => r.id);
    expect(order.indexOf('unclosed-region')).toBeLessThan(order.indexOf('multiline-parenthetical'));

    const source =
      'MARGARET\n(quietly,\n   then louder)\nHi.\n\nShe hums. [[fix this\n\nThe end.\n';
    expect(run(source).map((d) => [d.ruleId, d.span.from])).toEqual([
      ['multiline-parenthetical', source.indexOf('(quietly')],
      ['unclosed-region', source.indexOf('[[')],
    ]);
  });

  it('puts the smaller rule id first when two start in the same place', () => {
    // A heading with no time and a line right below it: both rules point at the heading line.
    // The registry lists heading-blank-after first, so run the rules in the opposite order to
    // see that the sort, and not the registry, puts it first.
    const source = 'INT. HALL\nShe waits.\n';
    const order = rules.map((r) => r.id);
    expect(order.indexOf('heading-blank-after')).toBeLessThan(order.indexOf('heading-no-time'));

    expect(ids(run(source))).toEqual(['heading-blank-after', 'heading-no-time']);
    const found = withReversedRules(() => run(source));
    expect(found.map((d) => [d.ruleId, d.span.from])).toEqual([
      ['heading-blank-after', 0],
      ['heading-no-time', 0],
    ]);
  });

  it("shares nothing with the document's own diagnostics", () => {
    const doc = parse('INT. HALL - DAY\nShe waits.\n');
    const before = structuredClone(doc.diagnostics);
    for (const d of lint(doc, screenplay, { strict: true })) {
      d.severity = 'error';
      d.message = 'changed';
      d.span.from = 99;
      d.span.to = 99;
    }
    expect(doc.diagnostics).toEqual(before);
  });

  it("shares nothing with the document's blocks", () => {
    // A script that sets off each of the structural rules, and so hands out spans and changes.
    const source =
      "MARGARET\nHi.\n\nMARGARET (CONT'D)\nHi.\n\nNARRATOR\n\n(quietly)\nOnce.\n\nINT. HALL\n\nCUT TO:\n\nShe waits.\n";
    const doc = parse(source);
    const spans = () =>
      structuredClone(doc.blocks.map((b) => [b.span, ...b.lines.map((l) => l.span)]));
    const before = spans();
    const found = lint(doc, screenplay);
    expect(new Set(ids(found))).toEqual(
      new Set([
        'manual-contd',
        'character-without-dialogue',
        'heading-no-time',
        'transition-not-last',
      ]),
    );
    for (const d of found) {
      d.span.from = 99;
      d.span.to = 99;
      for (const change of d.fix?.changes ?? []) {
        change.from = 99;
        change.to = 99;
      }
    }
    expect(spans()).toEqual(before);
  });
});

describe('unclosed-region', () => {
  const source = 'Hi [[open\n\nThere /* cut';

  it('points at the opening brackets and offers no fix', () => {
    const [note, boneyard] = run(source);
    expect(note?.span).toEqual({ from: 3, to: 5 });
    expect(boneyard?.span).toEqual({ from: 17, to: 19 });
    expect(note?.message).toMatch(/\]\]/);
    expect(boneyard?.message).toMatch(/\*\//);
    expect(note?.fix).toBeUndefined();
    expect(boneyard?.fix).toBeUndefined();
  });

  it('keeps its severities in strict mode', () => {
    expect(run(source, { strict: true }).map((d) => d.severity)).toEqual(['warning', 'error']);
  });

  it('leaves notes and boneyard that close alone', () => {
    expect(run('Hi [[closed]]\n\nThere /* cut */ now.\n\n/* a\n\nb */\n')).toEqual([]);
  });
});

describe('invalid-meta', () => {
  const meta = '/* drafter\n{ "v": 1, "template": }\n*/\n';

  it('reports a metadata block that is not valid JSON as a warning', () => {
    const source = `Margaret waits.\n\n${meta}`;
    expect(run(source)).toEqual([
      {
        ruleId: 'invalid-meta',
        severity: 'warning',
        // The whole block, from its opener to the end of its last line.
        span: { from: source.indexOf('/* drafter'), to: source.length - 1 },
        message: expect.stringContaining('metadata'),
      },
    ]);
  });

  it('is not raised in strict mode', () => {
    expect(run(`Margaret waits.\n\n${meta}`, { strict: true })[0]?.severity).toBe('warning');
  });

  it('leaves a valid metadata block alone', () => {
    const valid = '/* drafter\n{ "v": 1, "template": "stage-play-standard" }\n*/\n';
    expect(run(`Margaret waits.\n\n${valid}`)).toEqual([]);
  });
});

describe('heading-blank-after', () => {
  it('points at the heading line, which in a CRLF file ends with its carriage return', () => {
    expect(only('INT. HALL - DAY\nShe waits.\n').span).toEqual({ from: 0, to: 15 });
    expect(only('INT. HALL - DAY\r\nShe waits.\r\n').span).toEqual({ from: 0, to: 16 });
  });

  it('puts the line break at the end of the heading, before a carriage return', () => {
    expect(only('INT. HALL - DAY\nShe waits.\n').fix?.changes).toEqual([
      { from: 15, to: 15, insert: '\n' },
    ]);
    expect(only('INT. HALL - DAY\r\nShe waits.\r\n').fix?.changes).toEqual([
      { from: 15, to: 15, insert: '\r\n' },
    ]);
  });

  it('follows its own line when a file mixes line endings', () => {
    const source = 'INT. HALL - DAY\nShe waits.\r\n\r\nEXT. YARD - DAY\r\nHe waits.\n';
    const [first, second] = run(source);
    expect(fixed(source, first)).toBe(
      'INT. HALL - DAY\n\nShe waits.\r\n\r\nEXT. YARD - DAY\r\nHe waits.\n',
    );
    expect(fixed(source, second)).toBe(
      'INT. HALL - DAY\nShe waits.\r\n\r\nEXT. YARD - DAY\r\n\r\nHe waits.\n',
    );
  });

  it('asks for a blank line after a transition too', () => {
    const source = 'She leaves.\n\nCUT TO:\nINT. HALL - DAY\n\nQuiet.\n';
    expect(only(source).span).toEqual({ from: 13, to: 20 });
    expect(fixedOnce(source)).toBe('She leaves.\n\nCUT TO:\n\nINT. HALL - DAY\n\nQuiet.\n');
  });

  it('puts the blank line right under the heading, ahead of a note below it', () => {
    const source = 'INT. HALL - DAY\n[[check this]]\nShe waits.\n';
    const result = fixedOnce(source);
    expect(result).toBe('INT. HALL - DAY\n\n[[check this]]\nShe waits.\n');
    expect(run(result)).toEqual([]);
  });

  it('is happy with a note that ends the heading line', () => {
    const source = 'INT. HALL - DAY [[check this]]\nShe waits.\n';
    expect(fixedOnce(source)).toBe('INT. HALL - DAY [[check this]]\n\nShe waits.\n');
  });

  it('keeps trailing spaces on the heading', () => {
    expect(fixedOnce('INT. HALL - DAY  \nShe waits.\n')).toBe('INT. HALL - DAY  \n\nShe waits.\n');
  });

  // A blank line inside a note would end it, and one inside a boneyard would leave the
  // heading with text below it, so a heading whose line break falls inside either gets no fix.
  for (const [label, source] of [
    ['a note', 'INT. HALL - DAY [[check the\nlocation]]\nShe waits.\n'],
    ['a boneyard', 'INT. HALL - DAY /* the old\nlocation */\nShe waits.\n'],
    ['a note in a CRLF file', 'INT. HALL - DAY [[check the\r\nlocation]]\r\nShe waits.\r\n'],
  ] as const) {
    it(`reports a heading line that ends inside ${label}, with no fix`, () => {
      const d = only(source);
      expect(d.ruleId).toBe('heading-blank-after');
      expect(d.fix).toBeUndefined();
    });
  }

  it('leaves a heading alone when a blank line or nothing follows it', () => {
    expect(run('INT. HALL - DAY\n\nShe waits.\n')).toEqual([]);
    expect(run('INT. HALL - DAY\n')).toEqual([]);
    expect(run('She waits.\n\nINT. HALL - DAY')).toEqual([]);
    expect(run('INT. HALL - DAY\n[[just a note]]\n')).toEqual([]);
  });

  it('is raised to a warning in strict mode, and its fix stays', () => {
    const d = only('INT. HALL - DAY\nShe waits.\n', { strict: true });
    expect([d.severity, d.fix?.title]).toEqual(['warning', 'Insert a blank line']);
  });
});

describe('multiline-parenthetical', () => {
  const wrapped = 'MARGARET\n(quietly,\n   then louder)\nHi.\n';

  it('spans from the first line to the end of the last', () => {
    expect(only(wrapped).span).toEqual({ from: 9, to: 34 });
  });

  it('replaces each line break, and the indent after it, with one space', () => {
    expect(only(wrapped).fix?.changes).toEqual([{ from: 18, to: 22, insert: ' ' }]);
  });

  it('keeps the closing line ending in a CRLF file', () => {
    const source = 'MARGARET\r\n(quietly,\r\n   then louder)\r\nHi.\r\n';
    expect(fixedOnce(source)).toBe('MARGARET\r\n(quietly, then louder)\r\nHi.\r\n');
  });

  it('joins a parenthetical wrapped over several lines, however they are spaced', () => {
    const source = 'MARGARET\n  (quietly,  \n\tthen\n   louder)\nHi.\n';
    expect(only(source).fix?.changes).toHaveLength(2);
    expect(fixedOnce(source)).toBe('MARGARET\n  (quietly, then louder)\nHi.\n');
  });

  it('joins a CRLF parenthetical wrapped over several lines', () => {
    const source = 'MARGARET\r\n(quietly, \r\n then\r\n\tlouder)\r\nHi.\r\n';
    expect(fixedOnce(source)).toBe('MARGARET\r\n(quietly, then louder)\r\nHi.\r\n');
  });

  it('keeps a note that sits on a line of its own inside the parenthetical', () => {
    const result = fixedOnce('MARGARET\n(quietly,\n[[a beat]]\nthen louder)\nHi.\n');
    expect(result).toBe('MARGARET\n(quietly, [[a beat]] then louder)\nHi.\n');
    expect(run(result)).toEqual([]);
  });

  it('joins a parenthetical with a boneyard across its line break', () => {
    const result = fixedOnce('MARGARET\n(quietly, /* cut\nthis */ louder)\nHi.\n');
    expect(result).toBe('MARGARET\n(quietly, /* cut this */ louder)\nHi.\n');
    expect(run(result)).toEqual([]);
  });

  it('joins only the parenthetical its diagnostic is about', () => {
    const source = 'MARGARET\n(quietly,\n   then louder)\nHi.\n(aside,\nsoftly)\nBye.\n';
    const [first, second] = run(source);
    expect(fixed(source, first)).toBe(
      'MARGARET\n(quietly, then louder)\nHi.\n(aside,\nsoftly)\nBye.\n',
    );
    expect(fixed(source, second)).toBe(
      'MARGARET\n(quietly,\n   then louder)\nHi.\n(aside, softly)\nBye.\n',
    );
  });

  it('titles its fix for what it does', () => {
    expect(only(wrapped).fix?.title).toBe('Join onto one line');
  });

  it('is raised to a warning in strict mode, and its fix stays', () => {
    const d = only(wrapped, { strict: true });
    expect([d.severity, d.fix?.title]).toEqual(['warning', 'Join onto one line']);
  });

  it('leaves a parenthetical on one line, and a bracket that never closes, alone', () => {
    expect(run('MARGARET\n(quietly)\nHi.\n')).toEqual([]);
    expect(run('MARGARET\n(quietly, then\nHi.\n')).toEqual([]);
  });
});

describe('strict mode', () => {
  const source =
    "INT. HALL - DAY\nShe waits.\n\nMARGARET\nHi.\n\nShe sits.\n\nMARGARET (CONT'D)\n(quietly,\n   then louder)\nHi. [[open\n\nThere /* cut";
  const severities = (options?: LintOptions) =>
    run(source, options).map((d) => [d.ruleId, d.severity]);

  it('raises the two Strict rules from info to warning, and leaves the rest as they were', () => {
    expect(severities()).toEqual([
      ['heading-blank-after', 'info'],
      ['manual-contd', 'info'],
      ['multiline-parenthetical', 'info'],
      ['unclosed-region', 'warning'],
      ['unclosed-region', 'error'],
    ]);
    expect(severities({ strict: true })).toEqual([
      ['heading-blank-after', 'warning'],
      ['manual-contd', 'info'],
      ['multiline-parenthetical', 'warning'],
      ['unclosed-region', 'warning'],
      ['unclosed-region', 'error'],
    ]);
  });

  it('raises only the Strict rules in strict mode', () => {
    // manual-contd is info, and is not a Strict rule: it stays info.
    const found = run("MARGARET\nHi.\n\nShe sits.\n\nMARGARET (CONT'D)\nHi.\n", { strict: true });
    expect(found.map((d) => [d.ruleId, d.severity])).toEqual([['manual-contd', 'info']]);
  });

  it('does nothing when strict is off', () => {
    expect(severities({ strict: false })).toEqual(severities());
  });
});

describe('the runner, with rules a test adds', () => {
  it('does not run a rule that is turned off', () => {
    const boom: Rule = {
      id: 'boom',
      severity: 'info',
      run: () => {
        throw new Error('ran');
      },
    };
    expect(withRules([boom], () => run('Hi.\n', { disable: ['boom'] }))).toEqual([]);
    expect(() => withRules([boom], () => run('Hi.\n'))).toThrow('ran');
  });

  it('gives each rule the document, the template, and the options', () => {
    const seen: RuleContext[] = [];
    const spy: Rule = {
      id: 'spy',
      severity: 'info',
      run: (ctx) => {
        seen.push(ctx);
        return [];
      },
    };
    const doc = parse('Hi.\n');
    const options = { strict: true };
    withRules([spy], () => lint(doc, screenplay, options));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.doc).toBe(doc);
    expect(seen[0]?.template).toBe(screenplay);
    expect(seen[0]?.options).toBe(options);
  });
});

describe('rules', () => {
  it('lists each rule once, with the highest severity it reports', () => {
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
    const declared = Object.fromEntries(rules.map((r) => [r.id, r.severity]));
    const expected = {
      'unclosed-region': 'error',
      'invalid-meta': 'warning',
      'heading-blank-after': 'info',
      'multiline-parenthetical': 'info',
      'character-without-dialogue': 'warning',
      'manual-contd': 'info',
      'heading-no-time': 'warning',
      'stub-heading': 'info',
      'fdx-note': 'info',
      'transition-not-last': 'warning',
      'similar-names': 'info',
    };
    expect(declared).toMatchObject(expected);

    // A script that sets off each of them: no diagnostic is more severe than its rule says.
    const rank: Record<Severity, number> = { info: 0, warning: 1, error: 2 };
    const found = [
      'Hi [[open\n\nThere /* cut',
      'INT. HALL - DAY\nShe waits.\n\nMARGARET\n(quietly,\n   then louder)\nHi.\n',
      'Margaret waits.\n\n/* drafter\n{ nope }\n*/\n',
      "MARGARET\nHi.\n\nMARGARET (CONT'D)\nHi.\n\nNARRATOR\n\n(quietly)\nOnce.\n\nINT. HALL\n\nCUT TO:\n\nShe waits.\n",
      'MARGARET\nHi.\n\nMARGARET\nHi.\n\nMARGARET\nHi.\n\nMARGERET\nHi.\n',
      'INT. LOCATION - DAY\n\nTHEO, a keeper [[fdx: Cast List]]\n',
    ].flatMap((source) => run(source));
    for (const id of Object.keys(expected)) expect(ids(found)).toContain(id);
    for (const d of found) {
      const ceiling = rank[declared[d.ruleId] as Severity];
      expect(rank[d.severity]).toBeLessThanOrEqual(ceiling);
    }
  });

  it('names registered rules as the Strict ones', () => {
    expect(STRICT_RULES).toEqual(['heading-blank-after', 'multiline-parenthetical']);
    for (const id of STRICT_RULES) expect(rules.map((r) => r.id)).toContain(id);
  });
});
