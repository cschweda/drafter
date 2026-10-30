import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { SpellLanguage } from '@drafter/spell';

// The real dictionaries, read in Node from the packages `@drafter/spell` depends on (their
// `exports` hides the files, so each package's folder is found from its `index.js`).
// A path, not a URL: a jsdom test's global URL is jsdom's, which Node's `fileURLToPath` refuses.
const spell = join(import.meta.dirname, '../../../packages/spell/package.json');
const folderOf = (name: string) => dirname(createRequire(spell).resolve(name));
export const FILES: Record<SpellLanguage, { aff: Uint8Array; dic: Uint8Array }> =
  Object.fromEntries(
    (
      [
        ['en-US', 'dictionary-en'],
        ['en-GB', 'dictionary-en-gb'],
      ] as const
    ).map(([language, name]) => [
      language,
      {
        aff: new Uint8Array(readFileSync(join(folderOf(name), 'index.aff'))),
        dic: new Uint8Array(readFileSync(join(folderOf(name), 'index.dic'))),
      },
    ]),
  ) as never;
