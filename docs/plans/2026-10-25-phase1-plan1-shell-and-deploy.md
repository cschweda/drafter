# Phase 1, Plan 1: App Shell and Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/web`, the Nuxt app for drafter.dev, as a deployable shell. It has the Inform-style two-pane layout with its toolbar and status bar, starts in the dark theme with a light one available, and is served from Netlify under a strict content security policy.

**Architecture:** `apps/web` is a Nuxt 4 app with Nuxt UI v4, generated as static files by `nuxt generate`.
- `/` is client-rendered (route rule `ssr: false`), but prerendered as a shell that carries the page's metadata and a plain description.
- Fonts and icons are served from drafter.dev itself.
- A script that runs after the build hashes every inline script into a Netlify `_headers` file.
- Pane state is a pure TypeScript module with unit tests; the layout's behavior is tested end to end in Playwright.

**Tech Stack:** Nuxt 4.6, Nuxt UI 4.12 (with Tailwind CSS 4.3, `@nuxt/icon`, `@nuxtjs/color-mode`), Vue 3.5, Vitest 5, Playwright 1.64 with `@axe-core/playwright` 4.14, Netlify.

**Spec:** [`docs/drafter-phase1-design.md`](../drafter-phase1-design.md), approved 2026-10-25, with the [architecture](../drafter-architecture.md) and the [technical design](../drafter-technical-design.md). Executors read the spec alongside this plan.

**Where this fits.** Phase 1 is built in five plans, each ending in working, tested software:
1. **App shell and deployment** (this plan)
2. **Editor packages:** `@drafter/lint`, `@drafter/render-html`, `@drafter/cm-fountain`, and the text renderer moved out of the CLI
3. **The editor in the app:**
   - the Source, Script, and Problems panes, the status bar, and the command palette
   - templates and settings
   - focus mode, typewriter scrolling, counts, goals, and sprints
4. **Files and storage:** the recovery copy, open, save, revert, the two-tab guard, files changed elsewhere, and export
5. **First visit and launch:**
   - the samples, the welcome dialog, and the tour
   - phones, offline use, and updates
   - the help pages and the accessibility suite
   - going live

## Global Constraints

- Node 22.13 or later (root `engines`), pnpm 10.33.4 (`packageManager`), strict TypeScript, ESM only.
- Clean room: no code, tests, or fixtures from any screenwriting application or Fountain library. Every new dependency gets its row in `docs/DEPENDENCIES.md` **before** it's installed, saying why it's needed and confirming it isn't a screenwriting tool.
- No network requests after the app loads: nothing from Google Fonts or the Iconify API at runtime, and `connect-src 'self'`.
- Dark theme by default for everyone, light one click away, and the choice remembered.
- Text colors reach a WCAG contrast of 4.5:1, or 3:1 for large text and the edges of controls, in both themes.
- Accessibility targets WCAG 2.2 AA and is checked automatically (axe, keyboard tests, accessibility-tree assertions). Drafter claims no conformance yet.
- Every push includes a commit that updates `CHANGELOG.md` under [Unreleased]; the pre-push hook enforces it.
- Commit messages carry no AI co-author trailer and no session link.
- Choices this plan leaves open are recorded in `docs/DECISIONS.md` under a new `## apps/web` heading, dated.

## Review Focus

1. **Returning to the light theme.** A visitor who chose the light theme must not see a dark flash on load: the color-mode script must run before paint, under the policy. Covered by Task 3's test `restores the light theme before the page body exists`.
2. **Production-only blocks.** The policy can block something only in production: Nuxt's inline config script, an import map, or the color-mode script. Covered by Task 3's test `loads with no CSP violations`, in all three browsers.
3. **A 360-pixel phone.** The toolbar or the tab row could push the page wider than the screen. Covered by Task 4's test `fits a 360px screen without horizontal scrolling`.
4. **Keyboard-only use.** Every control needs visible focus, F6 must move between the panes, and arrow keys must resize the divider. Covered by Task 4's tests `shows a focus ring on every control`, `moves focus between the panes with F6`, and `resizes the panes with the keyboard`.
5. **Fonts.** They must come from drafter.dev with the right content type, and the interface must stay readable before they load. Covered by Task 2's test `serves fonts from the same origin`.

---

### Task 1: Record the approved design in the documents

**Files:**
- Modify: `docs/drafter-phase1-design.md` (status line, §17)
- Modify: `docs/drafter-architecture.md` (§2, §12 item 6, §13 Phase 4)
- Modify: `docs/drafter-technical-design.md` (§8.5, §10, §13, §16)
- Modify: `README.md` (roadmap table, Phase 4 list)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Mark the design approved.** Change its status line to `Status: Approved · 2026-10-25 · Builds on …`. Then retitle §17 "Changes made to the earlier documents", and make its first line "Made when this design was approved:".
- [ ] **Step 2: Architecture.**
  - §2: after the paragraph on resizing, add: "Either pane can show any tab, one pane at a time: choosing a tab that's open in the other pane swaps them."
  - §12, item 6: add "Testing with NVDA and VoiceOver starts in Phase 2. Until it's done, Drafter is built and tested to WCAG 2.2 AA but claims no conformance."
  - §13, Phase 4: add "proof mode: readers add notes to a copy of the script as standard Fountain notes, Drafter shows them in the margin like Word comments, and carries them into the current draft".
