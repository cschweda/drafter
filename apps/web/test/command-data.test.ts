import { describe, expect, test } from 'vitest';
import { COMMAND_DATA, HELP_PAGES, helpCommandTitle, helpHref } from '../app/commands/data';
import { formatKeys } from '../app/commands/keys';
import { shortcutGroups } from '../app/commands/shortcuts';
import { EXPORTS, exportApplies } from '../app/storage/export';

// The commands' data (id, title, group, keys) is apart from what they run, so the Keyboard shortcuts
// page, which is prerendered and has no editor, can list them (Phase 1 design §5.4).

describe('the command data', () => {
  test('has each command once, with a title and one of the five groups', () => {
    const ids = COMMAND_DATA.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of COMMAND_DATA) {
      expect(c.title.trim(), c.id).not.toBe('');
      expect(['File', 'Edit', 'View', 'Go', 'Help'], c.id).toContain(c.group);
    }
  });

  test('Deleted scenes is in File, after History, and found by "show all versions"', () => {
    const ids = COMMAND_DATA.map((c) => c.id);
    expect(ids.indexOf('deleted-scenes')).toBe(ids.indexOf('history') + 1);
    const deleted = COMMAND_DATA.find((c) => c.id === 'deleted-scenes');
    expect(deleted).toMatchObject({ title: 'Deleted scenes', group: 'File' });
    expect(deleted?.keywords).toEqual(expect.arrayContaining(['show all versions', 'versions']));
  });

  test('has no key twice, and no key it cannot format', () => {
    const keys = COMMAND_DATA.flatMap((c) => (c.keys ? [c.keys.toLowerCase()] : []));
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(formatKeys(k, false)).not.toBe('');
  });

  test('export-md is enabled for every kind', () => {
    // One command for both kinds (Call 24), keeping its id and title: a script's whole text as
    // Markdown, a Markdown document's own text. builtin.ts enables it by `exportApplies`.
    expect(COMMAND_DATA.find((c) => c.id === 'export-md')).toMatchObject({
      title: 'Export as Markdown file',
      group: 'File',
    });
    for (const kind of ['fountain', 'markdown'] as const) {
      expect(exportApplies('md', kind), kind).toBe(true);
    }
    // A script's list: PDF, HTML, plain text, Final Draft, then Markdown, beside the treatment.
    expect(EXPORTS.fountain).toEqual(['pdf', 'html', 'epub', 'txt', 'fdx', 'md']);
    expect(EXPORTS.markdown).toEqual(['pdf', 'html', 'epub', 'md', 'txt']);
  });

  test('export-epub follows export-html, in File, and applies to every kind', () => {
    const ids = COMMAND_DATA.map((c) => c.id);
    expect(ids.indexOf('export-epub')).toBe(ids.indexOf('export-html') + 1);
    const command = COMMAND_DATA.find((c) => c.id === 'export-epub');
    expect(command).toMatchObject({ title: 'Export as EPUB', group: 'File' });
    // Found by what it is for, without naming any one device.
    expect(command?.keywords).toEqual(expect.arrayContaining(['e-book', 'ebook', 'e-reader']));
    for (const kind of ['fountain', 'markdown'] as const) {
      expect(exportApplies('epub', kind), kind).toBe(true);
    }
  });

  test('export-html follows export-md, in File, and applies to every kind', () => {
    const ids = COMMAND_DATA.map((c) => c.id);
    expect(ids.indexOf('export-html')).toBe(ids.indexOf('export-md') + 1);
    expect(COMMAND_DATA.find((c) => c.id === 'export-html')).toMatchObject({
      title: 'Export as HTML',
      group: 'File',
    });
    for (const kind of ['fountain', 'markdown'] as const) {
      expect(exportApplies('html', kind), kind).toBe(true);
    }
  });

  test('gives each global command a key', () => {
    for (const c of COMMAND_DATA.filter((c) => c.global)) expect(c.keys, c.id).toBeTruthy();
  });

  test('has the six help pages, in the Help group', () => {
    expect(HELP_PAGES.map((p) => p.path)).toEqual([
      '/docs/fountain',
      '/docs/saving',
      '/docs/shortcuts',
      '/docs/privacy',
      '/docs/licences',
      '/docs/technical',
    ]);
    for (const page of HELP_PAGES) {
      const command = COMMAND_DATA.find((c) => c.id === page.id);
      expect(command?.group, page.id).toBe('Help');
      expect(command?.title).toBe(`Open the page: ${page.title}`);
      expect(command?.title).toBe(helpCommandTitle(page));
    }
  });

  test('has About Drafter, Check for updates, and a sample script of each kind in Help', () => {
    const help = COMMAND_DATA.filter((c) => c.group === 'Help').map((c) => [c.id, c.title]);
    expect(help).toEqual(
      expect.arrayContaining([
        ['about-drafter', 'About Drafter'],
        ['check-for-updates', 'Check for updates…'],
        ['sample-script-screenplay', 'Sample script: Screenplay'],
        ['sample-script-stage-play', 'Sample script: Stage play'],
        ['sample-script-markdown', 'Sample script: Markdown'],
      ]),
    );
  });

  test('has New guided screenplay and New guided stage play in File, after the New items, with no key', () => {
    const ids = COMMAND_DATA.map((c) => c.id);
    const guided = ['new-guided-screenplay', 'new-guided-stage-play'];
    expect(ids.slice(ids.indexOf('new-markdown') + 1, ids.indexOf('new-markdown') + 3)).toEqual(
      guided,
    );
    expect(COMMAND_DATA.filter((c) => guided.includes(c.id))).toEqual([
      { id: 'new-guided-screenplay', title: 'New guided screenplay', group: 'File' },
      { id: 'new-guided-stage-play', title: 'New guided stage play', group: 'File' },
    ]);
  });

  test('Open as screenplay… is a File command after Open', () => {
    const ids = COMMAND_DATA.map((c) => c.id);
    expect(ids.indexOf('open-as-screenplay')).toBe(ids.indexOf('open') + 1);
    // No key of its own: Open's picker, then a .md comes in as a screenplay.
    expect(COMMAND_DATA.find((c) => c.id === 'open-as-screenplay')).toEqual({
      id: 'open-as-screenplay',
      title: 'Open as screenplay…',
      group: 'File',
    });
  });

  test('links each page at its directory, where a static host serves it', () => {
    expect(HELP_PAGES.map(helpHref)).toEqual([
      '/docs/fountain/',
      '/docs/saving/',
      '/docs/shortcuts/',
      '/docs/privacy/',
      '/docs/licences/',
      '/docs/technical/',
    ]);
  });
});

