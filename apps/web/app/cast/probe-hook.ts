// A test build's hook into the cast session for the browser tests (cast/probe.ts). The flag is a
// constant the build replaces, so without `DRAFTER_TEST_MODULES=1` this does nothing and the probe
// is left out of the bundle.
//
// The page calls it, not a plugin. A plugin is in the app's first script, and the shell tells the
// browser to fetch early everything that script may import, with the files those import: the
// probe imports the cast session, which shares a chunk with the editor and the Markdown worker,
// so a plugin put the Markdown worker among the shell's prefetches (Firefox fetched it on a
// Fountain script). From the page, the probe is a chunk of its own the shell doesn't name.
declare const __DRAFTER_TEST_MODULES__: boolean | undefined;

export function installTestCastProbe(): void {
  if (typeof __DRAFTER_TEST_MODULES__ !== 'undefined' && __DRAFTER_TEST_MODULES__)
    void import('./probe').then(({ installCastProbe }) => installCastProbe());
}
