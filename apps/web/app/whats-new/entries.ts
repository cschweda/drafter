// What's new: one plain-language item for writers per change worth telling, newest first. The
// What's new help page lists them all, by release; the writing screen's banner shows the newest one
// marked `banner` (a big change, or a security update) until it is dismissed (`banner.ts`). The
// CHANGELOG has the whole story; these say what a writer notices. Pure data, imported by the page,
// the banner, the browser tests' storage state, and test/whats-new.test.ts (which checks the order,
// the ids, the kinds, and the dates).

export const WHATS_NEW_KINDS = ['New', 'Improved', 'Fixed', 'Security'] as const;
export type WhatsNewKind = (typeof WHATS_NEW_KINDS)[number];

export interface WhatsNewLink {
  /** A help page (`/docs/saving/`) or the release on GitHub. */
  href: string;
  label: string;
}

export interface WhatsNewEntry {
  /** Stable, never reused: the banner remembers a dismissal by it. */
  id: string;
  /** The release's date, `2026-11-01`. */
  date: string;
  /** The release, `0.23.2`. */
  version: string;
  kind: WhatsNewKind;
  /** A short line, which is also the banner's text. */
  title: string;
  /** One or two sentences. */
  text: string;
  link?: WhatsNewLink;
  /** A big change or a security update: the writing screen says so once, until dismissed. */
  banner?: boolean;
}

/** The release's page on GitHub. */
export const releaseUrl = (version: string): string =>
  `https://github.com/cschweda/drafter/releases/tag/v${version}`;

const release = (version: string): WhatsNewLink => ({
  href: releaseUrl(version),
  label: `Drafter ${version} on GitHub`,
});

