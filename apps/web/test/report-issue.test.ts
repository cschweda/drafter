import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { type AboutInfo, versionText } from '../app/about/info';
import {
  CONTACT_EMAIL,
  clean,
  EMPTY_DRAFT,
  fullText,
  type IssueDraft,
  issueBody,
  issueFields,
  issueLink,
  issueTitle,
  issueUrl,
  KINDS,
  MAX_ISSUE_URL,
  MAX_MAIL_BODY,
  MAX_MAIL_URL,
  MAX_TITLE,
  mailLink,
  NEW_ISSUE_URL,
  SECURITY_URL,
  TRIMMED_NOTE,
  VERSION_FIELD,
} from '../app/report/issue';

// Report a problem and Suggest an idea (docs/DECISIONS.md): the links are built from the writer's
// own text, encoded, capped, and trimmed, and the issue forms have the fields the links fill.

const INFO: AboutInfo = {
  version: '0.24.0',
  app: 'web',
  platform: 'macOS',
  browser: 'Firefox 140',
  commit: 'abc1234',
  date: '2026-11-01',
};
const VERSION = versionText(INFO);
const draft = (over: Partial<IssueDraft> = {}): IssueDraft => ({ ...EMPTY_DRAFT, ...over });
const params = (url: string) => new URL(url).searchParams;
const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

