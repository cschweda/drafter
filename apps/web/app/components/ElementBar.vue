<script setup lang="ts">
import type { EditorState } from '@codemirror/state';
import {
  canMakeParenthetical,
  classicNext,
  elementHint,
  PARENTHETICAL_HINT,
  readsAsName,
  spellMarkAt,
  structureOf,
} from '@drafter/cm-fountain';
import { resolveRole } from '@drafter/templates';
import type { DropdownMenuItem } from '@nuxt/ui';
import { HELP_PAGES, helpHref } from '~/commands/data';
import { isApple } from '~/commands/keys';
import { commandById } from '~/commands/registry';
import { useElementBarShown } from '~/composables/useElementBarShown';
import { useOnScreenKeyboard } from '~/composables/useOnScreenKeyboard';
import { useWideScreen } from '~/composables/useWideScreen';
import { keyLine, nextLabel } from '~/editor/classic-key-line';
import {
  type BarButton,
  barFor,
  classicHere,
  classicTipFor,
  currentOf,
  hereParts,
  MARKDOWN_BUTTONS,
  markLine,
  reasonFor,
  SPELLING_BUTTON,
  tipFor,
} from '~/editor/element-bar';
import { ELEMENT_NAMES } from '~/editor/element-names';
import { elementNotice, sayElement } from '~/editor/element-notice';
import { useEditor } from '~/editor/session';
import { CLASSIC_HELP } from '~/editor/writing-mode';
import { MARKDOWN_ELEMENT_NAMES, markdownElement } from '~/markdown/commands';
import { useSettings } from '~/settings/settings';
import { openSpellMenu } from '~/spell/menu';
import { NO_MARK_HERE, saySpell } from '~/spell/notice';
import { scrollbarsFloat } from '~/utils/scrollbars';

// The element bar (docs/drafter-element-bar-design.md): a row of buttons over the Source that
// writes Fountain's marks, and teaches them, for a writer who doesn't know them yet. Each button
// runs a registered command (`commands/builtin.ts`), the one the palette runs, so it acts on the
// selection and is one undo step. It is a toolbar: one tab stop, and the arrow keys move along it.
// The element the cursor's line is shows at the left, and its button is shown pressed. A press
// doesn't take focus from the editor, so a phone's keyboard stays up. It goes in focus mode, in a
// tab that only shows the script, and when Settings turns it off.
//
// Side by side (`inHeader`, fresh-look design §3.2) it sits in the editor's 36px header, as compact
// chips: first a chip that names the element the cursor is in (any element, a note or a blank line
// too), then the buttons, then More, which also holds the cheat sheet and the bar's options. It
// never clips: the buttons fold into More from the right, measured rather than counted, by the
// width alone, so nothing moves as the cursor does. While focus is in another region (`away`) the
// header shows the script's title over it; it stays laid out and in the tab order, so a keyboard
// user who Tabs to it brings it back.
const props = defineProps<{
  /** In the editor's header, side by side: folds to fit, rather than scrolling. */
  inHeader?: boolean;
  /** Focus is outside the editor's pane: out of sight, still reachable by Tab. */
  away?: boolean;
}>();
const editor = useEditor();
const { settings, set } = useSettings();
const apple = isApple();
/** A tooltip is a sentence or two, so it wraps, within the width of a phone. */
const TIP_UI = { content: 'h-auto max-w-80 py-1.5', text: 'whitespace-normal' };

const shown = useElementBarShown();
const markdown = computed(() => editor.kind.value === 'markdown');
/** The script's structure by its template: a stage play has acts, `##` scenes, and stage directions. */
const structure = computed(() => structureOf(editor.template.value));
/** Classic Mode teaches no marks: its bar has none, and its help is its own (design §9.2). */
const classic = computed(() => !markdown.value && settings.value.writingMode === 'classic');
const bar = computed(() =>
  markdown.value ? { buttons: MARKDOWN_BUTTONS, more: [] } : barFor(structure.value),
);
const buttons = computed(() => bar.value.buttons);

