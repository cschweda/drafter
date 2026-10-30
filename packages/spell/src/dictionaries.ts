// The dictionaries Drafter bundles (Phase 2 design §12; Plan D, Call 2): US and British English,
// each a Hunspell `index.aff` and `index.dic` that the app serves as static files from `folder`
// (apps/web/scripts/sync-assets.mjs copies them from the packages), with its licence served
// verbatim at `licenceFile`. A downloadable language pack (Phase 4) will take this same shape.

export type SpellLanguage = 'en-US' | 'en-GB';

export interface DictionaryInfo {
  language: SpellLanguage;
  /** What Settings calls it. */
  label: string;
  /** The npm package the files come from. */
  package: string;
  /** Its exact version, pinned in package.json and recorded in docs/DEPENDENCIES.md. */
  version: string;
  /** Its declared licence (SPDX). */
  licence: string;
  /** The app's folder for it, holding `index.aff` and `index.dic`. */
  folder: string;
  /** Its licence file, as the package ships it. */
  licenceFile: string;
}

export const DICTIONARIES: Readonly<Record<SpellLanguage, DictionaryInfo>> = {
  'en-US': {
    language: 'en-US',
    label: 'US English',
    package: 'dictionary-en',
    version: '4.0.0',
    licence: '(MIT AND BSD)',
    folder: '/dictionaries/en-US/',
    licenceFile: '/licenses/dictionary-en.txt',
  },
  'en-GB': {
    language: 'en-GB',
    label: 'British English',
    package: 'dictionary-en-gb',
    version: '3.0.0',
    licence: '(MIT AND BSD)',
    folder: '/dictionaries/en-GB/',
    licenceFile: '/licenses/dictionary-en-gb.txt',
  },
};

/** Every bundled language, the default (US English) first. */
export const SPELL_LANGUAGES: readonly SpellLanguage[] = ['en-US', 'en-GB'];
