# Installing Drafter on Windows

Drafter for Windows is an installer, published with each release on GitHub: <https://github.com/cschweda/drafter/releases/latest>. There are two, one for each kind of processor:

| Your PC | The installer |
|---|---|
| Most PCs: 64-bit Intel or AMD | `Drafter-<version>-windows-x64-setup.exe` |
| Windows on Arm: a Snapdragon laptop, or Windows 11 in a virtual machine on an Apple silicon Mac (Parallels, VMware Fusion, UTM) | `Drafter-<version>-windows-arm64-setup.exe` |

Not sure which you have? **Settings → System → About** shows it under *System type*: "x64-based processor" or "ARM-based processor". Windows 10 and 11 are supported.

## Install

1. Download the installer for your PC from the [latest release](https://github.com/cschweda/drafter/releases/latest) (under *Assets*).
2. Open it. Windows may stop it first: see the next section.
3. It installs at once, with no questions and no administrator: Drafter is for you alone, in your own part of the PC. A progress bar shows, and then Drafter starts.

You get **Drafter** in the Start menu and on the desktop, and `.fountain` files open in Drafter with a double-click. Markdown files (`.md`, `.markdown`) keep the app they open in now; Drafter is offered for them under **Open with**.

### "Windows protected your PC"

The installer isn't signed yet (a code-signing certificate costs money every year, and Drafter will get one later), so **Microsoft Defender SmartScreen** may show a blue box saying *"Windows protected your PC"* and *"Microsoft Defender SmartScreen prevented an unrecognized app from starting."*

1. Choose **More info**.
2. Check that *App* is the installer you downloaded (`Drafter-…-setup.exe`) and *Publisher* is *Unknown publisher*.
3. Choose **Run anyway**.

Your browser may ask first as well: Edge can say the file *"isn't commonly downloaded"*. Choose **…** (or **Show more**) → **Keep** → **Keep anyway**.

Only do this with an installer you downloaded from Drafter's own release page, <https://github.com/cschweda/drafter/releases>. If you want to be sure the file is the one the release built, compare its SHA-256 with the one GitHub shows beside the file on the release page, in PowerShell:

```powershell
Get-FileHash .\Downloads\Drafter-<version>-windows-x64-setup.exe
```

## Where everything is

| What | Where |
|---|---|
| Drafter itself | `%LOCALAPPDATA%\Programs\drafter` (for example `C:\Users\you\AppData\Local\Programs\drafter`) |
| Your scripts | Wherever you save them: they are ordinary files, and Drafter doesn't move them |
| Settings, recent scripts, and the recovery copy | `%APPDATA%\Drafter` |
| The modules folder | `%APPDATA%\Drafter\modules` (**Help → Open Modules Folder** opens it) |
| Downloaded updates, before they are installed | `%LOCALAPPDATA%\drafter-updater` |

You can open any of these by pasting it into File Explorer's address bar.

## Using it

Start Drafter from the Start menu, open a `.fountain` file, or drop one on its window. The menu bar works from the keyboard: **Alt** with the underlined letter opens a menu (**Alt+F** for File), and **Alt** or **F10** alone puts the focus on the bar. Save writes back to the file you opened, keeping its line endings (a file with Windows line endings keeps them). **File → Quit** (**Ctrl+Q**), or closing the window, asks about unsaved changes first.

From a terminal, `"%LOCALAPPDATA%\Programs\drafter\Drafter.exe" "My Script.fountain"` opens a script; if Drafter is already open, the script opens in it.

## Updating

A few seconds after it starts, Drafter checks GitHub once for a new version. If there is one, it downloads the installer for your PC's processor in the background, then says *"A new version of Drafter is ready"* with **Restart** and **Later**. It never installs or restarts by itself. **Restart** asks about unsaved changes first, then closes Drafter, runs the new installer (a progress bar shows for a few seconds), and starts the new version. You can turn **Check for updates** off in Settings, and then Drafter makes no network request at all. You can also update by hand at any time: download the new installer and run it over the old one.

### What an update is checked for

Before it is installed, the downloaded installer must match the release: its size and **SHA-512 checksum** must be those in the release's own `latest.yml`, which Drafter reads from GitHub over HTTPS, as it downloads the installer. A file damaged or changed on the way, or one that isn't the release's, is refused and nothing is offered.

What isn't checked yet is a **signature**. Drafter's installers aren't signed, so there is no publisher whose signature an update could be required to carry. That is the same trust as downloading the installer yourself from the release page: both rely on GitHub and on Drafter's GitHub account. Neither would catch someone who took over that account and published a release of their own, since `latest.yml` would come from the same place.

The planned fix is signing (Azure Trusted Signing, or a code-signing certificate). Once the installers are signed, each build records the publisher's name (`publisherName` in the app's `resources\app-update.yml`), and Drafter will then refuse any update not signed by that publisher. The release workflow already fails a signed build that doesn't record it. Signing will also quiet SmartScreen.

## Uninstall

**Settings → Apps → Installed apps** (Windows 11) or **Apps & features** (Windows 10) → **Drafter** → **Uninstall**. It removes Drafter, its shortcuts, and its file types. It leaves your scripts, and `%APPDATA%\Drafter` (your settings, recovery copy, and modules), in case you install it again; delete that folder yourself to remove them too.

## The modules folder

A script module from the folder is code nobody at Drafter has reviewed, so Drafter makes sure no one else on the PC could have changed it. On Linux and macOS it checks each file's owner and permissions. Windows has no such permissions to check, so Drafter relies on the protection Windows gives your own profile folder (`C:\Users\you`): only you, Windows itself, and the PC's administrators can change what is in it. So:

- Keep modules in `%APPDATA%\Drafter\modules` itself. A modules folder that is a link (a junction) to a folder somewhere else is skipped, and so is a module with a link out of its own folder.
- Don't share the modules folder, or give other accounts on the PC access to it.
- Administrators can change anything on the PC, and so can any program you run; that holds on every system.

## If something goes wrong

- **The installer does nothing, or Drafter won't start:** check the processor (above). The Arm installer won't run on an x64 PC; the x64 one runs on Windows 11 on Arm only emulated, and slower, so use the Arm one there.
- **An update fails partway:** run the latest installer from the [release page](https://github.com/cschweda/drafter/releases/latest) by hand. Your scripts and `%APPDATA%\Drafter` aren't affected.
- **Drafter says it is "about to start without Chromium's sandbox":** something started it with `--no-sandbox` or `ELECTRON_DISABLE_SANDBOX`. Start it from the Start menu instead.
- Anything else: [open an issue](https://github.com/cschweda/drafter/issues).