// What the bar reads from the editor's state, worked out when the text or the selection changes
// (and, for Markdown, when its grammar has more of the tree), each kept only when it differs, so
// a scroll or a change of focus draws nothing again.
const parenthesisOff = ref(false);
/** The cursor's line is a name with no speech under it yet, which the parse calls action. */
const onName = ref(false);
/** The cursor is on the empty line under a name or a speech: what is typed there is dialogue. */
const inSpeech = ref(false);
const markdownHere = ref<string | null>(null);
function follow(state: EditorState) {
  if (markdown.value) {
    markdownHere.value = markdownElement(state);
    return;
  }
  parenthesisOff.value = !canMakeParenthetical(state);
  onName.value = readsAsName(state);
  inSpeech.value = !editor.cursor.value && elementHint('dialogue', state) !== null;
}
function followTree(state: EditorState) {
  if (markdown.value) markdownHere.value = markdownElement(state);
}
/** The cursor is on a misspelled word: the marks come with an effect, and move with the cursor. */
const onMark = ref(false);
function followMark(state: EditorState) {
  onMark.value = spellMarkAt(state, state.selection.main.head) !== null;
}
const stops: Array<() => void> = [];
/** A floating scrollbar would cover the buttons' lower half (utils/scrollbars.ts), so it's hidden. */
const floatingScrollbar = ref(false);
onMounted(() => {
  floatingScrollbar.value = scrollbarsFloat();
  follow(editor.view.state);
  followMark(editor.view.state);
  stops.push(
    editor.onState(follow),
    editor.onUpdate(followTree),
    editor.onState(followMark),
    editor.onUpdate(followMark),
  );
});
onBeforeUnmount(() => {
  for (const stop of stops.splice(0)) stop();
});
watch(markdown, () => follow(editor.view.state));

// ---- Where the cursor is -------------------------------------------------------------------

/** The cursor's block, and its role in the template (a stage play's act, scene, stage direction). */
const block = computed(() => {
  const element = editor.cursor.value;
  return element && element.blockIndex >= 0 ? editor.doc.value.blocks[element.blockIndex] : null;
});
const role = computed(() => {
  const found = block.value;
  if (!found || (found.kind !== 'section' && found.kind !== 'action')) return null;
  // Neither kind's rules look at the block before, so no previous role is needed.
  return resolveRole(editor.template.value, found, null);
});
/** The element the bar names: the template's, and a name with no speech yet is a Character. */
const shownLine = computed(() => {
  if (markdown.value) return currentOf(null, null);
  if (classic.value && editor.element.value) {
    return classicHere(editor.element.value, structure.value);
  }
  if (onName.value) return currentOf('character', null);
  return currentOf(editor.cursor.value?.kind ?? null, role.value);
});
const here = computed(() => hereParts(markdown.value ? markdownHere.value : shownLine.value.name));
/** What Enter and Tab do here, on the chip, as in the status bar. */
const keys = computed(() => (classic.value ? keyLine(editor.element.value, structure.value) : ''));
const why = computed(() => {
  if (classic.value) return `${keys.value ? `${keys.value}. ` : ''}Opens the Classic Mode help.`;
  const context = onName.value ? 'name' : inSpeech.value ? 'speech' : undefined;
  const kind = onName.value ? 'character' : (editor.cursor.value?.kind ?? null);
  const reason = reasonFor(kind, !!block.value?.forced, context, onName.value ? null : role.value);
  return `${reason.charAt(0).toUpperCase()}${reason.slice(1)}. Opens the Fountain cheat sheet there.`;
});
/** The chip's tooltip in the header: where the cursor is, then why. */
const hereTip = computed(() =>
  props.inHeader ? `${here.value.lead}${here.value.name}. ${why.value}` : why.value,
);

/** Opens the cheat sheet, at the element the cursor is in when there is one. */
function openCheatSheet(atElement: boolean) {
  if (classic.value) {
    window.open(CLASSIC_HELP, '_blank');
    return;
  }
  const sheet = HELP_PAGES.find((page) => page.id === 'help-fountain');
  if (!sheet) return;
  const { anchor } = shownLine.value;
  if (atElement && anchor) window.open(`${helpHref(sheet)}#${anchor}`, '_blank');
  else commandById(sheet.id)?.run();
}

// ---- The buttons ---------------------------------------------------------------------------

