<script setup lang="ts">
import { ABOUT_LINKS } from '~/about/info';
import { HELP_PAGES } from '~/commands/data';
import { longDate, releaseUrl, WHATS_NEW, type WhatsNewEntry } from '~/whats-new/entries';

// What's new (docs/DECISIONS.md, What's new): every item in whats-new/entries.ts, newest first,
// under its release. The CHANGELOG has the detail; these are the changes in a writer's words. The
// writing screen's banner links here.

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-whats-new');
if (!page) throw new Error('The What’s new page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'What has changed in Drafter, newest first, in plain words: what is new, what is better, what is fixed, and every security update.',
});

const CHANGELOG = ABOUT_LINKS.find((link) => link.id === 'changelog')?.href;

/** The entries by release, in their order (newest first). */
const releases = WHATS_NEW.reduce<{ version: string; date: string; entries: WhatsNewEntry[] }[]>(
  (out, entry) => {
    const last = out.at(-1);
    if (last?.version === entry.version) last.entries.push(entry);
    else out.push({ version: entry.version, date: entry.date, entries: [entry] });
    return out;
  },
  [],
);

/** Whether an item of the release already links to its page on GitHub. */
const linksRelease = (release: { version: string; entries: WhatsNewEntry[] }) =>
  release.entries.some((entry) => entry.link?.href === releaseUrl(release.version));

/** A link off the site opens in a new tab; a help page is one of these pages. */
const external = (href: string) => /^https?:/.test(href);
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      What has changed in Drafter, newest first. After a big change or a security update, the
      writing screen says so once, in a line at the top, with a link here.
    </p>
    <p>
      Each change is marked <strong>New</strong>, <strong>Improved</strong>,
      <strong>Fixed</strong>, or <strong>Security</strong>. The
      <a :href="CHANGELOG" target="_blank" rel="noopener noreferrer">changelog</a> has every
      change in detail.
    </p>

    <section
      v-for="release in releases"
      :key="release.version"
      class="release"
      :aria-labelledby="`v${release.version}`"
    >
      <h2 :id="`v${release.version}`">
        Drafter {{ release.version }}
        <time class="release-date" :datetime="release.date">{{ longDate(release.date) }}</time>
      </h2>
      <ul class="changes">
        <li v-for="entry in release.entries" :id="entry.id" :key="entry.id" :data-kind="entry.kind">
          <span class="kind">{{ entry.kind }}</span>
          <strong class="change-title">{{ entry.title }}.</strong>
          {{ entry.text }}
          <template v-if="entry.link">
            <a
              v-if="external(entry.link.href)"
              :href="entry.link.href"
              target="_blank"
              rel="noopener noreferrer"
              >{{ entry.link.label }}</a
            ><a v-else :href="entry.link.href">{{ entry.link.label }}</a
            >.
          </template>
        </li>
      </ul>
      <p v-if="!linksRelease(release)" class="release-link">
        <a :href="releaseUrl(release.version)" target="_blank" rel="noopener noreferrer"
          >Drafter {{ release.version }} on GitHub</a
        >
      </p>
    </section>
  </article>
</template>

<style scoped>
.release h2 {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
}
.release-date {
  color: var(--muted);
  font-size: 0.95rem;
  font-weight: 500;
  letter-spacing: 0;
}
.changes {
  padding-left: 0;
  list-style: none;
}
.changes li {
  margin-bottom: 10px;
}
/* The kind, as a small chip before the title: words, not a color, say which. */
.kind {
  display: inline-block;
  margin-right: 6px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--text);
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.6;
  vertical-align: 1px;
}
.release-link {
  font-size: 0.9rem;
}
</style>
