import { readFileSync } from 'node:fs';
import { parse } from '@drafter/fountain';
import { type LintDiagnostic, lint } from '@drafter/lint';
import { builtins, type Template } from '@drafter/templates';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyFix } from './helpers';

const screenplay = builtins['us-screenplay'] as Template;
const stagePlay = builtins['stage-play-standard'] as Template;

/** The helpers for one rule's tests. They look at that rule's diagnostics and no others. */
function forRule(id: string) {
  const found = (source: string, template: Template = screenplay): LintDiagnostic[] =>
    lint(parse(source), template).filter((d) => d.ruleId === id);

  /** The one diagnostic the rule gives the script. */
  const hit = (source: string): LintDiagnostic => {
    const all = found(source);
    expect(all, JSON.stringify(source)).toHaveLength(1);
    return all[0] as LintDiagnostic;
  };

  /** The rule finds nothing in the script. */
  const miss = (source: string) => {
    expect(found(source), JSON.stringify(source)).toEqual([]);
  };

  /** The rule finds nothing in the script under this template. */
  const missIn = (template: Template, source: string) => {
    expect(found(source, template), JSON.stringify(source)).toEqual([]);
  };

  /** The script with the one diagnostic's fix made. */
  const fixed = (source: string): string => {
    const { fix } = hit(source);
    if (!fix) throw new Error(`no fix for ${JSON.stringify(source)}`);
    return applyFix(source, fix);
  };

  const fixesTo = (source: string, expected: string) => {
    expect(fixed(source)).toBe(expected);
  };

  return { found, hit, miss, missIn, fixed, fixesTo };
}

const kinds = (source: string) => parse(source).blocks.map((b) => b.kind);

