<script setup lang="ts">
import { useEditor } from '~/editor/session';
import { novelSummary } from '~/novel/labels';
import { useNovel } from '~/novel/use-novel';
import { lengthLabel } from '~/outline/labels';
import { useOutline } from '~/outline/use-outline';

// The Outline tab's slim bar: how many scenes, and how long they run once the pages are made; in a
// novel, its chapters, sections, and words, and the book's target when it has one.
const editor = useEditor();
const { index } = useOutline();
const novel = useNovel();
const summary = computed(() => {
  if (editor.kind.value === 'markdown' && editor.novel.value) {
    return novelSummary(novel.tree.value, novel.facts.value.bookTarget ?? null);
  }
  const { scenes } = index.value;
  const count = `${scenes.length} ${scenes.length === 1 ? 'scene' : 'scenes'}`;
  if (scenes.length === 0 || scenes.some((s) => s.pages === null)) return count;
  return `${count} · ${lengthLabel(scenes.reduce((sum, s) => sum + (s.pages?.eighths ?? 0), 0))}`;
});
</script>

<template>
  <span>{{ summary }}</span>
</template>
