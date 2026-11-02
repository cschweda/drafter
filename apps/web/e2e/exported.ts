import type { BrowserContext } from '@playwright/test';

// Opening an exported file as a reader would (HTML export, Story map): in a page of its own, with
// every request but the file refused, and what its own policy refused collected.

/** Where an exported HTML file is opened: an address no server answers, which the test answers. */
const OPENED_AT = 'http://exported.drafter.test/file.html';

/**
 * Opens `html` in a page of `context` as a reader would open the file, with every other request
 * refused, and answers what was asked for besides the file (a `data:` font is in the file, and is
 * no request).
 */
export async function openExported(context: BrowserContext, html: string, { script = true } = {}) {
  const asked: string[] = [];
  context.on('request', (request) => {
    if (!request.url().startsWith('data:')) asked.push(request.url());
  });
  await context.route('**/*', (route) =>
    route.request().url() === OPENED_AT
      ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
      : route.abort(),
  );
  // Anything the file's Content-Security-Policy refused (its own style or script among them),
  // so a blocked resource can't pass unnoticed: the event, and the console's word for it. Firefox
  // asks for the address's /favicon.ico itself, and the policy refuses it: that one is the
  // browser's, not the file's (a file opened from disk has no such address).
  if (script) {
    await context.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { cspSeen: string[] }).cspSeen = seen;
      document.addEventListener('securitypolicyviolation', (event) => {
        if (!event.blockedURI.endsWith('/favicon.ico')) {
          seen.push(`${event.violatedDirective} ${event.blockedURI}`);
        }
      });
    });
  }
  const page = await context.newPage();
  const said: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/content[- ]security[- ]policy|\bCSP\b/i.test(text) && !text.includes('favicon.ico')) {
      said.push(text);
    }
  });
  await page.goto(OPENED_AT);
  // With JavaScript off there is nothing to evaluate in (Firefox waits for ever).
  if (script) await page.evaluate(() => document.fonts.ready);
  return {
    page,
    others: () => asked.filter((url) => url !== OPENED_AT),
    /** What the policy refused, as events and console messages; [] with JavaScript off. */
    refused: async () => [
      ...(script
        ? await page.evaluate(() => (window as unknown as { cspSeen?: string[] }).cspSeen ?? [])
        : []),
      ...said,
    ],
  };
}
