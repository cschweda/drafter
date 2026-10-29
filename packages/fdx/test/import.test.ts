import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Doc, parse, print } from '@drafter/fountain';
import { builtins } from '@drafter/templates';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fountainScript } from '../../../fixtures/generators/fountain';
import { FdxError, fromFdx, toFdx, XmlError } from '../src';

const screenplay = builtins['us-screenplay'];
if (!screenplay) throw new Error('missing built-in template');

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

/** A Final Draft document holding these Content paragraphs (and, after them, these root elements). */
const fdx = (content: string, after = '') =>
  `<?xml version="1.0"?><FinalDraft DocumentType="Script" Template="No" Version="5"><Content>${content}</Content>${after}</FinalDraft>`;
const P = (type: string, text: string, attrs = '') =>
  `<Paragraph Type="${type}"${attrs}><Text>${text}</Text></Paragraph>`;

const kinds = (doc: Doc) => doc.blocks.map((b) => b.kind);
/** Each block's kind and printable text, the way the round trip compares them. */
const printed = (doc: Doc) =>
  doc.blocks.map((b) => [
    b.kind,
    b.lines.map((l) => l.inline.map((r) => r.text).join('')).join('\n'),
  ]);

describe('fromFdx: the elements', () => {
  it('maps every element of the fixture to its Fountain kind', () => {
    const result = fromFdx(fixture('elements.fdx'));
    expect(result.text).toBe(
      [
        'INT. LIGHTHOUSE - NIGHT #12A#',
        '',
        '= The lamp goes out.',
        '= Nobody moves.',
        '',
        'Wind **rattles** the glass. A *slow* creak, then _silence_.',
        '',
        'ODILE (O.S.)',
        '(from below)',
        'Is the keeper awake?',
        '',
        'CUT TO:',
        '',
        '===',
        '',
        '.THE STAIRWELL',
        '',
        '> INTERMISSION <',
        '',
        'ODILE',
        'Left.',
        '',
        'THEO ^',
        'Right.',
        '',
        '.CLOSE ON THE LANTERN',
        '',
        '> Fade to grey.',
        '',
      ].join('\n'),
    );
    expect(result.mapped).toEqual([]);
    expect(result.ignored).toEqual([]);
    expect(result.title).toBeNull();
    const doc = parse(result.text);
    expect(kinds(doc)).toEqual([
      'scene_heading',
      'synopsis',
      'synopsis',
      'action',
      'character',
      'parenthetical',
      'dialogue',
      'transition',
      'page_break',
      'scene_heading',
      'centered',
      'character',
      'dialogue',
      'character',
      'dialogue',
      'scene_heading',
      'transition',
    ]);
    const heading = doc.blocks[0];
    expect(heading?.kind === 'scene_heading' && heading.sem.number).toBe('12A');
    const second = doc.blocks[13];
    expect(second?.kind === 'character' && second.sem.dual).toBe(true);
  });

  it('forces each kind whose plain text would read as another', () => {
    const text = fromFdx(
      fdx(
        P('Action', 'A LOUD BANG') +
          P('Action', 'THE DOOR\nIt opens.') +
          P('Action', 'INT. HOUSE - DAY') +
          P('Action', 'GO TO:') +
          P('Character', 'Odile') +
          P('Dialogue', 'Hi.') +
          P('Scene Heading', 'harbour') +
          P('Transition', 'LATER') +
          P('Action', '!Bang'),
      ),
    ).text;
    expect(text).toBe(
      [
        'A LOUD BANG',
        '',
        '!THE DOOR',
        'It opens.',
        '',
        '!INT. HOUSE - DAY',
        '',
        '!GO TO:',
        '',
        '@Odile',
        'Hi.',
        '',
        '.harbour',
        '',
        '> LATER',
        '',
        '!!Bang',
        '',
      ].join('\n'),
    );
    expect(kinds(parse(text))).toEqual([
      'action',
      'action',
      'action',
      'action',
      'character',
      'dialogue',
      'scene_heading',
      'transition',
      'action',
    ]);
  });

  it('keeps the lines of a paragraph, an empty one as a two-space line', () => {
    const text = fromFdx(
      fdx(
        P('Action', 'One.\n\nTwo.\r\nThree.') +
          P('Character', 'ODILE') +
          P('Dialogue', 'Line one.\nLine two.\n\nLine four.'),
      ),
    ).text;
    expect(text).toBe('One.\n  \nTwo.\nThree.\n\nODILE\nLine one.\nLine two.\n  \nLine four.\n');
    expect(printed(parse(text))).toEqual([
      ['action', 'One.\n\nTwo.\nThree.'],
      ['character', 'ODILE'],
      ['dialogue', 'Line one.\nLine two.\n\nLine four.'],
    ]);
  });

  it('turns a tab into four spaces', () => {
    expect(fromFdx(fdx(P('Action', 'a&#9;b'))).text).toBe('a    b\n');
  });

  it('writes a speech without blank lines, and a lone parenthetical or dialogue as a note', () => {
    const result = fromFdx(
      fdx(
        P('Dialogue', 'Nobody said this.') +
          P('Character', 'THEO') +
          P('Parenthetical', 'quietly') +
          P('Dialogue', 'Hello.') +
          P('Dialogue', 'Again.'),
      ),
    );
    expect(result.text).toBe(
      'Nobody said this. [[fdx: Dialogue]]\n\nTHEO\n(quietly)\nHello.\nAgain.\n',
    );
    expect(result.mapped).toEqual([{ type: 'Dialogue', count: 1 }]);
  });

  it('writes nested and combined emphasis that reads back the same', () => {
    const text = fromFdx(
      fdx(
        `<Paragraph Type="Action"><Text Style="Bold">a </Text><Text Style="Bold+Italic">b</Text><Text Style="Bold"> c</Text><Text> and </Text><Text Style="Bold+Italic+Underline">all</Text><Text Style="AllCaps"> d</Text></Paragraph>`,
      ),
    ).text;
    expect(text).toBe('**a *b* c** and _***all***_ d\n');
    const runs = parse(text).blocks[0]?.lines[0]?.inline ?? [];
    expect(runs.map((r) => [r.text, r.bold, r.italic, r.underline])).toEqual([
      ['a ', true, false, false],
      ['b', true, true, false],
      [' c', true, false, false],
      [' and ', false, false, false],
      ['all', true, true, true],
      [' d', false, false, false],
    ]);
  });

  it('moves spaces at the edge of a styled run outside its markers', () => {
    expect(
      fromFdx(
        fdx(
          '<Paragraph Type="Action"><Text Style="Italic"> soft </Text><Text>x</Text></Paragraph>',
        ),
      ).text,
    ).toBe(' *soft* x\n');
  });

  it('writes plain text when two styles touch in a way Fountain cannot mark', () => {
    const text = fromFdx(
      fdx(
        '<Paragraph Type="Action"><Text Style="Italic">a</Text><Text Style="Bold">b</Text></Paragraph>',
      ),
    ).text;
    expect(printed(parse(text))).toEqual([['action', 'ab']]);
  });
});

