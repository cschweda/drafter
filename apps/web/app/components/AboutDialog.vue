<script setup lang="ts">
import { aboutOpen } from '~/about/dialog';
import {
  ABOUT_DESCRIPTION,
  ABOUT_LICENSE,
  ABOUT_LINKS,
  type AboutInfo,
  buildLine,
  currentAbout,
  runtimeLine,
  versionLine,
  versionText,
} from '~/about/info';
import { HELP_PAGES, helpHref } from '~/commands/data';
import { commandById } from '~/commands/registry';

// Help → About Drafter: the version (for a bug report, with Copy version info), which app this
// is, and the links. Every link leaves the app: a new tab on the web, the system browser in the
// desktop app (its window-open handler hands an https address to the browser and never
// navigates the app's window). The help pages open as the Help commands open them.
const dialog = ref<HTMLDialogElement>();
const info = ref<AboutInfo | null>(null);
const copied = ref('');

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
  // Its contents (and their status line) leave the page with it.
  info.value = null;
}

/** The text on the clipboard: the async API, else the browser's own Copy of a selected field. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Refused (no permission, an insecure page): the page's own copy below.
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  (dialog.value ?? document.body).append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

async function copy() {
  if (!info.value) return;
  const ok = await writeClipboard(versionText(info.value));
  copied.value = ok ? 'Copied.' : 'Couldn’t copy. Select the text above and copy it.';
}

/** A help page opens as its command opens it (a window of the app's own, which Back to Drafter closes). */
function openHelp(id: string) {
  void commandById(id)?.run();
}
</script>

<template>
  <dialog
    ref="dialog"
    class="about"
    aria-labelledby="about-title"
    aria-describedby="about-what"
    data-about
    @close="onClose"
  >
    <template v-if="info">
      <h2 id="about-title">Drafter</h2>
      <p class="version" data-about-version>{{ versionLine(info) }}</p>
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
      <div class="copy">
        <button type="button" class="btn" @click="copy">Copy version info</button>
        <span role="status" aria-live="polite" class="copied">{{ copied }}</span>
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
      <div class="buttons">
        <button type="button" class="btn primary" autofocus @click="dialog?.close()">Close</button>
      </div>
    </template>
  </dialog>
</template>

<style scoped>
.about {
  box-sizing: border-box;
  width: min(30rem, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
  font-size: 13px;
}
h2 {
  margin: 0;
  font-size: 18px;
}
h3 {
  margin: 14px 0 4px;
  font-size: 13px;
}
p {
  margin: 0 0 8px;
}
.version {
  color: var(--heading);
  font-weight: 600;
}
#about-what {
  color: var(--muted);
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
.links a:focus-visible,
.btn:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
.buttons {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.btn {
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--chrome);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.btn.primary {
  border-color: var(--heading);
}
</style>