describe('character-without-dialogue', () => {
  const { found, hit, miss, fixed, fixesTo } = forRule('character-without-dialogue');

  it('reports a name cued elsewhere in the script', () => {
    const source = "MARGARET\nHello.\n\nShe sits.\n\nMARGARET\n\nYou said you'd call.\n";
    const at = source.lastIndexOf('MARGARET');
    expect(hit(source)).toEqual({
      ruleId: 'character-without-dialogue',
      severity: 'warning',
      span: { from: at, to: at + 'MARGARET'.length },
      message:
        '"MARGARET" looks like a character cue, but the blank line after it turns the speech into action.',
      fix: { title: 'Remove the blank line', changes: [{ from: at + 9, to: at + 10, insert: '' }] },
    });
  });

  it('reports a line followed by a block that starts with a parenthesis', () => {
    hit('NARRATOR\n\n(quietly)\nOnce upon a time.\n');
    hit('BANG!\n\n  (softly)\nHi.\n');
    hit('NARRATOR\n\n(\n');
  });

  it('offers to remove the blank line, which makes the line a cue', () => {
    const source = 'NARRATOR\n\n(quietly)\nOnce.\n';
    fixesTo(source, 'NARRATOR\n(quietly)\nOnce.\n');
    expect(kinds(source)).toEqual(['action', 'action']);
    expect(kinds(fixed(source))).toEqual(['character', 'parenthetical', 'dialogue']);
    expect(found(fixed(source))).toEqual([]);
  });

  it('keeps the line endings of a CRLF file, and of a file that mixes them', () => {
    const crlf = 'NARRATOR\r\n\r\n(quietly)\r\nOnce.\r\n';
    expect(hit(crlf).span).toEqual({ from: 0, to: 9 });
    expect(hit(crlf).fix?.changes).toEqual([{ from: 10, to: 12, insert: '' }]);
    fixesTo(crlf, 'NARRATOR\r\n(quietly)\r\nOnce.\r\n');
    // The break that goes is the blank line's own.
    fixesTo('NARRATOR\r\n\n(quietly)\r\nOnce.\r\n', 'NARRATOR\r\n(quietly)\r\nOnce.\r\n');
    fixesTo('NARRATOR\n\r\n(quietly)\r\nOnce.\r\n', 'NARRATOR\n(quietly)\r\nOnce.\r\n');
  });

  it('removes a blank line whole, spaces and tabs included', () => {
    const source = 'NARRATOR\n \t\n(quietly)\nOnce.\n';
    fixesTo(source, 'NARRATOR\n(quietly)\nOnce.\n');
    expect(kinds(fixed(source))).toEqual(['character', 'parenthetical', 'dialogue']);
    fixesTo('NARRATOR\r\n \t\r\n(quietly)\r\nOnce.\r\n', 'NARRATOR\r\n(quietly)\r\nOnce.\r\n');
  });

  it('keeps the two-space line that joins a speech as the line below the cue', () => {
    // The blank line's own spaces must not run into it, or it would stop connecting.
    const source = 'MARGARET\nHi.\n\nMARGARET\n \n  \nShe waits.\n';
    fixesTo(source, 'MARGARET\nHi.\n\nMARGARET\n  \nShe waits.\n');
    // The two-space line and the line after it are one block of speech.
    expect(kinds(fixed(source))).toEqual(['character', 'dialogue', 'character', 'dialogue']);
    expect(found(fixed(source))).toEqual([]);
  });

  it('reports a blank line with a carriage return of its own, and offers no fix', () => {
    // Taking it out would change the file's line endings.
    expect(hit('NARRATOR\n\r \n(quietly)\nOnce.\n').fix).toBeUndefined();
    expect(hit('NARRATOR\n\r\r\n(quietly)\nOnce.\n').fix).toBeUndefined();
  });

  it('reads a cue the way the parser does: extensions in any case, a dual marker, an indent', () => {
    hit('MARGARET (V.O.)\n\n(quietly)\nHi.\n');
    hit('HANS (on the radio)\n\n(quietly)\nHi.\n');
    hit("DANNY (V.O.) (CONT'D)\n\n(quietly)\nHi.\n");
    hit('BRICK ^\n\n(quietly)\nHi.\n');
    hit('BRICK (V.O.) ^\n\n(quietly)\nHi.\n');
    hit('  NARRATOR\n\n(quietly)\nHi.\n');
    hit('MCCLANE JR.\n\n(quietly)\nHi.\n');
    hit('R2-D2 ()\n\n(quietly)\nHi.\n');
    hit('\ufeffNARRATOR\n\n(quietly)\nHi.\n');
  });

  it('quotes the printed text of the line, without notes or indent', () => {
    expect(hit('MARGARET (V.O.)\n\n(quietly)\nHi.\n').message).toMatch(/^"MARGARET \(V\.O\.\)" /);
    expect(hit('  NARRATOR [[maybe]]\n\n(quietly)\nHi.\n').message).toMatch(/^"NARRATOR" /);
    expect(hit('[[maybe]] NARRATOR\n\n(quietly)\nHi.\n').message).toMatch(/^"NARRATOR" /);
  });

  it('points at the cue-like line', () => {
    expect(hit('Hi.\n\nNARRATOR\n\n(quietly)\nHi.\n').span).toEqual({ from: 5, to: 13 });
  });

  it('reports every such line, not just the first', () => {
    const source = 'NARRATOR\n\n(quietly)\nHi.\n\nSHE WAITS\n\n(softly)\nBye.\n';
    expect(found(source).map((d) => d.span.from)).toEqual([0, source.indexOf('SHE WAITS')]);
  });

  it('counts a name cued anywhere in the script, in any case, with any extension', () => {
    // After the line as well as before it.
    hit('BANG!\n\nThe door flies open.\n\nBANG!\nWho is it?\n');
    hit('MARGARET\nHi.\n\nMARGARET (V.O.)\n\nShe sits.\n');
    hit('MARGARET (V.O.)\nHi.\n\nMARGARET\n\nShe sits.\n');
    hit('MARGARET ^\nHi.\n\nMARGARET\n\nShe sits.\n');
    // A forced cue keeps the case it was typed in, and the layout ignores the case.
    hit('@Margaret\nHi.\n\nMARGARET\n\nShe sits.\n');
  });

  it('leaves a name alone that nobody cues', () => {
    miss('BANG!\n\nThe door flies open.\n');
    miss('MARGARET\nHi.\n\nDANNY\n\nShe sits.\n');
    // Only a whole name counts.
    miss('MARGARET\nHi.\n\nMARG\n\nShe sits.\n');
    miss('MARGARET\nHi.\n\nMARGARET JONES\n\nShe sits.\n');
  });

  it('leaves a known name alone when more or less than one blank line follows it', () => {
    miss("MARGARET\nHi.\n\nMARGARET\n\n\nYou said you'd call.\n");
    miss('MARGARET\nHi.\n\nMARGARET\nShe sits.\n');
  });

  it('leaves lines alone that the parser would not read as a cue', () => {
    miss('MARGARET (60s), cardigan buttoned wrong.\n\nShe waits.\n');
    miss('MARGARET (60s), cardigan buttoned wrong.\n\n(softly)\nHi.\n');
    miss('Margaret\n\n(quietly)\nHi.\n');
    miss('MARGARET sits.\n\n(quietly)\nHi.\n');
    miss('MARGARET (quietly\n\n(softly)\nHi.\n');
    miss('MARGARET (quietly) and\n\n(softly)\nHi.\n');
    miss('(QUIETLY)\n\n(softly)\nHi.\n');
    miss('1984\n\n(softly)\nHi.\n');
    miss('^\n\n(softly)\nHi.\n');
  });

  it('looks for the parenthesis on the first line of the next block only', () => {
    // The first line is the two-space line that joins a speech. The parenthesis is below it.
    miss('NARRATOR\n\n  \n(quietly)\nOnce.\n');
    hit('MARGARET\nHi.\n\nMARGARET\n\n  \nShe waits.\n');
  });

  it('tests a line only when it prints as typed, the way the parser tests it', () => {
    // Emphasis markers print as styling, so the printed text is not what the parser tests.
    miss('*NARRATOR*\n\n(quietly)\nHi.\n');
    miss('**NARRATOR**\n\n(quietly)\nHi.\n');
    miss('_NARRATOR (V.O.)_\n\n(quietly)\nHi.\n');
    miss('NARRATOR \\*\n\n(quietly)\nHi.\n');
    // Markers that style nothing are plain characters.
    expect(hit('R2_D2\n\n(quietly)\nHi.\n').message).toMatch(/^"R2_D2" /);
    hit('NARRATOR *\n\n(quietly)\nHi.\n');
    // A note inside the line doesn't print, and the parser skips it too.
    expect(hit('NARRATOR [[n]] JR.\n\n(quietly)\nHi.\n').message).toMatch(/^"NARRATOR {2}JR\." /);
  });

  it('leaves a block of several lines alone', () => {
    // The first line opens a parenthesis that the second closes, which is no cue.
    miss('FOO (\nBAR)\n\n(quietly)\nHi.\n');
    miss('FOO.\nBAR.\n\n(quietly)\nHi.\n');
  });

  it('wants one blank line, and an action block after it', () => {
    miss('MARGARET\n\n\n(quietly)\nHi.\n');
    miss('MARGARET\n\n\n\n(quietly)\nHi.\n');
    miss('THE END\n');
    miss('THE END\n\n');
    // A note or a boneyard between them is a block of its own.
    miss('NARRATOR\n\n[[a note]]\n\n(quietly)\nOnce.\n');
    miss('NARRATOR\n\n/* cut */\n\n(quietly)\nOnce.\n');
    // The next block must be an action block.
    miss('NARRATOR\n\nMARGARET\nHi.\n');
    miss('NARRATOR\n\nINT. HALL - DAY\n');
    for (const next of ['CUT TO:', '> THE END <', '# Act', '= a beat', '===', '~sings']) {
      miss(`MARGARET\nHi.\n\nMARGARET\n\n${next}\n`);
    }
  });

  it('leaves forced action alone, since the writer said it is action', () => {
    miss('!NARRATOR\n\n(quietly)\nHi.\n');
    miss('MARGARET\nHi.\n\n!MARGARET\n\nShe sits.\n');
    miss('NARRATOR\n\n!(quietly)\nHi.\n');
    miss('MARGARET\nHi.\n\nMARGARET\n\n!She sits.\n');
  });

  it('leaves a real cue alone', () => {
    miss('MARGARET\n(quietly)\nHi.\n');
    miss('NARRATOR\n  \n(quietly)\nOnce.\n');
    miss('@NARRATOR\n\n(quietly)\nHi.\n');
  });

  it('reads the line as the parser would read it with its speech below', () => {
    // Every line of this shape that stands alone as action, with a parenthetical after a
    // blank line: the rule reports only what the parser reads as a cue once the blank line goes,
    // and reports all of it unless the line has emphasis markers, which the rule leaves alone.
    // The fix is the removal of that blank line.
    const pieces = [
      'MARGARET',
      'DANNY',
      'A',
      'Hans',
      'on',
      ' ',
      '  ',
      '\t',
      '(',
      ')',
      '(V.O.)',
      '(on the radio)',
      '^',
      ',',
      '.',
      ':',
      '-',
      '1',
      '*',
      '_',
      '\\',
      '[[n]]',
      '@',
      '!',
      '~',
      '#',
      '=',
      '>',
      '<',
    ];
    const lines = fc
      .array(fc.constantFrom(...pieces), { minLength: 1, maxLength: 8 })
      .map((parts) => parts.join(''));
    let reported = 0;
    fc.assert(
      fc.property(lines, (line) => {
        const apart = `${line}\n\n(x)\n`;
        const together = `${line}\n(x)\n`;
        const [first, second] = parse(apart).blocks;
        fc.pre(
          first?.kind === 'action' &&
            !first.forced &&
            first.lines.length === 1 &&
            second?.kind === 'action',
        );
        const cue = parse(together).blocks[0]?.kind === 'character';
        const reports = found(apart);
        if (reports.length > 0) {
          // Whatever it reports, the parser reads as a cue once the blank line goes.
          reported++;
          expect(cue, JSON.stringify(line)).toBe(true);
          expect(fixed(apart)).toBe(together);
        } else if (!/[*_\\]/.test(line)) {
          // A line without emphasis markers is reported exactly when the parser reads a cue.
          expect(cue, JSON.stringify(line)).toBe(false);
        }
      }),
      { numRuns: 3000 },
    );
    // The generator reaches lines the rule reports: several hundred of the 3,000 runs.
    expect(reported).toBeGreaterThan(100);
  });
});

