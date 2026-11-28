<script setup lang="ts">
import { DEFINITIONS_SIZE_LABEL } from '~/definitions/source';
import { useDefinitions } from '~/definitions/use-definitions';
import type { Suggestion } from '~/workers/definitions-compute';

// Definitions (definitions design §7.5): a word from the 1913 Webster's, beside the script. A search
// field (with headwords as you type), then the entry: its headword, "from walked" when an
// inflection led there, each part of speech with its numbered senses and lettered sub-senses, and
// the phrases defined in it; a phrase looked up shows that phrase. Before the dictionary is
// downloaded, one sentence and Download, never automatic. Everything is plain headings and lists in
// reading order; the polite status line says what was found.

const definitions = useDefinitions();
const { state, progress, problem, query, shown, busy } = definitions;
const uid = useId();
const suggestions = ref<Suggestion[]>([]);
const status = ref('');

onMounted(() => {
  if (state.value === 'unknown') void definitions.refresh();
});

let typing: ReturnType<typeof setTimeout> | undefined;
watch(query, (value) => {
  clearTimeout(typing);
  typing = setTimeout(async () => {
    suggestions.value = value.trim().length >= 2 ? await definitions.suggest(value, 8) : [];
  }, 150);
});

async function submit() {
  await definitions.lookUp(query.value);
}

watch(shown, (now) => {
  if (!now) return;
  const r = now.result;
  if (!r) status.value = `${now.word}: not in the 1913 Webster’s.`;
  else if (r.phrase) status.value = `${r.phrase.phrases[0]}, a phrase under ${r.headword}.`;
  else
    status.value = `${r.headword}, ${r.entries.length} ${r.entries.length === 1 ? 'entry' : 'entries'}.`;
});

const percent = computed(() => Math.round(progress.value * 100));
</script>

<template>
  <div class="definitions" @keydown.esc.stop="definitions.close(true)">
    <div class="tools">
      <form class="search" role="search" @submit.prevent="submit">
        <label :for="`${uid}-q`">Look up</label>
        <input
          :id="`${uid}-q`"
          v-model="query"
          type="search"
          autocomplete="off"
          spellcheck="false"
          maxlength="64"
          :list="`${uid}-list`"
          placeholder="A word or phrase"
          :disabled="state !== 'ready'"
        />
        <datalist :id="`${uid}-list`">
          <option v-for="s in suggestions" :key="s.slug" :value="s.headword" />
        </datalist>
        <DButton type="submit" :disabled="state !== 'ready' || !query.trim()">Look up</DButton>
      </form>
    </div>

    <p class="sr-only" role="status" aria-live="polite">{{ status }}</p>
    <p v-if="problem" class="problem" role="alert">{{ problem }}</p>

    <section v-if="state === 'absent' || state === 'downloading'" class="get" :aria-labelledby="`${uid}-get`">
      <h3 :id="`${uid}-get`">Webster’s 1913, offline</h3>
      <p>
        Definitions come from <cite>Webster’s Revised Unabridged Dictionary</cite> (1913), in the public
        domain. Download it once ({{ DEFINITIONS_SIZE_LABEL }}) to look words up here; after that every
        lookup happens on this device, and nothing you look up is sent anywhere.
      </p>
      <p v-if="query && state === 'absent'" class="waiting">“{{ query }}” will be looked up once it’s downloaded.</p>
      <div v-if="state === 'downloading'" class="progress">
        <progress :value="percent" max="100" :aria-label="`Downloading the dictionary, ${percent}%`" />
        <span aria-hidden="true">{{ percent }}%</span>
        <DButton variant="borderless" @click="definitions.cancel()">Cancel</DButton>
      </div>
      <DButton v-else variant="primary" @click="definitions.download()">Download ({{ DEFINITIONS_SIZE_LABEL }})</DButton>
    </section>

    <template v-else-if="shown">
      <p v-if="!shown.result" class="missing">“{{ shown.word }}” isn’t in the 1913 Webster’s.</p>
      <article v-else class="entry" :aria-labelledby="`${uid}-hw`">
        <h3 :id="`${uid}-hw`" class="headword">
          {{ shown.result.headword }}
          <span v-if="shown.result.via" class="via">from “{{ shown.result.via }}”</span>
        </h3>
        <section v-if="shown.result.phrase" class="phrase" :aria-labelledby="`${uid}-ph`">
          <h4 :id="`${uid}-ph`">{{ shown.result.phrase.phrases.join(', or ') }}</h4>
          <p>{{ shown.result.phrase.definition }}</p>
        </section>
        <section
          v-for="(entry, i) in shown.result.entries"
          :key="i"
          class="pos"
          :aria-label="entry.pos ? `${shown.result.headword}, ${entry.pos}` : shown.result.headword"
        >
          <p v-if="entry.pos" class="pos-name">{{ entry.pos }}</p>
          <ol class="senses">
            <li v-for="(sense, j) in entry.senses" :key="j" :class="{ bare: sense.n === null }" :value="sense.n ?? undefined">
              {{ sense.text }}
              <ol v-if="sense.sub.length" class="subs" type="a">
                <li v-for="sub in sense.sub" :key="sub.letter">{{ sub.text }}</li>
              </ol>
            </li>
          </ol>
          <template v-if="entry.phrases.length">
            <p class="phrases-label">Phrases</p>
            <ul class="phrases">
              <li v-for="p in entry.phrases" :key="p.anchor">
                <button type="button" class="phrase-link" @click="definitions.lookUp(p.phrases[0] ?? '')">
                  {{ p.phrases.join(', or ') }}
                </button>
              </li>
            </ul>
          </template>
        </section>
        <p class="more">
          <a :href="shown.result.phrase?.url ?? shown.result.url" target="_blank" rel="noopener noreferrer">
            More on w1913.com
          </a>
          <span class="muted">(synonyms, quotations, etymology)</span>
        </p>
      </article>
    </template>

    <p v-else-if="state === 'ready' && !busy" class="hint">
      Type a word above, or right-click one in the script and choose Look up (Shift+F7 looks up the word at
      the cursor).
    </p>

    <p class="source">
      <cite>Webster’s Revised Unabridged Dictionary</cite> (1913), from
      <a href="https://w1913.com" target="_blank" rel="noopener noreferrer">W1913</a>. Public domain.
    </p>
  </div>
