<script setup lang="ts">
import { contextFor } from '~/modules/context';
import { folderIdOf, folderModules, folderNetworkReady } from '~/modules/folder';
import { useModules } from '~/modules/registry';

// The hidden frame of each module from the desktop app's modules folder that is on: it loads the
// module, says what it offers, and runs its button and commands. None until the module is turned
// on, and none before the desktop app knows what the module may reach.
const { enabled } = useModules();
const running = computed(() =>
  folderModules.value.filter(
    (m) => enabled.value.includes(m.id) && folderNetworkReady.value.has(folderIdOf(m.id)),
  ),
);
</script>

<template>
  <div class="folder-runners">
    <FolderModuleFrame
      v-for="module in running"
      :key="module.id"
      :module-id="folderIdOf(module.id)"
      :name="module.name"
      surface="background"
      :context="contextFor(module)"
    />
  </div>
</template>

<style scoped>
.folder-runners {
  display: contents;
}
</style>
