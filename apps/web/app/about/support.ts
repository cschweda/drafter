import type { HelpPage } from '../commands/data';

// Support Drafter (docs/drafter-support-page-design.md): a tip jar on a help page. Drafter only
// links to the maintainer's two pages; it loads nothing from either provider and sends them
// nothing. With no Ko-fi page there is no Support page at all, no command, and no menu entry.

export interface SupportLinks {
  /** The Ko-fi page: the route that needs no account, so the one the page is built on. */
  kofi?: string;
  /** The GitHub Sponsors page, for people who already have a GitHub account. */
  github?: string;
}

/** The maintainer's two addresses go here, and nowhere else. */
export const SUPPORT_LINKS: SupportLinks = {};

/** The address, when it is an https page on `host` whose path `fits`, with no query or fragment. */
function page(address: string | undefined, host: string, fits: RegExp): string | undefined {
  if (!address) return undefined;
  try {
    const url = new URL(address);
    const plain = url.protocol === 'https:' && url.host === host && !url.search && !url.hash;
    return plain && fits.test(url.pathname) && url.href === address ? address : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The routes the page offers: `tip` for a valid Ko-fi page, and `sponsor` for a valid GitHub
 * Sponsors page beside it. An address that isn't exactly such a page counts as none, and GitHub's
 * alone gives nothing: a writer must never need an account to leave a tip.
 */
export function supportRoutes(links: SupportLinks): { tip?: string; sponsor?: string } {
  const tip = page(links.kofi, 'ko-fi.com', /^\/[^/]+$/);
  if (!tip) return {};
  const sponsor = page(links.github, 'github.com', /^\/sponsors\/[^/]+$/);
  return sponsor ? { tip, sponsor } : { tip };
}

export const SUPPORT_ROUTES = supportRoutes(SUPPORT_LINKS);

/** Whether this build has a Support page. */
export const SUPPORT_ON = SUPPORT_ROUTES.tip !== undefined;

export const SUPPORT_PAGE: HelpPage = {
  id: 'help-support',
  path: '/docs/support',
  title: 'Support Drafter',
  section: 'about',
};
