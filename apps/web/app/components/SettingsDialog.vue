<script setup lang="ts">
import { DICTIONARIES, SPELL_LANGUAGES, type SpellLanguage } from '@drafter/spell';
import type { Paper } from '@drafter/templates';
import { aboutOpen } from '~/about/dialog';
import { appLine, currentAbout, versionLine } from '~/about/info';
import { HELP_PAGES, helpHref } from '~/commands/data';
import { DIFF_COLOR_NAMES, DIFF_COLORS, type DiffColors } from '~/compare/colors';
import DDialog from '~/components/ui/DDialog.vue';
import { desktop } from '~/desktop';
import { useModules } from '~/modules/registry';
import { settingsOpen } from '~/settings/dialog';
import {
  PAGE_COLORS,
  PAPERS,
  type PageColor,
  type Settings,
  TEXT_SIZES,
  useSettings,
  WRITING_MODES,
  type WritingMode,
} from '~/settings/settings';

// The Settings dialog (Phase 1 design §8): a labeled switch for each on/off setting, a select
// for the text size. A change takes effect and is kept at once, so there is nothing to confirm.
// In sections (fresh-look design §5): a list of them on the left, and the settings in one column
// on the right, each section under its heading. Every setting stays in the column, so none is
// hidden behind a section that isn't chosen, and Tab reaches each as before; choosing a section
// brings it into view, and scrolling marks the section in view as the current one.
const { settings, set } = useSettings();
const dialog = ref<InstanceType<typeof DDialog>>();

watch(settingsOpen, async (open) => {
  await nextTick();
  const el = dialog.value;
  if (!el) return;
  if (open && !el.open) el.showModal();
  else if (!open && el.open) el.close();
});

// Escape goes through `settingsOpen`, so the state is false at once (a Mod+, pressed straight after
// it opens the dialog again), instead of staying true until the close event.
function onCancel() {
  settingsOpen.value = false;
}

// A close event that comes after the dialog was opened again is the old close: it changes nothing.
function onClose() {
  if (!dialog.value?.open) settingsOpen.value = false;
}

type Section = 'general' | 'writing' | 'script' | 'spelling' | 'files' | 'modules' | 'about';

interface Switch {
  /** The section it is in. */
  section: Section;
  /** A setting that is on or off. */
  key: { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];
  label: string;
  why: string;
  /** Shown only in the desktop app. */
  desktopOnly?: boolean;
  /** What it says in the desktop app on a Mac, where that differs. */
  whyOnMac?: string;
}
const SWITCHES: Switch[] = [
  {
    section: 'general',
    key: 'matchSystem',
    label: 'Match system appearance',
    why: 'Use the light or dark appearance your device is set to.',
  },
  {
    section: 'spelling',
    key: 'spellcheck',
    label: 'Spellcheck',
    why: 'Underline misspelled words in the Source pane, with Drafter’s own dictionary, which works offline.',
  },
  {
    section: 'spelling',
    key: 'spellNotes',
    label: 'Check notes and boneyard',
    why: 'Check the spelling in notes and in the boneyard too. They never print, so Spellcheck skips them unless this is on.',
  },
  {
    section: 'script',
    key: 'strict',
    label: 'Strict Fountain',
    why: 'Warn where Drafter reads your script more loosely than the Fountain spec does.',
  },
  {
    section: 'writing',
    key: 'lineNumbers',
    label: 'Line numbers',
    why: 'Number the lines in the Source pane, so you can refer to one.',
  },
  {
    section: 'writing',
    key: 'typewriter',
    label: 'Typewriter scrolling',
    why: 'Keep the line you are writing at the middle of the Source pane.',
  },
  {
    section: 'writing',
    key: 'scrollSync',
    label: 'Sync scrolling',
    why: 'Scroll the Source and the Script pane (or the Preview) together, so both show the same part of your script.',
  },
  {
    section: 'writing',
    key: 'elementBar',
    label: 'Element bar',
    why: 'Show a row of buttons above the Source that writes Fountain’s marks for you, and names the element you’re in.',
  },
  {
    section: 'writing',
    key: 'structureStrip',
    label: 'Structure strip',
    why: 'Show your script’s sections and scenes as a band of blocks above the panes, each as wide as it is long. Click one to go there.',
  },
  {
    section: 'writing',
    key: 'sprintSound',
    label: 'Sprint sound',
    why: 'Play a short tone when a sprint ends. Drafter makes no sound unless you turn this on.',
  },
  {
    section: 'about',
    key: 'checkForUpdates',
    label: 'Check for updates',
    why: 'When Drafter starts, look on GitHub for a newer version. Nothing from your scripts is sent, and Drafter never installs an update without asking.',
    desktopOnly: true,
    // The Mac app is built on the writer's Mac and signed by no one, so it can't update itself.
    whyOnMac:
      'When Drafter starts, look on GitHub for a newer version, and say when one is out. Nothing from your scripts is sent. On a Mac, Drafter can’t update itself yet: build the new version the way you built this one.',
  },
];
// The desktop check is the one request the desktop app makes; the web has no such setting.
// Known only in the browser, after the page is up, so the prerendered page and hydration agree.
const onDesktop = ref(false);
const onMac = ref(false);
onMounted(() => {
  const bridge = desktop();
  onDesktop.value = bridge !== null;
  onMac.value = bridge?.platform === 'darwin';
});
const shown = computed(() =>
  SWITCHES.filter((item) => !item.desktopOnly || onDesktop.value).map((item) =>
    onMac.value && item.whyOnMac ? { ...item, why: item.whyOnMac } : item,
  ),
);