describe('fromFdx: speeches', () => {
  it('writes a lyric that follows another on its own, so the two stay apart', () => {
    const lyric = (text: string) =>
      `<Paragraph Type="Dialogue" DrafterLyric="Yes"><Text Style="Italic">${text}</Text></Paragraph>`;
    const text = fromFdx(
      fdx(P('Character', 'THEO') + P('Dialogue', 'Hi.') + lyric('One.') + lyric('Two.')),
    ).text;
    expect(text).toBe('THEO\nHi.\n~One.\n\n~Two.\n');
    expect(kinds(parse(text))).toEqual(['character', 'dialogue', 'lyric', 'lyric']);
  });

  it('writes a lyric with no speaker as a lyric', () => {
    const text = fromFdx(
      fdx(
        '<Paragraph Type="Dialogue" DrafterLyric="Yes"><Text Style="Italic">La.</Text></Paragraph>',
      ),
    ).text;
    expect(text).toBe('~La.\n');
  });

  it("keeps a parenthetical's parentheses plain, so it still reads as one", () => {
    const text = fromFdx(
      fdx(
        P('Character', 'THEO') +
          '<Paragraph Type="Parenthetical"><Text Style="Italic">(softly)</Text></Paragraph>' +
          P('Dialogue', 'Hi.'),
      ),
    ).text;
    expect(text).toBe('THEO\n(*softly*)\nHi.\n');
    expect(kinds(parse(text))).toEqual(['character', 'parenthetical', 'dialogue']);
  });

  it('breaks a stray [[ in a speech so it cannot close in the next line', () => {
    const text = fromFdx(
      fdx(P('Character', 'THEO') + P('Dialogue', 'a [[ b') + P('Dialogue', 'c ]] d')),
    ).text;
    expect(text).toBe('THEO\na [\\[ b\nc ]] d\n');
    expect(parse(text).regions).toEqual([]);
  });

  it('keeps an empty action paragraph as a two-space line', () => {
    const text = fromFdx(
      fdx(`${P('Action', 'One.')}<Paragraph Type="Action"/>${P('Action', 'Two.')}`),
    ).text;
    expect(text).toBe('One.\n\n  \n\nTwo.\n');
    expect(kinds(parse(text))).toEqual(['action', 'action', 'action']);
  });
});

