# Decisions

Choices made where the design documents are silent, and contradictions between them, recorded as dated bullets. The technical design wins over the architecture document; the kickoff prompt wins over both for Phase 0.

## Tooling

- **2026-10-25** — Vitest 5 runs one project per package: the root `vitest.config.ts` lists `packages/*`, and each package's own `vitest.config.ts` merges `vitest.shared.ts`. Vitest 5 recommends merging a shared base rather than the root config, because a referenced config that inherits `projects` becomes a container of nested projects.
- **2026-10-25** — Workspace packages resolve to source during development: tests through exact-match aliases in `vitest.shared.ts`, and type-checking through a `source` export condition (`customConditions` in `tsconfig.base.json`). Builds and published packages use `dist/`.
- **2026-10-25** — Biome formats with 2-space indents, single quotes, and 100-column lines. It skips Markdown, which Biome 2.6 now formats and would restyle the design documents, and the generated lockfile. The linter uses `"preset": "recommended"`; `biome migrate` turned the old `"recommended": true` into `"preset": "none"`, which disables every rule.
- **2026-10-25** — tsdown builds with `fixedExtension: false`, so packages ship `index.js` and `index.d.ts` (ESM through `"type": "module"`) rather than `.mjs` and `.d.mts`.
- **2026-10-25** — Vitest 5 made `bench` a test-context fixture; `pnpm bench` runs `vitest bench --run` across the projects.
- **2026-10-25** — Property tests set `size: 'max'` on array arbitraries: fast-check's default size caps generated arrays at about ten items, whatever `maxLength` says.
- **2026-10-25** — Tests compare documents through `toJSON`, because `sem` and `inline` are lazy getters that deep equality doesn't read.