/** The on/off settings of one section, in their order. */
const switchesIn = (section: Section) => shown.value.filter((item) => item.section === section);

// ---- The sections ----------------------------------------------------------------------------

const { modules } = useModules();
const SECTIONS: ReadonlyArray<{ id: Section; name: string }> = [
  { id: 'general', name: 'General' },
  { id: 'writing', name: 'Writing' },
  { id: 'script', name: 'Script' },
  { id: 'spelling', name: 'Spelling' },
  { id: 'files', name: 'Files' },
  { id: 'modules', name: 'Modules' },
  { id: 'about', name: 'About' },
];
/** The sections there are: Modules only where this copy of Drafter has a module. */
const sections = computed(() =>
  SECTIONS.filter((section) => section.id !== 'modules' || modules.value.length > 0),
);
const sectionId = (id: Section) => `settings-section-${id}`;
const headingId = (id: Section) => (id === 'modules' ? 'modules-title' : `settings-${id}-title`);

const body = ref<HTMLElement>();
const current = ref<Section>('general');
/**
 * Where the column was scrolled to for a chosen section: the scroll that lands there is that
 * choice's own, and leaves the current section alone (the last sections may not reach the top).
 */
let chosenTop: number | null = null;

/** Brings a section into view, makes it the current one, and puts focus on its heading. */
function go(id: Section) {
  const section = document.getElementById(sectionId(id));
  const heading = document.getElementById(headingId(id));
  if (!section || !body.value) return;
  current.value = id;
  body.value.scrollTop = section.offsetTop - body.value.offsetTop;
  chosenTop = body.value.scrollTop;
  heading?.focus({ preventScroll: true });
}

/** The section in view: the last whose top has reached the top of the column, or the last one at the end. */
function onScroll() {
  const column = body.value;
  if (!column) return;
  const chosen = chosenTop;
  chosenTop = null;
  if (chosen !== null && Math.abs(column.scrollTop - chosen) < 1) return;
  const ids = sections.value.map((section) => section.id);
  if (column.scrollTop + column.clientHeight >= column.scrollHeight - 2) {
    current.value = ids.at(-1) ?? 'general';
    return;
  }
  let seen: Section = ids[0] ?? 'general';
  for (const id of ids) {
    const section = document.getElementById(sectionId(id));
    if (section && section.offsetTop - column.offsetTop <= column.scrollTop + 24) seen = id;
  }
  current.value = seen;
}

// Each time it opens, it starts at the top, on General.
watch(settingsOpen, async (open) => {
  if (!open) return;
  await nextTick();
  if (body.value) body.value.scrollTop = 0;
  current.value = 'general';
});

// ---- About -----------------------------------------------------------------------------------

