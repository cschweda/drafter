import { type DrafterMeta, parse, setMeta, type TextChange } from '@drafter/fountain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

/** The changes applied from last to first, so each keeps its old-document offsets. */
function apply(source: string, changes: readonly TextChange[]): string {
  let text = source;
  for (const { from, to, insert } of [...changes].sort((a, b) => b.from - a.from)) {
    text = text.slice(0, from) + insert + text.slice(to);
  }
  return text;
}

/** The script with `meta` written into it. */
const written = (source: string, meta: DrafterMeta) => apply(source, setMeta(parse(source), meta));

const script = 'INT. HALL - DAY\n\nShe waits.\n';

describe('setMeta', () => {
  it('appends a block after a blank line', () => {
    expect(written(script, { template: 'stage-play-standard' })).toBe(
      'INT. HALL - DAY\n\nShe waits.\n\n/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/\n',
    );
  });

  it.each([
    ['nothing', '', '/* drafter\n{"v":1,"template":"t"}\n*/\n'],
    ['no final line break', 'She waits.', 'She waits.\n\n/* drafter\n{"v":1,"template":"t"}\n*/\n'],
    ['a blank line', 'She waits.\n\n', 'She waits.\n\n/* drafter\n{"v":1,"template":"t"}\n*/\n'],
    [
      'two blank lines',
      'She waits.\n\n\n',
      'She waits.\n\n\n/* drafter\n{"v":1,"template":"t"}\n*/\n',
    ],
  ])('appends to a script that ends with %s', (_label, source, expected) => {
    expect(written(source, { template: 't' })).toBe(expected);
  });

  it('replaces an existing block, and keeps everything before it byte for byte', () => {
    const before = 'Title: Hall\n\nINT. HALL - DAY\n\n  She waits.   \n\n/* a note to self */\n\n';
    const source = `${before}/* drafter\n{"v":1,"template":"us-screenplay"}\n*/\n`;
    const changes = setMeta(parse(source), { template: 'stage-play-standard' });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.from).toBe(before.length);
    const result = apply(source, changes);
    expect(result).toBe(`${before}/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/\n`);
    expect(parse(result).meta).toEqual({ v: 1, template: 'stage-play-standard' });
  });

  it('keeps what surrounds the block when it replaces it', () => {
    const source = `${script}\n\n  /* drafter\n{"v":1}\n*/  \n\n`;
    expect(written(source, { template: 'x' })).toBe(
      `${script}\n\n  /* drafter\n{"v":1,"template":"x"}\n*/  \n\n`,
    );
  });

  it('gives no changes when the block already says it', () => {
    const source = written(script, {
      template: 'stage-play-standard',
      distinctNames: [['A', 'B']],
    });
    expect(
      setMeta(parse(source), { template: 'stage-play-standard', distinctNames: [['A', 'B']] }),
    ).toEqual([]);
    expect(
      setMeta(parse(source), {
        v: 1,
        template: 'stage-play-standard',
        distinctNames: [['A', 'B']],
      }),
    ).toEqual([]);
  });

  it('leaves a block alone that is laid out another way but says the same', () => {
    const source = `${script}\n/* drafter\n{ "template": "t", "v": 1 }\n*/\n`;
    expect(setMeta(parse(source), { v: 1, template: 't' })).toEqual([]);
  });

  it('changes a block that says something else', () => {
    const source = written(script, { template: 'a' });
    expect(setMeta(parse(source), { template: 'b' })).not.toEqual([]);
    expect(setMeta(parse(source), { template: 'a', extra: true })).not.toEqual([]);
    expect(setMeta(parse(source), { template: 'a', v: 2 })).not.toEqual([]);
  });

  it('defaults v to 1, and keeps a v it is given', () => {
    expect(parse(written(script, {})).meta).toEqual({ v: 1 });
    expect(parse(written(script, { v: 2 })).meta).toEqual({ v: 2 });
    expect(written(script, { v: 2, template: 't' })).toContain('{"v":2,"template":"t"}');
  });

  it('escapes slashes so no value can close the block', () => {
    const meta = { v: 1, note: 'a */ b', path: '/* drafter', other: ['*/', '/'] };
    const result = written(script, meta);
    expect(result).toContain('a *\\/ b');
    // The block has one closer, its own.
    expect(result.split('*/')).toHaveLength(2);
    expect(parse(result).meta).toEqual(meta);
    expect(parse(result).diagnostics.filter((d) => d.code === 'invalid-meta')).toEqual([]);
  });

  it('writes the block with the file\u2019s own line break', () => {
    const source = 'INT. HALL - DAY\r\n\r\nShe waits.\r\n';
    const result = written(source, { template: 't' });
    expect(result).toBe(`${source}\r\n/* drafter\r\n{"v":1,"template":"t"}\r\n*/\r\n`);
    expect(result.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
    expect(parse(result).meta).toEqual({ v: 1, template: 't' });
  });

  it('uses the first line break to say which the file uses', () => {
    // The first break is a \n, so the new block's are.
    const mixed = 'A\n\nB\r\nC\r\n';
    expect(written(mixed, { template: 't' })).toBe(
      `${mixed}\n/* drafter\n{"v":1,"template":"t"}\n*/\n`,
    );
  });

  it('replaces a block in a CRLF file with CRLF', () => {
    const source = 'A\r\n\r\n/* drafter\r\n{"v":1}\r\n*/\r\n';
    expect(written(source, { template: 't' })).toBe(
      'A\r\n\r\n/* drafter\r\n{"v":1,"template":"t"}\r\n*/\r\n',
    );
  });

  it('adds a line break of the right kind to a CRLF file with no final one', () => {
    expect(written('A\r\nB', { template: 't' })).toBe(
      'A\r\nB\r\n\r\n/* drafter\r\n{"v":1,"template":"t"}\r\n*/\r\n',
    );
  });

  it('keeps a block it cannot read, and adds a good one after it', () => {
    const source = `${script}\n/* drafter\n{ nope }\n*/\n`;
    expect(parse(source).meta).toBeNull();
    const result = written(source, { template: 't' });
    expect(result.startsWith(source)).toBe(true);
    expect(parse(result).meta).toEqual({ v: 1, template: 't' });
  });

  it('does not touch an ordinary boneyard at the end', () => {
    const source = `${script}\n/* cut this */\n`;
    const result = written(source, { template: 't' });
    expect(result.startsWith(source)).toBe(true);
    expect(parse(result).meta).toEqual({ v: 1, template: 't' });
  });

  it('writes one change, in the offsets of the old source', () => {
    for (const source of [script, `${script}\n/* drafter\n{"v":1}\n*/\n`]) {
      const changes = setMeta(parse(source), { template: 't' });
      expect(changes).toHaveLength(1);
      const [change] = changes as [TextChange];
      expect(change.from).toBeGreaterThanOrEqual(0);
      expect(change.to).toBeLessThanOrEqual(source.length);
      expect(change.from).toBeLessThanOrEqual(change.to);
    }
  });

  it('is a fixed point: writing the same meta again changes nothing', () => {
    for (const source of [script, '', 'A\r\nB', `${script}\n/* drafter\n{"v":1}\n*/\n`]) {
      const once = written(source, { template: 't', distinctNames: [['A', 'B']] });
      expect(setMeta(parse(once), { template: 't', distinctNames: [['A', 'B']] }), source).toEqual(
        [],
      );
    }
  });

  it('round-trips through parse', () => {
    const metas: DrafterMeta[] = [
      { template: 'stage-play-standard' },
      { template: 'us-screenplay', distinctNames: [['MARGARET', 'MARGERET']] },
      { distinctNames: [] },
      { note: 'a */ b', path: 'C:/x/y' },
      { nested: { a: [1, 2, { b: null }], c: 'd\ne' } },
    ];
    const sources = [
      '',
      script,
      'She waits.',
      'A\r\n\r\nB\r\n',
      `${script}\n/* drafter\n{"v":1,"template":"old"}\n*/\n`,
    ];
    for (const source of sources) {
      for (const meta of metas) {
        expect(parse(written(source, meta)).meta, JSON.stringify([source, meta])).toEqual({
          v: 1,
          ...meta,
        });
      }
    }
  });

  it('round-trips any string value, whatever it holds', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), fc.constantFrom('\n', '\r\n'), (value, nl) => {
        const source = `INT. HALL - DAY${nl}${nl}She waits.${nl}`;
        const result = written(source, { value });
        expect(parse(result).meta).toEqual({ v: 1, value });
        // And everything before the block is untouched.
        expect(result.startsWith(source)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});
