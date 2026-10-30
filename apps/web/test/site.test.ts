import { describe, expect, it } from 'vitest';
import { SITE_DESCRIPTION, SITE_TITLE } from '../site';

// Search engines and link previews cut a title past about 60 characters and a description past
// about 160, and meta-tag checkers mark them down for it.
describe("drafter.dev's title and description", () => {
  it('keep the title to 60 characters', () => {
    expect(SITE_TITLE.length).toBeLessThanOrEqual(60);
  });

  it('keep the description to 160 characters', () => {
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(160);
  });

  it('still say Fountain first, and name novels', () => {
    expect(SITE_TITLE).toMatch(/Fountain-first/);
    expect(SITE_DESCRIPTION).toMatch(/novels/);
  });
});