/** The version and which app this is; known only in the browser (the desktop app says so there). */
const aboutLine = ref('');
onMounted(() => {
  const info = currentAbout();
  aboutLine.value = `Drafter ${versionLine(info)}, the ${appLine(info)}.`;
});

/** About Drafter…: Settings closes, and About opens in its place. */
async function openAbout() {
  settingsOpen.value = false;
  await nextTick();
  await nextTick();
  aboutOpen.value = true;
}

const percent = (size: number) => `${Math.round(size * 100)}%`;

function onSize(event: Event) {
  void set('textSize', Number((event.target as HTMLSelectElement).value));
}

// ---- Page colour (fresh-look design §4) -----------------------------------------------------

const PAGE_COLOR_NAMES: Readonly<Record<PageColor, string>> = { paper: 'Paper', dark: 'Dark' };

function onPageColor(event: Event) {
  void set('pageColor', (event.target as HTMLSelectElement).value as PageColor);
}

const WRITING_MODE_NAMES: Readonly<Record<WritingMode, string>> = {
  fountain: 'Fountain',
  classic: 'Classic',
};

function onWritingMode(event: Event) {
  void set('writingMode', (event.target as HTMLSelectElement).value as WritingMode);
}

// ---- Colors for changes (version-history design §7) -----------------------------------------

function onDiffColors(event: Event) {
  void set('diffColors', (event.target as HTMLSelectElement).value as DiffColors);
}

// ---- Spelling (Plan D, Calls 3, 8, and 9) ----------------------------------------------------

function onLanguage(event: Event) {
  void set('spellLanguage', (event.target as HTMLSelectElement).value as SpellLanguage);
}

// ---- Paper for Markdown PDFs (Markdown PDF design §6) ----------------------------------------

const PAPER_NAMES: Readonly<Record<Paper, string>> = { letter: 'US Letter', a4: 'A4' };

function onPaper(event: Event) {
  void set('markdownPaper', (event.target as HTMLSelectElement).value as Paper);
}

/** More words than this, and the heading says how many. */
const LONG_LIST = 10;
const mine = computed(() => settings.value.personalDictionary);

/**
 * Takes a word out of My dictionary; the spellcheck checks again at once, so it is marked again
 * where it is misspelled. Focus goes to the Remove that takes its place, or the one before it, or
 * to the line that says the list is empty.
 */
async function remove(index: number) {
  await set(
    'personalDictionary',
    mine.value.filter((_, i) => i !== index),
  );
  await nextTick();
  // In the switches' loop, where a template ref would be a list: found by id.
  const buttons =
    dialog.value?.el?.querySelectorAll<HTMLElement>('#settings-my-words button') ?? [];
  const next = buttons[Math.min(index, buttons.length - 1)];
  (next ?? dialog.value?.el?.querySelector<HTMLElement>('#settings-no-words'))?.focus();
}

const licences = HELP_PAGES.find((page) => page.id === 'help-licences');
</script>

