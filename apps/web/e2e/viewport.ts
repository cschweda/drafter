import type { Page } from '@playwright/test';

/**
 * A phone narrower than 375px widened to 375px, where a script's top bar still has Save and
 * Export beside the writing mode's switch. At 320px (the phone-webkit project's iPhone SE) they
 * fold into More actions, which phone.spec.ts, bottom-bar.spec.ts, and a11y.spec.ts try; tests of
 * saving and exporting themselves call this first, before the page loads.
 */
export async function roomForSaveAndExport(page: Page): Promise<void> {
  const size = page.viewportSize();
  if (size && size.width < 375) await page.setViewportSize({ width: 375, height: size.height });
}
