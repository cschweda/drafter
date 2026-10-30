import { onBeforeUnmount, type Ref, ref, watch } from 'vue';

// A region that scrolls sideways (a wide table on a phone) is a Tab stop, so the keyboard can
// scroll it; one that fits isn't, since a stop that does nothing is only in the way.

/**
 * Calls `changed` with whether `el` scrolls sideways now, and again each time that changes as the
 * region or what it holds is resized. Returns a function that stops watching.
 */
export function watchSideways(el: HTMLElement, changed: (scrolls: boolean) => void): () => void {
  let last: boolean | null = null;
  const check = () => {
    const scrolls = el.scrollWidth > el.clientWidth;
    if (scrolls === last) return;
    last = scrolls;
    changed(scrolls);
  };
  check();
  if (typeof ResizeObserver === 'undefined') return () => {};
  const observer = new ResizeObserver(check);
  observer.observe(el);
  for (const child of el.children) observer.observe(child);
  return () => observer.disconnect();
}

/** Whether the element in `target` scrolls sideways, kept up to date while the component lives. */
export function useScrollsSideways(target: Readonly<Ref<HTMLElement | null | undefined>>) {
  const scrolls = ref(false);
  let stop: (() => void) | undefined;
  watch(
    target,
    (el) => {
      stop?.();
      stop = undefined;
      scrolls.value = false;
      if (el)
        stop = watchSideways(el, (now) => {
          scrolls.value = now;
        });
    },
    { flush: 'post', immediate: true },
  );
  onBeforeUnmount(() => stop?.());
  return scrolls;
}