describe('fromFdx: escaping', () => {
  it('escapes emphasis markers and a boneyard opener, and keeps notes', () => {
    const text = fromFdx(
      fdx(P('Action', 'Use *stars* and _lines_ and a \\ and /* this [[a note]] stays.')),
    ).text;
    expect(text).toBe(
      'Use \\*stars\\* and \\_lines\\_ and a \\\\ and /\\* this [[a note]] stays.\n',
    );
    const doc = parse(text);
    expect(doc.regions.map((r) => r.kind)).toEqual(['note']);
    expect(printed(doc)).toEqual([
      ['action', 'Use *stars* and _lines_ and a \\ and /* this  stays.'],
    ]);
  });

  it('keeps a line that starts with a marker in the kind it had', () => {
    const text = fromFdx(
      fdx(
        P('Action', 'First.\n# not a section\n= not a synopsis\n===') +
          P('Character', 'ODILE') +
          P('Dialogue', '(not a parenthetical)\n~not a lyric\n#hash'),
      ),
    ).text;
    expect(kinds(parse(text))).toEqual(['action', 'character', 'dialogue']);
  });

  it('does not escape in kinds where Fountain reads no emphasis', () => {
    expect(fromFdx(fdx(P('Scene Heading', 'INT. *STAR* BAR - DAY'))).text).toBe(
      'INT. *STAR* BAR - DAY\n',
    );
  });
});

describe('fromFdx: unmapped content', () => {
  it('brings in unknown types and elements as notes, counted, and lists settings as ignored', () => {
    const result = fromFdx(fixture('unmapped.fdx'));
    expect(result.text).toBe(
      [
        'ACT ONE [[fdx: New Act]]',
        '',
        "ODILE, a keeper's daughter [[fdx: Cast List]]",
        '',
        'A plain general line. [[fdx: General]]',
        '',
        'THEO, a ferryman [[fdx: Cast List]]',
        '',
        '[[fdx: End of Act]]',
        '',
        'A drawing of the tower. [[fdx: Sketchbook]]',
        '',
      ].join('\n'),
    );
    expect(result.mapped).toEqual([
      { type: 'New Act', count: 1 },
      { type: 'Cast List', count: 2 },
      { type: 'General', count: 1 },
      { type: 'End of Act', count: 1 },
      { type: 'Sketchbook', count: 1 },
    ]);
    expect(result.ignored).toEqual([
      'ElementSettings',
      'PageLayout',
      'HeaderAndFooter',
      'SmartType',
    ]);
    expect(kinds(parse(result.text))).toEqual([
      'action',
      'action',
      'action',
      'action',
      'note',
      'action',
    ]);
  });

  it('forces an unknown type whose text would read as another kind', () => {
    const text = fromFdx(fdx(P('Cast List', 'ODILE') + P('Cast List', 'INT. NOT A SCENE'))).text;
    expect(kinds(parse(text))).toEqual(['action', 'action']);
  });
});

describe("fromFdx: Drafter's own marks", () => {
  it('honours DrafterSection, DrafterSynopsis, DrafterNote, DrafterLyric, and DrafterKey', () => {
    const result = fromFdx(fixture('drafter-marks.fdx'));
    expect(result.text).toBe(
      [
        'Title: *The* Last Lamp',
        'Contact: I. Vale',
        '    vale@example.com',
        'Draft date: 1 March',
        '',
        '# Act One',
        '',
        '= The keeper loses the light.',
        '',
        '## Scene 1',
        '',
        '= A storm.',
        '',
        '[[check the tide tables]]',
        '',
        'THEO',
        '~Row the boat, **row**',
        '',
      ].join('\n'),
    );
    expect(result.title).toBe('The Last Lamp');
    expect(result.mapped).toEqual([]);
    const doc = parse(result.text);
    expect(doc.titlePage?.fields.map((f) => [f.key, f.value])).toEqual([
      ['Title', ['*The* Last Lamp']],
      ['Contact', ['I. Vale', 'vale@example.com']],
      ['Draft date', ['1 March']],
    ]);
    expect(kinds(doc)).toEqual([
      'section',
      'synopsis',
      'section',
      'synopsis',
      'note',
      'character',
      'lyric',
    ]);
  });

  it("falls back to Final Draft's meaning without them", () => {
    const text = fromFdx(
      fdx(
        P('Character', 'THEO') +
          `<Paragraph Type="Dialogue"><Text Style="Italic">Row the boat</Text></Paragraph>`,
      ),
    ).text;
    expect(text).toBe('THEO\n*Row the boat*\n');
    expect(kinds(parse(text))).toEqual(['character', 'dialogue']);
  });
});