const pressed = (button: BarButton) => button.command === shownLine.value.command;
const off = (button: BarButton) =>
  button.command === 'element-parenthetical' && parenthesisOff.value;
const tip = (button: BarButton) => {
  if (off(button)) return PARENTHETICAL_HINT;
  return classic.value ? classicTipFor(button, structure.value, apple) : tipFor(button, apple);
};
/** A help's name: the Classic Mode help in Classic Mode. */
const helpName = computed(() => (classic.value ? 'Classic Mode help' : 'Fountain cheat sheet'));

function press(button: BarButton) {
  if (longPressed) {
    longPressed = false;
    return;
  }
  // The command would do nothing: the bar says why, rather than nothing.
  if (off(button)) {
    void sayElement(PARENTHETICAL_HINT);
    return;
  }
  const command = commandById(button.command);
  if (command && command.enabled?.() !== false) void command.run();
}

/** A button as an item of More: its mark in the place a menu shows a shortcut. */
const moreItem = (button: BarButton): DropdownMenuItem => ({
  label: button.label,
  kbds: button.mark && !classic.value ? [button.mark] : undefined,
  onSelect: () => {
    chosen = true;
    press(button);
  },
});
// More: the buttons folded off a narrow bar first, then the rest of the elements, then the cheat
// sheet and the bar's options when they have folded too.
const more = computed<DropdownMenuItem[][]>(() => {
  const folded = buttons.value.filter((button) => isFolded(button.command)).map(moreItem);
  const extra: DropdownMenuItem[] = [];
  if (props.inHeader && !markdown.value) {
    extra.push({
      label: helpName.value,
      icon: 'i-lucide-circle-help',
      onSelect: () => openCheatSheet(false),
    });
  }
  if (props.inHeader) extra.push(hideItem);
  return [folded, bar.value.more.map(moreItem), extra].filter((group) => group.length > 0);
});

// The command puts focus in the editor while the menu still holds it, so once the menu has closed
// the editor gets it back, rather than the button that opened the menu.
let chosen = false;
function onCloseAutoFocus(event: Event) {
  if (!chosen) return;
  chosen = false;
  event.preventDefault();
  requestAnimationFrame(() => editor.view.focus());
}

// ---- The phone's Next button (Classic Mode design §10) --------------------------------------

/** First in the row over a phone's keyboard in Classic Mode, as a phone's keyboard has no Tab. */
const nextShown = computed(() => classic.value && keyboard.open.value);
const nextName = computed(() => nextLabel(editor.element.value, structure.value));
/** What Tab does; a composition ends first. The press takes no focus, so the keyboard stays up. */
function pressNext() {
  classicNext(editor.view);
}

// ---- The phone's Spelling button (Plan D, Call 15) -----------------------------------------

const wide = useWideScreen();
/** Only on a narrow screen, where there is no right-click or Mod-., and only on a marked word. */
const spellingShown = computed(() => !wide.value && settings.value.spellcheck && onMark.value);

/** Opens the spelling menu under the button; the editor keeps focus until the menu takes it. */
function pressSpelling(event: MouseEvent) {
  if (longPressed) {
    longPressed = false;
    return;
  }
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (!openSpellMenu(editor.view, { left: box.left, top: box.bottom })) void saySpell(NO_MARK_HERE);
}

// ---- Hiding it -----------------------------------------------------------------------------

const hideItem: DropdownMenuItem = {
  label: 'Hide the element bar',
  icon: 'i-lucide-eye-off',
  onSelect: () => {
    chosen = true;
    void set('elementBar', false);
    void sayElement(
      'The element bar is hidden. Turn it back on in Settings, or with “Show the element bar” in the palette.',
    );
    editor.view.focus();
  },
};
const options = computed<DropdownMenuItem[]>(() => [hideItem]);

// ---- Tooltips on touch: a long press shows one, and the tap that ends it does nothing -------

const openTip = ref<string | null>(null);
let pressTimer: ReturnType<typeof setTimeout> | undefined;
let longPressed = false;
function onPointerDown(event: PointerEvent, id: string) {
  clearTimeout(pressTimer);
  longPressed = false;
  if (event.pointerType !== 'touch') return;
  pressTimer = setTimeout(() => {
    longPressed = true;
    openTip.value = id;
  }, 500);
}
function onPointerEnd() {
  clearTimeout(pressTimer);
}
const setTip = (id: string, open: boolean) => {
  if (open) openTip.value = id;
  else if (openTip.value === id) openTip.value = null;
};