describe('manual-contd', () => {
  const { hit, miss, fixed, fixesTo } = forRule('manual-contd');

  it("offers to remove a typed (CONT'D), with the spaces before it", () => {
    fixesTo("MARGARET (CONT'D)\nStill here.\n", 'MARGARET\nStill here.\n');
    fixesTo('@McCLANE (V.O.) (cont’d)\nYippee.\n', '@McCLANE (V.O.)\nYippee.\n');
  });

  it("leaves a cue without one alone, and (CONT'D) in speech", () => {
    miss('MARGARET (V.O.)\nHi.\n');
    miss("MARGARET\nHe said (CONT'D) twice.\n");
  });

  it('is info, and names the cue in its message', () => {
    expect(hit("MARGARET (CONT'D)\nStill here.\n")).toEqual({
      ruleId: 'manual-contd',
      severity: 'info',
      span: { from: 0, to: 17 },
      message:
        "Drafter adds (CONT'D) itself when a speech continues, so there's no need to type it after MARGARET.",
      fix: { title: "Remove (CONT'D)", changes: [{ from: 8, to: 17, insert: '' }] },
    });
  });

  it('removes the spaces before it and nothing around that', () => {
    fixesTo("MARGARET (V.O.) (CONT'D)\nHi.\n", 'MARGARET (V.O.)\nHi.\n');
    fixesTo("MARGARET (CONT'D) (V.O.)\nHi.\n", 'MARGARET (V.O.)\nHi.\n');
    fixesTo("MARGARET   \t(CONT'D)\nHi.\n", 'MARGARET\nHi.\n');
    fixesTo("MARGARET(CONT'D)\nHi.\n", 'MARGARET\nHi.\n');
    fixesTo("MARGARET (CONT'D) ^\nHi.\n", 'MARGARET ^\nHi.\n');
    fixesTo("MARGARET (CONT'D)  \nHi.\n", 'MARGARET  \nHi.\n');
    fixesTo("MARGARET (CONT'D) [[check]]\nHi.\n", 'MARGARET [[check]]\nHi.\n');
    fixesTo("[[check]] MARGARET (CONT'D)\nHi.\n", '[[check]] MARGARET\nHi.\n');
    fixesTo("  MARGARET (CONT'D)\nHi.\n", '  MARGARET\nHi.\n');
    fixesTo("\ufeffMARGARET (CONT'D)\nHi.\n", '\ufeffMARGARET\nHi.\n');
    fixesTo("@McCLANE (CONT'D) ^\nHi.\n", '@McCLANE ^\nHi.\n');
  });

  it('removes every one the cue has', () => {
    fixesTo("MARGARET (CONT'D) (CONT'D)\nHi.\n", 'MARGARET\nHi.\n');
    fixesTo("MARGARET (CONT'D) (V.O.) (cont’d)\nHi.\n", 'MARGARET (V.O.)\nHi.\n');
  });

  it('keeps a CRLF file as it is', () => {
    const source = "MARGARET (CONT'D)\r\nStill here.\r\n";
    expect(hit(source).span).toEqual({ from: 0, to: 18 });
    fixesTo(source, 'MARGARET\r\nStill here.\r\n');
  });

  it('matches the spellings the pattern allows, in any case', () => {
    for (const typed of ["(CONT'D)", '(CONTD)', '(cont’d)', "(Cont'd)", "( CONT'D )", '(CONT’D)']) {
      fixesTo(`MARGARET ${typed}\nHi.\n`, 'MARGARET\nHi.\n');
    }
    miss('MARGARET (CONT D)\nHi.\n');
    miss('MARGARET (CONTINUED)\nHi.\n');
    miss("MARGARET (CONT'D.)\nHi.\n");
    miss("MARGARET (V.O. CONT'D)\nHi.\n");
  });

  it('offers no fix for a cue that holds a carriage return of its own', () => {
    // Cutting next to a lone carriage return can join it to the line feed after it.
    expect(hit("MARGARET\r(CONT'D)\nHi.\n").fix).toBeUndefined();
    expect(hit("MARGARET (\rCONT'D)\nHi.\n").fix).toBeUndefined();
    expect(hit("CUT TO:\r(CONT'D)\r\nHi.\n").fix).toBeUndefined();
  });

  it("reports a cue whose (CONT'D) has a note in it, and offers no fix", () => {
    expect(hit("MARGARET (CON[[x]]T'D)\nHi.\n").fix).toBeUndefined();
    expect(hit("MARGARET [[x]] (CONT'D)\nHi.\n").fix).toBeUndefined();
  });

  it('only looks at cues', () => {
    miss("She says (CONT'D) a lot.\n");
    miss("MARGARET\n(CONT'D)\nHi.\n");
    miss("INT. HALL (CONT'D) - DAY\n\nShe waits.\n");
    // Notes and boneyard are not part of the cue.
    miss("MARGARET [[was (CONT'D)]]\nHi.\n");
    miss("MARGARET /* (CONT'D) */\nHi.\n");
  });

  it('stays quiet once fixed', () => {
    expect(fixed("MARGARET (V.O.) (CONT'D)\nHi.\n")).toBe('MARGARET (V.O.)\nHi.\n');
    miss('MARGARET (V.O.)\nHi.\n');
  });
});

