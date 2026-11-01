import { WIDE_QUERY } from '~/utils/panes';

/**
 * The on-screen keyboard, below 1024px (fresh-look design §6, Review Focus 5; Task 9). A phone's
 * keyboard leaves the window its size and takes the bottom of the visual viewport, so it is read
 * from `visualViewport`: up while that is more than 80px shorter than the window, at a zoom of 1 (a
 * pinch zoom shortens it too). While it is up the page is fitted to what is still seen
 * (`--vv-height`, `--vv-top` on the root, and its `keyboard-open` class): the bottom tab bar and the
 * status bar give way, and the element row sits at the bottom of the Source, on the keyboard's top
 * edge, with the text above it, so the line being typed is never under it. Rotating the phone, or
 * the keyboard changing height, reads it again.
 *
 * One listener for the page, made by the first caller; `open` and `inset` are shared.
 */
const open = ref(false);
const inset = ref(0);
let installed = false;

/** How much shorter than the window the visual viewport must be to be a keyboard. */
const KEYBOARD_MIN = 80;

function read() {
  const viewport = window.visualViewport;
  const root = document.documentElement;
  const narrow = !window.matchMedia(WIDE_QUERY).matches;
  const height = viewport?.height ?? window.innerHeight;
  const covered = window.innerHeight - height - (viewport?.offsetTop ?? 0);
  const up =
    !!viewport && narrow && Math.abs((viewport.scale ?? 1) - 1) < 0.01 && covered > KEYBOARD_MIN;
  open.value = up;
  inset.value = up ? Math.round(covered) : 0;
  root.classList.toggle('keyboard-open', up);
  if (up) {
    root.style.setProperty('--vv-height', `${Math.round(height)}px`);
    root.style.setProperty('--vv-top', `${Math.round(viewport?.offsetTop ?? 0)}px`);
  } else {
    root.style.removeProperty('--vv-height');
    root.style.removeProperty('--vv-top');
  }
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const viewport = window.visualViewport;
  viewport?.addEventListener('resize', read);
  viewport?.addEventListener('scroll', read);
  window.addEventListener('resize', read);
  read();
}

export function useOnScreenKeyboard() {
  onMounted(install);
  return { open: readonly(open), inset: readonly(inset) };
}
