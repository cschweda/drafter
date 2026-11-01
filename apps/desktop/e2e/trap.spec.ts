import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { type Outcome, TRAPS, type Trap } from '../../../fixtures/trap/traps';
import { editor, expect, type Profile, test } from './helpers';

// The trap documents (fixtures/trap) through the desktop app's own way in: named on the command
// line, so the main process sorts the arguments, grants the file by where it leads, and reads it
// before the page opens it. A few of each kind: a hostile script and page, a bomb, a file that
// isn't text, and the special files only a desktop meets (a pipe, a link to /etc/passwd). Nothing
// may run in the page: the flag a payload would set (`window.__trapped`) stays unset.

const IDS = [
  'fountain-action-html',
  'md-raw-html',
  'html-hostile-page',
  'epub-scripts',
  'highland-bomb',
  'fdx-xxe-file',
  'fountain-pdf',
  'files-passwd-link',
  'files-dev-zero',
  'files-fifo',
  'files-directory',
];
const posix = process.platform !== 'win32';

const statusAlert = (page: Page) => page.locator('[role="alert"].failed');

/** The trap's file, in its own folder under the profile's home; the path to name. */
function place(profile: Profile, trap: Trap): string {
  const dir = join(profile.home, 'Traps', trap.id);
  mkdirSync(dir, { recursive: true });
  if (trap.place) return trap.place(dir);
  const path = join(dir, trap.name);
  writeFileSync(path, trap.bytes?.() ?? new Uint8Array());
  return path;
}

for (const id of IDS) {
  const trap = TRAPS.find((t) => t.id === id) as Trap;
  test(`${trap.id}: ${trap.tests}`, async ({ desktop, profile }) => {
    test.skip(!!trap.place && !posix, 'a special file of POSIX’s');
    const path = place(profile, trap);
    const { page } = await desktop({ args: [path] });
    const outcome = trap.expect['desktop-open'] as Outcome;
    if (outcome.kind === 'refused') {
      await expect(statusAlert(page)).toContainText(outcome.says);
      await expect(editor(page)).not.toContainText('root:');
    } else {
      const lines = (outcome.lines ?? outcome.text?.split('\n') ?? []).filter(
        (line) => line.trim() !== '' && line.length < 80,
      );
      for (const line of lines.slice(0, 3)) await expect(editor(page)).toContainText(line);
    }
    // Long enough for a payload that was going to run to have run.
    await page.waitForTimeout(300);
    expect(
      await page.evaluate(() => (window as { __trapped?: unknown }).__trapped),
    ).toBeUndefined();
  });
}
