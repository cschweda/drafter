# Drafter on the web and on the desktop

drafter.dev and the desktop app (for [Linux](desktop-install-linux.md), [Windows](desktop-install-windows.md), and, built on your own machine, [the Mac](desktop-install-macos.md)) are the same Drafter: the editor, the pages, export, the Problems pane, templates, Markdown documents, script modules, the writing aids, and the help pages are the same in both. These differ:

| | drafter.dev (web) | The desktop app (Linux and Windows) |
|---|---|---|
| Getting it | Nothing to install: open the site. Works in any modern browser, on any computer, tablet, or phone. | Download and install a 100 to 130 MB package, for Linux or Windows; macOS later. |
| Saving | Saves straight back to your file in Chrome and Edge on a computer; elsewhere Save downloads a copy. | Always saves straight back to your file. Each save is written in full before it replaces the old file, so a crash or a full disk can't leave it half written. |
| Your scripts | Plain-text files. | The same files: a script saved in one opens unchanged in the other, line breaks and all. |
| The recovery copy | Kept in the browser, which can clear it (Safari clears a site's storage after about a week without a visit, and "clear site data" removes it). | Kept in Drafter's own folder (`~/.config/Drafter`; on Windows `%APPDATA%\Drafter`), which no browser clears. Each keeps its own recovery copy and recent scripts; they aren't shared. |
| Opening scripts | Open, or drag a file onto the page. | Also double-click a `.fountain` file (with the `.deb` or on Windows; an AppImage doesn't register file types), start `drafterdev "My Script.fountain"` from a terminal (`Drafter.exe` on Windows), or open a file while Drafter is already running, and it comes to the front. |
| Access to your files | In Chrome, a script saved to a file may open read-only after a reload until you choose **Check for changes**. | Drafter can read and write only the files you chose (by Open, Save As, a drop, or the command line), and doesn't ask again after a restart. |
| Menus | The Drafter menu in the toolbar, and the command palette. | Also a menu bar (File, Edit, View, Go, Help). |
| Closing with unsaved changes | The browser's own "Leave page?" warning. | Asks **Save**, **Don't Save**, or **Cancel**. |
| Working offline | After the first visit, through the browser's service worker. | Always: everything is in the app. |
| Updates | A new version is offered when you next open the site, with **Reload**; **Help → Check for updates…** asks the browser to look now. | Checked once when Drafter starts (you can turn it off), and whenever you choose **Help → Check for Updates…**. The AppImage and the Windows app install it only when you choose **Restart**; the `.deb` offers **Get it**, the release page. |
| Network | Loads the site from drafter.dev; after that, only the browser's check for a new version. | None, apart from the update check (or none at all with it off, unless you choose Check for Updates). |
| Spellcheck | Drafter's own in the script, offline. Other text fields use your browser's. | The same in the script. Other text fields use the app's own English dictionary, so they work offline too. |
| Installing as an app | Chrome and Edge can install the site as an app; Safari can add it to the Dock or Home Screen. | It is an app. |

The Mac app built with `pnpm desktop:mac` is the desktop app too, with the Mac's own menus and folders; the [Mac guide](desktop-install-macos.md) says how it differs.
