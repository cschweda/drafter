<script setup lang="ts">
import { CARD_SIZES, type CardSize, useSettings } from '~/settings/settings';

// The Cards tab's slim bar: the scene count and length (as the Outline's), and the card size,
// which is kept as a setting (Phase 2 design §7).
const { settings, set } = useSettings();
const LABELS: Record<CardSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };
const OPTIONS = CARD_SIZES.map((value) => ({ value, label: LABELS[value] }));
const size = computed({
  get: () => settings.value.cardSize,
  set: (value: CardSize) => void set('cardSize', value),
});
</script>

<template>
  <OutlineSlim />
  <span class="spacer" />
  <DSegmented v-model="size" label="Card size" :options="OPTIONS" />
</template>
