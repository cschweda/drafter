# Changelog

All notable changes to Drafter are recorded here, and every push updates this file. Add entries under **[Unreleased]**, grouped as Added, Changed, Deprecated, Removed, Fixed, or Security. The pre-push hook in `.githooks/` rejects a push when none of its commits touch this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and packages follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Nothing has been released yet. When a release is cut, its entries move from [Unreleased] into a new section headed with the version and date.

## [Unreleased]

### Added

- Design documents in `docs/`: the high-level architecture, the technical design, and the Phase 0 kickoff prompt.
- README covering the vision, principles, architecture, packages, and the phased roadmap.
- MIT license.
- `.nvmrc` pinning Node 22.
- `.gitignore` for a pnpm, Node, and Nuxt monorepo.
- Pre-push hook (`.githooks/pre-push`) that rejects a push unless at least one of its commits updates this changelog.

[Unreleased]: https://github.com/cschweda/drafter/commits/main
