<script setup lang="ts">
import { type MapStatus, storyMapMeta } from '@drafter/story-map';
import DDialog from '~/components/ui/DDialog.vue';
import DSegmented from '~/components/ui/DSegmented.vue';
import { useEditor } from '~/editor/session';
import { useGuard } from '~/storage/guard';
import { useScript } from '~/storage/script';
import {
  makeStoryMap,
  type StoryMapChanges,
  storyMapPicks,
  titleContact,
  titleFieldText,
} from '~/story-map/flow';
import {
  DEFAULT_EXPLAIN,
  STORY_MAP_PRIVACY,
  type StoryMapProjectOptions,
  storyMapOpen,
  storyMapOptionsOf,
} from '~/story-map/options';
import type { StoryMapPicks } from '~/workers/export-compute';

// Make a story map (story-map design §7): short, with sensible defaults, so Enter makes a good
// page. What is about the text is written into the text (the logline, the lines' marks), what is
// about the whole page into the metadata block (the planned length, the hooks), and the rest is
// kept on the project (`story-map/options.ts`). The lines and hooks are worked out in the export
// worker when the dialog opens, never on the typing path. A read-only tab shows everything, and
// Make story map still makes the page; nothing is written or kept.
const dialog = ref<InstanceType<typeof DDialog>>();
const { view, doc } = useEditor();
const script = useScript();
const { readOnly } = useGuard();

const STATUS_CHOICES = [
  { value: 'in-progress' as const, label: 'In progress' },
  { value: 'finished' as const, label: 'Finished' },
];

/** The choices as the dialog opened with them: what Make compares with, so only changes are written. */
let initial = {
  logline: '',
  plannedPages: null as number | null,
  contact: '',
  stored: storyMapOptionsOf(null),
};
const status = ref<MapStatus>('in-progress');
/** The writer chose a status here: it is kept; else the gaps decide each time (Call 18). */
const statusChosen = ref(false);
const planned = ref('');
const logline = ref('');
const greeting = ref('');
const explainOn = ref(true);
const explain = ref(DEFAULT_EXPLAIN);
const include = reactive({ summaries: true, lines: true, threads: true, contact: false });
const contact = ref('');

/** The quick look: null while the worker works it out, 'failed' if it couldn't. */
const picks = ref<StoryMapPicks | null | 'failed'>(null);
/** Each line's state: which of its scene's lines shows (Pick another), and whether it is used. */
const rows = ref<Array<{ shown: number; on: boolean }>>([]);
/** Each lead's hook as typed, by key. */
const hooks = ref<Record<string, string>>({});
/** "Check the lines and hooks", collapsed each time the dialog opens. */
const checking = ref<HTMLDetailsElement>();
const quotes = computed(() => (picks.value && picks.value !== 'failed' ? picks.value.quotes : []));
const leads = computed(() => (picks.value && picks.value !== 'failed' ? picks.value.hooks : []));

/** What had focus when the dialog opened: the Export menu's button, the palette's input, … */
let opener: HTMLElement | null = null;
/** Counts the openings, so the picks of an earlier one never land in a later one. */
let opening = 0;

function reset() {
  const current = doc.value;
  const stored = storyMapOptionsOf(script.project.value);
  const meta = storyMapMeta(current.meta);
  initial = {
    logline: titleFieldText(current, 'logline'),
    plannedPages: meta.plannedPages,
    contact: titleContact(current),
    stored,
  };
  status.value = stored.status ?? 'in-progress';
  statusChosen.value = false;
  planned.value = meta.plannedPages === null ? '' : String(meta.plannedPages);
  logline.value = initial.logline;
  greeting.value = stored.greeting;
  explainOn.value = stored.explain !== null;
  explain.value = stored.explain ?? DEFAULT_EXPLAIN;
  Object.assign(include, stored.include);
  contact.value = stored.contact ?? initial.contact;
  picks.value = null;
  rows.value = [];
  hooks.value = {};
  if (checking.value) checking.value.open = false;
}

async function loadPicks() {
  const mine = ++opening;
  try {
    const found = await storyMapPicks();
    if (mine !== opening) return;
    picks.value = found;
    rows.value = found.quotes.map((quote) => ({
      shown: Math.max(
        0,
        quote.choices.findIndex((c) => c.cue === quote.cue),
      ),
      on: true,
    }));
    hooks.value = Object.fromEntries(found.hooks.map((h) => [h.key, h.hook ?? '']));
    // The default status, from the gaps, unless one was kept or chosen.
    if (initial.stored.status === null && !statusChosen.value) {
      status.value = found.gapsFound ? 'in-progress' : 'finished';
    }
  } catch {
    if (mine === opening) picks.value = 'failed';
  }
}

watch(storyMapOpen, async (open) => {
  await nextTick();
  if (open && dialog.value && !dialog.value.open) {
    // A menu's item is never the opener: the menu is closing, though its fade can keep the item on
    // the page.
    const active = document.activeElement;
    opener = active instanceof HTMLElement && !active.closest('[role="menu"]') ? active : null;
    reset();
    dialog.value.showModal();
    void loadPicks();
  }
  if (!open && dialog.value?.open) dialog.value.close();
});

