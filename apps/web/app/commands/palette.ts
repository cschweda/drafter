import { ref } from 'vue';

/** What the palette lists: everything, only the scenes, or a prompt for a line number. */
export type PaletteMode = 'all' | 'scene' | 'line';

const open = ref(false);
const mode = ref<PaletteMode>('all');
/** Where focus goes back to when the palette closes without a command moving it. */
let returnTo: HTMLElement | null = null;

/** The palette's state, shared by the keys, the toolbar, the commands, and the palette itself. */
export function usePalette() {
  return { open, mode };
}

/** The element to focus when the palette closes. */
export function paletteReturnTarget(): HTMLElement | null {
  return returnTo;
}

/**
 * Opens the palette (or, if it is open, changes what it lists). `from` is the button that was
 * pressed: Safari doesn't focus a button on a click, so the focused element isn't it.
 */
export function openPalette(next: PaletteMode = 'all', from?: HTMLElement | null) {
  if (!open.value) {
    const active = document.activeElement;
    returnTo = from ?? (active instanceof HTMLElement && active !== document.body ? active : null);
  }
  mode.value = next;
  open.value = true;
}

export function closePalette() {
  open.value = false;
}

/** Mod-k: opens the palette, or closes it when it is open. */
export function togglePalette() {
  if (open.value) closePalette();
  else openPalette();
}

/** The commands that change what the open palette lists rather than closing it. */
export const PALETTE_COMMANDS: ReadonlySet<string> = new Set(['go-to-scene', 'go-to-line']);