describe('the shortcuts, grouped', () => {
  const groups = shortcutGroups(COMMAND_DATA);
  const rows = groups.flatMap((g) => g.keyed);

  test('lists every command once, in its group, in the order the palette uses', () => {
    const titles = groups.flatMap((g) => [...g.keyed.map((r) => r.title), ...g.unkeyed]);
    expect(titles.sort()).toEqual(COMMAND_DATA.map((c) => c.title).sort());
    expect(groups.map((g) => g.group)).toEqual(['File', 'Edit', 'View', 'Go', 'Help']);
  });

  test('shows each key in both notations', () => {
    const save = rows.find((r) => r.title === 'Save');
    expect(save).toMatchObject({ mac: '⌘S', other: 'Ctrl+S' });
    const dual = rows.find((r) => r.title === 'Dual dialogue');
    expect(dual).toMatchObject({ mac: '⌘⇧D', other: 'Ctrl+Shift+D' });
    expect(rows.find((r) => r.title === 'Toggle focus mode')).toMatchObject({
      mac: '⌘⇧Enter',
      other: 'Ctrl+Shift+Enter',
    });
  });

  test('puts a command with no key in its group’s list of those without one', () => {
    const file = groups.find((g) => g.group === 'File');
    expect(file?.unkeyed).toContain('Export as PDF');
    expect(file?.keyed.map((r) => r.title)).not.toContain('Export as PDF');
  });
});