function onClose() {
  storyMapOpen.value = false;
  opening++;
  if (opener?.isConnected) opener.focus();
  else if (view.dom.offsetParent !== null) view.focus();
  opener = null;
}

function chooseStatus(next: MapStatus) {
  status.value = next;
  statusChosen.value = true;
}

/** Pick another (§3.1): the next line in the same scene, round to the first. */
function pickAnother(row: number) {
  const state = rows.value[row];
  const quote = quotes.value[row];
  if (!state || !quote || quote.choices.length < 2) return;
  state.shown = (state.shown + 1) % quote.choices.length;
  state.on = true;
}

/** A planned length of 1 to 999 pages, or none. */
function plannedPages(): number | null {
  const pages = Number(planned.value);
  return planned.value.trim() !== '' && Number.isInteger(pages) && pages >= 1 && pages <= 999
    ? pages
    : null;
}

/** The marks the lines' choices make: Pick another moves `[[Quote]]`, unticking says never. */
function quoteChanges(): StoryMapChanges['quotes'] {
  const out: StoryMapChanges['quotes'] = [];
  rows.value.forEach((state, row) => {
    const quote = quotes.value[row];
    const shown = quote?.choices[state.shown];
    if (!quote || !shown) return;
    if (shown.cue !== quote.cue) out.push({ cue: quote.cue, use: 'no-quote' });
    if (!state.on) out.push({ cue: shown.cue, use: 'no-quote' });
    else if (shown.cue !== quote.cue) out.push({ cue: shown.cue, use: 'quote' });
  });
  return out;
}

/** The leads' hooks that were changed here: the edit, or null to go back to the one found. */
function hookChanges(): StoryMapChanges['hooks'] {
  const out: StoryMapChanges['hooks'] = {};
  for (const lead of leads.value) {
    const typed = (hooks.value[lead.key] ?? '').trim();
    if (typed === (lead.hook ?? '').trim()) continue;
    out[lead.key] = typed === (lead.found ?? '').trim() ? null : typed;
  }
  return out;
}

function make() {
  const typedContact = contact.value.trim();
  const page: StoryMapProjectOptions = {
    status: statusChosen.value ? status.value : initial.stored.status,
    greeting: greeting.value.trim() === '' ? initial.stored.greeting : greeting.value.trim(),
    explain: explainOn.value ? explain.value.trim() || DEFAULT_EXPLAIN : null,
    include: { ...include },
    contact: typedContact === initial.contact ? null : typedContact || null,
  };
  const changes: StoryMapChanges = {
    logline: logline.value.trim() === '' ? null : logline.value.trim(),
    plannedPages: plannedPages(),
    hooks: hookChanges(),
    quotes: quoteChanges(),
  };
  // The picker needs the click, so it comes first; the dialog closes as it opens.
  const done = makeStoryMap(changes, page);
  dialog.value?.close();
  void done;
}
</script>

