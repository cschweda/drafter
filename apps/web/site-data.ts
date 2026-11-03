import { SITE_DESCRIPTION, SITE_URL } from './site';

// What drafter.dev tells search engines and AI assistants about itself, as Schema.org JSON-LD in
// every page's head (nuxt.config.ts): the site, the app (free, MIT, on the web, Windows, and
// Linux), and who makes it, with the date of the commit the site was built from as when it last
// changed. Public facts only, the same as About and the README say: no email, no tracking.

export const AUTHOR = 'Christopher Schweda';

export function siteJsonLd(version: string, modified?: string): string {
  const author = {
    '@type': 'Person',
    '@id': `${SITE_URL}/#author`,
    name: AUTHOR,
    url: 'https://metaincognita.com',
    sameAs: ['https://github.com/cschweda'],
  };
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: 'Drafter',
        description: SITE_DESCRIPTION,
        inLanguage: 'en',
        publisher: { '@id': `${SITE_URL}/#author` },
        ...(modified && { dateModified: modified }),
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#app`,
        name: 'Drafter',
        description: SITE_DESCRIPTION,
        url: `${SITE_URL}/`,
        applicationCategory: 'Screenwriting software',
        operatingSystem: 'Web browser, Windows, Linux',
        ...(version && { softwareVersion: version }),
        ...(modified && { dateModified: modified }),
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        license: 'https://opensource.org/licenses/MIT',
        downloadUrl: `${SITE_URL}/docs/download/`,
        author: { '@id': `${SITE_URL}/#author` },
      },
      author,
    ],
  });
}