</template>

<style scoped>
.definitions {
  min-height: 100%;
  padding-bottom: 24px;
  background: var(--bg);
  color: var(--text);
}
.tools {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 10px 16px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
}
.search input {
  flex: 1;
  min-width: 0;
  min-height: 28px;
  padding: 2px 8px;
  border: 1px solid var(--muted);
  border-radius: var(--r-sm);
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
.search input::placeholder {
  color: var(--muted);
}
.problem,
.missing,
.hint,
.get,
.entry,
.source {
  margin: 0;
  padding: 12px 16px 0;
}
.problem {
  color: var(--danger);
}
.get h3,
.headword {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
}
.get p {
  margin: 0 0 12px;
  line-height: 1.5;
}
.waiting,
.hint,
.muted,
.via,
.source {
  color: var(--muted);
  font-size: 13px;
}
.via {
  margin-left: 6px;
  font-weight: 400;
}
.progress {
  display: flex;
  align-items: center;
  gap: 8px;
}
.progress progress {
  flex: 1;
}
.phrase h4 {
  margin: 0 0 4px;
  font-size: 15px;
}
.phrase p {
  margin: 0 0 12px;
  line-height: 1.5;
}
.pos {
  margin-bottom: 12px;
}
.pos-name,
.phrases-label {
  margin: 8px 0 4px;
  color: var(--muted);
  font-size: 13px;
  font-style: italic;
}
.senses {
  margin: 0;
  padding-left: 24px;
  line-height: 1.5;
}
.senses > li {
  margin-bottom: 6px;
}
.senses > li.bare {
  list-style: none;
}
.subs {
  margin: 4px 0 0;
  padding-left: 20px;
}
.phrases {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.phrase-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent-text);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.more {
  margin: 12px 0 0;
}
.more a,
.source a {
  color: var(--accent-text);
  /* Links in a sentence are told apart by more than color (WCAG 1.4.1). */
  text-decoration: underline;
}
.source {
  padding-top: 20px;
}
</style>