- [ ] **Step 3: Technical design.**
  - §8.5: replace "(prompt: reload / keep mine / snapshot both)" with "(the flow in the Phase 1 design, §9.6)".
  - §10: add "Until nspell arrives in Phase 2, Phase 1 turns on the browser's own spellcheck in the Source pane, with a setting to turn it off (Phase 1 design §5.3)."
  - §13: the opening sentence ends "verified automatically from Phase 1 (axe, keyboard tests, and accessibility-tree assertions) and with NVDA and VoiceOver from Phase 2". In the Visual bullet, replace "`prefers-color-scheme`" with "a dark theme by default, a light theme, and a 'Match system appearance' setting that's off by default".
  - §16: replace the route-rules bullet with "`/` is the editor, client-rendered (`ssr: false`) and prerendered as a shell carrying the page's metadata; `/docs/**` is prerendered. Deploy settings live in `apps/web/netlify.toml`."
- [ ] **Step 4: README.**
  - In the Phase 4 list, add "- Proof mode: readers add notes to a copy of the script, kept as standard Fountain notes. Drafter shows them in the margin like Word comments and carries them into the current draft."
  - In the roadmap table, add "proof mode" to Phase 4's theme.
- [ ] **Step 5: CHANGELOG.** Under Changed, add: "The Phase 1 design is approved, and the architecture and technical design now match it: either pane can show any tab, the theme is dark by default, files changed elsewhere follow the new check, and screen-reader testing starts in Phase 2. Proof mode, reader notes kept as Fountain notes and shown like Word comments, joins Phase 4."
- [ ] **Step 6: Verify.** Run:
  ```bash
  python3 -I -c "import re,pathlib;[print(d,t) for d in ['README.md','docs/drafter-phase1-design.md','docs/drafter-architecture.md','docs/drafter-technical-design.md'] for t in re.findall(r'\]\(([^)#\s]+)',pathlib.Path(d).read_text()) if not t.startswith('http') and not (pathlib.Path(d).parent/t).exists()]"
  pnpm check
  ```
  Expected: the first command prints nothing; `pnpm check` exits 0.
- [ ] **Step 7: Commit.** `git commit -am "docs: record the approved Phase 1 design"`

---

### Task 2: Scaffold `apps/web`

**Files:**
- Modify:
  - `pnpm-workspace.yaml`: add `- "apps/*"`.
  - `vitest.config.ts`: `projects: ['packages/*', 'apps/web']`.
  - `biome.json`: add the override below.
  - `package.json` (root): add the scripts `"dev": "pnpm --filter @drafter/web dev"` and `"e2e": "pnpm --filter @drafter/web e2e"`.
  - `docs/DEPENDENCIES.md`, `CHANGELOG.md`, and `README.md` (Development: `pnpm dev`, `pnpm e2e`).
- Create the app's configuration in `apps/web/`: `package.json`, `nuxt.config.ts`, `site.ts`, `tsconfig.json`, `.gitignore`, `vitest.config.ts`, and `playwright.config.ts`.
- Create the app itself in `apps/web/app/`: `app.vue`, `pages/index.vue` (Task 4 replaces it), `assets/css/main.css`, and `spa-loading-template.html`.
- Create the fonts folder `apps/web/app/assets/fonts/inter-tight/`, holding `InterTight-latin.woff2`, `InterTight-latin-ext.woff2`, `OFL.txt`, and `README.md`.
- Create the scripts `apps/web/scripts/sync-assets.mjs` and `apps/web/scripts/serve.mjs`.
- Test: `apps/web/test/sync-assets.test.ts`, `apps/web/test/serve.test.ts`, and `apps/web/e2e/home.spec.ts`.

**Interfaces (Produces):**
- `apps/web/site.ts`:
  ```ts
  export const SITE_URL = 'https://drafter.dev';
  export const SITE_TITLE = 'Drafter: screenplays and stage plays, written in plain text';
  export const SITE_DESCRIPTION =
    'Write screenplays and stage plays in plain-text Fountain and see formatted pages as you type. Free, open source, and no account: your scripts stay on your device.';
  export const OG_IMAGE = `${SITE_URL}/og-image.png`;
  ```
