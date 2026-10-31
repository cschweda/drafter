import { computed, type Ref, ref } from 'vue';
import { type CheckState, checkMessage } from '../update/check';
import type { UpdateKind } from '../update/state';

// About Drafter's Check for updates… (fresh-look Task 3b; the maintainer, 2026-10-31): the same
// check as Help → Check for updates (`update/use-check.ts`: the service worker's on the web, the
// updater's in the desktop app), with what it found said in About under the version, where focus
// stays. A found update is the app's own offer, as the Check for updates dialog's is.

export interface AboutCheck {
  /** What the check says, once it has been asked in this About; empty before. */
  message: Ref<string>;
  /** A check is under way. */
  busy: Ref<boolean>;
  /** A new version is waiting: About offers its action (Reload, Restart, or Get it). */
  ready: Ref<boolean>;
  how: Ref<UpdateKind>;
  /** The check couldn't be made: the button tries again. */
  failed: Ref<boolean>;
  run(): Promise<void>;
  /** About closed: it says nothing until asked again. */
  reset(): void;
}

/**
 * About's view of the one check. `check` is its state, `run` what runs it (`runUpdateCheck`, which
 * also holds a found update as the offer).
 */
export function createAboutCheck(
  check: { state: Ref<CheckState> },
  run: () => Promise<unknown>,
  current: string,
  app: 'web' | 'desktop',
): AboutCheck {
  const asked = ref(false);
  const state = computed(() => check.state.value);
  return {
    message: computed(() => (asked.value ? checkMessage(state.value, current, app) : '')),
    busy: computed(() => state.value.status === 'checking'),
    ready: computed(() => asked.value && state.value.status === 'ready' && !!state.value.how),
    how: computed(() => state.value.how ?? 'reload'),
    failed: computed(() => asked.value && state.value.status === 'error'),
    async run() {
      asked.value = true;
      await run();
    },
    reset() {
      asked.value = false;
    },
  };
}
