<script setup lang="ts">
import { HELP_PAGES } from '~/commands/data';

// The Self-hosting help page: running the web app from your own computer or server with Docker.

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-self-hosting');
if (!page) throw new Error('The Self-hosting page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'Run Drafter’s web app from your own computer or server with Docker: setting it up, updating it, and reaching it from other devices.',
});
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      You can run Drafter’s web app from your own computer or server, so nothing loads from
      drafter.dev at all.
    </p>
    <p>
      Most people don’t need this. Your scripts already stay in your browser at drafter.dev, and the
      <a href="/docs/download/">desktop app</a> is the simplest private choice. Self-hosting is for
      people who want the browser version on their own terms. It serves the same app, with the same
      security rules, and it has no analytics.
    </p>

    <h2 id="running-it">Running it</h2>
    <p>
      You need <a href="https://docs.docker.com/get-started/get-docker/">Docker</a> and a copy of
      <a href="https://github.com/cschweda/drafter">Drafter’s code</a>. In the code’s folder, run:
    </p>
    <DocsCopy label="the start command" text="docker compose up -d" />
    <p>
      The first run builds the app, which takes a few minutes. Then open
      <a href="http://localhost:8080">http://localhost:8080</a>.
    </p>
    <p>To stop it, run:</p>
    <DocsCopy label="the stop command" text="docker compose down" />

    <h2 id="what-it-holds">What it holds</h2>
    <p>
      The container is a small web server handing the app’s files to your browser. It has no
      database and keeps no scripts: your work stays in your browser and in the files you choose, as
      it does on drafter.dev. Stopping or deleting the container loses nothing you’ve written. A
      browser keeps work separately for each address, though, so scripts kept in the browser at
      drafter.dev don’t appear at localhost. Save them to files and open them there.
    </p>

    <h2 id="updating">Updating</h2>
    <p>Nothing updates by itself. To move to a newer version, get the latest code, then run:</p>
    <DocsCopy label="the update command" text="docker compose up -d --build" />

    <h2 id="other-devices">Reaching it from other devices</h2>
    <p>
      It listens only on the computer it runs on. To reach it from another device, put your own
      HTTPS proxy in front of port 8080. Use HTTPS: browsers give Drafter its offline mode, its
      install button, and saving in place only on <code>localhost</code> or HTTPS. Drafter has no
      sign-in, so anyone who can reach the address can use the app, though they’d see only what’s in
      their own browser.
    </p>
  </article>
</template>