// ---- The arrow keys -------------------------------------------------------------------------

const toolbar = ref<HTMLElement>();
/** The item that has the toolbar's one tab stop: the last one focused. */
const current = ref('');
const items = () => [
  ...(toolbar.value?.querySelectorAll<HTMLElement>('[data-bar-item]:not([data-folded])') ?? []),
];
const order = computed(() =>
  [
    ...(nextShown.value ? ['next'] : []),
    ...(markdown.value ? [] : ['here']),
    ...buttons.value.map((button) => button.command),
    ...(spellingShown.value ? [SPELLING_BUTTON.command] : []),
    ...(moreShown.value && !moreHidden.value ? ['more'] : []),
    ...(markdown.value ? [] : ['help']),
    'options',
  ].filter((id) => !isFolded(id)),
);
const stopOf = (id: string) => {
  const stop = order.value.includes(current.value) ? current.value : order.value[0];
  return stop === id ? 0 : -1;
};
function onKeydown(event: KeyboardEvent) {
  const all = items();
  const at = all.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  const last = all.length - 1;
  const moves: Record<string, number> = {
    ArrowRight: at === last ? 0 : at + 1,
    ArrowLeft: at === 0 ? last : at - 1,
    Home: 0,
    End: last,
  };
  const next = moves[event.key];
  if (next === undefined) return;
  event.preventDefault();
  all[next]?.focus();
}
function onFocusin(event: FocusEvent) {
  const id = (event.target as HTMLElement).closest<HTMLElement>('[data-bar-item]')?.dataset.barItem;
  if (id) current.value = id;
}
const descId = (button: BarButton) => `element-bar-${button.command}-tip`;

// ---- Fitting the editor's header (fresh-look design §3.2, §10a) -----------------------------
// Everything stays laid out, a folded button hidden and out of the flow, so every width is known
// at any time: the fit is worked out from them, never by drawing and trying again, and folding
// changes nothing the observer measures by (the bar's own width is the header's to give). What
// folds depends on the width alone, never on the cursor, so nothing moves as the writer types: the
// buttons fold from the right, and the chip at the left, which names the element the cursor is in,
// keeps one width (its widest name's) and never folds.

/** How many buttons have folded, from the right. */
const fold = ref(0);
// On a phone the row scrolls sideways, except over the on-screen keyboard, where it is the row a
// writer types with: there it folds into More as the header's does, so no button is cut off
// mid-word at the window's edge (Task 9 review).
const keyboard = useOnScreenKeyboard();
const folds = computed(() => !!props.inHeader || keyboard.open.value);
const foldOrder = computed<string[]>(() =>
  folds.value ? buttons.value.map((button) => button.command).reverse() : [],
);
const foldedIds = computed(() => new Set(foldOrder.value.slice(0, fold.value)));
/** Side by side the cheat sheet's ? and the ⋯ menu are in More (the chip opens the sheet too). */
const isFolded = (id: string) =>
  (!!props.inHeader && (id === 'help' || id === 'options')) || foldedIds.value.has(id);
/** Side by side More is always there: it holds the ? and ⋯ items. A phone's Markdown bar has none,
 * except over the keyboard, where it is laid out (to be measured) and seen once something folds. */
const moreShown = computed(() => !markdown.value || folds.value);
const moreHidden = computed(() => markdown.value && !props.inHeader && fold.value === 0);
/** The chip's least width, so it stays as wide whatever the cursor is in (0: its own). */
const hereMin = ref(0);
const hereStyle = computed(() => (hereMin.value ? { minWidth: `${hereMin.value}px` } : undefined));

