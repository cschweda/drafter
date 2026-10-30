// Scripts of our own for the Reading view, the band, and the whole file, with what each lays out to.
import { type Doc, parse } from '@drafter/fountain';
import { type Layout, type PaginateOptions, paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';

export const screenplay = builtins['us-screenplay'] as Template;
export const stagePlay = builtins['stage-play-standard'] as Template;

/**
 * A screenplay with two acts and three scenes (one colored), a voice over, a continued speech,
 * dual dialogue, a transition, centered text, a lyric, notes inline and on their own, a
 * boneyard, a synopsis, and a speech long enough to run over a page.
 */
export const SCREENPLAY = `Title: The Salt Road
Credit: Written by
Author: Wren Okafor
Draft date: 30 October 2026

# ACT ONE

INT. LIGHTHOUSE KITCHEN - NIGHT [[Color: Blue]]

Rain needles the window. [[Make the rain louder here.]] A kettle begins to shake on the stove.

MARA (V.O.)
(not looking up)
You left the lamp burning again.
All night.

JONAH
Somebody has to.

[[Jonah should sound tired, not cross.]]

/* MARA
I cut this speech. */

= Mara wants the lamp out; Jonah won't let it go.

MARA (CONT'D)
Then let it be me tonight.

TESSA
It's mine tonight.

DECLAN ^
No, it's mine.

> CUT TO:

# ACT TWO

EXT. CLIFF PATH - CONTINUOUS

Mara climbs. **The wind** takes her *scarf* and _flings_ it out over the water.

~Bring the boats home, bring the boats home

JONAH
${'The tide keeps its own hours out here, and so do I. '.repeat(40)}

INT. LANTERN ROOM - LATER

> THE END <
`;

/** A stage play: two acts, scenes as `##` sections, stage directions, and speech. */
export const STAGE_PLAY = `# ACT ONE

## SCENE 1

A ferry waiting room. Benches. A clock that has stopped.

ODILE
(to no one)
The boat is late.

BASTIEN
The boat is always late.

# ACT TWO

## SCENE 2

The quay at dawn.

ODILE
Then it is on time.
`;

/** Only action: no sections and no scenes, so no band. */
export const BARE = `A gull lands on the rail.

It looks at the sea, then at us.
`;

export interface Laid {
  doc: Doc;
  layout: Layout;
  template: Template;
}

/** A script parsed and laid out, as the export does. */
export function lay(source: string, template = screenplay, options?: PaginateOptions): Laid {
  const doc = parse(source);
  return { doc, layout: paginate(doc, template, options), template };
}

/** Markup read into a detached element of the test's document. */
export function dom(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
}

/** Bytes that start as a TrueType file does, with a style's own tail so each face differs. */
const ttf = (tail: number) => new Uint8Array([0x00, 0x01, 0x00, 0x00, tail, 0xff, 0xfe]);
export const FONTS = { regular: ttf(1), bold: ttf(2), italic: ttf(3), boldItalic: ttf(4) };
