<script setup lang="ts">
import { currentAbout, versionText } from '~/about/info';
import { formatKeys, isApple } from '~/commands/keys';
import DDialog from '~/components/ui/DDialog.vue';
import DSegmented from '~/components/ui/DSegmented.vue';
import { desktop } from '~/desktop';
import { clearDraft, loadDraft, reportOpen, saveDraft } from '~/report/dialog';
import {
  CONTACT_EMAIL,
  EMPTY_DRAFT,
  fullText,
  hasText,
  type IssueDraft,
  type IssueKind,
  issueLink,
  mailLink,
  SECURITY_URL,
} from '~/report/issue';
import { writeClipboard } from '~/utils/clipboard';

// Help → Report a problem… and Suggest an idea… (also in the palette, About, and the desktop app's
// Help menu). Drafter has no server and keeps no token, so it never sends anything: the writer
// fills in a few fields, sees exactly what will go, and Open on GitHub opens GitHub's new-issue
// page with that text filled in (a new tab; the desktop app's system browser), where they review
// it and submit it with their own account. Copy, and an email from their own email app, are the
// ways without an account, or offline. Nothing from the script goes in: no text, title, file
// name, or note.
//
// A report is never lost (the maintainer: "I don't want the reports lost and have to type over"):
// Copy report, Write an email, and Open on GitHub each put the whole report on the clipboard, and
// the report is kept on this device (localStorage) until the writer clears it, since Drafter
// can't know whether GitHub or the email app got it.
const dialog = ref<InstanceType<typeof DDialog>>();
const shown = ref(false);
const draft = reactive<IssueDraft>({ ...EMPTY_DRAFT });
const copied = ref('');
const online = ref(true);
const versionInfo = versionText(currentAbout());
/**
 * The desktop app opens a `mailto:` as a new window, which it refuses and hands to the email app
 * (`navigationFor`), so the editor's own window never starts a navigation. A browser follows it in
 * place, which opens the email app and leaves the page as it is.
 */
const mailTarget = desktop() ? '_blank' : undefined;

const KIND_OPTIONS: { value: IssueKind; label: string }[] = [
  { value: 'problem', label: 'Problem' },
  { value: 'idea', label: 'Idea' },
];

const link = computed(() => issueLink(draft, versionInfo));
const mail = computed(() => mailLink(draft, versionInfo));
/** The whole report, never trimmed: what every copy copies. */
const preview = computed(() => fullText(draft, versionInfo));
const typed = computed(() => hasText(draft));
const previewText = ref<HTMLElement>();
const titleField = ref<HTMLInputElement>();
/** The platform's own copy key: ⌘C on a Mac, Ctrl+C elsewhere. */
const copyKey = formatKeys('Mod-c', isApple());

const SAID = {
  copy: 'Copied.',
  github: 'The report is also copied, in case GitHub doesn’t fill it in.',
  mail: 'The report is also copied, in case your email app doesn’t open.',
  mailTrimmed:
    'Your email app has the start of the report. The whole report is copied, so paste it into the email.',
} as const;
const heading = computed(() => (draft.kind === 'problem' ? 'Report a problem' : 'Suggest an idea'));

const onLine = () => {
  online.value = typeof navigator === 'undefined' || navigator.onLine !== false;
};

watch(reportOpen, async (kind) => {
  if (kind) {
    Object.assign(draft, loadDraft(), { kind });
    copied.value = '';
    onLine();
    shown.value = true;
    await nextTick();
    if (dialog.value && !dialog.value.open) dialog.value.showModal();
  } else if (dialog.value?.open) dialog.value.close();
});

watch(
  draft,
  (value) => {
    if (shown.value) saveDraft({ ...value });
    copied.value = '';
  },
  { deep: true },
);

onMounted(() => {
  window.addEventListener('online', onLine);
  window.addEventListener('offline', onLine);
});
onBeforeUnmount(() => {
  window.removeEventListener('online', onLine);
  window.removeEventListener('offline', onLine);
});

function onClose() {
  shown.value = false;
  reportOpen.value = null;
}

async function copy(text: string, what: string) {
  const ok = await writeClipboard(text, dialog.value?.el);
  copied.value = ok ? `Copied ${what}.` : `Press ${copyKey} to copy.`;
}

