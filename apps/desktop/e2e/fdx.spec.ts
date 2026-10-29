import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { answerDialogs, dialogsAsked, editor, expect, type Profile, stored, test } from './helpers';

// Final Draft files in the desktop app (Phase 2 Plan FD): a .fdx named on the command line is
// imported as a new script that is not the file's (Save asks for a .fountain, and the .fdx is
// never written), and Export as Final Draft writes one through the Save dialog.

const LAMP = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <Paragraph Type="Scene Heading"><Text>EXT. LIGHTHOUSE - NIGHT</Text></Paragraph>
    <Paragraph Type="Action"><Text>The lamp turns.</Text></Paragraph>
    <Paragraph Type="Character"><Text>THEO</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>Keep it lit.</Text></Paragraph>
  </Content>
  <TitlePage>
    <Content>
      <Paragraph Alignment="Center" Type="Action"><Text>The Last Lamp</Text></Paragraph>
    </Content>
  </TitlePage>
</FinalDraft>
`;

function folder(profile: Profile): string {
  const path = join(profile.home, 'Scripts');
  mkdirSync(path, { recursive: true });
  return path;
}

const toast = (page: Page) => page.locator('.toast [role="status"]');

test('imports a Final Draft file named on the command line as a new script', async ({
  desktop,
  profile,
}) => {
  const scripts = folder(profile);
  const fdx = join(scripts, 'The Lamp.fdx');
  writeFileSync(fdx, LAMP);
  const { page } = await desktop({ args: [fdx] });
  await expect(editor(page)).toContainText('EXT. LIGHTHOUSE - NIGHT');
  await expect(editor(page)).toContainText('Keep it lit.');
  await expect(toast(page)).toHaveText('Imported “The Lamp.fdx”.');
  // No "opened as a new script" notice: the import has said what happened.
  await expect(page.locator('[role="alert"].failed')).toHaveCount(0);
  await expect
    .poll(async () => (await stored(page)).map((row) => row.title))
    .toContain('The Last Lamp');

  // Save asks for a .fountain named after the title, and the .fdx is left as it was.
  const saved = join(scripts, 'The Last Lamp.fountain');
  answerDialogs(profile, [saved]);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => existsSync(saved)).toBe(true);
  expect(readFileSync(saved, 'utf8')).toContain('EXT. LIGHTHOUSE - NIGHT');
  const asked = dialogsAsked(profile);
  expect(asked).toHaveLength(1);
  expect(asked[0]).toMatchObject({ kind: 'save', extension: '.fountain' });
  expect(asked[0]?.defaultPath).toMatch(/The Last Lamp\.fountain$/);
  expect(readFileSync(fdx, 'utf8')).toBe(LAMP);
});

test('exports a script as a Final Draft file through the Save dialog', async ({
  desktop,
  profile,
}) => {
  const scripts = folder(profile);
  const { page } = await desktop();
  await expect(editor(page)).toContainText('The Call');
  const target = join(scripts, 'The Call.fdx');
  answerDialogs(profile, [target]);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page
    .getByRole('group', { name: 'Export' })
    .getByRole('button', { name: 'Final Draft (.fdx)' })
    .click();
  await expect(toast(page)).toHaveText('Exported The Call.fdx.');
  const xml = readFileSync(target, 'utf8');
  expect(xml).toContain('<FinalDraft');
  expect(xml).toContain('<Paragraph Type="Scene Heading">');
  expect(dialogsAsked(profile)[0]).toMatchObject({ kind: 'save', extension: '.fdx' });
});
