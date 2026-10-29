import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from '@drafter/fountain';
import { builtins } from '@drafter/templates';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { readXml, toFdx, type XmlElement, type XmlNode } from '../src';

const screenplay = builtins['us-screenplay'];
const play = builtins['stage-play-standard'];
if (!screenplay || !play) throw new Error('missing built-in templates');

const el = (name: string, attrs: Record<string, string> = {}, ...children: XmlNode[]) => ({
  name,
  attrs,
  children,
});
const P = (type: string, attrs: Record<string, string>, ...children: XmlNode[]) =>
  el('Paragraph', { Type: type, ...attrs }, ...children);
const T = (text: string, style?: string) => el('Text', style ? { Style: style } : {}, text);

// The writer indents elements that hold only elements; trees are compared without that whitespace.
function strip(node: XmlElement): XmlElement {
  const hasText = node.children.some((c) => typeof c === 'string' && c.trim() !== '');
  return {
    name: node.name,
    attrs: node.attrs,
    children: node.children
      .filter((c) => hasText || typeof c !== 'string')
      .map((c) => (typeof c === 'string' ? c : strip(c))),
  };
}

/** The exported tree's Content paragraphs (and the whole document when `whole`). */
const exported = (source: string, template = screenplay) =>
  strip(readXml(toFdx(parse(source), template)));
const content = (source: string, template = screenplay) =>
  (exported(source, template).children[0] as XmlElement).children;

