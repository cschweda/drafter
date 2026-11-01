<script setup lang="ts">
import { draftWhen, readerHeader } from '~/drafts/labels';
import { useDrafts } from '~/drafts/use-drafts';

// A draft read beside the Source (drafts-and-cuts design §2.3): read-only, its header "Draft 2 ·
// a3f9c2e · read-only", and its text selectable, so any passage can be copied across into the
// script. Plain text in the editor's font, as it was frozen; it never changes.

const { reading } = useDrafts();
const uid = useId();
</script>

<template>
  <div class="reader">
    <DEmpty v-if="!reading" icon="i-lucide-book-open">No draft is open to read.</DEmpty>
    <section v-else :aria-labelledby="`${uid}-title`" class="draft">
      <header class="head">
        <h2 :id="`${uid}-title`" class="title">{{ readerHeader(reading.row) }}</h2>
        <p class="meta">
          {{ draftWhen(reading.row.frozenAt) }}<template v-if="reading.row.note">
            · {{ reading.row.note }}</template>
        </p>
      </header>
      <!-- Read-only text, a tab stop of its own so it can be scrolled and selected by keyboard. -->
      <pre
        class="text"
        tabindex="0"
        role="textbox"
        aria-readonly="true"
        aria-multiline="true"
        :aria-label="`Text of Draft ${reading.row.n}, read-only`"
        data-draft-text
      >{{ reading.text }}</pre>
    </section>
  </div>
</template>

<style scoped>
.reader {
  min-height: 100%;
  background: var(--bg);
}
.draft {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px 24px;
}
.head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.meta {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
.text {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--surface);
  color: var(--text);
  font: 400 13px/1.55 var(--font-mono, ui-monospace, monospace);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
}
.text:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
