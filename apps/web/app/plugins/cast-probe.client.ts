// A test build's hook into the cast session for the browser tests (cast/probe.ts). The flag is a
// constant the build replaces, so without `DRAFTER_TEST_MODULES=1` this does nothing and the probe
// is left out of the bundle.
declare const __DRAFTER_TEST_MODULES__: boolean | undefined;

export default defineNuxtPlugin(() => {
  if (typeof __DRAFTER_TEST_MODULES__ !== 'undefined' && __DRAFTER_TEST_MODULES__)
    void import('~/cast/probe').then(({ installCastProbe }) => installCastProbe());
});