/** Every name the chip can show for this kind of document. */
const hereNames = computed(() => {
  if (markdown.value) return [...MARKDOWN_ELEMENT_NAMES, 'Blank line'];
  const roles = structure.value.headings ? [] : ['Act', 'Scene', 'Stage direction'];
  return [...Object.values(ELEMENT_NAMES), ...roles, 'Blank line'];
});
let canvas: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, font: string): number {
  if (canvas === undefined) {
    canvas = document.createElement('canvas').getContext('2d');
    // As the page draws its text (main.css): at true widths, not each letter on a whole pixel.
    if (canvas && 'textRendering' in canvas) canvas.textRendering = 'geometricPrecision';
  }
  if (!canvas) return 0;
  canvas.font = font;
  return canvas.measureText(text).width;
}
const capital = (name: string) => `${name.charAt(0).toUpperCase()}${name.slice(1)}`;

// Where the row scrolls (a phone with no on-screen keyboard), the edge with more of it fades, and
// the chips snap to the left edge as the row comes to rest, so no word is left cut at an edge
// (design §6; DECISIONS, final review).
/** More of the row is out of sight to the left. */
const moreBefore = ref(false);
/** More of the row is out of sight to the right. */
const moreAfter = ref(false);
function followEdges() {
  const el = toolbar.value;
  const scrolls = !!el && !folds.value && el.scrollWidth > el.clientWidth + 1;
  const before = scrolls && el.scrollLeft > 1;
  const after = scrolls && el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
  if (moreBefore.value !== before) moreBefore.value = before;
  if (moreAfter.value !== after) moreAfter.value = after;
}

function measure() {
  const el = toolbar.value;
  if (!el) return;
  // Measured: the browser tests wait for this before they look at what folded.
  el.removeAttribute('data-fitting');
  followEdges();
  if (!folds.value) {
    fold.value = 0;
    hereMin.value = 0;
    return;
  }
  const style = getComputedStyle(el);
  const room =
    el.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
  if (room <= 1) return;
  const gap = Number.parseFloat(style.columnGap) || 0;
  const widthOf = (selector: string) => {
    const found = el.querySelector<HTMLElement>(selector);
    if (!found) return 0;
    const box = getComputedStyle(found);
    return (
      found.getBoundingClientRect().width +
      Number.parseFloat(box.marginLeft) +
      Number.parseFloat(box.marginRight)
    );
  };
  const item = (id: string) => widthOf(`[data-bar-item="${CSS.escape(id)}"]`);
  // The chip's widths, from its font: the widest name it can show, and the one it shows now.
  const chip = el.querySelector<HTMLElement>('[data-here]');
  const name = el.querySelector<HTMLElement>('[data-here-name]');
  let widest = 0;
  let own = 0;
  if (chip && name) {
    const box = getComputedStyle(chip);
    const text = getComputedStyle(name);
    const font = `${text.fontStyle} ${text.fontWeight} ${text.fontSize} ${text.fontFamily}`;
    const edges =
      Number.parseFloat(box.paddingLeft) +
      Number.parseFloat(box.paddingRight) +
      Number.parseFloat(box.borderLeftWidth) +
      Number.parseFloat(box.borderRightWidth);
    // On a phone the chip's lead ("You're in: ") shows before the name.
    const lead = props.inHeader ? 0 : textWidth(here.value.lead, font);
    const width = (n: string) => Math.ceil(textWidth(capital(n), font) + lead + edges);
    widest = Math.max(...hereNames.value.map(width));
    own = width(here.value.name);
  }
  const order = foldOrder.value;
  const total = (k: number, chipWidth: number) => {
    const gone = new Set(order.slice(0, k));
    const parts = [chipWidth, widthOf('.rule')];
    if (nextShown.value) parts.push(item('next'));
    for (const button of buttons.value) {
      if (!gone.has(button.command)) parts.push(item(button.command));
    }
    if (spellingShown.value) parts.push(item(SPELLING_BUTTON.command));
    if (!markdown.value || props.inHeader || k > 0) parts.push(item('more'));
    parts.push(SPACER);
    // A phone's row keeps its ? and ⋯ at the right.
    if (!props.inHeader) {
      if (!markdown.value) parts.push(item('help'));
      parts.push(item('options'));
    }
    return parts.reduce((sum, w) => sum + w, 0) + (parts.length - 1) * gap;
  };
  // A pixel to spare: widths are fractions, and a scroll width is rounded.
  let k = 0;
  while (k < order.length && total(k, widest) > room - 1) k++;
  // Last resort, with every button in More: the chip as wide as its own name.
  const min = total(k, widest) > room - 1 ? 0 : widest;
  if (fold.value !== k) fold.value = k;
  if (hereMin.value !== min) hereMin.value = min;
}
/** The spacer's least width (`.spacer`). */
const SPACER = 8;

