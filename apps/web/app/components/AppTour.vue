<script setup lang="ts">
import type { TourStep } from 'nuxt-guided-tour/types';
import { isApple, matchesKey } from '~/commands/keys';
import { useCommands } from '~/commands/registry';
import { usePanes } from '~/composables/usePanes';
import { useWideScreen } from '~/composables/useWideScreen';
import { isFirstVisit, useScript } from '~/storage/script';
import { announceTour } from '~/tour/announce';
import { tourRequests, tourShowing, whenClear } from '~/tour/state';
import {
  buildSteps,
  INTRO_SLIDES,
  paneOf,
  TOUR_STORAGE_PREFIX,
  TOUR_VERSION,
  WELCOME,
} from '~/tour/tour.config';

// The welcome dialog, the "Fountain in 30 seconds" card, and the ten steps (Phase 1 design §4.4),
// built from `nuxt-guided-tour`'s parts. The module keeps the steps, the highlight, the arrow keys,
// the focus trap, and the screen-reader announcements; this adds what Drafter needs around it:
// - the welcome only on a first visit that hasn't seen the tour, and the tour again only on request;
// - it waits for a dialog or the palette to close rather than stacking on it;
// - a step whose pane isn't showing brings it into view first, and the layout comes back after;
// - while it is up, the app's own global keys (the palette, Save, Open) are held back.
const wide = useWideScreen();
const { tabs, phoneTab, choose } = usePanes();
const commands = useCommands();
const { ready } = useScript();
const apple = isApple();

const steps = reactive<TourStep[]>(buildSteps(wide.value));
const {
  isActive,
  currentStep,
  progress,
  start,
  next,
  previous,
  cancel,
  hasCompletedTour,
  markAsSeen,
} = useGuidedTour({
  version: TOUR_VERSION,
  autoStart: false,
  autoStartDelay: 0,
  storageKeyPrefix: TOUR_STORAGE_PREFIX,
  steps,
  announce: announceTour,
});

/** Which screen is up before the steps: the welcome (a first visit), or the intro card. */
const stage = ref<'welcome' | 'intro' | null>(null);
watchEffect(() => {
  tourShowing.value = stage.value !== null || isActive.value;
});

// ---- Offering the tour ---------------------------------------------------------------------

let unmounted = false;
let offering = false;
/** What had focus when the tour was asked for: it gets focus back when the tour is over. */
let opener: HTMLElement | null = null;

async function offer(first: boolean) {
  if (offering || tourShowing.value) return;
  offering = true;
  const active = document.activeElement;
  opener = active instanceof HTMLElement && active !== document.body ? active : null;
  const clear = await whenClear(() => unmounted);
  offering = false;
  if (!clear || tourShowing.value) return;
  stage.value = first ? 'welcome' : 'intro';
}

// Help → Take the tour, and the palette's command.
watch(tourRequests, () => void offer(false));

// A first visit that hasn't seen the tour is welcomed, once. (A returning visit never is: the
// first visit stored the sample, so a reload is a returning one. See `isFirstVisit`.)
watch(
  () => ready.value && isFirstVisit(),
  (first) => {
    if (first && !hasCompletedTour.value) void offer(true);
  },
  { immediate: true },
);

/**
 * Puts focus back where the tour was asked for, unless something else has it by now. The tour's
 * dialogs fade out with focus still in them, so this waits for them to go.
 */
function settle(tries = 0) {
  setTimeout(() => {
    const active = document.activeElement;
    if (active?.closest('.tour-dialog, .welcome-dialog, .intro-dialog') && tries < 10) {
      settle(tries + 1);
      return;
    }
    if (active && active !== document.body) return;
    if (!opener) return;
    // A menu item is gone once its menu closes (or is kept, hidden): then the menu's mark gets it.
    const back =
      opener.isConnected && opener.getClientRects().length > 0
        ? opener
        : document.querySelector<HTMLElement>('[data-tour="menu"]');
    back?.focus();
  }, 120);
}

function skip() {
  stage.value = null;
  markAsSeen();
  settle();
}

function begin() {
  stage.value = null;
  layoutBefore = { tabs: { ...tabs.value }, phone: phoneTab.value };
  start();
}

// ---- The panes a step points at -------------------------------------------------------------

let layoutBefore: { tabs: typeof tabs.value; phone: string } | null = null;

/** Shows the tab a step points at, when its target is a pane that isn't showing. */
function reveal(step: TourStep | null) {
  const tab = paneOf(step);
  if (!tab) return;
  if (wide.value) {
    if (tabs.value.left !== tab && tabs.value.right !== tab) choose('right', tab);
  } else if (phoneTab.value !== tab) {
    phoneTab.value = tab;
  }
}

// Runs before the render, so the pane is there when the module highlights its target.
watch(currentStep, (step) => reveal(step));

// The template chip is hidden on a phone, so its step points at the menu there.
watch(wide, (now) => {
  steps.splice(0, steps.length, ...buildSteps(now));
  reveal(currentStep.value);
});

// The tour is over (finished, or left with Escape or Skip): the writer's own layout comes back.
watch(isActive, (now, was) => {
  if (was && !now) {
    if (layoutBefore) {
      tabs.value = layoutBefore.tabs;
      phoneTab.value = layoutBefore.phone;
      layoutBefore = null;
    }
    settle();
  }
});

// ---- Keys -----------------------------------------------------------------------------------

function onKeydown(event: KeyboardEvent) {
  if (!tourShowing.value) return;
  // A key that belongs to the app (the palette, Save, Open…) does nothing under the tour.
  const found = commands.value.find((c) => c.global && c.keys && matchesKey(event, c.keys, apple));
  if (found) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  // The intro card treats Enter as "next" wherever focus is, which would turn Enter on its Skip
  // button into Start. A button does its own thing on Enter.
  if (
    stage.value === 'intro' &&
    event.key === 'Enter' &&
    event.target instanceof HTMLButtonElement
  ) {
    event.stopPropagation();
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown, true));
onBeforeUnmount(() => {
  unmounted = true;
  window.removeEventListener('keydown', onKeydown, true);
});
</script>

<template>
  <TourWelcome
    :is-visible="stage === 'welcome'"
    :title="WELCOME.title"
    :description="WELCOME.description"
    :subdescription="WELCOME.subdescription"
    :start-label="WELCOME.startLabel"
    :skip-label="WELCOME.skipLabel"
    logo-url="/mark.svg"
    logo-alt=""
    @start-tour="stage = 'intro'"
    @skip-tour="skip"
  />
  <TourIntro :is-visible="stage === 'intro'" :slides="INTRO_SLIDES" @next="begin" @skip="skip" />
  <TourOverlay
    :is-active="isActive"
    :current-step="currentStep"
    :progress="progress"
    @next="next"
    @previous="previous"
    @cancel="cancel"
  />
</template>
