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

  test('the page under an open dialog does not scroll', () => {
    // The document is a pixel taller than the window (Task 7 review measured 721 in 720), so a
    // wheel over the backdrop would move the page behind it.
    expect(read('assets/css/main.css')).toMatch(/html:has\(dialog:modal\) \{\s*overflow: hidden;/);
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

  test('a row the keyboard reaches has the bar and the tint, not the focus ring as well', () => {
    expect(css).toMatch(
      /\.d-menu \[role=["']menuitem["']\]:focus-visible[^{]*\{[^}]*outline: none;/,
    );
    expect(css).toMatch(
      /\.palette \[role=["']option["']\]:focus-visible[^{]*\{[^}]*outline: none;/,
    );
  });

  test('main.css takes in the menus', () => {
    expect(read('assets/css/main.css')).toMatch(/@import "\.\/menus\.css";/);
  });
});

// The one motion keeps nothing when it ends (Task 7 review): `both` would leave a transform behind,
// which makes the element the containing block of anything fixed inside it (a dialog's row menu).
describe('the one motion', () => {
  test.each([
    'assets/css/main.css',
    'assets/css/menus.css',
    'assets/css/tour.css',
    'components/ui/DDialog.vue',
  ])('%s fills backwards, never both', (path) => {
    const css = read(path);
    expect(css).not.toMatch(/animation: motion-in [^;]*\bboth\b/);
    expect(css).toMatch(/animation: motion-in var\(--dur\) var\(--ease\) backwards;/);
  });
});

// A destructive confirm (Task 7 review, the controller's ruling) is still the primary button, in
// the danger tone, so it doesn't look like an everyday OK; Cancel keeps the first focus.
describe('destructive confirms', () => {
  test('DButton has a danger modifier for the primary button, from the danger tokens', () => {
    const vue = read('components/ui/DButton.vue');
    expect(vue).toMatch(/danger\?: boolean/);
    const style = styleOf(vue);
    expect(style).toMatch(
      /\.d-btn--primary\.d-btn--danger \{[^}]*background: var\(--danger\);[^}]*color: var\(--on-danger\);/,
    );
    expect(style).toMatch(
      /\.d-btn--primary\.d-btn--danger:hover[^{]*\{[^}]*background: var\(--danger-fill-hover\);/,
    );
  });

  test.each([
    ['SameTitleDialog', 'Replace that script'],
    ['ScriptsMenu', 'Remove'],
    ['RemoveDialog', 'Remove'],
    ['HistoryDialog', 'Delete'],
    ['MarkdownDialog', 'Make it Markdown'],
  ])('%s: "%s" is a danger button, and Cancel has the first focus', (name, label) => {
    const template = templateOf(read(`components/${name}.vue`));
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(template).toMatch(
      new RegExp(
        `<DButton[^>]*variant="primary"[^>]*\\bdanger\\b[^>]*>\\s*${escaped}\\s*</DButton>`,
      ),
    );
    expect(template).toMatch(/<DButton[^>]*\bautofocus\b[^>]*>\s*Cancel\s*<\/DButton>/);
  });
});

// The Scripts and Export popovers are drawn as the menus are (Task 7 review).
describe('the popovers', () => {
  test.each(['ScriptsMenu', 'ExportMenu'])('%s is drawn in the menu style', (name) => {
    const style = styleOf(read(`components/${name}.vue`));
    expect(style).toMatch(/\.panel \{[^}]*background: var\(--overlay\);/);
    expect(style).toMatch(/\.panel \{[^}]*border: 1px solid var\(--border\);/);
    expect(style).toMatch(/\.panel \{[^}]*border-radius: var\(--r\);/);
    expect(style).toMatch(
      /\.panel \{[^}]*animation: motion-in var\(--dur\) var\(--ease\) backwards;/,
    );
    expect(style).toMatch(/\.item \{[^}]*min-height: 30px;/);
    expect(style).toMatch(/\.item:[^{]*focus-visible[^{]*\{[^}]*background: var\(--highlight\);/);
    expect(style).toMatch(/box-shadow: inset 3px 0 0 var\(--focus\);/);
    // The popover itself has no old token names (the export toast after it moves in Task 10).
    const popover = style.slice(
      0,
      style.indexOf('.toast {') >= 0 ? style.indexOf('.toast {') : undefined,
    );
    expect(popover.match(/var\(--(chrome|chrome-2|line|heading)\)/g) ?? []).toEqual([]);
    expect(style.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
  });
});

describe('Settings', () => {
  const template = templateOf(read('components/SettingsDialog.vue'));

  test('the current section is aria-current="location"', () => {
    expect(template).toMatch(/:aria-current="current === section\.id \? 'location' : undefined"/);
  });

  test('the Spelling switches are split by key, not by place', () => {
    expect(template).not.toMatch(/switchesIn\('spelling'\)\.slice\(/);
    expect(template).toMatch(/switchesIn\('spelling'\)\.filter\(/);
  });
});

// Task 8: the Stats and Scaffold pages, the empty states, and the one table style.
describe('DInfo', () => {
  const vue = read('components/ui/DInfo.vue');
  test('is a disclosure: a named button that says whether its text is shown, and controls it', () => {
    expect(templateOf(vue)).toMatch(/:aria-label="props\.label"/);
    expect(templateOf(vue)).toMatch(/:aria-expanded="open \? 'true' : 'false'"/);
    expect(templateOf(vue)).toMatch(/:aria-controls="id"/);
    // The text stays in the page after its button, hidden until opened or found by find in page,
    // which opens it (beforematch).
    expect(templateOf(vue)).toMatch(/:hidden="open \? false : 'until-found'"/);
    expect(templateOf(vue)).toMatch(/@beforematch="open = true"/);
  });
  test('hidden until found is not display: none, which find in page could not reach', () => {
    expect(styleOf(vue)).not.toMatch(/\.d-info-panel\[hidden\]\s*\{\s*display: none/);
    expect(styleOf(vue)).toMatch(/\.d-info-panel\[hidden\]:not\(\[hidden='until-found'\]\)/);
  });
  test('Escape closes it and leaves focus on its button', () => {
    expect(vue).toMatch(/event\.key !== 'Escape'/);
    expect(vue).toMatch(/close\(true\)/);
  });
  test('is drawn as a popover from the tokens, with the one motion', () => {
    expect(styleOf(vue)).toMatch(/background: var\(--overlay\)/);
    expect(templateOf(vue)).toMatch(/d-info-panel motion/);
    expect(styleOf(vue).match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
  });
});

describe("Stats' split bars", () => {
  const css = styleOf(read('components/StatsOverview.vue'));
  const rule = (selector: string, within = css) => {
    const at = within.indexOf(`${selector} {`);
    return at < 0 ? '' : within.slice(at, within.indexOf('}', at));
  };
  test('the four tones are a ramp of one colour, darkest first, not hues alone', () => {
    const mixes = [1, 2, 3].map(
      (n) => rule(`.tone-${n}`).match(/var\(--accent-text\) (\d+)%/)?.[1],
    );
    expect(rule('.tone-0')).toMatch(/background-color: var\(--accent-text\)/);
    expect(mixes.map(Number)).toEqual([...mixes.map(Number)].sort((a, b) => b - a));
    expect(mixes.every((m) => m !== undefined)).toBe(true);
  });
  test('alternate tones are striped, a second cue beside the lightness', () => {
    for (const n of [1, 3]) expect(rule(`.tone-${n}`)).toMatch(/repeating-linear-gradient/);
    for (const n of [0, 2]) expect(rule(`.tone-${n}`)).not.toMatch(/gradient/);
  });
  test('in forced colours each tone and its swatch has its own system colour or pattern', () => {
    const forced = css.slice(css.indexOf('@media (forced-colors: active)'));
    expect(forced).toMatch(/forced-color-adjust: none/);
    const fills = [0, 1, 2, 3].map((n) => rule(`.tone-${n}`, forced));
    expect(fills[0]).toMatch(/CanvasText/);
    expect(fills[1]).toMatch(/repeating-linear-gradient/);
    expect(fills[2]).toMatch(/Highlight/);
    expect(fills[3]).toMatch(/Canvas/);
    expect(new Set(fills).size).toBe(4);
  });
});

describe('DEmpty', () => {
  const vue = read('components/ui/DEmpty.vue');
  test('is centred, with a 20px icon in --muted that is only decoration', () => {
    expect(styleOf(vue)).toMatch(/text-align: center/);
    expect(styleOf(vue)).toMatch(/width: 20px;\s*height: 20px;\s*color: var\(--muted\)/);
    expect(templateOf(vue)).toMatch(/aria-hidden="true"/);
  });
  const PANES = ['ProblemsPane', 'CardsPane', 'OutlinePane', 'NotesPane', 'CutsPane', 'DraftsPane'];
  test.each(PANES)('%s draws its empty states with it', (name) => {
    const template = templateOf(read(`components/${name}.vue`));
    expect(template).toMatch(/<DEmpty/);
    expect(template).not.toMatch(/class="empty"/);
  });
});

describe('the table style', () => {
  const css = read('assets/css/tables.css');
  test('36px rows on --surface, hairlines, a sticky header, tabular figures', () => {
    expect(css).toMatch(/height: 36px/);
    expect(css).toMatch(/background: var\(--surface\)/);
    expect(css).toMatch(/border-bottom: 1px solid var\(--border\)/);
    expect(css).toMatch(/position: sticky/);
    expect(css).toMatch(/font-variant-numeric: tabular-nums/);
    expect(css.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
  });
  test('links are underlined on hover only', () => {
    expect(css).toMatch(/\.d-table a \{[^}]*text-decoration: none/);
    expect(css).toMatch(/\.d-table a:hover \{[^}]*text-decoration: underline/);
  });
  test.each(['StatsCharacters', 'ScaffoldTable', 'ScaffoldScene'])('%s uses it', (name) => {
    expect(templateOf(read(`components/${name}.vue`))).toMatch(/class="d-table/);
  });
});
