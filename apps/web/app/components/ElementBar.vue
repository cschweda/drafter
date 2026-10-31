<script setup lang="ts">
import type { EditorState } from '@codemirror/state';
import {
  canMakeParenthetical,
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
import { useWideScreen } from '~/composables/useWideScreen';
import {
  type BarButton,
  barFor,
  currentOf,
  hereParts,
  MARKDOWN_BUTTONS,
  markLine,
  reasonFor,
  SPELLING_BUTTON,
  tipFor,
} from '~/editor/element-bar';
import { elementNotice, sayElement } from '~/editor/element-notice';
import { useEditor } from '~/editor/session';
import { markdownElement } from '~/markdown/commands';
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
// chips: where the cursor is becomes an icon (its words are its name and its tooltip, and the
// pressed chip shows the element), and the bar never clips, but folds its buttons into More from
// the right, then the cheat sheet's ?, the ⋯ menu, the icon, and last the pressed chip, measured
// rather than counted. While focus is elsewhere (`away`) the header shows the script's title
// instead, and the bar is drawn out of sight but stays in the tab order, so a keyboard user who
// Tabs to it brings it back.
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
  if (onName.value) return currentOf('character', null);
  return currentOf(editor.cursor.value?.kind ?? null, role.value);
});
const here = computed(() => hereParts(markdown.value ? markdownHere.value : shownLine.value.name));
const why = computed(() => {
  const context = onName.value ? 'name' : inSpeech.value ? 'speech' : undefined;
  const kind = onName.value ? 'character' : (editor.cursor.value?.kind ?? null);
  const reason = reasonFor(kind, !!block.value?.forced, context, onName.value ? null : role.value);
  return `${reason.charAt(0).toUpperCase()}${reason.slice(1)}. Opens the Fountain cheat sheet there.`;
});
/** The icon's tooltip in the header: where the cursor is, then why. */
const hereTip = computed(() =>
  props.inHeader ? `${here.value.lead}${here.value.name}. ${why.value}` : why.value,
);

