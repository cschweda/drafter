# Writing in Markdown

This is a sample Markdown document. Markdown is plain text with a few marks that say how it should look: a `#` for a heading, stars for *emphasis*, a dash for a list. The Preview beside it shows the result, and the file stays readable in any app that opens text.

In Drafter, a script is written in Fountain. Markdown is for everything around the script: a **treatment**, an **outline**, **notes** from a reading, a list of questions for the next draft.

Read through, then make it your own, or choose **Start blank** at the top to clear it.

## Headings

A line that starts with `#` is a heading. More marks make a smaller one:

# One mark, the document's title
## Two marks, a section
### Three marks, a part of a section

The first heading is the document's title, and Drafter names the file after it when you save.

## Emphasis

Wrap a word in one star for *italics* and two for **bold**. Underscores work too: _italics_ and __bold__.

## Lists

A dash, a star, or a plus starts a bulleted list:

- Margaret, in her sixties, waiting up
- Danny, her son, late as always
- A cake that didn't survive the rain

A number and a full stop start a numbered list. The numbers don't have to be right; the Preview counts for you:

1. The phone doesn't ring.
2. A knock at the back door.
3. Something like forgiveness.

Indent a line under an item to make a list inside a list:

- Act One
  - The kitchen, late at night
  - The knock
- Act Two
  - The back step

## Block quotes

A line that starts with `>` is a quotation, for a line of dialogue you want to keep, or a note from a reader:

> "Next year I'll call from the bakery."

> The second scene could start sooner. — notes from the table read

## Links

A link is the text in square brackets, then the address in round ones: [the Fountain syntax guide](https://fountain.io/syntax). Drafter's Preview shows only the link's text, and never follows it, so nothing in a document can open a page by itself.

## Footnotes

A footnote keeps an aside out of the way.[^aside] Put a caret and a label in square brackets where the note belongs, then write the note on a line of its own, anywhere in the document, starting with the same label and a colon:

```
The kitchen clock is ten minutes fast.[^clock]

[^clock]: Margaret sets it that way on purpose.
```

The label can be a word or a number; the notes are numbered 1, 2, 3 in the order you refer to them. The Preview lists them at the end, and a PDF prints each at the foot of its page.

[^aside]: Like this one. Indent a line by four spaces to give a note a second paragraph.

## Code

Backticks around a few words keep them exactly as typed: `INT. KITCHEN - NIGHT`. Three backticks on a line of their own start a block that is kept as typed, line for line, which is a good way to show a bit of Fountain in your notes:

```
MARGARET
(quietly)
You said you'd call.
```

## A short treatment

Here is how a treatment for the sample screenplay might look in Markdown.

### The Call

*A short film. One kitchen, one night, two people.*

**Logline.** A mother waits up for a call from her son, and gets a knock at the door instead.

**Act One.** It is twenty to midnight. MARGARET sits at a spotless kitchen table in front of a plate she hasn't touched, watching the phone on the wall. It doesn't ring. She scrapes the plate into the trash.

**Act Two.** A knock at the back door. DANNY, soaked through, holds out a bakery box gone soft in the rain. He *did* try to call, from a pay phone. She lets him in.

**Act Three.** The cake is ruined. They eat it anyway, out of the box, on the back step after the rain, and make promises about next year that neither of them quite believes.

---

A line of three dashes, like the one above, draws a rule across the page.

That's all of Markdown you need to get started. Your document is saved in this browser as you type, and **Save** writes it to a `.md` file you can open anywhere.
