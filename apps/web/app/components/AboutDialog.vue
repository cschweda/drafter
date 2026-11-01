<script setup lang="ts">
import { aboutOpen } from '~/about/dialog';
import {
  ABOUT_DESCRIPTION,
  ABOUT_LICENSE,
  ABOUT_LINKS,
  ABOUT_TRADEMARK,
  type AboutInfo,
  buildLine,
  currentAbout,
  runtimeLine,
  versionLine,
  versionText,
} from '~/about/info';
import { createAboutCheck } from '~/about/update-check';
import { HELP_PAGES, helpHref } from '~/commands/data';
import { commandById } from '~/commands/registry';
import DDialog from '~/components/ui/DDialog.vue';
import { desktop } from '~/desktop';
import { reportOpen } from '~/report/dialog';
import { CONTACT_EMAIL } from '~/report/issue';
import { actionLabel } from '~/update/flow';
import { runUpdateCheck, takeUpdate, useUpdateCheck } from '~/update/use-check';
import { writeClipboard } from '~/utils/clipboard';

// Help → About Drafter: the version (for a bug report, with Copy version info, and Check for
// updates… beside it), which app this is, and the links. Every link leaves the app: a new tab on
// the web, the system browser in the desktop app (its window-open handler hands an https address to the browser and never
// navigates the app's window). The help pages open as the Help commands open them.
const dialog = ref<InstanceType<typeof DDialog>>();
const info = ref<AboutInfo | null>(null);
const copied = ref('');
/** As Report a problem's email link: a new window in the desktop app, which hands it to the email app. */
const mailTarget = desktop() ? '_blank' : undefined;

// Check for updates…, beside the version (Task 3b): the one check the Help menu's command runs,
// said here under the version, so focus stays in About. A new version is offered by its own
// action (Reload, Restart, Get it), which closes About and goes through the app's offer.
const about = currentAbout();
const update = createAboutCheck(useUpdateCheck(), runUpdateCheck, about.version, about.app);
const { message: updateMessage, busy: checking, ready: updateReady, how: updateHow } = update;
/**
 * Always runs: a check already under way (the Help menu's, or a second press) is that one
 * (`createUpdateCheck` joins them), and About says what it finds.
 */
async function checkForUpdates() {
  await update.run();
}
function takeFound() {
  dialog.value?.close();
  takeUpdate();
}

watch(aboutOpen, async (open) => {
  if (open) {
    info.value = currentAbout();
    copied.value = '';
  }
  await nextTick();
  if (open && dialog.value && !dialog.value.open) dialog.value.showModal();
  if (!open && dialog.value?.open) dialog.value.close();
});

function onClose() {
  aboutOpen.value = false;
  update.reset();
  // Its contents (and their status line) leave the page with it.
  info.value = null;
}

async function copy() {
  if (!info.value) return;
  const ok = await writeClipboard(versionText(info.value), dialog.value?.el);
  copied.value = ok ? 'Copied.' : 'Couldn’t copy. Select the text above and copy it.';
}

/** Report a problem or Suggest an idea: About closes, and that dialog opens in its place. */
function report(kind: 'problem' | 'idea') {
  dialog.value?.close();
  reportOpen.value = kind;
}

/** A help page opens as its command opens it (a window of the app's own, which Back to Drafter closes). */
function openHelp(id: string) {
  void commandById(id)?.run();
}
</script>

