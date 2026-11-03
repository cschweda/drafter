import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vitest';
import { PLAUSIBLE_INIT, PLAUSIBLE_SRC } from '../scripts/plausible.mjs';

// drafter.dev's Plausible snippet, run as a page runs it: whatever follows `?` or `#` never goes
// to plausible.io, so Report a problem's Open on GitHub (whose address holds what the writer
// typed) is counted as a click on github.com and nothing more (privacy audit, 2026-11-03).

interface Event {
  n: string;
  u: string;
  r: string | null;
  p?: Record<string, unknown>;
}

/** The transform the snippet hands Plausible, as the page would get it. */
function transform(): (event: Event) => Event {
  // A page's global is its `window`, so a bare `plausible` is `window.plausible`.
  const window: Record<string, unknown> = {};
  window.window = window;
  runInNewContext(PLAUSIBLE_INIT, window, { timeout: 1000 });
  const plausible = window.plausible as { o: { transformRequest: (event: Event) => Event } };
  return plausible.o.transformRequest;
}

describe("drafter.dev's Plausible snippet", () => {
  test('loads the site’s own script from plausible.io', () => {
    expect(PLAUSIBLE_SRC).toMatch(/^https:\/\/plausible\.io\/js\/pa-[\w-]+\.js$/);
  });

  test('an outside link’s address goes without its query: what a report says stays out', () => {
    const report =
      'https://github.com/cschweda/drafter/issues/new?template=bug.yml&title=My%20script&what-happened=INT.%20SECRET%20ROOM';
    const sent = transform()({
      n: 'Outbound Link: Click',
      u: 'https://drafter.dev/',
      r: null,
      p: { url: report },
    });
    expect(sent.p).toEqual({ url: 'https://github.com/cschweda/drafter/issues/new' });
    expect(JSON.stringify(sent)).not.toContain('SECRET');
    expect(JSON.stringify(sent)).not.toContain('title=');
  });

  test('a page’s address and the referrer lose their query and fragment', () => {
    const sent = transform()({
      n: 'pageview',
      u: 'https://drafter.dev/docs/privacy/?q=1#analytics',
      r: 'https://example.com/search?q=my+script',
    });
    expect(sent.u).toBe('https://drafter.dev/docs/privacy/');
    expect(sent.r).toBe('https://example.com/search');
  });

  test('leaves what isn’t text alone, and keeps the event', () => {
    const sent = transform()({
      n: 'engagement',
      u: 'https://drafter.dev/',
      r: null,
      p: { depth: 40 },
    });
    expect(sent).toEqual({ n: 'engagement', u: 'https://drafter.dev/', r: null, p: { depth: 40 } });
  });
});
