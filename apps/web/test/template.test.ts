import { parse } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import { TEMPLATE_NAMES, templateIdOf } from '../app/editor/template';

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
