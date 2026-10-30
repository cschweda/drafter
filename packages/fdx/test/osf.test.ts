import { type Doc, parse, print } from '@drafter/fountain';
import { describe, expect, it } from 'vitest';
import { fromOsf, OSF_IGNORED, OsfError, osfToFdxTree, readXml, XmlError } from '../src';
import { BUILTIN_STYLES, CUSTOM_STYLES, ELEMENTS, osf, para } from './osf-fixtures';

const kinds = (doc: Doc) => doc.blocks.map((b) => b.kind);

describe('fromOsf: styles', () => {
  it('maps every base style of the fixture to its Fountain kind', () => {
    const result = fromOsf(ELEMENTS);
    expect(result.text).toBe(
      [
        'EXT. SALT MARSH - DAWN #7#',
        '',
        'Herons stand in the shallows.',
        '',
        '= Fog lifts off the reeds.',
        '',
        'The tide **turns**. A *slow* gurgle, then _quiet_.',
        '',
        'WREN',
        '(whispering)',
        'Don’t move. Not yet.',
        '',
        'SMASH CUT TO:',
        '',
        '===',
        '',
        'INT. BOATHOUSE - DAY',
        '',
        '> Low tide <',
        '',
        'WREN',
        'Now.',
        '',
        'ABEL ^',
        'Now!',
        '',
        '.CLOSE ON THE OARS',
        '',
      ].join('\n'),
    );
    expect(result.mapped).toEqual([]);
    expect(result.title).toBeNull();
    const doc = parse(result.text);
    expect(kinds(doc)).toEqual([
      'scene_heading',
      'action',
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
    ]);
  });

  it('resolves a named style through its base style', () => {
    const result = fromOsf(
      osf(para('Insert', 'A note slides under the door.') + para('Lower Third', 'Two days on'), {
        styles: CUSTOM_STYLES,
      }),
    );
    expect(result.text).toBe('A note slides under the door.\n\nTwo days on\n');
    expect(result.mapped).toEqual([]);
    expect(kinds(parse(result.text))).toEqual(['action', 'action']);
  });

  it('takes alignment, capitals, and emphasis from the style chain, the paragraph first', () => {
    const result = fromOsf(
      osf(
        para('Banner', 'Part one') +
          para('Banner', [['Part two', 'bold="0" underline="0"']], '', 'align="left"'),
        { styles: CUSTOM_STYLES },
      ),
    );
    expect(result.text).toBe('> _**Part one**_ <\n\nPart two\n');
  });

  it('follows a base-style chain at most 8 deep and stops at a cycle', () => {
    // S0 → S1 → … → S{n-1} → Action: n links followed from the paragraph's style.
    const chain = (n: number) =>
      Array.from(
        { length: n },
        (_, k) => `<style name="S${k}" basestyle="${k === n - 1 ? 'Action' : `S${k + 1}`}"/>`,
      ).join('');
    const eight = fromOsf(osf(para('S0', 'Gulls.'), { styles: BUILTIN_STYLES + chain(8) }));
    expect(eight.text).toBe('Gulls.\n');
    expect(eight.mapped).toEqual([]);
    const nine = fromOsf(osf(para('S0', 'Gulls.'), { styles: BUILTIN_STYLES + chain(9) }));
    expect(nine.text).toBe('Gulls. [[osf: S0]]\n');
    expect(nine.mapped).toEqual([{ type: 'S0', count: 1 }]);

    const cycle = fromOsf(
      osf(para('Loop A', 'Round and round.'), {
        styles:
          '<style name="Loop A" basestyle="Loop B"/><style name="Loop B" basestyle="Loop A"/>',
      }),
    );
    expect(cycle.text).toBe('Round and round. [[osf: Loop A]]\n');
    const missing = fromOsf(osf(para('Nowhere', 'Lost.'), { styles: '' }));
    expect(missing.text).toBe('Lost. [[osf: Nowhere]]\n');
  });

  it('brings an unknown style in as action with an [[osf: Name]] note, counted', () => {
    const result = fromOsf(
      osf(
        para('Cast List', 'WREN, a ferrier') +
          para('Cast List', 'ABEL, her brother') +
          para('Act Break', 'End of act one') +
          para('Normal Text', 'plain'),
        { styles: CUSTOM_STYLES },
      ),
    );
    expect(result.text).toBe(
      [
        'WREN, a ferrier [[osf: Cast List]]',
        '',
        'ABEL, her brother [[osf: Cast List]]',
        '',
        'END OF ACT ONE [[osf: Act Break]]',
        '',
        'plain [[osf: Normal Text]]',
        '',
      ].join('\n'),
    );
    expect(result.mapped).toEqual([
      { type: 'Cast List', count: 2 },
      { type: 'Act Break', count: 1 },
      { type: 'Normal Text', count: 1 },
    ]);
    expect(kinds(parse(result.text))).toEqual(['action', 'action', 'action', 'action']);
  });

  it('keeps a style named as one of Final Draft’s own kinds a name, not that kind', () => {
    const result = fromOsf(
      osf(para('Summary', 'Hidden?') + para('Note', 'Not a note') + para('Outline 1', 'Act'), {
        styles: '',
      }),
    );
    expect(result.text).toBe(
      'Hidden? [[osf: Summary]]\n\nNot a note [[osf: Note]]\n\nAct [[osf: Outline 1]]\n',
    );
  });

  it('writes a style name that can’t open or close a note or a boneyard, at most 255 characters', () => {
    const name = 'a]]b[[c/*d*/e';
    const result = fromOsf(osf(para(name, 'Text.'), { styles: '' }));
    expect(result.text).toBe('Text. [[osf: a] ]b[ [c/ *d* /e]]\n');
    const long = fromOsf(osf(para('x'.repeat(400), 'Text.'), { styles: '' }));
    expect(long.text).toBe(`Text. [[osf: ${'x'.repeat(254)}…]]\n`);
    expect(long.mapped).toEqual([{ type: `${'x'.repeat(254)}…`, count: 1 }]);
  });

  it('brings an element holding text in as a note, and lists settings once in ignored', () => {
    const result = fromOsf(
      osf(
        `${para('Action', 'One.')}
    <scratch>Remember the oars.</scratch>
    <bookmarks/>
    ${para('Action', 'Two.')}`,
        { after: '<spelling language="en_US"><ignored/></spelling><lists><characters/></lists>' },
      ),
    );
    expect(result.text).toBe('One.\n\nRemember the oars. [[osf: scratch]]\n\nTwo.\n');
    expect(result.mapped).toEqual([{ type: 'scratch', count: 1 }]);
    expect(result.ignored).toEqual([
      'info',
      'settings',
      'styles',
      'bookmarks',
      'spelling',
      'lists',
    ]);
    expect(result.ignoredCount).toBe(6);
    expect(OSF_IGNORED.has('settings')).toBe(true);
  });
});

