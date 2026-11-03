import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vitest';
import { PLAUSIBLE_INIT, PLAUSIBLE_SRC } from '../scripts/plausible.mjs';

// drafter.dev's Plausible snippet, run as a page runs it: only page views and time on a page go to
// plausible.io, each without whatever follows `?` or `#`. A click on an outside link (Report a
// problem's Open on GitHub, whose address holds what the writer typed), a download, or a form is
// never sent (privacy audit, 2026-11-03; the maintainer: "the basic traffic and what people are
// looking at").

interface Event {
  n: string;
  u: string;
  r: string | null;
  p?: Record<string, unknown>;
}

/** The transform the snippet hands Plausible, as the page would get it. */
function transform(): (event: Event) => Event | null {
  // A page's global is its `window`, so a bare `plausible` is `window.plausible`.
  const window: Record<string, unknown> = {};
  window.window = window;
  runInNewContext(PLAUSIBLE_INIT, window, { timeout: 1000 });
  const plausible = window.plausible as {
    o: { transformRequest: (event: Event) => Event | null };
  };
  return plausible.o.transformRequest;
}

describe("drafter.dev's Plausible snippet", () => {
  test('loads the site’s own script from plausible.io', () => {
    expect(PLAUSIBLE_SRC).toMatch(/^https:\/\/plausible\.io\/js\/pa-[\w-]+\.js$/);
  });

  test('a click on an outside link is never sent: what a report says stays out', () => {
    const report =
      'https://github.com/cschweda/drafter/issues/new?template=bug.yml&title=My%20script&what-happened=INT.%20SECRET%20ROOM';
    expect(
      transform()({
        n: 'Outbound Link: Click',
        u: 'https://drafter.dev/',
        r: null,
        p: { url: report },
      }),
    ).toBeNull();
  });

  test('nor a download, a form, or any event but a page view or time on a page', () => {
    const send = transform();
    for (const n of ['File Download', 'Form: Submission', 'Signup', '404'])
      expect(
        send({ n, u: 'https://drafter.dev/', r: null, p: { url: 'https://x.test/?a' } }),
        n,
      ).toBeNull();
  });

  test('a page’s address and the referrer lose their query and fragment', () => {
    const sent = transform()({
      n: 'pageview',
      u: 'https://drafter.dev/docs/privacy/?q=1#analytics',
      r: 'https://example.com/search?q=my+script',
    });
    expect(sent?.u).toBe('https://drafter.dev/docs/privacy/');
    expect(sent?.r).toBe('https://example.com/search');
  });

  test('a page’s time on the page goes too, and what isn’t text is left alone', () => {
    const sent = transform()({
      n: 'engagement',
      u: 'https://drafter.dev/',
      r: null,
      p: { depth: 40 },
    });
    expect(sent).toEqual({ n: 'engagement', u: 'https://drafter.dev/', r: null, p: { depth: 40 } });
  });
});
