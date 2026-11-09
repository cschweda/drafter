import { describe, expect, test, vi } from 'vitest';
// @ts-expect-error: a plain .mjs module, for Netlify, with JSDoc types only.
import { createReportHandler } from '../netlify/report.mjs';

// The report function on drafter.dev (netlify/report.mjs): Report a problem / Suggest an idea sent
// by email through Resend, to a fixed address, with the guards a public form needs.

const ENV: Record<string, string> = {
  RESEND_API_KEY: 're_test',
  REPORT_TO: 'owner@example.com',
  REPORT_FROM: 'Drafter <reports@mail.drafter.dev>',
};
const ok = () => new Response('{"id":"1"}', { status: 200 });

type Handler = (req: Request, context: { ip?: string }) => Promise<Response>;

function setup(env: Record<string, string> = ENV, now = () => 1_000_000) {
  const send = vi.fn(async (_url: string, _init: RequestInit) => ok());
  const handler: Handler = createReportHandler({ env: (n: string) => env[n], send, now });
  const post = (body: unknown, ip = '1.2.3.4') =>
    handler(
      new Request('https://drafter.dev/.netlify/functions/report', {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
      { ip },
    );
  const sent = (call = 0) => JSON.parse(String(send.mock.calls[call]?.[1].body));
  return { send, post, handler, sent };
}
const problem = {
  kind: 'problem',
  title: 'Export skips the title page',
  happened: 'The PDF starts on page 1.',
  expected: 'A title page.',
  details: 'Drafter 0.26.1, Chrome 141',
  elapsed: 9000,
};

describe('the report function', () => {
  test('says whether it is set up, for the dialog to offer Send email', async () => {
    const get = (env: Record<string, string>) =>
      setup(env).handler(new Request('https://drafter.dev/.netlify/functions/report'), {});
    expect(await (await get(ENV)).json()).toEqual({ ready: true });
    expect(await (await get({ RESEND_API_KEY: 'k', REPORT_TO: 'a@b.c' })).json()).toEqual({
      ready: false,
    });
  });

  test('sends a problem to the fixed address, never one from the form', async () => {
    const { send, post, sent } = setup();
    const res = await post({ ...problem, replyTo: 'writer@example.org', to: 'victim@example.net' });
    expect(res.status).toBe(200);
    const [url, init] = send.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    const mail = sent();
    expect(mail.to).toEqual(['owner@example.com']);
    expect(mail.from).toBe(ENV.REPORT_FROM);
    expect(mail.reply_to).toBe('writer@example.org');
    expect(mail.subject).toBe('[Drafter] Problem: Export skips the title page');
    expect(mail.text).toContain('## What happened\nThe PDF starts on page 1.');
    expect(mail.text).toContain('## What they expected\nA title page.');
    expect(mail.text).toContain('## Technical details\nDrafter 0.26.1, Chrome 141');
    expect(mail.text).toContain('Reply to: writer@example.org');
  });

  test('sends an idea, with no reply address', async () => {
    const { post, sent } = setup();
    expect(
      (await post({ kind: 'idea', idea: 'Index cards in colour', elapsed: 9000 })).status,
    ).toBe(200);
    const mail = sent();
    expect(mail.subject).toBe('[Drafter] Idea: Index cards in colour');
    expect(mail.reply_to).toBeUndefined();
    expect(mail.text).toContain('No reply address given.');
  });

  test('answers 503 when Resend isn’t set up, and sends nothing', async () => {
    const { send, post } = setup({});
    expect((await post(problem)).status).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });

  test('pretends to accept a filled honeypot, and sends nothing', async () => {
    const { send, post } = setup();
    expect((await post({ ...problem, website: 'http://spam' })).status).toBe(200);
    expect(send).not.toHaveBeenCalled();
  });

  test('refuses a form filled in too fast, a missing field, a bad reply address, and junk', async () => {
    const { send, post } = setup();
    expect((await post({ ...problem, elapsed: 500 })).status).toBe(400);
    expect((await post({ ...problem, happened: '  ' })).status).toBe(400);
    expect((await post({ kind: 'idea', elapsed: 9000 })).status).toBe(400);
    expect((await post({ ...problem, replyTo: 'a@b.c\nBcc: x@y.z' })).status).toBe(400);
    expect((await post('not json')).status).toBe(400);
    expect((await post({ ...problem, kind: 'other' })).status).toBe(400);
    expect((await post('x'.repeat(40_000))).status).toBe(413);
    expect(send).not.toHaveBeenCalled();
  });

  test('allows only GET and POST', async () => {
    const { handler } = setup();
    const res = await handler(
      new Request('https://drafter.dev/', { method: 'PUT', body: '{}' }),
      {},
    );
    expect(res.status).toBe(405);
  });

  test('limits each address to five a minute', async () => {
    const { post } = setup();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await post(problem)).status);
    expect(codes).toEqual([200, 200, 200, 200, 200, 429]);
    expect((await post(problem, '5.6.7.8')).status).toBe(200);
  });

  test('never lets many addresses reset another’s count', async () => {
    let clock = 1_000_000;
    const { post } = setup(ENV, () => clock);
    for (let i = 0; i < 5; i++) expect((await post(problem, 'a')).status).toBe(200);
    // A thousand other addresses in the same minute: past the table's size they are refused, and
    // the first address's count is kept, not cleared.
    for (let i = 0; i < 1100; i++) await post(problem, `b${i}`);
    expect((await post(problem, 'a')).status).toBe(429);
    expect((await post(problem, 'new')).status).toBe(429);
    // The next minute, the old counts go and everyone may send again.
    clock += 60_000;
    expect((await post(problem, 'a')).status).toBe(200);
    expect((await post(problem, 'new')).status).toBe(200);
  });

  test('caps everyone together at thirty a minute', async () => {
    const { post } = setup();
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) codes.push((await post(problem, `ip${i}`)).status);
    expect(codes.slice(0, 30).every((code) => code === 200)).toBe(true);
    expect(codes[30]).toBe(429);
  });

  test('cuts long fields and strips control characters', async () => {
    const { post, sent } = setup();
    await post({
      kind: 'idea',
      idea: `a\u0007b${'x'.repeat(9000)}`,
      title: 't'.repeat(400),
      elapsed: 9000,
    });
    const mail = sent();
    expect(mail.subject.length).toBeLessThanOrEqual(200);
    expect(mail.text).not.toContain('\u0007');
    expect(mail.text).toContain('ab');
  });

  test('says so when Resend fails', async () => {
    const send = vi.fn(async () => new Response('no', { status: 500 }));
    const handler: Handler = createReportHandler({ env: (n: string) => ENV[n], send });
    const res = await handler(
      new Request('https://drafter.dev/', { method: 'POST', body: JSON.stringify(problem) }),
      { ip: '9' },
    );
    expect(res.status).toBe(502);
  });
});
