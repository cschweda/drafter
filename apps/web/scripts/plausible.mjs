// drafter.dev's Plausible snippet (nuxt.config.ts adds it to the site's own build only), on every
// page, the app's included: the maintainer wants "the basic traffic and what people are looking at"
// (2026-11-03). So only page views and time on a page are sent. The privacy audit of 2026-11-03
// found that Plausible's script for the site also counts clicks on outside links, sending each
// link's whole address, and Report a problem's Open on GitHub is a link whose address holds
// everything the writer typed. Those events, downloads, and form submissions are dropped here, and
// what is sent is cut down too: whatever follows `?` or `#` is dropped from the page's address, the
// referrer, and every property. test/plausible.test.ts runs PLAUSIBLE_INIT as the browser would.

export const PLAUSIBLE_SRC = 'https://plausible.io/js/pa--lKXZsV2-N7mag-Pl4BV9.js';

/**
 * Lets only a page view or time on a page through (a falsy return stops the event), with what
 * follows `?` or `#` dropped from every string in it.
 */
const STRIP =
  'function(r){if(r.n!=="pageview"&&r.n!=="engagement")return null;var s=function(v){return typeof v=="string"?v.split(/[?#]/)[0]:v};r.u=s(r.u);r.r=s(r.r);if(r.p)for(var k in r.p)r.p[k]=s(r.p[k]);return r}';

/** Plausible's own queue stub, then its start, with the filter every event goes through. */
export const PLAUSIBLE_INIT = `window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init({transformRequest:${STRIP}})`;