describe('fromFdx: the title page', () => {
  it('reads a title page without keys by its order and words', () => {
    const result = fromFdx(fixture('title-page.fdx'));
    expect(result.text).toBe(
      [
        'Title: _**THE LAST LAMP**_',
        'Credit: written by',
        'Author: Imogen Vale',
        'Notes: 12 Harbour Row',
        '    vale@example.com',
        '',
        'The sea.',
        '',
      ].join('\n'),
    );
    expect(result.title).toBe('THE LAST LAMP');
    expect(parse(result.text).titlePage?.fields.map((f) => f.key)).toEqual([
      'Title',
      'Credit',
      'Author',
      'Notes',
    ]);
  });

  it('forces a first paragraph that would read as a title page', () => {
    const text = fromFdx(fdx(P('Action', 'Title: not really'))).text;
    const doc = parse(text);
    expect(doc.titlePage).toBeNull();
    expect(printed(doc)).toEqual([['action', 'Title: not really']]);
  });
});

describe('fromFdx: content in unexpected places', () => {
  it('keeps every piece of text, as a note where it has no place', () => {
    const result = fromFdx(fixture('stray-content.fdx'));
    expect(result.text).toBe(
      [
        'Title: THE NETS',
        '',
        'INT. BOATHOUSE - DAWN [[fdx: Number 12 A]]',
        '',
        'Gulls circle the mast.',
        '',
        '= Ropes everywhere.',
        '',
        'Beside the pair. [[fdx: Text]]',
        '',
        'ODILE',
        'Now.',
        '',
        'Spoken low. [[fdx: Aside]]',
        '',
        'THEO ^',
        'Later.',
        '',
        'Harbour Films [[fdx: Logo]]',
        '',
        'Draft only [[fdx: Stamp]]',
        '',
      ].join('\n'),
    );
    expect(result.mapped).toEqual([
      { type: 'Number', count: 1 },
      { type: 'Text', count: 1 },
      { type: 'Aside', count: 1 },
      { type: 'Logo', count: 1 },
      { type: 'Stamp', count: 1 },
    ]);
  });

  it('keeps a scene property summary on a paragraph inside a speech, after the speech', () => {
    const text = fromFdx(
      fdx(
        `${P('Character', 'THEO')}<Paragraph Type="Dialogue"><SceneProperties Summary="He lies."/><Text>Hi.</Text></Paragraph>`,
      ),
    ).text;
    expect(text).toBe('THEO\nHi.\n\n= He lies.\n');
  });

  it('writes a speech no marker can hold as action with a note', () => {
    // The second speaker's cue has a `(` that never closes, so no `^` can make it dual.
    const result = fromFdx(
      fdx(
        `<Paragraph><DualDialogue>${P('Character', 'ODILE')}${P('Dialogue', 'Now.')}${P('Character', 'THEO (low')}${P('Dialogue', 'Later.')}</DualDialogue></Paragraph>`,
      ),
    );
    expect(result.text).toBe('ODILE\nNow.\n\nTHEO (low\nLater. [[fdx: Character]]\n');
    expect(result.mapped).toEqual([{ type: 'Character', count: 1 }]);
    expect(kinds(parse(result.text))).toEqual(['character', 'dialogue', 'action']);
  });
});

