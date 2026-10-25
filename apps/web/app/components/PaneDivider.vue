<script setup lang="ts">
import { SPLIT } from '~/utils/panes';

const props = defineProps<{ split: number }>();
const emit = defineEmits<{ resize: [ratio: number] }>();
const divider = ref<HTMLElement>();

function onKeydown(event: KeyboardEvent) {
  const targets: Record<string, number> = {
    ArrowLeft: props.split - SPLIT.step,
    ArrowRight: props.split + SPLIT.step,
    Home: SPLIT.min,
    End: SPLIT.max,
  };
  const target = targets[event.key];
  if (target === undefined) return;
  event.preventDefault();
  emit('resize', target);
}

// Dragging sets the split from the pointer's place across the panes.
function onPointerdown(event: PointerEvent) {
  const el = divider.value;
  const box = el?.parentElement?.getBoundingClientRect();
  if (!el || !box) return;
  el.setPointerCapture(event.pointerId);
  const move = (e: PointerEvent) => emit('resize', (e.clientX - box.left) / box.width);
  const stop = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', stop);
    el.removeEventListener('pointercancel', stop);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
}
</script>

<template>
  <div
    ref="divider"
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize panes"
    :aria-valuenow="Math.round(props.split * 100)"
    :aria-valuemin="SPLIT.min * 100"
    :aria-valuemax="SPLIT.max * 100"
    tabindex="0"
    class="divider"
    @keydown="onKeydown"
    @pointerdown="onPointerdown"
  />
</template>

<style scoped>
.divider {
  display: grid;
  place-items: center;
  background: var(--line);
  cursor: col-resize;
  touch-action: none;
}
.divider::after {
  content: "";
  width: 2px;
  height: 28px;
  border-radius: 2px;
  background: var(--faint);
}
</style>
