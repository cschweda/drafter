// Every dependency of every package in the repository has its row in docs/DEPENDENCIES.md (the
// clean-room and dependency rules: nothing is installed without one). Kept with the desktop app,
// which added the most recent ones (electron, electron-builder, electron-updater).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const KINDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

function manifests(): string[] {
  const found = [join(ROOT, 'package.json')];
  for (const group of ['apps', 'packages']) {
    for (const name of readdirSync(join(ROOT, group))) {
      const file = join(ROOT, group, name, 'package.json');
      if (existsSync(file)) found.push(file);
    }
  }
  return found;
}

test('every dependency in every package.json has a row in docs/DEPENDENCIES.md', () => {
  const doc = readFileSync(join(ROOT, 'docs', 'DEPENDENCIES.md'), 'utf8');
  // A row names packages in backticks in its first cell (the dependency tables), or in its second
  // (the package table's "Depends on", with the reason beside it).
  const named = new Set(
    doc
      .split('\n')
      .filter((line) => line.startsWith('| '))
      .flatMap((line) =>
        [
          ...line
            .split('|')
            .slice(1, 3)
            .join('|')
            .matchAll(/`([^`]+)`/g),
        ].map((m) => m[1]),
      ),
  );
  const missing: string[] = [];
  let count = 0;
  for (const file of manifests()) {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    for (const kind of KINDS) {
      for (const name of Object.keys(json[kind] ?? {})) {
        if (name.startsWith('@drafter/')) continue;
        count++;
        if (!named.has(name)) {
          missing.push(`${name} (${kind} of ${file.slice(ROOT.length)})`);
        }
      }
    }
  }
  expect(count).toBeGreaterThan(20);
  expect(missing).toEqual([]);
});

test('the desktop app’s rows are complete, not placeholders', () => {
  const doc = readFileSync(join(ROOT, 'docs', 'DEPENDENCIES.md'), 'utf8');
  for (const name of ['electron', 'electron-builder', 'electron-updater']) {
    const row = doc.split('\n').find((line) => line.startsWith(`| \`${name}\``)) ?? '';
    expect(row, name).not.toMatch(/completed when it is added|\bTODO\b|\bTBD\b/);
    expect(row.length, name).toBeGreaterThan(300);
  }
  const hunspell = doc.split('\n').find((line) => line.includes('Hunspell dictionary')) ?? '';
  expect(hunspell).toContain('SCOWL');
  expect(hunspell).toContain('README_en_US.txt');
});
