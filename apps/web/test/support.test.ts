import { describe, expect, test } from 'vitest';
import { SUPPORT_LINKS, supportRoutes } from '../app/about/support';

describe('supportRoutes', () => {
  test('gives both routes for a Ko-fi page and a GitHub Sponsors page', () => {
    expect(
      supportRoutes({
        kofi: 'https://ko-fi.com/someone',
        github: 'https://github.com/sponsors/someone',
      }),
    ).toEqual({ tip: 'https://ko-fi.com/someone', sponsor: 'https://github.com/sponsors/someone' });
  });
  test('gives no sponsor route when only Ko-fi is set', () => {
    expect(supportRoutes({ kofi: 'https://ko-fi.com/someone' })).toEqual({
      tip: 'https://ko-fi.com/someone',
    });
  });
  test('gives nothing when only GitHub is set: Ko-fi is the route that needs no account', () => {
    expect(supportRoutes({ github: 'https://github.com/sponsors/someone' })).toEqual({});
  });
  test('gives nothing when neither is set', () => {
    expect(supportRoutes({})).toEqual({});
  });
  test.each([
    'http://ko-fi.com/someone',
    'https://ko-fi.com/',
    'https://ko-fi.com/someone?ref=drafter',
    'https://ko-fi.com/someone#tip',
    'https://ko-fi.com.example.org/someone',
    'https://example.org/ko-fi.com/someone',
    'javascript:alert(1)',
    '',
  ])('takes %s for no Ko-fi page', (kofi) => {
    expect(supportRoutes({ kofi })).toEqual({});
  });
  test.each([
    'https://github.com/someone',
    'https://github.com/sponsors/',
    'https://github.com/sponsors/someone?o=esb',
    'http://github.com/sponsors/someone',
  ])('takes %s for no Sponsors page', (github) => {
    expect(supportRoutes({ kofi: 'https://ko-fi.com/someone', github })).toEqual({
      tip: 'https://ko-fi.com/someone',
    });
  });
  test('the addresses in the build are valid or unset, never half-right', () => {
    const routes = supportRoutes(SUPPORT_LINKS);
    expect(routes.tip).toBe(SUPPORT_LINKS.kofi);
    if (routes.tip) expect(routes.sponsor).toBe(SUPPORT_LINKS.github);
  });
});
