<template>
  <footer class="status" data-tour="status">
    <span>Sample</span>
    <span class="spacer" />
    <span>US Screenplay</span>
  </footer>
</template>

<style scoped>
.status {
  display: flex;
  gap: 16px;
  padding: 6px 14px;
  background: var(--chrome);
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
}
.spacer {
  flex: 1;
}
</style>