<template>
  <DDialog
    ref="dialog"
    size="lg"
    class="settings"
    aria-labelledby="settings-title"
    @cancel.prevent="onCancel"
    @close="onClose"
  >
    <h2 id="settings-title" class="d-dialog-title">Settings</h2>
    <div class="settings-main">
      <nav class="settings-nav" aria-label="Settings sections">
        <ul>
          <li v-for="section in sections" :key="section.id">
            <button
              type="button"
              class="settings-nav-item"
              :aria-current="current === section.id ? 'location' : undefined"
              @click="go(section.id)"
            >
              {{ section.name }}
            </button>
          </li>
        </ul>
      </nav>
      <div ref="body" class="settings-body" @scroll.passive="onScroll">
      <section :id="sectionId('general')" class="section" aria-labelledby="settings-general-title">
        <h3 id="settings-general-title" class="section-title" tabindex="-1">General</h3>
        <div class="row">
          <div class="text">
            <label for="settings-text-size" class="name">Text size</label>
            <p id="settings-text-size-why" class="why">Scales the Source and Script panes together.</p>
          </div>
          <!-- Focus starts here, at the first setting, as it always has. -->
          <select
            id="settings-text-size"
            class="size"
            autofocus
            aria-describedby="settings-text-size-why"
            :value="String(settings.textSize)"
            @change="onSize"
          >
            <option v-for="size in TEXT_SIZES" :key="size" :value="String(size)">
              {{ percent(size) }}
            </option>
          </select>
        </div>
        <div class="row">
          <div class="text">
            <label for="settings-page-color" class="name">Page colour</label>
            <p id="settings-page-color-why" class="why">
              The pages drawn beside your writing: paper, or a dark page for writing at night.
              Printing, the PDF, and every export are always on white paper.
            </p>
          </div>
          <select
            id="settings-page-color"
            class="size"
            aria-describedby="settings-page-color-why"
            :value="settings.pageColor"
            @change="onPageColor"
          >
            <option v-for="color in PAGE_COLORS" :key="color" :value="color">
              {{ PAGE_COLOR_NAMES[color] }}
            </option>
          </select>
        </div>
        <div v-for="item in switchesIn('general')" :key="item.key" class="row">
          <div class="text">
            <label :for="`settings-${item.key}`" class="name">{{ item.label }}</label>
            <p :id="`settings-${item.key}-why`" class="why">{{ item.why }}</p>
          </div>
          <input
            :id="`settings-${item.key}`"
            type="checkbox"
            role="switch"
            class="switch"
            :aria-describedby="`settings-${item.key}-why`"
            :checked="settings[item.key]"
            @change="set(item.key, ($event.target as HTMLInputElement).checked)"
          >
        </div>
      </section>
      <section :id="sectionId('writing')" class="section" aria-labelledby="settings-writing-title">
        <h3 id="settings-writing-title" class="section-title" tabindex="-1">Writing</h3>
        <div class="row">
          <div class="text">
            <label for="settings-writing-mode" class="name">Writing mode</label>
            <p id="settings-writing-mode-why" class="why">
              Classic Mode is typed the way many screenwriting apps work. Your file stays Fountain.
            </p>
          </div>
          <select
            id="settings-writing-mode"
            class="size"
            aria-describedby="settings-writing-mode-why"
            :value="settings.writingMode"
            @change="onWritingMode"
          >
            <option v-for="mode in WRITING_MODES" :key="mode" :value="mode">
              {{ WRITING_MODE_NAMES[mode] }}
            </option>
          </select>
        </div>
        <div v-for="item in switchesIn('writing')" :key="item.key" class="row">
          <div class="text">
            <label :for="`settings-${item.key}`" class="name">{{ item.label }}</label>
            <p :id="`settings-${item.key}-why`" class="why">{{ item.why }}</p>
          </div>
          <input
            :id="`settings-${item.key}`"
            type="checkbox"
            role="switch"
            class="switch"
            :aria-describedby="`settings-${item.key}-why`"
            :checked="settings[item.key]"
            @change="set(item.key, ($event.target as HTMLInputElement).checked)"
          >
        </div>
      </section>
      <section :id="sectionId('script')" class="section" aria-labelledby="settings-script-title">
        <h3 id="settings-script-title" class="section-title" tabindex="-1">Script</h3>
        <div v-for="item in switchesIn('script')" :key="item.key" class="row">
          <div class="text">
            <label :for="`settings-${item.key}`" class="name">{{ item.label }}</label>
            <p :id="`settings-${item.key}-why`" class="why">{{ item.why }}</p>
          </div>
          <input
            :id="`settings-${item.key}`"
            type="checkbox"
            role="switch"
            class="switch"
            :aria-describedby="`settings-${item.key}-why`"
            :checked="settings[item.key]"
            @change="set(item.key, ($event.target as HTMLInputElement).checked)"
          >
        </div>
        <div class="row">
          <div class="text">
            <label for="settings-diff-colors" class="name">Colors for changes</label>
            <p id="settings-diff-colors-why" class="why">
              The colors Compare marks added and removed lines with. Blue and orange are easier to
              tell apart for many people who see red and green as alike.
            </p>
          </div>
          <select
            id="settings-diff-colors"
            class="size"
            aria-describedby="settings-diff-colors-why"
            :value="settings.diffColors"
            @change="onDiffColors"
          >
            <option v-for="colors in DIFF_COLORS" :key="colors" :value="colors">
              {{ DIFF_COLOR_NAMES[colors] }}
            </option>
          </select>
        </div>
      </section>
      <section :id="sectionId('spelling')" class="section" aria-labelledby="settings-spelling-title">
        <h3 id="settings-spelling-title" class="section-title" tabindex="-1">Spelling</h3>
        <div v-for="item in switchesIn('spelling').filter((s) => s.key === 'spellcheck')" :key="item.key" class="row">
          <div class="text">
            <label :for="`settings-${item.key}`" class="name">{{ item.label }}</label>
            <p :id="`settings-${item.key}-why`" class="why">{{ item.why }}</p>
          </div>
          <input
            :id="`settings-${item.key}`"
            type="checkbox"
            role="switch"
            class="switch"
            :aria-describedby="`settings-${item.key}-why`"
            :checked="settings[item.key]"
            @change="set(item.key, ($event.target as HTMLInputElement).checked)"
          >
        </div>
        <div class="row">
          <div class="text">
            <label for="settings-spell-language" class="name">Spelling language</label>
            <p id="settings-spell-language-why" class="why">
              The dictionary Spellcheck uses. Both are built into Drafter; their licences are on the
              <a v-if="licences" :href="helpHref(licences)" target="_blank" rel="noopener">{{
                licences.title
              }}</a>
              page.
            </p>
          </div>
          <select
            id="settings-spell-language"
            class="size"
            aria-describedby="settings-spell-language-why"
            :value="settings.spellLanguage"
            @change="onLanguage"
          >
            <option v-for="language in SPELL_LANGUAGES" :key="language" :value="language">
              {{ DICTIONARIES[language].label }}
            </option>
          </select>
        </div>
        <div v-for="item in switchesIn('spelling').filter((s) => s.key !== 'spellcheck')" :key="item.key" class="row">
          <div class="text">
            <label :for="`settings-${item.key}`" class="name">{{ item.label }}</label>
            <p :id="`settings-${item.key}-why`" class="why">{{ item.why }}</p>
          </div>
          <input
            :id="`settings-${item.key}`"
            type="checkbox"
            role="switch"
            class="switch"
            :aria-describedby="`settings-${item.key}-why`"
            :checked="settings[item.key]"
            @change="set(item.key, ($event.target as HTMLInputElement).checked)"
          >
        </div>
        <div class="dictionary">
          <h4 id="settings-my-dictionary" class="name">
            My dictionary<span v-if="mine.length > LONG_LIST" class="count"
              >: {{ mine.length }} words</span
            >
          </h4>
          <p class="why">
            The words you add with Add to my dictionary, known in every script in this browser and
            never saved in a file.
          </p>
          <ul v-if="mine.length > 0" id="settings-my-words" class="words" aria-label="My dictionary">
            <li v-for="(word, index) in mine" :key="index" class="word">
              <span class="entry">{{ word }}</span>
              <DButton variant="borderless" :aria-label="`Remove ${word}`" @click="remove(index)">
                Remove
              </DButton>
            </li>
          </ul>
          <p v-else id="settings-no-words" class="why" tabindex="-1">
            No words yet. A misspelled word’s menu has Add to my dictionary.
          </p>
        </div>
      </section>
      <section :id="sectionId('files')" class="section" aria-labelledby="settings-files-title">
        <h3 id="settings-files-title" class="section-title" tabindex="-1">Files</h3>
        <div class="row">
          <div class="text">
            <label for="settings-markdown-paper" class="name">Paper for Markdown PDFs</label>
            <p id="settings-markdown-paper-why" class="why">
              The paper size of a Markdown document’s PDF. Screenplays and stage plays use their
              template’s paper.
            </p>
          </div>
          <select
            id="settings-markdown-paper"
            class="size"
            aria-describedby="settings-markdown-paper-why"
            :value="settings.markdownPaper"
            @change="onPaper"
          >
            <option v-for="paper in PAPERS" :key="paper" :value="paper">
              {{ PAPER_NAMES[paper] }}
            </option>
          </select>
        </div>
      </section>
        <ModulesSettings :id="sectionId('modules')" class="section" />
      <section :id="sectionId('about')" class="section" aria-labelledby="settings-about-title">
        <h3 id="settings-about-title" class="section-title" tabindex="-1">About</h3>
        <div class="row">
          <p class="name about-line" data-settings-version>{{ aboutLine }}</p>
          <DButton @click="openAbout">About Drafter…</DButton>
        </div>
