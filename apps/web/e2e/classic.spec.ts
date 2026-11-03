import { expect, type Page, test } from '@playwright/test';
import {
  closeSettings,
  editor,
  openSettings,
  pressToolbarButton,
  runCommand,
  settingsDialog,
  showSource,
  start,
  wholeText,
} from './modules';

// Classic Mode in the browser (Classic Mode design §15.4), in every project: the agreed flow key by
// key, the switch at every width, the ways out of the text, autofill typed with no wait, the
// metadata block, and the left pane with the app's own CSS. The words of each test are the spec's.
// Signal Hill's people (JUNE, DALE) and places are the sample's.

const SCRIPT = 'INT. DINER - DAY\n\nThe lights hum.';
const NAMED = 'INT. DINER - DAY\n\nJUNE\nStill open?\n\nJOANNA\nAlways.\n\nThe lights hum.';
const switchKey = 'ControlOrMeta+Alt+Digit0';

const isPhone = (name: string) => name.startsWith('phone');
const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
const group = (page: Page) => page.getByRole('group', { name: 'Writing mode' });
const one = (page: Page, now: string) =>
  page.getByRole('button', { name: new RegExp(`^Writing mode: ${now}\\.`) });
const anySwitch = (page: Page) =>
  group(page).or(page.getByRole('button', { name: /^Writing mode/ }));
const classicOn = (page: Page) =>
  expect(editor(page)).toHaveAttribute('aria-label', 'Source, Classic Mode');
const fountainOn = (page: Page) => expect(editor(page)).toHaveAttribute('aria-label', 'Source');
const list = (page: Page) => page.locator('.cm-tooltip-autocomplete');
const chooser = (page: Page) => page.getByRole('listbox', { name: 'Choose an element' });
const hint = (page: Page) => page.locator('[data-classic-hint]');

/** Presses the switch, as a writer would at this width. */
async function pressSwitch(page: Page, to: 'Fountain' | 'Classic') {
  if (wide(page)) await group(page).getByRole('button', { name: to }).click();
  else await one(page, to === 'Classic' ? 'Fountain' : 'Classic').click();
}

/** Classic Mode on, the hint seen, the Source showing; `text` first, typed in Fountain Mode. */
async function classic(page: Page, text?: string) {
  await start(page);
  if (text !== undefined) await setScript(page, text);
  await pressSwitch(page, 'Classic');
  await classicOn(page);
  await showSource(page);
  if (await hint(page).isVisible())
    await hint(page).getByRole('button', { name: 'Got it' }).click();
  await editor(page).focus();
}

/** A new script from Open's menu, as a writer starts one. */
async function newScript(page: Page, name: 'New screenplay' | 'New stage play') {
  await pressToolbarButton(page, 'Open');
  const menu = page.getByRole('group', { name: 'Scripts', exact: true });
  await menu.getByRole('button', { name }).click();
  await expect(menu).toBeHidden();
  await showSource(page);
}

/** Replaces the script in Fountain Mode, in one change. */
async function setScript(page: Page, text: string) {
  await showSource(page);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
  await expect.poll(() => wholeText(page)).toBe(text);
}

/** The cursor at the end of the script's last element (`Mod+End`, §6.4). */
async function toEnd(page: Page) {
  await page.keyboard.press('ControlOrMeta+End');
}

/** Android's Enter is read from the page's change a moment later (classic-phone.spec.ts). */
async function enter(page: Page) {
  const before = await wholeText(page);
  const at = await head(page);
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await wholeText(page)) !== before || (await head(page)) !== at)
    .toBe(true);
}

/** The main cursor's offset, from the editor's state. */
const head = (page: Page) =>
  page.evaluate(() => {
    type Linked = { view?: { state: { selection: { main: { head: number } } } } };
    const content = document.querySelector('.cm-content') as
      | (Element & { cmTile?: Linked; cmView?: Linked })
      | null;
    return (content?.cmTile ?? content?.cmView)?.view?.state.selection.main.head ?? -1;
  });