describe('heading-no-time', () => {
  const { hit, miss, missIn } = forRule('heading-no-time');

  it('reports a scene heading with no time of day', () => {
    hit('INT. HALL\n\nShe waits.\n');
  });

  it('leaves a heading with one alone', () => {
    miss('INT. HALL - DAY\n\nShe waits.\n');
    miss('INT. HALL – NIGHT\n\nShe waits.\n');
    miss('INT. HALL - DAY #12#\n\nShe waits.\n');
  });

  it('leaves a forced heading alone, which is how Fountain writes one with no time', () => {
    miss('.MONTAGE\n\nShe waits.\n');
  });

  it('is turned off by the stage play', () => {
    hit('INT. HALL\n\nShe waits.\n');
    missIn(stagePlay, 'INT. HALL\n\nShe waits.\n');
  });

  it('points at the heading and names it without its scene number', () => {
    expect(hit('She waits.\n\nINT. HALL #12#\n\nShe waits.\n')).toEqual({
      ruleId: 'heading-no-time',
      severity: 'warning',
      span: { from: 12, to: 26 },
      message:
        'The scene heading "INT. HALL" has no time of day. Add one after a dash, as in "INT. KITCHEN - NIGHT".',
    });
  });

  it('has no fix', () => {
    expect(hit('INT. HALL\n\nShe waits.\n').fix).toBeUndefined();
  });

  it('counts a heading as having a time only if a dash is there to separate it', () => {
    hit('INT. HALL -\n\nShe waits.\n');
    hit('INT. HALL -DAY\n\nShe waits.\n');
    hit('INT. SMITH-JONES HOUSE\n\nShe waits.\n');
    miss('INT. SMITH-JONES HOUSE - DAY\n\nShe waits.\n');
    miss('INT. A - B - C\n\nShe waits.\n');
  });

  it('checks every kind of scene heading', () => {
    hit('EXT. YARD\n\nShe waits.\n');
    hit('INT./EXT. CAR\n\nShe waits.\n');
    hit('I/E CAR\n\nShe waits.\n');
    hit('EST. NEW YORK\n\nShe waits.\n');
    hit('int. hall\n\nShe waits.\n');
    hit('INT. HALL [[the old one]]\n\nShe waits.\n');
    hit('INT. HALL\r\n\r\nShe waits.\r\n');
  });

  it('reports each heading', () => {
    const source =
      'INT. HALL\n\nShe waits.\n\nEXT. YARD - DAY\n\nHe waits.\n\nEXT. ROOF\n\nOn top.\n';
    expect(
      forRule('heading-no-time')
        .found(source)
        .map((d) => d.span.from),
    ).toEqual([0, source.indexOf('EXT. ROOF')]);
  });
});

