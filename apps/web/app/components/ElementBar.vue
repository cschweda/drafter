<script setup lang="ts">
import type { EditorState } from '@codemirror/state';
import {
  canMakeParenthetical,
  elementHint,
  PARENTHETICAL_HINT,
  readsAsName,
  structureOf,
} from '@drafter/cm-fountain';
import { resolveRole } from '@drafter/templates';
import type { DropdownMenuItem } from '@nuxt/ui';
import { HELP_PAGES, helpHref } from '~/commands/data';
import { isApple } from '~/commands/keys';
import { commandById } from '~/commands/registry';
import { useElementBarShown } from '~/composables/useElementBarShown';
import {
  type BarButton,
  barFor,
  currentOf,
  hereLabel,
  MARKDOWN_BUTTONS,
  reasonFor,
  tipFor,
} from '~/editor/element-bar';
import { elementNotice, sayElement } from '~/editor/element-notice';
import { useEditor } from '~/editor/session';
import { markdownElement } from '~/markdown/commands';
import { useSettings } from '~/settings/settings';
import { scrollbarsFloat } from '~/utils/scrollbars';

// The element bar (docs/drafter-element-bar-design.md): a row of buttons over the Source that
// writes Fountain's marks, and teaches them, for a writer who doesn't know them yet. Each button
// runs a registered command (`commands/builtin.ts`), the one the palette runs, so it acts on the
// selection and is one undo step. It is a toolbar: one tab stop, and the arrow keys move along it.
// The element the cursor's line is shows at the left, and its button is shown pressed. A press
// doesn't take focus from the editor, so a phone's keyboard stays up. It goes in focus mode, in a
// tab that only shows the script, and when Settings turns it off.
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
const stops: Array<() => void> = [];
/** A floating scrollbar would cover the buttons' lower half (utils/scrollbars.ts), so it's hidden. */
const floatingScrollbar = ref(false);
onMounted(() => {
  floatingScrollbar.value = scrollbarsFloat();
  follow(editor.view.state);
  stops.push(editor.onState(follow), editor.onUpdate(followTree));
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
const here = computed(() => hereLabel(markdown.value ? markdownHere.value : shownLine.value.name));
const why = computed(() => {
  const context = onName.value ? 'name' : inSpeech.value ? 'speech' : undefined;
  const kind = onName.value ? 'character' : (editor.cursor.value?.kind ?? null);
  const reason = reasonFor(kind, !!block.value?.forced, context, onName.value ? null : role.value);
  return `${reason.charAt(0).toUpperCase()}${reason.slice(1)}. Opens the Fountain cheat sheet there.`;
});

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

const more = computed<DropdownMenuItem[]>(() =>
  bar.value.more.map((button) => ({
    label: button.label,
    // The mark, in the place a menu shows a shortcut.
    kbds: [button.mark],
    onSelect: () => {
      chosen = true;
      press(button);
    },
  })),
);

// The command puts focus in the editor while the menu still holds it, so once the menu has closed
// the editor gets it back, rather than the button that opened the menu.
let chosen = false;
function onCloseAutoFocus(event: Event) {
  if (!chosen) return;
  chosen = false;
  event.preventDefault();
  requestAnimationFrame(() => editor.view.focus());
}

// ---- Hiding it -----------------------------------------------------------------------------

const options = computed<DropdownMenuItem[]>(() => [
  {
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
  },
]);

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
const items = () => [...(toolbar.value?.querySelectorAll<HTMLElement>('[data-bar-item]') ?? [])];
const order = computed(() => [
  ...(markdown.value ? [] : ['here']),
  ...buttons.value.map((button) => button.command),
  ...(markdown.value ? [] : ['more', 'help']),
  'options',
]);
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
</script>

<template>
  <div
    v-if="shown"
    ref="toolbar"
    role="toolbar"
    :aria-label="markdown ? 'Markdown bar' : 'Element bar'"
    class="element-bar"
    :class="{ 'no-scrollbar': floatingScrollbar }"
    data-element-bar
    data-pane-bar
    @keydown="onKeydown"
    @focusin="onFocusin"
  >
    <span v-if="markdown" class="here" data-here>{{ here }}</span>
    <UTooltip
      v-else
      :text="why"
      :open="openTip === 'here'"
      :delay-duration="400"
      :ui="TIP_UI"
      @update:open="setTip('here', $event)"
    >
      <button
        type="button"
        class="here"
        data-here
        data-bar-item="here"
        :tabindex="stopOf('here')"
        aria-describedby="element-bar-here-tip"
        @pointerdown="onPointerDown($event, 'here')"
        @pointerup="onPointerEnd"
        @pointercancel="onPointerEnd"
        @click="longPressed ? (longPressed = false) : openCheatSheet(true)"
      >
        {{ here }}
      </button>
    </UTooltip>
    <span v-if="!markdown" id="element-bar-here-tip" class="sr-only">{{ why }}</span>
    <span class="rule" aria-hidden="true" />
    <UTooltip
      v-for="button in buttons"
      :key="button.command"
      :text="tip(button)"
      :open="openTip === button.command"
      :delay-duration="400"
      :ui="TIP_UI"
      @update:open="setTip(button.command, $event)"
    >
      <button
        type="button"
        class="button"
        :data-bar-item="button.command"
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
        {{ button.label }}<span v-if="button.mark" class="mark" aria-hidden="true">{{ button.mark }}</span>
      </button>
    </UTooltip>
    <span v-for="button in buttons" :id="descId(button)" :key="`d-${button.command}`" class="sr-only">{{ tip(button) }}</span>
    <MenuButton v-if="!markdown" :items="more" :content="{ align: 'start', onCloseAutoFocus }">
      <button
        type="button"
        class="button"
        data-bar-item="more"
        :tabindex="stopOf('more')"
        aria-label="More elements"
      >
        More
      </button>
    </MenuButton>
    <span class="spacer" />
    <button
      v-if="!markdown"
      type="button"
      class="button icon"
      data-bar-item="help"
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
.here {
  flex: none;
  min-height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
}
button.here {
  cursor: help;
}
.rule {
  flex: none;
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: var(--line);
}
.button {
  flex: none;
  min-height: 24px;
  padding: 0 7px;
  border: 0;
  border-bottom: 1px solid transparent;
  border-radius: 5px 5px 0 0;
  background: none;
  color: var(--muted);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.button:hover {
  color: var(--text);
}
.button[aria-pressed='true'] {
  background: var(--tab-on);
  color: var(--text);
  border-bottom-color: var(--heading);
}
.button[aria-disabled='true'] {
  opacity: 0.5;
  cursor: default;
}
.button.icon {
  min-width: 24px;
  padding: 0 6px;
}
.mark {
  margin-left: 5px;
  font-family: var(--font-mono);
  font-weight: 400;
}
.spacer {
  flex: 1 0 8px;
}
.here:focus-visible,
.button:focus-visible {
  outline: 2px solid var(--heading);
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
