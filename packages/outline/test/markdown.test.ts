import { parse } from '@drafter/fountain';
import {
  type SceneNumbering,
  sceneNumbersFor,
  type TitlePageMode,
  titlePageFor,
} from '@drafter/layout';
import { describe, expect, test } from 'vitest';
import { type ScriptMarkdownOptions, sceneIndex, scriptMarkdown } from '../src';
import { screenplay, stagePlay } from './helpers';

// A hand-made screenplay and stage play, with original text.

const TITLE = `Title: _**Night Ferry**_
Credit: Written by
Author: R. Okafor
Source: From a story by the same
Notes: Not for the page
Draft date: May 2026
Contact:
    R. Okafor
    ferry@example.com

`;

const SCREENPLAY = `${TITLE}EXT. HARBOR - NIGHT

Fog over black water. A ferry horn.

INT. CABIN - CONTINUOUS #4B#

JUNO
(whispering)
Are we moving?

PELL
I can't tell.

INT. DECK - LATER

The rail is wet.
`;

const STAGE_PLAY = `Title: Low Tide

# Act One

## Scene 1

A dock. Gulls.

JUNO
Wait for me.

## Scene 2

The same dock, empty.

/* drafter
{"v":1,"template":"stage-play-standard"}
*/
`;

const options = (patch: Partial<ScriptMarkdownOptions> = {}): ScriptMarkdownOptions => ({
  sceneNumbers: 'none',
  notes: 'leave-out',
  ...patch,
});

/** The Markdown for `source`, its title page cut for `titlePage` as the worker cuts it. */
function md(
  source: string,
  patch: Partial<ScriptMarkdownOptions> = {},
  titlePage: TitlePageMode = 'full',
  template = source.includes('stage-play-standard') ? stagePlay : screenplay,
) {
  const parsed = parse(source);
  const doc = { ...parsed, titlePage: titlePageFor(parsed.titlePage, titlePage) };
  return scriptMarkdown(doc, sceneIndex(doc, template, null), template, options(patch));
}

describe('scriptMarkdown: the title page', () => {
  test("writes the title as #, then the other keys' values, with Full", () => {
    expect(md(SCREENPLAY).split('\n\n## ')[0]).toBe(
      [
        '# <u>**Night Ferry**</u>',
        'Written by',
        'R. Okafor',
        'From a story by the same',
        'May 2026',
        'R. Okafor\\\nferry@example.com',
      ].join('\n\n'),
    );
  });

  test('writes only the title and author lines with Title and author only', () => {
    expect(md(SCREENPLAY, {}, 'title-author').split('\n\n## ')[0]).toBe(
      '# <u>**Night Ferry**</u>\n\nWritten by\n\nR. Okafor\n\nFrom a story by the same',
    );
  });

  test('writes no title or keys with None, and keeps the heading levels', () => {
    const out = md(SCREENPLAY, {}, 'none');
    expect(out.startsWith('## EXT. HARBOR - NIGHT\n\nFog over')).toBe(true);
    expect(out).not.toContain('Night Ferry');
    expect(md(SCREENPLAY)).toContain('\n\n## EXT. HARBOR - NIGHT\n\n');
  });
});

describe('scriptMarkdown: structure', () => {
  test('writes sections one level below the title, and scenes one below the deepest section', () => {
    const source =
      '# Part\n\n## Chapter\n\nINT. A - DAY\n\nHi.\n\n# Part two\n\nINT. B - DAY\n\nYo.\n';
    expect(md(source)).toBe(
      '## Part\n\n### Chapter\n\n#### INT. A - DAY\n\nHi.\n\n## Part two\n\n#### INT. B - DAY\n\nYo.\n',
    );
  });

  test('writes scenes at ## when there are no sections', () => {
    expect(md('INT. A - DAY\n\nHi.\n')).toBe('## INT. A - DAY\n\nHi.\n');
  });

  test('caps levels at 6 and writes deeper headings in bold', () => {
    const source = '# One\n\n##### Five\n\n###### Six\n\nINT. A - DAY\n\nHi.\n';
    expect(md(source)).toBe('## One\n\n###### Five\n\n**Six**\n\n**INT. A - DAY**\n\nHi.\n');
  });

  test('numbers scenes for each option, as paginate does', () => {
    const doc = parse(SCREENPLAY);
    const headings = (numbering: SceneNumbering) =>
      md(SCREENPLAY, { sceneNumbers: numbering })
        .split('\n')
        .filter((line) => line.startsWith('## '));
    expect(headings('none')).toEqual([
      '## EXT. HARBOR - NIGHT',
      '## INT. CABIN - CONTINUOUS',
      '## INT. DECK - LATER',
    ]);
    expect(headings('written')).toEqual([
      '## EXT. HARBOR - NIGHT',
      '## 4B. INT. CABIN - CONTINUOUS',
      '## INT. DECK - LATER',
    ]);
    expect(headings('all')).toEqual([
      '## 1. EXT. HARBOR - NIGHT',
      '## 4B. INT. CABIN - CONTINUOUS',
      '## 3. INT. DECK - LATER',
    ]);
    expect([...sceneNumbersFor(doc, screenplay, 'all').values()]).toEqual(['1', '4B', '3']);
  });

  test("keeps a section's emphasis, as the script's other text keeps it", () => {
    expect(md('# The *big* day\n\n## **Loud** and _marked_ [x]\n\nINT. A - DAY\n\nHi.\n')).toBe(
      '## The *big* day\n\n### **Loud** and <u>marked</u> \\[x]\n\n#### INT. A - DAY\n\nHi.\n',
    );
    // Past level 6 the section is bold, its italics kept inside.
    expect(md('###### Six *now*\n\nINT. A - DAY\n')).toContain('**Six** ***now***');
  });

  test('writes a page break as a thematic break', () => {
    expect(md('INT. A - DAY\n\nOne.\n\n===\n\nTwo.\n')).toBe(
      '## INT. A - DAY\n\nOne.\n\n* * *\n\nTwo.\n',
    );
  });
});