describe('transition-not-last', () => {
  const { found, hit, miss, missIn } = forRule('transition-not-last');

  it('reports a transition that does not lead into a heading', () => {
    hit('CUT TO:\n\nShe waits.\n');
  });

  it('leaves a transition alone that goes on to a heading, a section, or a page break', () => {
    miss('CUT TO:\n\nINT. HALL - DAY\n');
    miss('CUT TO:\n\n# Act Two\n');
    miss('CUT TO:\n\n===\n\nINT. HALL - DAY\n');
    miss('CUT TO:\n\n.MONTAGE\n');
  });

  it('skips notes, boneyard, and synopses on the way to the next block', () => {
    miss('CUT TO:\n\n[[a note]]\n\nINT. HALL - DAY\n');
    miss('CUT TO:\n\n/* cut */\n\nINT. HALL - DAY\n');
    miss('CUT TO:\n\n= a synopsis\n\nINT. HALL - DAY\n');
    miss('CUT TO:\n\n[[a note]]\n\n/* cut */\n\n= a synopsis\n\n# Act Two\n');
    // They are only skipped. What comes after them still has to be one of the three.
    hit('CUT TO:\n\n[[a note]]\n\nShe waits.\n');
    hit('CUT TO:\n\n/* cut */\n\n= a synopsis\n\nShe waits.\n');
  });

  it('lets a transition at the end of the script pass', () => {
    miss('>FADE OUT.\n');
    miss('She waits.\n\nCUT TO:\n');
    miss('She waits.\n\n> FADE OUT.\n\n[[the end]]\n\n= last\n');
    // The metadata block is boneyard.
    miss('She waits.\n\n> FADE OUT.\n\n/* drafter\n{ "v": 1 }\n*/\n');
  });

  it('reports a transition followed by anything else', () => {
    hit('CUT TO:\n\nMARGARET\nHi.\n');
    hit('CUT TO:\n\n> THE END <\n');
    hit('CUT TO:\n\n~sings\n');
    hit('She waits.\n\n> FADE TO BLACK.\n\nShe waits.\n');
    hit('CUT TO:\nShe waits.\n');
  });

  it('judges each transition by the block after it', () => {
    const source =
      'CUT TO:\n\nCUT TO:\n\nINT. HALL - DAY\n\nShe waits.\n\nDISSOLVE TO:\n\nShe waits.\n';
    expect(found(source).map((d) => d.span.from)).toEqual([0, source.indexOf('DISSOLVE TO:')]);
  });

  it('points at the transition and names it without its marker', () => {
    expect(hit('She waits.\n\n> FADE TO BLACK.\n\nShe waits.\n')).toEqual({
      ruleId: 'transition-not-last',
      severity: 'warning',
      span: { from: 12, to: 28 },
      message:
        'The transition "FADE TO BLACK." isn\'t followed by a scene heading, a section, or a page break.',
    });
  });

  it('has no fix', () => {
    expect(hit('CUT TO:\n\nShe waits.\n').fix).toBeUndefined();
  });

  it('is turned off by the stage play', () => {
    hit('CUT TO:\n\nShe waits.\n');
    missIn(stagePlay, 'CUT TO:\n\nShe waits.\n');
  });
});

