import { expect, test } from '@playwright/test';
import { OG_IMAGE, SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from '../site';

// The attributes of every `<name …>` tag in `html`, in any order.
function tags(html: string, name: string): Array<Record<string, string>> {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(([tag]) =>
    Object.fromEntries(
      [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]),
    ),
  );
}

test("serves the page shell with Drafter's metadata", async ({ request }) => {
  const html = await (await request.get('/')).text();
  expect(html).toContain(`<title>${SITE_TITLE}</title>`);
  const meta = tags(html, 'meta');
  expect(meta).toContainEqual({ name: 'description', content: SITE_DESCRIPTION });
  expect(meta).toContainEqual({ property: 'og:image', content: OG_IMAGE });
  expect(meta).toContainEqual({ name: 'twitter:card', content: 'summary_large_image' });
  expect(tags(html, 'link')).toContainEqual({ rel: 'canonical', href: `${SITE_URL}/` });
  // The loading template carries the description in the body, for search
  // engines and for anyone without JavaScript.
  expect(html.slice(html.indexOf('<body'))).toContain(SITE_DESCRIPTION);
});

test('starts in the dark theme', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
});

test('serves fonts from the same origin', async ({ page, request }) => {
  await page.goto('/');
  // `document.fonts.check` is true even for a family with no font face, so
  // look for an Inter Tight face that has actually loaded.
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some(
      (face) => face.family.replace(/"/g, '') === 'Inter Tight' && face.status === 'loaded',
    );
  });
  expect(loaded).toBe(true);
  const ttf = await request.get('/fonts/courier-prime/CourierPrime-Regular.ttf');
  expect(ttf.status()).toBe(200);
  expect(ttf.headers()['content-type']).toBe('font/ttf');
});
