import { readFileSync } from 'node:fs';
import { blockAt, parse } from '@drafter/fountain';
import { type LayoutLine, paginate } from '@drafter/layout';
import { type LintDiagnostic, lint } from '@drafter/lint';
import { builtins, loadTemplate, type Template } from '@drafter/templates';
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
  const { found, hit, miss, missIn, fixed, fixesTo } = forRule('manual-contd');

  // The layout adds a (CONT'D) to a cue when the same speaker spoke earlier in the scene, so
  // each of these scripts opens with that speech.
  const later = (cue: string, name = 'MARGARET') =>
    `${name}\nHi.\n\nShe sits.\n\n${cue}\nStill here.\n`;
  const crlf = (text: string) => text.replaceAll('\n', '\r\n');

  it("offers to remove a typed (CONT'D), with the spaces before it", () => {
    fixesTo(
      "MARGARET\nHi.\n\nShe sits.\n\nMARGARET (CONT'D)\nStill here.\n",
      'MARGARET\nHi.\n\nShe sits.\n\nMARGARET\nStill here.\n',
    );
    fixesTo(
      '@McCLANE\nHi.\n\nShe sits.\n\n@McCLANE (V.O.) (cont’d)\nGot it.\n',
      '@McCLANE\nHi.\n\nShe sits.\n\n@McCLANE (V.O.)\nGot it.\n',
    );
  });

  it("leaves a cue without one alone, and (CONT'D) in speech", () => {
    miss('MARGARET (V.O.)\nHi.\n');
    miss("MARGARET\nHe said (CONT'D) twice.\n");
    miss(later('MARGARET'));
  });

  it("leaves a CONT'D the layout wouldn't add", () => {
    // The layout adds one where the same speaker spoke earlier in the scene.
    hit(later("MARGARET (CONT'D)"));
    // The first speech in the script, and the first in a scene.
    miss("MARGARET (CONT'D)\nHi.\n");
    miss("MARGARET\nHi.\n\nINT. HALL - DAY\n\nMARGARET (CONT'D)\nStill here.\n");
    // Someone else spoke last.
    miss("MARGARET\nHi.\n\nDANNY\nYo.\n\nMARGARET (CONT'D)\nStill here.\n");
    // Dual dialogue gets none, and neither does the speech it is paired with.
    miss("MARGARET\nHi.\n\nMARGARET (CONT'D) ^\nStill here.\n");
    miss(`${later("MARGARET (CONT'D)")}\nDANNY ^\nYo.\n`);
    // The stage play doesn't continue a speech after action: the same script, in that template.
    missIn(stagePlay, later("MARGARET (CONT'D)"));
  });

  it('counts the same speaker anywhere earlier in the scene, whatever came between', () => {
    hit(later("MARGARET (CONT'D)"));
    // None of these change who spoke last: they are no speech, and no scene heading.
    for (const between of [
      '[[a note]]',
      '/* cut */',
      '= a beat',
      '# Act Two',
      'CUT TO:',
      '===',
      '> THE END <',
      '~sings',
    ]) {
      hit(`MARGARET\nHi.\n\n${between}\n\nMARGARET (CONT'D)\nStill here.\n`);
    }
    // A name is compared without regard to case, and an extension is no part of it.
    hit("@Margaret\nHi.\n\nShe sits.\n\nMARGARET (CONT'D)\nStill here.\n");
    hit("MARGARET (V.O.)\nHi.\n\nShe sits.\n\nMARGARET (CONT'D)\nStill here.\n");
    // A cue with no dialogue still counts as the last speech.
    hit("@MARGARET\n\nShe sits.\n\nMARGARET (CONT'D)\nStill here.\n");
    // A scene starts over, and the second speech in it by the same speaker is continued.
    hit("INT. HALL - DAY\n\nMARGARET\nHi.\n\nShe sits.\n\nMARGARET (CONT'D)\nStill here.\n");
  });

  it('starts over at a scene heading, and when someone else speaks', () => {
    for (const heading of ['INT. HALL - DAY', 'EXT. YARD', '.MONTAGE']) {
      miss(`MARGARET\nHi.\n\n${heading}\n\nMARGARET (CONT'D)\nStill here.\n`);
    }
    miss("MARGARET\nHi.\n\n@DANNY\n\nMARGARET (CONT'D)\nStill here.\n");
    // Not a section: the layout keeps the speaker across one.
    hit("MARGARET\nHi.\n\n# Act Two\n\nMARGARET (CONT'D)\nStill here.\n");
  });

  it('pairs a ^ cue with the speech before it only when nothing that prints comes between', () => {
    const left = later("MARGARET (CONT'D)").trimEnd();
    // A note prints nothing, so the pair forms, and the speech it pairs with loses its CONT'D.
    miss(`${left}\n\n[[a note]]\n\nDANNY ^\nYo.\n`);
    // After a pair nobody has spoken last, so the next cue isn't continued.
    miss("MARGARET\nHi.\n\nDANNY ^\nYo.\n\nMARGARET (CONT'D)\nBack.\n");
    // Action prints, a page break stops a pair, and a cue with nobody before it has no partner.
    // The layout then lays the ^ cue out like any other, and the speech before it keeps its CONT'D.
    hit(`${left}\n\nThey stare.\n\nDANNY ^\nYo.\n`);
    hit("MARGARET\nHi.\n\n===\n\nMARGARET (CONT'D) ^\nStill here.\n");
    hit(later("MARGARET (CONT'D) ^"));
  });

  it('is info, and names the cue in its message', () => {
    const source = later("MARGARET (CONT'D)");
    const at = source.lastIndexOf('MARGARET');
    expect(hit(source)).toEqual({
      ruleId: 'manual-contd',
      severity: 'info',
      span: { from: at, to: at + 17 },
      message:
        "Drafter adds (CONT'D) itself when a speech continues, so there's no need to type it after MARGARET.",
      fix: { title: "Remove (CONT'D)", changes: [{ from: at + 8, to: at + 17, insert: '' }] },
    });
  });

  it('removes the spaces before it and nothing around that', () => {
    const fixesLater = (cue: string, expected: string) => fixesTo(later(cue), later(expected));
    fixesLater("MARGARET (V.O.) (CONT'D)", 'MARGARET (V.O.)');
    fixesLater("MARGARET (CONT'D) (V.O.)", 'MARGARET (V.O.)');
    fixesLater("MARGARET   \t(CONT'D)", 'MARGARET');
    fixesLater("MARGARET(CONT'D)", 'MARGARET');
    fixesLater("MARGARET (CONT'D) ^", 'MARGARET ^');
    fixesLater("MARGARET (CONT'D)  ", 'MARGARET  ');
    fixesLater("MARGARET (CONT'D) [[check]]", 'MARGARET [[check]]');
    fixesLater("[[check]] MARGARET (CONT'D)", '[[check]] MARGARET');
    fixesLater("  MARGARET (CONT'D)", '  MARGARET');
    fixesTo(`\ufeff${later("MARGARET (CONT'D)")}`, `\ufeff${later('MARGARET')}`);
    // A dual cue with action before it is laid out like any other, so it can be continued.
    fixesTo(later("@McCLANE (CONT'D) ^", '@McCLANE'), later('@McCLANE ^', '@McCLANE'));
  });

  it('removes every one the cue has', () => {
    const fixesLater = (cue: string, expected: string) => fixesTo(later(cue), later(expected));
    fixesLater("MARGARET (CONT'D) (CONT'D)", 'MARGARET');
    fixesLater("MARGARET (CONT'D) (V.O.) (cont’d)", 'MARGARET (V.O.)');
  });

  it('keeps a CRLF file as it is', () => {
    const source = crlf(later("MARGARET (CONT'D)"));
    const at = source.lastIndexOf('MARGARET');
    expect(hit(source).span).toEqual({ from: at, to: at + 18 });
    fixesTo(source, crlf(later('MARGARET')));
  });

  it('matches the spellings the pattern allows, in any case', () => {
    for (const typed of ["(CONT'D)", '(CONTD)', '(cont’d)', "(Cont'd)", "( CONT'D )", '(CONT’D)']) {
      fixesTo(later(`MARGARET ${typed}`), later('MARGARET'));
    }
    miss(later('MARGARET (CONT D)'));
    miss(later('MARGARET (CONTINUED)'));
    miss(later("MARGARET (CONT'D.)"));
    miss(later("MARGARET (V.O. CONT'D)"));
  });

  it('offers no fix for a cue that holds a carriage return of its own', () => {
    // Cutting next to a lone carriage return can join it to the line feed after it.
    expect(hit(later("MARGARET\r(CONT'D)")).fix).toBeUndefined();
    expect(hit(later("MARGARET (\rCONT'D)")).fix).toBeUndefined();
  });

  it("reports a cue whose (CONT'D) has a note in it, and offers no fix", () => {
    expect(hit(later("MARGARET (CON[[x]]T'D)")).fix).toBeUndefined();
    expect(hit(later("MARGARET [[x]] (CONT'D)")).fix).toBeUndefined();
  });

  it('only looks at cues', () => {
    miss("She says (CONT'D) a lot.\n");
    miss("MARGARET\n(CONT'D)\nHi.\n");
    miss("INT. HALL (CONT'D) - DAY\n\nShe waits.\n");
    // Notes and boneyard are not part of the cue.
    miss(later("MARGARET [[was (CONT'D)]]"));
    miss(later("MARGARET /* (CONT'D) */"));
  });

  it('stays quiet once fixed', () => {
    const source = later("MARGARET (V.O.) (CONT'D)");
    expect(fixed(source)).toBe(later('MARGARET (V.O.)'));
    expect(found(fixed(source))).toEqual([]);
  });

  describe('against the layout', () => {
    // Templates that decide which blocks print, and whether to continue a speech, differently.
    const playThatContinues = loadTemplate({
      id: 'play-that-continues',
      name: 'Play that continues speeches',
      extends: 'stage-play-standard',
      dialogueSplit: { contdAfterAction: true },
    });
    const withoutAction = loadTemplate({
      id: 'screenplay-without-action',
      name: 'Screenplay without action',
      extends: 'us-screenplay',
      roleMap: [
        { kind: ['action', 'section', 'synopsis', 'note', 'boneyard'], role: 'omit' },
        { kind: '*', role: '@kind' },
      ],
    });
    // Scene headings and transitions are `disabled` here, and print as action does, but the
    // template omits action: so they print nothing.
    const playWithoutDirections = loadTemplate({
      id: 'play-without-directions',
      name: 'Play that continues speeches, without stage directions',
      extends: 'stage-play-standard',
      dialogueSplit: { contdAfterAction: true },
      roleMap: [{ kind: 'action', role: 'omit' }],
    });
    // Action right after dialogue is omitted, which depends on the role of the block before it.
    const omitsAfterDialogue = loadTemplate({
      id: 'omits-after-dialogue',
      name: 'Screenplay that omits action after dialogue',
      extends: 'us-screenplay',
      roleMap: [{ kind: 'action', afterRole: 'dialogue', role: 'omit' }],
    });
    // A disabled element prints as action does, and here action is omitted right after dialogue.
    const omitsDirectionsAfterDialogue = loadTemplate({
      id: 'omits-directions-after-dialogue',
      name: 'Play that omits stage directions after dialogue',
      extends: 'stage-play-standard',
      dialogueSplit: { contdAfterAction: true },
      roleMap: [{ kind: 'action', afterRole: 'dialogue', role: 'omit' }],
    });
    const templates = [
      screenplay,
      stagePlay,
      playThatContinues,
      withoutAction,
      playWithoutDirections,
      omitsAfterDialogue,
      omitsDirectionsAfterDialogue,
    ];

    /** Blocks the layout set a continued-speech (CONT'D) on the cue line of, as it lays the script out. */
    function continuedByLayout(source: string, template: Template): number[] {
      const marked = new Set<number>();
      const visit = (line: LayoutLine | undefined) => {
        if (!line) return;
        if (line.blockIndex >= 0 && line.runs.some((r) => r.synthetic && /CONT'D/.test(r.text))) {
          marked.add(line.blockIndex);
        }
        visit(line.right);
      };
      for (const page of paginate(parse(source), template).pages) page.lines.forEach(visit);
      return [...marked].sort((a, b) => a - b);
    }

    // A script is a list of paragraphs: scene headings, action, and the other things that sit
    // between speeches, and speeches of every kind, some with a (CONT'D) typed on the cue.
    const paragraph = fc.oneof(
      fc
        .constantFrom(
          'INT. HALL - DAY',
          'EXT. YARD - NIGHT',
          'She sits.',
          '[[a note]]',
          '/* cut */',
          '= a beat',
          '# Act Two',
          '===',
          'CUT TO:',
          '> THE END <',
          '~sings',
        )
        .map((text) => ({ text, typed: text })),
      fc
        .record({
          // MARGARET twice, so that she often speaks again, and as @Margaret, which is the same name.
          name: fc.constantFrom('MARGARET', 'MARGARET', '@Margaret', 'DANNY', '@STEEL'),
          extension: fc.constantFrom('', ' (V.O.)'),
          // One cue in four is dual.
          dual: fc.constantFrom(false, false, false, true),
          speech: fc.constantFrom('\nHi.', '\n(softly)\nHi.', '\n~la la', '\n[[a note]]\nHi.', ''),
        })
        // Only a forced cue can stand without dialogue.
        .filter(({ name, speech }) => speech !== '' || name.startsWith('@'))
        .map(({ name, extension, dual, speech }) => {
          const cue = (marker: string) =>
            `${name}${extension}${marker}${dual ? ' ^' : ''}${speech}`;
          return { text: cue(''), typed: cue(" (CONT'D)") };
        }),
    );
    // Half the cues are typed, half are not: `typed` is the script the rule reads, and
    // `plain` the one that is laid out, so that the layout is the one to add each (CONT'D).
    const scripts = fc.array(paragraph, { minLength: 1, maxLength: 14 }).chain((paragraphs) =>
      fc
        .array(fc.boolean(), { minLength: paragraphs.length, maxLength: paragraphs.length })
        .map((flags) => ({
          plain: paragraphs.map((p) => p.text).join('\n\n'),
          typed: paragraphs.map((p, i) => (flags[i] ? p.typed : p.text)).join('\n\n'),
        })),
    );

    it("reports exactly the cues the layout adds a CONT'D to", () => {
      let reported = 0;
      let left = 0;
      fc.assert(
        fc.property(scripts, fc.nat(templates.length - 1), ({ plain, typed }, which) => {
          const template = templates[which] as Template;
          const doc = parse(typed);
          const bare = parse(plain);
          expect(
            doc.blocks.map((b) => b.kind),
            typed,
          ).toEqual(bare.blocks.map((b) => b.kind));

          const typedCues = new Set(
            doc.blocks.flatMap((b, i) =>
              b.kind === 'character' && /CONT'D/.test(b.lines[0]?.raw ?? '') ? [i] : [],
            ),
          );
          const reports = lint(doc, template)
            .filter((d) => d.ruleId === 'manual-contd')
            .map((d) => blockAt(doc, d.span.from)?.index ?? -1);
          const wanted = continuedByLayout(plain, template).filter((i) => typedCues.has(i));
          expect(reports, `${JSON.stringify(typed)} in ${template.id}`).toEqual(wanted);
          reported += reports.length;
          left += typedCues.size - reports.length;
        }),
        { numRuns: 3000 },
      );
      // The generator reaches cues the layout continues, and typed ones that it doesn't.
      expect(reported).toBeGreaterThan(100);
      expect(left).toBeGreaterThan(100);
    });
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

describe('stub-heading', () => {
  const { found, miss } = forRule('stub-heading');

  it('lists every stand-in heading as info', () => {
    const source =
      'INT. LOCATION - DAY\n\n= Margaret waits.\n\nINT. KITCHEN - NIGHT\n\nShe waits.\n\nint. location - day\n\n= Later.\n';
    const all = found(source);
    expect(all.map((d) => [d.severity, d.span.from])).toEqual([
      ['info', 0],
      ['info', source.indexOf('int. location')],
    ]);
    expect(all[0]?.message).toBe(
      'This scene still has the stand-in heading “INT. LOCATION - DAY”. Write where and when it happens.',
    );
    miss('INT. LOCATION OF THE TRUTH - DAY\n\nShe waits.\n');
  });

  it("lists a play's stand-in scene titles", () => {
    const source = '# Act One\n\n## New scene\n\n= Margaret waits.\n\n## Scene 2\n\nWords.\n';
    expect(found(source, stagePlay).map((d) => [d.severity, d.span.from])).toEqual([
      ['info', source.indexOf('## New scene')],
    ]);
    // In a screenplay a ## line is an outline marker, not a scene.
    expect(found(source)).toEqual([]);
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

  it('skips centered text too, so a closing title can follow the last transition', () => {
    // An unforced FADE OUT. is action, not a transition, so the first script passes without the
    // rule looking at the title at all. The others are the real cases.
    miss('FADE OUT.\n\n> THE END <\n');
    miss('>FADE OUT.\n\n> THE END <\n');
    miss('She waits.\n\nCUT TO:\n\n> THE END <\n');
    miss('CUT TO:\n\n> THE END <\n\n[[the end]]\n');
    // A title card between two scenes.
    miss('CUT TO:\n\n> TITLE CARD <\n\nINT. HALL - DAY\n');
    // Centered text is only skipped. Action after it is still reported.
    hit('CUT TO:\n\n> TITLE CARD <\n\nShe waits.\n');
    hit('CUT TO:\n\n> TITLE CARD <\n\n> TITLE CARD <\n\nShe waits.\n');
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

  it("leaves the typed (CONT'D) in the lowercase-extension fixture alone, until DANNY spoke just before", () => {
    // DANNY's first speech: the layout wouldn't add a CONT'D to it, so the writer's is no waste.
    expect(problems('18-lowercase-extension', 'manual-contd')).toEqual([]);
    // With a speech by DANNY right before it, the layout would, and the fix gives back the words.
    const source = read('18-lowercase-extension').replace(
      "DANNY (V.O.) (CONT'D)",
      "DANNY\nI lost it.\n\nDANNY (V.O.) (CONT'D)",
    );
    const [d, ...rest] = lint(parse(source), screenplay).filter((x) => x.ruleId === 'manual-contd');
    expect(rest).toEqual([]);
    expect(d?.span.from).toBe(source.indexOf("DANNY (V.O.) (CONT'D)"));
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

  it('lets the closing title after the last transition end the script', () => {
    // Fixture 20 ends with `> CUT TO BLACK.` and then `> THE END <`.
    expect(problems('20-forced-markers', 'transition-not-last')).toEqual([]);
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
