import { parse } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import { templateIdOf } from '../app/editor/template';
import { newScriptText, screenplayFromOutline } from '../app/storage/new-script';

const TODAY = new Date(2026, 9, 25, 14, 30);

describe('newScriptText', () => {
  test('starts a screenplay with a title page to fill in', () => {
    const { text, cursor } = newScriptText('screenplay', TODAY);
    const fields = parse(text).titlePage?.fields.map((f) => f.key);
    expect(fields).toEqual(['Title', 'Credit', 'Author', 'Draft date']);
    expect(text).toBe(
      'Title: Untitled Screenplay\nCredit: Written by\nAuthor: Your Name\nDraft date: October 25, 2026\n\n',
    );
    expect(cursor).toBe(text.length);
  });

  test('starts a stage play that names its template', () => {
    const { text, cursor } = newScriptText('stage-play', TODAY);
    const doc = parse(text);
    expect(doc.meta?.template).toBe('stage-play-standard');
    expect(templateIdOf(doc)).toBe('stage-play-standard');
    expect(doc.titlePage?.fields.map((f) => f.key)).toEqual([
      'Title',
      'Credit',
      'Author',
      'Draft date',
    ]);
    expect(text).toContain('Title: Untitled Play\n');
    expect(text.trimEnd().split('\n').slice(-3)).toEqual([
      '/* drafter',
      '{"v":1,"template":"stage-play-standard"}',
      '*/',
    ]);
    // The cursor is on the blank line before the metadata block.
    expect(text.slice(cursor - 1, cursor + 1)).toBe('\n\n');
    expect(text.slice(cursor + 1).startsWith('/* drafter')).toBe(true);
    expect(doc.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  test('writes the date from the local calendar, with no leading zero', () => {
    const { text } = newScriptText('screenplay', new Date(2027, 0, 5, 23, 59));
    expect(text).toContain('Draft date: January 5, 2027\n');
  });

  test('parses the same however it is called', () => {
    expect(newScriptText('screenplay', TODAY)).toEqual(newScriptText('screenplay', TODAY));
    expect(parse(newScriptText('screenplay', TODAY).text).meta).toBeNull();
  });

  test('starts a Markdown document with a title, a blank line, and the cursor below them', () => {
    const { text, cursor } = newScriptText('markdown', TODAY);
    expect(text).toBe('# Untitled\n\n');
    expect(cursor).toBe(text.length);
  });
});

describe('screenplayFromOutline', () => {
  test("takes the outline's title, even one with a $ in it", () => {
    const text = screenplayFromOutline('# Cash $& Prizes\n\n- One.\n', TODAY);
    expect(text).toBe(
      'Title: Cash $& Prizes\nCredit: Written by\nAuthor: Your Name\nDraft date: October 25, 2026\n\nINT. LOCATION - DAY\n\n= One.\n',
    );
  });

  test('keeps the untitled title page without a title', () => {
    expect(screenplayFromOutline('- One.\n', TODAY)).toMatch(/^Title: Untitled Screenplay\n/);
  });
});
