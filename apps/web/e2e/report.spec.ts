import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

// Help → Report a problem… and Suggest an idea… (docs/DECISIONS.md, Report a problem): a dialog
// that fills in GitHub's new-issue page, which the writer submits there. Nothing is sent by Drafter;
// GitHub is never really visited here (every request to it is answered by the test).

const VERSION = (
  JSON.parse(readFileSync(new URL('../../desktop/package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

const editor = (page: Page) => page.locator('.cm-content');
const helpButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Help' });
const helpMenu = (page: Page) => page.getByRole('menu', { name: 'Help' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const report = (page: Page) => page.locator('dialog[data-report]');
const field = (page: Page, name: string) => report(page).getByRole('textbox', { name });

async function start(page: Page) {
  // GitHub is never reached: a popup that goes there gets a page of the test's own.
  await page
    .context()
    .route(/^https:\/\/github\.com\//, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>GitHub</title>' }),
    );
  await page.goto('/');
  await expect(editor(page)).toContainText('INT. KITCHEN - NIGHT');
}

async function runCommand(page: Page, title: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeVisible();
  await page.keyboard.type(title);
  await palette(page).getByRole('option', { name: title }).first().click();
}

async function fillProblem(page: Page) {
  await field(page, 'Title').fill('Export & print #2');
  await field(page, 'What happened').fill('I chose Export.\nNothing came.');
  await field(page, 'What you expected').fill('A PDF — “quoted” 🎬');
}

test.describe('Report a problem', () => {
  test('opens from Help, and says what it needs and what it never sends', async ({ page }) => {
    await start(page);
    await helpButton(page).click();
    await expect(helpMenu(page)).toBeVisible();
    await page.getByRole('menuitem', { name: /^Report a problem…/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Report a problem' });
    await expect(dialog).toBeVisible();
    await expect(field(page, 'Title')).toBeFocused();
    await expect(
      dialog.getByRole('group', { name: 'Kind' }).getByRole('button', { name: 'Problem' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('checkbox', { name: 'Include version info' })).toBeChecked();
    await expect(dialog).toContainText(
      'Your script is never included. You’ll finish on GitHub, which needs a free GitHub account.',
    );
    // Security goes to SECURITY.md's private route, never a public issue.
    const security = dialog.getByRole('link', { name: 'use the private report instead' });
    await expect(security).toHaveAttribute(
      'href',
      'https://github.com/cschweda/drafter/blob/main/SECURITY.md#reporting-a-problem',
    );
    await expect(security).toHaveAttribute('target', '_blank');
    await expect(dialog).toContainText('or email cschweda@gmail.com with the details');
    // The email, for a writer with no GitHub account.
    await expect(dialog.locator('[data-report-email]')).toHaveText('cschweda@gmail.com');
    await expect(dialog).toContainText('No GitHub account? Email cschweda@gmail.com.');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('opens from the palette, as a problem or an idea', async ({ page }) => {
    await start(page);
    await runCommand(page, 'Suggest an idea…');
    const idea = page.getByRole('dialog', { name: 'Suggest an idea' });
    await expect(idea).toBeVisible();
    await expect(idea.getByRole('textbox', { name: 'What you’d like' })).toBeVisible();
    await expect(idea.getByRole('textbox', { name: 'What happened' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await runCommand(page, 'Report a problem…');
    await expect(page.getByRole('dialog', { name: 'Report a problem' })).toBeVisible();
  });

  test('previews exactly what the link carries, and Open on GitHub opens it in a new tab', async ({
    page,
  }) => {
    await start(page);
    await runCommand(page, 'Report a problem…');
    await fillProblem(page);
    const preview = report(page).locator('[data-report-preview] pre');
    await expect(preview).toContainText('Title: Export & print #2');
    await expect(preview).toContainText('### What happened\n\nI chose Export.\nNothing came.');
    await expect(preview).toContainText('### What you expected\n\nA PDF — “quoted” 🎬');
    await expect(preview).toContainText(`### Version info\n\nDrafter v${VERSION}`);
    await expect(preview).toContainText('App: web app (drafter.dev)');
    // Nothing of the script: not its text, nor its title.
    await expect(preview).not.toContainText('KITCHEN');

    const open = report(page).getByRole('link', { name: 'Open on GitHub' });
    await expect(open).toHaveAttribute('target', '_blank');
    await expect(open).toHaveAttribute('rel', /noopener/);
    const popup = page.waitForEvent('popup');
    await open.click();
    const tab = await popup;
    const url = new URL(tab.url());
    expect(`${url.origin}${url.pathname}`).toBe('https://github.com/cschweda/drafter/issues/new');
    const p = url.searchParams;
    expect(p.get('template')).toBe('bug.yml');
    expect(p.get('labels')).toBe('bug');
    expect(p.get('title')).toBe('Export & print #2');
    expect(p.get('what-happened')).toBe('I chose Export.\nNothing came.');
    expect(p.get('expected')).toBe('A PDF — “quoted” 🎬');
    expect(p.get('version')).toContain(`Drafter v${VERSION}`);
    // The preview is those fields, under their headings.
    const shown = await preview.textContent();
    expect(shown).toBe(
      [
        `Title: ${p.get('title')}`,
        `### What happened\n\n${p.get('what-happened')}`,
        `### What you expected\n\n${p.get('expected')}`,
        `### Version info\n\n${p.get('version')}`,
      ].join('\n\n'),
    );
    await tab.close();
  });

  test('leaves the version info out when it is turned off', async ({ page }) => {
    await start(page);
    await runCommand(page, 'Report a problem…');
    await field(page, 'Title').fill('No version');
    await report(page).getByRole('checkbox', { name: 'Include version info' }).uncheck();
    await expect(report(page).locator('[data-report-preview]')).not.toContainText('Version info');
    const href = await report(page)
      .getByRole('link', { name: 'Open on GitHub' })
      .getAttribute('href');
    expect(new URL(href as string).searchParams.has('version')).toBe(false);
  });

  test('trims a long report to fit the link, says so, and Copy has all of it', async ({
    page,
    context,
    browserName,
  }) => {
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }
    await start(page);
    await runCommand(page, 'Report a problem…');
    await field(page, 'Title').fill('Long');
    const long = 'Every word & every # here. '.repeat(600);
    await field(page, 'What happened').fill(long);
    await expect(report(page).locator('[data-report-trimmed]')).toContainText(
      'Paste the rest on GitHub',
    );
    const href = await report(page)
      .getByRole('link', { name: 'Open on GitHub' })
      .getAttribute('href');
    expect((href as string).length).toBeLessThanOrEqual(7500);
    expect(new URL(href as string).searchParams.get('what-happened')).toMatch(
      /Paste the rest here\.\]$/,
    );
    await report(page).getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(report(page).locator('[data-report-copied]')).toHaveText('Copied all of it.');
    if (browserName === 'chromium') {
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied).toContain(long.trim());
      expect(copied.startsWith('Title: Long\n\n### What happened')).toBe(true);
    }
  });

  test('offers an email to the maintainer, with the title and the preview', async ({ page }) => {
    await start(page);
    await runCommand(page, 'Report a problem…');
    await fillProblem(page);
    const mail = report(page).getByRole('link', { name: 'Write an email' });
    const href = new URL((await mail.getAttribute('href')) as string);
    expect(href.protocol).toBe('mailto:');
    expect(href.pathname).toBe('cschweda@gmail.com');
    expect(href.searchParams.get('subject')).toBe('Drafter: Export & print #2');
    expect(href.searchParams.get('body')).toContain(
      'What happened:\nI chose Export.\nNothing came.',
    );
    await expect(report(page).getByRole('button', { name: 'Copy address' })).toBeVisible();
  });

  test('says when it is offline, and keeps what was typed for the visit', async ({
    page,
    context,
  }) => {
    await start(page);
    await runCommand(page, 'Report a problem…');
    await field(page, 'Title').fill('Typed offline');
    await context.setOffline(true);
    await expect(report(page).locator('[data-report-offline]')).toHaveText(
      'You’re offline. Copy this and file it when you’re back online.',
    );
    await page.keyboard.press('Escape');
    await expect(report(page)).toBeHidden();
    await runCommand(page, 'Report a problem…');
    await expect(field(page, 'Title')).toHaveValue('Typed offline');
    await expect(report(page).locator('[data-report-offline]')).toBeVisible();
    await context.setOffline(false);
    await expect(report(page).locator('[data-report-offline]')).toBeHidden();
  });

  test('About has the contact line and opens it', async ({ page }) => {
    await start(page);
    await runCommand(page, 'About Drafter');
    const about = page.getByRole('dialog', { name: 'Drafter', exact: true });
    await expect(about.locator('[data-about-contact]')).toHaveText('Contact: cschweda@gmail.com');
    await expect(about.getByRole('link', { name: 'cschweda@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:cschweda@gmail.com',
    );
    await about.getByRole('button', { name: 'Suggest an idea…' }).click();
    await expect(about).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Suggest an idea' })).toBeVisible();
  });

  test('fits a phone, with nothing scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await start(page);
    await runCommand(page, 'Report a problem…');
    await fillProblem(page);
    const dialog = report(page);
    await expect(dialog).toBeVisible();
    const sideways = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(sideways).toBeLessThanOrEqual(0);
    const box = await dialog.boundingBox();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    await dialog.getByRole('link', { name: 'Open on GitHub' }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('link', { name: 'Open on GitHub' })).toBeInViewport();
  });
});
