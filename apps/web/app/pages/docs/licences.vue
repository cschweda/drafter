<script setup lang="ts">
import { DICTIONARIES, SPELL_LANGUAGES } from '@drafter/spell';
import { HELP_PAGES } from '~/commands/data';

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-licences');
if (!page) throw new Error('The Third-party licences page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'The other people’s work inside Drafter: the spellchecker, its English dictionaries, and the fonts, each with its version, its licence, and the licence’s full text.',
});

// The versions docs/DEPENDENCIES.md records, pinned in packages/spell/package.json; the
// dictionaries' come from DICTIONARIES. e2e/docs.spec.ts checks these against what is installed.
const NSPELL_VERSION = '2.1.5';
const IS_BUFFER_VERSION = '2.0.5';

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
        The script’s typeface, on screen and in a PDF. Under the SIL Open Font License, Version 1.1.
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
        The typeface of Drafter’s menus, buttons, and these pages. Under the SIL Open Font License,
        Version 1.1, the same licence as Courier Prime’s, whose full text is linked above.
      </p>
      <p>Copyright 2022 The Inter Project Authors</p>
      <p>
        Terms: the same as Courier Prime’s: use, embed, and share it freely; it may not be sold by
        itself, and a changed version must take another name.
        <a href="/fonts/inter-tight/OFL.txt">Inter Tight’s licence (full text)</a>
      </p>
    </section>
  </article>
</template>
