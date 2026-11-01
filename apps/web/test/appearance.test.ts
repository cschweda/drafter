import { describe, expect, test } from 'vitest';
import { appearanceStep, freshVisitMatchesSystem } from '../app/settings/appearance';

const base = {
  on: false,
  preference: 'dark',
  current: 'dark',
  initial: false,
  read: true,
} as const;

describe('appearanceStep', () => {
  test('turning match system on remembers the chosen theme and follows the system', () => {
    expect(appearanceStep({ ...base, on: true })).toEqual({ preference: 'system', chosen: 'dark' });
  });

  test('turning it off puts back the theme chosen last', () => {
    expect(
      appearanceStep({ ...base, preference: 'system', chosen: 'light', current: 'dark' }),
    ).toEqual({ preference: 'light', chosen: 'light' });
    expect(appearanceStep({ ...base, preference: 'system', current: 'light' })).toEqual({
      preference: 'light',
    });
  });

  test('changes nothing when the preference already agrees', () => {
    expect(appearanceStep({ ...base, on: true, preference: 'system' })).toBeNull();
    expect(appearanceStep({ ...base, on: false, preference: 'light' })).toBeNull();
  });

  test('the first run leaves the preference alone when the settings were not read', () => {
    // localStorage holds `system`, but the table couldn't be read, so matchSystem is only the default.
    expect(
      appearanceStep({ ...base, preference: 'system', initial: true, read: false }),
    ).toBeNull();
  });

  test('the first run follows the settings once they were read', () => {
    expect(appearanceStep({ ...base, preference: 'system', initial: true, read: true })).toEqual({
      preference: 'dark',
    });
  });

  test('a change after the first run acts even when the table could not be read', () => {
    expect(appearanceStep({ ...base, on: true, initial: false, read: false })).toEqual({
      preference: 'system',
      chosen: 'dark',
    });
  });
});

describe('freshVisitMatchesSystem', () => {
  /** What a light system shows when the color mode's preference is `preference`. */
  const shows = (preference: string) => (preference === 'system' ? 'light' : preference);

  test('a fresh visit on a light system opens light', () => {
    // Nothing stored: the color mode starts at the default dark, and the setting is off.
    const turnOn = freshVisitMatchesSystem({
      firstVisit: true,
      themeStored: false,
      matchSystem: false,
    });
    expect(turnOn).toBe(true);
    const step = appearanceStep({ ...base, on: turnOn });
    expect(step).toEqual({ preference: 'system', chosen: 'dark' });
    expect(shows(step?.preference ?? 'dark')).toBe('light');
  });

  test("a returning visitor's theme is untouched", () => {
    // They have scripts, so it isn't a first visit, whatever is stored.
    expect(
      freshVisitMatchesSystem({ firstVisit: false, themeStored: false, matchSystem: false }),
    ).toBe(false);
    expect(
      freshVisitMatchesSystem({ firstVisit: false, themeStored: true, matchSystem: false }),
    ).toBe(false);
  });

  test('a theme chosen in this browser wins, even with no scripts yet', () => {
    expect(
      freshVisitMatchesSystem({ firstVisit: true, themeStored: true, matchSystem: false }),
    ).toBe(false);
  });

  test('changes nothing when the setting is on already', () => {
    expect(
      freshVisitMatchesSystem({ firstVisit: true, themeStored: false, matchSystem: true }),
    ).toBe(false);
  });
});