let observer: ResizeObserver | undefined;
let frame = 0;
/** Measured in the next frame: never inside the observer's own callback (WebKit calls that a loop). */
function measureSoon() {
  toolbar.value?.setAttribute('data-fitting', '');
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(measure);
}
function observe(el: HTMLElement | undefined) {
  observer?.disconnect();
  // The bar's width: the header's to give, so folding never changes it.
  if (el) observer?.observe(el);
}
// A web font that arrives late changes every width.
const onFonts = () => measureSoon();
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') observer = new ResizeObserver(measureSoon);
  observe(toolbar.value);
  document.fonts?.addEventListener('loadingdone', onFonts);
  measureSoon();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  cancelAnimationFrame(frame);
  document.fonts?.removeEventListener('loadingdone', onFonts);
});
// The bar drawn again (shown, or another kind of document), or what it holds changed. (The name
// the chip shows matters only once it is as wide as its own name.)
watch(
  [toolbar, markdown],
  () =>
    void nextTick(() => {
      observe(toolbar.value);
      measureSoon();
    }),
);
watch(
  () => [
    foldOrder.value.join(),
    spellingShown.value,
    settings.value.textSize,
    hereMin.value === 0 ? here.value.name : '',
    folds.value,
    nextShown.value,
    nextName.value,
  ],
  () => void nextTick(measureSoon),
);
</script>

