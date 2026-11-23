# Audits

Every audit and review of Drafter, newest first in each section. Each newer audit compares itself with the ones before it. A new audit goes at the top of its section, as a dated file in `docs/` (`<kind>-audit-YYYY-MM-DD.md`).

## Red/blue team audits

Adversarial audits: red-team attackers try to break one area each and prove it, and a blue team checks every finding and fixes what is real. The README's [Audit record](../README.md#audit-record) keeps the newest in full and every earlier audit in a line.

| Date | Covers | Result | Record |
|---|---|---|---|
| 2026-11-23 | `staging` at `433eb449` (v0.27.4 and the tip jar) with the work pending for v0.28.0, in five areas: the web app and its formats, the desktop app, the supply chain and release, privacy, and (never audited before) Drafter for Claude, the command line, and Classic Mode | **Pass with findings.** No attack ran code from a file or an export, reached the network from a page, or read a file the writer hadn't chosen. 64 findings: 2 high (a pull request's hook ran on the maintainer's machine at checkout, fixed; one stolen credential can still push a release, for the maintainer), 13 medium (nine small files that froze the editor or a tool, false privacy statements, leftovers after removing a script, a release cache, all fixed; a locked script's stored text, for the maintainer), and the rest low or informational. 45 fixed with tests, 3 deferred, 1 accepted. Audited again by a second team | [The audit](redblue-audit-2026-11-23.md) |
| 2026-11-03 | `main` at `d4598bfa` (v0.25.0 and the v0.25.1 work), in four areas: the web app and its formats, the desktop app, the supply chain and release, and privacy | **Pass with findings.** No attack ran code from a script, a file, or an export, got past the security policy, or reached the network from a page. Fixed with tests: Final Draft exports carrying notes (P1, High), a compromised desktop page opening an address with the script (D1, High), a Markdown file that froze the tab on every reload (W1, W2), form history, `drafter build` through a link, and more. Mitigated: the tab title (a setting), Plausible (the policy narrowed). Left for the maintainer: tag and branch rulesets, a release environment, and token scopes (S1). Compares itself with the security and privacy audits, which each attacker read first | [The audit](redblue-audit-2026-11-03.md) |

## Security audits

| Date | Covers | Result | Record |
|---|---|---|---|
| 2026-11-23 | v0.24.2's Drafter for Claude (`packages/mcp`), the command line, and v0.25.0's Classic Mode (`packages/cm-fountain/src/classic/`), which had waited for an audit | Audited as the fifth area of the red/blue audit of 23 November. No file outside the configured folders was read and no private text leaked; three ways a small file could stop the reader, a way for the command line to write over its input, and two gaps in Classic Mode's protection of the settings block were found and fixed | [The red/blue audit](redblue-audit-2026-11-23.md) |
| 2026-11-01 | `9cd506d` (v0.24.0 and the clean-room audit), and the `story-map` branch at `04f4306`: the first formal security audit, of the web app, the desktop app, the command line, the build, and the docs | **Pass with findings, all addressed the same day.** No exploitable hole; nothing leaves the device (no outside request in three browsers); the trap suite passes. Fixed: private vulnerability reporting is on, the desktop's drop grant takes an id main gave out instead of a path, Nuxt 4.6.3 (`pnpm audit --prod` 25 to 20, the rest in tooling), Dependabot, the `v-html` sentence, and CI checkouts without a kept token. HSTS and unsigned updates stay known limits (DEFERRED). Compares itself with the three reviews below, area by area | [The audit](security-audit-2026-11-01.md) |
| 2026-11-01 | v0.23.2: the trap documents, and the hardening they led to | 258 deliberately broken and hostile files, in every format Drafter opens; each must open with its text or be refused with a plain message, and nothing may crash, run, fetch, or use unbounded memory. Run in CI on every push and release | [The trap documents](../fixtures/trap/README.md); the README's [Security](../README.md#security) section; [`DECISIONS.md`](DECISIONS.md), "The trap documents" |
| 2026-11-01 | v0.23.1: reopenable HTML and EPUB exports | A review of reading a script back out of an export: only the embedded source is read, as text, with size caps before anything is unpacked; its fixes landed before the release | [`DECISIONS.md`](DECISIONS.md), "Reopenable HTML and EPUB exports" |
| 2026-10-27 | v0.4.0: the desktop app's modules folder and updates | A review of the desktop app before its first release: WebRTC closed for every renderer, folder modules kept apart from built-in ones, and unsigned updates checked by SHA-512 | [`DECISIONS.md`](DECISIONS.md), "After the security review (2026-10-27)" |

