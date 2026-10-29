# Installing Drafter on Linux

Drafter for Linux comes as an **AppImage** and a **`.deb`**, built for 64-bit Intel and AMD (x64) and published with each release on GitHub: <https://github.com/cschweda/drafter/releases>. The command is `drafterdev`.

Drafter runs its pages in Chromium's **sandbox**, which keeps a page that went wrong away from your files. The sandbox needs the system to let a program make a user namespace. Most systems do. **Ubuntu 24.04 and later restrict that by default** (an AppArmor setting), and that decides which package to use.

## Ubuntu 24.04 and later: the `.deb`

On Ubuntu 24.04 and later, **use the `.deb`**. It works with the sandbox on, with nothing to set up. (The AppImage can use the sandbox there only after you give it an AppArmor profile, below.) Plain Debian and most other distributions don't have this restriction, so either package works on them.

```sh
sudo apt install ./Drafter-<version>-linux-amd64.deb
```

It adds Drafter to your applications (under Office), registers `.fountain`, `.md`, and Final Draft `.fdx` files, and installs an AppArmor profile that lets Drafter, and only Drafter, use the sandbox. Start it from the menu, or with `drafterdev`, or open a file with it.

Drafter only imports a `.fdx` (as a new script you save as a `.fountain`), but where no other app claims `.fdx` files your file manager may open them in Drafter by default; to change that, choose another app in the file's Open With (or Properties) dialog, or run `xdg-mime default other-app.desktop application/x-fdx`.

## Any other distribution: the AppImage

```sh
chmod +x Drafter-x86_64.AppImage
./Drafter-x86_64.AppImage
```

The AppImage has the same name, `Drafter-x86_64.AppImage`, in every release, so an update replaces the file where it is (see Updating, below).

An AppImage needs FUSE 2 (`libfuse2`; on Ubuntu 24.04 the package is `libfuse2t64`). If it won't start, install that.

### If Drafter says it is "about to start without Chromium’s sandbox"

The AppImage's launcher turns the sandbox off when your system doesn't let it make a user namespace, as Ubuntu 24.04 and later don't by default. Drafter doesn't run that way in silence: it tells you, recommends the `.deb`, and asks once. You have these choices:

1. **Install the `.deb`** (above), the best answer on Ubuntu 24.04 and later. Choose **Quit** and install it.
2. **Give this AppImage an AppArmor profile**, which allows user namespaces for programs started from this one file and for nothing else. Use the AppImage's real path:

   ```sh
   sudo tee /etc/apparmor.d/drafter-appimage <<'EOF'
   abi <abi/4.0>,
   include <tunables/global>

   profile drafter-appimage /home/you/Applications/Drafter-x86_64.AppImage flags=(default_allow) {
     userns,
   }
   EOF
   sudo apparmor_parser -r /etc/apparmor.d/drafter-appimage
   ```

   Then start Drafter again: it runs with the sandbox. The profile names one file, so change it if you move or rename the AppImage. Drafter's own updates replace the file at the same path, so the profile keeps working after them. (Drafter's own tests check this on Ubuntu 24.04 with the restriction on.)
3. **Continue without the sandbox**, knowingly: choose **Continue without the sandbox**. Drafter remembers your answer in a file in its settings folder (`~/.config/Drafter/sandbox-continue-…`; the question names the file) and doesn't ask again for the same reason; delete the file to be asked again. To start without being asked at all, set `DRAFTER_ALLOW_NO_SANDBOX=1`:

   ```sh
   DRAFTER_ALLOW_NO_SANDBOX=1 ./Drafter-x86_64.AppImage
   ```

   A page that got past Drafter's other protections could then reach your files. Drafter's own pages come from the app itself and make no network requests of their own, so the risk is small, but it is a risk the first two choices don't take.

Turning the restriction off for the whole system (`kernel.apparmor_restrict_unprivileged_userns=0`) would also work, but it removes a protection for every program on the machine, so Drafter doesn't suggest it.

## Updating

A few seconds after it starts, Drafter checks GitHub once for a new version; it never installs or restarts by itself. The AppImage downloads the new version in the background, then says it's ready with **Restart** and **Later**. Restart asks about unsaved changes first, then replaces the AppImage in place (the same file at the same path, so a launcher, an AppImage tool's menu entry, or the AppArmor profile above still points at it) and starts the new version. The `.deb` can't update itself, so it says a new version is available with **Get it**, which opens the release page in your browser to download the new package. You can turn **Check for updates** off in Settings, and then Drafter makes no network request at all unless you ask: **Help → Check for Updates…** checks at any time, even with that setting off, and says whether you're up to date or offers the new version.

If an AppImage update fails partway through replacing the file (the disk fills, the power goes), the AppImage may be missing or won't start: download `Drafter-x86_64.AppImage` from the [latest release](https://github.com/cschweda/drafter/releases/latest) again and put it where the old one was. Your scripts are files of their own and aren't affected, and Drafter's settings and recovery copy are in `~/.config/Drafter`.

## Saving replaces the file

Drafter writes each save in full to a new file next to yours and then puts it in your file's place, so a crash or a full disk can't leave a script half written. Because the saved script is a new file, a hard link to the old one keeps the old text, and the file's owner and group become yours (its permissions are kept).
