<script setup lang="ts">
import { lengthLabel } from '~/outline/labels';
import { useOutline } from '~/outline/use-outline';

// The Outline tab's slim bar: how many scenes, and how long they run once the pages are made.
const { index } = useOutline();
const summary = computed(() => {
  const { scenes } = index.value;
  const count = `${scenes.length} ${scenes.length === 1 ? 'scene' : 'scenes'}`;
  if (scenes.length === 0 || scenes.some((s) => s.pages === null)) return count;
  return `${count} · ${lengthLabel(scenes.reduce((sum, s) => sum + (s.pages?.eighths ?? 0), 0))}`;
});
</script>

<template>
  <span>{{ summary }}</span>
</template>