<template>
  <DDialog
    ref="dialog"
    size="md"
    class="story-map-dialog"
    aria-labelledby="story-map-title"
    aria-describedby="story-map-what"
    @close="onClose"
  >
    <form @submit.prevent="make">
      <h2 id="story-map-title" class="d-dialog-title">Make a story map</h2>
      <p id="story-map-what" class="lead">
        One page that shows anyone your story at a glance: its shape, its people, and every scene so
        far. It opens in any browser, on a phone too.
      </p>
      <p v-if="readOnly" class="why">
        Another tab has this script open, so nothing you change here is kept. You can still make
        the page.
      </p>

      <div class="row">
        <span class="label" aria-hidden="true">Status</span>
        <DSegmented
          :model-value="status"
          label="Status"
          :options="STATUS_CHOICES"
          @update:model-value="chooseStatus"
        />
      </div>
      <div v-if="status === 'in-progress'" class="field">
        <label for="story-map-planned">Planned length, in pages (optional)</label>
        <input
          id="story-map-planned"
          v-model="planned"
          type="number"
          inputmode="numeric"
          min="1"
          max="999"
          step="1"
          aria-describedby="story-map-planned-hint"
        />
        <span id="story-map-planned-hint" class="hint">
          With it, the page shows how much is written and what is still to come.
        </span>
      </div>

      <div class="field">
        <label for="story-map-logline">Logline</label>
        <input
          id="story-map-logline"
          v-model="logline"
          type="text"
          maxlength="300"
          placeholder="Your story in one sentence"
          aria-describedby="story-map-logline-hint"
        />
        <span id="story-map-logline-hint" class="hint">
          Kept on your title page as Logline. It never prints in your script.
        </span>
      </div>

      <div class="field">
        <label for="story-map-greeting">The line under your name</label>
        <input id="story-map-greeting" v-model="greeting" type="text" maxlength="200" />
      </div>

      <div class="field">
        <label class="check">
          <input v-model="explainOn" type="checkbox" />
          Explain the page
        </label>
        <input
          v-if="explainOn"
          v-model="explain"
          type="text"
          maxlength="200"
          aria-label="The sentence that explains the page"
        />
      </div>

      <fieldset>
        <legend>Include</legend>
        <label class="check"><input v-model="include.summaries" type="checkbox" />Scene summaries</label>
        <label class="check"><input v-model="include.lines" type="checkbox" />Lines of dialogue</label>
        <label class="check">
          <input v-model="include.threads" type="checkbox" />Threads (your setups and payoffs)
        </label>
        <label class="check">
          <input v-model="include.contact" type="checkbox" aria-describedby="story-map-contact-hint" />
          Your contact
        </label>
        <input
          v-if="include.contact"
          v-model="contact"
          type="text"
          maxlength="200"
          aria-label="Your contact"
          placeholder="you@example.com"
        />
        <span id="story-map-contact-hint" class="hint">
          Off unless you turn it on. When on, it is shown on the page, with a link to email you.
        </span>
      </fieldset>

      <details ref="checking" class="check-picks">
        <summary>Check the lines and hooks</summary>
        <!-- Only while open: a closed dialog keeps no status region in the page. -->
        <template v-if="storyMapOpen">
          <p v-if="picks === null" class="hint" role="status">Finding the lines…</p>
          <p v-else-if="picks === 'failed'" class="hint" role="status">
            Couldn’t find the lines just now. The page still picks them itself.
          </p>
          <template v-else>
            <h3 class="sub">Lines of dialogue</h3>
            <p v-if="quotes.length === 0" class="hint">
              No lines yet: a line needs 3 to 18 words and a full stop.
            </p>
            <ul v-else class="picks">
              <li v-for="(quote, row) in quotes" :key="quote.cue" class="pick">
                <label class="check">
                  <input v-model="rows[row]!.on" type="checkbox" />
                  <span>
                    <span class="speaker">{{ quote.choices[rows[row]!.shown]?.speaker }}</span>
                    “{{ quote.choices[rows[row]!.shown]?.text }}”
                  </span>
                </label>
                <DButton
                  v-if="quote.choices.length > 1"
                  variant="borderless"
                  :aria-label="`Pick another line in this scene, instead of ${quote.choices[rows[row]!.shown]?.speaker}’s`"
                  @click="pickAnother(row)"
                >
                  Pick another
                </DButton>
              </li>
            </ul>
            <h3 class="sub">Characters</h3>
            <p v-if="leads.length === 0" class="hint">No characters yet.</p>
            <div v-for="(lead, k) in leads" :key="lead.key" class="field">
              <label :for="`story-map-hook-${k}`">{{ lead.name }}</label>
              <input
                :id="`story-map-hook-${k}`"
                v-model="hooks[lead.key]"
                type="text"
                maxlength="200"
                placeholder="A few words about them"
              />
            </div>
          </template>
        </template>
      </details>

      <p class="privacy">{{ STORY_MAP_PRIVACY }}</p>
      <div class="d-dialog-footer">
        <DButton @click="dialog?.close()">Cancel</DButton>
        <DButton variant="primary" type="submit" autofocus>Make story map</DButton>
      </div>
    </form>
  </DDialog>
</template>

<style scoped>
.story-map-dialog {
  overflow-y: auto;
}
p {
  margin: 0 0 12px;
  color: var(--muted);
}
.why {
  color: var(--text);
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 12px;
}
.label,
label,
legend {
  font-weight: 600;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 12px;
}
input[type='text'],
input[type='number'] {
  box-sizing: border-box;
  width: 100%;
  min-height: 30px;
  padding: 4px 8px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
input::placeholder {
  color: var(--muted);
}
input[type='number'] {
  width: 8rem;
}
.check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 2px 0;
  font-weight: 400;
}
.check input {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 1px 0 0;
}
fieldset {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 12px;
  padding: 8px 12px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
}
legend {
  padding: 0 4px;
}
.hint {
  display: block;
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  font-weight: 400;
}
.check-picks {
  margin: 0 0 12px;
}
.check-picks summary {
  min-height: 24px;
  font-weight: 600;
  cursor: pointer;
}
.sub {
  margin: 12px 0 6px;
  font-size: 13px;
  font-weight: 600;
}
.picks {
  margin: 0;
  padding: 0;
  list-style: none;
}
.pick {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}
.speaker {
  font-weight: 600;
}
.privacy {
  margin: 12px 0 0;
  color: var(--text);
}
/* A phone: a sheet from the bottom of the screen, as wide as it is. */
@media (max-width: 639.98px) {
  .story-map-dialog {
    width: 100vw;
    max-width: 100vw;
    max-height: 92dvh;
    margin: auto 0 0;
    padding: 20px 16px calc(16px + env(safe-area-inset-bottom));
    border-bottom: 0;
    border-radius: var(--r-lg) var(--r-lg) 0 0;
  }
  .pick {
    flex-direction: column;
  }
}
</style>