describe('toFdx', () => {
  it('writes the root and an empty Content for an empty script', () => {
    expect(exported('')).toEqual(
      el('FinalDraft', { DocumentType: 'Script', Template: 'No', Version: '5' }, el('Content')),
    );
  });

  it('maps a scene heading, with a locked number and its synopses', () => {
    expect(content('INT. HALL - DAY #12A#\n\n= First.\n\nAction.\n\n= Second.\n')).toEqual([
      P(
        'Scene Heading',
        { Number: '12A' },
        el('SceneProperties', { Title: '', Summary: 'First.\nSecond.' }),
        T('INT. HALL - DAY'),
      ),
      P('Action', {}, T('Action.')),
    ]);
    expect(content('INT. HALL - DAY\n')).toEqual([P('Scene Heading', {}, T('INT. HALL - DAY'))]);
    expect(content('.SNOWY FIELD\n')).toEqual([P('Scene Heading', {}, T('SNOWY FIELD'))]);
  });

  it("maps a stage play's scene to a Scene Heading and its act to a section", () => {
    expect(content('# Act One\n\n## Scene 1\n\n= A kitchen.\n\nA table.\n', play)).toEqual([
      P('General', { DrafterSection: '1' }, T('Act One')),
      P(
        'Scene Heading',
        { DrafterSection: '2' },
        el('SceneProperties', { Title: '', Summary: 'A kitchen.' }),
        T('Scene 1'),
      ),
      P('Action', {}, T('A table.')),
    ]);
  });

  it('maps action, centered text, and a transition', () => {
    expect(content('He waits.\n\n> THE END <\n\nCUT TO:\n')).toEqual([
      P('Action', {}, T('He waits.')),
      P('Action', { Alignment: 'Center' }, T('THE END')),
      P('Transition', {}, T('CUT TO:')),
    ]);
  });

  it('maps a speech, keeping the extension in the character and the parentheses', () => {
    expect(content('MARGARET (V.O.)\n(quietly)\nYou said\nyou would.\n')).toEqual([
      P('Character', {}, T('MARGARET (V.O.)')),
      P('Parenthetical', {}, T('(quietly)')),
      P('Dialogue', {}, T('You said\nyou would.')),
    ]);
  });

  it('maps a lyric to italic Dialogue marked for the round trip', () => {
    expect(content('BOB\n~la *la*\n')).toEqual([
      P('Character', {}, T('BOB')),
      P('Dialogue', { DrafterLyric: 'Yes' }, T('la la', 'Italic')),
    ]);
    expect(content('BOB\n~**la**\n')[1]).toEqual(
      P('Dialogue', { DrafterLyric: 'Yes' }, T('la', 'Bold+Italic')),
    );
  });

  it('puts a page break on the next paragraph, and drops one with nothing after it', () => {
    expect(content('One.\n\n===\n\nTwo.\n\n===\n\n===\n\nINT. A - DAY\n')).toEqual([
      P('Action', {}, T('One.')),
      P('Action', { StartsNewPage: 'Yes' }, T('Two.')),
      P('Scene Heading', { StartsNewPage: 'Yes' }, T('INT. A - DAY')),
    ]);
    expect(content('One.\n\n===\n')).toEqual([P('Action', {}, T('One.'))]);
  });

  it('maps a section to General with its depth', () => {
    expect(content('# Act\n\n## Sequence\n\n###### Deep\n')).toEqual([
      P('General', { DrafterSection: '1' }, T('Act')),
      P('General', { DrafterSection: '2' }, T('Sequence')),
      P('General', { DrafterSection: '6' }, T('Deep')),
    ]);
  });

  it('caps a section deeper than six levels at six, the most import takes', () => {
    expect(content('####### Deeper\n')).toEqual([
      P('General', { DrafterSection: '6' }, T('Deeper')),
    ]);
  });

  it('carries a note on its own line, and keeps a note inside a line in the text', () => {
    expect(content('[[remember this]]\n\nHe *runs* [[a note]] fast.\n')).toEqual([
      P('General', { DrafterNote: 'Yes' }, T('remember this')),
      P('Action', {}, T('He '), T('runs', 'Italic'), T(' [[a note]] fast.')),
    ]);
  });

  it('keeps a note in its place in a line that holds an escape', () => {
    expect(content('He \\*x\\* [[n]] goes.\n')).toEqual([P('Action', {}, T('He *x* [[n]] goes.'))]);
  });

  it('keeps a note that runs over two lines of an action', () => {
    expect(content('One [[a\nb]] two.\n')).toEqual([P('Action', {}, T('One[[a\nb]] two.'))]);
  });

  it('omits a boneyard, and the metadata block', () => {
    const source =
      'He waits. /* cut */ Then goes.\n\n/* gone */\n\nEnd.\n\n/* drafter {"v":1} */\n';
    expect(content(source)).toEqual([
      P('Action', {}, T('He waits.  Then goes.')),
      P('Action', {}, T('End.')),
    ]);
  });

  it('puts the two speeches of dual dialogue in one paragraph', () => {
    expect(content('BOB\nHi.\n\nAMY ^\nHello.\n\nLater.\n')).toEqual([
      el(
        'Paragraph',
        {},
        el(
          'DualDialogue',
          {},
          P('Character', {}, T('BOB')),
          P('Dialogue', {}, T('Hi.')),
          P('Character', {}, T('AMY')),
          P('Dialogue', {}, T('Hello.')),
        ),
      ),
      P('Action', {}, T('Later.')),
    ]);
  });

  it('writes one Text per style change', () => {
    expect(content('A **bold** and *it* and _under_ and ***both***.\n')).toEqual([
      P(
        'Action',
        {},
        T('A '),
        T('bold', 'Bold'),
        T(' and '),
        T('it', 'Italic'),
        T(' and '),
        T('under', 'Underline'),
        T(' and '),
        T('both', 'Bold+Italic'),
        T('.'),
      ),
    ]);
  });

  it('writes the title page, centering some keys and keeping each key', () => {
    const doc = exported(
      'Title: *The* Call\nCredit: by\nContact:\n    A. Writer\n    a@b.c\nDraft date: Now\n\nHi.\n',
    );
    expect(doc.children[1]).toEqual(
      el(
        'TitlePage',
        {},
        el(
          'Content',
          {},
          P('Action', { Alignment: 'Center', DrafterKey: 'Title' }, T('The', 'Italic'), T(' Call')),
          P('Action', { Alignment: 'Center', DrafterKey: 'Credit' }, T('by')),
          P('Action', { Alignment: 'Left', DrafterKey: 'Contact' }, T('A. Writer')),
          P('Action', { Alignment: 'Left' }, T('a@b.c')),
          P('Action', { Alignment: 'Left', DrafterKey: 'Draft date' }, T('Now')),
        ),
      ),
    );
  });

  it('escapes markup in text and drops characters XML forbids', () => {
    expect(content('Fish & <chips> \u0001\n')).toEqual([P('Action', {}, T('Fish & <chips> '))]);
  });

  it('exports every sample script without throwing', () => {
    const dir = fileURLToPath(new URL('../../../samples/', import.meta.url));
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.fountain'))) {
      const source = readFileSync(`${dir}${name}`, 'utf8');
      const template = name.startsWith('stage') ? play : screenplay;
      const xml = toFdx(parse(source), template);
      const root = readXml(xml);
      expect(root.name).toBe('FinalDraft');
      expect(root.children.length).toBeGreaterThan(0);
    }
  });

  it('exports a synopsis no scene collects as a General paragraph, in document order', () => {
    const syn = (text: string) => P('General', { DrafterSynopsis: 'Yes' }, T(text));
    expect(content('= Before any scene.\n\nINT. A - DAY\n')).toEqual([
      syn('Before any scene.'),
      P('Scene Heading', {}, T('INT. A - DAY')),
    ]);
    expect(content('# Act\n\n= About the act.\n\nINT. A - DAY\n\n= Of the scene.\n')).toEqual([
      P('General', { DrafterSection: '1' }, T('Act')),
      syn('About the act.'),
      P(
        'Scene Heading',
        {},
        el('SceneProperties', { Title: '', Summary: 'Of the scene.' }),
        T('INT. A - DAY'),
      ),
    ]);
    expect(content('# Act\n\n= Act synopsis.\n\n## Scene 1\n\n= Scene synopsis.\n', play)).toEqual([
      P('General', { DrafterSection: '1' }, T('Act')),
      syn('Act synopsis.'),
      P(
        'Scene Heading',
        { DrafterSection: '2' },
        el('SceneProperties', { Title: '', Summary: 'Scene synopsis.' }),
        T('Scene 1'),
      ),
    ]);
  });

  it('puts a pending page break on a synopsis nothing collects', () => {
    expect(content('One.\n\n===\n\n= Loose.\n')).toEqual([
      P('Action', {}, T('One.')),
      P('General', { DrafterSynopsis: 'Yes', StartsNewPage: 'Yes' }, T('Loose.')),
    ]);
  });

  it('puts a page break on the second speaker of a dual pair', () => {
    expect(content('BOB\nHi.\n\n===\n\nAMY ^\nHello.\n')).toEqual([
      el(
        'Paragraph',
        {},
        el(
          'DualDialogue',
          {},
          P('Character', {}, T('BOB')),
          P('Dialogue', {}, T('Hi.')),
          P('Character', { StartsNewPage: 'Yes' }, T('AMY')),
          P('Dialogue', {}, T('Hello.')),
        ),
      ),
    ]);
  });

  it('keeps a note that spans lines inside dialogue', () => {
    expect(content('BOB\nHi [[a\nb]] there.\n')).toEqual([
      P('Character', {}, T('BOB')),
      P('Dialogue', {}, T('Hi[[a\nb]]there.')),
    ]);
  });

  it('never throws, and always writes a document the reader accepts', () => {
    const piece = fc.constantFrom(
      'INT. A - DAY',
      'BOB',
      '(v.o.)',
      '*x*',
      '**',
      '_',
      '[[',
      ']]',
      '/*',
      '*/',
      '===',
      '#',
      '##',
      '= syn',
      '~',
      '>',
      '<',
      '^',
      '@',
      '.',
      '!',
      '&',
      '\u0001',
      '\ud800',
      'Title: T',
      '  ',
      '\n',
      '\n\n',
      'hello',
    );
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 24 }), fc.boolean(), (parts, isPlay) => {
        const xml = toFdx(parse(parts.join('')), isPlay ? play : screenplay);
        expect(readXml(xml).name).toBe('FinalDraft');
      }),
      { numRuns: 300 },
    );
  });
});

describe('toFdx on a line of very many styled runs', () => {
  it('exports it without overflowing the stack', () => {
    const doc = parse(`${'*a* b '.repeat(250_000)}\n`);
    const xml = toFdx(doc, builtins['us-screenplay']);
    expect(xml).toContain('<Text Style="Italic">a</Text>');
  });
});
