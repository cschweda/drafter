# Formats

Fountain is where you write. Everything else is a door in or a door out.

## In: opening a file

| File | What Drafter does |
|---|---|
| Fountain (`.fountain`, `.txt`) | Opens it as it is. Save writes it back. |
| Final Draft (`.fdx`) | Opens a copy as a new script: scenes, dialogue, dual dialogue, transitions, the title page, scene numbers, and notes. |
| Highland (`.highland`) | Opens the script inside as a new script. |
| Fade In (`.fadein`) | Opens a copy as a new script, read from its Open Screenplay Format. |
| Markdown (`.md`) | Opens as a Markdown document (a treatment, notes, or a novel), or, with **Open as screenplay…**, as a script typed in Fountain. |
| Drafter's own HTML or EPUB export, saved with **Let Drafter reopen this file** | Opens the script inside as a new script, exactly as you wrote it. |
| Anything else (Word, RTF, PDF, other web pages and e-books, an image) | Refused, with a sentence saying what to do instead. |

The file you open is never changed. Text that Fountain has no element for (hidden text, an omitted scene, a paragraph style of the writer's own) comes in as a note, such as `[[fdx: …]]` or `[[osf: …]]`, listed in Problems, so no words go missing silently. Formatting with no place in Fountain, such as fonts and revision colors, is left behind.

## Out: exporting

| Export | What you get |
|---|---|
| **PDF** | The pages exactly as the Script tab shows them, in Courier Prime 12 pt, on US Letter or A4. |
| **Final Draft** (`.fdx`) | A file that Final Draft, Fade In, WriterDuet, and most other screenwriting apps open. |
| **Markdown** | The whole script as readable Markdown, with your notes if you ask, or the Outline's treatment. Good for sharing, for a wiki, and for AI tools. |
| **Plain text** | The laid-out pages as text, to paste anywhere. |
| **Fountain** (`.fountain`) | Save, or Save As… for a new file you keep working in. **Export → Fountain** saves a copy and leaves you on the file you have. Highland, Beat, Slugline, and any text editor read it. |
| **A Markdown document's PDF** | A typeset document: headings, lists, links you can click, and footnotes at the foot of the page. |
| **HTML** (`.html`) | One web page that opens in any browser with no connection: a script's printed pages and a reading view, or a Markdown document as the Preview draws it. |
| **EPUB** (`.epub`) | An e-book for an e-reader or a tablet, reflowed to its screen: a script's reading view, one chapter per act, or a Markdown document, one chapter per `#` heading, with its footnotes. |
| **Story map** (`.html`) | One dark, picture-first page of a screenplay or stage play for someone who doesn't read scripts: its shape, its people, every scene so far with a line or two of dialogue, and what is still to write. No JavaScript, no network, no notes; it never carries the script, so Drafter can't reopen it. Its choices are in its own dialog, not in Export options. See the [Story map help page](https://drafter.dev/docs/story-map/). |

Export options, per script, set the scene numbers (none, as written, or every scene), how much of the title page prints, and whether a Markdown, HTML, or EPUB export carries your notes. Drafter doesn't write Highland or Fade In files: Highland opens Fountain directly, and Fade In opens Final Draft.

**Reopening an HTML or EPUB file.** Drafter can only reopen HTML or EPUB files it saved itself, with **Let Drafter reopen this file (includes the full script, notes and all)** turned on in Export options. It can't open HTML or EPUB files made by other apps or sites, or Drafter exports made with the option off. The option is off by default, because a file with it on carries your whole script, notes and boneyard too, and anyone you send it to can read them. Drafter reads the script inside only as plain text and never runs anything in the file; an HTML export opened in a browser is an ordinary web page, so treat one someone sent you like any downloaded page. The [open spec](spec/drafter-package.md#appendix-the-script-inside-an-html-or-epub-export) says where the script sits.

## From the command line

The same code runs in a terminal ([Developing Drafter](DEVELOPMENT.md#development) shows how to build it):

```sh
drafter build script.fountain --pdf script.pdf     # a PDF; --txt for plain text
drafter build script.fountain --html script.html   # one HTML page, pages and reading view, to open anywhere
drafter build script.fountain --html script.html --reopenable   # with the script inside, for Drafter to reopen
drafter build script.fountain --story-map map.html  # a story map; --status finished or in-progress
drafter convert script.html                        # the script back out of a reopenable export
drafter convert MyScript.fdx                      # MyScript.fountain, beside it
drafter convert ~/Scripts                         # every .fdx, .highland, and .fadein in the folder
drafter convert ~/Scripts --recursive             # and in its subfolders
drafter convert ~/Scripts --out ~/Fountain        # into another folder
drafter convert ~/Scripts --force                 # replace .fountain files that are there already
```

`convert` uses the app's own import code, so each `.fountain` is what opening the file in Drafter and saving it would give. It never changes the originals, skips a `.fountain` that is already there unless you add `--force`, writes each file whole or not at all (on a drive with no hard links, such as FAT or exFAT, a crash mid-copy can still leave a short file), prints a line for each file and a summary, and exits 1 if any file was refused.
