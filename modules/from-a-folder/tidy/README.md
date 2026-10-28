# Tidy (a module for the modules folder)

A sample for the desktop app's modules folder: plain JavaScript, no build step. It finds spaces and
tabs at the ends of lines.

- **Button** (Tidy): lists each such line in the Problems pane, with a fix that removes them.
- **Command** (Tidy: remove spaces at line ends): removes them all in one change, after asking (Undo
  takes it back).
- **Tab** (Tidy): the lines, each a button that goes to it; drawn again as you type.
- **Settings**: whether to ask before removing.

To try it: Help → Open Modules Folder, copy this `tidy` folder into it, restart Drafter, and turn
Tidy on in Settings → Modules. [The README one folder up](../../README.md#modules-from-a-folder-the-desktop-app)
describes the format.
