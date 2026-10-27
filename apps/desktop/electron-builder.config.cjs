// Packaging for the desktop app (Phase 1 Plan 6, Task 7): `pnpm package` runs electron-builder with
// this file after `pnpm build` (dist/main.cjs, dist/preload.cjs) and `pnpm build:web` (web/).
// Linux first: an AppImage and a .deb, x64. docs/DECISIONS.md (apps/desktop) explains the choices.
const path = require('node:path');

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'dev.drafter.app',
  productName: 'Drafter',
  copyright: 'Copyright © 2026 Christopher Schweda. MIT License.',
  // `dist/` is tsdown's (it cleans it), so the packages go elsewhere.
  directories: { output: 'release', buildResources: 'build' },
  // Only what runs: the three bundles, the web build, the spellcheck dictionaries (src/spellcheck.ts
  // reads them from the app's own folder and copies them into the profile), and package.json.
  files: [
    'dist/main.cjs',
    'dist/preload.cjs',
    // The runtime in each folder module's frame (src/module-runtime.ts).
    'dist/module-runtime.js',
    'web/**/*',
    'dictionaries/**/*',
    'package.json',
    '!web/og-image.png',
    '!**/*.map',
  ],
  asar: true,
  // The .deb's name (the AppImage has its own, below). latest-linux.yml names both as they are.
  // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder's own macros, not a template.
  artifactName: 'Drafter-${version}-linux-${arch}.${ext}',
  // Written into the app (resources/app-update.yml) for electron-updater (Task 6), and into
  // latest-linux.yml next to the packages. Nothing is uploaded by electron-builder itself:
  // the workflow publishes with `gh release upload`.
  publish: [{ provider: 'github', owner: 'cschweda', repo: 'drafter', releaseType: 'release' }],
  // Electron's fuses, flipped on the packaged binary (docs/DECISIONS.md): the app is not a Node
  // runtime, takes no Node switches from its environment or command line, and loads only its asar.
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    loadBrowserProcessSpecificV8Snapshot: false,
    grantFileProtocolExtraPrivileges: false,
  },
  fileAssociations: [
    {
      ext: 'fountain',
      name: 'Fountain screenplay',
      description: 'Fountain screenplay',
      mimeType: 'text/x-fountain',
      role: 'Editor',
    },
    // One extension per entry: electron-builder writes an `ext` list into the .deb's MIME file as a
    // single glob (`*.md,markdown`), which matches nothing. `.markdown` carries no MIME type of its
    // own (the system's shared-mime-info already gives `*.markdown` text/markdown), so the desktop
    // entry lists text/markdown once.
    {
      ext: 'md',
      name: 'Markdown document',
      description: 'Markdown document',
      mimeType: 'text/markdown',
      role: 'Editor',
    },
    {
      ext: 'markdown',
      name: 'Markdown document',
      description: 'Markdown document',
      role: 'Editor',
    },
  ],
  linux: {
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] },
    ],
    // after drafter.dev; the CLI already owns `drafter`.
    executableName: 'drafterdev',
    category: 'Office;TextEditor;',
    // One icon, 512 x 512, from the brand folder; the packagers place it in the icon theme.
    icon: path.resolve(__dirname, '../../brand/icon-512.png'),
    maintainer: 'Christopher Schweda <cschweda@gmail.com>',
    synopsis: 'Write screenplays and stage plays in plain text',
    description:
      'Drafter is a screenplay and stage-play editor for the Fountain format. ' +
      'Your scripts stay in plain-text files on your computer.',
    // The desktop file is drafter.desktop (package.json `desktopName`), matching the window class.
    syncDesktopName: true,
    // StartupWMClass etc. come from electron-builder. No `--no-sandbox` anywhere (see below).
    desktop: { entry: { Keywords: 'screenplay;fountain;writing;script;' } },
  },
  appImage: {
    // One name for every version (Drafter-x86_64.AppImage), and latest-linux.yml names it so.
    // electron-updater's Restart deletes the running AppImage and moves the download to the same
    // path when the old name holds no version; with a version in it, the new one would land under
    // a new name and launchers, AppImage integrations, and an AppArmor profile for the old path
    // would point at a deleted file. Each release is its own set of assets, so names don't collide.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder's own macros, not a template.
    artifactName: '${productName}-${arch}.${ext}',
    // electron-builder's default adds `--no-sandbox` to the desktop entry's Exec line. Drafter
    // runs with Chromium's sandbox or not at all, so the entry passes nothing.
    executableArgs: [],
  },
  deb: {
    // `drafterdev`, like the command: `drafter` is the CLI's. The dependencies are
    // electron-builder's defaults, which it keeps current for the Electron it packs. The .deb also
    // installs an AppArmor profile (electron-builder's own, `userns` for /opt/Drafter/drafterdev)
    // so the sandbox works on Ubuntu 24.04 and later.
    packageName: 'drafterdev',
    // The desktop entry's Exec ends in %F, so a file manager passes the files' paths (the app opens
    // paths; it also accepts local file:// URIs, for the AppImage's entry, whose `AppRun %U`
    // electron-builder writes itself). Without this electron-builder appends %U.
    executableArgs: ['%F'],
  },
};
