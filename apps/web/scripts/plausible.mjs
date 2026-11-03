// drafter.dev's Plausible snippet (nuxt.config.ts adds it to the site's own build only). The
// privacy audit of 2026-11-03 found that Plausible's script for the site counts clicks on outside
// links and sends each link's whole address, and Report a problem's Open on GitHub is a link whose
// address holds everything the writer typed. So every event is cut down before it is sent:
// whatever follows `?` or `#` is dropped from the page's address, the referrer, and every property
// (an outside link's address among them). The page and the site are still counted; nothing a
// writer typed can go. test/plausible.test.ts runs PLAUSIBLE_INIT as the browser would.

export const PLAUSIBLE_SRC = 'https://plausible.io/js/pa--lKXZsV2-N7mag-Pl4BV9.js';

/** Drops what follows `?` or `#` from every string in an event Plausible is about to send. */
const STRIP =
  'function(r){var s=function(v){return typeof v=="string"?v.split(/[?#]/)[0]:v};r.u=s(r.u);r.r=s(r.r);if(r.p)for(var k in r.p)r.p[k]=s(r.p[k]);return r}';

/** Plausible's own queue stub, then its start, with the cut-down every event goes through. */
export const PLAUSIBLE_INIT = `window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init({transformRequest:${STRIP}})`;
