import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { DOWNLOAD_PAGE, HELP_PAGES } from '../app/commands/data';
import { siteJsonLd } from '../site-data';

// drafter.dev's description of itself for AI assistants and search engines: /llms.txt (in the
// shape llmstxt.org sets out), /robots.txt, and the JSON-LD in every page's head.

const read = (name: string) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');

describe('llms.txt', () => {
  const text = read('llms.txt');

  test('has a title, a one-paragraph summary, and sections of links', () => {
    expect(text.startsWith('# Drafter\n\n> ')).toBe(true);
    expect(text).toMatch(/^## Help$/m);
    expect(text).toMatch(/^## Optional$/m);
  });

  test('links every help page, by its own title and address', () => {
    for (const page of [...HELP_PAGES, DOWNLOAD_PAGE]) {
      const title = page.title.replaceAll('’', "'");
      expect(text, page.id).toContain(`[${title}](https://drafter.dev${page.path}/)`);
    }
    // And no page that isn't one.
    const linked = [...text.matchAll(/\]\(https:\/\/drafter\.dev(\/docs\/[a-z-]+)\/\)/g)].map(
      (m) => m[1],
    );
    const known = new Set([...HELP_PAGES, DOWNLOAD_PAGE].map((p) => p.path));
    expect(linked.filter((path) => !known.has(path as string))).toEqual([]);
  });
});

describe('robots.txt', () => {
  test('lets every page be read', () => {
    const text = read('robots.txt');
    expect(text).toMatch(/^User-agent: \*$/m);
    expect(text).toMatch(/^Allow: \/$/m);
    expect(text).not.toMatch(/^Disallow:/m);
  });
});

describe('the JSON-LD', () => {
  test('says what the site and the app are, who makes them, and when they last changed', () => {
    const data = JSON.parse(siteJsonLd('0.25.1', '2026-11-03'));
    expect(data['@context']).toBe('https://schema.org');
    const byType = Object.fromEntries(
      (data['@graph'] as Array<Record<string, unknown>>).map((n) => [n['@type'], n]),
    );
    expect(byType.WebSite?.url).toBe('https://drafter.dev/');
    expect(byType.SoftwareApplication?.isAccessibleForFree).toBe(true);
    expect(byType.SoftwareApplication?.softwareVersion).toBe('0.25.1');
    expect(byType.SoftwareApplication?.dateModified).toBe('2026-11-03');
    expect(byType.Person?.name).toBe('Christopher Schweda');
    // Public facts only: no email address.
    expect(JSON.stringify(data)).not.toMatch(/@[a-z]+\.[a-z]/i);
  });
});
