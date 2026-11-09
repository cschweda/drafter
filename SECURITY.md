# Security

Drafter opens files from anyone, so its security matters. Thank you for helping keep it safe.

## Reporting a problem

Please report a security problem privately, not in a public issue:

1. Open the repository's **Security** tab on GitHub: <https://github.com/cschweda/drafter/security>.
2. Choose **Report a vulnerability**, and say what you found, how to make it happen (a small file
   that shows it is ideal), and what it lets someone do.

Or, if you'd rather not use GitHub: Email cschweda@gmail.com with the details.

Please don't open a public issue for a security problem. Drafter's About → Report a problem… opens
a public one, so it points here instead. Only the maintainer sees a private report or an email.
You'll hear back the same way, and the fix and its credit, if you'd like it, go in the changelog
once it is out.

## What is covered

The web app at drafter.dev, the desktop app, the `drafter` command line, and the packages in this
repository: above all, anything a file opened in Drafter can make it do (run code, read or fetch
something it shouldn't, hang, or use unbounded memory). Drafter is tested against a suite of such
files, the [trap documents](fixtures/trap/README.md); a file that gets past them is just what to
report.

The latest release is the one supported: fixes go into the next release.

## How Drafter defends itself

The README's [Security](README.md#security) section says it in plain words, and
[Technical details](docs/technical-details.md#security) gives the specifics. [Audits](docs/AUDITS.md) lists the security and clean-room audits, newest first.
The latest security audit is [1 November 2026](docs/security-audit-2026-11-01.md).
