# Support Drafter (tip jar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A help page, "Support Drafter", with one button to tip on Ko-fi and a sentence for GitHub Sponsors, reachable only from the About menu, About's dialog and the palette.

**Architecture:** The two addresses are constants in one small module, checked by a pure function. The help page joins `HELP_PAGES` only when a Ko-fi address is set, so every list built from `HELP_PAGES` (the prerender, the About menu, About's Help list, the palette, the service worker, the tests) gains or loses it together. Nothing is loaded from either provider: both routes are plain links.

**Tech Stack:** Nuxt 4 (`apps/web`), Vue SFC help pages on the `docs` layout, vitest (`apps/web/test`), Playwright (`apps/web/e2e`, against the built site).

**Spec:** `docs/drafter-support-page-design.md`

## Global Constraints

- The page never contains "donate", "donation", "donor" or "charity". The palette's keywords may ("donate" is what people search for).
- Nothing asks: no banner, toast, badge, dot, reminder or prompt, and no entry in `apps/web/app/whats-new/entries.ts`.
- No perk, mark or thanks-list for people who give.
- No provider script, image, iframe or font. `_headers` and the content security policy are byte-for-byte unchanged.
- Both outside links have `target="_blank"` and `rel="noopener noreferrer"`, and carry no query and no fragment.
- A writer never needs an account: Ko-fi is the one button; GitHub is a sentence for people who "have a GitHub account".
- A route with no address is not drawn. With no Ko-fi address there is no page, no command, no menu entry.
- The page's text is the spec's, word for word (spec, "What is built", item 1).
- Every push updates `CHANGELOG.md`; the README and Help → Privacy stay in step with what ships.
- Feature PRs target `staging`. Nothing here goes to `main`.

## Review Focus

- **An address typed wrong** (http, another host, a trailing `?ref=`, a GitHub profile instead of `/sponsors/`): the route is treated as absent, and a unit test fails the build's checks, so a bad link is never published. Task 1.
- **Only GitHub's address set:** no page (Ko-fi is the route that needs no account). Task 1.
- **The desktop app:** the button opens the system browser like every other outside link, and never navigates the app's own window. Task 2.
- **A phone:** the button is at least 44 px tall and the page does not scroll sideways at 360 px. Task 2.
- **The self-hosted build and the offline copy:** the page is precached and reads offline; its links simply don't open without a network. Covered by the existing `offline.spec.ts` loops over `HELP_PAGES`; Task 2 runs them.

---

### Task 1: The addresses, and whether the page exists

**Files:**
- Create: `apps/web/app/about/support.ts`
- Modify: `apps/web/app/commands/data.ts` (`HELP_PAGES`, and the help page's command keywords)
- Modify: `apps/web/app/commands/help-menu.ts` (`ABOUT_PAGE_IDS`)
- Test: `apps/web/test/support.test.ts`, `apps/web/test/command-data.test.ts`

**Interfaces:**
- Produces, from `~/about/support`:
  - `interface SupportLinks { kofi?: string; github?: string }`
  - `const SUPPORT_LINKS: SupportLinks` (both unset until the maintainer supplies them)
  - `function supportRoutes(links: SupportLinks): { tip?: string; sponsor?: string }` — each present only when its address is valid
  - `const SUPPORT_ROUTES = supportRoutes(SUPPORT_LINKS)`
  - `const SUPPORT_ON: boolean` — `SUPPORT_ROUTES.tip !== undefined`
  - `const SUPPORT_PAGE: HelpPage` — `{ id: 'help-support', path: '/docs/support', title: 'Support Drafter', section: 'about' }`
- `HELP_PAGES` holds `SUPPORT_PAGE` directly after `help-why` when `SUPPORT_ON`, and not otherwise.
- The spec's "one more entry in About" needs no code of its own: About's dialog already lists every page in `HELP_PAGES` under Help, and the About menu lists the pages in `ABOUT_PAGE_IDS`. Do not add the page to `ABOUT_LINKS` as well (those open outside the app).

- [ ] **Step 1: Write the failing tests** in `test/support.test.ts`

```ts
import { describe, expect, test } from 'vitest';
import { SUPPORT_LINKS, supportRoutes } from '../app/about/support';

describe('supportRoutes', () => {
  test('gives both routes for a Ko-fi page and a GitHub Sponsors page', () => {
    expect(
      supportRoutes({ kofi: 'https://ko-fi.com/someone', github: 'https://github.com/sponsors/someone' }),
    ).toEqual({ tip: 'https://ko-fi.com/someone', sponsor: 'https://github.com/sponsors/someone' });
  });
  test('gives no sponsor route when only Ko-fi is set', () => {
    expect(supportRoutes({ kofi: 'https://ko-fi.com/someone' })).toEqual({
      tip: 'https://ko-fi.com/someone',
    });
  });
  test('gives nothing when only GitHub is set: Ko-fi is the route that needs no account', () => {
    expect(supportRoutes({ github: 'https://github.com/sponsors/someone' })).toEqual({});
  });
  test('gives nothing when neither is set', () => {
    expect(supportRoutes({})).toEqual({});
  });
  test.each([
    'http://ko-fi.com/someone',
    'https://ko-fi.com/',
    'https://ko-fi.com/someone?ref=drafter',
    'https://ko-fi.com/someone#tip',
    'https://ko-fi.com.example.org/someone',
    'https://example.org/ko-fi.com/someone',
    'javascript:alert(1)',
    '',
  ])('takes %s for no Ko-fi page', (kofi) => {
    expect(supportRoutes({ kofi })).toEqual({});
  });
  test.each([
    'https://github.com/someone',
    'https://github.com/sponsors/',
    'https://github.com/sponsors/someone?o=esb',
    'http://github.com/sponsors/someone',
  ])('takes %s for no Sponsors page', (github) => {
    expect(supportRoutes({ kofi: 'https://ko-fi.com/someone', github })).toEqual({
      tip: 'https://ko-fi.com/someone',
    });
  });
  test('the addresses in the build are valid or unset, never half-right', () => {
    const routes = supportRoutes(SUPPORT_LINKS);
    expect(routes.tip).toBe(SUPPORT_LINKS.kofi);
    if (routes.tip) expect(routes.sponsor).toBe(SUPPORT_LINKS.github);
  });
});
```

In `test/command-data.test.ts`, the two tests that list every page's path and href ("has the seventeen help pages" and "links each page at its directory") build their expected lists with `'/docs/support'` after `'/docs/why'` when `SUPPORT_ON`, and without it otherwise; the first is renamed "has every help page, in the Help group". Add:

```ts
test('finds the Support page by what people call it', () => {
  if (!SUPPORT_ON) return;
  const command = COMMAND_DATA.find((c) => c.id === 'help-support');
  expect(command?.keywords).toEqual(expect.arrayContaining(['tip', 'donate', 'sponsor', 'thanks']));
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd apps/web && pnpm exec vitest run test/support.test.ts test/command-data.test.ts`
Expected: FAIL, `Cannot find module '../app/about/support'`.

- [ ] **Step 3: Write `app/about/support.ts`** with the exports above. `supportRoutes` parses each address with `new URL` inside a `try`; Ko-fi is valid when the protocol is `https:`, the host is exactly `ko-fi.com`, the path is one non-empty segment, and there is no search and no hash; GitHub is valid when the host is exactly `github.com` and the path is `/sponsors/<one non-empty segment>`, with the same rules. `SUPPORT_LINKS` is `{}` with a comment saying the maintainer's two addresses go here and nowhere else.

- [ ] **Step 4: Put the page in `HELP_PAGES`, `ABOUT_PAGE_IDS` and the command's keywords.** `HELP_PAGES` spreads `SUPPORT_ON ? [SUPPORT_PAGE] : []` after `help-why`. `ABOUT_PAGE_IDS` gains `'help-support'`. Where `COMMAND_DATA` builds a command for each help page, `help-support` gets `keywords: ['tip', 'tip jar', 'donate', 'sponsor', 'thanks', 'ko-fi', 'support']`.

- [ ] **Step 5: Run the unit tests**

Run: `cd apps/web && pnpm exec vitest run`
Expected: PASS, every file.

- [ ] **Step 6: Commit** — `feat: the Support page's addresses, and the page only when Ko-fi's is set`

### Task 2: The page

**Files:**
- Create: `apps/web/app/pages/docs/support.vue`
- Modify: `apps/web/public/llms.txt` (only when `SUPPORT_ON`; see Task 4)
- Test: `apps/web/e2e/support.spec.ts`

**Interfaces:**
- Consumes: `SUPPORT_ROUTES`, `SUPPORT_ON`, `SUPPORT_PAGE` from `~/about/support`; `useDocsHead`, the `docs` layout, and `DButton`/the app's primary button style, as `pages/docs/why.vue` uses them.
- Produces: the page marks its two links `data-support="tip"` and `data-support="sponsor"`.

- [ ] **Step 1: Write the failing tests** in `e2e/support.spec.ts`. The file's tests of the page are skipped when `!SUPPORT_ON`; the two "absent" tests run only then.

```ts
// With a Ko-fi address set:
test('says what it is, in the words agreed', async ({ page }) => {
  await page.goto('/docs/support/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Support Drafter');
  await expect(main).toContainText('Drafter is free, and every part of it stays free.');
  await expect(main).toContainText('No account needed.');
  await expect(main).toContainText('Nothing changes in Drafter whether you do or not.');
  await expect(main).toContainText('a tip is not tax-deductible');
  expect(await main.innerText()).not.toMatch(/donat|donor|charit/i);
});
test('has one button, to Ko-fi, and it leaves the app', async ({ page }) => {
  await page.goto('/docs/support/');
  const tip = page.locator('[data-support="tip"]');
  await expect(tip).toHaveText('Leave a tip');
  await expect(tip).toHaveAttribute('href', SUPPORT_ROUTES.tip as string);
  await expect(tip).toHaveAttribute('target', '_blank');
  await expect(tip).toHaveAttribute('rel', 'noopener noreferrer');
  expect((await tip.boundingBox())?.height).toBeGreaterThanOrEqual(44);
});
test('offers GitHub only as a sentence, and only when its address is set', async ({ page }) => {
  await page.goto('/docs/support/');
  const sponsor = page.locator('[data-support="sponsor"]');
  if (!SUPPORT_ROUTES.sponsor) return expect(sponsor).toHaveCount(0);
  await expect(page.getByRole('main')).toContainText('Have a GitHub account?');
  await expect(sponsor).toHaveAttribute('href', SUPPORT_ROUTES.sponsor);
  await expect(sponsor).toHaveAttribute('rel', 'noopener noreferrer');
});
test('asks nothing of any other site', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).origin !== new URL(page.url() || r.url()).origin) outside.push(r.url());
  });
  await page.goto('/docs/support/');
  await page.waitForLoadState('networkidle');
  expect(outside.filter((u) => !u.startsWith('data:'))).toEqual([]);
});
test('does not scroll sideways at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/docs/support/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('is nowhere on the writing screen', async ({ page }) => {
  await start(page); // from ./modules
  const html = await page.content();
  expect(html).not.toContain(SUPPORT_ROUTES.tip as string);
  expect(html).not.toMatch(/Leave a tip|ko-fi/i);
});

// With none set:
test('is not a page', async ({ page }) => {
  const response = await page.goto('/docs/support/');
  expect(response?.status()).toBe(404);
});
test('is not in the palette', async ({ page }) => {
  await start(page);
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.insertText('Support Drafter');
  await expect(palette(page).getByRole('option', { name: /Support Drafter/ })).toHaveCount(0);
});
```

- [ ] **Step 2: Run and see them fail**

Run: `cd apps/web && pnpm e2e --project=chromium e2e/support.spec.ts`
Expected with `SUPPORT_LINKS` empty: "is not a page" FAILS only if the file exists and renders; write Step 3 so that it passes. To see the page's own tests fail first, set `SUPPORT_LINKS = { kofi: 'https://ko-fi.com/drafter-test' }` in the working tree (never commit it), rebuild, and expect: FAIL, 404 for `/docs/support/`.

- [ ] **Step 3: Write `pages/docs/support.vue`.** `definePageMeta({ layout: 'docs' })`; when `!SUPPORT_ON`, `throw createError({ statusCode: 404, fatal: true })` before anything else, so a build without addresses has no such page. `useDocsHead({ ...SUPPORT_PAGE, description: 'Drafter is free and stays free. If it has been useful, you can leave a tip: by card, with no account.' })`. The body is the spec's text, in this order: the `h1`; the two opening paragraphs; the button (an `<a>` styled as the app's primary button, `min-height: 44px`); the line "By card, Apple Pay, Google Pay or PayPal, on Ko-fi. No account needed."; the GitHub sentence, `v-if="SUPPORT_ROUTES.sponsor"`; the closing paragraph.

- [ ] **Step 4: Run the page's tests, both ways**

Run, with the test address in the working tree: `cd apps/web && pnpm e2e --project=chromium e2e/support.spec.ts e2e/docs.spec.ts e2e/security.spec.ts e2e/offline.spec.ts e2e/a11y.spec.ts`
Expected: PASS (`docs.spec.ts` will want the page's description to be unique and the page listed in the About menu; `security.spec.ts` checks its content security policy; `a11y.spec.ts` runs axe on it in both themes).
Then restore `SUPPORT_LINKS = {}`, rebuild, and run the same command.
Expected: PASS, with the page's tests skipped and the two "absent" tests run.

- [ ] **Step 5: In the desktop app** (`apps/desktop/e2e`), add to the existing outside-links test the Support page's button, when `SUPPORT_ON`: clicking it asks the shell to open `SUPPORT_ROUTES.tip` and the window's own address does not change.

Run: `pnpm --filter @drafter/desktop e2e` (the local gate; CI runs it on `main` only)
Expected: PASS.

- [ ] **Step 6: Commit** — `feat: the Support Drafter help page`

### Task 3: The record

**Files:**
- Modify: `README.md` (the network table; one line under the licence section)
- Modify: `apps/web/app/pages/docs/privacy.vue`
- Modify: `apps/web/scripts/privacy-check.mjs` only if it lists pages by hand (it should read `HELP_PAGES`; check)
- Modify: `CHANGELOG.md`
- Test: `apps/web/e2e/docs.spec.ts` (the Privacy page's text)

- [ ] **Step 1: Write the failing test.** In `docs.spec.ts`, beside the Privacy page's other text checks, when `SUPPORT_ON`:

```ts
await expect(main).toContainText(
  'The Support page links to Ko-fi and GitHub. Nothing is sent to either unless you follow a link.',
);
```

- [ ] **Step 2: Run it and see it fail** (with the test address in the working tree). Expected: FAIL, text not found.

- [ ] **Step 3: Write the record.**
  - Privacy page, in "What does use the network, all of it": the sentence above, `v-if="SUPPORT_ON"`.
  - README network table, a row: `| A tip, if you choose to leave one | Ko-fi, or GitHub Sponsors | Only when you follow a link on the Support page | No |`.
  - README, directly under the licence section's first paragraph: `Drafter is free, and stays free. If you'd like to say thanks: [Support Drafter](https://drafter.dev/docs/support/).`
  - CHANGELOG, under `[Unreleased]` → `### Added`: what the page is, where it is found, that nothing asks for a tip, and that Drafter contacts neither provider.
  - Both README lines and the changelog entry go in with Task 4, not before: they describe a page that exists.

- [ ] **Step 4: Run** `cd apps/web && pnpm e2e --project=chromium e2e/docs.spec.ts` and `node scripts/privacy-check.mjs http://localhost:4173/docs/support/ /tmp/support-privacy.json` against the served build. Expected: PASS, and no request to another origin in the report.

- [ ] **Step 5: Commit** — `docs: the Support page in the privacy record`

### Task 4: Turn it on (when the maintainer has the two addresses)

**Files:**
- Modify: `apps/web/app/about/support.ts` (`SUPPORT_LINKS`)
- Create: `.github/FUNDING.yml`
- Modify: `apps/web/public/llms.txt`, `README.md`, `CHANGELOG.md`

- [ ] **Step 1:** Set `SUPPORT_LINKS` to the maintainer's Ko-fi address and, if GitHub Sponsors is approved, its address. If it is not yet approved, set Ko-fi alone.
- [ ] **Step 2:** `.github/FUNDING.yml`: `ko_fi: <name>` and, when approved, `github: [cschweda]`.
- [ ] **Step 3:** `llms.txt`, after Why Drafter: `- [Support Drafter](https://drafter.dev/docs/support/): an optional tip, by card, with no account; nothing in Drafter depends on it`. Leave "no paid version" as it is.
- [ ] **Step 4:** The README lines and CHANGELOG entry from Task 3.
- [ ] **Step 5:** Open the Ko-fi address in a private window and confirm, by eye, that a card can be entered without signing in to anything. If it asks for an account, stop and tell the maintainer (Stripe is not connected).
- [ ] **Step 6:** Run every gate: `pnpm exec biome check`, `pnpm -r test`, `cd apps/web && pnpm exec nuxi typecheck && pnpm e2e` (all five projects: this adds a page, a menu entry and a focusable button).
Expected: PASS.
- [ ] **Step 7: Commit and open the PR to `staging`** — `feat: Support Drafter, a tip jar on a help page`
