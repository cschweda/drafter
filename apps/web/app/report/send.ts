import { desktop } from '~/desktop';
import { clean, type IssueDraft } from './issue';

// Report a problem / Suggest an idea, sent by email from the dialog (the maintainer, 2026-11-09, as
// frotzlens does): the report goes to drafter.dev's own Netlify Function (netlify/report.mjs),
// which passes it to the maintainer through Resend. Only drafter.dev's build has the function
// (`__DRAFTER_REPORT_EMAIL__`, nuxt.config.ts), and the dialog offers Send email only once the
// function says it is set up. Nothing is sent until the writer presses Send email, and what goes is
// what the dialog's preview shows, plus the reply address they typed, if any.

declare const __DRAFTER_REPORT_EMAIL__: boolean | undefined;

export const REPORT_ENDPOINT = '/.netlify/functions/report';

/** Whether this build has the function at all: drafter.dev's, never the desktop app or a self-hosted copy. */
export function emailOffered(): boolean {
  return (
    typeof __DRAFTER_REPORT_EMAIL__ !== 'undefined' &&
    __DRAFTER_REPORT_EMAIL__ === true &&
    desktop() === null
  );
}

/** Asks the function whether Resend is set up; false on any failure, so the dialog keeps to GitHub. */
export async function emailReady(fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!emailOffered()) return false;
  try {
    const res = await fetcher(REPORT_ENDPOINT, { method: 'GET', cache: 'no-store' });
    if (!res.ok) return false;
    const body = (await res.json()) as { ready?: unknown };
    return body.ready === true;
  } catch {
    return false;
  }
}

/** What the function takes: the dialog's fields, the technical details if included, and the guards. */
export interface ReportPayload {
  kind: IssueDraft['kind'];
  title: string;
  happened: string;
  expected: string;
  idea: string;
  details: string;
  replyTo: string;
  /** The honeypot: always empty from a person. */
  website: string;
  /** How long the dialog was open, in ms: a bot fills it at once. */
  elapsed: number;
}

export function reportPayload(
  draft: IssueDraft,
  versionInfo: string,
  replyTo: string,
  website: string,
  elapsed: number,
): ReportPayload {
  const problem = draft.kind === 'problem';
  return {
    kind: draft.kind,
    title: clean(draft.title).trim(),
    happened: problem ? clean(draft.happened).trim() : '',
    expected: problem ? clean(draft.expected).trim() : '',
    idea: problem ? '' : clean(draft.idea).trim(),
    details: draft.includeVersion ? clean(versionInfo).trim() : '',
    replyTo: replyTo.trim(),
    website,
    elapsed,
  };
}

export type SendResult = { ok: true } | { ok: false; error: string };

/** Posts the report; a failure says why, in the function's words or plainly. */
export async function sendReport(
  payload: ReportPayload,
  fetcher: typeof fetch = fetch,
): Promise<SendResult> {
  try {
    const res = await fetcher(REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: unknown };
    return {
      ok: false,
      error: typeof body.error === 'string' ? body.error : 'The report couldn’t be sent just now.',
    };
  } catch {
    return { ok: false, error: 'The report couldn’t be sent. Check your connection.' };
  }
}