/** Sets the selection, as a drag would leave it. */
const select = (page: Page, anchor: number, to: number) =>
  page.evaluate(
    ([a, h]) => {
      type Linked = { view?: { dispatch(spec: unknown): void; focus(): void } };
      const content = document.querySelector('.cm-content') as
        | (Element & { cmTile?: Linked; cmView?: Linked })
        | null;
      const view = (content?.cmTile ?? content?.cmView)?.view;
      view?.dispatch({ selection: { anchor: a, head: h }, userEvent: 'select.pointer' });
      view?.focus();
    },
    [anchor, to] as const,
  );

const focusInEditor = (page: Page) =>
  page.evaluate(() => !!document.activeElement?.closest('.cm-editor'));

test.describe('the agreed flow', () => {
  test('the agreed flow from a blank script, key by key, and the file compared', async ({
    page,
  }) => {
    await classic(page);
    await newScript(page, 'New screenplay');
    await classicOn(page);
    await editor(page).focus();
    const type = (text: string) => page.keyboard.type(text);
    // 1. Scene heading: INT. typed; Enter goes to Action.
    await type('int. diner - day');
    await enter(page);
    // 2. Action: Enter starts a new action line; Tab goes to Character.
    await type('The lights hum.');
    await enter(page);
    await type('A bell rings.');
    await page.keyboard.press('Tab');
    // 3. Character, then Dialogue.
    await type('june');
    await page.keyboard.press('Tab');
    await type('Still open?');
    // 4. Dialogue: Enter goes to the next Character, Tab to a Parenthetical.
    await enter(page);
    await type('dale');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await type('quietly');
    // 5. After a Parenthetical, Enter goes back to Dialogue.
    await enter(page);
    await type('Always.');
    // 3 again: JU offered JUNE; Tab accepts and goes to Dialogue.
    await enter(page);
    await type('ju');
    await expect(list(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await type('Good.');
    // 6. Enter on an empty line lets the writer choose another element.
    await enter(page);
    await page.keyboard.press('Enter');
    await expect(chooser(page)).toBeVisible();
    await chooser(page).getByRole('option', { name: 'Transition' }).click();
    await expect(chooser(page)).toBeHidden();
    await type('cut to:');
    await enter(page);
    // A heading typed again offers the place already used.
    await type('ext. di');
    await expect(list(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect.poll(() => wholeText(page)).toContain('EXT. DINER');

    const text = (await wholeText(page)) ?? '';
    // The new screenplay's title page stays as it was; the script starts at the heading typed.
    expect(text.startsWith('Title: ')).toBe(true);
    const body = text.slice(text.indexOf('INT. DINER'));
    expect(body.trimEnd()).toBe(
      [
        'INT. DINER - DAY',
        '',
        'The lights hum.',
        '',
        'A bell rings.',
        '',
        'JUNE',
        'Still open?',
        '',
        'DALE',
        '(quietly)',
        'Always.',
        '',
        'JUNE',
        'Good.',
        '',
        'CUT TO:',
        '',
        body.trimEnd().split('\n').at(-1) ?? '',
      ].join('\n'),
    );
    expect(body.trimEnd().split('\n').at(-1)).toMatch(/^EXT\. DINER/);
    // What the Script pane prints is the file's reading: no mark shows on the left.
    await expect(editor(page)).not.toContainText('@');
  });
});

test.describe('the switch', () => {
  test('the switch shows at 1280, 1024, 800, and 320px and never folds', async ({ page }) => {
    await start(page);
    for (const width of [1280, 1024, 800, 320]) {
      await page.setViewportSize({ width, height: 720 });
      const control = width >= 1024 ? group(page) : one(page, 'Fountain');
      await expect(control, `at ${width}px`).toBeVisible();
      const box = await control.boundingBox();
      expect(box, `at ${width}px`).not.toBeNull();
      expect((box?.x ?? 0) + (box?.width ?? 0), `at ${width}px`).toBeLessThanOrEqual(width);
      // Never folded: More actions has no writing mode in it.
      const more = page.getByRole('button', { name: 'More actions', exact: true });
      if (await more.isVisible()) {
        await more.click();
        const menu = page.getByRole('menu', { name: 'More actions' });
        await expect(menu).toBeVisible();
        await expect(
          menu.getByRole('menuitem', { name: /Writing mode|Classic|Fountain/ }),
        ).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
      }
      const scrolls = await page.evaluate(() => {
        const bar = document.querySelector('header.toolbar') as HTMLElement;
        return (
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth +
          bar.scrollWidth -
          bar.clientWidth
        );
      });
      expect(scrolls, `at ${width}px`).toBe(0);
    }
  });

  test('the switch shows in focus mode', async ({ page }) => {
    await classic(page, SCRIPT);
    await pressToolbarButton(page, 'Focus');
    const marker = page.getByRole('group', { name: 'Focus mode' });
    await expect(marker).toBeVisible();
    await expect(marker.getByRole('button', { name: /^Writing mode: Classic\./ })).toBeVisible();
  });

  test('the switch is absent in Markdown', async ({ page }) => {
    await start(page);
    await expect(anySwitch(page).first()).toBeVisible();
    await runCommand(page, 'New Markdown document');
    await expect(
      page.getByRole('toolbar', { name: 'Markdown bar' }).or(editor(page)).first(),
    ).toBeAttached();
    await expect(page.getByRole('button', { name: /^Writing mode/ })).toHaveCount(0);
    await expect(group(page)).toHaveCount(0);
  });

  test('a first visit is Fountain', async ({ page }) => {
    await start(page);
    await showSource(page);
    await fountainOn(page);
    if (wide(page)) {
      await expect(group(page).getByRole('button', { name: 'Fountain' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    } else {
      await expect(one(page, 'Fountain')).toBeVisible();
    }
    await expect(page.locator('.cm-classic')).toHaveCount(0);
  });

  test('a reload keeps the choice', async ({ page }) => {
    await classic(page, SCRIPT);
    // Stored before the reload: the setting is written a moment after the press.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise((done) => {
              const open = indexedDB.open('drafter');
              open.onsuccess = () => {
                const get = open.result
                  .transaction('settings')
                  .objectStore('settings')
                  .get('writingMode');
                get.onsuccess = () => done(get.result?.value);
              };
            }),
        ),
      )
      .toBe('classic');
    await page.reload();
    await classicOn(page);
    await page.reload();
    await classicOn(page);
  });

  test('Settings, the palette, and the key all switch, and the file doesn’t change', async ({
    page,
  }, info) => {
    await start(page);
    await setScript(page, SCRIPT);
    await openSettings(page);
    await settingsDialog(page).getByLabel('Writing mode').selectOption('classic');
    await closeSettings(page);
    await classicOn(page);
    expect(await wholeText(page)).toBe(SCRIPT);
    if (await hint(page).isVisible())
      await hint(page).getByRole('button', { name: 'Got it' }).click();

    await showSource(page);
    await editor(page).focus();
    await runCommand(page, 'Switch to Fountain Mode');
    await fountainOn(page);
    expect(await wholeText(page)).toBe(SCRIPT);

    if (!isPhone(info.project.name)) {
      await editor(page).focus();
      await page.keyboard.press(switchKey);
      await classicOn(page);
      expect(await wholeText(page)).toBe(SCRIPT);
      await page.keyboard.press(switchKey);
      await fountainOn(page);
    }
    expect(await wholeText(page)).toBe(SCRIPT);
  });
});

test.describe('the ways out of the text', () => {
  test.skip(({ isMobile }) => !!isMobile, 'a physical keyboard');

  /** On the line of action, where Tab in Classic Mode has a meaning (it goes to Character). */
  async function onAction(page: Page) {
    await classic(page, SCRIPT);
    await toEnd(page);
    // Tab alone keeps focus in the text: it moved to Character.
    await page.keyboard.press('Tab');
    expect(await focusInEditor(page)).toBe(true);
    await page.keyboard.press('Shift+Tab');
    expect(await focusInEditor(page)).toBe(true);
  }

  test('Esc then Tab leaves the editor', async ({ page }) => {
    await onAction(page);
    const text = await wholeText(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await expect.poll(() => focusInEditor(page)).toBe(false);
    expect(await wholeText(page)).toBe(text);
  });

  test('Esc then Shift+Tab leaves the editor', async ({ page }) => {
    await onAction(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => focusInEditor(page)).toBe(false);
  });

  test('one Esc with a list open doesn’t, and Esc Esc Tab does', async ({ page }) => {
    await classic(page, NAMED);
    await toEnd(page);
    await page.keyboard.press('Tab');
    await page.keyboard.type('JU');
    await expect(list(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list(page)).toBeHidden();
    await page.keyboard.press('Tab');
    expect(await focusInEditor(page)).toBe(true);
    // That Tab went on to Dialogue; a speech later, a name's list is open again (JU is a name now,
    // so typed in full it offers nothing, §7.3).
    await page.keyboard.type('Hi.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('JO');
    await expect(list(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await expect.poll(() => focusInEditor(page)).toBe(false);
  });

  test('in focus mode Esc leaves it too', async ({ page }) => {
    await onAction(page);
    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    const marker = page.getByRole('group', { name: 'Focus mode' });
    await expect(marker).toBeVisible();
    await editor(page).focus();
    await page.keyboard.press('Escape');
    await expect(marker).toBeHidden();
    await page.keyboard.press('Tab');
    await expect.poll(() => focusInEditor(page)).toBe(false);
  });

  test('Ctrl+M makes Tab move focus until it’s pressed again', async ({ page }) => {
    await onAction(page);
    const mac = await page.evaluate(() => /Mac/.test(navigator.platform));
    const toggle = mac ? 'Shift+Alt+KeyM' : 'Control+KeyM';
    const text = await wholeText(page);
    await page.keyboard.press(toggle);
    // Longer than Esc's two seconds would last: Tab still leaves.
    await page.waitForTimeout(2200);
    await page.keyboard.press('Tab');
    await expect.poll(() => focusInEditor(page)).toBe(false);
    expect(await wholeText(page)).toBe(text);
    await editor(page).focus();
    await page.keyboard.press(toggle);
    await page.keyboard.press('Tab');
    expect(await focusInEditor(page)).toBe(true);
  });

  test('F6 moves to the Inspector', async ({ page }) => {
    test.skip(!wide(page), 'one pane below 1024px');
    await onAction(page);
    await page.keyboard.press('F6');
    await expect(page.getByRole('tabpanel', { name: 'Script' })).toBeFocused();
    await page.keyboard.press('F6');
    await expect.poll(() => focusInEditor(page)).toBe(true);
  });
});

test.describe('autofill typed with no wait', () => {
  /** On a new Character line below the script's last line. */
  async function onName(page: Page) {
    await classic(page, NAMED);
    await toEnd(page);
    await page.keyboard.press('Tab');
  }

  test('JU and Tab with no wait gives JUNE and Dialogue', async ({ page }) => {
    await onName(page);
    await page.keyboard.type('JU');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Here.');
    await expect.poll(() => wholeText(page)).toBe(`${NAMED}\n\nJUNE\nHere.`);
  });

  test('JU and Enter with no wait gives JUNE and Dialogue', async ({ page }) => {
    await onName(page);
    await page.keyboard.type('JU');
    // No wait after JU; Enter's own change is waited for, as Android reads it a moment later.
    await enter(page);
    await page.keyboard.type('Here.');
    await expect.poll(() => wholeText(page)).toBe(`${NAMED}\n\nJUNE\nHere.`);
  });

  test('a name with no match moves on', async ({ page }) => {
    await onName(page);
    await page.keyboard.type('zed');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Here.');
    await expect.poll(() => wholeText(page)).toBe(`${NAMED}\n\nZED\nHere.`);
  });

  test('JO after Escape stays JO', async ({ page }) => {
    await onName(page);
    await page.keyboard.type('JO');
    await expect(list(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list(page)).toBeHidden();
    await page.keyboard.press('Tab');
    await page.keyboard.type('Here.');
    await expect.poll(() => wholeText(page)).toBe(`${NAMED}\n\nJO\nHere.`);
  });
});

test.describe('the metadata block', () => {
  const META = /\/\* drafter\n\{[^}]*"template": ?"stage-play-standard"[^}]*\}\n\*\//;

  /** A new stage play in Classic Mode, with a line of stage direction typed. */
  async function stagePlay(page: Page) {
    await classic(page);
    await newScript(page, 'New stage play');
    await classicOn(page);
    await editor(page).focus();
    await page.keyboard.type('A bare stage.');
    await expect.poll(() => wholeText(page)).toMatch(META);
  }

  test('the first letter of a blank stage play keeps the template', async ({ page }) => {
    await classic(page);
    await newScript(page, 'New stage play');
    await classicOn(page);
    await editor(page).focus();
    await page.keyboard.type('a');
    await expect.poll(() => wholeText(page)).toMatch(META);
    await expect(page.locator('[data-tour="status"]')).toContainText('Stage play');
    expect(await wholeText(page)).toMatch(/\n\na\n\n\/\* drafter/);
  });

  test('Select All, Delete on a stage play keeps the template, and Undo restores', async ({
    page,
  }) => {
    await stagePlay(page);
    const before = await wholeText(page);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await expect.poll(() => wholeText(page)).not.toContain('A bare stage.');
    expect(await wholeText(page)).toMatch(META);
    await expect(page.locator('[data-tour="status"]')).toContainText('Stage play');
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => wholeText(page)).toBe(before);
  });

  test('cut and paste over all, the same', async ({ page, browserName, context }) => {
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }
    await stagePlay(page);
    const before = (await wholeText(page)) ?? '';
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+x');
    await expect.poll(() => wholeText(page)).not.toContain('A bare stage.');
    expect(await wholeText(page)).toMatch(META);
    // An emulated iPhone's cut takes a moment to settle: an Undo straight after it takes back the
    // typing before it too, in Fountain Mode as well. A writer's Undo comes later than that.
    await page.waitForTimeout(300);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => wholeText(page)).toBe(before);
    // Pasted over all: the text goes in, and the block stays the last thing, once.
    await page.keyboard.press('ControlOrMeta+a');
    await editor(page).evaluate((el) => {
      const data = new DataTransfer();
      data.setData('text/plain', 'A new stage.');
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    if (!(await wholeText(page))?.includes('A new stage.')) {
      // Firefox gives a made-up paste an empty clipboard, so it only took the text away: the new
      // text is typed over all instead.
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.insertText('A new stage.');
    }
    await expect.poll(() => wholeText(page)).toContain('A new stage.');
    const after = (await wholeText(page)) ?? '';
    expect(after).toMatch(META);
    expect(after.match(/\/\* drafter/g)).toHaveLength(1);
    expect(after).not.toContain('A bare stage.');
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => wholeText(page)).toBe(before);
  });
});

test.describe('capitals and Action', () => {
  test('int. becomes INT.', async ({ page }) => {
    await classic(page, SCRIPT);
    await toEnd(page);
    await enter(page);
    await page.keyboard.type('int. hall');
    await expect.poll(() => wholeText(page)).toBe(`${SCRIPT.trimEnd()}\n\nINT. HALL`);
    await expect(page.locator('.cm-line').filter({ hasText: 'INT. HALL' })).toHaveClass(
      /cm-c-scene_heading/,
    );
  });

  test('BANG on Action stays at the Action indent, and Enter gives a new Action', async ({
    page,
  }) => {
    await classic(page, SCRIPT);
    await toEnd(page);
    await enter(page);
    await page.keyboard.type('BANG');
    const bang = page.locator('.cm-line').filter({ hasText: /^BANG$/ });
    await expect(bang).toHaveClass(/cm-c-action/);
    const indent = (line: typeof bang) =>
      line.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        return Math.round(range.getBoundingClientRect().left - box.left);
      });
    const action = page.locator('.cm-line').filter({ hasText: 'The lights hum.' });
    expect(await indent(bang)).toBe(await indent(action));
    await enter(page);
    await page.keyboard.type('Glass falls.');
    await expect(page.locator('.cm-line').filter({ hasText: 'Glass falls.' })).toHaveClass(
      /cm-c-action/,
    );
    // BANG stays Action in the file too: with a line under it, it carries its `!`.
    const text = (await wholeText(page)) ?? '';
    expect(text).toMatch(/\n\n!?BANG\n\nGlass falls\.$/);
    await expect(bang).toHaveClass(/cm-c-action/);
  });
});

test.describe('the left pane with the app’s CSS', () => {
  const PANE =
    'INT. DINER - DAY\n\nThe lights hum.\n\nJUNE\nThis is a line of dialogue that runs on long enough to wrap across the width of a speech, and then some more.\n\nCUT TO:\n\nEXT. ROAD - NIGHT\n\nDust.\n';

  test('a Transition is one line high, and a speech keeps its width', async ({ page }) => {
    await classic(page, PANE);
    const line = (text: string) => page.locator('.cm-line').filter({ hasText: text }).first();
    const action = await line('The lights hum.').boundingBox();
    const transition = await line('CUT TO:').boundingBox();
    expect(transition?.height ?? 0).toBeGreaterThan(0);
    expect(Math.abs((transition?.height ?? 0) - (action?.height ?? 0))).toBeLessThanOrEqual(1);
    // The speech's text is about 35 characters wide, never squeezed to nothing.
    const widths = await line('This is a line of dialogue').evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const ch = (() => {
        const probe = document.createElement('span');
        probe.textContent = '0'.repeat(10);
        el.appendChild(probe);
        const w = probe.getBoundingClientRect().width / 10;
        probe.remove();
        return w;
      })();
      return { text: range.getBoundingClientRect().width, ch };
    });
    expect(widths.text / widths.ch).toBeGreaterThan(20);
  });

  test('Down and Up walk the lines over hidden marks, never sticking or going back', async ({
    page,
  }, info) => {
    test.skip(isPhone(info.project.name), 'arrow keys');
    const marked =
      '.CANDLE ROOM\n\n!LOUD NOISES\n\n@june\nHello.\n\n~A song.\n\n> CENTERED <\n\n**Bold** words.\n\nJUNE\n(softly)\nBye.\n\n>FADE OUT.';
    await classic(page, marked);
    await page.keyboard.press('ControlOrMeta+Home');
    const down: number[] = [await head(page)];
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowDown');
      down.push(await head(page));
    }
    const length = marked.length;
    for (let i = 1; i < down.length; i++) {
      expect(down[i], `Down ${i}`).toBeGreaterThanOrEqual(down[i - 1] as number);
    }
    // It reached the last line, and every step before it moved.
    const last = down.indexOf(down.at(-1) as number);
    expect(marked.lastIndexOf('\n') < (down.at(-1) as number)).toBe(true);
    for (let i = 1; i <= last; i++)
      expect(down[i], `Down ${i} moved`).toBeGreaterThan(down[i - 1] as number);
    const up: number[] = [await head(page)];
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowUp');
      up.push(await head(page));
    }
    for (let i = 1; i < up.length; i++) {
      expect(up[i], `Up ${i}`).toBeLessThanOrEqual(up[i - 1] as number);
    }
    expect(up.at(-1)).toBeLessThanOrEqual(1);
    // Right across the whole script steps forward every press.
    await page.keyboard.press('ControlOrMeta+Home');
    let at = await head(page);
    for (let i = 0; i < 200 && at < length; i++) {
      await page.keyboard.press('ArrowRight');
      const now = await head(page);
      if (now === at) break;
      expect(now, `Right ${i}`).toBeGreaterThan(at);
      at = now;
    }
    expect(at).toBeGreaterThanOrEqual(length - 1);
    expect(await wholeText(page)).toBe(marked);
  });

  test('a 100,000-character line with marks takes a keystroke and scrolls', async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    test.skip(isPhone(info.project.name), 'a desktop’s keys');
    const long = Array.from({ length: 5000 }, (_, i) => (i % 2 ? '**bold**' : 'word *it* ')).join(
      ' ',
    );
    const text = `INT. DINER - DAY\n\n${long.slice(0, 100_000)}\n\nThe end.`;
    await start(page);
    await showSource(page);
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText(text);
    await expect.poll(() => wholeText(page), { timeout: 60_000 }).toBe(text);
    await page.keyboard.press(switchKey);
    await classicOn(page);
    if (await hint(page).isVisible())
      await hint(page).getByRole('button', { name: 'Got it' }).click();
    await editor(page).focus();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    const typed = await page.evaluate(async () => {
      const t0 = performance.now();
      return t0;
    });
    await page.keyboard.type('x');
    await expect.poll(async () => (await wholeText(page))?.length).toBe(text.length + 1);
    const took = (await page.evaluate(() => performance.now())) - typed;
    console.log(
      `a keystroke on a 100,000-character line, ${info.project.name}: ${took.toFixed(0)} ms`,
    );
    expect(took).toBeLessThan(2000);
    // Scrolled from end to start and back, the pane draws and the text stays.
    const scroller = page.locator('.cm-scroller');
    for (const y of [0, 20_000, 100_000, 0]) {
      await scroller.evaluate((el, top) => {
        el.scrollTop = top;
      }, y);
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      );
      await expect(page.locator('.cm-line').first()).toBeVisible();
    }
    expect((await wholeText(page))?.length).toBe(text.length + 1);
  });

  test('Shift+Enter with a selection breaks the line as Fountain Mode does', async ({
    page,
  }, info) => {
    test.skip(isPhone(info.project.name), 'a desktop’s keys');
    // "lights" selected on the line of action, from its end: Classic Mode stands back for a
    // selection (§6.3), so the break is Fountain's own, in both modes.
    const from = SCRIPT.indexOf('lights');
    const broken: string[] = [];
    await start(page);
    for (const mode of ['Fountain', 'Classic'] as const) {
      await setScript(page, SCRIPT);
      if (mode === 'Classic') {
        await pressSwitch(page, 'Classic');
        await classicOn(page);
        if (await hint(page).isVisible())
          await hint(page).getByRole('button', { name: 'Got it' }).click();
      }
      await select(page, from + 'lights'.length, from);
      await page.keyboard.press('Shift+Enter');
      await page.keyboard.type('x');
      broken.push((await wholeText(page)) ?? '');
      await page.keyboard.press('ControlOrMeta+z');
      await expect.poll(() => wholeText(page), mode).toBe(SCRIPT);
    }
    expect(broken[1]).toBe(broken[0]);
    // One break where the selection was, and nothing else of the line gone but the space Fountain
    // Mode's break takes.
    expect(broken[1]).toMatch(/^INT\. DINER - DAY\n\nThe \nx ?hum\.$/);
  });
});