<template>
  <div
    v-if="shown"
    ref="toolbar"
    role="toolbar"
    :aria-label="markdown ? 'Markdown bar' : 'Element bar'"
    class="element-bar"
    :class="{
      'no-scrollbar': floatingScrollbar,
      'in-header': props.inHeader,
      away: props.away,
      'more-before': moreBefore,
      'more-after': moreAfter,
    }"
    data-element-bar
    :data-pane-bar="props.inHeader ? undefined : ''"
    @keydown="onKeydown"
    @focusin="onFocusin"
    @scroll.passive="followEdges"
  >
    <button
      v-if="nextShown"
      type="button"
      class="button next"
      data-bar-item="next"
      data-next
      :tabindex="stopOf('next')"
      aria-keyshortcuts="Tab"
      @mousedown.prevent
      @click="pressNext"
    >
      {{ nextName }}
    </button>
    <span
      v-if="markdown"
      class="here"
      :class="{ chip: props.inHeader }"
      :style="hereStyle"
      data-here
    ><span :class="{ 'sr-only': props.inHeader }">{{ here.lead }}</span><span
      class="here-name"
      data-here-name
      :class="{ short: props.inHeader }"
    >{{ here.name }}</span></span>
    <UTooltip
      v-else
      :text="hereTip"
      :open="openTip === 'here'"
      :delay-duration="400"
      :ui="TIP_UI"
      @update:open="setTip('here', $event)"
    >
      <button
        type="button"
        class="here"
        :class="{ chip: props.inHeader }"
        :style="hereStyle"
        data-here
        data-bar-item="here"
        :tabindex="stopOf('here')"
        :aria-describedby="classic ? undefined : 'element-bar-here-tip'"
        :aria-description="classic ? why : undefined"
        @pointerdown="onPointerDown($event, 'here')"
        @pointerup="onPointerEnd"
        @pointercancel="onPointerEnd"
        @click="longPressed ? (longPressed = false) : openCheatSheet(true)"
      ><span :class="{ 'sr-only': props.inHeader }">{{ here.lead }}</span><span
        class="here-name"
        data-here-name
        :class="{ short: props.inHeader }"
      >{{ here.name }}</span></button>
    </UTooltip>
    <span v-if="!markdown" id="element-bar-here-tip" class="sr-only">{{ why }}</span>
    <span class="rule" aria-hidden="true" />
    <UTooltip
      v-for="button in buttons"
      :key="button.command"
      :open="openTip === button.command"
      :delay-duration="400"
      :ui="TIP_UI"
      @update:open="setTip(button.command, $event)"
    >
      <button
        type="button"
        class="button"
        :data-bar-item="button.command"
        :data-folded="isFolded(button.command) ? '' : undefined"
        :tabindex="stopOf(button.command)"
        :aria-pressed="markdown ? undefined : pressed(button) ? 'true' : 'false'"
        :aria-disabled="off(button) ? 'true' : undefined"
        :aria-describedby="descId(button)"
        @mousedown.prevent
        @pointerdown="onPointerDown($event, button.command)"
        @pointerup="onPointerEnd"
        @pointercancel="onPointerEnd"
        @click="press(button)"
      >
        {{ button.label }}
      </button>
      <!-- The mark, on a line of its own over the sentence (design §3.2: marks in tooltips). -->
      <template #content>
        <span class="tip">
          <span v-if="markLine(button) && !off(button) && !classic" class="tip-mark">{{ markLine(button) }}</span>
          <span>{{ tip(button) }}</span>
        </span>
      </template>
    </UTooltip>
    <span v-for="button in buttons" :id="descId(button)" :key="`d-${button.command}`" class="sr-only">{{ tip(button) }}</span>
    <template v-if="spellingShown">
      <UTooltip
        :text="tipFor(SPELLING_BUTTON, apple)"
        :open="openTip === SPELLING_BUTTON.command"
        :delay-duration="400"
        :ui="TIP_UI"
        @update:open="setTip(SPELLING_BUTTON.command, $event)"
      >
        <button
          type="button"
          class="button"
          :data-bar-item="SPELLING_BUTTON.command"
          :tabindex="stopOf(SPELLING_BUTTON.command)"
          :aria-describedby="descId(SPELLING_BUTTON)"
          @mousedown.prevent
          @pointerdown="onPointerDown($event, SPELLING_BUTTON.command)"
          @pointerup="onPointerEnd"
          @pointercancel="onPointerEnd"
          @click="pressSpelling"
        >
          {{ SPELLING_BUTTON.label }}
        </button>
      </UTooltip>
      <span :id="descId(SPELLING_BUTTON)" class="sr-only">
        {{ tipFor(SPELLING_BUTTON, apple) }}
      </span>
    </template>
    <MenuButton v-if="moreShown" :items="more" :content="{ align: 'start', onCloseAutoFocus }">
      <button
        type="button"
        class="button more"
        data-bar-item="more"
        :data-folded="moreHidden ? '' : undefined"
        :tabindex="stopOf('more')"
        :aria-label="markdown ? 'More formatting' : 'More elements'"
      >
        More<UIcon name="i-lucide-chevron-down" class="chevron" aria-hidden="true" />
      </button>
    </MenuButton>
    <span class="spacer" />
    <button
      v-if="!markdown && !props.inHeader"
      type="button"
      class="button icon"
      data-bar-item="help"
      :tabindex="stopOf('help')"
      :aria-label="helpName"
      :title="helpName"
      @mousedown.prevent
      @click="openCheatSheet(false)"
    >
      ?
    </button>
    <MenuButton v-if="!props.inHeader" :items="options" :content="{ align: 'end', onCloseAutoFocus }">
      <button
        type="button"
        class="button icon"
        data-bar-item="options"
        :tabindex="stopOf('options')"
        aria-label="Element bar options"
        title="Element bar options"
      >
        ⋯
      </button>
    </MenuButton>
  </div>
  <!-- Where a hidden bar comes back, and why a command did nothing: a toast and a polite live region. -->
  <div class="bar-notice" :class="{ shown: elementNotice }">
    <span role="status" aria-live="polite">{{ elementNotice }}</span>
  </div>
</template>

<style scoped>
.element-bar {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
  min-height: 28px;
  padding: 2px 8px;
  /* One row; on a narrow screen it scrolls sideways instead of wrapping. */
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: thin;
  background: var(--raised);
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: 12px;
}
/* A row that scrolls (a phone, with no on-screen keyboard) comes to rest with a chip at its left
   edge, never half of one, and fades at the edge, or edges, with more of it out of sight, so a word
   is never cut off sharp (design §6). Over the keyboard and in the header the row folds instead. */