describe('scriptMarkdown: elements', () => {
  test('writes a speech as a bold name, an italic parenthetical, and its dialogue', () => {
    expect(md(SCREENPLAY, {}, 'none')).toContain(
      "\n\n**JUNO**\\\n*(whispering)*\\\nAre we moving?\n\n**PELL**\\\nI can't tell.\n\n",
    );
  });

  test('marks the second speech of dual dialogue', () => {
    expect(md('JUNO\nNow!\n\nPELL ^\nNo, now!\n')).toBe(
      '**JUNO**\\\nNow!\n\n**PELL** *(at the same time)*\\\nNo, now!\n',
    );
    // A ^ with no speech free to pair with marks nothing.
    expect(md('The rail.\n\nPELL ^\nNo.\n')).toBe('The rail.\n\n**PELL**\\\nNo.\n');
  });

  test('writes a transition in capitals, centered text between its marks, and lyrics in italics', () => {
    expect(md('Fog.\n\nCUT TO:\n\n>THE END<\n\n~Row, row\n~gently down\n')).toBe(
      'Fog.\n\nCUT TO:\n\n\\>THE END<\n\n*Row, row*\\\n*gently down*\n',
    );
  });

  test('keeps bold, italic, and underline as **, *, and <u>', () => {
    expect(md('A *soft* and **loud** and _marked_ and ***both*** word.\n')).toBe(
      'A *soft* and **loud** and <u>marked</u> and ***both*** word.\n',
    );
    // Emphasis CommonMark could not read where it stands is left off; the text stays.
    expect(md('A word*.*x\n')).toBe('A word.x\n');
  });

  test("writes a stage play's acts and scenes as headings and its stage directions in italics", () => {
    expect(md(STAGE_PLAY)).toBe(
      '# Low Tide\n\n## Act One\n\n### Scene 1\n\n*A dock. Gulls.*\n\n**JUNO**\\\nWait for me.\n\n### Scene 2\n\n*The same dock, empty.*\n',
    );
    // A scene heading the play disables prints as a stage direction, as the PDF prints it.
    expect(md(STAGE_PLAY.replace('A dock.', 'INT. DOCK - DAY\n\nA dock.'))).toContain(
      '### Scene 1\n\n*INT. DOCK - DAY*\n\n*A dock. Gulls.*',
    );
  });

  test("takes off leading spaces, and joins an element's lines with hard breaks", () => {
    expect(md('INT. A - DAY\n\n    Four spaces in.\n  Two in.\n')).toBe(
      '## INT. A - DAY\n\nFour spaces in.\\\nTwo in.\n',
    );
  });
});

describe('scriptMarkdown: notes', () => {
  const NOTED = `INT. A - DAY

= The ferry leaves.

Fog. [[Writer: fix the fog]]

[[Check the tide tables.]]

/* An old line.

[[A note in the cut.]] */

The end.
`;

  test('leaves notes, synopses, and the boneyard out by default', () => {
    expect(md(NOTED)).toBe('## INT. A - DAY\n\nFog.\n\nThe end.\n');
  });

  test('writes notes and synopses as quotes with Include, and never the boneyard', () => {
    expect(md(NOTED, { notes: 'include' })).toBe(
      [
        '## INT. A - DAY',
        '> The ferry leaves.',
        'Fog.',
        '> **Note (Writer):** fix the fog',
        '> **Note:** Check the tide tables.',
        'The end.\n',
      ].join('\n\n'),
    );
  });

  test("keys a note only when it has a head, as the app reads notes, and keeps the key's text", () => {
    const note = (inner: string) =>
      md(`INT. A - DAY\n\nFog. [[${inner}]]\n`, { notes: 'include' }).split('\n\n')[2]?.trimEnd();
    // A colon that isn't a head's: a time, a link, a phrase.
    expect(note('Call at 10:30 sharp')).toBe('> **Note:** Call at 10:30 sharp');
    expect(note('(O.S.) means off screen: we hear him')).toBe(
      '> **Note:** (O.S.) means off screen: we hear him',
    );
    expect(note('see http://example.com')).toBe('> **Note:** see http://example.com');
    expect(note('Note to self: call Ann')).toBe('> **Note:** Note to self: call Ann');
    // A head: a person, a category, a field, a reply, and a person on a quote, colon and all.
    expect(note('Writer: fix the fog')).toBe('> **Note (Writer):** fix the fog');
    expect(note('TODO: tighten')).toBe('> **Note (TODO):** tighten');
    expect(note('goal:  get out')).toBe('> **Note (goal):** get out');
    expect(note('Ann re Bob: agreed')).toBe('> **Note (Ann re Bob):** agreed');
    expect(note('Sam on "10:30 *sharp*": too early')).toBe(
      '> **Note (Sam on "10:30 \\*sharp\\*"):** too early',
    );
    expect(note('Sam on “the [words]”: cut')).toBe('> **Note (Sam on “the \\[words]”):** cut');
  });

  test("leaves the title page's notes out whatever the title page option", () => {
    const source =
      'Title: Night Ferry [[A title page note.]]\nAuthor: R. Okafor\n\nINT. A - DAY\n\nFog.\n';
    for (const mode of ['full', 'title-author', 'none'] as const) {
      expect(md(source, { notes: 'include' }, mode), mode).not.toContain('title page note');
    }
  });
});
