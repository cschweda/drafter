<script setup lang="ts">
import {
  MAX_CONTACT_LINES,
  MAX_DETAIL,
  type ManuscriptFont,
  novelStructure,
  readFacts,
  resolveDetails,
  wordsLabel,
} from '@drafter/novel';
import DDialog from '~/components/ui/DDialog.vue';
import { useEditor } from '~/editor/session';
import {
  closeWhenBookChanges,
  contactLines,
  detailsFor,
  keptFrom,
  manuscriptOpen,
} from '~/novel/manuscript';
import { useNovel } from '~/novel/use-novel';
import { exportError, exportManuscript, exportNotice, sayInToast } from '~/storage/export';
import { useScript } from '~/storage/script';
import { fileBaseName, titleFileOf } from '~/storage/text';

// Export a novel as a manuscript (manuscript design, "The Manuscript details dialog"): the title
// page's and the running header's details, then the PDF or the Word file. Every field is optional,
// and a blank one is left off the page. What the writer changed from the book's own defaults is
// kept in the book's metadata comment, in one undo step, so the dialog opens with it next time; a
// read-only tab still exports with what was typed, and says the details weren't kept.
const dialog = ref<InstanceType<typeof DDialog>>();
const { view } = useEditor();
const script = useScript();
const novel = useNovel();

const FONT_CHOICES: { value: ManuscriptFont; label: string }[] = [
  { value: 'times', label: 'Times-style serif' },
  { value: 'courier', label: 'Courier' },
];
const NOT_KEPT = 'These details weren’t saved: this tab only shows the book.';

const form = reactive({
  title: '',
  byline: '',
  legalName: '',
  contact: '',
  surname: '',
  shortTitle: '',
  font: 'times' as ManuscriptFont,
});
/** The fields the writer has set themselves, which the byline and the title no longer fill. */
const own = reactive({ legalName: false, surname: false, shortTitle: false });
const words = ref('');
/** Why nothing typed here can be kept, or null when it can. */
const readOnly = ref<string | null>(null);

/** The book and the file name the dialog opened with, and the project they are of. */
let source = '';
let fileTitle = '';
let openedFor: string | undefined;

function reset() {
  source = view.state.doc.toString();
  fileTitle = fileBaseName(titleFileOf(script.project.value));
  openedFor = script.project.value?.id;
  const kept = readFacts(source).manuscript ?? {};
  const details = detailsFor(source, fileTitle);
  form.title = details.title;
  form.byline = details.byline;
  form.legalName = details.legalName;
  form.contact = details.contact.join('\n');
  form.surname = details.surname;
  form.shortTitle = details.shortTitle;
  form.font = details.font;
  own.legalName = kept.legalName !== undefined;
  own.surname = kept.surname !== undefined;
  own.shortTitle = kept.shortTitle !== undefined;
  words.value = wordsLabel(novelStructure(source).words);
  readOnly.value = novel.readOnly();
}

/** The defaults that follow what is typed: the legal name and surname, the short title. */
function follow() {
  const given = resolveDetails(source, fileTitle, {
    title: form.title.trim(),
    byline: form.byline.trim(),
    legalName: own.legalName ? form.legalName.trim() : form.byline.trim(),
  });
  if (!own.legalName) form.legalName = given.legalName;
  if (!own.surname) form.surname = given.surname;
  if (!own.shortTitle) form.shortTitle = given.shortTitle;
}

watch(manuscriptOpen, async (open) => {
  await nextTick();
  if (open && dialog.value && !dialog.value.open) {
    reset();
    dialog.value.showModal();
  }
  if (!open && dialog.value?.open) dialog.value.close();
});

// The details are one book's: another book opened meanwhile (a switch, a reload elsewhere) closes
// the dialog, so they never land on its title page.
closeWhenBookChanges(
  () => script.project.value?.id,
  () => openedFor,
  () => dialog.value?.open === true,
  () => dialog.value?.close(),
);

function onClose() {
  manuscriptOpen.value = null;
}

/** The form's answers, trimmed: what the export prints, blanks left off. */
function answers() {
  return {
    title: form.title.trim(),
    byline: form.byline.trim(),
    legalName: form.legalName.trim(),
    contact: contactLines(form.contact).slice(0, MAX_CONTACT_LINES),
    surname: form.surname.trim(),
    shortTitle: form.shortTitle.trim(),
    font: form.font,
  };
}

function exportNow() {
  const format = manuscriptOpen.value;
  if (!format) return;
  const typed = answers();
  // The picker needs the click, so the export starts first; the dialog closes as it opens.
  const done = exportManuscript(format, typed, openedFor);
  const kept = novel.setManuscript(keptFrom(typed, source, fileTitle));
  dialog.value?.close();
  if (!kept) {
    // Said after the export's own word, and never over a refusal ("Only a novel …").
    void done.then((result) => {
      if (result === 'saved') return sayInToast(`${exportNotice.value} ${NOT_KEPT}`);
      if (!exportError.value) return sayInToast(NOT_KEPT);
    });
  }
}
</script>

