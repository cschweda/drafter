import { WIDE_QUERY } from '~/utils/panes';

/** True while `query` matches, following it as the window changes. */
export function useMatchMedia(query: string) {
  const matches = ref(typeof window !== 'undefined' && window.matchMedia(query).matches);
  let list: MediaQueryList | undefined;
  const update = (event: MediaQueryListEvent) => {
    matches.value = event.matches;
  };
  onMounted(() => {
    list = window.matchMedia(query);
    matches.value = list.matches;
    list.addEventListener('change', update);
  });
  onBeforeUnmount(() => list?.removeEventListener('change', update));
  return matches;
}

/** True on screens wide enough for two panes: 1024px, Tailwind's `lg`. */
export function useWideScreen() {
  return useMatchMedia(WIDE_QUERY);
}