describe('the rules on the fixtures', () => {
  const read = (name: string) =>
    readFileSync(
      new URL(`../../../fixtures/classification/${name}.fountain`, import.meta.url),
      'utf8',
    );
  const problems = (name: string, id: string) =>
    lint(parse(read(name)), screenplay).filter((d) => d.ruleId === id);
  const starts = (name: string, id: string) => problems(name, id).map((d) => d.span.from);

  it("finds the typed (CONT'D) in the lowercase-extension fixture", () => {
    const source = read('18-lowercase-extension');
    const [d, ...rest] = problems('18-lowercase-extension', 'manual-contd');
    expect(rest).toEqual([]);
    expect(d?.span.from).toBe(source.indexOf('DANNY'));
    expect(d?.fix && applyFix(source, d.fix)).toBe(source.replace(" (CONT'D)", ''));
  });

  it('finds the lone transition that goes on to action, and not the one before a heading', () => {
    const source = read('17-lone-transition');
    expect(starts('17-lone-transition', 'transition-not-last')).toEqual([
      source.indexOf('SMASH CUT TO:'),
    ]);
    expect(problems('10-transition', 'transition-not-last')).toHaveLength(1);
    expect(problems('16-heading-no-blank-after', 'transition-not-last')).toEqual([]);
  });

  it('leaves the uppercase action and the cue-shaped action alone', () => {
    for (const name of ['14-uppercase-action', '34-cue-shaped-action', '12-character']) {
      expect(problems(name, 'character-without-dialogue'), name).toEqual([]);
    }
  });

  it('finds a heading with no time, and not the headings that have one or are forced', () => {
    for (const name of ['11-scene-heading', '21-scene-numbers', '09-forced-heading']) {
      expect(problems(name, 'heading-no-time'), name).toEqual([]);
    }
    // The spec reads this sentence as a scene heading, and a heading wants a time.
    expect(starts('15-int-sentence', 'heading-no-time')).toEqual([0]);
  });
});