test.describe('colours and motion', () => {
  test('forced colours', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await classic(page, 'INT. DINER - DAY\n\nThe lights hum. [[A note.]]\n');
    const rule = page.locator('.cm-c-note-rule').first();
    await expect(rule).toBeAttached();
    const colours = await rule.evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.color = 'CanvasText';
      document.body.appendChild(probe);
      const canvasText = getComputedStyle(probe).color;
      probe.remove();
      return { rule: getComputedStyle(el).borderLeftColor, canvasText };
    });
    expect(colours.rule).toBe(colours.canvasText);
    // The mode in use has a border, as a fill alone doesn't show.
    const pressed = wide(page)
      ? group(page).getByRole('button', { name: 'Classic' })
      : one(page, 'Classic');
    const border = await pressed.evaluate((el) => getComputedStyle(el).borderTopStyle);
    expect(border).toBe('solid');
  });

  for (const motion of ['reduce', 'no-preference'] as const) {
    test(`reduced motion: nothing has a transition (${motion})`, async ({ page }, info) => {
      await page.emulateMedia({ reducedMotion: motion });
      await start(page);
      await setScript(page, NAMED);
      await pressSwitch(page, 'Classic');
      await classicOn(page);
      await expect(hint(page)).toBeVisible();
      const still = (selector: string) =>
        page.evaluate((s) => {
          const out: string[] = [];
          for (const el of document.querySelectorAll(s)) {
            for (const node of [el, ...el.querySelectorAll('*')]) {
              const style = getComputedStyle(node);
              const moves =
                style.transitionDuration.split(',').some((d) => Number.parseFloat(d) > 0) ||
                style.animationName !== 'none';
              if (moves) out.push(`${s}: ${node.tagName}.${node.className}`);
            }
          }
          return out;
        }, selector);
      expect(await still('[data-classic-hint]')).toEqual([]);
      expect(await still('.mode-button')).toEqual([]);
      await hint(page).getByRole('button', { name: 'Got it' }).click();
      await showSource(page);
      await editor(page).focus();
      await toEnd(page);
      if (!isPhone(info.project.name)) {
        await page.keyboard.press('Tab');
        await page.keyboard.type('JU');
        await expect(list(page)).toBeVisible();
        expect(await still('.cm-tooltip-autocomplete')).toEqual([]);
        await page.keyboard.press('Escape');
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.press('ControlOrMeta+z');
      }
      await toEnd(page);
      await enter(page);
      await page.keyboard.press('Enter');
      await expect(chooser(page)).toBeVisible();
      expect(await still('.cm-chooser')).toEqual([]);
    });
  }
});
