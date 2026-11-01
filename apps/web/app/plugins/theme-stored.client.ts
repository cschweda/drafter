import { noteThemeStored } from '~/settings/theme-stored';

// A fresh visit follows the system's appearance (fresh-look design §9), and "fresh" includes "no
// theme stored yet". The color mode's own plugin stores the theme as it starts, so this one runs
// before it and notes what was there (`settings/apply.ts` reads it).
export default defineNuxtPlugin({
  name: 'drafter:theme-stored',
  enforce: 'pre',
  setup() {
    noteThemeStored();
  },
});
