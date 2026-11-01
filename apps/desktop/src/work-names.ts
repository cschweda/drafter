// The work's name as a file or folder name, exactly as `@drafter/history`'s `cleanWorkName` makes
// it (packages/history/src/draft-file.ts), so the main process names a script's drafts and cuts
// as the page does (beside.ts `besideNames`). A copy, since the main process bundles no package;
// test/beside.test.ts checks the two agree.

/** The longest work name in a file name, in UTF-16 units. */
const MAX_WORK_NAME = 120;

/**
 * Every \ / : * ? " < > | and control character becomes `_`, leading dots and spaces and trailing
 * dots and spaces go, and it is cut to 120 units without splitting a character. A name with `..`
 * in it, or with nothing left, is a RangeError.
 */
export function cleanWorkName(work: string): string {
  if (work.includes('..')) throw new RangeError('A work’s name can’t hold "..".');
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it removes
  let name = work.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_');
  name = name.replace(/^[. ]+/, '');
  if (name.length > MAX_WORK_NAME) {
    const high = name.charCodeAt(MAX_WORK_NAME - 1);
    name = name.slice(0, high >= 0xd800 && high <= 0xdbff ? MAX_WORK_NAME - 1 : MAX_WORK_NAME);
  }
  let end = name.length;
  while (end > 0 && (name[end - 1] === '.' || name[end - 1] === ' ')) end--;
  name = name.slice(0, end);
  if (name === '') throw new RangeError('A work’s name has nothing a file name can hold.');
  return name;
}