<div v-for="item in switchesIn('about')" :key="item.key" class="row">
          <div class="text">
            <label :for="`settings-${item.key}`" class="name">{{ item.label }}</label>
            <p :id="`settings-${item.key}-why`" class="why">{{ item.why }}</p>
          </div>
          <input
            :id="`settings-${item.key}`"
            type="checkbox"
            role="switch"
            class="switch"
            :aria-describedby="`settings-${item.key}-why`"
            :checked="settings[item.key]"
            @change="set(item.key, ($event.target as HTMLInputElement).checked)"
          >
        </div>
      </section>
      </div>
    </div>
    <div class="settings-foot d-dialog-footer">
      <DButton variant="primary" @click="settingsOpen = false">Done</DButton>
    </div>
  </DDialog>
</template>

<style scoped>
/* Tall enough for a few sections, and the same height whichever is shown, so the list stays put. */
.settings {
  height: min(40rem, calc(100dvh - 32px));
  overflow: hidden;
}
.settings[open] {
  display: flex;
  flex-direction: column;
}
.settings-main {
  display: flex;
  flex: 1;
  gap: 16px;
  min-height: 0;
}
.settings-nav {
  flex: none;
  width: 140px;
}
.settings-nav ul {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.settings-nav-item {
  width: 100%;
  min-height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
.settings-nav-item:hover {
  background: var(--overlay);
  color: var(--text);
}
/* The current section: filled, and bold, not told by colour alone. */
.settings-nav-item[aria-current='location'] {
  background: var(--overlay);
  color: var(--text);
  font-weight: 650;
}
.settings-body {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding-right: 4px;
}
.section + .section {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.section-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
}
.row + .row,
.row + .dictionary,
.dictionary + .row {
  border-top: 1px solid var(--border);
}
.text {
  min-width: 0;
}
.name {
  font-weight: 600;
}
.about-line {
  margin: 0;
}
.why {
  margin: 2px 0 0;
  color: var(--muted);
  line-height: 1.4;
}
.size {
  flex: none;
  min-height: 30px;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
/* A switch: a track with a knob, drawn on the checkbox itself so it keeps its keyboard and
   screen-reader behavior. */
.switch {
  appearance: none;
  flex: none;
  position: relative;
  width: 36px;
  height: 20px;
  margin: 0;
  border: 1px solid var(--muted);
  border-radius: 999px;
  background: var(--surface);
  cursor: pointer;
}
.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--muted);
  transition: transform var(--dur) var(--ease);
}
.switch:checked {
  border-color: var(--accent-text);
  background: color-mix(in srgb, var(--accent) 30%, var(--surface));
}
.switch:checked::after {
  background: var(--accent-text);
  transform: translateX(16px);
}
@media (prefers-reduced-motion: reduce) {
  .switch::after {
    transition: none;
  }
}
@media (forced-colors: active) {
  .switch:checked {
    background: Highlight;
  }
  .switch::after {
    background: CanvasText;
  }
  .settings-nav-item[aria-current='location'] {
    outline: 2px solid Highlight;
  }
}
.dictionary {
  padding: 10px 0;
}
.dictionary h4 {
  margin: 0;
  font-size: inherit;
}
.count {
  color: var(--muted);
  font-weight: 400;
}
.why a {
  color: var(--accent-text);
  /* Told apart from the words around it by more than its color. */
  text-decoration: underline;
}
.words {
  max-height: 12rem;
  margin: 8px 0 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}
.word {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 0;
}
.entry {
  min-width: 0;
  overflow-wrap: anywhere;
}
.settings-foot {
  margin-top: 16px;
}
/* A narrow window: the sections are a row above the settings, which scrolls sideways if it must. */
@media (max-width: 639.98px) {
  .settings-main {
    flex-direction: column;
    gap: 8px;
  }
  .settings-nav {
    width: auto;
  }
  .settings-nav ul {
    flex-direction: row;
    overflow-x: auto;
  }
  .settings-nav-item {
    width: auto;
  }
}
</style>
