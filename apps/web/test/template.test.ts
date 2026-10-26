import { parse } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import { DOCUMENT_TYPES, TEMPLATE_NAMES, templateIdOf } from '../app/editor/template';

const withMeta = (json: string) => parse(`INT. HALL - DAY\n\nHello.\n\n/* drafter\n${json}\n*/\n`);

describe('templateIdOf', () => {
  test('reads the template from the metadata', () => {
    expect(templateIdOf(withMeta('{"v":1,"template":"stage-play-standard"}'))).toBe(
      'stage-play-standard',
    );
    expect(templateIdOf(withMeta('{"v":1,"template":"us-screenplay"}'))).toBe('us-screenplay');
  });

  test('falls back to the screenplay for an unknown or missing id', () => {
    expect(templateIdOf(withMeta('{"v":1,"template":"my-own"}'))).toBe('us-screenplay');
    expect(templateIdOf(withMeta('{"v":1}'))).toBe('us-screenplay');
    expect(templateIdOf(parse('INT. HALL - DAY\n'))).toBe('us-screenplay');
    // Inherited names are not templates.
    expect(templateIdOf(withMeta('{"v":1,"template":"toString"}'))).toBe('us-screenplay');
  });

  test('names the built-ins for the toolbar and the status bar', () => {
    expect(TEMPLATE_NAMES).toEqual({
      'us-screenplay': 'Screenplay',
      'stage-play-standard': 'Stage play',
    });
  });
});

describe('DOCUMENT_TYPES', () => {
  test('lists Screenplay first, Stage play second, and Markdown last', () => {
    // The chip, the New menu, and the palette read this one list.
    expect(DOCUMENT_TYPES.slice(0, 2).map((t) => t.name)).toEqual(['Screenplay', 'Stage play']);
    expect(DOCUMENT_TYPES.slice(0, 2).map((t) => t.newTitle)).toEqual([
      'New screenplay',
      'New stage play',
    ]);
    const last = DOCUMENT_TYPES.at(-1);
    expect(last?.kind).toBe('markdown');
    expect(last?.name).toBe('Markdown (plain text)');
    expect(last?.newTitle).toBe('New Markdown document');
    // Markdown is the only member that isn't a Fountain template.
    expect(DOCUMENT_TYPES.filter((t) => t.kind === 'markdown')).toHaveLength(1);
  });

  test('has an entry for every built-in template, once', () => {
    const fountain = DOCUMENT_TYPES.filter((t) => t.kind === 'fountain');
    const ids = fountain.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(Object.keys(TEMPLATE_NAMES).sort());
    for (const t of fountain) expect(t.name).toBe(TEMPLATE_NAMES[t.id]);
  });
});
