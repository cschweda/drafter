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

/** The wide-screen query, made once (`install`). */
let wideQuery: MediaQueryList | undefined;
/** The `--vv-*` values last written, so a variable is written only when it changes. */
const written = new Map<string, string>();
function writeVar(name: string, value: string | undefined) {
  if (written.get(name) === value) return;
  const style = document.documentElement.style;
  if (value === undefined) {
    written.delete(name);
    style.removeProperty(name);
  } else {
    written.set(name, value);
    style.setProperty(name, value);
  }
}

function read() {
  const viewport = window.visualViewport;
  const narrow = !(wideQuery ?? window.matchMedia(WIDE_QUERY)).matches;
  const height = viewport?.height ?? window.innerHeight;
  const covered = window.innerHeight - height - (viewport?.offsetTop ?? 0);
  const up =
    !!viewport && narrow && Math.abs((viewport.scale ?? 1) - 1) < 0.01 && covered > KEYBOARD_MIN;
  open.value = up;
  inset.value = up ? Math.round(covered) : 0;
  document.documentElement.classList.toggle('keyboard-open', up);
  writeVar('--vv-height', up ? `${Math.round(height)}px` : undefined);
  writeVar('--vv-top', up ? `${Math.round(viewport?.offsetTop ?? 0)}px` : undefined);
}

/** The viewport's resize and scroll come many to a frame while the keyboard slides: one read a frame. */
let frame = 0;
function readSoon() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    read();
  });
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  wideQuery = window.matchMedia(WIDE_QUERY);
  wideQuery.addEventListener('change', readSoon);
  const viewport = window.visualViewport;
  viewport?.addEventListener('resize', readSoon);
  viewport?.addEventListener('scroll', readSoon);
  window.addEventListener('resize', readSoon);
  read();
}

export function useOnScreenKeyboard() {
  onMounted(install);
  return { open: readonly(open), inset: readonly(inset) };
}