/** Selects the preview's text, for the writer's own copy key. */
function selectPreview() {
  const text = previewText.value;
  const selection = window.getSelection();
  if (!text || !selection) return;
  text.parentElement?.focus();
  const range = document.createRange();
  range.selectNodeContents(text);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Puts the whole report on the clipboard, and says so: for Copy report, and first thing when
 * Write an email or Open on GitHub is clicked (their link opens as usual; this never stops it).
 * Where the clipboard can't be reached, the preview is selected for the writer to copy.
 */
async function copyReport(why: 'copy' | 'github' | 'mail') {
  if (!typed.value) return;
  const said =
    why === 'copy'
      ? SAID.copy
      : why === 'github'
        ? SAID.github
        : mail.value.trimmed
          ? SAID.mailTrimmed
          : SAID.mail;
  const ok = await writeClipboard(preview.value, dialog.value?.el);
  if (ok) {
    copied.value = said;
    return;
  }
  selectPreview();
  copied.value =
    why === 'mail' && mail.value.trimmed
      ? `Your email app has the start of the report. The whole report is selected: press ${copyKey} to copy it, and paste it into the email.`
      : `The report is selected. Press ${copyKey} to copy.`;
}

/** Empties the report, here and on this device. */
function clearReport() {
  Object.assign(draft, { ...EMPTY_DRAFT, kind: draft.kind });
  clearDraft();
  copied.value = '';
  titleField.value?.focus();
}
</script>

<template>
  <DDialog
    ref="dialog"
    size="md"
    class="report"
    aria-labelledby="report-title"
    aria-describedby="report-note"
    data-report
    @close="onClose"
  >
    <template v-if="shown">
      <h2 id="report-title" class="d-dialog-title">{{ heading }}</h2>
      <div v-if="typed" class="kept" data-report-kept>
        <span>Kept on this device until you clear it.</span>
        <DButton variant="borderless" class="clear" @click="clearReport">Clear</DButton>
      </div>
      <p v-if="!online" class="offline" data-report-offline>
        You’re offline. Copy this and file it when you’re back online.
      </p>
      <div class="kind">
        <span class="label" aria-hidden="true">Kind</span>
        <DSegmented v-model="draft.kind" label="Kind" :options="KIND_OPTIONS" />
      </div>
      <label class="field">
        <span class="label">Title</span>
        <input
          ref="titleField"
          v-model="draft.title"
          type="text"
          maxlength="256"
          autocomplete="off"
          :placeholder="draft.kind === 'problem' ? 'Export skips the title page' : 'Index cards in colour'"
          autofocus
        />
      </label>
      <template v-if="draft.kind === 'problem'">
        <label class="field">
          <span class="label">What happened</span>
          <textarea v-model="draft.happened" rows="4" />
        </label>
        <label class="field">
          <span class="label">What you expected</span>
          <textarea v-model="draft.expected" rows="3" />
        </label>
      </template>
      <label v-else class="field">
        <span class="label">What you’d like</span>
        <textarea v-model="draft.idea" rows="5" />
      </label>
      <label class="check">
        <input v-model="draft.includeVersion" type="checkbox" />
        Include version info
      </label>

      <h3 id="report-preview-title">The report</h3>
      <!-- Focusable, so a keyboard can scroll it; named by its heading. Selectable, to copy by hand. -->
      <div
        class="preview"
        role="region"
        tabindex="0"
        aria-labelledby="report-preview-title"
        data-report-preview
      >
        <pre v-if="typed" ref="previewText">{{ preview }}</pre>
        <p v-else class="empty">Nothing yet. What you type above shows here.</p>
      </div>
      <p v-if="link.trimmed" class="trimmed" data-report-trimmed>
        It’s too long for one link, so GitHub gets the start of it. Paste the rest on GitHub: Copy
        report has all of it.
      </p>

      <p id="report-note" class="note">
        Your script is never included. You’ll finish on GitHub, which needs a free GitHub account.
        For a security problem,
        <a :href="SECURITY_URL" target="_blank" rel="noopener noreferrer" data-report-security
          >use the private report instead</a
        >, or email {{ CONTACT_EMAIL }} with the details.
      </p>
      <div class="email">
        <p>
          No GitHub account? Email <span class="address" data-report-email>{{ CONTACT_EMAIL }}</span>.
          It goes from your own email app.
        </p>
        <div class="email-actions">
          <a
            :href="mail.url"
            :target="mailTarget"
            class="d-btn d-btn--secondary"
            data-report-mailto
            @click="copyReport('mail')"
            >Write an email</a
          >
          <DButton @click="copy(CONTACT_EMAIL, 'the address')">Copy address</DButton>
        </div>
      </div>

      <p role="status" aria-live="polite" class="copied" data-report-copied>{{ copied }}</p>
      <div class="d-dialog-footer">
        <DButton @click="dialog?.close()">Close</DButton>
        <DButton :disabled="!typed" @click="copyReport('copy')">Copy report</DButton>
        <a
          :href="link.url"
          target="_blank"
          rel="noopener noreferrer"
          class="d-btn d-btn--primary"
          data-report-open
          @click="copyReport('github')"
          >Open on GitHub</a
        >
      </div>
    </template>
  </DDialog>
</template>

<style scoped>
h3 {
  margin: 16px 0 6px;
  font-size: 13px;
  font-weight: 600;
}
p {
  margin: 0 0 8px;
}
.offline {
  padding: 8px 10px;
  border: 1px solid var(--warn-border);
  border-radius: var(--r-sm);
  background: var(--warn-bg);
  color: var(--text);
}
.kind {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 4px 0 12px;
}
.label {
  color: var(--muted);
  font-weight: 600;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 10px;
}
.field input,
.field textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 30px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.field textarea {
  resize: vertical;
}
.field input::placeholder {
  color: var(--muted);
}
.kept {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin: -2px 0 10px;
  color: var(--muted);
}
.clear {
  min-height: 24px;
  padding: 0 8px;
}
.check {
  display: flex;
  align-items: center;
  gap: 8px;
}
.preview {
  max-height: 180px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: var(--surface);
  overflow: auto;
}
.preview pre {
  margin: 0;
  user-select: text;
  cursor: text;
  font: 12px/1.45 var(--font-mono);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.preview .empty {
  margin: 0;
  color: var(--muted);
}
.trimmed {
  margin: 6px 0 0;
  color: var(--text);
}
.note {
  margin-top: 12px;
  color: var(--muted);
}
.note a {
  color: var(--text);
  text-decoration: underline;
}
.email p {
  margin: 0 0 6px;
}
.address {
  color: var(--text);
  font-weight: 600;
  user-select: all;
  overflow-wrap: anywhere;
}
.email-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.copied {
  min-height: 1lh;
  margin: 8px 0 0;
  color: var(--muted);
}
.copied:empty {
  min-height: 0;
  margin: 0;
}
a.d-btn {
  text-decoration: none;
}
</style>
