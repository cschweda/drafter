// Every way a file comes into Drafter, as the trap documents name them. Each trap lists the entry
// points it must be run through; each harness runs the entry points it owns.

export type Entry =
  | 'web-open'
  | 'desktop-open'
  | 'cli-convert'
  | 'cli-build'
  | 'package'
  | 'desktop-modules'
  | 'beside-read'
  | 'mcp'
  | 'classic'
  | 'novel'
  | 'manuscript'
  | 'production';

export interface EntryPoint {
  id: Entry;
  /** What comes in this way, in the app's own terms. */
  what: string;
  /** The code a trap goes through. */
  code: string;
  /** The harness that runs it. */
  harness: string;
}

export const ENTRY_POINTS: readonly EntryPoint[] = [
  {
    id: 'web-open',
    what: 'The web app’s Open: the picker (File System Access API), the file input where there is none, a file dropped on the window, Open as screenplay…, and a file read again from its handle. Every one hands a `PickedFile` to `openFile`, which sends it on to the Fountain or Markdown text check, an import (Final Draft, Highland, Fade In), or a reopen (HTML, EPUB).',
    code: 'apps/web/app/storage/files.ts (`browserFiles.fromDrop`, `pickedFrom`, its 32 MB check before reading) → apps/web/app/storage/open.ts (`openFile`)',
    harness: 'apps/web/test/trap-open.test.ts (jsdom), apps/web/e2e/trap.spec.ts (real browsers)',
  },
  {
    id: 'desktop-open',
    what: 'The desktop app’s files named by the system: the command line, a second launch, macOS’s open-file event, and a dropped file with a path. Each goes through the arguments’ sorting, the grant (a script by where it leads), the main process’s read (a regular file, at most 64 MB), and then the same `openFile` as the web app, through `desktopFiles`. The Open dialog’s choice takes the same read and `openFile`.',
    code: 'apps/desktop/src/open-files.ts (`requestsFromArgs`) → file-handlers.ts (`grantScript`) → files.ts (`readFileAt`) → apps/web/app/storage/desktop-files.ts → open.ts (`openPath`, `openFile`)',
    harness:
      'apps/web/test/trap-open.test.ts (the real code on real temp files), apps/desktop/e2e/trap.spec.ts (Electron)',
  },
  {
    id: 'cli-convert',
    what: '`drafter convert`: Final Draft, Highland, and Fade In files, and Drafter HTML and EPUB exports, to Fountain, with the app’s caps and checks.',
    code: 'packages/cli/src/convert.ts',
    harness:
      'fixtures/trap/harness.test.ts (in process, and the built `drafter` for the special files)',
  },
  {
    id: 'cli-build',
    what: '`drafter build` and `drafter check`: a Fountain file read, parsed, and laid out (and a `--template` JSON file).',
    code: 'packages/cli/src/cli.ts (`load`)',
    harness: 'fixtures/trap/harness.test.ts',
  },
  {
    id: 'package',
    what: 'Each format’s reader on its own, as every entry point above uses it: `parse` (Fountain), `parseMarkdown`, `fromFdx`, `fromHighland`, `fromFadeIn`, `embeddedSource` (HTML and EPUB reopen); and the HTML exports and the story map a hostile script is written into, which must stay inert.',
    code: 'packages/fountain, markdown, fdx, archive, render-html-file, story-map',
    harness: 'fixtures/trap/harness.test.ts',
  },
  {
    id: 'desktop-modules',
    what: 'The desktop app’s modules folder: each `<userData>/modules/<folder>/module.json`, read once at start.',
    code: 'apps/desktop/src/module-folder.ts (`readModulesFolder`)',
    harness: 'fixtures/trap/harness.test.ts',
  },
  {
    id: 'beside-read',
    what: 'Drafts and cuts read back from beside the work when it opens: the cuts file (`Boca.fountain.cuts.md`), its entries checked by their IDs and merged, and draft files (`Boca drafts/Boca – Draft 03.fountain`), their IDs checked against their text. They may have been edited anywhere (another computer, a text editor), so they are untrusted.',
    code: '@drafter/history (`readCutsBytes`, `readDraftBytes`; `readCutsFile`, `verifyCuts`, `mergeCuts`, `readDraftFile`)',
    harness: 'fixtures/trap/harness.test.ts',
  },
  {
    id: 'mcp',
    what: 'Drafter for Claude: each tool’s read of a file in a configured folder, and every path a tool is given.',
    code: 'packages/mcp/src (paths.ts, load.ts, inside.ts, tools/) → @drafter/archive (notAScript, reopenFormatOf, embeddedSource), @drafter/archive/node (readCapped, strictText), and each format’s reader',
    harness:
      'fixtures/trap/harness.test.ts (in the trap worker, through the SDK’s in-memory transport)',
  },
  {
    id: 'novel',
    what: 'A Markdown file read as a novel: its parts, chapters, and sections found (`novelStructure`), the facts kept in its metadata comment read (`readFacts`), and one chapter or section moved. Every Markdown trap that opens goes through it, as the text Open makes and, where it has other line breaks, as the raw text too. The move must keep every non-blank line.',
    code: 'packages/novel/src (`novelStructure`, `readFacts`, `downTarget`/`upTarget`, `moveNode`)',
    harness: 'fixtures/trap/harness.test.ts (in the trap worker)',
  },
  {
    id: 'manuscript',
    what: 'A novel written out as a standard manuscript: the Markdown read as a book (`manuscriptOf`, with the details the writer gave), then both files made from it, the PDF with the real fonts and the Word file. The Word file must be a zip whose every part is well-formed XML, with the page-number field once, in the header, and no other field code; the PDF must open.',
    code: 'packages/novel/src (`manuscriptOf`, `resolveDetails`) → packages/render-pdf/src (`renderManuscriptPdf`) and packages/render-docx/src (`renderManuscriptDocx`)',
    harness: 'fixtures/trap/harness.test.ts (in the trap worker)',
  },
  {
    id: 'production',
    what: 'A script’s production block (locks and revisions) read as the app reads it: `readProduction` on the parsed block, then `decodeBaseline` on the open set’s baseline, capped as it inflates. The file’s bytes are read whole, past Open’s 5 MB check, so the block’s own caps are tried. A hostile block must leave the script unlocked: no lock, no throw, within its time and memory. Only the production traps go through it.',
    code: 'packages/production/src (`readProduction`, `CAPS`, `decodeBaseline`), as apps/web/app/production/use-production.ts uses them',
    harness: 'fixtures/trap/harness.test.ts (in the trap worker)',
  },
  {
    id: 'classic',
    what: 'A hostile script open in Classic Mode: the left pane drawn, the cursor walked through every line, and a mode switched. Every trap that opens as Fountain text goes through it, after the web app’s Open has made it text.',
    code: 'apps/web/app/storage/open.ts (`openFile`) → packages/cm-fountain/src/classic (`classic()`: its hidden marks, `classicCaret`, the metadata block kept, the tidying of a move)',
    harness: 'apps/web/test/trap-classic.test.ts (jsdom, a real `EditorView`)',
  },
];

/**
 * Where files come in that are not an Open: none of them takes a file from outside the app, so no
 * trap goes through them; they are listed so the survey is whole.
 */
export const NOT_ENTRY_POINTS: readonly string[] = [
  'Settings and the desktop app’s own JSON (desktop-settings.json, granted-files.json): written and read only by the app, in its profile folder; a damaged one is read as empty.',
  'Snapshots, scene history, and Restore: kept in the browser’s own database, written only by the app; there is no backup file to import.',
  'The web app’s built-in script modules: compiled into the app at build time, never loaded from a file.',
  'Template JSON for `drafter build --template file.json`: read through the same capped reader as the script (cli-build).',
];
