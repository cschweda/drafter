# Building Drafter on your Mac

There is no Drafter download for the Mac yet. A Mac app that comes from the internet has to be signed and notarised with an Apple developer account, and Drafter doesn't have one yet. Until it does, you can **build Drafter on your own Mac with one command**. A Mac opens an app that was built on it without any warning, because nothing downloaded it, so there is nothing for Gatekeeper to check. A signed download, which will also update itself, comes later; this guide will point to it then.

**Don't want to build anything?** Open [drafter.dev](https://drafter.dev) in Chrome or Edge and install it as an app: the install button at the right of the address bar, or the browser menu's **Install Drafter**. You get Drafter in your Dock and in Launchpad, working offline, and saving straight back to your files. What the desktop app adds is a recovery copy that no browser can clear, double-clicking a `.fountain` file to open it, a menu bar, and a modules folder. (Safari can add drafter.dev to the Dock too, with **File → Add to Dock**, but Safari can't save back to a file: Save downloads a copy.)

## What you need

- A Mac with Apple silicon (M1 or later) or an Intel processor, on macOS 13 (Ventura) or later. Drafter is built for the processor of the Mac you build it on.
- Apple's command-line tools, for `git`. If `git --version` asks you to install them, say yes, or run `xcode-select --install`.
- **Node 22.13 or later.** From [nodejs.org](https://nodejs.org) (the LTS installer), with Homebrew (`brew install node@22`), or with nvm (`nvm install 22`; the repository's `.nvmrc` says 22). Check with `node --version`.
- **pnpm 10.** Node comes with Corepack, which provides the exact pnpm the repository asks for: run `corepack enable` once. (Or `npm install -g pnpm@10`.) Check with `pnpm --version`.
- About 2 GB of free space, and an internet connection for the first build (it downloads Drafter's dependencies and Electron for the Mac, together a few hundred megabytes).

## Build it

```sh
git clone https://github.com/cschweda/drafter.git
cd drafter
pnpm install
pnpm desktop:mac
```

The first build takes a few minutes; later ones, about a minute. `pnpm desktop:mac` builds the app's own code, builds drafter.dev's pages for the desktop, and packages them with Electron into `Drafter.app`.

## Where the app is

On a Mac with Apple silicon:

```
apps/desktop/release/mac-arm64/Drafter.app
apps/desktop/release/Drafter-<version>-mac-arm64.dmg
```

On an Intel Mac the folder is `apps/desktop/release/mac/` and the disk image's name ends in `-mac-x64.dmg`.

`open apps/desktop/release` shows the folder in Finder.

## Put it in Applications

Drag **Drafter.app** into your **Applications** folder. (Or double-click the `.dmg` and drag Drafter onto the Applications shortcut in the window that opens; it's the same app.) From the Terminal:

```sh
ditto apps/desktop/release/mac-arm64/Drafter.app /Applications/Drafter.app
```

Then start it from Launchpad, Spotlight, or the Applications folder. It opens without a warning because it was built on this Mac.

The app is for the Mac it was built on. Copied to another Mac (by AirDrop, a download, or a message), it is marked as coming from elsewhere, and macOS will refuse to open it, because no developer signed it. Build it on that Mac too.

## Using it

- **Opening scripts.** Double-click a `.fountain` file: Drafter opens it, unless another app already claims `.fountain` files (then choose **Open With → Drafter**, or **Get Info → Open with → Drafter → Change All…**). For a `.md` or `.markdown` file Drafter is offered under **Open With**; it doesn't take Markdown over from the app that opens it now unless you choose it. You can also drop a script on Drafter's Dock icon, or, in the Terminal, `open -a Drafter "My Script.fountain"`.
- **Closing and quitting.** Closing Drafter's window leaves Drafter running, as Mac apps do; click its Dock icon (or open a script) to get the window back. **Drafter → Quit Drafter** (⌘Q) quits. If the script has changes that aren't in its file, closing the window and quitting both ask first: **Save**, **Don't Save**, or **Cancel**. The recovery copy is kept either way.
- **The menus.** **Drafter** has About, **Settings…** (⌘,), Hide, and Quit; **File** ends with **Close Window** (⌘W); **Window** has Minimize and Zoom. Every other menu item is one of Drafter's commands, with the same keys as in the editor.
- **Where Drafter keeps things.** Your scripts are the files you saved, wherever you saved them. Drafter's settings, recent scripts, and recovery copies are in `~/Library/Application Support/Drafter` (in Finder, **Go → Go to Folder…** and paste that). Script modules go in its `modules` folder: **Help → Open Modules Folder** makes it and shows it. Drafter makes that folder private to you, and skips it, saying how to fix it, if your group can change it: on a Mac every account is in the group `staff`, so a folder `staff` can write isn't yours alone. (`modules/README.md` in the repository says how to write a module.)
- **Spelling** is checked by macOS's own spellchecker, in the languages your Mac is set to.

## Updating

When it starts, Drafter checks GitHub once for a newer version (you can turn **Check for updates** off in Settings, and then it makes no network request at all). When there is one, it says so, with **Get it**, which opens the release page so you can read what changed. Drafter for the Mac can't install the new version itself yet. To update, quit Drafter, then build again in the folder you cloned:

```sh
cd drafter
git pull
pnpm install
pnpm desktop:mac
```

and put the new `Drafter.app` in Applications in place of the old one (Finder asks whether to replace it). Your settings, recent scripts, and recovery copies are in `~/Library/Application Support/Drafter`, not in the app, so they stay.

`git pull` gives you the newest code on `main`, which can be ahead of the newest release. To build exactly a release, check out its tag first, for example `git checkout v0.6.0`, and build; `git checkout main` goes back.

## Removing it

Quit Drafter and move it from Applications to the Trash. To remove its settings and recovery copies as well, delete `~/Library/Application Support/Drafter`. Your scripts are files of their own and aren't touched. The folder you cloned can be deleted too.

## If something goes wrong

- **`pnpm: command not found`.** Run `corepack enable` (once), or `npm install -g pnpm@10`.
- **The build stops while downloading Electron.** Check the connection and run `pnpm desktop:mac` again.
- **macOS says Drafter "is damaged and can't be opened" or "can't be checked".** That copy came to this Mac from somewhere else. Build it on this Mac, as above, and use that one.
- **Drafter says it is "about to start without Chromium’s sandbox".** Something started it with `--no-sandbox` or with `ELECTRON_DISABLE_SANDBOX` set. Start it the usual way instead (from Applications, the Dock, or a file in Finder), and it runs with the sandbox on.