describe('the new-issue link', () => {
  test('opens the form for its kind, with its label, and the title and fields by id', () => {
    const link = issueLink(
      draft({ title: 'Export hangs', happened: 'It hung.', expected: 'A PDF.' }),
      VERSION,
    );
    expect(link.url.startsWith(`${NEW_ISSUE_URL}?`)).toBe(true);
    const p = params(link.url);
    expect(p.get('template')).toBe('bug.yml');
    expect(p.get('labels')).toBe('bug');
    expect(p.get('title')).toBe('Export hangs');
    expect(p.get('what-happened')).toBe('It hung.');
    expect(p.get('expected')).toBe('A PDF.');
    expect(p.get('version')).toBe(VERSION);
    expect(p.has('body')).toBe(false);
    expect(link.trimmed).toBe(false);

    const idea = params(issueLink(draft({ kind: 'idea', idea: 'Cards in colour' }), VERSION).url);
    expect(idea.get('template')).toBe('idea.yml');
    expect(idea.get('labels')).toBe('idea');
    expect(idea.get('idea')).toBe('Cards in colour');
    expect(idea.has('what-happened')).toBe(false);
  });

  test('leaves out empty fields and the title when there is none', () => {
    const p = params(issueLink(draft({ includeVersion: false }), VERSION).url);
    expect([...p.keys()]).toEqual(['template', 'labels']);
  });

  test('carries the version info only when it is included, as About copies it', () => {
    expect(params(issueLink(draft(), VERSION).url).get('version')).toBe(
      [
        'Drafter v0.24.0',
        'App: web app (drafter.dev)',
        'Build: abc1234 (2026-11-01)',
        'Platform: macOS',
        'Browser: Firefox 140',
      ].join('\n'),
    );
    expect(params(issueLink(draft({ includeVersion: false }), VERSION).url).has('version')).toBe(
      false,
    );
  });

  test('encodes every character that means something in a URL', () => {
    const title = 'A & B #1 = 100% + ?x=y / done';
    const happened = 'Line one\nLine two & #three\n\tTabbed "quoted" <b>bold</b>';
    const url = issueLink(draft({ title, happened }), VERSION).url;
    const query = url.slice(url.indexOf('?') + 1);
    // Only the separators between parameters are bare.
    expect(query.split('&').every((pair) => pair.split('=').length === 2)).toBe(true);
    expect(url).not.toMatch(/[\s#<>"]/);
    expect(params(url).get('title')).toBe(title);
    expect(params(url).get('what-happened')).toBe(happened);
    expect(url).toContain('%0A');
    expect(url).toContain('%26');
    expect(url).toContain('%23');
  });

  test('keeps unicode whole, and makes broken text safe', () => {
    const title = 'Scène 3 — “quotes” 你好 🎬👩‍👩‍👧';
    expect(params(issueLink(draft({ title }), VERSION).url).get('title')).toBe(title);
    // A lone surrogate would make encodeURIComponent throw.
    const broken = `bad \uD83C end \uDC00 and \u0000nul\r\nwindows`;
    expect(() => issueLink(draft({ title: broken, happened: broken }), VERSION)).not.toThrow();
    expect(clean(broken)).toBe('bad � end � and nul\nwindows');
  });

  test('puts the title on one line, at most GitHub’s length', () => {
    expect(issueTitle({ title: '  two\nlines\tand   spaces ' })).toBe('two lines and spaces');
    expect(Array.from(issueTitle({ title: '🎬'.repeat(1000) }))).toHaveLength(MAX_TITLE);
  });

  test('stays under the cap, cutting the longest field first and saying so', () => {
    const long = 'word & '.repeat(3000);
    const link = issueLink(draft({ title: 'Long', happened: long, expected: 'Short.' }), VERSION);
    expect(link.url.length).toBeLessThanOrEqual(MAX_ISSUE_URL);
    expect(link.trimmed).toBe(true);
    const p = params(link.url);
    expect(p.get('what-happened')?.endsWith(TRIMMED_NOTE)).toBe(true);
    expect(p.get('expected')).toBe('Short.');
    expect(p.get('version')).toBe(VERSION);
    expect(p.get('title')).toBe('Long');
    // The preview shows what the link carries.
    expect(link.fields.find((f) => f.id === 'what-happened')?.value).toBe(p.get('what-happened'));
    // As much as fits: one more character would not.
    expect(link.url.length).toBeGreaterThan(MAX_ISSUE_URL - 40);
  });

  test('cuts both fields when both are long, and keeps every field under the cap', () => {
    const big = '🎬 é & # \n'.repeat(5000);
    const link = issueLink(
      draft({ title: 'x'.repeat(300), happened: big, expected: big }),
      VERSION,
    );
    expect(link.url.length).toBeLessThanOrEqual(MAX_ISSUE_URL);
    const p = params(link.url);
    expect(p.get('title')).toHaveLength(MAX_TITLE);
    // Never a half emoji.
    for (const value of p.values()) expect(value).not.toMatch(/�/);
  });

  test('takes any cap', () => {
    const link = issueLink(draft({ happened: 'a'.repeat(2000) }), VERSION, 500);
    expect(link.url.length).toBeLessThanOrEqual(500);
    expect(link.trimmed).toBe(true);
  });

  test('is built from the fields given, nothing else', () => {
    expect(issueUrl('idea', '', [])).toBe(`${NEW_ISSUE_URL}?template=idea.yml&labels=idea`);
  });
});

describe('the preview and Copy', () => {
  test('shows each field under its heading, in the form’s order', () => {
    const fields = issueFields(draft({ happened: 'It hung.', expected: 'A PDF.' }), VERSION);
    expect(fields.map((f) => f.id)).toEqual(['what-happened', 'expected', 'version']);
    expect(issueBody(fields)).toBe(
      `### What happened\n\nIt hung.\n\n### What you expected\n\nA PDF.\n\n### Version info\n\n${VERSION}`,
    );
  });

  test('copies everything, untrimmed', () => {
    const long = 'x'.repeat(20000);
    const text = fullText(draft({ title: 'T', happened: long }), VERSION);
    expect(text.startsWith('Title: T\n\n### What happened\n\n')).toBe(true);
    expect(text).toContain(long);
    expect(text).not.toContain(TRIMMED_NOTE);
  });

  test('never carries anything but what was typed and the version info', () => {
    const p = params(issueLink(draft({ title: 't', happened: 'h', expected: 'e' }), VERSION).url);
    expect([...p.keys()].sort()).toEqual(
      ['expected', 'labels', 'template', 'title', 'version', 'what-happened'].sort(),
    );
  });
});

describe('the email', () => {
  test('goes to the maintainer, with the title as its subject and the preview as its text', () => {
    const mail = mailLink(draft({ title: 'Export & hang', happened: 'It hung.' }), VERSION);
    expect(mail.url.startsWith(`mailto:${CONTACT_EMAIL}?subject=`)).toBe(true);
    const url = new URL(mail.url);
    expect(url.pathname).toBe(CONTACT_EMAIL);
    expect(url.searchParams.get('subject')).toBe('Drafter: Export & hang');
    expect(url.searchParams.get('body')).toBe(
      `What happened:\nIt hung.\n\nVersion info:\n${VERSION}`,
    );
    // Spaces as %20, not +, which some email apps show as it is.
    expect(mail.url).not.toContain('+');
    expect([...url.searchParams.keys()]).toEqual(['subject', 'body']);
    expect(mail.trimmed).toBe(false);
  });

  test('stays short enough for any email app, and says when it is trimmed', () => {
    const mail = mailLink(draft({ happened: 'line & more\n'.repeat(1000) }), VERSION);
    expect(mail.trimmed).toBe(true);
    expect(mail.url.length).toBeLessThanOrEqual(MAX_MAIL_URL);
    expect(Array.from(mail.body).length).toBeLessThanOrEqual(MAX_MAIL_BODY);
    expect(mail.body.endsWith(TRIMMED_NOTE)).toBe(true);
  });

  test('has a subject even with no title', () => {
    expect(new URL(mailLink(draft({ kind: 'idea' }), '').url).searchParams.get('subject')).toBe(
      'Drafter: idea',
    );
  });
});

describe('the GitHub issue forms', () => {
  test.each(Object.values(KINDS))(
    '$template has the fields the link fills, and its label',
    (kind) => {
      const yml = repoFile(`.github/ISSUE_TEMPLATE/${kind.template}`);
      expect(yml).toMatch(new RegExp(`^labels: \\[${kind.label}\\]$`, 'm'));
      for (const field of [...kind.fields, VERSION_FIELD])
        expect(yml, field.id).toMatch(new RegExp(`^\\s+id: ${field.id}$`, 'm'));
    },
  );

  test('config.yml allows a blank issue and sends security to SECURITY.md', () => {
    const yml = repoFile('.github/ISSUE_TEMPLATE/config.yml');
    expect(yml).toMatch(/^blank_issues_enabled: true$/m);
    expect(yml).toContain('SECURITY.md');
    expect(SECURITY_URL).toContain('SECURITY.md');
  });

  test('SECURITY.md gives the email as the route when private reporting is off', () => {
    const security = repoFile('SECURITY.md');
    expect(security).toContain(`Email ${CONTACT_EMAIL} with the details`);
    expect(security).not.toContain('please contact me');
  });
});
