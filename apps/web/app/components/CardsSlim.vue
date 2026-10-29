<script setup lang="ts">
import { CARD_SIZES, type CardSize, useSettings } from '~/settings/settings';

// The Cards tab's slim bar: the scene count and length (as the Outline's), and the card size,
// which is kept as a setting (Phase 2 design §7).
const { settings, set } = useSettings();
const LABELS: Record<CardSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };
</script>

<template>
  <OutlineSlim />
  <span class="spacer" />
  <div role="group" aria-label="Card size" class="zoom">
    <button
      v-for="size in CARD_SIZES"
      :key="size"
      type="button"
      class="zoom-button"
      :aria-pressed="settings.cardSize === size ? 'true' : 'false'"
      @click="set('cardSize', size)"
    >
      {{ LABELS[size] }}
    </button>
  </div>
</template>
