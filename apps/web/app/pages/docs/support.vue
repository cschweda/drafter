<script setup lang="ts">
import { SUPPORT_PAGE, SUPPORT_ROUTES } from '~/about/support';

definePageMeta({ layout: 'docs' });

// Support Drafter (docs/drafter-support-page-design.md): a tip jar. One button, to the
// maintainer's Ko-fi page, where a card is enough and no account is needed; a sentence for people
// who already have a GitHub account. Both are plain links: nothing is loaded from either, and
// nothing is sent to them. A build without the Ko-fi page has no such page: nuxt.config.ts takes
// its route out (`pages:extend`).

useDocsHead({
  ...SUPPORT_PAGE,
  description:
    'Drafter is free and stays free. If it has been useful, you can leave a tip: by card, with no account needed.',
});
</script>

<template>
  <article class="support">
    <h1>{{ SUPPORT_PAGE.title }}</h1>
    <p class="docs-lead">Drafter is free, and every part of it stays free.</p>
    <p>
      If it has been useful and you’d like to say thanks, you can leave a tip. It helps with the
      domain and hosting, and with the time it takes.
    </p>
    <p class="support-action">
      <a
        class="support-tip"
        data-support="tip"
        :href="SUPPORT_ROUTES.tip"
        target="_blank"
        rel="noopener noreferrer"
        >Leave a tip</a
      >
    </p>
    <p class="support-how">
      By card, Apple Pay, Google Pay or PayPal, on Ko-fi. No account needed.
    </p>
    <p v-if="SUPPORT_ROUTES.sponsor">
      Have a GitHub account? You can
      <a
        data-support="sponsor"
        :href="SUPPORT_ROUTES.sponsor"
        target="_blank"
        rel="noopener noreferrer"
        >sponsor Drafter on GitHub</a
      >
      instead.
    </p>
    <p>
      Nothing changes in Drafter whether you do or not. The button opens Ko-fi’s own page;
      Drafter sends it nothing, and a tip is not tax-deductible.
    </p>
  </article>
</template>

<style scoped>
.support-action {
  margin: 24px 0 8px;
}
/* The page's one button: the app's primary button, tall enough for a thumb. */
.support-tip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: 44px;
  padding: 0 20px;
  border-radius: var(--r-sm);
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 600;
  text-decoration: none;
}
.support-tip:hover,
.support-tip:active {
  background: var(--accent-hover);
}
.support-how {
  color: var(--muted);
}
</style>