.element-bar:not(.in-header) {
  scroll-snap-type: x mandatory;
  scroll-padding-inline: 8px;
}
.element-bar:not(.in-header) > :is(button, .here) {
  scroll-snap-align: start;
}
.element-bar.more-after {
  mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent);
}
.element-bar.more-before {
  mask-image: linear-gradient(to left, #000 calc(100% - 32px), transparent);
}
.element-bar.more-before.more-after {
  mask-image: linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent);
}
/* Where scrollbars float, the row still scrolls by swipe, trackpad, and the arrow keys. */
.element-bar.no-scrollbar {
  scrollbar-width: none;
}
.element-bar.no-scrollbar::-webkit-scrollbar {
  display: none;
}
/* In the editor's header, side by side: the header's row, nothing of a bar of its own. It folds
   rather than scrolls; the scrolling stays only as a last resort, unseen. */
.element-bar.in-header {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  height: 32px;
  padding: 0;
  overflow-y: hidden;
  scrollbar-width: none;
  background: none;
  border: 0;
}
.element-bar.in-header::-webkit-scrollbar {
  display: none;
}
/* A folded item: still laid out, to be measured, but neither seen nor reached; More holds it.
   (Side by side, and on a phone over the keyboard.) */
.element-bar [data-folded] {
  position: absolute;
  top: 0;
  left: 0;
  visibility: hidden;
  pointer-events: none;
}
/* Focus is in another region: unseen under the script's title (AppPane), but laid out, so it is
   measured and folded already, and still in the tab order, so Tab brings it back. */
.element-bar.away {
  opacity: 0;
  pointer-events: none;
}
.here {
  flex: none;
  min-height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--r-sm);
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
}
button.here {
  cursor: help;
}
/* Side by side, the element the cursor is in is a chip of its own at the left (a stable width,
   from its widest name), in the text colour on the raised fill, where the buttons are muted on
   none: the bar's one passive item. */
.here.chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 6px;
  background: var(--raised);
  font-weight: 500;
}
button.here.chip:hover {
  background: var(--overlay);
}
/* In the header, a Markdown document's "You're on a blank line" reads "Blank line". */
.here-name.short {
  display: inline-block;
}
.here-name.short::first-letter {
  text-transform: uppercase;
}
.rule {
  flex: none;
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: var(--border);
}
/* The chips (design §3.2): 12px, weight 500; the element the cursor is in in the accent's soft fill,
   its words in the accent's text colour, a second cue where the light theme's fill is faint. */
.button {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 2px;
  min-height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--r-sm);
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.button:hover {
  background: var(--raised);
  color: var(--text);
}
.button[aria-pressed='true'],
.button[aria-pressed='true']:hover {
  background: var(--accent-soft);
  color: var(--accent-text);
}
.button[aria-disabled='true'] {
  opacity: 0.5;
  cursor: default;
}
.button[aria-disabled='true']:hover {
  background: none;
}
.button.icon {
  justify-content: center;
  min-width: 24px;
  padding: 0 6px;
}
.in-header .button {
  padding: 0 5px;
}
.button.more {
  padding-right: 4px;
}
/* The Next button (§10): Tab for a finger, at least 44px wide, set off from the elements. */
.button.next {
  justify-content: center;
  min-width: 44px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border);
  color: var(--text);
  font-weight: 600;
}
.chevron {
  width: 12px;
  height: 12px;
}
.tip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  white-space: normal;
}
.tip-mark {
  font-family: var(--font-mono);
  font-weight: 600;
}
.spacer {
  flex: 1 0 8px;
}
.here:focus-visible,
.button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
@media (forced-colors: active) {
  .button[aria-pressed='true'] {
    border: 1px solid CanvasText;
  }
}
.bar-notice {
  position: fixed;
  z-index: 30;
  right: 16px;
  bottom: 40px;
  box-sizing: border-box;
  max-width: min(26rem, calc(100vw - 32px));
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent-text);
  border-radius: 6px;
  background: var(--raised);
  color: var(--text);
  font-size: 13px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
}
/* On a phone the keyboard and a two-line status bar take the bottom, so the toast goes at the top. */
@media (max-width: 640px) {
  .bar-notice {
    top: 8px;
    bottom: auto;
    left: 16px;
    max-width: none;
  }
}
.bar-notice:not(.shown) {
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  border: 0;
  box-shadow: none;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
