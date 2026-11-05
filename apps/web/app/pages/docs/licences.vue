<script setup lang="ts">
import { DICTIONARIES, SPELL_LANGUAGES } from '@drafter/spell';
import { HELP_PAGES } from '~/commands/data';

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-licences');
if (!page) throw new Error('The Third-party licences page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'The other people’s work inside Drafter: the spellchecker, its dictionaries, the fonts, and Drafter for Claude’s SDK, each with its version, its licence, and its full text.',
});

// The versions docs/DEPENDENCIES.md records, pinned in packages/spell/package.json; the
// dictionaries' come from DICTIONARIES. e2e/docs.spec.ts checks these against what is installed.
const NSPELL_VERSION = '2.1.5';
const IS_BUFFER_VERSION = '2.0.5';
// Drafter for Claude's, pinned in packages/mcp/package.json (the same check).
const MCP_SDK_VERSION = '2.3.1';
const ZOD_VERSION = '4.6.7';

const dictionaries = SPELL_LANGUAGES.map((language) => DICTIONARIES[language]);
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      Drafter is free and open source, under the MIT License. It includes a few pieces of other
      people’s work, each under its own licence. Here is each one, with its copyright and its
      terms; each licence’s full text is linked, exactly as it came.
    </p>

    <h2 id="spellcheck">Spellcheck</h2>

    <section>
      <h3>nspell</h3>
      <p>
        The spellchecker: it reads a Hunspell dictionary and checks words and suggests corrections.
        Version {{ NSPELL_VERSION }}, under the MIT License.
      </p>
      <p>Copyright (c) 2016 Titus Wormer</p>
      <p>
        Terms: use, copy, change, and share it freely, keeping its copyright and licence with it.
        <a href="/licenses/nspell.txt">nspell’s licence (full text)</a>
      </p>
    </section>

    <section>
      <h3>is-buffer</h3>
      <p>
        A small helper nspell uses. Version {{ IS_BUFFER_VERSION }}, under the MIT License.
      </p>
      <p>Copyright (c) Feross Aboukhadijeh</p>
      <p>
        Terms: use, copy, change, and share it freely, keeping its copyright and licence with it.
        <a href="/licenses/is-buffer.txt">is-buffer’s licence (full text)</a>
      </p>
    </section>

    <section v-for="dictionary in dictionaries" :key="dictionary.language">
      <h3>{{ dictionary.package }}</h3>
      <p>
        The {{ dictionary.label }} dictionary, a Hunspell dictionary made from SCOWL (Spell Checker
        Oriented Word Lists). Version {{ dictionary.version }}, licensed {{ dictionary.licence }}.
      </p>
      <ul>
        <li>SCOWL: Copyright 2000-2018 by Kevin Atkinson</li>
        <li>The affix file, from Ispell: Copyright 1993, Geoff Kuenning, Granada Hills, CA</li>
        <li>
          The UK Advanced Cryptics Dictionary (UKACD):
          <strong>Copyright (c) J Ross Beresford 1993-1999. All Rights Reserved.</strong>
        </li>
        <li>WordNet: WordNet 1.6 Copyright 1997 by Princeton University. All rights reserved.</li>
        <li>VarCon: Copyright 2000-2016 by Kevin Atkinson; Copyright 2016 by Benjamin Titze</li>
      </ul>
      <p>
        Terms: use, copy, change, share, and sell the word lists, keeping their copyright and
        permission notices with them; the affix file is under Geoff Kuenning’s BSD licence, and the
        UKACD asks that its copyright be shown and its notice included word for word, which the
        linked file is.
        <a :href="dictionary.licenceFile">{{ dictionary.package }}’s licence (full text)</a>
      </p>
    </section>

    <h2 id="fonts">Fonts</h2>

    <section>
      <h3>Courier Prime</h3>
      <p>
        The script’s typeface, on screen and in a PDF, the code in a Markdown document’s PDF, and the labels and lines of dialogue in a story map.
        Under the SIL Open Font License, Version 1.1.
      </p>
      <p>Copyright 2015 The Courier Prime Project Authors</p>
      <p>
        Terms: use, embed, and share it freely; it may not be sold by itself, and a changed version
        must take another name.
        <a href="/fonts/courier-prime/OFL.txt">Courier Prime’s licence (full text)</a>
      </p>
    </section>

    <section>
      <h3>Inter Tight</h3>
      <p>
        The interface’s typeface, and the text of a Markdown document’s PDF. Under the SIL Open
        Font License, Version 1.1, the same licence as Courier Prime’s.
      </p>
      <p>Copyright 2022 The Inter Project Authors</p>
      <p>
        Terms: the same as Courier Prime’s: use, embed, and share it freely; it may not be sold by
        itself, and a changed version must take another name.
        <a href="/fonts/inter-tight/OFL.txt">Inter Tight’s licence (full text)</a>
      </p>
    </section>

    <section>
      <h3>Liberation Serif</h3>
      <p>
        The Times-style typeface of a novel’s manuscript PDF. Under the SIL Open Font License,
        Version 1.1, the same licence as Courier Prime’s.
      </p>
      <p>
        Digitized data copyright (c) 2010 Google Corporation, with Reserved Font Arimo, Tinos and
        Cousine. Copyright (c) 2012 Red Hat, Inc., with Reserved Font Name Liberation.
      </p>
      <p>
        Terms: the same as Courier Prime’s: use, embed, and share it freely; it may not be sold by
        itself, and a changed version must take another name.
        <a href="/fonts/liberation-serif/OFL.txt">Liberation Serif’s licence (full text)</a>
      </p>
    </section>

    <section>
      <h3>Anton</h3>
      <p>
        The big type of a story map: its title, headings, and numbers. Under the SIL Open Font
        License, Version 1.1, the same licence as Courier Prime’s.
      </p>
      <p>Copyright 2020 The Anton Project Authors</p>
      <p>
        Terms: the same as Courier Prime’s: use, embed, and share it freely; it may not be sold by
        itself, and a changed version must take another name.
        <a href="/fonts/anton/OFL.txt">Anton’s licence (full text)</a>
      </p>
    </section>

    <section>
      <h3>Archivo</h3>
      <p>
        The text of a story map. Under the SIL Open Font License, Version 1.1, the same licence as
        Courier Prime’s.
      </p>
      <p>Copyright 2020 The Archivo Project Authors</p>
      <p>
        Terms: the same as Courier Prime’s: use, embed, and share it freely; it may not be sold by
        itself, and a changed version must take another name.
        <a href="/fonts/archivo/OFL.txt">Archivo’s licence (full text)</a>
      </p>
    </section>

    <h2 id="drafter-for-claude">Inside Drafter for Claude only</h2>
    <p>
      <a href="/docs/drafter-for-claude/">Drafter for Claude</a> is a separate program, one file,
      with these inside it. They are not in the app or the website. The file ends with the full
      licence of every package it carries, these two and the small JSON Schema helpers the SDK
      carries in its own files (Ajv, ajv-formats, content-type, fast-deep-equal, fast-uri, and
      json-schema-traverse, under the MIT and BSD-3-Clause licences).
    </p>

    <section>
      <h3>@modelcontextprotocol/server</h3>
      <p>
        The official MCP SDK’s server, with <code>@modelcontextprotocol/core</code>, which it is
        built on: it lets Drafter for Claude talk to an AI app on your computer, using the Model
        Context Protocol. Versions {{ MCP_SDK_VERSION }}, under the Apache License 2.0.
      </p>
      <p>Copyright (c) 2024-2025 Model Context Protocol a Series of LF Projects, LLC.</p>
      <p>
        Terms: use, copy, change, and share it freely, keeping its copyright, licence, and notices
        with it, and saying what was changed in a changed copy. Some of its earlier code is still
        under the MIT License, as its licence explains.
        <a href="/licenses/modelcontextprotocol-server.txt"
          >@modelcontextprotocol/server’s licence (full text)</a
        >
      </p>
    </section>

    <section>
      <h3>zod</h3>
      <p>
        Checks every request Drafter for Claude gets before it is read. Version {{ ZOD_VERSION }},
        under the MIT License.
      </p>
      <p>Copyright (c) 2025 Colin McDonnell</p>
      <p>
        Terms: use, copy, change, and share it freely, keeping its copyright and licence with it.
        <a href="/licenses/zod.txt">zod’s licence (full text)</a>
      </p>
    </section>
  </article>
</template>
