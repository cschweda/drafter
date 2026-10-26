# Dependencies

Drafter takes as few dependencies as it can, and none from the screenwriting domain: no Fountain parsers, no screenplay formatters, no other screenwriting application's libraries. The README's [clean-room section](../README.md#clean-room-implementation) explains why.

Every dependency is listed here with the reason it's needed. A new one gets an entry **before** it's added, saying why it's needed and confirming that it isn't a screenwriting tool or a Fountain library. If you're unsure whether a package counts, don't use it.

## Runtime

| Package | Depends on | Why |
|---|---|---|
| `@drafter/fountain` | nothing | The parser is self-contained. |
| `@drafter/templates` | `@drafter/fountain` | Types only (`Block`, `BlockKind`); nothing from it runs. |
| `@drafter/layout` | `@drafter/fountain`, `@drafter/templates` | Reads parsed documents and resolves roles. |
| `@drafter/render-pdf` | `@drafter/layout`, `@drafter/templates`, `pdf-lib`, `@pdf-lib/fontkit` | Writing PDF files, from layouts, at the template's paper size. pdf-lib can only embed the 14 standard PDF fonts without fontkit, and Drafter embeds Courier Prime. General-purpose PDF libraries, not screenwriting tools. Its tests also use `@drafter/fountain`, as a development dependency. |
| `@drafter/render-text` | `@drafter/layout`, `@drafter/templates` | Writing layouts as fixed-width text, on the template's character grid. Types only (`Layout`, `LayoutLine`, `Template`); nothing from them runs. Its tests also use `@drafter/fountain`, as a development dependency. |
| `@drafter/cli` | `@drafter/fountain`, `@drafter/templates`, `@drafter/layout`, `@drafter/render-pdf`, `@drafter/render-text`, `commander` | The engine packages it drives, and command-line argument parsing; commander is a general-purpose CLI library. |

## Development

All of these are general-purpose tools, declared once at the repository root.

| Dependency | Why |
|---|---|
| `typescript`, `@types/node` | Type-checking. |
| `tsdown` | Building each package to `dist/`. |
| `vitest` | Tests and benchmarks. |
| `fast-check` | Property tests: generated scripts and arbitrary strings. |
| `@biomejs/biome` | Formatting and linting. |
| `pdfjs-dist` | Reading text and positions back out of generated PDFs in tests. Mozilla's general-purpose PDF reader. |

## The app (`apps/web`)

The app's own dependencies, declared in `apps/web/package.json`. None is a screenwriting tool or a Fountain library.

| Dependency | Why |
|---|---|
| `nuxt`, `vue`, `vue-router` | The app framework: Nuxt builds drafter.dev as static files with Vue and its router. General-purpose web frameworks. |
| `@nuxt/ui`, `tailwindcss` | Components (tabs, menus, dialogs, the command palette) and styling. Nuxt UI brings `@nuxt/icon`, `@nuxtjs/color-mode`, and `@nuxt/fonts`; Drafter turns `@nuxt/fonts` off and serves its own fonts. General-purpose UI libraries. |
| `@iconify-json/lucide` | Icon data for the Lucide set Nuxt UI uses, bundled into the build so no icon is fetched at runtime. Icons, not code. |
| `vue-tsc` (development) | Type-checking `.vue` files, through `nuxt typecheck`. |
| `@playwright/test`, `@axe-core/playwright` (development) | End-to-end tests in Chromium, Firefox, and WebKit, and automated accessibility checks with axe. General-purpose testing tools. |

## Fonts

| Font | License | Why |
|---|---|---|
| Courier Prime (regular, bold, italic, bold italic) | SIL Open Font License 1.1 | The screenplay typeface Drafter lays out for and embeds in PDFs. A font, not code; the OFL permits embedding and redistribution, with its license file kept beside the fonts. The app serves these same files, so the screen and the PDF use identical metrics. |
| Inter Tight (variable, weights 400 to 800; latin and latin-ext WOFF2) | SIL Open Font License 1.1 | The interface typeface, from Drafter's brand. Self-hosted in `apps/web/app/assets/fonts/inter-tight/`, so nothing loads from Google at runtime. A font, not code. |
