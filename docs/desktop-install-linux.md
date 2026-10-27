# Installing Drafter on Linux

Drafter for Linux comes as an **AppImage** and a **`.deb`**, built for 64-bit Intel and AMD (x64) and published with each release on GitHub: <https://github.com/cschweda/drafter/releases>. The command is `drafterdev`.

Drafter runs its pages in Chromium's **sandbox**, which keeps a page that went wrong away from your files. The sandbox needs the system to let a program make a user namespace. Most systems do. **Ubuntu 24.04 and later restrict that by default** (an AppArmor setting), and that decides which package to use.

## Ubuntu 24.04 and later: the `.deb` (or allow user namespaces)

On Ubuntu 24.04 and later, use the `.deb`. The AppImage can't use the sandbox there unless you change the system setting below. Plain Debian and most other distributions don't have this restriction, so either package works on them.

```sh
sudo apt install ./Drafter-<version>-linux-amd64.deb
```

It adds Drafter to your applications (under Office), registers `.fountain` and `.md` files, and installs an AppArmor profile that lets Drafter use the sandbox. Nothing else is needed. Start it from the menu, or with `drafterdev`, or open a file with it.

## Any other distribution: the AppImage (or the `.deb` on Debian-based ones)

```sh
chmod +x Drafter-<version>-linux-x86_64.AppImage
./Drafter-<version>-linux-x86_64.AppImage
```

An AppImage needs FUSE 2 (`libfuse2`; on Ubuntu 24.04 the package is `libfuse2t64`). If it won't start, install that.

### If Drafter says it is "about to start without Chromium’s sandbox"

The AppImage's launcher turns the sandbox off when your system doesn't let it make a user namespace. Drafter doesn't run that way in silence: it tells you, recommends the `.deb`, and asks once. You have these choices:

1. **Install the `.deb`** (above), the best answer on Ubuntu 24.04 and later. Choose **Quit** and install it.
2. **Allow user namespaces**, which is what most systems do already, and start Drafter again:

   ```sh
   sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
   ```

   To keep it after a restart, put `kernel.apparmor_restrict_unprivileged_userns = 0` in a file such as `/etc/sysctl.d/60-userns.conf`. This relaxes a protection for every program on the machine, which is why the `.deb`'s narrower profile is better where you can use it.
3. **Continue without the sandbox**, knowingly: choose **Continue without the sandbox**. Drafter remembers that you did (a file in its settings folder, `~/.config/Drafter/`, named `sandbox-continue-…`) and doesn't ask again for the same reason; delete the file to be asked again. To start without being asked at all, set `DRAFTER_ALLOW_NO_SANDBOX=1`:

   ```sh
   DRAFTER_ALLOW_NO_SANDBOX=1 ./Drafter-<version>-linux-x86_64.AppImage
   ```

   A page that got past Drafter's other protections could then reach your files. Drafter's own pages come from the app itself and make no network requests of their own, so the risk is small, but it is a risk the first two choices don't take.

## Updating

Updates arrive with the next release. For now, install the newer file from the releases page when a new version is published.
