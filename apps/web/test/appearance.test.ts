import { describe, expect, test } from 'vitest';
import { appearanceStep } from '../app/settings/appearance';

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