- `scripts/sync-assets.mjs`: `export const ASSETS` (an array of `{ from, to }`, `from` relative to the repository root, `to` relative to `apps/web/public`) and `export async function syncAssets(repoRoot, publicDir)`, which copies each asset and resolves to the list of paths written. Run directly, it syncs into `apps/web/public`. `ASSETS` holds:
  - `packages/render-pdf/fonts/CourierPrime-{Regular,Bold,Italic,BoldItalic}.ttf` and its `OFL.txt` → `fonts/courier-prime/`
  - from `brand/`: `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `og-image.png`, `logo-dark.svg`, `logo-light.svg`, and `mark.svg` → the public root, under the same names
- `scripts/serve.mjs`: a static server that also applies Netlify's `_headers` file, so the end-to-end tests run under the real policy.
  - `export function parseHeaders(text)` returns `Array<{ pattern, headers }>`. It reads Netlify's format: a path line, then indented `Name: value` lines.
  - `export function createStaticServer(root)` returns a `node:http` Server.
  - `/` serves `index.html`. A missing path serves `404.html` with status 404, and so does any path that escapes `root`.
  - The headers of every matching pattern apply, where `/*` matches everything.
  - Content types by extension:

    | Extension | Content type |
    |---|---|
    | `.html` | `text/html; charset=utf-8` |
    | `.js` | `text/javascript` |
    | `.css` | `text/css` |
    | `.json` | `application/json` |
    | `.webmanifest` | `application/manifest+json` |
    | `.svg` | `image/svg+xml` |
    | `.png` | `image/png` |
    | `.ico` | `image/x-icon` |
    | `.woff2` | `font/woff2` |
    | `.ttf` | `font/ttf` |
    | `.txt` | `text/plain; charset=utf-8` |
  - Run directly as `node scripts/serve.mjs <root> <port>`.
- `apps/web/package.json`: name `@drafter/web`, `"private": true`, `"type": "module"`.
  - Scripts:
    - `dev`: `node scripts/sync-assets.mjs && nuxt dev`
    - `build`: `node scripts/sync-assets.mjs && nuxt generate`
    - `preview`: `node scripts/serve.mjs .output/public 4173`
    - `e2e`: `pnpm build && playwright test`
    - `test`: `vitest run`
    - `typecheck`: `nuxt typecheck`
    - `postinstall`: `nuxt prepare`
  - Dependencies: `nuxt ^4.6.2`, `vue ^3.5.44`, `vue-router ^5.4.0`, `@nuxt/ui ^4.12.0`, `tailwindcss ^4.3.3`, and `@iconify-json/lucide ^1.2.147`.
  - Dev dependencies: `vue-tsc ^3.3.13`, `@playwright/test ^1.64.1`, and `@axe-core/playwright ^4.14.0`.

- [ ] **Step 1: Write the dependency entries first.** In `docs/DEPENDENCIES.md`, add a section "## The app (`apps/web`)", with a row each for:
  - `nuxt`, `vue`, and `vue-router`: the app framework, a general-purpose web framework
  - `@nuxt/ui` and `tailwindcss`: components and styling. Nuxt UI brings `@nuxt/icon`, `@nuxtjs/color-mode`, and `@nuxt/fonts`; Drafter turns `@nuxt/fonts` off.
  - `@iconify-json/lucide`: icon data, bundled into the build so no icon is fetched at runtime
  - `vue-tsc`: type-checking `.vue` files
  - `@playwright/test` and `@axe-core/playwright`: end-to-end and accessibility tests

  Add Inter Tight's variable WOFF2 to the Fonts table, under the SIL Open Font License. Every row says it isn't a screenwriting tool.
- [ ] **Step 2: Add the workspace, the app's package file, and its configuration.**
  - Add `apps/web/package.json` as specified, and add `apps/*` to the workspace.
  - Run `pnpm install`. If pnpm reports ignored build scripts for a package the Nuxt build needs, list that package under `onlyBuiltDependencies` in `pnpm-workspace.yaml`.
  - `apps/web/tsconfig.json` is Nuxt 4's project-references file: `"files": []` and references to `./.nuxt/tsconfig.app.json`, `./.nuxt/tsconfig.server.json`, `./.nuxt/tsconfig.shared.json`, and `./.nuxt/tsconfig.node.json`.
  - `apps/web/.gitignore` ignores `public/fonts/` and each brand file `ASSETS` writes.
- [ ] **Step 3: Fetch Inter Tight.** Request `https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400..800&display=swap` with a current Chrome user-agent string. Download the `latin` and `latin-ext` WOFF2 files it names: `NGSwv5HMAFg6IuGlBNMjxLsH8ahuQ2e8.woff2` and `NGSwv5HMAFg6IuGlBNMjxLsJ8ahuQ2e8Smg.woff2` under `fonts.gstatic.com/s/intertight/v9/`. Save them as `InterTight-latin.woff2` and `InterTight-latin-ext.woff2`. Copy `brand/fonts/OFL.txt` beside them, and write a `README.md` that records the source address, the date, and each file's SHA-256, as `brand/README.md` does.
- [ ] **Step 4: Write the failing unit tests.**
  ```ts
  // apps/web/test/sync-assets.test.ts
  test('copies every Courier Prime style and brand icon into public', async () => {
    const out = await mkdtemp(join(tmpdir(), 'drafter-public-'));
    const written = await syncAssets(repoRoot, out);
    expect(written).toHaveLength(ASSETS.length);
    for (const { from, to } of ASSETS)
      expect(await readFile(join(out, to))).toEqual(await readFile(join(repoRoot, from)));
  });
  test('can run twice', async () => { /* second syncAssets into the same dir resolves */ });

  // apps/web/test/serve.test.ts
  test('parses Netlify _headers', () => {
    expect(parseHeaders('/*\n  X-A: 1\n  X-B: two words\n/_nuxt/*\n  Cache-Control: immutable\n')).toEqual([
      { pattern: '/*', headers: { 'X-A': '1', 'X-B': 'two words' } },
      { pattern: '/_nuxt/*', headers: { 'Cache-Control': 'immutable' } },
    ]);
  });
  test('serves index.html for /, 404.html for a missing path, and applies headers', /* temp root with index.html, 404.html, _headers */);
  test('never serves a file outside its root', /* GET /../package.json → 404 */);
  test('sends fonts with font content types', /* .woff2 → font/woff2, .ttf → font/ttf */);
  ```
  `apps/web/vitest.config.ts` merges `../../vitest.shared.ts` with `defineProject({ test: { name: 'web', include: ['test/**/*.test.ts'] } })`.
- [ ] **Step 5: Run them.** `pnpm vitest run --project web` → FAIL, because the modules don't exist yet.
- [ ] **Step 6: Implement `syncAssets` and the static server** in `scripts/sync-assets.mjs` and `scripts/serve.mjs`, using only `node:` modules.
- [ ] **Step 7: Run them again.** `pnpm vitest run --project web` → PASS.
- [ ] **Step 8: Configure Nuxt.** `apps/web/nuxt.config.ts`:
  ```ts
  import { OG_IMAGE, SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from './site';

  export default defineNuxtConfig({
    compatibilityDate: '2026-10-25',
    modules: ['@nuxt/ui'],
    css: ['~/assets/css/main.css'],
    ui: { fonts: false },
    colorMode: { preference: 'dark', fallback: 'dark' },
    icon: { provider: 'none', clientBundle: { scan: true } },
    routeRules: { '/': { ssr: false } },
    devtools: { enabled: false },
    telemetry: false,
    app: {
      head: {
        htmlAttrs: { lang: 'en' },
        title: SITE_TITLE,
        meta: [
          { name: 'description', content: SITE_DESCRIPTION },
          { name: 'theme-color', content: '#0F1013' },
          { property: 'og:type', content: 'website' },
          { property: 'og:site_name', content: 'Drafter' },
          { property: 'og:title', content: SITE_TITLE },
          { property: 'og:description', content: SITE_DESCRIPTION },
          { property: 'og:url', content: `${SITE_URL}/` },
          { property: 'og:image', content: OG_IMAGE },
          { property: 'og:image:width', content: '1200' },
          { property: 'og:image:height', content: '630' },
          { property: 'og:image:alt', content: SITE_TITLE },
          { name: 'twitter:card', content: 'summary_large_image' },
          { name: 'twitter:title', content: SITE_TITLE },
          { name: 'twitter:description', content: SITE_DESCRIPTION },
          { name: 'twitter:image', content: OG_IMAGE },
        ],
        link: [
          { rel: 'canonical', href: `${SITE_URL}/` },
          { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
          { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
          { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        ],
      },
    },
  });
  ```
  - `app/app.vue` wraps `<NuxtPage />` in `<UApp>`.
  - `app/pages/index.vue` renders a heading, "Drafter", for now.
  - `app/assets/css/main.css` imports `tailwindcss` and then `@nuxt/ui`, and declares these faces:
    - Inter Tight from the two WOFF2 files: `font-weight: 400 800`, `font-display: swap`. The `unicode-range` values are the `latin` and `latin-ext` ranges from the Google Fonts CSS fetched in Step 3.
    - Courier Prime's four styles from `/fonts/courier-prime/…ttf`, with `font-display: block`.
    - `@theme { --font-sans: "Inter Tight", ui-sans-serif, system-ui, sans-serif; --font-mono: "Courier Prime", ui-monospace, monospace; }`
  - `app/spa-loading-template.html` holds, verbatim, `<main class="drafter-boot"><img src="/mark.svg" alt="" width="48" height="48"><h1>Drafter</h1><p>…SITE_DESCRIPTION…</p></main>`, with the description's exact text. It's what search engines and people without JavaScript see before the app mounts.
- [ ] **Step 9: Lint `.vue` files.** Add this override to `biome.json`. It's Biome's documented way to avoid false positives in single-file components while `html.experimentalFullSupportEnabled` is off.
  ```json
  "overrides": [{ "includes": ["**/*.vue"], "linter": { "rules": {
    "style": { "useConst": "off", "useImportType": "off" },
    "correctness": { "noUnusedVariables": "off", "noUnusedImports": "off" } } } }]
  ```
- [ ] **Step 10: Write the failing end-to-end tests.**
  - `apps/web/playwright.config.ts`:
    - `testDir: 'e2e'`
    - the projects `chromium` (Desktop Chrome), `firefox` (Desktop Firefox), `webkit` (Desktop Safari), and `phone` (Pixel 7)
    - `use.baseURL: 'http://localhost:4173'`
    - `webServer: { command: 'node scripts/serve.mjs .output/public 4173', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI }`
  ```ts
  // apps/web/e2e/home.spec.ts
  test('serves the page shell with Drafter’s metadata', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toContain(`<title>${SITE_TITLE}</title>`);
    expect(html).toContain(`<meta name="description" content="${SITE_DESCRIPTION}">`);
    expect(html).toContain(`<meta property="og:image" content="${OG_IMAGE}">`);
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/">`);
    expect(html).toContain(SITE_DESCRIPTION.slice(0, 60)); // the loading template's text, in the raw HTML
  });
  test('starts in the dark theme', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  });
  test('serves fonts from the same origin', async ({ page, request }) => {
    await page.goto('/');
    expect(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px "Inter Tight"'); })).toBe(true);
    const ttf = await request.get('/fonts/courier-prime/CourierPrime-Regular.ttf');
    expect(ttf.status()).toBe(200);
    expect(ttf.headers()['content-type']).toBe('font/ttf');
  });
  ```
  Nuxt may write the meta tags with attributes in a different order or with a closing `/>`. If it does, match each tag with a regular expression, not by changing the values.
- [ ] **Step 11: Install browsers and run.** Run `pnpm --filter @drafter/web exec playwright install chromium firefox webkit`, then `pnpm e2e`. All tests pass in all four projects.
- [ ] **Step 12: Check the rest.** `pnpm test` passes for every project, `pnpm --filter @drafter/web typecheck` and `pnpm check` exit 0, and the generated `apps/web/.output/public/index.html` exists.
- [ ] **Step 13: Record and commit.**
  - In `docs/DECISIONS.md`, under `## apps/web`, record two decisions:
    - **Courier Prime on screen.** The screen uses the same TTF files the PDF embeds, so screen and print metrics match. Inter Tight is self-hosted as a variable WOFF2.
    - **Icons.** `@nuxt/icon` runs with `provider: 'none'` and a scanned client bundle.
  - Add a CHANGELOG entry under Added.
  - Commit: `feat(web): scaffold the Nuxt app for drafter.dev`.

---

### Task 3: Netlify configuration and the content security policy

**Files:**
- Create: `apps/web/netlify.toml`, `apps/web/scripts/csp.mjs`
- Modify: `apps/web/package.json` (the `build` script becomes `node scripts/sync-assets.mjs && nuxt generate && node scripts/csp.mjs .output/public`), `docs/DECISIONS.md`, `CHANGELOG.md`, `README.md` (a short "Deployment" paragraph under Development)
- Test: `apps/web/test/csp.test.ts`, `apps/web/e2e/security.spec.ts`

**Interfaces:**
- Consumes: `createStaticServer` from Task 2, which applies `_headers` in the tests.
- Produces, in `scripts/csp.mjs`:
  - `inlineHashes(html)` returns `{ scripts: string[], styles: string[] }`, each value in the form `'sha256-…'`, base64 of the SHA-256 of the element's exact text.
    - Scripts: every inline `<script>` with no `src` whose `type` is absent, `text/javascript`, `module`, or `importmap`. JSON types are skipped.
    - Styles: every `<style>`.
  - `contentSecurityPolicy(scriptHashes)` returns the policy string below.
  - `headersFile(scriptHashes)` returns the `_headers` text.
  - `writeHeaders(publicDir)` hashes every `.html` file under `publicDir`, sorts and de-duplicates the script hashes, writes `publicDir/_headers`, and resolves to the hashes.
  - Run directly, it writes `.output/public/_headers`.

The policy, exactly, with the hashes joined by spaces where `<hashes>` stands:

```
default-src 'self'; script-src 'self' <hashes>; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'
```

`headersFile` writes, for `/*`:

| Header | Value |
|---|---|
| `Content-Security-Policy` | the policy above |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

It also writes `Cache-Control: public, max-age=31536000, immutable` for `/_nuxt/*`, and `Cache-Control: public, max-age=604800` for `/fonts/*`.

- [ ] **Step 1: Write the failing unit tests.**
  ```ts
  // apps/web/test/csp.test.ts
  test('hashes an inline script by its exact text', () => {
    expect(inlineHashes('<script>alert(1)</script>').scripts).toEqual(["'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='"]);
  });
  test('hashes module scripts and import maps, skips external and JSON scripts', () => {
    const html = '<script src="/a.js"></script><script type="application/json">{}</script>'
      + '<script type="module">console.log("drafter")</script><script type="importmap">alert(1)</script>';
    expect(inlineHashes(html).scripts).toEqual([
      "'sha256-VdIjA7RcGlAMlha0KwNIywkhItnIinF5FbBU63ckpoc='", "'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='"]);
  });
  test('builds the policy with every script hash and no unsafe-inline for scripts', () => {
    const csp = contentSecurityPolicy(["'sha256-a'", "'sha256-b'"]);
    expect(csp).toContain("script-src 'self' 'sha256-a' 'sha256-b';");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).toContain("connect-src 'self';");
  });
  test('writes _headers once for every page in the publish directory', /* temp dir, two pages sharing a script: one hash, CSP under /* */);
  ```
- [ ] **Step 2: Run them.** `pnpm vitest run --project web` → FAIL.
- [ ] **Step 3: Implement `scripts/csp.mjs`** with `node:crypto`, `node:fs/promises`, and a small scanner over `<script…>…</script>` and `<style…>…</style>`. HTML parsing libraries aren't needed: the input is Nuxt's own generated output.
- [ ] **Step 4: Run them again.** `pnpm vitest run --project web` → PASS.
- [ ] **Step 5: Add `apps/web/netlify.toml`.** Netlify reads it from the package directory, `apps/web`, and runs the build from the repository root.
  ```toml
  # Netlify site settings: package directory apps/web, base directory empty.
  # The build runs from the repository root, where pnpm installs the workspace.
  [build]
    command = "pnpm --filter @drafter/web... run build"
    publish = "apps/web/.output/public"

  [build.environment]
    NODE_VERSION = "22"
  ```
- [ ] **Step 6: Write the failing end-to-end tests.**
  ```ts
  // apps/web/e2e/security.spec.ts
  test('sends the content security policy', async ({ request }) => {
    const csp = (await request.get('/')).headers()['content-security-policy'];
    expect(csp).toMatch(/^default-src 'self'; script-src 'self'( 'sha256-[^']+')+;/);
  });
  test('loads with no CSP violations', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__violations = [];
      document.addEventListener('securitypolicyviolation', (e) => (window as any).__violations.push(e.violatedDirective));
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => (window as any).__violations)).toEqual([]);
  });
  test('restores the light theme before the page body exists', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('nuxt-color-mode', 'light');
      new MutationObserver((records, observer) => {
        (window as any).__firstTheme = { className: document.documentElement.className, bodyExists: !!document.body };
        observer.disconnect();
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    });
    await page.goto('/');
    expect(await page.evaluate(() => (window as any).__firstTheme)).toEqual({ className: expect.stringMatching(/\blight\b/), bodyExists: false });
  });
  ```
- [ ] **Step 7: Run them.** `pnpm e2e` → the new tests FAIL, because there is no `_headers` yet.
- [ ] **Step 8: Wire the hashing into the build.** Add the `csp.mjs` step to the `build` script, then run `pnpm e2e` → all pass in all four projects. If a violation names `style-src-attr` or `style-src-elem`, the policy is wrong: styles are allowed inline by design. Fix the policy, not the test.
- [ ] **Step 9: Record and document.**
  - In `docs/DECISIONS.md`, record two decisions:
    - **Styles may be inline.** The policy is `style-src 'self' 'unsafe-inline'` because Nuxt UI, color mode, and the tour module add style elements at runtime. Scripts stay locked to hashes computed after the build (technical design §14).
    - **The theme lives in localStorage,** through `@nuxtjs/color-mode`, not IndexedDB as design §8 has it, because it must be read before first paint.
  - In `README.md`, add a "Deployment" paragraph: drafter.dev deploys on Netlify. Its settings live in `apps/web/netlify.toml`, and the site's package directory is `apps/web`.
  - Add a CHANGELOG entry under Added.
- [ ] **Step 10: Commit and push.** `git commit -m "feat(web): add the Netlify configuration and the content security policy"`, then `git push`.
- [ ] **Step 11: Tell the maintainer that Netlify can be relinked now.** Give them these steps:
  1. With Stop auto publishing still on, link the site to `cschweda/drafter`.
  2. Under "Site to deploy", choose `apps/web`. If it isn't listed, choose "Other (configure manually)" and set the package directory to `apps/web`, leaving the base directory empty.
  3. Keep `main` as the production branch.
  4. Add `phase-1` under Branch deploys. Its preview then appears at `phase-1--<site name>.netlify.app`.

  Wait for their go-ahead before Task 4 only if they ask to check the preview first.

---

### Task 4: The IDE shell — layout, panes, and themes

**Files:**
- Create:
  - `apps/web/app/assets/css/tokens.css`
  - `apps/web/app/utils/panes.ts`
  - `apps/web/app/composables/usePanes.ts`
  - in `apps/web/app/components/`: `AppToolbar.vue`, `AppPane.vue`, `PaneDivider.vue`, and `AppStatusBar.vue`
  - `apps/web/app/app.config.ts`
- Modify: `apps/web/app/pages/index.vue`, `apps/web/app/assets/css/main.css` (import `tokens.css`), `apps/web/nuxt.config.ts` (`alias: { '#samples': fileURLToPath(new URL('../../samples', import.meta.url)) }`), `docs/DECISIONS.md`, `CHANGELOG.md`
- Test: `apps/web/test/panes.test.ts`, `apps/web/test/tokens.test.ts`, `apps/web/e2e/shell.spec.ts`

**Interfaces (Produces):**
- `app/utils/panes.ts`:
  ```ts
  export type TabId = 'source' | 'script' | 'problems';
  export type PaneId = 'left' | 'right';
  export interface PaneTabs { left: TabId; right: TabId }
  export const TABS: ReadonlyArray<{ id: TabId; label: string }>; // Source, Script, Problems, in that order
  export const DEFAULT_TABS: PaneTabs; // { left: 'source', right: 'script' }
  export const PHONE_DEFAULT_TAB: TabId; // 'script'
  export const SPLIT: { min: 0.25; max: 0.75; step: 0.05; initial: 0.5 };
  export function chooseTab(tabs: PaneTabs, pane: PaneId, tab: TabId): PaneTabs; // the swap rule, design §5.1
  export function otherPane(pane: PaneId): PaneId;
  export function clampSplit(ratio: number): number; // NaN → initial
  ```
- `usePanes()` returns `{ tabs, phoneTab, split, choose(pane, tab), resize(ratio) }`, held in `useState` and not persisted.
- `data-tour` attributes for Plan 5's tour:
  - on the toolbar: `save`, `export`, `focus`, `template`, and `palette`
  - on each tab's panel: `source`, `script`, and `problems`
  - on the status bar: `status`

Design tokens. `tokens.css` declares them on `:root, .dark` for the dark theme and on `.light` for the light one. They're the mockup's values, with the faint tones and the light goldenrod darkened to pass contrast:

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#0F1013` | `#F4F4F2` |
| `--chrome` | `#15171C` | `#FFFFFF` |
| `--chrome-2` | `#1A1D23` | `#F7F7F5` |
| `--line` | `#262A31` | `#E2E4E8` |
| `--text` | `#E6E8EC` | `#1C1D21` |
| `--muted` | `#8C93A1` | `#5F6575` |
| `--faint` | `#7A8191` | `#656B7A` |
| `--gutter` | `#7A8191` | `#656B7A` |
| `--tab-on` | `#23272F` | `#ECEDEF` |
| `--desk` | `#0B0C0F` | `#E9E9E6` |
| `--page` | `#1B1E25` | `#FFFFFF` |
| `--ink` | `#E8EAEE` | `#1C1C1C` |
| `--ink-muted` | `#9AA1AE` | `#5C6270` |
| `--heading` | `#E5B04A` | `#8A5A00` |
| `--cue` | `#8DB8E8` | `#2F6DB5` |
| `--paren` | `#8C93A1` | `#5F6575` |
| `--trans` | `#F5A9C0` | `#B23A68` |
| `--note` | `#9BD3A0` | `#2E7D4F` |
| `--title` | `#F49C84` | `#B5502F` |

`app.config.ts` sets Nuxt UI's colors to `{ primary: 'amber', neutral: 'zinc' }`, the closest built-in palettes. The exact goldenrod is applied through the tokens.

- [ ] **Step 1: Write the failing unit tests.**
  ```ts
  // apps/web/test/panes.test.ts
  test('starts with Source on the left and Script on the right', () => expect(DEFAULT_TABS).toEqual({ left: 'source', right: 'script' }));
  test('shows a tab in the chosen pane', () => expect(chooseTab(DEFAULT_TABS, 'right', 'problems')).toEqual({ left: 'source', right: 'problems' }));
  test('swaps when the tab is open in the other pane', () => expect(chooseTab(DEFAULT_TABS, 'right', 'source')).toEqual({ left: 'script', right: 'source' }));
  test('changes nothing when the tab is already in that pane', () => expect(chooseTab(DEFAULT_TABS, 'left', 'source')).toEqual(DEFAULT_TABS));
  test('keeps the split between a quarter and three quarters', () => {
    expect([clampSplit(0.1), clampSplit(0.9), clampSplit(0.5), clampSplit(Number.NaN)]).toEqual([0.25, 0.75, 0.5, 0.5]);
  });

  // apps/web/test/tokens.test.ts — reads tokens.css, computes WCAG 2 contrast from relative luminance
  const TEXT_PAIRS: Array<[string, string, number]> = [
    ['--text', '--bg', 4.5], ['--text', '--chrome', 4.5], ['--muted', '--bg', 4.5], ['--muted', '--chrome', 4.5],
    ['--muted', '--chrome-2', 4.5], ['--faint', '--bg', 4.5], ['--faint', '--chrome', 4.5], ['--gutter', '--bg', 4.5],
    ['--heading', '--bg', 4.5], ['--cue', '--bg', 4.5], ['--paren', '--bg', 4.5], ['--trans', '--bg', 4.5],
    ['--note', '--bg', 4.5], ['--title', '--bg', 4.5], ['--ink', '--page', 4.5], ['--ink-muted', '--page', 4.5],
    ['--heading', '--chrome', 3], // the active tab's underline
  ];
  test.each(['dark', 'light'])('every text color has enough contrast in the %s theme', (theme) => { /* each pair ≥ its minimum */ });
  ```
  The pairs also set where each color may be used: `--faint` only on `--bg` and `--chrome`, never on `--chrome-2` or a page.
- [ ] **Step 2: Run them.** `pnpm vitest run --project web` → FAIL.
- [ ] **Step 3: Implement `panes.ts` and `tokens.css`.** Run the tests again → PASS.
- [ ] **Step 4: Write the failing end-to-end tests.** Locate elements by role and name: each pane's tab list is labeled "Left pane" or "Right pane".
  ```ts
  // apps/web/e2e/shell.spec.ts — desktop projects
  test('shows Source on the left and Script on the right', …);   // aria-selected tabs in each tablist
  test('swaps panes when a tab open in the other pane is chosen', …); // click Right pane › Source → left shows Script
  test('moves focus between the panes with F6', …);                // focus left panel, F6 → focus inside right panel, F6 → left
  test('resizes the panes with the keyboard', …);                  // separator "Resize panes": aria-valuenow 50, ArrowLeft → 45, Home → 25, End → 75
  test('switches to the light theme and remembers it', …);         // toolbar "Switch to light theme" → html.light; reload → html.light
  test('has no accessibility violations in either theme', …);      // AxeBuilder withTags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa → [] dark, then light
  test('shows a focus ring on every control', …);                  // Tab through toolbar, tabs, divider: each focused element's outline-style or box-shadow is not 'none'
  // phone project
  test('shows one pane with all three tabs on a phone', …);        // one tablist: Source, Script, Problems; Script selected
  test('fits a 360px screen without horizontal scrolling', …);     // viewport 360×740: scrollWidth <= innerWidth
  test('has no accessibility violations on a phone', …);
  ```
- [ ] **Step 5: Run them.** `pnpm e2e` → the new tests FAIL.
- [ ] **Step 6: Build the shell.** `pages/index.vue` composes it as a grid: toolbar, panes, status bar, at `height: 100dvh`.
  - **Panes:** the grid columns are `calc(var(--split) * 100%) 6px 1fr`.
  - **Phone layout:** at widths below 1024px (Tailwind's `lg`), one pane shows, with a single tab row.
  - **`AppPane`:** a tab list with `role="tablist"` and `aria-label` "Left pane" or "Right pane". Tabs have `role="tab"`, `aria-selected`, and `aria-controls`, and use manual activation: arrow keys move focus, and Enter or Space chooses. Under the tabs sit the slim bar and the panel, with `role="tabpanel"` and `tabindex="-1"`.
  - **`PaneDivider`:** `role="separator"` with `aria-orientation="vertical"`, `aria-label="Resize panes"`, and `aria-valuenow` in whole percent (min 25, max 75), plus `tabindex="0"`.
    - ArrowLeft and ArrowRight move it by `SPLIT.step`; Home and End jump to the limits.
    - It can also be dragged with a pointer.
  - **F6:** a window `keydown` handler moves focus to the other pane's panel. On a phone it does nothing.
  - **`AppToolbar`:**
    - the logo: `/logo-dark.svg` in the dark theme and `/logo-light.svg` in the light one, as `<img alt="Drafter">`
    - Open, Save, Export, and Focus as round, labeled buttons, disabled with `aria-disabled="true"` until Plans 3 and 4 wire them
    - a disabled template button reading "US Screenplay"
    - a disabled palette button reading "Go to scene or command ⌘K"
    - the theme toggle, which works now through `useColorMode()`. Its accessible name is "Switch to light theme" or "Switch to dark theme", and its visible label is "Light" or "Dark".
  - **Placeholder content:** the Source panel shows `samples/screenplay.fountain`, imported as `#samples/screenplay.fountain?raw`, in a read-only `<pre>`. The Script panel reads "Formatted pages appear here." The Problems panel reads "No problems found."
  - **`AppStatusBar`:** "Sample" on the left and "US Screenplay" on the right.
- [ ] **Step 7: Run the tests again.** `pnpm e2e` → all pass in all four projects, and `pnpm test`, `pnpm --filter @drafter/web typecheck`, and `pnpm check` are clean.
- [ ] **Step 8: Record and commit.**
  - In `docs/DECISIONS.md`, record three decisions:
    - **One pane below 1024px,** Tailwind's `lg`.
    - **Tabs activate manually,** so arrowing through them never swaps the panes.
    - **Nuxt UI's palettes are amber and zinc;** the exact brand colors come from the tokens.
  - Add a CHANGELOG entry under Added.
  - Commit `feat(web): lay out the two-pane editor shell`, and push.

---

**Plan 1 is done when** the shell builds and passes every test above in Chromium, Firefox, WebKit, and at phone size, and the `phase-1` branch deploy on Netlify shows it under the policy with no violations, once the maintainer has relinked the site.
