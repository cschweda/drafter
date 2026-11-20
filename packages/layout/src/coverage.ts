/**
 * The characters Courier Prime can draw: the code points all four faces (regular, bold, italic,
 * bold italic) have a shape for, as pairs of first and last, in order. A script page is set in
 * Courier Prime alone, so any other character prints as an empty box in the PDF.
 *
 * Read from the font files in `packages/render-pdf/fonts`; that package's
 * `coverage.test.ts` fails, and prints the new list, if the fonts and this ever disagree.
 */
export const COURIER_PRIME_RANGES: readonly number[] = [
  13, 13, 32, 126, 160, 311, 313, 328, 330, 382, 402, 402, 536, 539, 567, 567, 710, 711, 728, 733,
  806, 806, 916, 916, 937, 937, 956, 956, 960, 960, 7808, 7813, 7922, 7923, 8209, 8209, 8211, 8212,
  8216, 8218, 8220, 8222, 8224, 8226, 8230, 8230, 8240, 8240, 8242, 8243, 8249, 8250, 8260, 8260,
  8308, 8308, 8355, 8355, 8361, 8361, 8364, 8364, 8482, 8482, 8706, 8706, 8719, 8719, 8721, 8722,
  8725, 8725, 8730, 8730, 8734, 8734, 8747, 8747, 8776, 8776, 8800, 8800, 8804, 8805, 9674, 9674,
  64257, 64258, 65535, 65535,
];

/** Whether the script font has a shape for the code point. */
export function courierPrimeHas(codePoint: number): boolean {
  let lo = 0;
  let hi = COURIER_PRIME_RANGES.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (codePoint < (COURIER_PRIME_RANGES[mid * 2] as number)) hi = mid - 1;
    else if (codePoint > (COURIER_PRIME_RANGES[mid * 2 + 1] as number)) lo = mid + 1;
    else return true;
  }
  return false;
}
