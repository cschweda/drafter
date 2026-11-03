<script setup lang="ts">
import {
  CONTRAST_MAX,
  CONTRAST_MIN,
  CONTRAST_STEP,
  contrastLabel,
  contrastRatio,
  type Rgb,
  ratioLabel,
  type WcagLevel,
  wcagLevel,
} from '~/settings/contrast';
import { useSettings } from '~/settings/settings';

// One pane's contrast slider (settings/contrast.ts), in the top bar's Contrast panel and in Settings.
// A native range: arrows, Page Up and Down, Home and End move it, a screen reader reads its value
// as a percentage, and the pane's colours follow as it moves, in either theme. Under it, the
// WCAG 2.1 contrast ratio of the pane's text, and of its weakest colour, against its background,
// measured from the colours the browser draws (the maintainer, 2026-11-03: "for accessibility
// purposes and WCAG 2.1 verification").
const props = defineProps<{
  pane: 'source' | 'script';
}>();

const { settings, set } = useSettings();
const colorMode = useColorMode();
const key = computed(() => (props.pane === 'source' ? 'sourceContrast' : 'scriptContrast'));
const name = computed(() => (props.pane === 'source' ? 'Source contrast' : 'Script contrast'));
const value = computed(() => settings.value[key.value]);
const label = computed(() => contrastLabel(value.value));
const ratioId = useId();

function onInput(event: Event) {
  void set(key.value, Number((event.target as HTMLInputElement).value));
}

/** The Source's colours, by what they colour, as editor/theme.ts uses them. */
const SOURCE_COLOURS: readonly (readonly [token: string, what: string])[] = [
  ['text', 'text'],
  ['accent-text', 'headings'],
  ['cue', 'names'],
  ['trans', 'transitions'],
  ['note', 'notes'],
  ['title', 'sections'],
  ['muted', 'parentheticals'],
];

interface Measured {
  text: number;
  weakest: { what: string; ratio: number };
}
const measured = ref<Measured | null>(null);

/** A colour as the browser draws it, as sRGB, through a 1×1 canvas, whatever form it computes it in. */
function drawn(color: string): Rgb | null {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = '#000';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** Each of `colours` as drawn in `root`, by a hidden probe that takes the pane's own variables. */
function probe(root: Element, colours: readonly string[], background: string) {
  const span = document.createElement('span');
  span.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
  root.append(span);
  try {
    span.style.backgroundColor = background;
    const ground = drawn(getComputedStyle(span).backgroundColor);
    const inks = colours.map((colour) => {
      span.style.color = colour;
      return drawn(getComputedStyle(span).color);
    });
    return { ground, inks };
  } finally {
    span.remove();
  }
}

function measure() {
  if (typeof document === 'undefined') return;
  const source = props.pane === 'source';
  const root = document.querySelector(source ? '.cm-editor' : '.on-sheet');
  if (!root) {
    measured.value = null;
    return;
  }
  const colours = source
    ? SOURCE_COLOURS.map(([token]) => `var(--src-${token})`)
    : ['var(--drafter-ink)'];
  const { ground, inks } = probe(root, colours, source ? 'var(--bg)' : 'var(--drafter-page)');
  if (!ground || inks.some((ink) => !ink)) {
    measured.value = null;
    return;
  }
  const ratios = (inks as Rgb[]).map((ink) => contrastRatio(ink, ground));
  let weakest = 0;
  ratios.forEach((ratio, i) => {
    if (ratio < (ratios[weakest] as number)) weakest = i;
  });
  measured.value = {
    text: ratios[0] as number,
    weakest: {
      what: source ? (SOURCE_COLOURS[weakest]?.[1] as string) : 'text',
      ratio: ratios[weakest] as number,
    },
  };
}

// Measured again as the slider moves, the theme or the page colour changes, or a pane appears.
const remeasure = () => requestAnimationFrame(() => requestAnimationFrame(measure));
onMounted(remeasure);
watch(
  () => [value.value, colorMode.value, settings.value.pageColor, settings.value.writingMode],
  remeasure,
);

const levelOf = (ratio: number): WcagLevel => wcagLevel(ratio);
/** The ratios in one sentence, which the slider is described by. */
const summary = computed(() => {
  const m = measured.value;
  if (!m) return '';
  const text = `Text ${ratioLabel(m.text)}, WCAG ${levelOf(m.text)}.`;
  if (props.pane === 'script' || m.weakest.what === 'text') return text;
  return `${text} Weakest, ${m.weakest.what}: ${ratioLabel(m.weakest.ratio)}, WCAG ${levelOf(m.weakest.ratio)}.`;
});
</script>

<template>
  <div class="contrast-row" :data-contrast="props.pane">
    <label class="contrast">
      <UIcon name="i-lucide-contrast" class="icon" aria-hidden="true" />
      <span class="name">{{ name }}</span>
      <input
        type="range"
        :min="CONTRAST_MIN"
        :max="CONTRAST_MAX"
        :step="CONTRAST_STEP"
        :value="value"
        :aria-label="name"
        :aria-valuetext="label"
        :aria-describedby="measured ? ratioId : undefined"
        @input="onInput"
      />
      <span class="value" aria-hidden="true">{{ label }}</span>
    </label>
    <!-- The ratios, from the colours drawn: WCAG 2.1's 4.5:1 (AA) and 7:1 (AAA) for normal text.
         Read with the slider (aria-describedby), not announced at every step. -->
    <p v-if="measured" class="ratio" data-contrast-ratio aria-hidden="true">
      <span>Text <strong>{{ ratioLabel(measured.text) }}</strong></span>
      <span class="level" :data-level="levelOf(measured.text)">{{ levelOf(measured.text) }}</span>
      <template v-if="props.pane === 'source' && measured.weakest.what !== 'text'">
        <span class="sep">·</span>
        <span>
          weakest, {{ measured.weakest.what }}
          <strong>{{ ratioLabel(measured.weakest.ratio) }}</strong>
        </span>
        <span class="level" :data-level="levelOf(measured.weakest.ratio)">
          {{ levelOf(measured.weakest.ratio) }}
        </span>
      </template>
    </p>
    <span v-if="measured" :id="ratioId" class="sr-only">{{ summary }}</span>
  </div>
</template>

<style scoped>
.contrast-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.contrast {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
}
.icon {
  width: 14px;
  height: 14px;
  color: var(--muted);
}
input[type='range'] {
  width: 140px;
  height: 24px;
  margin: 0;
  accent-color: var(--focus);
  cursor: pointer;
}
input[type='range']:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.name {
  min-width: 8.5em;
}
.value {
  min-width: 4ch;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
.ratio {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  margin: 0 0 0 24px;
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.ratio strong {
  color: var(--text);
  font-weight: 600;
}
.level {
  padding: 0 5px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  color: var(--text);
  font-size: 11px;
}
.level[data-level='below AA'] {
  border-color: var(--warn-border, var(--border));
  background: var(--warn-bg, transparent);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
