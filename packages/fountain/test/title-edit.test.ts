import { parse, setTitleField, type TextChange } from '@drafter/fountain';
import { describe, expect, it } from 'vitest';

/** The changes applied from last to first, so each keeps its old-document offsets. */
function apply(source: string, changes: readonly TextChange[]): string {
  let text = source;
  for (const { from, to, insert } of [...changes].sort((a, b) => b.from - a.from)) {
    text = text.slice(0, from) + insert + text.slice(to);
  }
  return text;
}

const set = (source: string, key: string, value: string | null) =>
  apply(source, setTitleField(parse(source), key, value));

const SCRIPT = 'Title: Low Tide\nAuthor: Mara Quill\n\nEXT. JETTY - DAWN\n\nGulls.\n';

describe('setTitleField', () => {
  it('adds Logline after the last field', () => {
    const out = set(SCRIPT, 'Logline', 'A ferry pilot races the tide.');
    expect(out).toBe(
      'Title: Low Tide\nAuthor: Mara Quill\nLogline: A ferry pilot races the tide.\n\nEXT. JETTY - DAWN\n\nGulls.\n',
    );
    expect(parse(out).titlePage?.fields.map((f) => f.key)).toEqual(['Title', 'Author', 'Logline']);
  });

  it('adds it after an indented continuation, not inside it', () => {
    const source = 'Title: Low Tide\nContact:\n    1 Pier Road\n    Harbourtown\n\nGulls.\n';
    expect(set(source, 'Logline', 'Two lines.')).toBe(
      'Title: Low Tide\nContact:\n    1 Pier Road\n    Harbourtown\nLogline: Two lines.\n\nGulls.\n',
    );
  });

  it('replaces an existing Logline in any case', () => {
    const source = 'Title: Low Tide\nLOGLINE:   Old line.\nAuthor: Mara\n\nGulls.\n';
    expect(set(source, 'Logline', 'New line.')).toBe(
      'Title: Low Tide\nLOGLINE: New line.\nAuthor: Mara\n\nGulls.\n',
    );
  });

  it('replaces a value held on continuation lines with one line', () => {
    const source = 'Title: Low Tide\nLogline:\n    One part,\n    two parts.\n\nGulls.\n';
    expect(set(source, 'Logline', 'Whole.')).toBe('Title: Low Tide\nLogline: Whole.\n\nGulls.\n');
  });

  it('removes it when null', () => {
    const source = 'Title: Low Tide\nLogline: Old line.\nAuthor: Mara\n\nGulls.\n';
    expect(set(source, 'Logline', null)).toBe('Title: Low Tide\nAuthor: Mara\n\nGulls.\n');
    // An empty value is no value.
    expect(set(source, 'Logline', '   ')).toBe('Title: Low Tide\nAuthor: Mara\n\nGulls.\n');
  });

  it('removes the last field of a title page, and the title page with it', () => {
    const source = 'Logline: Only this.\n\nEXT. JETTY - DAWN\n\nGulls.\n';
    expect(set(source, 'Logline', null)).toBe('EXT. JETTY - DAWN\n\nGulls.\n');
  });

  it('a script with no title page gets one', () => {
    const source = 'EXT. JETTY - DAWN\n\nGulls.\n';
    const out = set(source, 'Logline', 'A ferry pilot races the tide.');
    expect(out).toBe('Logline: A ferry pilot races the tide.\n\nEXT. JETTY - DAWN\n\nGulls.\n');
    const doc = parse(out);
    expect(doc.titlePage?.fields[0]?.value).toEqual(['A ferry pilot races the tide.']);
    expect(doc.blocks[0]?.kind).toBe('scene_heading');
  });

  it('an empty script gets a title page of one line', () => {
    expect(set('', 'Logline', 'Hello there.')).toBe('Logline: Hello there.\n');
  });

  it('CRLF scripts keep CRLF', () => {
    const source = SCRIPT.replace(/\n/g, '\r\n');
    expect(set(source, 'Logline', 'Tide.')).toBe(
      'Title: Low Tide\r\nAuthor: Mara Quill\r\nLogline: Tide.\r\n\r\nEXT. JETTY - DAWN\r\n\r\nGulls.\r\n',
    );
    const replaced = set(
      'Title: A\r\nLogline: Old.\r\nAuthor: B\r\n\r\nGulls.\r\n',
      'Logline',
      'New.',
    );
    expect(replaced).toBe('Title: A\r\nLogline: New.\r\nAuthor: B\r\n\r\nGulls.\r\n');
    expect(set('Title: A\r\nLogline: Old.\r\n\r\nGulls.\r\n', 'Logline', null)).toBe(
      'Title: A\r\n\r\nGulls.\r\n',
    );
    expect(set('Gulls.\r\n', 'Logline', 'New.')).toBe('Logline: New.\r\n\r\nGulls.\r\n');
  });

  it('a newline in the value is a space', () => {
    expect(set(SCRIPT, 'Logline', 'One\ntwo\r\n three')).toContain('Logline: One two three\n');
  });

  it('gives no changes when nothing changes', () => {
    const source = 'Title: Low Tide\nLogline: Same.\n\nGulls.\n';
    expect(setTitleField(parse(source), 'Logline', 'Same.')).toEqual([]);
    expect(setTitleField(parse(SCRIPT), 'Logline', null)).toEqual([]);
  });

  it('a value that would open a note or a boneyard is made safe', () => {
    const out = set(SCRIPT, 'Logline', 'A [[note]] and /* this */');
    const doc = parse(out);
    expect(doc.regions).toEqual([]);
    expect(doc.titlePage?.fields.map((f) => f.key)).toContain('Logline');
  });
});
