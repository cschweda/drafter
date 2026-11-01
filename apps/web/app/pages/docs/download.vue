<script setup lang="ts">
import {
  CHANGELOG_URL,
  downloadUrl,
  LATEST_RELEASE_URL,
  PLATFORMS,
  type Platform,
  platformFor,
  RELEASES_URL,
  withVersion,
} from '~/about/downloads';
import { buildInfo } from '~/about/info';
import { DOWNLOAD_PAGE } from '~/commands/data';

definePageMeta({ layout: 'docs' });

useDocsHead({
  ...DOWNLOAD_PAGE,
  description:
    'Download Drafter for Windows and Linux: free, with no account and no serial number. Or write at drafter.dev with nothing to install.',
});

// The version this site was built from, which the desktop builds of the same release carry. The
// links are made here, at build time, so nothing is fetched when the page loads.
const version = buildInfo().version;

// The visitor's own system, highlighted once the page runs. Every platform stays on the page, and
// the highlight changes only colors, so nothing moves.
const yours = ref<Platform['id'] | null>(null);
onMounted(() => {
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  yours.value = platformFor({ hint: data?.platform, userAgent: navigator.userAgent });
});
</script>

<template>
  <article>
    <h1>{{ DOWNLOAD_PAGE.title }}</h1>
    <p class="docs-lead">
      The desktop app is free, with no account and no serial number. Or skip the download and write
      at <a href="/">drafter.dev</a>, with nothing to install.
    </p>
    <p>
      <template v-if="version">These links are for Drafter {{ version }}. </template>
      A new release’s files can take about 20 minutes to appear after the site updates; if a link
      doesn’t work yet, the
      <a :href="LATEST_RELEASE_URL" target="_blank" rel="noopener noreferrer">latest release</a>
      has every file.
    </p>

    <section
      v-for="platform in PLATFORMS"
      :key="platform.id"
      class="download-platform"
      :data-platform="platform.id"
      :data-yours="yours === platform.id ? 'true' : undefined"
      :aria-labelledby="`download-${platform.id}`"
    >
      <h2 :id="`download-${platform.id}`">
        {{ platform.name }}<span v-if="yours === platform.id" class="sr-only"> (your system)</span>
      </h2>

      <template v-if="platform.available && version">
        <ul class="download-files">
          <li v-for="file in platform.files" :key="file.asset">
            <a class="download-button" :href="downloadUrl(file, version)">{{ file.label }}</a>
            <span class="download-detail">
              {{ file.detail }}: <code>{{ withVersion(file.asset, version) }}</code>, version
              {{ version }}
            </span>
            <span v-if="file.command" class="download-detail">
              Then: <code>{{ withVersion(file.command, version) }}</code>
            </span>
          </li>
        </ul>
        <p class="download-latest">
          Or get it from the
          <a :href="LATEST_RELEASE_URL" target="_blank" rel="noopener noreferrer">latest release</a>,
          under <em>Assets</em>.
        </p>
      </template>
      <p v-else-if="platform.available">
        Get it from the
        <a :href="LATEST_RELEASE_URL" target="_blank" rel="noopener noreferrer">latest release</a>,
        under <em>Assets</em>.
      </p>

      <template v-if="platform.id === 'windows'">
        <p>
          Open the installer and it installs at once, for you alone and with no administrator, with
          Drafter in the Start menu and <code>.fountain</code> files opening in it with a
          double-click.
        </p>
        <p>
          <strong>Windows on Arm:</strong> there’s no Arm installer yet. On Windows 11 on Arm (a
          Snapdragon laptop, or Windows 11 in a virtual machine on an Apple silicon Mac), the x64
          installer runs under Windows’ built-in emulation, a little slower than a native app would.
          Windows 10 on Arm can’t run it. <strong>Settings → System → About</strong> shows which
          processor you have.
        </p>
        <p>
          <strong>“Windows protected your PC”:</strong> the installer isn’t signed yet, so Microsoft
          Defender SmartScreen may stop it. Choose <strong>More info</strong>, check that the app is
          the <code>Drafter-…-setup.exe</code> you downloaded, then choose
          <strong>Run anyway</strong>. Edge may also say the file “isn’t commonly downloaded”: choose
          <strong>…</strong> → <strong>Keep</strong> → <strong>Keep anyway</strong>. Only do this
          with an installer from Drafter’s own release page.
        </p>
      </template>

      <template v-else-if="platform.id === 'linux'">
        <p>
          Use the <code>.deb</code> on Ubuntu 24.04 and later: the AppImage needs FUSE 2
          (<code>libfuse2</code>), and on those versions an AppArmor profile for Chromium’s sandbox.
          After installing the <code>.deb</code>, start Drafter from your applications, or with
          <code>drafterdev</code> in a terminal.
        </p>
      </template>

      <template v-else-if="platform.id === 'mac' && !platform.available">
        <p><strong>Coming: a signed Mac download.</strong></p>
        <p>
          A Mac app from the internet has to be signed and notarized with an Apple developer account,
          which Drafter doesn’t have yet. Until then, the same desktop app builds on your own Mac with
          one command, and opens there without any warning. With Node 22.13 or later, pnpm 10
          (<code>corepack enable</code>), and <code>git</code>, in Terminal:
        </p>
        <ol>
          <li><code>git clone https://github.com/cschweda/drafter.git</code></li>
          <li><code>cd drafter</code></li>
          <li><code>pnpm install</code></li>
          <li><code>pnpm desktop:mac</code></li>
        </ol>
        <p>
          Then drag <code>apps/desktop/release/mac-arm64/Drafter.app</code> (on an Intel Mac,
          <code>apps/desktop/release/mac/Drafter.app</code>) to <strong>Applications</strong>. To
          update, run <code>git pull</code>, <code>pnpm install</code>, and
          <code>pnpm desktop:mac</code> again.
        </p>
        <p>
          Or skip the build: open <a href="/">drafter.dev</a> in Chrome or Edge and install it as an
          app, with the install button in the address bar. It sits in your Dock, works offline, and
          saves straight back to your files.
        </p>
      </template>
    </section>

    <h2 id="updates">Updates</h2>
    <p>
      A few seconds after it starts, the desktop app asks GitHub once whether there’s a new version.
      It never installs or restarts by itself: it says a new version is ready, or available, and
      waits for you. Turn off <strong>Check for updates</strong> in Settings and it makes no network
      request at all, unless you choose <strong>Help → Check for updates…</strong>. See
      <a href="/docs/privacy/#updates">Privacy</a>.
    </p>

    <h2 id="releases">Every release</h2>
    <ul>
      <li>
        <a :href="RELEASES_URL" target="_blank" rel="noopener noreferrer">All releases on GitHub</a>,
        each with its files and their checksums.
      </li>
      <li>
        <a :href="CHANGELOG_URL" target="_blank" rel="noopener noreferrer">The changelog</a>: what
        changed in each version.
      </li>
    </ul>
  </article>
</template>

<style scoped>
.download-platform {
  margin: 24px 0 0;
  padding: 0 16px 4px;
  border: 2px solid var(--border);
  border-radius: var(--r);
}
/* The visitor's system: the same border, in the accent color, so nothing moves. */
.download-platform[data-yours="true"] {
  border-color: var(--accent-text);
}
.download-platform h2 {
  margin-top: 16px;
}
.download-files {
  padding-left: 0;
  list-style: none;
}
.download-files li {
  margin-bottom: 12px;
}
.download-button {
  display: inline-block;
  margin-bottom: 4px;
  padding: 8px 14px;
  border: 1px solid var(--accent-text);
  border-radius: var(--r-sm);
  font-weight: 600;
}
.download-detail {
  display: block;
  color: var(--muted);
  font-size: 0.95rem;
}
.download-detail code {
  overflow-wrap: anywhere;
}
</style>