<template>
  <DDialog
    ref="dialog"
    size="md"
    class="manuscript-dialog"
    aria-labelledby="manuscript-title"
    aria-describedby="manuscript-what"
    @close="onClose"
  >
    <form @submit.prevent="exportNow">
      <h2 id="manuscript-title" class="d-dialog-title">Manuscript details</h2>
      <p id="manuscript-what" class="lead">
        The title page and the header on every page, in standard manuscript format. Leave a field
        blank to leave it off the page.
      </p>
      <p v-if="readOnly" class="why">
        {{ readOnly }} These details won’t be kept, but you can still export.
      </p>

      <div class="field">
        <label for="manuscript-field-title">Title</label>
        <input
          id="manuscript-field-title"
          v-model="form.title"
          type="text"
          autocomplete="off"
          :maxlength="MAX_DETAIL"
          autofocus
          @input="follow"
        />
      </div>
      <div class="field">
        <label for="manuscript-field-byline">Byline</label>
        <input
          id="manuscript-field-byline"
          v-model="form.byline"
          type="text"
          autocomplete="off"
          :maxlength="MAX_DETAIL"
          aria-describedby="manuscript-field-byline-hint"
          @input="follow"
        />
        <span id="manuscript-field-byline-hint" class="hint">The name the book is published under.</span>
      </div>
      <div class="field">
        <label for="manuscript-field-legal">Legal name</label>
        <input
          id="manuscript-field-legal"
          v-model="form.legalName"
          type="text"
          autocomplete="off"
          :maxlength="MAX_DETAIL"
          aria-describedby="manuscript-field-legal-hint"
          @input="
            own.legalName = true;
            follow();
          "
        />
        <span id="manuscript-field-legal-hint" class="hint">
          The first line of your contact, top left: the name an agent pays.
        </span>
      </div>
      <div class="field">
        <label for="manuscript-field-contact">Contact</label>
        <textarea
          id="manuscript-field-contact"
          v-model="form.contact"
          rows="3"
          autocomplete="off"
          spellcheck="false"
          aria-describedby="manuscript-field-contact-hint manuscript-field-contact-note"
        />
        <span id="manuscript-field-contact-hint" class="hint">
          One line each: address, phone, email.
        </span>
        <span id="manuscript-field-contact-note" class="hint">
          Saved in this book’s file, so anyone you send the Markdown file to can read it.
        </span>
      </div>
      <div class="field">
        <label for="manuscript-field-surname">Surname for the header</label>
        <input
          id="manuscript-field-surname"
          v-model="form.surname"
          type="text"
          autocomplete="off"
          :maxlength="MAX_DETAIL"
          @input="own.surname = true"
        />
      </div>
      <div class="field">
        <label for="manuscript-field-short">Short title</label>
        <input
          id="manuscript-field-short"
          v-model="form.shortTitle"
          type="text"
          autocomplete="off"
          :maxlength="MAX_DETAIL"
          aria-describedby="manuscript-field-short-hint"
          @input="own.shortTitle = true"
        />
        <span id="manuscript-field-short-hint" class="hint">
          In the header, after the surname: “Vale / SALT ROAD / 2”.
        </span>
      </div>
      <fieldset>
        <legend>Font</legend>
        <label v-for="choice in FONT_CHOICES" :key="choice.value" class="check">
          <input v-model="form.font" type="radio" name="manuscript-font" :value="choice.value" />
          {{ choice.label }}
        </label>
      </fieldset>
      <p class="words">Word count: {{ words }}</p>

      <div class="d-dialog-footer">
        <DButton @click="dialog?.close()">Cancel</DButton>
        <DButton variant="primary" type="submit">
          {{ manuscriptOpen === 'docx' ? 'Export Word file' : 'Export PDF' }}
        </DButton>
      </div>
    </form>
  </DDialog>
</template>

<style scoped>
.manuscript-dialog {
  overflow-y: auto;
}
p {
  margin: 0 0 12px;
  color: var(--muted);
}
.why,
.words {
  color: var(--text);
}
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
textarea {
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
textarea {
  resize: vertical;
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
/* A phone: a sheet from the bottom of the screen, as wide as it is. */
@media (max-width: 639.98px) {
  .manuscript-dialog {
    width: 100vw;
    max-width: 100vw;
    max-height: 92dvh;
    margin: auto 0 0;
    padding: 20px 16px calc(16px + env(safe-area-inset-bottom));
    border-bottom: 0;
    border-radius: var(--r-lg) var(--r-lg) 0 0;
  }
}
</style>