/** Every item, newest first: by release, and in each release the most important first. */
export const WHATS_NEW: readonly WhatsNewEntry[] = [
  // Unreleased: its version is the next release's, and the release sets its date (a test lets an
  // entry newer than the CHANGELOG's newest release wait for its section).
  {
    id: 'v0.24.2-drafter-for-claude',
    date: '2026-11-02',
    version: '0.24.2',
    kind: 'New',
    title: 'Drafter for Claude: let your AI app read your scripts',
    text: 'Drafter for Claude lets Claude Desktop, Claude Code, or another AI app read the scripts, drafts, and cuts in folders you choose, for storyboards, reader’s notes, and insights across a series. It only reads, and Drafter itself never calls an AI.',
    link: { href: '/docs/drafter-for-claude/', label: 'Drafter for Claude' },
    banner: true,
  },
  {
    id: 'v0.24.2-plausible',
    date: '2026-11-02',
    version: '0.24.2',
    kind: 'New',
    title: 'drafter.dev measures visits with Plausible',
    text: 'The website now counts visits with Plausible, privacy-focused analytics with no cookies and nothing that identifies you; it never sees your script. The downloaded desktop app has no analytics at all.',
    link: { href: '/docs/privacy/#analytics', label: 'Privacy' },
  },
  {
    id: 'v0.24.2-note-click',
    date: '2026-11-02',
    version: '0.24.2',
    kind: 'Improved',
    title: 'A click on a note shows where it is',
    text: 'Clicking a note in the Notes list scrolls the Source to its line and marks it for a moment, with line numbers on or off. Check for updates also shows that it’s working, and says when a new version is downloading.',
  },

  {
    id: 'v0.24.1-story-map',
    date: '2026-11-01',
    version: '0.24.1',
    kind: 'New',
    title: 'Story map: a picture of your script to send to anyone',
    text: 'Export → Story map… makes one page that shows a non-writer your story’s shape, its people, and every scene so far, with a few lines of dialogue. It works on a phone and holds no notes.',
    link: { href: '/docs/story-map/', label: 'Story map' },
    banner: true,
  },

  {
    id: 'v0.24.0-drafts-and-cuts',
    date: '2026-11-01',
    version: '0.24.0',
    kind: 'New',
    title: 'Drafts and Cuts: numbered drafts, and everything you cut, kept for good',
    text: 'Start new draft keeps your script as Draft 01, 02, and so on, and Cuts keeps everything you cut (a whole speech or paragraph, or 12 or more words) for you to browse for ideas, in place of Deleted scenes. In the desktop app, and in Chrome or Edge, both are saved beside your script as well.',
    link: { href: '/docs/drafts-and-cuts/', label: 'Drafts and cuts' },
    banner: true,
  },
  {
    id: 'v0.24.0-cuts-replaces-deleted-scenes',
    date: '2026-11-01',
    version: '0.24.0',
    kind: 'Improved',
    title: 'Cuts replaces Deleted scenes; nothing you cut ages out',
    text: 'Deleted scenes could show a scene only while a snapshot still held it. Cuts keeps every cut with its own text, for good, in Markdown documents too.',
    link: { href: '/docs/drafts-and-cuts/', label: 'Drafts and cuts' },
  },
  {
    id: 'v0.24.0-report-a-problem',
    date: '2026-11-01',
    version: '0.24.0',
    kind: 'New',
    title: 'Report a problem or suggest an idea',
    text: 'Help \u2192 Report a problem\u2026 and Suggest an idea\u2026 fill in a GitHub issue for you to check and submit, with your version info if you like, and never your script. Without a GitHub account, copy it, or email it from your own email app.',
    link: { href: '/docs/#reporting', label: 'Reporting a problem' },
  },
  {
    id: 'v0.23.3-what-is-drafter',
    date: '2026-11-01',
    version: '0.23.3',
    kind: 'New',
    title: 'What is Drafter?, and this page',
    text: 'A new help page says what Drafter is for anyone you show it to: why writers pick it over Final Draft, what producers and directors get, whether you can trust it, and, for technical people, how it works and how many tests it passes. This What\u2019s new page keeps every change, newest first.',
    link: { href: '/docs/what-is-drafter/', label: 'What is Drafter?' },
  },
  {
    id: 'v0.23.2-trap-documents',
    date: '2026-11-01',
    version: '0.23.2',
    kind: 'Security',
    title: 'Drafter is now tested against 244 hostile files',
    text: 'Drafter now runs 244 deliberately broken and hostile files through every way a file comes in, and checks that none of them crashes it, hangs it, runs anything, or fetches anything. What they found is fixed.',
    link: { href: '/docs/what-is-drafter/#trust', label: 'Can I trust Drafter?' },
    banner: true,
  },
  {
    id: 'v0.23.2-security-policy',
    date: '2026-11-01',
    version: '0.23.2',
    kind: 'Security',
    title: 'How Drafter keeps you safe, said plainly',
    text: 'The README and the Technical details page have a Security section, and SECURITY.md says how to report a problem privately.',
    link: { href: '/docs/technical/#security', label: 'Security, in Technical details' },
  },
  {
    id: 'v0.23.1-reopenable-exports',
    date: '2026-11-01',
    version: '0.23.1',
    kind: 'New',
    title: 'Exports Drafter can open again',
    text: 'Turn on Let Drafter reopen this file, and an HTML or EPUB export carries the whole script, so Drafter can open it again exactly as it was. It’s off unless you turn it on.',
    link: { href: '/docs/open-formats/', label: 'Open formats' },
  },
  {
    id: 'v0.23.1-dark-default',
    date: '2026-11-01',
    version: '0.23.1',
    kind: 'Improved',
    title: 'Dark by default',
    text: 'Drafter opens dark on a first visit again, whatever your computer is set to. Pick light with the theme button, or turn on Match system appearance in Settings.',
  },
  {
    id: 'v0.23.0-fresh-look',
    date: '2026-11-01',
    version: '0.23.0',
    kind: 'Improved',
    title: 'A fresh look',
    text: 'The script sits on paper pages, the status bar is quieter, and dialogs, menus, and Settings share one style. On a phone, one pane at a time, with tabs along the bottom.',
    link: release('0.23.0'),
    banner: true,
  },
  {
    id: 'v0.22.2-why-and-download',
    date: '2026-10-31',
    version: '0.22.2',
    kind: 'New',
    title: 'Why Drafter, and a Download page',
    text: 'A Why Drafter page says what Drafter is and how it compares with other screenwriting apps, and a Download page has the Windows and Linux apps.',
    link: { href: '/docs/why/', label: 'Why Drafter' },
  },
  {
    id: 'v0.22.1-reload',
    date: '2026-10-31',
    version: '0.22.1',
    kind: 'Fixed',
    title: 'Reload lands on the new version',
    text: 'Choosing Reload on “A new version of Drafter is ready” now loads the new version, and says so.',
    link: release('0.22.1'),
  },
  {
    id: 'v0.22.0-html-epub',
    date: '2026-10-30',
    version: '0.22.0',
    kind: 'New',
    title: 'Export as a web page or an e-book',
    text: 'A script exports as one web page that opens in any browser with no connection, or as an EPUB for an e-reader or a tablet.',
    link: { href: '/docs/open-formats/', label: 'Open formats' },
  },
  {
    id: 'v0.21.1-desktop-icon',
    date: '2026-10-30',
    version: '0.21.1',
    kind: 'Fixed',
    title: 'Drafter’s own icon on every desktop window',
    text: 'The desktop app’s windows no longer show Electron’s icon on Linux or in Windows’ title bar.',
    link: release('0.21.1'),
  },
  {
    id: 'v0.21.0-scaffold-stats',
    date: '2026-10-30',
    version: '0.21.0',
    kind: 'New',
    title: 'Scaffold, and Stats as a tab',
    text: 'Scaffold shows who is in the scene you’re writing, with a page for every character and place. The Stats tab has each character’s screen time and share of the dialogue, and a grid of who is in every scene.',
    link: { href: '/docs/#stats-and-scaffold', label: 'Stats and Scaffold, in Help' },
  },
  {
    id: 'v0.20.0-convert',
    date: '2026-10-30',
    version: '0.20.0',
    kind: 'New',
    title: 'A whole folder to Fountain at once',
    text: 'The command line’s drafter convert turns Final Draft, Highland, and Fade In files into Fountain, a folder at a time. Markdown documents get footnotes.',
    link: release('0.20.0'),
  },
  {
    id: 'v0.19.1-markdown-lines',
    date: '2026-10-30',
    version: '0.19.1',
    kind: 'Fixed',
    title: 'Two rare Markdown lines export as written',
    text: 'Two unusual lines in a Markdown export now come out as you wrote them, and a heading with a very long run of spaces no longer slows Stats.',
    link: release('0.19.1'),
  },
  {
    id: 'v0.19.0-imports',
    date: '2026-10-30',
    version: '0.19.0',
    kind: 'New',
    title: 'Highland and Fade In files open',
    text: 'Drafter opens Highland and Fade In files as new scripts, exports a script as Markdown, and says plainly what a file is when it isn’t a script.',
    link: release('0.19.0'),
  },
  {
    id: 'v0.18.0-version-history',
    date: '2026-10-30',
    version: '0.18.0',
    kind: 'New',
    title: 'Deleted scenes, and what you changed',
    text: 'Deleted scenes lists the scenes you cut, with Put back. Show changes marks the pages, Compare shows what changed scene by scene, and History of this scene has every version of one scene.',
    link: release('0.18.0'),
  },
  {
    id: 'v0.17.0-out-the-door',
    date: '2026-10-29',
    version: '0.17.0',
    kind: 'New',
    title: 'A guided first screenplay, and running times',
    text: 'A guided first screenplay and stage play teach each element as you read. Export options are kept for each script, and the running time uses your own minutes a page.',
    link: release('0.17.0'),
  },
  {
    id: 'v0.16.0-markdown-pdf',
    date: '2026-10-29',
    version: '0.16.0',
    kind: 'New',
    title: 'Markdown documents as a PDF',
    text: 'Notes, treatments, and outlines export as a clean PDF, offline. Any export that takes a moment shows a progress bar.',
    link: release('0.16.0'),
  },
  {
    id: 'v0.15.1-shooting-scripts',
    date: '2026-10-29',
    version: '0.15.1',
    kind: 'Fixed',
    title: 'Final Draft shooting scripts import cleanly',
    text: 'An omitted scene’s lines come in as notes after its OMITTED heading, hidden text comes in as a note, and All Caps text comes in in capitals.',
    link: release('0.15.1'),
  },
  {
    id: 'v0.15.0-structure-strip',
    date: '2026-10-29',
    version: '0.15.0',
    kind: 'New',
    title: 'The Structure strip',
    text: 'Your whole script at a glance: a band across the top shows your acts and scenes as blocks as wide as their pages. Click one to go there.',
    link: release('0.15.0'),
  },
  {
    id: 'v0.14.0-spellcheck',
    date: '2026-10-29',
    version: '0.14.0',
    kind: 'New',
    title: 'Spellcheck that knows a screenplay',
    text: 'Drafter checks your spelling as you write, in US or British English, offline. Character names, places, and the craft’s own words are never marked.',
    link: release('0.14.0'),
  },
  {
    id: 'v0.13.1-help-menu',
    date: '2026-10-29',
    version: '0.13.1',
    kind: 'Improved',
    title: 'A Help menu, and Final Draft import checked',
    text: 'A Help menu has About Drafter, Sample scripts, and Check for updates. Final Draft import was checked against a real Final Draft 13 sample.',
    link: release('0.13.1'),
  },
  {
    id: 'v0.13.0-history-compare',
    date: '2026-10-29',
    version: '0.13.0',
    kind: 'New',
    title: 'History and Compare',
    text: 'Drafter keeps earlier versions of your script as you work. Restore any one in one undo, or compare two to see what changed.',
    link: release('0.13.0'),
  },
  {
    id: 'v0.12.0-cards-notes',
    date: '2026-10-29',
    version: '0.12.0',
    kind: 'New',
    title: 'Cards and Notes',
    text: 'The Cards tab shows your scenes as index cards to move around. The Notes tab lists every note in the script, filed by who wrote it or what it’s about.',
    link: release('0.12.0'),
  },
  {
    id: 'v0.11.0-final-draft',
    date: '2026-10-29',
    version: '0.11.0',
    kind: 'New',
    title: 'Final Draft files in and out',
    text: 'Open a Final Draft (.fdx) file and it comes in as a new Fountain script, with nothing lost silently. Export as Final Draft for anyone who works in it.',
    link: release('0.11.0'),
  },
  {
    id: 'v0.10.0-outline',
    date: '2026-10-28',
    version: '0.10.0',
    kind: 'New',
    title: 'The Outline',
    text: 'Your sections and scenes as a tree, each with its synopsis, color, and length. Move a scene by dragging it or with the keys, and one undo puts it back.',
    link: release('0.10.0'),
  },
  {
    id: 'v0.9.0-accessibility',
    date: '2026-10-28',
    version: '0.9.0',
    kind: 'Improved',
    title: 'The accessibility pass',
    text: 'Every major state of Drafter is checked with axe in both themes, at desktop and phone width, and what the checks found is fixed. Skip to the editor is the first Tab stop.',
    link: release('0.9.0'),
  },
  {
    id: 'v0.8.0-windows',
    date: '2026-10-28',
    version: '0.8.0',
    kind: 'New',
    title: 'Drafter for Windows',
    text: 'An installer that installs for you alone, with no administrator. A .fountain file opens in Drafter with a double-click.',
    link: { href: '/docs/download/', label: 'Download Drafter' },
  },
  {
    id: 'v0.7.0-mac',
    date: '2026-10-27',
    version: '0.7.0',
    kind: 'New',
    title: 'Drafter on a Mac, built on your own Mac',
    text: 'One command builds the desktop app on a Mac. A signed download comes once Drafter has an Apple developer account.',
    link: { href: '/docs/download/', label: 'Download Drafter' },
  },
  {
    id: 'v0.6.1-modules-agreed',
    date: '2026-10-27',
    version: '0.6.1',
    kind: 'Security',
    title: 'Modules run only as you agreed to them',
    text: 'In the desktop app, any change to a module from the modules folder turns it off until you turn it on again, and a module folder that links somewhere else is skipped.',
    link: release('0.6.1'),
  },
  {
    id: 'v0.6.0-modules-folder',
    date: '2026-10-27',
    version: '0.6.0',
    kind: 'New',
    title: 'Script modules from a folder',
    text: 'The desktop app loads script modules from a folder of its own. Each runs sandboxed, off until you turn it on.',
    link: release('0.6.0'),
  },
  {
    id: 'v0.5.0-element-bar',
    date: '2026-10-27',
    version: '0.5.0',
    kind: 'New',
    title: 'The element bar, and writing stats',
    text: 'The element bar writes Fountain for you and teaches it as you go, with a Fountain cheat sheet in Help. A Stats window has today’s writing and the last 30 days.',
    link: { href: '/docs/fountain/', label: 'Fountain cheat sheet' },
  },
  {
    id: 'v0.4.1-typewriter',
    date: '2026-10-27',
    version: '0.4.1',
    kind: 'Fixed',
    title: 'Typewriter scrolling without the gap',
    text: 'Turning on typewriter scrolling no longer leaves an empty half-pane above the title page.',
    link: release('0.4.1'),
  },
  {
    id: 'v0.4.0-linux',
    date: '2026-10-27',
    version: '0.4.0',
    kind: 'New',
    title: 'Drafter for Linux',
    text: 'The same editor as drafter.dev, as an app you install: real files, a menu bar, and updates that always ask first.',
    link: { href: '/docs/download/', label: 'Download Drafter' },
  },
  {
    id: 'v0.3.1-scroll-sync',
    date: '2026-10-27',
    version: '0.3.1',
    kind: 'Improved',
    title: 'Scroll sync, and samples to start from',
    text: 'The source and the pages stay at the same place as you scroll. Your first stage play or Markdown document starts with a sample, with Start blank.',
    link: release('0.3.1'),
  },
  {
    id: 'v0.3.0-writing-aids',
    date: '2026-10-26',
    version: '0.3.0',
    kind: 'New',
    title: 'Focus mode, goals, sprints, and offline',
    text: 'Focus mode, typewriter scrolling, a daily goal, and sprints. A welcome and a short tour on a first visit, and Drafter works with no connection once it has loaded.',
    link: release('0.3.0'),
  },
  {
    id: 'v0.2.0-full-editor',
    date: '2026-10-26',
    version: '0.2.0',
    kind: 'New',
    title: 'The full editor',
    text: 'The command palette, Settings, the Problems pane, PDF export, stage plays, and Markdown documents.',
    link: release('0.2.0'),
  },
  {
    id: 'v0.1.0-first-release',
    date: '2026-10-26',
    version: '0.1.0',
    kind: 'New',
    title: 'Write at drafter.dev',
    text: 'The first version you can write a script in: the editor, the pages laid out as you type, a recovery copy in your browser, and Save and Open for .fountain files.',
    link: release('0.1.0'),
  },
];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** `2026-11-01` as "1 November 2026", the same on the server and in every browser. */
export function longDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[(month ?? 1) - 1]} ${year}`;
}
