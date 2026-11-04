import { describe, expect, test } from 'vitest';
import {
  COMMAND_DATA,
  HELP_PAGES,
  helpCommandTitle,
  helpHref,
  modeSwitchApplies,
} from '../app/commands/data';
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

  test('Cuts is in File, after History, and found by "deleted scenes" and "show all versions"', () => {
    const ids = COMMAND_DATA.map((c) => c.id);
    expect(ids).not.toContain('deleted-scenes');
    expect(ids.indexOf('cuts')).toBe(ids.indexOf('history') + 1);
    const cuts = COMMAND_DATA.find((c) => c.id === 'cuts');
    expect(cuts).toMatchObject({ title: 'Cuts…', group: 'File' });
    expect(cuts?.keywords).toEqual(
      expect.arrayContaining(['deleted scenes', 'show all versions', 'versions', 'cuts']),
    );
  });

  test('has Show Scaffold after Show stats, found by its words, and Scaffold for this scene in Go', () => {
    // Seeing-the-script design §5.6, §9: no new keys (as in v0.18.0); the palette finds it by
    // "cast", "characters", "who is in this scene", and "locations".
    const ids = COMMAND_DATA.map((c) => c.id);
    expect(ids.indexOf('show-scaffold')).toBe(ids.indexOf('show-stats') + 1);
    const show = COMMAND_DATA.find((c) => c.id === 'show-scaffold');
    expect(show).toMatchObject({ title: 'Show Scaffold', group: 'View' });
    expect(show?.keys).toBeUndefined();
    expect(show?.keywords).toEqual(['cast', 'characters', 'who is in this scene', 'locations']);
    const scene = COMMAND_DATA.find((c) => c.id === 'scaffold-scene');
    expect(scene).toMatchObject({ title: 'Scaffold for this scene', group: 'Go' });
    expect(scene?.keys).toBeUndefined();
    // The name is Scaffold, never another product's word for it.
    expect(JSON.stringify(COMMAND_DATA)).not.toMatch(/x-?ray/i);
  });

  test('has Show the cast and Show the places in View, after Show Scaffold, with no keys', () => {
    // Seeing-the-script design §5.5, §9.
    const ids = COMMAND_DATA.map((c) => c.id);
    expect(ids.indexOf('scaffold-cast')).toBe(ids.indexOf('show-scaffold') + 1);
    expect(ids.indexOf('scaffold-places')).toBe(ids.indexOf('show-scaffold') + 2);
    const cast = COMMAND_DATA.find((c) => c.id === 'scaffold-cast');
    const places = COMMAND_DATA.find((c) => c.id === 'scaffold-places');
    expect(cast).toMatchObject({ title: 'Show the cast', group: 'View' });
    expect(places).toMatchObject({ title: 'Show the places', group: 'View' });
    expect(cast?.keys).toBeUndefined();
    expect(places?.keys).toBeUndefined();
  });

  describe('the writing mode', () => {
    const command = (id: string) => COMMAND_DATA.find((c) => c.id === id);

    test('Mod-Alt-0 is free, and is the switch’s', () => {
      expect(COMMAND_DATA.filter((c) => c.keys === 'Mod-Alt-0').map((c) => c.id)).toEqual([
        'switch-writing-mode',
      ]);
      expect(command('switch-writing-mode')).toMatchObject({
        title: 'Switch writing mode',
        group: 'View',
        global: true,
      });
    });

    test('all three are found by the words a writer would try', () => {
      expect(command('switch-to-classic')).toMatchObject({
        title: 'Switch to Classic Mode',
        group: 'View',
      });
      expect(command('switch-to-fountain')).toMatchObject({
        title: 'Switch to Fountain Mode',
        group: 'View',
      });
      for (const id of ['switch-to-classic', 'switch-to-fountain', 'switch-writing-mode']) {
        expect(command(id)?.keywords).toEqual(['final draft', 'mode', 'typing']);
      }
    });

    test('the two switches are enabled only when they’d do something', () => {
      expect(modeSwitchApplies('classic', 'fountain', 'fountain')).toBe(true);
      expect(modeSwitchApplies('classic', 'classic', 'fountain')).toBe(false);
      expect(modeSwitchApplies('fountain', 'classic', 'fountain')).toBe(true);
      expect(modeSwitchApplies('fountain', 'fountain', 'fountain')).toBe(false);
      expect(modeSwitchApplies('classic', 'fountain', 'markdown')).toBe(false);
      expect(modeSwitchApplies('fountain', 'classic', 'markdown')).toBe(false);
    });
  });

  test('has no key twice, and no key it cannot format', () => {
    const keys = COMMAND_DATA.flatMap((c) => (c.keys ? [c.keys.toLowerCase()] : []));
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(formatKeys(k, false)).not.toBe('');
  });

  test('a novel’s focus: one key for the passage, one for the whole book, in View after focus mode', () => {
    const at = (id: string) => COMMAND_DATA.findIndex((c) => c.id === id);
    const of = (id: string) => COMMAND_DATA[at(id)];
    expect(of('focus-passage')).toMatchObject({
      title: 'Focus on this passage',
      group: 'View',
      keys: 'Mod-Alt-f',
      global: true,
    });
    expect(of('show-whole-book')).toMatchObject({
      title: 'Show the whole book',
      group: 'View',
      keys: 'Mod-Alt-Shift-f',
      global: true,
    });
    expect(of('focus-chapter')).toMatchObject({ title: 'Focus on this chapter', group: 'View' });
    expect(of('focus-section')).toMatchObject({ title: 'Focus on this section', group: 'View' });
    expect(of('focus-chapter').keys).toBeUndefined();
    expect(of('focus-section').keys).toBeUndefined();
    expect(at('focus-passage')).toBe(at('focus-mode') + 1);
    // The shortcuts page lists the keys in both notations.
    const view = shortcutGroups(COMMAND_DATA).find((g) => g.group === 'View');
    expect(JSON.stringify(view)).toContain('Focus on this passage');
    expect(formatKeys('Mod-Alt-Shift-f', true)).toBe('⌘⌥⇧F');
    expect(formatKeys('Mod-Alt-f', false)).toBe('Ctrl+Alt+F');
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

  test('Export as Story map… follows export-epub, in File, found by what it is for', () => {
    const ids = COMMAND_DATA.map((c) => c.id);
    expect(ids.indexOf('export-story-map')).toBe(ids.indexOf('export-epub') + 1);
    const command = COMMAND_DATA.find((c) => c.id === 'export-story-map');
    expect(command).toMatchObject({ title: 'Export as Story map…', group: 'File' });
    expect(command?.keywords).toEqual(
      expect.arrayContaining(['visual', 'teaser', 'share', "what I'm writing"]),
    );
    // Made after its dialog, so not one of the files the export menus list by kind.
    expect(EXPORTS.fountain).not.toContain('story-map');
    expect(EXPORTS.markdown).not.toContain('story-map');
  });

  test('Use in story map and Never use in story map are Edit commands with no key', () => {
    for (const [id, title] of [
      ['story-map-use-line', 'Use in story map'],
      ['story-map-never-line', 'Never use in story map'],
    ]) {
      const command = COMMAND_DATA.find((c) => c.id === id);
      expect(command, id).toMatchObject({ title, group: 'Edit' });
      expect(command?.keys).toBeUndefined();
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

  test('has the fifteen help pages, in the Help group', () => {
    expect(HELP_PAGES.map((p) => p.path)).toEqual([
      '/docs/what-is-drafter',
      '/docs/why',
      '/docs/fountain',
      '/docs/classic-mode',
      '/docs/saving',
      '/docs/drafts-and-cuts',
      '/docs/story-map',
      '/docs/drafter-for-claude',
      '/docs/self-hosting',
      '/docs/shortcuts',
      '/docs/privacy',
      '/docs/open-formats',
      '/docs/licences',
      '/docs/technical',
      '/docs/whats-new',
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
        ['report-problem', 'Report a problem…'],
        ['suggest-idea', 'Suggest an idea…'],
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
      '/docs/what-is-drafter/',
      '/docs/why/',
      '/docs/fountain/',
      '/docs/classic-mode/',
      '/docs/saving/',
      '/docs/drafts-and-cuts/',
      '/docs/story-map/',
      '/docs/drafter-for-claude/',
      '/docs/self-hosting/',
      '/docs/shortcuts/',
      '/docs/privacy/',
      '/docs/open-formats/',
      '/docs/licences/',
      '/docs/technical/',
      '/docs/whats-new/',
    ]);
  });

  test('opens What is Drafter? and What’s new on the desktop too', () => {
    for (const id of ['help-what-is', 'help-whats-new']) {
      expect(COMMAND_DATA.find((c) => c.id === id)?.webOnly, id).toBeUndefined();
    }
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
