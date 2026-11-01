// Report a problem and Suggest an idea (Help): the links the dialog opens, built from what the
// writer typed. Drafter has no server and keeps no token, so it never posts anything. It opens
// GitHub's new-issue page with the writer's text filled in, and the writer reviews it and submits
// it there (a free GitHub account), or emails it from their own email app. Nothing else goes in:
// never the script, its title, a file name, or a note. Pure, so test/report-issue.test.ts runs it.
//
// GitHub's issue forms (.github/ISSUE_TEMPLATE/bug.yml, idea.yml) take each field's text from a
// query parameter named by the field's id, beside `template`, `title`, and `labels`. A form has no
// free `body`, so the text goes in by field (docs/DECISIONS.md, Report a problem).

export const REPO_URL = 'https://github.com/cschweda/drafter';
export const NEW_ISSUE_URL = `${REPO_URL}/issues/new`;
/** SECURITY.md's reporting route: GitHub's private report, or an email. Never a public issue. */
export const SECURITY_URL = `${REPO_URL}/blob/main/SECURITY.md#reporting-a-problem`;
/** The maintainer's address, published at his request (2026-11-01). */
export const CONTACT_EMAIL = 'cschweda@gmail.com';

/** A new-issue link stays under this, which every browser and GitHub take. */
export const MAX_ISSUE_URL = 7500;
/** An email's text stays under this, and its whole link under MAX_MAIL_URL, for every email app. */
export const MAX_MAIL_BODY = 1800;
export const MAX_MAIL_URL = 2000;
/** GitHub's longest title. */
export const MAX_TITLE = 256;

/** Said at the end of a field cut short to fit the link. */
export const TRIMMED_NOTE = '… [Trimmed to fit the link. Paste the rest here.]';

export type IssueKind = 'problem' | 'idea';

export interface IssueDraft {
  kind: IssueKind;
  title: string;
  /** A problem's: what happened. */
  happened: string;
  /** A problem's: what the writer expected. */
  expected: string;
  /** An idea's: what the writer would like. */
  idea: string;
  /** Adds About's version info. */
  includeVersion: boolean;
}

export const EMPTY_DRAFT: IssueDraft = {
  kind: 'problem',
  title: '',
  happened: '',
  expected: '',
  idea: '',
  includeVersion: true,
};

/** What each kind is called, which template and label it uses, and its fields, in the form's order. */
export const KINDS: Record<
  IssueKind,
  {
    name: string;
    template: string;
    label: string;
    fields: readonly { id: string; label: string; key: 'happened' | 'expected' | 'idea' }[];
  }
> = {
  problem: {
    name: 'Problem',
    template: 'bug.yml',
    label: 'bug',
    fields: [
      { id: 'what-happened', label: 'What happened', key: 'happened' },
      { id: 'expected', label: 'What you expected', key: 'expected' },
    ],
  },
  idea: {
    name: 'Idea',
    template: 'idea.yml',
    label: 'enhancement',
    fields: [{ id: 'idea', label: "What you'd like", key: 'idea' }],
  },
};

/** The version field's id and label, in both forms. */
export const VERSION_FIELD = { id: 'version', label: 'Version info' } as const;

export interface IssueField {
  id: string;
  label: string;
  value: string;
}

/**
 * Text safe to put in a link: well-formed (a lone surrogate would make `encodeURIComponent`
 * throw), with Windows line ends made plain, and no control characters but tab and newline.
 */
export function clean(text: string): string {
  const formed =
    typeof (text as { toWellFormed?: () => string }).toWellFormed === 'function'
      ? (text as unknown as { toWellFormed: () => string }).toWellFormed()
      : text.replace(
          /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
          '�',
        );
  // biome-ignore lint/suspicious/noControlCharactersInRegex: removing them is the point.
  return formed.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');
}

/** The first `count` characters (code points, so an emoji is never cut in half). */
const take = (text: string, count: number) => Array.from(text).slice(0, count).join('');
const length = (text: string) => Array.from(text).length;

/** The title, on one line, at most GitHub's length. */
export function issueTitle(draft: Pick<IssueDraft, 'title'>): string {
  return take(clean(draft.title).replace(/\s+/g, ' ').trim(), MAX_TITLE);
}

/** The fields with text, in the form's order, the version info last when it is included. */
export function issueFields(draft: IssueDraft, versionInfo: string): IssueField[] {
  const fields = KINDS[draft.kind].fields.map((field) => ({
    id: field.id,
    label: field.label,
    value: clean(draft[field.key]).trim(),
  }));
  if (draft.includeVersion && versionInfo.trim())
    fields.push({ ...VERSION_FIELD, value: clean(versionInfo).trim() });
  return fields.filter((field) => field.value !== '');
}

