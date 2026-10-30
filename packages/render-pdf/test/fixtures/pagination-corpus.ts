// Original documents whose page breaks were recorded from the Markdown PDF's pagination before
// footnotes (e6f93dd), in `pagination-breaks.json`: a document without notes must break as it did.
// Invented text, written for these tests.

const sentence = (i: number) =>
  `The ferry leaves the quay at ${(i % 12) + 1}, the gulls follow it past the breakwater, and the café sets its chairs out one by one while the baker carries trays across the square.`;

/** Long paragraphs under headings, every few of them a chain of two. */
const harbour = Array.from({ length: 40 }, (_, i) => {
  const heading =
    i % 5 === 0 ? `## Morning ${i / 5 + 1}\n\n${i % 10 === 0 ? '### The quay\n\n' : ''}` : '';
  return `${heading}${sentence(i)} ${sentence(i + 1)}${i % 3 === 0 ? ` ${sentence(i + 2)}` : ''}`;
}).join('\n\n');

/** An outline: lists three deep, loose and tight, quotes in quotes, and a long code block. */
const outline = [
  '# The Call: an outline',
  ...Array.from({ length: 14 }, (_, i) =>
    [
      `## Sequence ${i + 1}`,
      `- Margaret waits up, ${sentence(i)}\n  - The phone doesn’t ring.\n    - She checks it twice.\n  - The clock is ten minutes fast.\n- A knock at the back door.`,
      i % 2 === 0
        ? '1. First beat\n\n2. Second beat, which runs on for a while before it ends.\n\n3. Third'
        : '> A reader’s note.\n>\n> > Quoted inside it, a line from the draft.',
      i % 4 === 1
        ? `\`\`\`\n${Array.from({ length: 30 }, (_, k) => `MARGARET ${'(quietly) '.repeat(k % 4)}line ${k}`).join('\n')}\n\`\`\``
        : sentence(i + 3),
    ].join('\n\n'),
  ),
].join('\n\n');

/** Headings that fall at a page's foot: chains of three, with short blocks between. */
const chains = Array.from({ length: 30 }, (_, i) =>
  [
    `# Part ${i + 1}`,
    `## Chapter ${i + 1}`,
    `### Scene ${i + 1}`,
    'A short line.',
    `${sentence(i)}\n${sentence(i + 4)}`,
  ].join('\n\n'),
).join('\n\n');

/** Inline marks, links, long words, hard breaks, and rules. */
const mixed = Array.from({ length: 25 }, (_, i) =>
  [
    `Some *slanted* and **bold** words, \`code\`, and [a link](https://example.com/${i}) in ${sentence(i)}`,
    `${'z'.repeat(40 + i * 7)} then words.  \nA hard break, then more: ${sentence(i + 2)}`,
    i % 6 === 5 ? '---' : `> ${sentence(i + 5)}`,
  ].join('\n\n'),
).join('\n\n');

export const CORPUS: Readonly<Record<string, string>> = { harbour, outline, chains, mixed };