describe('fromOsf: text and formatting', () => {
  it('keeps bold, italic, and underline as Fountain emphasis', () => {
    const result = fromOsf(
      osf(
        para('Action', [
          ['all three', 'bold="1" italic="1" underline="1"'],
          [' and ', ''],
          ['both', 'bold="1" italic="1"'],
          [' and ', ''],
          ['none', 'bold="0" italic="0"'],
        ]),
      ),
    );
    expect(result.text).toBe('_***all three***_ and ***both*** and none\n');
  });

  it('lists strikeout and fonts in ignored', () => {
    const result = fromOsf(
      osf(
        para('Action', [
          ['Struck', 'strikethrough="1"'],
          [' big', 'font="Drafter Serif" size="14"'],
          [' lit', 'bgcolor="#C0FFEE"'],
          [' again', 'strikethrough="1"'],
        ]),
      ),
    );
    expect(result.text).toBe('Struck big lit again\n');
    expect(result.ignored).toEqual([
      'info',
      'settings',
      'styles',
      'text@strikethrough',
      'text@font',
      'text@size',
      'text@bgcolor',
    ]);
  });

  it('forces a paragraph whose plain text would read as another kind', () => {
    const text = fromOsf(
      osf(
        para('Action', 'A LOUD BANG') +
          para('Action', 'THE DOOR\nIt opens.') +
          para('Action', 'INT. HOUSE - DAY') +
          para('Action', 'GO TO:') +
          para('Character', 'Wren', '', 'allcaps="0"') +
          para('Dialogue', 'Hi.') +
          para('Scene Heading', 'harbour', '', 'allcaps="0"') +
          para('Transition', 'LATER') +
          para('Action', '!Bang'),
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
        '@Wren',
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
});

describe('fromOsf: structure', () => {
  it('writes a page break before its paragraph', () => {
    const text = fromOsf(
      osf(para('Action', 'Before.') + para('Action', 'After.', '', 'pagebreakbefore="1"')),
    ).text;
    expect(text).toBe('Before.\n\n===\n\nAfter.\n');
  });

  it('keeps a scene number Fountain can hold, and notes one it can’t', () => {
    const result = fromOsf(
      osf(
        para('Scene Heading', 'Int. shed - night', 'number="12A"') +
          para('Scene Heading', 'Ext. dock - night', 'number="12 B"') +
          // The format's earlier versions name it `scene_number`.
          para('Scene Heading', 'Ext. pier - night', 'scene_number="13"'),
      ),
    );
    expect(result.text).toBe(
      'INT. SHED - NIGHT #12A#\n\nEXT. DOCK - NIGHT [[osf: Number 12 B]]\n\nEXT. PIER - NIGHT #13#\n',
    );
    expect(result.mapped).toEqual([{ type: 'Number', count: 1 }]);
  });

  it('keeps dual dialogue with a ^', () => {
    const doc = parse(
      fromOsf(
        osf(
          para('Character', 'Wren', '', 'dualdialogue="1"') +
            para('Parenthetical', 'shouting') +
            para('Dialogue', 'Left!') +
            para('Character', 'Abel') +
            para('Dialogue', 'Right!') +
            para('Character', 'Wren') +
            para('Dialogue', 'Fine.'),
        ),
      ).text,
    );
    expect(print(doc)).toBe('WREN\n(shouting)\nLeft!\n\nABEL ^\nRight!\n\nWREN\nFine.\n');
    const duals = doc.blocks.flatMap((b) => (b.kind === 'character' ? [b.sem.dual] : []));
    expect(duals).toEqual([false, true, false]);
  });

  it('keeps a scene summary as = lines', () => {
    const text = fromOsf(
      osf(
        para('Scene Heading', 'Ext. marsh - day', 'synopsis="Wren finds the boat.&#10;It leaks."') +
          para('Action', 'Mud.'),
      ),
    ).text;
    expect(text).toBe('EXT. MARSH - DAY\n\n= Wren finds the boat.\n= It leaks.\n\nMud.\n');
  });

  it('keeps a paragraph’s note as a note after it, and after a speech it sits in', () => {
    const text = fromOsf(
      osf(
        para('Action', 'Rain.', 'note="Too wet?"') +
          para('Character', 'Wren') +
          para('Dialogue', 'Cold.', 'note="Shorter]]"') +
          para('Dialogue', 'So cold.') +
          para('Action', 'Thunder.'),
      ),
    ).text;
    expect(text).toBe(
      'Rain.\n\n[[Too wet?]]\n\nWREN\nCold.\nSo cold.\n\n[[Shorter] ] ]]\n\nThunder.\n',
    );
    expect(kinds(parse(text))).toEqual([
      'action',
      'note',
      'character',
      'dialogue',
      'note',
      'action',
    ]);
  });

  it('reads the title page by its order', () => {
    const blank = '<para><style basestyle="Normal Text"/><text></text></para>';
    const centered = (text: string, attrs = '') =>
      `<para${attrs}><style basestyle="Normal Text" align="center"/><text>${text}</text></para>`;
    const left = (text: string, attrs = '') =>
      `<para${attrs}><style basestyle="Normal Text"/><text>${text}</text></para>`;
    const result = fromOsf(
      osf(para('Action', 'Start.'), {
        titlepage:
          blank +
          blank +
          centered('The Ferry', ' bookmark="Title"') +
          blank +
          centered('Written by') +
          blank +
          centered('Ilse Moreau', ' bookmark="Author"') +
          blank +
          left('Draft 3', ' bookmark="Draft"') +
          left('ilse@example.com', ' bookmark="Contact"'),
      }),
    );
    expect(result.title).toBe('The Ferry');
    expect(result.text).toBe(
      [
        'Title: The Ferry',
        'Credit: Written by',
        'Author: Ilse Moreau',
        'Notes: Draft 3',
        '    ilse@example.com',
        '',
        'Start.',
        '',
      ].join('\n'),
    );
    expect(result.ignored).toContain('para@bookmark');
  });
});

describe('fromOsf: safety and refusals', () => {
  it('never reads a Drafter mark from an OSF attribute', () => {
    const result = fromOsf(
      osf(
        `\n    <para DrafterSection="2" DrafterNote="Yes" Type="Note" Number="9">` +
          `<style basestyle="Action" DrafterLyric="Yes" Type="General"/>` +
          `<text Style="HiddenText" DrafterKey="Title">Plain words.</text></para>`,
      ),
    );
    expect(result.text).toBe('Plain words.\n');
    expect(result.mapped).toEqual([]);
    expect(result.ignored).toEqual([
      'info',
      'settings',
      'styles',
      'para@DrafterSection',
      'para@DrafterNote',
      'para@Type',
      'para@Number',
      'style@DrafterLyric',
      'style@Type',
      'text@Style',
      'text@DrafterKey',
    ]);
    // The tree holds only the attributes the adapter writes.
    const { tree } = osfToFdxTree(readXml(osf(para('Action', 'x', 'DrafterNote="Yes"'))));
    const paragraph = tree.children.find((c) => typeof c !== 'string' && c.name === 'Content');
    expect(JSON.stringify(paragraph)).not.toContain('Drafter');
  });

  it('refuses XML the reader refuses, wrapping its error', () => {
    let caught: unknown;
    try {
      fromOsf('<document><paragraphs></document>');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OsfError);
    expect((caught as OsfError).message).toMatch(
      /^This isn’t an Open Screenplay Format document: /,
    );
    expect((caught as OsfError).cause).toBeInstanceOf(XmlError);
    expect(() => fromOsf('<!DOCTYPE x><document><paragraphs/></document>')).toThrow(OsfError);
    expect(() =>
      fromOsf('<document><paragraphs><para>\u0000</para></paragraphs></document>'),
    ).toThrow(OsfError);
    expect(() => fromOsf('')).toThrow(OsfError);
  });

  it('refuses XML that isn’t an OSF document', () => {
    expect(() => fromOsf('<FinalDraft><Content/></FinalDraft>')).toThrow(
      /^This isn’t an Open Screenplay Format document: /,
    );
    expect(() => fromOsf('<document><titlepage/></document>')).toThrow(OsfError);
    const error = (() => {
      try {
        fromOsf('<html/>');
      } catch (e) {
        return e as OsfError;
      }
    })();
    expect(error?.reason).toBe('it has no document root holding paragraphs.');
  });

  it('accepts an empty paragraphs element', () => {
    expect(fromOsf('<document><paragraphs/></document>')).toEqual({
      text: '',
      title: null,
      mapped: [],
      ignored: [],
      ignoredCount: 0,
    });
  });
});
