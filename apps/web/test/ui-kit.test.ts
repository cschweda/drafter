import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// One button system, one menu style, and one dialog (fresh-look design §5, Task 7): the shared
// components, read as written, and every dialog built on DDialog.

const read = (path: string) =>
  readFileSync(new URL(`../app/${path}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const styleOf = (vue: string) => vue.slice(vue.indexOf('<style'));
const templateOf = (vue: string) =>
  vue.slice(vue.indexOf('<template>'), vue.lastIndexOf('</template>'));

const DIALOGS = [
  'AboutDialog',
  'BothChangedDialog',
  'ExportOptionsDialog',
  'HistoryDialog',
  'MarkdownDialog',
  'ModuleConfirmDialog',
  'MoveToDialog',
  'NewNoteDialog',
  'NoteCategoryDialog',
  'NoteFiltersDialog',
  'RemoveDialog',
  'SameTitleDialog',
  'SceneDetailsDialog',
  'SceneHistoryDialog',
  'SettingsDialog',
  'SnapshotLabelDialog',
  'TreatmentDialog',
  'UpdateCheckDialog',
];
/** Components that hold a question of their own in a dialog. */
const HOLDERS = ['ModulesSettings', 'NotesPane', 'ScriptsMenu'];

describe('DDialog', () => {
  const vue = read('components/ui/DDialog.vue');
  const style = styleOf(vue);

  test('is a native modal dialog', () => {
    expect(templateOf(vue)).toMatch(/<dialog\b/);
    expect(vue).toMatch(/\.showModal\(\)/);
  });

  test('draws the one dialog style from the tokens', () => {
    expect(style).toMatch(/background: var\(--raised\);/);
    expect(style).toMatch(/border-radius: var\(--r-lg\);/);
    expect(style).toMatch(/padding: 24px;/);
    expect(style.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
  });

  test('has three widths: 440, 560, and 760', () => {
    for (const [size, px] of [
      ['sm', 440],
      ['md', 560],
      ['lg', 760],
    ] as const)
      expect(style, size).toMatch(
        new RegExp(`\\.d-dialog--${size} \\{[^}]*width: min\\(${px}px, calc\\(100vw - 32px\\)\\)`),
      );
  });

  test('titles are 18/600', () => {
    expect(style).toMatch(/\.d-dialog-title \{[^}]*font-size: 18px;[^}]*font-weight: 600;/);
  });

  test('has a real backdrop, darker in the dark theme', () => {
    expect(style).toMatch(/::backdrop \{[^}]*background: rgb\(0 0 0 \/ 0\.5\)/);
    expect(style).toMatch(/\.light [^{]*::backdrop \{[^}]*background: rgb\(0 0 0 \/ 0\.25\)/);
  });

  test('fades in as it rises, and not with reduced motion', () => {
    expect(style).toMatch(/animation: motion-in var\(--dur\) var\(--ease\)/);
    const reduced = style.slice(style.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/animation: none;/);
  });

  test('gives focus back to what had it', () => {
    expect(vue).toMatch(/opener/);
    expect(vue).toMatch(/\.focus\(/);
  });
});

describe('every dialog', () => {
  test.each([...DIALOGS, ...HOLDERS])('%s uses DDialog, and no dialog of its own', (name) => {
    const vue = read(`components/${name}.vue`);
    expect(templateOf(vue)).toMatch(/<DDialog\b/);
    expect(templateOf(vue)).not.toMatch(/<dialog\b/);
  });

  test.each(DIALOGS)('%s has no colour but the tokens, and no look of its own', (name) => {
    const style = styleOf(read(`components/${name}.vue`));
    expect(style.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
    expect(style.match(/var\(--(chrome|chrome-2|line|heading|tab-on)\)/g) ?? []).toEqual([]);
    // The look (surface, radius, backdrop) is DDialog's.
    expect(style).not.toMatch(/::backdrop/);
    expect(style).not.toMatch(/border-radius: 8px/);
  });

  test.each(DIALOGS)('%s titles itself with the dialog title', (name) => {
    expect(templateOf(read(`components/${name}.vue`))).toMatch(/class="[^"]*\bd-dialog-title\b/);
  });
});

describe('DButton', () => {
  const vue = read('components/ui/DButton.vue');
  const style = styleOf(vue);

  test('has four variants', () => {
    expect(vue).toMatch(/'primary' \| 'secondary' \| 'borderless' \| 'icon'/);
  });

  test('primary is the accent fill with --on-accent text', () => {
    expect(style).toMatch(
      /\.d-btn--primary \{[^}]*background: var\(--accent\);[^}]*color: var\(--on-accent\);/,
    );
    expect(style).toMatch(/\.d-btn--primary:hover[^{]*\{[^}]*background: var\(--accent-hover\);/);
  });

  test('secondary is a fill a step up from the dialog (--overlay), with no border; borderless is clear, filled on hover', () => {
    expect(style).toMatch(/\.d-btn--secondary \{[^}]*background: var\(--overlay\);/);
    expect(style).toMatch(/\.d-btn--borderless \{[^}]*background: transparent;/);
    expect(style).toMatch(
      /\.d-btn--(borderless|icon)[^{]*:hover[^{]*\{[^}]*background: var\(--(raised|overlay)\);/,
    );
  });

  test('an icon button is borderless and 30 by 30', () => {
    expect(style).toMatch(/\.d-btn--icon \{[^}]*width: 30px;[^}]*height: 30px;/);
  });

  test('has no colour but the tokens', () => {
    expect(style.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
  });
});

describe('DSegmented', () => {
  const vue = read('components/ui/DSegmented.vue');

  test('is a group of pressed-or-not buttons, one pressed', () => {
    expect(templateOf(vue)).toMatch(/role="group"/);
    expect(templateOf(vue)).toMatch(/:aria-pressed=/);
  });

  test('the chosen one is told apart by more than colour', () => {
    const style = styleOf(vue);
    expect(style).toMatch(/\[aria-pressed='true'\][^{]*\{[^}]*font-weight: 600;/);
    expect(style.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
  });
});

describe('menus', () => {
  const css = read('assets/css/menus.css');

  test('every menu is drawn by MenuButton with the menu style', () => {
    expect(read('components/MenuButton.vue')).toMatch(/d-menu/);
  });

  test('the menu style: --overlay, radius 8, a hairline, 6px padding, 30px rows', () => {
    expect(css).toMatch(/\.d-menu \{[^}]*background: var\(--overlay\);/);
    expect(css).toMatch(/\.d-menu \{[^}]*border-radius: var\(--r\);/);
    expect(css).toMatch(/\.d-menu \{[^}]*border: 1px solid var\(--border\);/);
    expect(css).toMatch(/\.d-menu \{[^}]*padding: 6px;/);
    expect(css).toMatch(/min-height: 30px;/);
  });

  test('a highlighted row is --highlight, and all its text is --text', () => {
    expect(css).toMatch(/\[data-highlighted\][^{]*\{[^}]*background: var\(--highlight\);/);
    // Its description, shortcut, and icon too: --muted on a tint can fall under 4.5:1.
    expect(css).toMatch(
      /\[data-highlighted\][^{]*:is\([^)]*\[data-slot=["']itemDescription["']\][^)]*\)\s*\{[^}]*color: var\(--text\);/,
    );
  });

  test('the palette and the Counts panel are drawn the same way', () => {
    expect(css).toMatch(/\.palette-modal/);
    const counts = styleOf(read('components/CountsPanel.vue'));
    expect(counts).toMatch(/background: var\(--overlay\);/);
    expect(counts).toMatch(/border-radius: var\(--r\);/);
  });

  test('menus move in with the one motion, and not with reduced motion', () => {
    expect(css).toMatch(/animation: motion-in var\(--dur\) var\(--ease\)/);
    expect(css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))).toMatch(
      /animation: none/,
    );
  });

  test('main.css takes in the menus', () => {
    expect(read('assets/css/main.css')).toMatch(/@import "\.\/menus\.css";/);
  });
});
