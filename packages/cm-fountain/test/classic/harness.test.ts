import { elementTemplate } from '@drafter/cm-fountain';
import { builtins } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { classicEditor, keys, render } from './harness';

describe('the Classic harness', () => {
  it('presses the keys it names, and types the rest', () => {
    expect(render(keys(classicEditor(''), 'JUNE', 'Tab', 'Enter'))).toBe('JUNE\n\n|');
  });

  it('carries the template it is given', () => {
    const template = builtins['stage-play-standard'];
    expect(classicEditor('', { template }).facet(elementTemplate)?.()).toBe(template);
  });
});
