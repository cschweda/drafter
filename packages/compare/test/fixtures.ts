import { parse } from '@drafter/fountain';
import { type Layout, paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';

export const screenplay = builtins['us-screenplay'] as Template;
export const play = builtins['stage-play-standard'] as Template;

/** The newer text's layout, as Compare draws it. */
export const lay = (text: string, template: Template = screenplay): Layout =>
  paginate(parse(text), template);

/** A short screenplay of Drafter's own, with a title page, a long action, and dual dialogue. */
export const SHORT_SCREENPLAY = `Title: The Long Wait
Author: A. Writer

INT. BUS SHELTER - NIGHT

Rain hammers the roof. JUNE, forties, checks the timetable for the third time and finds that it has not changed, no matter how hard she stares at it or how often she wipes the glass.

JUNE
It said ten past.

OWEN
It always says ten past.

June glares at him.

JUNE
Then it's lying.

OWEN ^
Timetables don't lie.

[[Owen should sound sure of himself here.]]

EXT. ROAD - CONTINUOUS

Headlights sweep the wet road. The bus does not stop.

JUNE
Of course.
`;

/** A short stage play of Drafter's own. */
export const SHORT_PLAY = `# Act One

## Scene 1

A porch at dusk. Two rocking chairs.

ELSIE
(rocking)
The swallows are late this year.

TOM
They're always late.

ELSIE
Not like this.
`;

/** `text` with `from` replaced by `to`; throws when `from` is not in it, so a fixture can't drift. */
export function edit(text: string, from: string, to: string): string {
  if (!text.includes(from)) throw new Error(`edit: ${JSON.stringify(from)} is not in the text`);
  return text.replace(from, to);
}

/** Every part of every row of `page`: a dual dialogue row's right side too. */
export const partsOf = (layout: Layout, page: number) =>
  (layout.pages.find((p) => p.number === page)?.lines ?? []).flatMap((line) =>
    line.right ? [line, line.right] : [line],
  );
