# Support Drafter: a tip jar (design)

Status: proposed 2026-11-22, for v0.28.0. Not approved yet.

## Intent

Someone who likes Drafter can leave the maintainer a tip. It is offered as thanks. The maintainer would also like it to bring in a little income, and it helps with the domain and hosting; neither is the pitch, and nothing in Drafter depends on it.

## Goals

- A writer who goes looking for a way to say thanks finds one in two clicks.
- A one-off tip and a monthly one are both possible.
- Drafter itself contacts no one new: every route is a plain link the writer may click.

## Non-goals

- Raising a target amount, or showing how much has been given.
- Anything for developers who want to fund features.

## Anti-goals

These would make it a failure even if money came in.

- **Asking.** No banner, toast, badge, dot, reminder or prompt, at any time: not at first run, not after an export, not at a word count, not in What's new.
- **A tier.** No perk, mark, thanks-list or feature for people who give. "Every part of Drafter is free" stays true and is said on the page.
- **A third party in the page.** No provider's script, button image, iframe or font. The content security policy does not change.
- **Calling it charity.** A tip to a person is not tax-deductible, and the page never says "donate" or "donation".

## Constraints

- The privacy promise ("your script stays with you") and its audit: every outside link and request is listed (README's network table, Help → Privacy, `scripts/privacy-check.mjs`). This adds links only.
- Plausible counts outbound-link clicks on drafter.dev, with the query and fragment stripped (`scripts/plausible.mjs`). The tip links carry no query, and no text of the writer's.
- The desktop app opens outside links in the system browser, as its other links do.
- A self-hosted copy ships the same page: the links go to the maintainer's pages, not the host's.

## Approaches

**A. Links only (chosen).** One help page, a line in About, a line in the README, and GitHub's funding file. Each route is a link to the provider's own page. Nothing is loaded from the provider, so the privacy audit gains one row and the content security policy is untouched. Costs the least to build and keep, and is the least visible.

**B. A, plus one line at the foot of What's new for each release.** More people see it. It is the first step towards asking, which is the first anti-goal. Not chosen.

**C. The provider's checkout in the page.** Converts best. It loads the provider's script on drafter.dev, which breaks "no outside services but one" and needs a looser content security policy. Ruled out.

## How the money is collected

The maintainer opens the accounts; Drafter only links to them. The providers take the card details and pay out; Drafter never handles payment data.

- **Ko-fi, the main route** (the builder's recommendation; the maintainer has not confirmed it). Anyone with a card or PayPal can tip, with no account, once or monthly. No platform fee on tips at the time of writing; card fees apply. Check the fees at signup.
- **GitHub Sponsors, beside it.** For people who have a GitHub account. Needs enrolment (a payout account and a tax form), which takes some days.

Two things for the maintainer, outside the build: check the employer's rules on outside income before money arrives, and treat tips as ordinary income.

The two addresses live in one place in the code (`SUPPORT_LINKS`), so a route can be added, changed or dropped in one line. A route with no address is not shown, and with none at all the page, the About line and the palette command are left out of the build.

## What is built

1. **A help page, "Support Drafter", at `/docs/support/`.** In `HELP_PAGES`, in the About dropdown after Why Drafter; prerendered like the others; opened from Help and from the palette ("Support Drafter"). Its whole text:

   > **Support Drafter**
   >
   > Drafter is free, and every part of it stays free.
   >
   > If it has been useful and you'd like to say thanks, you can leave a tip. It helps with the domain and hosting, and with the time it takes.
   >
   > [Leave a tip on Ko-fi] [Sponsor on GitHub]
   >
   > Nothing changes in Drafter whether you do or not. Each link opens the provider's own page; Drafter sends them nothing, and a tip is not tax-deductible.

   The two links are ordinary secondary buttons of the app's own, with `rel="noopener noreferrer"`.

2. **About.** One more entry in `ABOUT_LINKS`: "Support Drafter", which opens the help page (not the provider), after the existing links.

3. **README.** One line under the licence section: "Drafter is free. If you'd like to say thanks: Support Drafter", linking the help page. Nothing above the fold.

4. **`.github/FUNDING.yml`**, with `ko_fi` and `github`. It puts GitHub's Sponsor button on the repository.

5. **The privacy record.** A row in the README's network table and a sentence in Help → Privacy: the Support page links to Ko-fi and GitHub; nothing is sent unless the writer follows a link.

## Tests

- The page is prerendered, listed in Help and the palette, and passes axe in both themes (the existing help-page checks pick it up from `HELP_PAGES`).
- The content security policy is byte-for-byte what it was.
- The built page requests nothing from another origin (`privacy-check.mjs`).
- The writing screen's markup holds neither link and none of the page's words; the only ways to the page are Help, About and the palette.
- With `SUPPORT_LINKS` empty, the page, the About entry and the command are absent.

## Left to the builder

- The page's place among the About dropdown's items and its icon.
- The palette command's group and keywords ("tip", "donate", "sponsor" should find it, though the page doesn't use the word "donate").
- Wording of the privacy sentence, within what is said above.

## Needed from the maintainer before it ships

- The Ko-fi page's address, and GitHub Sponsors enrolled (or a decision to ship with one route).