<template>
  <DDialog size="md"
    ref="dialog"
    class="about"
    aria-labelledby="about-title"
    aria-describedby="about-what"
    data-about
    @close="onClose"
  >
    <template v-if="info">
      <!-- Drafter™ at its first use here; its name stays "Drafter" (the mark is for the eye). -->
      <h2 id="about-title" class="d-dialog-title">Drafter<span aria-hidden="true">™</span></h2>
      <div class="version-row">
        <p class="version" data-about-version>{{ versionLine(info) }}</p>
        <DButton :aria-disabled="checking ? 'true' : undefined" @click="checkForUpdates">
          Check for updates…
        </DButton>
      </div>
      <!-- What the check found, said politely; the region is there from the start, so it is heard. -->
      <div class="update-row">
        <p role="status" aria-live="polite" class="said" data-about-update>{{ updateMessage }}</p>
        <DButton v-if="updateReady" variant="primary" @click="takeFound">
          {{ actionLabel(updateHow) }}
        </DButton>
      </div>
      <p id="about-what">{{ ABOUT_DESCRIPTION }}</p>
      <dl class="facts">
        <dt>App</dt>
        <dd>{{ info.app === 'desktop' ? 'The desktop app' : 'The web app (drafter.dev)' }}</dd>
        <template v-if="buildLine(info)">
          <dt>Build</dt>
          <dd>{{ buildLine(info) }}</dd>
        </template>
        <dt>Platform</dt>
        <dd>{{ info.platform }}</dd>
        <template v-if="info.browser">
          <dt>Browser</dt>
          <dd>{{ info.browser }}</dd>
        </template>
        <template v-if="runtimeLine(info)">
          <dt>Runtime</dt>
          <dd data-about-runtime>{{ runtimeLine(info) }}</dd>
        </template>
        <dt>Licence</dt>
        <dd>{{ ABOUT_LICENSE }}</dd>
      </dl>
      <MadeBy />
      <p class="contact" data-about-contact>
        Contact: <a :href="`mailto:${CONTACT_EMAIL}`" :target="mailTarget">{{ CONTACT_EMAIL }}</a>
      </p>
      <p class="trademark" data-about-trademark>{{ ABOUT_TRADEMARK }}</p>
      <div class="copy">
        <DButton @click="copy">Copy version info</DButton>
        <span role="status" aria-live="polite" class="copied" data-about-copied>{{ copied }}</span>
      </div>
      <div class="report">
        <DButton @click="report('problem')">Report a problem…</DButton>
        <DButton @click="report('idea')">Suggest an idea…</DButton>
      </div>
      <h3>Links</h3>
      <ul class="links">
        <li v-for="link in ABOUT_LINKS" :key="link.id">
          <a :href="link.href" target="_blank" rel="noopener noreferrer">{{ link.label }}</a>
        </li>
      </ul>
      <h3>Help</h3>
      <ul class="links">
        <li v-for="page in HELP_PAGES" :key="page.id">
          <a :href="helpHref(page)" target="_blank" @click.prevent="openHelp(page.id)">{{
            page.title
          }}</a>
        </li>
      </ul>
      <div class="d-dialog-footer">
        <DButton variant="primary" autofocus @click="dialog?.close()">Close</DButton>
      </div>
    </template>
  </DDialog>
</template>

<style scoped>
h3 {
  margin: 16px 0 4px;
  font-size: 13px;
  font-weight: 600;
}
p {
  margin: 0 0 8px;
}
.version-row,
.update-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
}
.version-row {
  margin: 0 0 8px;
}
.version-row .version {
  margin: 0;
}
.version {
  color: var(--accent-text);
  font-weight: 600;
}
.update-row {
  margin: -2px 0 8px;
}
.update-row:has(.said:empty) {
  margin: 0;
}
.said {
  margin: 0;
  color: var(--text);
}
.d-btn[aria-disabled="true"] {
  opacity: 0.6;
  cursor: default;
}
#about-what {
  color: var(--muted);
}
.trademark {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
}
.facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 12px;
  margin: 8px 0;
}
.facts dt {
  color: var(--muted);
}
.facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.copy {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}
.copied {
  color: var(--muted);
}
.report {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.contact {
  margin: 4px 0 0;
  color: var(--muted);
}
.contact a {
  color: var(--text);
  text-decoration: underline;
}
.links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.links a {
  color: var(--text);
  text-decoration: underline;
}
</style>
