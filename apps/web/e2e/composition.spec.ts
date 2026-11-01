import { expect, test } from '@playwright/test';
import { editor, setText, start } from './modules';

// A whole script replaced in one go (select all, then text typed as one composition, as Firefox
// does with an input method): the editor first takes the old text away, which changes the
// template the text names; the lint started again for the new template must wait until the
// composition ends, or its redraw would take the composed text with it (Task 4's open item).
const STAGE_PLAY =
  '# ACT ONE\n\n## Scene 1\n\nMargaret waits.\n\nMARGARET\n(quietly)\nHello?\n\n/* drafter\n{ "v": 1, "template": "stage-play-standard" }\n*/';

test.beforeEach(async ({ page }) => {
  await start(page);
});

test('a stage play set over a stage play keeps its text', async ({ page }) => {
  await setText(page, STAGE_PLAY);
  await expect(editor(page)).toContainText('Margaret waits.');
  await setText(page, STAGE_PLAY.replace('waits.', 'waits, again.'));
  await expect(editor(page)).toContainText('Margaret waits, again.');
  await setText(page, STAGE_PLAY);
  await expect(editor(page)).toContainText('Margaret waits.');
});

test('after a change of window size too', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'a phone keeps its size');
  await setText(page, STAGE_PLAY);
  for (const width of [1280, 1440, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    await setText(page, STAGE_PLAY);
    await expect(editor(page), `at ${width}px`).toContainText('Margaret waits.');
  }
});
