# Security

Drafter opens files from anyone, so its security matters. Thank you for helping keep it safe.

## Reporting a problem

Please report a security problem privately, not in a public issue:

1. Open the repository's **Security** tab on GitHub: <https://github.com/cschweda/drafter/security>.
2. Choose **Report a vulnerability**, and say what you found, how to make it happen (a small file
   that shows it is ideal), and what it lets someone do.

If the **Report a vulnerability** button isn't there, open an issue that says only "Security
report: please contact me" (no details), and the maintainer will reach you privately.

Only the maintainer sees the report. You'll hear back there, and the fix and its credit, if you'd
like it, go in the changelog once it is out.

## What is covered

The web app at drafter.dev, the desktop app, the `drafter` command line, and the packages in this
repository: above all, anything a file opened in Drafter can make it do (run code, read or fetch
something it shouldn't, hang, or use unbounded memory). Drafter is tested against a suite of such
files, the [trap documents](fixtures/trap/README.md); a file that gets past them is just what to
report.

The latest release is the one supported: fixes go into the next release.

## How Drafter defends itself

The README's [Security](README.md#security) section says it in plain words, and
[Technical details](docs/technical-details.md#security) gives the specifics.
