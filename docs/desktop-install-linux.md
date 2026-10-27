# Installing Drafter on Linux

Drafter for Linux comes as an **AppImage** and a **`.deb`**, built for 64-bit Intel and AMD (x64) and published with each release on GitHub: <https://github.com/cschweda/drafter/releases>. The command is `drafterdev`.

Drafter runs its pages in Chromium's **sandbox**, which keeps a page that went wrong away from your files. The sandbox needs the system to let a program make a user namespace. Most systems do. **Ubuntu 24.04 and later do not, by default**, and that decides which package to use.

## Ubuntu 24.04 or later, and Debian-based systems: the `.deb`

```sh
sudo apt install ./Drafter-<version>-linux-amd64.deb
```

It adds Drafter to your applications (under Office), registers `.fountain` and `.md` files, and installs an AppArmor profile that lets Drafter use the sandbox. Nothing else is needed. Start it from the menu, or with `drafterdev`, or open a file with it.

## Any other distribution: the AppImage

```sh
chmod +x Drafter-<version>-linux-x86_64.AppImage
./Drafter-<version>-linux-x86_64.AppImage
```

An AppImage needs FUSE 2 (`libfuse2`; on Ubuntu 24.04 the package is `libfuse2t64`). If it won't start, install that.

### If Drafter says it "won’t start without Chromium’s sandbox"

The AppImage's launcher turns the sandbox off when your system doesn't let it make a user namespace, and **Drafter then stops instead of running without it.** You have three choices:

1. **Install the `.deb`** (above). It is the way on Ubuntu 24.04 and later.
2. **Allow user namespaces**, which is what most systems do already:

   ```sh
   sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
   ```

   To keep it after a restart, put `kernel.apparmor_restrict_unprivileged_userns = 0` in a file such as `/etc/sysctl.d/60-userns.conf`. This relaxes a protection for every program on the machine, which is why the `.deb`'s narrower profile is better where you can use it.
3. **Run without the sandbox, knowingly:**

   ```sh
   DRAFTER_ALLOW_NO_SANDBOX=1 ./Drafter-<version>-linux-x86_64.AppImage
   ```

   A page that got past Drafter's other protections could then reach your files. Drafter's own pages come from the app itself and make no network requests of their own, so the risk is small, but it is a risk the other two choices don't take.

## Updating

The AppImage updates in place and the app offers a new version when one is published (Settings has **Check for updates**). The `.deb` is updated by installing the newer file.
