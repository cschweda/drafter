<script setup lang="ts">
import { drawnPackages, packageRows } from '~/about/mermaid';
import type { Diagram, PackageNote } from '~/about/tech';

// A diagram on the Technical details page (out-the-door design §4.2), drawn in HTML and CSS: a
// flow is an ordered list of boxes with an arrow between each, and the packages are an ordered
// list of layers, the app's at the top. The words are the list's own, so a screen reader reads
// them; the arrows are drawn and hidden from it. Colors are the theme's tokens, so both themes
// (and print) need nothing more. docs/technical-details.md has the same diagrams as Mermaid.

const props = defineProps<{ diagram: Diagram; packages: readonly PackageNote[] }>();

/** The layers, the top one first: each package is above everything it uses. */
const layers = computed(() =>
  props.diagram.kind === 'packages' ? packageRows(drawnPackages(props.packages)).reverse() : [],
);

/** What a package uses, in words: "uses @drafter/fountain and @drafter/templates". */
function usesText(p: PackageNote): string {
  const names = p.uses;
  if (names.length === 0) return 'uses no other package';
  if (names.length === 1) return `uses ${names[0]}`;
  return `uses ${names.slice(0, -1).join(', ')}${names.length > 2 ? ',' : ''} and ${names.at(-1)}`;
}
</script>

<template>
  <figure class="tech-diagram" :data-diagram="diagram.kind">
    <figcaption>{{ diagram.caption }}</figcaption>
    <ol v-if="diagram.kind === 'flow'" class="tech-chain">
      <li v-for="(step, i) in diagram.steps" :key="i" class="tech-link">
        <span class="tech-box">
          <strong class="tech-label">{{ step.label }}</strong>
          <span class="tech-detail">{{ step.detail }}</span>
        </span>
        <span v-if="i < diagram.steps.length - 1" class="tech-arrow" aria-hidden="true" />
      </li>
    </ol>
    <ol v-else class="tech-chain">
      <li v-for="(layer, i) in layers" :key="i" class="tech-link">
        <ul class="tech-layer">
          <li v-for="p in layer" :key="p.name" class="tech-box tech-package">
            <code>{{ p.name }}</code><span class="tech-hidden">, {{ usesText(p) }}</span>
          </li>
        </ul>
        <span v-if="i < layers.length - 1" class="tech-arrow tech-arrow-up" aria-hidden="true" />
      </li>
    </ol>
  </figure>
</template>

<style scoped>
.tech-diagram {
  margin: 16px 0 20px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  break-inside: avoid;
}
figcaption {
  margin: 0 0 12px;
  color: var(--muted);
}
.tech-chain,
.tech-layer {
  margin: 0;
  padding: 0;
  list-style: none;
}
.tech-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
}
.tech-box {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  max-width: 26rem;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--chrome);
  text-align: center;
}
.tech-detail {
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.4;
}
.tech-layer {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  width: 100%;
}
.tech-package {
  display: block;
  width: auto;
  margin: 0;
  padding: 4px 8px;
  font-size: 0.85rem;
}
.tech-package code {
  font-family: var(--font-mono, monospace);
}
/* A line and its head, pointing down (the next step) or up (the layer above builds on this one). */
.tech-arrow {
  position: relative;
  display: block;
  width: 2px;
  height: 22px;
  background: var(--muted);
}
.tech-arrow::after {
  position: absolute;
  bottom: -1px;
  left: -5px;
  border-top: 7px solid var(--muted);
  border-right: 6px solid transparent;
  border-left: 6px solid transparent;
  content: "";
}
.tech-arrow-up::after {
  top: -1px;
  bottom: auto;
  border-top: 0;
  border-bottom: 7px solid var(--muted);
}
.tech-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
