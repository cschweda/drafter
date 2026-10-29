import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Doc, parse, print } from '@drafter/fountain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FdxError, fromFdx, XmlError } from '../src';
import { HANG_MS, MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

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

  it("ignores Final Draft's breakdown tags, which hold ids rather than writing", () => {
    const tags =
      '<TagData><TagCategories><TagCategory Id="c1" Name="Props" Number="1"/></TagCategories>' +
      '<TagDefinitions><TagDefinition CatId="c1" Id="d1" Label="lantern" Number="1"/></TagDefinitions>' +
      '<Tags><Tag Number="1"><DefId>d1</DefId></Tag></Tags></TagData>';
    const result = fromFdx(fdx(P('Action', 'The sea.'), tags));
    expect(result.text).toBe('The sea.\n');
    expect(result.mapped).toEqual([]);
    expect(result.ignored).toEqual(['TagData']);
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

  it('takes a paragraph with an empty Text run as a gap between blocks, as an empty paragraph', () => {
    // Final Draft writes a title page's blank lines as `<Text></Text>`, not as empty paragraphs.
    const centered = (text: string) =>
      `<Paragraph Alignment="Center"><Text>${text}</Text></Paragraph>`;
    const result = fromFdx(
      fdx(
        P('Action', 'The sea.'),
        `<TitlePage><Content>${[
          'THE NETS',
          '',
          'by',
          '   ',
          'Imogen Vale',
          '',
          'Based on a story by Ada Quill',
        ]
          .map(centered)
          .join('')}</Content></TitlePage>`,
      ),
    );
    expect(result.text).toBe(
      [
        'Title: THE NETS',
        'Credit: by',
        'Author: Imogen Vale',
        'Notes: Based on a story by Ada Quill',
        '',
        'The sea.',
        '',
      ].join('\n'),
    );
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

  it('keeps text written directly inside a DualDialogue, as a note in its place', () => {
    const result = fromFdx(
      fdx(
        `<Paragraph><DualDialogue>${P('Character', 'ODILE')}${P('Dialogue', 'Now.')} Both at once. ${P('Character', 'THEO')}${P('Dialogue', 'Later.')}</DualDialogue></Paragraph>`,
      ),
    );
    expect(result.text).toBe(
      [
        'ODILE',
        'Now.',
        '',
        'Both at once. [[fdx: DualDialogue text]]',
        '',
        'THEO ^',
        'Later.',
        '',
      ].join('\n'),
    );
    expect(result.mapped).toEqual([{ type: 'DualDialogue text', count: 1 }]);
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

describe("fromFdx: values Drafter can't trust", () => {
  it('takes a section depth from 1 to 6, and brings any other in as a note', () => {
    const section = (depth: string) =>
      `<Paragraph Type="General" DrafterSection="${depth}"><Text>Part</Text></Paragraph>`;
    expect(fromFdx(fdx(section('6'))).text).toBe('###### Part\n');
    // The text check below is what proves a huge depth isn't repeated; the clock only guards a hang.
    const start = performance.now();
    const result = fromFdx(
      fdx(
        section('30000000') +
          section('999999999999') +
          section('deep') +
          section('0') +
          section('7') +
          section('2.5'),
      ),
    );
    expect(performance.now() - start).toBeLessThan(HANG_MS);
    expect(result.text).toBe(`${Array(6).fill('Part [[fdx: General]]').join('\n\n')}\n`);
    expect(result.mapped).toEqual([{ type: 'General', count: 6 }]);
    const heading = fromFdx(
      fdx(
        '<Paragraph Type="Scene Heading" DrafterSection="99"><Text>INT. A - DAY</Text></Paragraph>',
      ),
    );
    expect(heading.text).toBe('!INT. A - DAY [[fdx: Scene Heading]]\n');
  });
});

describe('fromFdx: text outside its elements', () => {
  it('reads text placed directly in a paragraph as its text', () => {
    expect(fromFdx(fdx('<Paragraph Type="Action">Hello bare</Paragraph>')).text).toBe(
      'Hello bare\n',
    );
  });

  it('keeps text beside the Text runs as a note', () => {
    const result = fromFdx(
      fdx('<Paragraph Type="Action"><Text>Hi.</Text> stray words</Paragraph>'),
    );
    expect(result.text).toBe('Hi.\n\nstray words [[fdx: Paragraph text]]\n');
    expect(result.mapped).toEqual([{ type: 'Paragraph text', count: 1 }]);
  });

  it('keeps what a SceneProperties holds inside it', () => {
    const result = fromFdx(
      fdx(
        '<Paragraph Type="Scene Heading"><SceneProperties Summary="S"><Paragraph Type="Action"><Text>inner</Text></Paragraph></SceneProperties><Text>INT. A - DAY</Text></Paragraph>',
      ),
    );
    expect(result.text).toBe('INT. A - DAY\n\n= S\n\ninner [[fdx: Paragraph]]\n');
    expect(result.mapped).toEqual([{ type: 'Paragraph', count: 1 }]);
  });

  it("keeps a dual pair's summary and the text beside it", () => {
    const result = fromFdx(fixture('dual-extras.fdx'));
    expect(result.text).toBe(
      [
        'loose words [[fdx: Paragraph text]]',
        '',
        'ODILE',
        'Now.',
        '',
        'THEO ^',
        'Later.',
        '',
        '= Both talk at once.',
        '',
      ].join('\n'),
    );
    expect(result.ignored).toEqual([]);
  });
});

describe('fromFdx on a large file', () => {
  // A file of about `chars` characters, one paragraph of `unit` repeated.
  const big = (paragraph: (text: string) => string, unit: string) => (chars: number) =>
    fdx(paragraph(unit.repeat(Math.floor(chars / unit.length))));

  // Linear, not a wall-clock budget (scaling.ts): a quadratic search for each `[[`'s `]]` grows
  // about 16 times from 250 KB to 1 MB. The whole 5 MB file is still read once, as a hang guard.
  it(
    'reads unclosed note openers in action in linear time',
    () => {
      const make = big((t) => P('Action', t), '[[');
      const { growth, large } = scaling(make, fromFdx, 250_000);
      expect(growth).toBeLessThan(MAX_GROWTH);
      expect(large).toBeLessThan(HANG_MS);
      expect(() => fromFdx(make(4_990_000))).not.toThrow();
    },
    SCALING_TIMEOUT,
  );

  it(
    'reads unclosed note openers in dialogue in linear time',
    () => {
      const make = big((t) => P('Character', 'BOB') + P('Dialogue', t), 'a [[ ');
      const { growth, large } = scaling(make, fromFdx, 250_000);
      expect(growth).toBeLessThan(MAX_GROWTH);
      expect(large).toBeLessThan(HANG_MS);
      expect(() => fromFdx(make(4_990_000))).not.toThrow();
    },
    SCALING_TIMEOUT,
  );
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
      ignoredCount: 0,
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
});

// Shapes a Final Draft 13 file showed (element and attribute names only; every text and value
// here is invented).
describe('fromFdx: Final Draft 13 shapes', () => {
  const lines = (...parts: string[]) => `${parts.join('\n')}\n`;

  it('accepts a root of Version 6', () => {
    const xml =
      '<?xml version="1.0"?><FinalDraft DocumentType="Script" Template="No" Version="6"><Content>' +
      `${P('Action', 'The sea.')}</Content></FinalDraft>`;
    expect(fromFdx(xml).text).toBe('The sea.\n');
  });

  it('ignores an image and puts a short note where a paragraph holds a picture', () => {
    const result = fromFdx(
      fdx(
        P('Action', 'A map on the wall.') +
          '<Paragraph Type="Action"><Picture Id="p1" Width="100" Height="80"/></Paragraph>' +
          '<Paragraph Type="Action"><Text>See below:</Text><Picture Id="p1" Width="10" Height="8"/></Paragraph>',
        '<Images><Image Id="p1" Length="24" Path="map.png">ZmFrZSBpbWFnZSBieXRlcw==</Image></Images>',
      ),
    );
    expect(result.text).toBe(
      lines('A map on the wall.', '', '[[fdx: Picture]]', '', 'See below:', '', '[[fdx: Picture]]'),
    );
    expect(result.text).not.toContain('ZmFr');
    expect(result.mapped).toEqual([{ type: 'Picture', count: 2 }]);
    expect(result.ignored).toEqual(['Images']);
  });

  it('maps outline paragraphs to sections, Summary to a synopsis in place, and Note to a note', () => {
    const result = fromFdx(
      fdx(
        P('Outline 1 (Acts)', 'The Flood') +
          P('Outline 2 (Sequences)', 'Rising water') +
          P('Outline 9 (Custom)', 'Sandbags', ' OutlineLevel="3"') +
          P('Summary', 'The river wins.') +
          P('Note', 'Check the tide tables') +
          P('Scene Heading', 'INT. CELLAR - NIGHT') +
          P('Action', 'Water at the steps.') +
          P('Summary', 'Everyone moves upstairs.') +
          P('Outline 3 (Scenes)', 'Upstairs', ' OutlineLevel="2"'),
      ),
    );
    expect(result.text).toBe(
      lines(
        '# The Flood',
        '',
        '## Rising water',
        '',
        '### Sandbags',
        '',
        '= The river wins.',
        '',
        '[[Check the tide tables]]',
        '',
        'INT. CELLAR - NIGHT',
        '',
        'Water at the steps.',
        '',
        '= Everyone moves upstairs.',
        '',
        '## Upstairs',
      ),
    );
    expect(kinds(parse(result.text))).toEqual([
      'section',
      'section',
      'section',
      'synopsis',
      'note',
      'scene_heading',
      'action',
      'synopsis',
      'section',
    ]);
    expect(result.mapped).toEqual([]);
  });

  it('reads a scene title written again as a child, and keeps arc beats as notes', () => {
    const result = fromFdx(
      fdx(
        '<Paragraph Type="Scene Heading"><SceneProperties Title="The cellar">' +
          '<AttributedTitle><Paragraph><Text>The cellar</Text></Paragraph></AttributedTitle>' +
          '<SceneArcBeats><CharacterArcBeat Name="MOIRA"><Paragraph><Text>Stops pretending.</Text></Paragraph></CharacterArcBeat>' +
          '<CharacterArcBeat Name="TOMAS"/></SceneArcBeats>' +
          '</SceneProperties><Text>INT. CELLAR - NIGHT</Text></Paragraph>' +
          '<Paragraph Type="Scene Heading"><SceneProperties Title="">' +
          '<AttributedTitle><Paragraph><Text>A different title</Text></Paragraph></AttributedTitle>' +
          '</SceneProperties><Text>INT. STAIRS - NIGHT</Text></Paragraph>',
      ),
    );
    expect(result.text).toBe(
      lines(
        'INT. CELLAR - NIGHT',
        '',
        '= The cellar',
        '',
        '[[fdx: Arc beat, MOIRA: Stops pretending.]]',
        '',
        'INT. STAIRS - NIGHT',
        '',
        'A different title [[fdx: AttributedTitle]]',
      ),
    );
    expect(result.mapped).toEqual([
      { type: 'Arc beat', count: 1 },
      { type: 'AttributedTitle', count: 1 },
    ]);
    expect(result.ignored).toEqual(['AttributedTitle', 'CharacterArcBeat']);
  });

  it('keeps the current text of a paragraph with alternates, and the others as notes after it', () => {
    const alt = (id: string, type: string, text: string) =>
      `<Alt Id="${id}"><Paragraph Type="${type}"><Text>${text}</Text></Paragraph></Alt>`;
    const result = fromFdx(
      fdx(
        '<Paragraph Type="Action"><Alts Current="0"><AltId>a1</AltId><AltId>a2</AltId></Alts><Text>The door sticks.</Text></Paragraph>' +
          P('Character', 'MOIRA') +
          '<Paragraph Type="Dialogue"><Alts Current="1"><AltId>a3</AltId><AltId>a4</AltId></Alts><Text>Push harder.</Text></Paragraph>' +
          P('Action', 'After.'),
        `<AltCollection>${alt('a1', 'Action', 'The door sticks.')}${alt('a2', 'Action', 'The door will not budge.')}${alt('a3', 'Dialogue', 'Push harder.')}${alt('a4', 'Dialogue', 'Use your shoulder.')}${alt('a9', 'Action', 'An orphan line.')}</AltCollection>`,
      ),
    );
    expect(result.text).toBe(
      lines(
        'The door sticks.',
        '',
        '[[fdx: Alternate: The door will not budge.]]',
        '',
        'MOIRA',
        'Push harder.',
        '',
        '[[fdx: Alternate: Use your shoulder.]]',
        '',
        'After.',
        '',
        '[[fdx: Alternate: An orphan line.]]',
      ),
    );
    expect(result.mapped).toEqual([{ type: 'Alternate', count: 3 }]);
  });

  it('brings each alternate in once, however many paragraphs name it', () => {
    // A hostile file could name one large alternate from thousands of places; output must stay
    // near the size of what the file holds, not grow with the number of references.
    const altText = 'The lantern swings and goes out. '.repeat(31); // about 1 KB
    const collection = `<AltCollection><Alt Id="a1"><Paragraph Type="Action"><Text>${altText}</Text></Paragraph></Alt></AltCollection>`;
    const ids = (n: number) => '<AltId>a1</AltId>'.repeat(n);
    const one = (n: number) =>
      fdx(
        `<Paragraph Type="Action"><Alts Current="0">${ids(n)}</Alts><Text>Dark.</Text></Paragraph>`,
        collection,
      );
    const many = (n: number) =>
      fdx(
        `<Paragraph Type="Action"><Alts Current="0">${ids(1)}</Alts><Text>Dark.</Text></Paragraph>`.repeat(
          n,
        ),
        collection,
      );
    const base = fromFdx(one(1)).text.length;
    expect(base).toBeGreaterThan(altText.length);
    expect(fromFdx(one(10_000)).text.length).toBe(base);
    const spread = fromFdx(many(10_000));
    // 10,000 paragraphs of "Dark." and one alternate: about 7 characters a paragraph, not 1 KB.
    expect(spread.text.length).toBeLessThan(10_000 * 8 + altText.length + 2_000);
    expect(spread.mapped).toEqual([{ type: 'Alternate', count: 1 }]);
  });

  it(
    'reads many references to one alternate in linear time',
    () => {
      const collection = `<AltCollection><Alt Id="a1"><Paragraph><Text>${'x'.repeat(1000)}</Text></Paragraph></Alt></AltCollection>`;
      const make = (n: number) =>
        fdx(
          `<Paragraph Type="Action"><Alts Current="0">${'<AltId>a1</AltId>'.repeat(n)}</Alts><Text>Dark.</Text></Paragraph>`,
          collection,
        );
      const { growth, large } = scaling(make, fromFdx, 50_000);
      expect(growth).toBeLessThan(MAX_GROWTH);
      expect(large).toBeLessThan(HANG_MS);
    },
    SCALING_TIMEOUT,
  );

  it('brings beat cards in as notes after the script, one per beat, with their titles', () => {
    const result = fromFdx(
      fdx(
        P('Action', 'The sea.'),
        '<ListItems>' +
          '<ListItem Color="#000000" Id="b1" Title="The flood" Type="Beat"><SubordinateTo Id="x"/><Content>' +
          '<Paragraph><Text>Water comes in.</Text></Paragraph><Paragraph><Text>Nobody leaves.</Text></Paragraph></Content></ListItem>' +
          '<ListItem Id="b2" Title="" Type="Beat"><Content><Paragraph><Text>An untitled beat.</Text></Paragraph></Content></ListItem>' +
          '<ListItem Id="b3" Title="Empty" Type="Beat"/>' +
          '<ListItem Id="b4" Title="" Type="Beat"/>' +
          '</ListItems>',
      ),
    );
    expect(result.text).toBe(
      lines(
        'The sea.',
        '',
        '[[fdx: Beat, The flood: Water comes in. Nobody leaves.]]',
        '',
        '[[fdx: Beat: An untitled beat.]]',
        '',
        '[[fdx: Beat, Empty]]',
      ),
    );
    expect(result.mapped).toEqual([{ type: 'Beat', count: 3 }]);
    expect(result.ignored).toEqual(['ListItem']);
  });

  it("keeps each script note, headed by its writer's name where it has one", () => {
    const result = fromFdx(
      fdx(
        P('Action', 'The sea.'),
        '<ScriptNotes>' +
          '<ScriptNote Id="n1" Range="10,24" WriterName="Ada Quill"><Paragraph><Text>Too long?</Text></Paragraph><Paragraph><Text>Cut a line.</Text></Paragraph></ScriptNote>' +
          '<ScriptNote Id="n2" Range="40,52"><Paragraph><Text>Check this ]] here.</Text></Paragraph></ScriptNote>' +
          '<ScriptNote Id="n3" Range="60,61" WriterName="Ada Quill"/>' +
          '</ScriptNotes>',
      ),
    );
    expect(result.text).toBe(
      lines(
        'The sea.',
        '',
        '[[Ada Quill: Too long? Cut a line.]]',
        '',
        '[[fdx: Script note: Check this ] ] here.]]',
      ),
    );
    expect(result.mapped).toEqual([{ type: 'Script note', count: 2 }]);
    expect(kinds(parse(result.text))).toEqual(['action', 'note', 'note']);
  });

  it('lists the settings and data blocks a Final Draft 13 file carries as ignored', () => {
    const names = [
      'DocumentRef',
      'Actors',
      'Cast',
      'CastList',
      'CharacterHighlighting',
      'ScriptNavigatorPreferences',
      'Writers',
      'WriterMarkup',
      'Navigator',
      'Outlines',
      'TargetScriptLength',
      'Characters',
    ];
    const result = fromFdx(
      fdx(
        `${P('Action', 'The sea.')}<Paragraph><DualDialogue>${P('Character', 'A')}${P('Dialogue', 'Hi.')}` +
          `<SpellCheckIgnoreLists><IgnoredWord>zzz</IgnoredWord></SpellCheckIgnoreLists>${P('Character', 'B')}${P('Dialogue', 'Bye.')}</DualDialogue></Paragraph>`,
        names.map((n) => `<${n} Id="x1"><Item Label="y">invented text ${n}</Item></${n}>`).join(''),
      ),
    );
    expect(result.mapped).toEqual([]);
    expect(result.ignored).toEqual(['SpellCheckIgnoreLists', ...names]);
    expect(result.text).toBe(lines('The sea.', '', 'A', 'Hi.', '', 'B ^', 'Bye.'));
  });
});

describe('fromFdx: review fixes for the Final Draft 13 shapes', () => {
  const lines = (...parts: string[]) => `${parts.join('\n')}\n`;

  it(
    'reads a long paragraph with many Alts in linear time',
    () => {
      // The paragraph grows with n and so does its number of `<Alts/>`: reading the paragraph
      // again for each one would grow about 16 times from n to 4n.
      const make = (n: number) =>
        fdx(
          `<Paragraph Type="Action"><Text>${'w '.repeat(n)}</Text>${'<Alts/>'.repeat(n / 10)}</Paragraph>`,
        );
      const { growth, large } = scaling(make, fromFdx, 5_000);
      expect(growth).toBeLessThan(MAX_GROWTH);
      expect(large).toBeLessThan(HANG_MS);
    },
    SCALING_TIMEOUT,
  );

  it(
    'lists ignored names in linear time, and at most 50 of them',
    () => {
      const make = (n: number) =>
        fdx(P('Action', 'x') + Array.from({ length: n }, (_, k) => `<Empty${k}/>`).join(''));
      const { growth, large } = scaling(make, fromFdx, 5_000);
      expect(growth).toBeLessThan(MAX_GROWTH);
      expect(large).toBeLessThan(HANG_MS);
      const result = fromFdx(make(200));
      expect(result.ignored).toHaveLength(50);
      expect(result.ignored[0]).toBe('Empty0');
      expect(result.ignoredCount).toBe(200);
      expect(fromFdx(make(3)).ignoredCount).toBe(3);
    },
    SCALING_TIMEOUT,
  );

  it('never brings an image or a picture payload into the script, wherever it sits', () => {
    const result = fromFdx(
      fdx(
        P('Action', 'x'),
        '<Wrapper><Images><Image Id="i1">QUFBQUJCQkI=</Image></Images><Label>kept words</Label></Wrapper>' +
          '<ListItems><ListItem Id="b1" Title="T" Type="Beat"><Content><Paragraph><Text>Beat words.</Text>' +
          '<Picture Id="p1">Q0NDQ0REREQ=</Picture></Paragraph></Content></ListItem></ListItems>',
      ),
    );
    expect(result.text).toContain('kept words');
    expect(result.text).toContain('[[fdx: Beat, T: Beat words.]]');
    expect(result.text).not.toContain('QUFB');
    expect(result.text).not.toContain('Q0ND');
  });

  it('keeps a note whose text ends in ] or holds runs of ], as a note', () => {
    const result = fromFdx(
      fdx(P('Note', 'ends with ]') + P('Note', 'x ]]] y') + P('Note', '] ]') + P('Action', 'y]')),
    );
    expect(result.text).toBe(
      lines('[[ends with ] ]]', '', '[[x ] ] ] y]]', '', '[[] ] ]]', '', 'y]'),
    );
    expect(kinds(parse(result.text))).toEqual(['note', 'note', 'note', 'action']);
    const label = fromFdx(fdx(P('Kind]', 'z')));
    expect(label.text).toBe('z [[fdx: Kind] ]]\n');
    expect(parse(label.text).regions.filter((r) => r.kind === 'note')).toHaveLength(1);
  });

  it('keeps a second Alt with the same id and other text, as a note', () => {
    const result = fromFdx(
      fdx(
        '<Paragraph Type="Action"><Alts Current="0"><AltId>a1</AltId></Alts><Text>Now.</Text></Paragraph>',
        '<AltCollection>' +
          '<Alt Id="a1"><Paragraph><Text>First take.</Text></Paragraph></Alt>' +
          '<Alt Id="a1"><Paragraph><Text>Second take.</Text></Paragraph></Alt>' +
          '<Alt Id="a1"><Paragraph><Text>First take.</Text></Paragraph></Alt>' +
          '</AltCollection>',
      ),
    );
    expect(result.text).toBe(
      lines('Now.', '', '[[fdx: Alternate: First take.]]', '', '[[fdx: Alternate: Second take.]]'),
    );
    expect(result.mapped).toEqual([{ type: 'Alternate', count: 2 }]);
  });

  it('keeps a speech whole when a Summary or a Note paragraph sits inside it', () => {
    const result = fromFdx(
      fdx(
        P('Character', 'BOB') +
          P('Summary', 'He lies.') +
          P('Dialogue', 'Hi.') +
          P('Note', 'too short') +
          P('Dialogue', 'Bye.'),
      ),
    );
    expect(result.text).toBe(lines('BOB', 'Hi.', 'Bye.', '', '= He lies.', '', '[[too short]]'));
    expect(kinds(parse(result.text))).toEqual(['character', 'dialogue', 'synopsis', 'note']);
    expect(result.mapped).toEqual([]);
  });

  it('keeps what a note, an alternate, a beat, or an arc beat holds beside its paragraphs', () => {
    const extra = (n: number) => `<Extra>more words ${n}</Extra>`;
    const result = fromFdx(
      fdx(
        '<Paragraph Type="Scene Heading"><SceneProperties Title=""><SceneArcBeats>' +
          `<CharacterArcBeat Name="ODA"><Paragraph><Text>Arc.</Text></Paragraph>${extra(1)}</CharacterArcBeat>` +
          '</SceneArcBeats></SceneProperties><Text>INT. HUT - DAY</Text></Paragraph>',
        `<AltCollection><Alt Id="a9"><Paragraph><Text>Alt.</Text></Paragraph>${extra(2)}</Alt></AltCollection>` +
          `<ListItems><ListItem Id="b1" Title="T" Type="Beat"><Content><Paragraph><Text>Beat.</Text></Paragraph>${extra(3)}</Content></ListItem></ListItems>` +
          `<ScriptNotes><ScriptNote Id="n1"><Paragraph><Text>Note.</Text></Paragraph>${extra(4)}</ScriptNote></ScriptNotes>`,
      ),
    );
    for (const n of [1, 2, 3, 4]) expect(result.text).toContain(`more words ${n}`);
  });
});

describe('fromFdx: stored text is read once, however often it is compared', () => {
  // In each, the stored text and the number of things compared with it grow together, so reading
  // the stored text again for each one would grow about 16 times from n to 4n.
  it(
    'compares duplicate Alt ids with the first in linear time',
    () => {
      const make = (n: number) =>
        fdx(
          P('Action', 'x'),
          `<AltCollection><Alt Id="a"><Paragraph><Text>${'word '.repeat(n)}</Text></Paragraph></Alt>` +
            `${'<Alt Id="a"/><Alt Id="a"><Text>w</Text></Alt>'.repeat(n / 10)}</AltCollection>`,
        );
      const { growth, large } = scaling(make, fromFdx, 20_000);
      expect(growth).toBeLessThan(MAX_GROWTH);
      expect(large).toBeLessThan(HANG_MS);
    },
    SCALING_TIMEOUT,
  );

  it(
    "compares a scene's styled titles with its Title in linear time",
    () => {
      const make = (n: number) =>
        fdx(
          `<Paragraph Type="Scene Heading"><SceneProperties Title="${'word '.repeat(n)}">` +
            `${'<AttributedTitle><Text>x</Text></AttributedTitle>'.repeat(n / 10)}</SceneProperties><Text>INT. A - DAY</Text></Paragraph>`,
        );
      const { growth, large } = scaling(make, fromFdx, 20_000);
      expect(growth).toBeLessThan(MAX_GROWTH);
      expect(large).toBeLessThan(HANG_MS);
    },
    SCALING_TIMEOUT,
  );

  it('reads runs directly under an element as one line, and paragraphs as lines', () => {
    const result = fromFdx(
      fdx(
        '<Paragraph Type="Scene Heading"><SceneProperties Title="Hello there">' +
          '<AttributedTitle>\n  <Text>Hel</Text>\n  <Text Style="Bold">lo</Text><Text> there</Text>\n</AttributedTitle>' +
          '</SceneProperties><Text>INT. A - DAY</Text></Paragraph>',
        '<ScriptNotes><ScriptNote Id="n1"><Text>Two </Text><Text>runs.</Text>' +
          '<Paragraph><Text>A paragraph.</Text></Paragraph><Text>After</Text><Text>wards.</Text></ScriptNote></ScriptNotes>',
      ),
    );
    expect(result.ignored).toContain('AttributedTitle');
    expect(result.mapped).toEqual([{ type: 'Script note', count: 1 }]);
    expect(result.text).toContain('[[fdx: Script note: Two runs. A paragraph. Afterwards.]]');
  });
});

describe('fromFdx: title pages and alternates, the edges', () => {
  const tp = (paragraphs: string) =>
    fdx(P('Action', 'x'), `<TitlePage><Content>${paragraphs}</Content></TitlePage>`);
  const para = (align: string, text: string, key = '') =>
    `<Paragraph Alignment="${align}"${key}><Text>${text}</Text></Paragraph>`;

  it(
    'reads a title page of many credits and notes in linear time',
    () => {
      // Each credit and author adds two fields; a search of them all for the Notes or the Title
      // field, at each later paragraph, would grow about 16 times from n to 4n.
      const make = (n: number) =>
        tp(
          para('Center', 'TITLE') +
            `${para('Center', 'by')}${para('Center', 'A. Writer')}`.repeat(n) +
            para('Left', 'contact') +
            `${para('Left', 'line')}<Paragraph/>${para('Center', 'centered after a gap')}`.repeat(
              n,
            ),
        );
      const { growth, large } = scaling(make, fromFdx, 2_000);
      expect(growth).toBeLessThan(MAX_GROWTH);
      expect(large).toBeLessThan(HANG_MS);
    },
    SCALING_TIMEOUT,
  );

  it('imports a title-page paragraph of a million lines without overflowing the stack', () => {
    const many = 'x\n'.repeat(1_000_000);
    for (const xml of [
      tp(para('Center', 'TITLE') + para('Center', many)), // joins the Title
      tp(para('Center', 'by') + para('Center', 'A') + para('Center', many)), // joins the Author
      tp(para('Left', 'a') + para('Left', many)), // joins the Notes
      tp(para('Left', 'a', ' DrafterKey="Contact"') + para('Left', many)), // continues a keyed field
    ]) {
      let error: unknown;
      try {
        fromFdx(xml);
      } catch (e) {
        error = e;
      }
      if (error !== undefined) expect(error).toBeInstanceOf(FdxError);
    }
  }, 60_000);

  it('keeps a later Alt when the first with its id is empty', () => {
    const result = fromFdx(
      fdx(
        '<Paragraph Type="Action"><Alts Current="0"><AltId>a</AltId></Alts><Text>Now.</Text></Paragraph>',
        '<AltCollection><Alt Id="a"/><Alt Id="a"><Paragraph><Text>Second text.</Text></Paragraph></Alt></AltCollection>',
      ),
    );
    expect(result.text).toBe('Now.\n\n[[fdx: Alternate: Second text.]]\n');
  });

  it('keeps an Alt in a second collection that reuses an id with other text', () => {
    const coll = (text: string) =>
      `<AltCollection><Alt Id="a"><Paragraph><Text>${text}</Text></Paragraph></Alt></AltCollection>`;
    const result = fromFdx(
      fdx(
        '<Paragraph Type="Action"><Alts Current="0"><AltId>a</AltId></Alts><Text>Now.</Text></Paragraph>',
        coll('First text.') + coll('Other text.') + coll('First text.'),
      ),
    );
    expect(result.text).toBe(
      'Now.\n\n[[fdx: Alternate: First text.]]\n\n[[fdx: Alternate: Other text.]]\n',
    );
    expect(result.mapped).toEqual([{ type: 'Alternate', count: 2 }]);
  });
});

describe('fromFdx: nothing loose is dropped', () => {
  it('brings in an element other than Alt inside an AltCollection, and inside Alts', () => {
    const result = fromFdx(
      fdx(
        '<Paragraph Type="Action"><Alts Current="0"><AltId>a</AltId><Memo>alts memo</Memo></Alts><Text>Now.</Text></Paragraph>',
        '<AltCollection><Alt Id="a"><Paragraph><Text>Then.</Text></Paragraph></Alt><Memo>collection memo</Memo></AltCollection>',
      ),
    );
    expect(result.text).toContain('alts memo [[fdx: Memo]]');
    expect(result.text).toContain('collection memo [[fdx: Memo]]');
    expect(result.mapped).toEqual([
      { type: 'Alternate', count: 1 },
      { type: 'Memo', count: 2 },
    ]);
  });

  it('brings in text written loose in a container as a note in its place', () => {
    const result = fromFdx(
      '<?xml version="1.0"?><FinalDraft DocumentType="Script" Template="No" Version="6">\n  root words\n' +
        `<Content>\n  ${P('Action', 'First.')} content words ${P('Action', 'Second.')}\n</Content>` +
        '<TitlePage> title page words <Content> title content words ' +
        '<Paragraph Alignment="Center"><Text>T</Text></Paragraph></Content></TitlePage>' +
        `<AltCollection> alt collection words </AltCollection>` +
        `<ScriptNotes> script notes words </ScriptNotes>` +
        `<ListItems> list items words </ListItems>` +
        '</FinalDraft>',
    );
    for (const [words, where] of [
      ['root words', 'FinalDraft'],
      ['content words', 'Content'],
      ['title page words', 'TitlePage'],
      ['title content words', 'Content'],
      ['alt collection words', 'AltCollection'],
      ['script notes words', 'ScriptNotes'],
      ['list items words', 'ListItems'],
    ]) {
      expect(result.text).toContain(`${words} [[fdx: ${where} text]]`);
    }
    // In place: the loose text in the script's Content sits between its paragraphs.
    expect(result.text).toContain('First.\n\ncontent words [[fdx: Content text]]\n\nSecond.');
    const arc = fromFdx(
      fdx(
        '<Paragraph Type="Scene Heading"><SceneProperties Title=""><SceneArcBeats> arc words ' +
          '<CharacterArcBeat Name="ODA"><Paragraph><Text>Beat.</Text></Paragraph></CharacterArcBeat>' +
          '</SceneArcBeats></SceneProperties><Text>INT. A - DAY</Text></Paragraph>' +
          '<Paragraph Type="Action"><Alts> alts words <AltId>b</AltId></Alts><Text>x</Text></Paragraph>',
      ),
    );
    expect(arc.text).toContain('arc words [[fdx: SceneArcBeats text]]');
    expect(arc.text).toContain('alts words [[fdx: Alts text]]');
  });
});
