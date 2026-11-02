# Audits

Every audit and review of Drafter, newest first in each section. Each newer audit compares itself with the ones before it. A new audit goes at the top of its section, as a dated file in `docs/` (`<kind>-audit-YYYY-MM-DD.md`).

## Security audits

| Date | Covers | Result | Record |
|---|---|---|---|
| Pending | v0.24.2: Drafter for Claude (`packages/mcp`, the `drafter-mcp` program) and the trap documents' `mcp` entry point | **Pending its audit.** Built read-only with path, size, no-write, no-fetch, and no-run traps run on every pull request; a security review of the server, its paths, its worker, and the bundle comes before or with the release | [`DECISIONS.md`](DECISIONS.md), "Drafter for Claude"; [the trap documents](../fixtures/trap/README.md) |
| 2026-11-01 | `9cd506d` (v0.24.0 and the clean-room audit), and the `story-map` branch at `04f4306`: the first formal security audit, of the web app, the desktop app, the command line, the build, and the docs | **Pass with findings, all addressed the same day.** No exploitable hole; nothing leaves the device (no outside request in three browsers); the trap suite passes. Fixed: private vulnerability reporting is on, the desktop's drop grant takes an id main gave out instead of a path, Nuxt 4.6.3 (`pnpm audit --prod` 25 to 20, the rest in tooling), Dependabot, the `v-html` sentence, and CI checkouts without a kept token. HSTS and unsigned updates stay known limits (DEFERRED). Compares itself with the three reviews below, area by area | [The audit](security-audit-2026-11-01.md) |
| 2026-11-01 | v0.23.2: the trap documents, and the hardening they led to | 258 deliberately broken and hostile files, in every format Drafter opens; each must open with its text or be refused with a plain message, and nothing may crash, run, fetch, or use unbounded memory. Run in CI on every push and release | [The trap documents](../fixtures/trap/README.md); the README's [Security](../README.md#security) section; [`DECISIONS.md`](DECISIONS.md), "The trap documents" |
| 2026-11-01 | v0.23.1: reopenable HTML and EPUB exports | A review of reading a script back out of an export: only the embedded source is read, as text, with size caps before anything is unpacked; its fixes landed before the release | [`DECISIONS.md`](DECISIONS.md), "Reopenable HTML and EPUB exports" |
| 2026-10-27 | v0.4.0: the desktop app's modules folder and updates | A review of the desktop app before its first release: WebRTC closed for every renderer, folder modules kept apart from built-in ones, and unsigned updates checked by SHA-512 | [`DECISIONS.md`](DECISIONS.md), "After the security review (2026-10-27)" |

## Clean-room audits

Checks that Drafter holds no code from other screenwriting software, no Fountain library, and nothing copied from anywhere; the rules are in [Clean-room implementation](clean-room.md).

| Date | Covers | Result | Record |
|---|---|---|---|
| 2026-11-01 | `6af51a7`..`aa6a817` (v0.3.1 to v0.24.0), and the `story-map` branch at `860e417` | **Pass with findings.** No copied code, no screenwriting package, no GPL code shipped, every format fixture synthetic. To fix: a film catchphrase back in one test, and an unrecorded source for 18 Final Draft element names. Compares itself with the audit below, check by check | [The audit](clean-room-audit-2026-11-01.md) |
| 2026-10-27 | `main` at `6af51a7` (after v0.3.0), and the desktop branches | **Pass with fixes.** No copied code, no screenwriting or Fountain dependency, no copyleft code shipped. Fixed straight after: a film catchphrase in a fixture, and one sentence in the architecture document | [The audit](clean-room-audit-2026-10-27.md) |

## Accessibility

| Date | Covers | Result | Record |
|---|---|---|---|
| 2026-10-28 | v0.9.0: the accessibility pass, the last step of Phase 1, web and desktop | Automated checks only: axe tests run by default in every browser project and both themes. NVDA and VoiceOver passes are still to come, and no page claims WCAG conformance | [`DECISIONS.md`](DECISIONS.md), "The accessibility pass" |
