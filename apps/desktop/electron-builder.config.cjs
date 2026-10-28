// Packaging for the desktop app (Phase 1 Plan 6, Task 7): `pnpm package` runs electron-builder with
// this file after `pnpm build` (dist/main.cjs, dist/preload.cjs) and `pnpm build:web` (web/).
// Linux first: an AppImage and a .deb, x64. docs/DECISIONS.md (apps/desktop) explains the choices.
// macOS (`pnpm package:mac`, from `pnpm desktop:mac`): Drafter.app built on the writer's own Mac,
// for its own processor, signed ad hoc and published nowhere (docs/desktop-install-macos.md).
// Windows (`pnpm package:win`, on GitHub's Windows runner): an NSIS installer per processor, x64
// and arm64, unsigned for now, with latest.yml for the updater (docs/desktop-install-windows.md).
const path = require('node:path');

/**
 * The script types, for Linux and macOS. electron-builder adds a platform's own `fileAssociations` to
 * the top-level ones, so each platform names its own (Windows has its own list, below).
 */
const SCRIPT_TYPES = [
  {
    ext: 'fountain',
    name: 'Fountain screenplay',
    description: 'Fountain screenplay',
    mimeType: 'text/x-fountain',
    role: 'Editor',
    // macOS: Drafter may be the app that opens these when nothing else claims them.
    rank: 'Default',
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
    // macOS: in Open With, but never the app a Markdown file opens in unless the writer says so.
    rank: 'Alternate',
  },
  {
    ext: 'markdown',
    name: 'Markdown document',
    description: 'Markdown document',
    role: 'Editor',
    rank: 'Alternate',
  },
];

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'dev.drafter.app',
  productName: 'Drafter',
  copyright: 'Copyright © 2026 Christopher Schweda. MIT License.',
  // The packed package.json's name. The workspace calls this package `@drafter/desktop`, which
  // electron-builder would otherwise make into folder names: the Windows install folder
  // (%LOCALAPPDATA%\Programs\@drafterdesktop) and the updater's download cache on every system
  // (@drafterdesktop-updater). The app's own name is set in main.ts (`app.setName('Drafter')`).
  extraMetadata: { name: 'drafter' },
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
  mac: {
    fileAssociations: SCRIPT_TYPES,
    // The Mac it is built on: arm64 on Apple silicon, x64 on Intel. `dir` is Drafter.app itself;
    // the .dmg is the same app with the usual drag-to-Applications window.
    target: [
      { target: 'dir', arch: [process.arch === 'arm64' ? 'arm64' : 'x64'] },
      { target: 'dmg', arch: [process.arch === 'arm64' ? 'arm64' : 'x64'] },
    ],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder's own macros, not a template.
    artifactName: 'Drafter-${version}-mac-${arch}.${ext}',
    icon: path.resolve(__dirname, '../../brand/icon-mac-1024.png'),
    category: 'public.app-category.productivity',
    // No Apple Developer ID yet: signed ad hoc ("-"), which Apple silicon requires of every app
    // and which a Mac runs without asking when the app was built on it (nothing downloaded it, so
    // it carries no quarantine). The hardened runtime is for notarised apps; with an ad-hoc
    // signature it would refuse Electron's own frameworks, so it is off until the app is signed.
    identity: '-',
    hardenedRuntime: false,
    // No notarisation without an Apple account.
    notarize: false,
    extendInfo: {
      // macOS has no type for `.fountain` (it calls such a file "data", so Quick Look shows
      // nothing): this one is plain text. Imported, not exported: should another app declare one
      // of its own, the system prefers that, and Drafter still opens the file by its extension.
      UTImportedTypeDeclarations: [
        {
          UTTypeIdentifier: 'dev.drafter.fountain',
          UTTypeDescription: 'Fountain screenplay',
          UTTypeConformsTo: ['public.plain-text'],
          UTTypeTagSpecification: {
            'public.filename-extension': ['fountain'],
            'public.mime-type': ['text/x-fountain'],
          },
        },
      ],
    },
  },
  dmg: {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder's own macros, not a template.
    artifactName: 'Drafter-${version}-mac-${arch}.${ext}',
  },
  win: {
    // An installer per processor: x64, and arm64 for Windows on Arm (a Snapdragon laptop, or
    // Windows 11 in a VM on an Apple silicon Mac). Built on GitHub's Windows runner
    // (`pnpm package:win`).
    target: [{ target: 'nsis', arch: ['x64', 'arm64'] }],
    // 16 to 256 pixels, from the brand folder (brand/build.mjs). The installer, the uninstaller,
    // Drafter.exe, and its files' icons in Explorer are all this one.
    icon: path.resolve(__dirname, '../../brand/icon-windows.ico'),
    // On Windows the association's name is its ProgID, so it gets one of Drafter's own. Only
    // `.fountain` is taken: Markdown is offered in Open with, never made Drafter's (installer/windows.nsh).
    fileAssociations: [
      { ext: 'fountain', name: 'Drafter.fountain', description: 'Fountain screenplay' },
    ],
    // Unsigned for now (docs/drafter-desktop-design.md §7): SmartScreen warns about the download
    // until there is a certificate (docs/desktop-install-windows.md). With no certificate there is
    // no publisher name in resources/app-update.yml, so electron-updater checks an update's sha512
    // and not its signature (docs/DECISIONS.md, "Updates on Windows"). Once Drafter is signed,
    // electron-builder writes the name and every later update must carry that signature.
  },
  nsis: {
    // One installer per processor, each with its processor in its name: one installer holding both
    // would be twice the download for everyone. latest.yml lists both, and electron-updater picks
    // the one whose name holds the running app's processor (`x64` or `arm64`).
    buildUniversalInstaller: false,
    // The version stays in the name (unlike the AppImage's): an update downloads the new installer
    // to electron-updater's own cache folder and runs it there, so the name the writer downloaded
    // is never replaced in place, and a versioned name says which one it is.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder's own macros, not a template.
    artifactName: 'Drafter-${version}-windows-${arch}-setup.${ext}',
    // A one-click, per-user install: into %LOCALAPPDATA%\Programs\drafter, no administrator, no
    // questions, with a Start menu shortcut, a desktop shortcut, and an uninstaller in Settings →
    // Apps. Updates install the same way, without asking for an administrator either.
    oneClick: true,
    perMachine: false,
    createStartMenuShortcut: true,
    createDesktopShortcut: true,
    shortcutName: 'Drafter',
    // Uninstalling leaves the writer's recovery copies, settings, and modules folder
    // (%APPDATA%\Drafter) where they are, as removing the Linux packages does.
    deleteAppDataOnUninstall: false,
    // No .blockmap to upload: an update downloads the whole installer (the Linux release has three
    // files, and this keeps the Windows half to an installer per processor and latest.yml).
    differentialPackage: false,
    // Only a per-machine install needs elevate.exe, and this one never is.
    packElevateHelper: false,
    // `.md` and `.markdown` in Open with, and a clean uninstall of `.fountain`.
    include: path.resolve(__dirname, 'installer/windows.nsh'),
  },
  linux: {
    fileAssociations: SCRIPT_TYPES,
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
