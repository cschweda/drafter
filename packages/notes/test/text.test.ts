import { parse, type TextChange } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import {
  bodyEnd,
  contentEnd,
  hasBlankLine,
  hasStrayBoneyard,
  isLineBreak,
  isPlainGap,
  lineBreakOf,
  removeLine,
} from '../src';

/** `source` with one change made. */
const apply = (source: string, change: TextChange | null) =>
  change ? source.slice(0, change.from) + change.insert + source.slice(change.to) : null;

/** The script with line `line` of the block whose first line is `first` taken out. */
function without(source: string, first: string, line = 0): string | null {
  const doc = parse(source);
  const index = doc.blocks.findIndex((b) => b.lines[0]?.raw.replace(/\r$/, '') === first);
  if (index < 0) throw new Error(`no block ${first}`);
  return apply(source, removeLine(doc, index, line));
}

describe('lineBreakOf', () => {
  test("is the script's first line break, or \\n", () => {
    expect(lineBreakOf('A\r\nB\nC')).toBe('\r\n');
    expect(lineBreakOf('A\nB\r\nC')).toBe('\n');
    expect(lineBreakOf('one line')).toBe('\n');
    expect(lineBreakOf('\nA')).toBe('\n');
  });
});

describe('isLineBreak', () => {
  test('is a single line break and nothing else', () => {
    expect(isLineBreak('\n')).toBe(true);
    expect(isLineBreak('\r\n')).toBe(true);
    expect(isLineBreak('\n\n')).toBe(false);
    expect(isLineBreak(' \n')).toBe(false);
    expect(isLineBreak('')).toBe(false);
  });
});

describe('contentEnd', () => {
  test("moves back before a CRLF's \\r", () => {
    expect(contentEnd('ab\r\n', 3)).toBe(2);
    expect(contentEnd('ab\n', 2)).toBe(2);
    expect(contentEnd('', 0)).toBe(0);
  });
});

describe('hasBlankLine and isPlainGap', () => {
  test('read blank lines as Fountain does, two spaces joining', () => {
    expect(hasBlankLine('\n\n')).toBe(true);
    expect(hasBlankLine('\n \n')).toBe(true);
    expect(hasBlankLine('\r\n\r\n')).toBe(true);
    expect(hasBlankLine('\n')).toBe(false);
    expect(hasBlankLine('\n  \n')).toBe(false);
    expect(isPlainGap('\n\n\n')).toBe(true);
    expect(isPlainGap('\n')).toBe(true);
    expect(isPlainGap('\n  \n\n')).toBe(false);
  });
});

describe('hasStrayBoneyard', () => {
  test('finds an unclosed /*, or one closed only by a later boneyard', () => {
    expect(hasStrayBoneyard(parse('INT. A - DAY\n\nA. /* oops\n'))).toBe(true);
    expect(hasStrayBoneyard(parse('INT. A - DAY\n\nB. /* oops\n\n/* drafter\n{"v":1}\n*/\n'))).toBe(
      true,
    );
    expect(
      hasStrayBoneyard(parse('INT. A - DAY\n\nA. /* fine */\n\n/* drafter\n{"v":1}\n*/\n')),
    ).toBe(false);
    expect(hasStrayBoneyard(parse('INT. A - DAY\n\n[[a note]]\n'))).toBe(false);
  });
});

describe('bodyEnd', () => {
  test('leaves out the metadata block and the beat board before it', () => {
    const both = parse(
      'INT. A - DAY\n\nOne.\n\n/* beat board\n= An idea.\n*/\n\n/* drafter\n{"v":1}\n*/\n',
    );
    expect(bodyEnd(both)).toBe(both.blocks.length - 2);
    const meta = parse('INT. A - DAY\n\nOne.\n\n/* drafter\n{"v":1}\n*/\n');
    expect(bodyEnd(meta)).toBe(meta.blocks.length - 1);
    const plain = parse('INT. A - DAY\n\nOne.\n\n/* a boneyard */\n');
    expect(bodyEnd(plain)).toBe(plain.blocks.length);
  });
});

describe('removeLine', () => {
  test('takes a line out of a header, closing it up', () => {
    expect(without('INT. A - DAY\n\n= Syn.\n[[Color: blue]]\n\nAction.\n', '[[Color: blue]]')).toBe(
      'INT. A - DAY\n\n= Syn.\n\nAction.\n',
    );
    expect(
      without('INT. A - DAY\n\n[[Color: blue]]\n[[Goal: Win.]]\n\nAction.\n', '[[Color: blue]]'),
    ).toBe('INT. A - DAY\n\n[[Goal: Win.]]\n\nAction.\n');
  });

  test('takes a block on its own line out with the gap before it', () => {
    expect(without('INT. A - DAY\n\n= Old.\n\nAction.\n', '= Old.')).toBe(
      'INT. A - DAY\n\nAction.\n',
    );
  });

  test('takes one line of a block out', () => {
    expect(without('INT. A - DAY\n\nOne.\nTwo.\nThree.\n', 'One.', 1)).toBe(
      'INT. A - DAY\n\nOne.\nThree.\n',
    );
    expect(without('INT. A - DAY\n\nOne.\nTwo.\n', 'One.', 1)).toBe('INT. A - DAY\n\nOne.\n');
  });

  test('keeps a CRLF line break style', () => {
    expect(
      without(
        'INT. A - DAY\r\n\r\n= Syn.\r\n[[Color: blue]]\r\n\r\nAction.\r\n',
        '[[Color: blue]]',
      ),
    ).toBe('INT. A - DAY\r\n\r\n= Syn.\r\n\r\nAction.\r\n');
  });

  test("a line joined to its neighbours by two-space lines isn't taken out", () => {
    expect(without('INT. A - DAY\n\nCUT TO:\n  \n= the.\n  \n> the. <', '= the.')).toBeNull();
    expect(without('INT. A - DAY\n\nANN\nHi.\n  \n= the.\nANN\nHi.', '= the.')).toBeNull();
  });

  test('throws for a line the block does not have', () => {
    const doc = parse('INT. A - DAY\n');
    expect(() => removeLine(doc, 0, 3)).toThrow(RangeError);
  });
});