/** The fields as the issue shows them: each under its heading. */
export function issueBody(fields: readonly IssueField[]): string {
  return fields.map((field) => `### ${field.label}\n\n${field.value}`).join('\n\n');
}

/** Everything, untrimmed, as Copy copies it: the title, then the fields. */
export function fullText(draft: IssueDraft, versionInfo: string): string {
  const title = issueTitle(draft);
  const body = issueBody(issueFields(draft, versionInfo));
  return [title && `Title: ${title}`, body].filter(Boolean).join('\n\n');
}

const enc = encodeURIComponent;

/** The new-issue link for exactly these fields and this title. */
export function issueUrl(kind: IssueKind, title: string, fields: readonly IssueField[]): string {
  const { template, label } = KINDS[kind];
  const params = [
    `template=${enc(template)}`,
    ...(title ? [`title=${enc(title)}`] : []),
    `labels=${enc(label)}`,
    ...fields.map((field) => `${enc(field.id)}=${enc(field.value)}`),
  ];
  return `${NEW_ISSUE_URL}?${params.join('&')}`;
}

export interface IssueLink {
  url: string;
  /** The title and fields as the link carries them (the preview shows these). */
  title: string;
  fields: IssueField[];
  /** Whether anything was cut to fit. */
  trimmed: boolean;
}

/**
 * The longest start of `text` (with TRIMMED_NOTE after it) for which `fits` holds, by a binary
 * search over its characters; '' when even the note alone doesn't fit.
 */
function longestFitting(text: string, fits: (candidate: string) => boolean): string {
  const chars = Array.from(text);
  let low = 0;
  let high = chars.length;
  if (!fits(TRIMMED_NOTE)) return '';
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(`${chars.slice(0, mid).join('').trimEnd()}${TRIMMED_NOTE}`)) low = mid;
    else high = mid - 1;
  }
  return `${chars.slice(0, low).join('').trimEnd()}${TRIMMED_NOTE}`;
}

/**
 * The new-issue link, at most `max` characters: when it would be longer, the longest field is cut
 * (ending with TRIMMED_NOTE), then the next longest, until it fits. (A title of GitHub's length
 * always fits beside the field names, but it is shortened too if it ever didn't.)
 */
export function issueLink(
  draft: IssueDraft,
  versionInfo: string,
  max: number = MAX_ISSUE_URL,
): IssueLink {
  let title = issueTitle(draft);
  const fields = issueFields(draft, versionInfo);
  const kept = () => fields.filter((field) => field.value !== '');
  const build = () => issueUrl(draft.kind, title, kept());
  let trimmed = false;
  const longestFirst = fields
    .map((_, i) => i)
    .sort(
      (a, b) => length((fields[b] as IssueField).value) - length((fields[a] as IssueField).value),
    );
  for (const i of longestFirst) {
    if (build().length <= max) break;
    trimmed = true;
    const field = fields[i] as IssueField;
    const original = field.value;
    field.value = longestFitting(original, (candidate) => {
      field.value = candidate;
      return build().length <= max;
    });
  }
  while (build().length > max && title) {
    trimmed = true;
    title = take(title, length(title) - 8);
  }
  return { url: build(), title, fields: kept(), trimmed };
}

export interface MailLink {
  url: string;
  /** The email's text as the link carries it. */
  body: string;
  trimmed: boolean;
}

/** The text of an email: the same as the preview, with the headings plain. */
export function mailBody(fields: readonly IssueField[]): string {
  return fields.map((field) => `${field.label}:\n${field.value}`).join('\n\n');
}

/**
 * A `mailto:` link to the maintainer, the subject the title, the text the fields, at most
 * MAX_MAIL_BODY characters of text and MAX_MAIL_URL of link (cut with TRIMMED_NOTE).
 */
export function mailLink(draft: IssueDraft, versionInfo: string): MailLink {
  const kind = KINDS[draft.kind].name;
  const title = issueTitle(draft);
  const subject = take(title ? `Drafter: ${title}` : `Drafter: ${kind.toLowerCase()}`, 200);
  const make = (body: string) =>
    `mailto:${CONTACT_EMAIL}?subject=${enc(subject)}${body ? `&body=${enc(body)}` : ''}`;
  const fits = (body: string) => length(body) <= MAX_MAIL_BODY && make(body).length <= MAX_MAIL_URL;
  const full = mailBody(issueFields(draft, versionInfo));
  if (fits(full)) return { url: make(full), body: full, trimmed: false };
  const body = longestFitting(full, fits);
  return { url: make(body), body, trimmed: true };
}
