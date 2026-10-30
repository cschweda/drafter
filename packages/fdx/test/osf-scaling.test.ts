import { describe, expect, it } from 'vitest';
import { fromOsf } from '../src';
import { BUILTIN_STYLES, osf } from './osf-fixtures';
import { HANG_MS, MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

// Linear time, as `fromFdx on a large file` holds it (scaling.ts): n against 4n, growth under 8.

/** A document of about `chars` characters of paragraphs, each `unit`. */
const paragraphs =
  (unit: string, styles = BUILTIN_STYLES) =>
  (chars: number) =>
    osf(unit.repeat(Math.max(1, Math.floor(chars / unit.length))), { styles });

const time = (run: () => unknown) => {
  const start = performance.now();
  run();
  return performance.now() - start;
};

/** The best of a few runs, after a warm-up. */
const best = (run: () => unknown, tries = 5) => {
  run();
  let fastest = Number.POSITIVE_INFINITY;
  for (let k = 0; k < tries; k++) fastest = Math.min(fastest, time(run));
  return fastest;
};

describe('fromOsf on a large file', () => {
  it(
    'fromOsf grows linearly',
    () => {
      const make = paragraphs(
        '<para><style basestyle="Character"/><text>Wren</text></para>' +
          '<para><style basestyle="Dialogue"/><text bold="1">Row</text><text> faster.</text></para>' +
          '<para><style basestyle="Action"/><text>The oars dip.</text></para>',
      );
      const { growth, large } = scaling(make, fromOsf, 1_000_000, 3);
      expect(growth).toBeLessThan(MAX_GROWTH);
      expect(large).toBeLessThan(HANG_MS);
    },
    SCALING_TIMEOUT,
  );

  it(
    'reads 5 MB of unclosed [[ in one paragraph within 3 seconds',
    () => {
      const xml = osf(
        `<para><style basestyle="Action"/><text>${'[['.repeat(2_490_000)}</text></para>`,
      );
      expect(time(() => fromOsf(xml))).toBeLessThan(3000);
    },
    SCALING_TIMEOUT,
  );

  it(
    'one style referenced by 100,000 paragraphs costs no more than plain paragraphs',
    () => {
      // Every paragraph names a style four links from Action, against the same paragraphs naming
      // Action in a file with no styles: a lookup each, never a copy of the style. Both names are
      // six letters, so the files are the same size, under the 5 MB limit.
      const styles = `${BUILTIN_STYLES}<style name="L1" basestyle="Action"/><style name="L2" basestyle="L1"/><style name="L3" basestyle="L2"/><style name="Ripple" basestyle="L3" allcaps="1"/>`;
      const styled = osf('<para><style basestyle="Ripple"/>Waves.</para>'.repeat(100_000), {
        styles,
      });
      const plain = osf('<para><style basestyle="Action"/>Waves.</para>'.repeat(100_000), {
        styles: '',
      });
      const withStyles = best(() => fromOsf(styled), 3);
      const without = best(() => fromOsf(plain), 3);
      expect(withStyles).toBeLessThan(2 * without);
    },
    SCALING_TIMEOUT,
  );

  it(
    'a 5 MB file of 1,000-deep style chains stays within 3 seconds',
    () => {
      // Many chains of 1,000 styles, each named by paragraphs at its far end: only 8 links are ever
      // followed.
      const chains: string[] = [];
      const paras: string[] = [];
      let size = 0;
      for (let c = 0; size < 4_800_000; c++) {
        for (let k = 0; k < 1000; k++) {
          const style = `<style name="c${c}s${k}" basestyle="c${c}s${k + 1}"/>`;
          chains.push(style);
          size += style.length;
        }
        for (let k = 0; k < 100; k++) {
          const p = `<para><style basestyle="c${c}s0"/><text>x</text></para>`;
          paras.push(p);
          size += p.length;
        }
      }
      const xml = osf(paras.join(''), { styles: chains.join('') });
      expect(xml.length).toBeGreaterThan(4_800_000);
      expect(xml.length).toBeLessThan(5 * 1024 * 1024);
      expect(time(() => fromOsf(xml))).toBeLessThan(3000);
    },
    SCALING_TIMEOUT,
  );
});
