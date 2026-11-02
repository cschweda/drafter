// scripts/notices.mjs: which third-party code is in the bundle, and its licences. Anything it
// doesn't know stops the build rather than leaving a licence out.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain script, with no types of its own.
import { inlinedIn, noticeBlock, thirdParty } from '../scripts/notices.mjs';
import { put, tempFolder } from './temp';

/** A package installed as pnpm installs one, with a module of its own; returns the module's path. */
function installed(
  root: string,
  name: string,
  files: Record<string, string>,
  module = 'index.js',
): string {
  const dir = join(
    root,
    'node_modules',
    '.pnpm',
    `${name.replace('/', '+')}@1.0.0`,
    'node_modules',
    name,
  );
  put(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', license: 'MIT' }));
  for (const [file, text] of Object.entries(files)) put(join(dir, file), text);
  return put(join(dir, module), files[module] ?? 'export {};\n');
}

describe('the third-party licences', () => {
  it('finds the packages the SDK carries inline, scoped or not, with or without peers', () => {
    const code = [
      '//#region ../../node_modules/.pnpm/ajv@8.18.0/node_modules/ajv/dist/core.js',
      '//#region ../../node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.18.0/node_modules/ajv-formats/dist/index.js',
      '//#region ../../node_modules/.pnpm/@cfworker+json-schema@4.1.1/node_modules/@cfworker/json-schema/dist/esm/validate.js',
      '//#region src/own.ts',
    ].join('\n');
    expect([...inlinedIn(code)].sort()).toEqual([
      '@cfworker/json-schema@4.1.1',
      'ajv-formats@3.0.1',
      'ajv@8.18.0',
    ]);
  });

  it('reads each package’s own licence, and leaves out Drafter’s own code', () => {
    const root = tempFolder();
    const module = installed(root, 'left-pad', { LICENSE: 'MIT License\n\nCopyright (c) Someone' });
    const own = put(join(root, 'packages', 'fountain', 'src', 'index.ts'), 'export {};\n');
    const found = thirdParty(['\0rolldown/runtime.js', own, module]);
    expect(found).toEqual([
      {
        name: 'left-pad',
        version: '1.0.0',
        license: 'MIT',
        text: 'MIT License\n\nCopyright (c) Someone',
      },
    ]);
    const block = noticeBlock(found);
    expect(block).toMatch(/^ \* Third-party licences$/m);
    expect(block).toMatch(/^ \* left-pad 1\.0\.0 \(MIT\)$/m);
    expect(block).toMatch(/^ \* Copyright \(c\) Someone$/m);
  });

  it('a licence’s own */ can’t end the comment early', () => {
    const block = noticeBlock([{ name: 'x', version: '1.0.0', license: 'MIT', text: 'a */ b' }]);
    expect(block.match(/\*\//g)).toHaveLength(1);
  });

  it('stops at a package with no licence file, or with a NOTICE file', () => {
    const root = tempFolder();
    expect(() => thirdParty([installed(root, 'bare', {})])).toThrow(/bare@1\.0\.0 has no licence/);
    const noticed = installed(root, 'noticed', { LICENSE: 'Apache', NOTICE: 'Pass this on' });
    expect(() => thirdParty([noticed])).toThrow(/noticed@1\.0\.0 has a NOTICE file/);
  });

  it('stops at code the SDK carries inline whose licence isn’t kept', () => {
    const root = tempFolder();
    const sdk = installed(
      root,
      '@modelcontextprotocol/server',
      {
        LICENSE: 'Apache',
        'dist/index.mjs':
          '//#region ../../node_modules/.pnpm/mystery@2.0.0/node_modules/mystery/index.js\n',
      },
      'dist/index.mjs',
    );
    expect(() => thirdParty([sdk])).toThrow(/carries mystery@2\.0\.0 inline/);
  });
});
