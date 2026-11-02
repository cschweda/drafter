import { parse } from '@drafter/fountain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { visible, visibleMarkdown } from '../src/visible';

const all = (source: string, include: ReadonlyArray<'notes' | 'boneyard'> = []) => {
  const doc = parse(source);
  return visible(doc, 0, source.length, include);
};

const META = '/* drafter\n{"v":1,"template":"us-screenplay"}\n*/\n';

describe('visible', () => {
  it('notes and the boneyard are cut and counted', () => {
    const source =
      'INT. RADIO ROOM - NIGHT\n\nJUNE turns the dial. [[slow this down]]\n\n/* an old line */\n\nJUNE\nHello? [[louder]]\n';
    expect(all(source)).toEqual({
      text: 'INT. RADIO ROOM - NIGHT\n\nJUNE turns the dial. \n\n\n\nJUNE\nHello? \n',
      leftOut: { notes: 2, boneyard: 1 },
    });
  });

  it('included ones stay', () => {
    const source = 'INT. RADIO ROOM - NIGHT\n\nJUNE turns the dial. [[slow]]\n\n/* old */\n';
    expect(all(source, ['notes'])).toEqual({
      text: 'INT. RADIO ROOM - NIGHT\n\nJUNE turns the dial. [[slow]]\n\n\n',
      leftOut: { notes: 0, boneyard: 1 },
    });
    expect(all(source, ['notes', 'boneyard'])).toEqual({
      text: source,
      leftOut: { notes: 0, boneyard: 0 },
    });
  });

  it('only what is between from and to, and only the regions there are counted', () => {
    const source = 'INT. A - DAY\n\n[[one]]\n\nINT. B - DAY\n\nB. [[two]] [[three]]\n';
    const doc = parse(source);
    const from = source.indexOf('INT. B');
    expect(visible(doc, from, source.length, [])).toEqual({
      text: 'INT. B - DAY\n\nB.  \n',
      leftOut: { notes: 2, boneyard: 0 },
    });
  });

  it('the metadata block never shows, even included', () => {
    const board = '/* beat board\n{"cards":[]}\n*/\n\n';
    const source = `INT. RADIO ROOM - NIGHT\n\nStatic.\n\n${board}${META}`;
    const shown = all(source, ['notes', 'boneyard']);
    expect(shown.text).toBe('INT. RADIO ROOM - NIGHT\n\nStatic.');
    expect(shown.leftOut).toEqual({ notes: 0, boneyard: 0 });
    expect(all(source).leftOut).toEqual({ notes: 0, boneyard: 0 });
    // Asked for past it, nothing.
    const doc = parse(source);
    expect(visible(doc, source.indexOf('/* drafter'), source.length, ['boneyard']).text).toBe('');
  });

  it('an indented metadata block after an unclosed boneyard never shows, even included', () => {
    for (const indent of ['  ', '\t']) {
      const source = `INT. ROOM - DAY\n\nStatic. /* never closed\nmore\n\n${indent}/* drafter\n{"v":1,"id":"secret-id"}\n*/\n`;
      const shown = all(source, ['notes', 'boneyard']).text;
      expect(shown).not.toContain('drafter');
      expect(shown).not.toContain('secret-id');
      expect(shown).toBe('INT. ROOM - DAY\n\nStatic. /* never closed\nmore');
    }
  });

  it('every drafter block is cut, an older one before the metadata too', () => {
    const source = `INT. ROOM - DAY\n\nStatic.\n\n/* drafter\n{not json, "old-secret"}\n*/\n\nMore static. /* my own aside */\n\n/* drafter\n{"v":1,"id":"new-secret"}\n*/\n`;
    for (const include of [[], ['boneyard'], ['notes', 'boneyard']] as const) {
      const shown = all(source, include);
      expect(shown.text).not.toContain('old-secret');
      expect(shown.text).not.toContain('new-secret');
      expect(shown.text).not.toContain('/* drafter');
      expect(shown.text).toContain('More static.');
      // Drafter's own blocks aren't the writer's boneyard: never counted as left out.
      expect(shown.leftOut.boneyard).toBe(include.length === 0 ? 1 : 0);
    }
    expect(all(source, ['boneyard']).text).toContain('/* my own aside */');
  });

  it('Contact never shows, in any case, with its continuation lines', () => {
    for (const key of ['Contact', 'CONTACT', 'contact']) {
      const source = `Title: Signal Hill\n${key}:\n    The Grange\n    555-0199\nAuthor: A. Writer\n\nINT. GRANGE - NIGHT\n\nChairs.\n`;
      for (const include of [[], ['notes', 'boneyard']] as const) {
        const shown = all(source, include).text;
        expect(shown).not.toContain('Grange\n');
        expect(shown).not.toContain('555-0199');
        expect(shown).not.toContain(`${key}:`);
        expect(shown).toBe(
          'Title: Signal Hill\nAuthor: A. Writer\n\nINT. GRANGE - NIGHT\n\nChairs.\n',
        );
      }
    }
    const inline = 'Title: X\ncontact: me@example.com\n\nINT. A - DAY\n';
    expect(all(inline).text).toBe('Title: X\n\nINT. A - DAY\n');
  });

  it('an unclosed boneyard is cut to the end, never past it into the metadata', () => {
    const word = fc.constantFrom('June', 'radio', 'hill', 'static', 'Eli', 'tower');
    const piece = fc.oneof(
      { weight: 4, arbitrary: word },
      { weight: 1, arbitrary: word.map((w) => `[[${w}]]`) },
      { weight: 1, arbitrary: word.map((w) => `/* ${w} */`) },
    );
    const text = fc.array(piece, { minLength: 1, maxLength: 6 }).map((p) => p.join(' '));
    const note = piece.filter((p) => p.startsWith('[[') || p.startsWith('/*'));
    // Action, and notes inside synopses, headings, and cues.
    const line = fc.oneof(
      { weight: 4, arbitrary: text },
      { weight: 1, arbitrary: note.map((n) => `= The radio ${n} wakes.`) },
      { weight: 1, arbitrary: note.map((n) => `\nEXT. HILL ${n} - NIGHT\n`) },
      { weight: 1, arbitrary: note.map((n) => `\nJUNE ${n}\nHello.`) },
    );
    const script = fc.record({
      lines: fc.array(fc.oneof(line, fc.constant('')), { minLength: 1, maxLength: 12 }),
      unclosed: fc.boolean(),
      meta: fc.boolean(),
      indent: fc.constantFrom('', '  ', '\t', ' \t '),
      eol: fc.constantFrom('\n', '\r\n'),
      lastBreak: fc.boolean(),
    });
    fc.assert(
      fc.property(script, ({ lines, unclosed, meta, indent, eol, lastBreak }) => {
        let body = `INT. ROOM - DAY\n\n${lines.join('\n')}\n`;
        if (unclosed) body += '\n/* never closed\nmore words\n';
        body = body.replaceAll('\n', eol);
        const block = `${indent}/* drafter${eol}{"v":1}${eol}*/${lastBreak ? eol : ''}`;
        const source = meta ? `${body}${eol}${block}` : body;
        const doc = parse(source);
        // Where the script ends: before the metadata block and the blank lines before it.
        const limit = meta ? body.trimEnd().length : source.length;
        for (const include of [[], ['notes', 'boneyard']] as const) {
          const shown = visible(doc, 0, source.length, include);
          const kept = Array.from(source.slice(0, limit), () => true);
          if (include.length === 0)
            for (const region of doc.regions)
              for (let i = region.span.from; i < Math.min(region.span.to, limit); i++)
                kept[i] = false;
          const expected = [...source.slice(0, limit)].filter((_, i) => kept[i]).join('');
          expect(shown.text).toBe(expected);
          expect(shown.text).not.toContain('drafter');
          expect(shown.text).not.toContain('"v":1');
          if (include.length === 0) {
            expect(shown.text).not.toContain('[[');
            expect(shown.text).not.toContain('/*');
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('visibleMarkdown', () => {
  it('the metadata comment is cut', () => {
    const text = '# Bible\n\nJune.\n\n<!-- drafter {"v":1} -->\n';
    expect(visibleMarkdown(text, 0, text.length)).toBe('# Bible\n\nJune.');
    expect(visibleMarkdown('# Bible\n\nJune.\n', 0, 15)).toBe('# Bible\n\nJune.\n');
  });

  it('every drafter comment is cut, an older one, an indented one, and an unclosed one too', () => {
    const text =
      '# Bible\n\n<!-- drafter {"draft":1,"note":"older"} -->\n\nJune.\n\n  <!-- drafter {"x":"indented"} -->\nEli.\n\n<!-- drafter {"v":1} -->\n';
    const shown = visibleMarkdown(text, 0, text.length);
    expect(shown).not.toContain('drafter');
    expect(shown).not.toContain('older');
    expect(shown).toContain('June.');
    expect(shown).toContain('Eli.');
    expect(visibleMarkdown('# A\n\n<!-- drafter {"broken": \nsecret\n', 0, 30)).toBe('# A\n\n');
    // A comment of the writer's own, or one not at a line's start, stays.
    expect(visibleMarkdown('<!-- mine -->\nx <!-- drafter {} -->\n', 0, 36)).toBe(
      '<!-- mine -->\nx <!-- drafter {} -->\n',
    );
  });
});
