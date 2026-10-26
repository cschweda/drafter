import { WIDE_QUERY } from '~/utils/panes';

/** True on screens wide enough for two panes: 1024px, Tailwind's `lg`. */
export function useWideScreen() {
  const query = WIDE_QUERY;
  const wide = ref(typeof window !== 'undefined' && window.matchMedia(query).matches);
  let list: MediaQueryList | undefined;
  const update = (event: MediaQueryListEvent) => {
    wide.value = event.matches;
  };
  onMounted(() => {
    list = window.matchMedia(query);
    wide.value = list.matches;
    list.addEventListener('change', update);
  });
  onBeforeUnmount(() => list?.removeEventListener('change', update));
  return wide;
}