## Privacy audits

Checks that a script stays on the writer's device: nothing about it stored in the cloud, no AI, and nothing sent unless the writer sends it.

| Date | Covers | Result | Record |
|---|---|---|---|
| 2026-11-03 | v0.25.0 (`main` at `ee4de47a`) and live drafter.dev: the web app, the desktop app, the packages, Drafter for Claude, the build, the analytics, and the privacy claims in the README and the help | **Pass with findings, fixed the same day.** No server stores anything about a script; no AI anywhere; a writing session in Chromium, Firefox, and WebKit on live drafter.dev sent the script in no request. Fixed: Plausible's outbound-link events sent the whole Open on GitHub address, with what a report said (High; fixed in `d68b7ce7`, shown before and after with Plausible's own script); the browser's own spellcheck service in note and card fields (off page-wide); overstated lines in the README and the help. The first privacy audit; compares itself with the security audit's storage-and-privacy check | [The audit](privacy-audit-2026-11-03.md) |

## Clean-room audits

Checks that Drafter holds no code from other screenwriting software, no Fountain library, and nothing copied from anywhere; the rules are in [Clean-room implementation](clean-room.md).

| Date | Covers | Result | Record |
|---|---|---|---|
| 2026-11-22 | `aa6a817`..`da43bd9` (v0.24.1 to v0.27.2, and the fixes on `staging` for v0.27.3): Drafter for Claude, Classic Mode, Novel and the manuscript exports, Production, self-hosting, sentence page breaks, and the trap documents | **Pass with findings.** No copied code, no screenwriting package or format converter, no file from another app committed, and no format knowledge from an AI-written specification; every new Final Draft fact is sourced to the maintainer's real samples. To fix: a film reference back in the layout tests (the third time), and `DEPENDENCIES.md` behind the packages (two rows, six edges, one font). Records to bring up to date: the rules file says no real Highland file was checked when one was, the rule against AI-written specifications is written down nowhere, and three plans don't state the clean-room rule. Fixed the next day, with the maintainer's answers to its questions (three small values that had come from a real sample are now invented). Covers Classic Mode, which was pending. Compares itself with both audits below, check by check | [The audit](clean-room-audit-2026-11-22.md) |
| 2026-11-01 | `6af51a7`..`aa6a817` (v0.3.1 to v0.24.0), and the `story-map` branch at `860e417` | **Pass with findings.** No copied code, no screenwriting package, no GPL code shipped, every format fixture synthetic. To fix: a film catchphrase back in one test, and an unrecorded source for 18 Final Draft element names. Compares itself with the audit below, check by check | [The audit](clean-room-audit-2026-11-01.md) |
| 2026-10-27 | `main` at `6af51a7` (after v0.3.0), and the desktop branches | **Pass with fixes.** No copied code, no screenwriting or Fountain dependency, no copyleft code shipped. Fixed straight after: a film catchphrase in a fixture, and one sentence in the architecture document | [The audit](clean-room-audit-2026-10-27.md) |

## Accessibility

| Date | Covers | Result | Record |
|---|---|---|---|
| 2026-10-28 | v0.9.0: the accessibility pass, the last step of Phase 1, web and desktop | Automated checks only: axe tests run by default in every browser project and both themes. NVDA and VoiceOver passes are still to come, and no page claims WCAG conformance | [`DECISIONS.md`](DECISIONS.md), "The accessibility pass" |
