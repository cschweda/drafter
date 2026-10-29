import { noteEntries, setupsAndPayoffs } from '@drafter/notes';
import type { LintDiagnostic, Rule } from '../types';

// setup-without-payoff and payoff-without-setup (Phase 2 design §10): `[[Setup: the letter]]` and
// `[[Payoff: the letter]]` pair up by label, without regard to case or spacing. Only a later
// payoff pays a setup off. Both read the pairs through `@drafter/notes`' `setupsAndPayoffs`, as
// the Notes tab does, so they agree with it. Advice, never counted as a problem.

export const setupWithoutPayoff: Rule = {
  id: 'setup-without-payoff',
  severity: 'info',
  run: ({ doc }) => {
    const found: LintDiagnostic[] = [];
    for (const thread of setupsAndPayoffs(noteEntries(doc))) {
      // Every setup with no payoff after it: those after the label's last payoff.
      const lastPayoff = thread.payoffs.at(-1)?.span.from ?? Number.NEGATIVE_INFINITY;
      for (const setup of thread.setups) {
        if (setup.span.from < lastPayoff) continue;
        found.push({
          ruleId: setupWithoutPayoff.id,
          severity: setupWithoutPayoff.severity,
          span: { ...setup.span },
          message: `Nothing pays off the setup “${setup.note?.body ?? thread.label}” later in the script.`,
        });
      }
    }
    return found;
  },
};

export const payoffWithoutSetup: Rule = {
  id: 'payoff-without-setup',
  severity: 'info',
  run: ({ doc }) => {
    const found: LintDiagnostic[] = [];
    for (const thread of setupsAndPayoffs(noteEntries(doc))) {
      for (const payoff of thread.early) {
        const label = payoff.note?.body ?? thread.label;
        found.push({
          ruleId: payoffWithoutSetup.id,
          severity: payoffWithoutSetup.severity,
          span: { ...payoff.span },
          message:
            thread.setups.length > 0
              ? `This payoff comes before its setup “${label}”.`
              : `No setup for “${label}” comes before this payoff.`,
        });
      }
    }
    return found;
  },
};
