import { parse } from '@drafter/fountain';
import { lint } from '@drafter/lint';
import { describe, expect, test } from 'vitest';
import { expandOutline, STAGE_STUB, STUB_HEADING, scriptFromMarkdown } from '../src';
import { apply, headings, indexOf, screenplay, stagePlay } from './helpers';

const expand = (source: string, range?: { from: number; to: number }) => {
  const { doc, template } = indexOf(source);
  return apply(source, expandOutline(doc, template, range ?? { from: 0, to: source.length }));
};

describe('expandOutline', () => {
  test('turns synopses outside scenes into stubs', () => {
    expect(expand('# Act One\n\n= Margaret waits.\n\n= Danny comes home.\n')).toBe(
      `# Act One\n\n${STUB_HEADING}\n\n= Margaret waits.\n\n${STUB_HEADING}\n\n= Danny comes home.\n`,
    );
  });

  test('turns a list into stubs', () => {
    expect(expand('- Margaret waits.\n- Danny comes home.\n')).toBe(
      `${STUB_HEADING}\n\n= Margaret waits.\n\n${STUB_HEADING}\n\n= Danny comes home.\n`,
    );
    // A paragraph that is only partly a list is left alone.
    expect(expand('- One.\nNot an item.\n')).toBe('- One.\nNot an item.\n');
  });

  test('leaves synopses inside scenes alone', () => {
    const source = 'INT. A - DAY\n\n= Already a scene.\n\n= Still in it.\n';
    expect(expand(source)).toBe(source);
  });

  test('works on the selection only', () => {
    const source = '= One.\n\n= Two.\n';
    expect(expand(source, { from: 9, to: 9 })).toBe(`= One.\n\n${STUB_HEADING}\n\n= Two.\n`);
  });

  test('keeps sections, and a blank line before a stub that follows a line directly', () => {
    expect(expand('# Act One\n= Margaret waits.\n[[A note.]]\n')).toBe(
      `# Act One\n\n${STUB_HEADING}\n\n= Margaret waits.\n[[A note.]]\n`,
    );
  });

  test('uses ## New scene in a play', () => {
    const source =
      '# Act One\n\n= Margaret waits.\n\n/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/\n';
    const result = expand(source);
    expect(result).toBe(
      `# Act One\n\n${STAGE_STUB}\n\n= Margaret waits.\n\n/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/\n`,
    );
    expect(headings(indexOf(result).index)).toEqual(['New scene']);
    expect(lint(parse(result), stagePlay).filter((d) => d.ruleId === 'stub-heading')).toHaveLength(
      1,
    );
  });

  test('stubs are scenes, and stub-heading finds each one', () => {
    const result = expand('= One.\n\n- Two.\n- Three.\n');
    expect(indexOf(result).index.scenes).toHaveLength(3);
    expect(lint(parse(result), screenplay).filter((d) => d.ruleId === 'stub-heading')).toHaveLength(
      3,
    );
  });
});

describe('scriptFromMarkdown', () => {
  test('makes a screenplay from a Markdown outline', () => {
    const markdown = [
      '# The Call',
      '',
      'A story about waiting.',
      '',
      '## Act One',
      '',
      '- Margaret waits up',
      '  for a call.',
      '* Danny comes home.',
      '',
      '```',
      '- not an item',
      '```',
      '',
      '## Act Two',
      '',
      '1. The [cake](https://example.com) is ruined.',
      '> They laugh.',
      '',
    ].join('\n');
    const { title, body } = scriptFromMarkdown(markdown);
    expect(title).toBe('The Call');
    expect(body).toBe(
      `${[
        '= A story about waiting.',
        '## Act One',
        `${STUB_HEADING}\n\n= Margaret waits up for a call.`,
        `${STUB_HEADING}\n\n= Danny comes home.`,
        '## Act Two',
        `${STUB_HEADING}\n\n= The cake is ruined.`,
        '= They laugh.',
      ].join('\n\n')}\n`,
    );
    const index = indexOf(body).index;
    expect(index.scenes).toHaveLength(3);
    expect(index.sections.map((s) => s.title)).toEqual(['Act One', 'Act Two']);
  });

  test("never writes a note or boneyard opener from the writer's words", () => {
    const { body } = scriptFromMarkdown('- [[not a note]] /* nor this */\n');
    expect(parse(body).regions).toEqual([]);
  });

  test('has no title without a first-line heading', () => {
    expect(scriptFromMarkdown('- One.\n').title).toBeNull();
  });
});
