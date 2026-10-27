import { SITE_URL } from '../../site';

/**
 * The title and description of a help page, and what a link preview and a search engine read: the
 * page's own title, description, and canonical address in place of the app's (Phase 1 design §4.5).
 */
export function useDocsHead(page: { title: string; description: string; path: string }) {
  const title = `${page.title} — Drafter`;
  // The address a static host serves the page at: its directory, with the slash (`helpHref`).
  const url = `${SITE_URL}${page.path.replace(/\/?$/, '/')}`;
  useSeoMeta({
    title,
    description: page.description,
    ogTitle: title,
    ogDescription: page.description,
    ogUrl: url,
    twitterTitle: title,
    twitterDescription: page.description,
  });
  useHead({ link: [{ rel: 'canonical', href: url }] });
}