/** Opens the cheat sheet, at the element the cursor is in when there is one. */
function openCheatSheet(atElement: boolean) {
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
const tip = (button: BarButton) => (off(button) ? PARENTHETICAL_HINT : tipFor(button, apple));

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
  kbds: button.mark ? [button.mark] : undefined,
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
  if (isFolded('help')) {
    extra.push({
      label: 'Fountain cheat sheet',
      icon: 'i-lucide-circle-help',
      onSelect: () => openCheatSheet(false),
    });
  }
  if (isFolded('options')) extra.push(hideItem);
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
    ...(markdown.value ? [] : ['here']),
    ...buttons.value.map((button) => button.command),
    ...(spellingShown.value ? [SPELLING_BUTTON.command] : []),
    ...(moreShown.value ? ['more'] : []),
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
// Everything stays laid out, a folded item hidden and out of the flow, so every width is known
// at any time: the fit is worked out from them, never by drawing and trying again, and folding
// changes nothing the observer measures by (the bar's own width is the header's to give).

/** How many items of `foldOrder` have folded. */
const fold = ref(0);
/**
 * What folds, in order: the buttons from the right (the one pressed waits), the cheat sheet's ?,
 * the ⋯ menu, where the cursor is, and last the button pressed: what is left is the element the
 * cursor is in and More.
 */
const foldOrder = computed<string[]>(() => {
  if (!props.inHeader) return [];
  const on = buttons.value.find((button) => !markdown.value && pressed(button))?.command;
  const rest = buttons.value.map((button) => button.command).filter((id) => id !== on);
  return [
    ...rest.reverse(),
    ...(markdown.value ? [] : ['help']),
    'options',
    'here',
    ...(on ? [on] : []),
  ];
});
const foldedIds = computed(() => new Set(foldOrder.value.slice(0, fold.value)));
const isFolded = (id: string) => foldedIds.value.has(id);
/** A Markdown bar has no More until something folds; side by side it is laid out, to be measured. */
const moreShown = computed(() => !markdown.value || (!!props.inHeader && fold.value > 0));
const moreLaidOut = computed(() => !markdown.value || !!props.inHeader);

function measure() {
  const el = toolbar.value;
  if (!props.inHeader || props.away || !el) return;
  if (el.clientWidth !== barWidth) {
    barWidth = el.clientWidth;
    hereRoom = 0;
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
  // Where the cursor is takes the widest it has been: a Markdown document's words change with the
  // line, and a fold that came and went as the cursor moved would move the buttons under it.
  hereRoom = Math.max(hereRoom, widthOf('[data-here]'));
  const order = foldOrder.value;
  const total = (k: number) => {
    const gone = new Set(order.slice(0, k));
    const parts = gone.has('here') ? [] : [hereRoom, widthOf('.rule')];
    for (const button of buttons.value)
      if (!gone.has(button.command)) parts.push(item(button.command));
    if (spellingShown.value) parts.push(item(SPELLING_BUTTON.command));
    if (!markdown.value || k > 0) parts.push(item('more'));
    parts.push(SPACER);
    if (!markdown.value && !gone.has('help')) parts.push(item('help'));
    if (!gone.has('options')) parts.push(item('options'));
    return parts.reduce((sum, w) => sum + w, 0) + (parts.length - 1) * gap;
  };
  // A pixel to spare: widths are fractions, and a scroll width is rounded.
  let k = 0;
  while (k < order.length && total(k) > room - 1) k++;
  if (fold.value !== k) fold.value = k;
}
/** The spacer's least width (`.spacer`). */
const SPACER = 8;
/** The widest the words at the left have been (reset when the bar's width or kind changes). */
let hereRoom = 0;
let barWidth = -1;

let observer: ResizeObserver | undefined;
let frame = 0;
/** Measured in the next frame: never inside the observer's own callback (WebKit calls that a loop). */
function measureSoon() {
  if (!props.inHeader) return;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(measure);
}
function observe(el: HTMLElement | undefined) {
  observer?.disconnect();
  if (!el) return;
  // The bar's width, and the words at its left (they change with the cursor, and a web font that
  // arrives late changes every width).
  observer?.observe(el);
  const words = el.querySelector('[data-here]');
  if (words) observer?.observe(words);
}
const onFonts = () => measureSoon();
onMounted(() => {
  if (!props.inHeader) return;
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
// The bar drawn again (shown, or another kind of document), or what it holds changed.
watch(
  [toolbar, markdown],
  () =>
    void nextTick(() => {
      hereRoom = 0;
      observe(toolbar.value);
      measureSoon();
    }),
);
watch(
  () => [foldOrder.value.join(), spellingShown.value, props.away, settings.value.textSize],
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
    :class="{ 'no-scrollbar': floatingScrollbar, 'in-header': props.inHeader, away: props.away }"
    data-element-bar
    :data-pane-bar="props.inHeader ? undefined : ''"
    @keydown="onKeydown"
    @focusin="onFocusin"
  >
    <span
      v-if="markdown"
      class="here"
      data-here
      :data-folded="isFolded('here') ? '' : undefined"
    ><span :class="{ 'sr-only': props.inHeader }">{{ here.lead }}</span><span
      class="here-name"
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
        :class="{ 'here-icon': props.inHeader }"
        data-here
        data-bar-item="here"
        :data-folded="isFolded('here') ? '' : undefined"
        :tabindex="stopOf('here')"
        aria-describedby="element-bar-here-tip"
        @pointerdown="onPointerDown($event, 'here')"
        @pointerup="onPointerEnd"
        @pointercancel="onPointerEnd"
        @click="longPressed ? (longPressed = false) : openCheatSheet(true)"
      ><UIcon
        v-if="props.inHeader"
        name="i-lucide-info"
        class="here-glyph"
        aria-hidden="true"
      /><span :class="{ 'sr-only': props.inHeader }">{{ here.lead }}{{ here.name }}</span></button>
    </UTooltip>
    <span v-if="!markdown" id="element-bar-here-tip" class="sr-only">{{ why }}</span>
    <span class="rule" aria-hidden="true" :data-folded="isFolded('here') ? '' : undefined" />
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
          <span v-if="markLine(button) && !off(button)" class="tip-mark">{{ markLine(button) }}</span>
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
    <MenuButton v-if="moreLaidOut" :items="more" :content="{ align: 'start', onCloseAutoFocus }">
      <button
        type="button"
        class="button more"
        data-bar-item="more"
        :data-folded="moreShown ? undefined : ''"
        :tabindex="stopOf('more')"
        :aria-label="markdown ? 'More formatting' : 'More elements'"
      >
        More<UIcon name="i-lucide-chevron-down" class="chevron" aria-hidden="true" />
      </button>
    </MenuButton>
    <span class="spacer" />
    <button
      v-if="!markdown"
      type="button"
      class="button icon"
      data-bar-item="help"
      :data-folded="isFolded('help') ? '' : undefined"
      :tabindex="stopOf('help')"
      aria-label="Fountain cheat sheet"
      title="Fountain cheat sheet"
      @mousedown.prevent
      @click="openCheatSheet(false)"
    >
      ?
    </button>
    <MenuButton :items="options" :content="{ align: 'end', onCloseAutoFocus }">
      <button
        type="button"
        class="button icon"
        data-bar-item="options"
        :data-folded="isFolded('options') ? '' : undefined"
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
  background: var(--chrome-2);
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
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
/* A folded item: still laid out, to be measured, but neither seen nor reached; More holds it. */
.element-bar.in-header [data-folded] {
  position: absolute;
  top: 0;
  left: 0;
  visibility: hidden;
  pointer-events: none;
}
/* Focus is elsewhere: out of sight (the header shows the script's title), still in the tab order,
   so Tab brings it back, as a skip link comes into view. */
.element-bar.away {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
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
.here-icon {
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  padding: 0;
  color: var(--muted);
}
.here-icon:hover {
  background: var(--raised);
  color: var(--text);
}
.here-glyph {
  width: 15px;
  height: 15px;
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
  background: var(--line);
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
.button.more {
  padding-right: 4px;
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
  border: 1px solid var(--line);
  border-left: 3px solid var(--heading);
  border-radius: 6px;
  background: var(--chrome-2);
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