describe('fromFdx on a large file', () => {
  const big = (paragraph: (text: string) => string, unit: string) => {
    const shell = fdx(paragraph(''));
    return fdx(paragraph(unit.repeat(Math.floor((5_000_000 - shell.length) / unit.length))));
  };

  it('reads 5 MB of unclosed note openers in action in linear time', () => {
    const xml = big((t) => P('Action', t), '[[');
    const start = performance.now();
    fromFdx(xml);
    expect(performance.now() - start).toBeLessThan(3000);
  });

  it('reads 5 MB of unclosed note openers in dialogue in linear time', () => {
    const xml = big((t) => P('Character', 'BOB') + P('Dialogue', t), 'a [[ ');
    const start = performance.now();
    fromFdx(xml);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});

describe('fromFdx: refusals', () => {
  it('refuses XML the reader refuses, wrapping its error', () => {
    let caught: unknown;
    try {
      fromFdx('<FinalDraft><Content></FinalDraft>');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(FdxError);
    expect((caught as FdxError).message).toMatch(/^This isn’t a Final Draft file: /);
    expect((caught as FdxError).cause).toBeInstanceOf(XmlError);
    expect(() => fromFdx('<!DOCTYPE x><FinalDraft><Content/></FinalDraft>')).toThrow(FdxError);
    expect(() => fromFdx('')).toThrow(FdxError);
  });

  it('refuses XML that is not a Final Draft document', () => {
    expect(() => fromFdx('<html><body/></html>')).toThrow(/^This isn’t a Final Draft file: /);
    expect(() => fromFdx('<FinalDraft><TitlePage/></FinalDraft>')).toThrow(FdxError);
  });

  it('accepts an empty Content', () => {
    expect(fromFdx('<FinalDraft><Content/></FinalDraft>')).toEqual({
      text: '',
      title: null,
      mapped: [],
      ignored: [],
    });
  });
});

describe('fromFdx: any file', () => {
  const piece = fc.constantFrom(
    'INT. ',
    'BOB',
    'bob',
    '(',
    ')',
    '*',
    '**',
    '_',
    '\\',
    '[[',
    ']]',
    '/*',
    '#',
    '=',
    '===',
    '~',
    '>',
    '<',
    '!',
    '@',
    '.',
    '^',
    ' TO:',
    'Title: ',
    ' ',
    '\n',
    '\n\n',
    'hello',
    '\t',
    ' #1#',
  );
  const style = fc.constantFrom(
    '',
    'Bold',
    'Italic',
    'Underline',
    'Bold+Italic',
    'Italic+Underline',
  );
  const runs = fc.array(
    fc.tuple(
      fc.array(piece, { maxLength: 8 }).map((p) => p.join('')),
      style,
    ),
    { minLength: 1, maxLength: 3 },
  );
  const xmlText = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const para = (type: string, r: Array<[string, string]>) =>
    `<Paragraph Type="${type}">${r
      .map(([t, s]) => `<Text${s ? ` Style="${s}"` : ''}>${xmlText(t)}</Text>`)
      .join('')}</Paragraph>`;
  // A paragraph with nothing outside its notes, or a note over a blank line, may come in as a
  // note; the property leaves those out.
  const plain = (r: Array<[string, string]>) => {
    const text = r.map(([t]) => t).join('');
    return text.includes('[[') ? '' : text.trim();
  };
  const item = fc.oneof(
    runs.map((r) => ({ xml: para('Action', r), kinds: plain(r) ? ['action'] : null })),
    fc.tuple(runs, runs).map(([c, d]) => ({
      xml: para('Character', c) + para('Dialogue', d),
      kinds: plain(c) && plain(d) ? ['character', 'dialogue'] : null,
    })),
    fc.tuple(runs, runs).map(([c, d]) => ({
      xml: para('Character', c) + para('Parenthetical', d),
      kinds: plain(c) && plain(d) ? ['character', 'parenthetical'] : null,
    })),
    runs.map((r) => ({
      xml: para('Scene Heading', r),
      kinds: plain(r) ? ['scene_heading'] : null,
    })),
    runs.map((r) => ({ xml: para('Transition', r), kinds: plain(r) ? ['transition'] : null })),
  );

  it('keeps each paragraph in its kind, or counts it as a note', () => {
    fc.assert(
      fc.property(fc.array(item, { maxLength: 6 }), (items) => {
        const result = fromFdx(fdx(items.map((i) => i.xml).join('')));
        const doc = parse(result.text);
        expect(doc.titlePage).toBeNull();
        expect(print(doc)).toBe(result.text);
        if (result.mapped.length === 0 && items.every((i) => i.kinds)) {
          expect(kinds(doc)).toEqual(items.flatMap((i) => i.kinds ?? []));
        }
      }),
      { numRuns: 1000 },
    );
  });
});

describe('fromFdx: the round trip through Fountain', () => {
  it('writes text that prints back exactly', () => {
    for (const name of ['elements.fdx', 'unmapped.fdx', 'title-page.fdx', 'drafter-marks.fdx']) {
      const { text } = fromFdx(fixture(name));
      expect(print(parse(text))).toBe(text);
    }
  });

  it('imports what export wrote so that exporting it again writes the same file', () => {
    fc.assert(
      fc.property(fountainScript, (source) => {
        const first = toFdx(parse(source), screenplay);
        const again = toFdx(parse(fromFdx(first).text), screenplay);
        expect(again).toBe(first);
      }),
      { numRuns: 200 },
    );
  });
});
