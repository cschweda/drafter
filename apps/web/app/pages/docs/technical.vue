<script setup lang="ts">
import { type FunctionalComponent, h } from 'vue';
import { ABOUT_LINKS } from '~/about/info';
import { inlineParts } from '~/about/mermaid';
import {
  DEPENDENCY_NOTES,
  PACKAGES,
  TECH_LEAD,
  TECH_LICENCES,
  TECH_SECTIONS,
  type TechBlock,
} from '~/about/tech';
import { HELP_PAGES, helpHref } from '~/commands/data';

// Technical details (out-the-door design §4): how Drafter is put together, plain words first in
// each part, then the specifics. Everything on it is `about/tech.ts`, which docs/technical-details.md
// is generated from too; a help page like the others, prerendered, never on the writing screen.

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-technical');
if (!page) throw new Error('The Technical details page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'How Drafter is put together: its packages, from a keystroke to the page, storage, export, offline use, the desktop app, releases, and every dependency.',
});

const licences = HELP_PAGES.find((p) => p.id === 'help-licences');
if (!licences) throw new Error('The Third-party licences page is not in the list of help pages.');

const REPO = ABOUT_LINKS.find((link) => link.id === 'repo')?.href;
if (!REPO) throw new Error('About Drafter has no link to the repository.');
/** A file in the repository, on GitHub. */
const repoHref = (path: string) => `${REPO}/blob/main/${path}`;

/** Words with their `code` and **strong** runs. */
const Inline: FunctionalComponent<{ text: string }> = ({ text }) =>
  inlineParts(text).map((part) =>
    part.code ? h('code', part.text) : part.strong ? h('strong', part.text) : part.text,
  );
Inline.props = ['text'];

const blocksOf = (section: (typeof TECH_SECTIONS)[number]): TechBlock[] => [
  ...section.plain,
  ...section.details,
];
const dependencies = Object.entries(DEPENDENCY_NOTES);
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">{{ TECH_LEAD }}</p>

    <nav aria-label="Contents">
      <ol>
        <li v-for="section in TECH_SECTIONS" :key="section.id">
          <a :href="`#${section.id}`">{{ section.title }}</a>
        </li>
      </ol>
    </nav>

    <section v-for="section in TECH_SECTIONS" :key="section.id" :aria-labelledby="section.id">
      <h2 :id="section.id">{{ section.title }}</h2>
      <template v-for="(block, i) in blocksOf(section)" :key="i">
        <p v-if="block.kind === 'p'"><Inline :text="block.text" /></p>
        <ul v-else-if="block.kind === 'list'">
          <li v-for="(item, j) in block.items" :key="j"><Inline :text="item" /></li>
        </ul>
        <TechDiagram
          v-else-if="block.kind === 'diagram'"
          :diagram="block.diagram"
          :packages="PACKAGES"
        />
        <p v-else-if="block.kind === 'link'">
          <a :href="repoHref(block.path)"><Inline :text="block.text" /></a>
        </p>
        <template v-else-if="block.kind === 'dependencies'">
          <dl class="tech-dependencies">
            <div v-for="[name, line] in dependencies" :key="name">
              <dt><code>{{ name }}</code></dt>
              <dd>{{ line }}</dd>
            </div>
          </dl>
          <p>
            {{ TECH_LICENCES }}
            <a :href="helpHref(licences)">{{ licences.title }}</a> page.
          </p>
        </template>
      </template>
    </section>
  </article>
</template>

<style scoped>
.tech-dependencies {
  margin: 0 0 12px;
}
.tech-dependencies div {
  margin-bottom: 8px;
}
.tech-dependencies dt {
  font-weight: 600;
}
.tech-dependencies dd {
  margin: 0 0 0 1.4rem;
}
.tech-dependencies code,
p code,
li code {
  font-family: var(--font-mono, monospace);
  font-size: 0.92em;
}
</style>
