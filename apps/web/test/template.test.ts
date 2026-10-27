import { parse } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import {
  DOCUMENT_TYPES,
  TEMPLATE_NAMES,
  templateIdOf,
  typeNameOf,
  unknownTemplateNote,
  unknownTemplateOf,
} from '../app/editor/template';

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

describe('an unknown template', () => {
  test('is named when the metadata asks for one Drafter does not have', () => {
    expect(unknownTemplateOf(withMeta('{"v":1,"template":"my-own"}'))).toBe('my-own');
    expect(unknownTemplateOf(withMeta('{"v":1,"template":"toString"}'))).toBe('toString');
  });

  test('is any template value that is not a name Drafter has: a number, a list, an object', () => {
    expect(unknownTemplateOf(withMeta('{"v":1,"template":5}'))).toBe('5');
    expect(unknownTemplateOf(withMeta('{"v":1,"template":["a"]}'))).toBe('["a"]');
    expect(unknownTemplateOf(withMeta('{"v":1,"template":{"x":1}}'))).toBe('{"x":1}');
    expect(unknownTemplateOf(withMeta('{"v":1,"template":true}'))).toBe('true');
    // null is no template at all.
    expect(unknownTemplateOf(withMeta('{"v":1,"template":null}'))).toBeUndefined();
  });

  test('is shown without control or direction-changing characters, and cut to 60', () => {
    const shown = unknownTemplateOf(
      withMeta('{"v":1,"template":"a\\u202Eb\\u0007c\\u2066d\\u200Fe\\nf"}'),
    );
    expect(shown).toBe('abcdef');
    const long = 'x'.repeat(300);
    const cut = unknownTemplateOf(withMeta(`{"v":1,"template":"${long}"}`));
    expect(cut).toBe(`${'x'.repeat(60)}…`);
    // A name of nothing but such characters still says something.
    expect(unknownTemplateOf(withMeta('{"v":1,"template":"\\u202E\\u0007"}'))).toBe(
      '(unprintable)',
    );
  });

  test('is not there for a built-in, no template, or an empty name', () => {
    expect(unknownTemplateOf(withMeta('{"v":1,"template":"us-screenplay"}'))).toBeUndefined();
    expect(unknownTemplateOf(withMeta('{"v":1,"template":"stage-play-standard"}'))).toBeUndefined();
    expect(unknownTemplateOf(withMeta('{"v":1}'))).toBeUndefined();
    expect(unknownTemplateOf(withMeta('{"v":1,"template":""}'))).toBeUndefined();
    expect(unknownTemplateOf(parse('INT. HALL - DAY\n'))).toBeUndefined();
  });

  test('is said in the chip’s name and the menu’s note', () => {
    expect(typeNameOf('fountain', 'us-screenplay', true)).toBe('Screenplay (fallback)');
    expect(typeNameOf('fountain', 'us-screenplay')).toBe('Screenplay');
    // A Markdown document has no template to fall back from.
    expect(typeNameOf('markdown', 'us-screenplay', true)).toBe('Markdown (plain text)');
    expect(unknownTemplateNote('my-own')).toBe(
      "This script asks for “my-own”, which Drafter doesn't have, so it's shown as a screenplay.",
    );
  });
});
