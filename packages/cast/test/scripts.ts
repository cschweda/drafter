import { type Doc, parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { linesPerPage, type SceneIndex, sceneIndex } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import { type Cast, castOf, type IsWord } from '../src';

// Original scripts written for these tests. Nothing here is from a produced script.

export const screenplay = builtins['us-screenplay'] as Template;
export const stagePlay = builtins['stage-play-standard'] as Template;

/** The dictionary the tests pretend to have: "Will", "Hope", "The Driver", and "Grace" are words. */
const WORDS = new Set(['will', 'hope', 'the', 'driver', 'grace', 'a', 'on']);

/** Whether every word of `name`, lowercased, is in `WORDS`, as the spell worker answers. */
export const isWord: IsWord = (name) =>
  name
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== '')
    .every((w) => WORDS.has(w));

/** Before the dictionary answers. */
export const notKnown: IsWord = () => undefined;

/** Nothing is a word: every name counts in capitals, capitalised, or as its cue spells it. */
export const noWords: IsWord = () => false;

/**
 * Fourteen scenes at a harbor. A cold open with a speech; a section with a speech of its own
 * before its first scene; WILL, HOPE, ANN, ANN LEE, TOM, McCLANE (a forced cue), and THE DRIVER
 * speak; a GUARD is only ever in the action; a dual pair (scene 4) and a lyric (scene 6).
 */
export const HARBOR = `Title: Low Water
Author: A. Writer

WILL (V.O.)
Every town has one night it won't talk about.

EXT. HARBOR - NIGHT

Rain on the water. WILL (40s) hauls a crate up the ramp. A GUARD watches from the booth.

WILL
Last one.

HOPE
You said that an hour ago.

INT. HARBOR OFFICE - NIGHT

Will you look at that. Hope fades from the window. The kettle whistles.

ANN
Who left the light on?

She glances at a photo of TOM on the desk.

INT. HARBOR OFFICE - CONTINUOUS

ANN LEE steps in, shaking off her coat. Ann Lee's boots squeak on the boards.

ANN LEE
Tide's turning.

EXT. HARBOR - DAY

Tom waits by the bollard with two coffees.

TOM
Morning.

@McCLANE ^
Is it?

INT. HARBOR OFFICE - DAY

Outside, the driver honks. THE DRIVER leans on the horn again.

HOPE
Coming!

EXT. COAST ROAD - DUSK

The Driver waves from the cab.

HOPE
~Down by the water, down we go,
~Nobody waiting, nobody to know.

INT. TRUCK - NIGHT

THE DRIVER
Where to?

WILL
(to TOM, not looking)
Anywhere dry.

# Part Two

HOPE
(calling)
Last ferry!

INT. HOUSE - KITCHEN - NIGHT

= WILL broods over the plan.

McCLANE's coffee goes cold on the sill. [[TOM should be here too.]]

/* ANN LEE used to come in here. */

HOPE
ANN would know what to do.

INT. HOUSE - NIGHT

Tom’s jacket hangs by the door.

ANN
Nobody's home.

EXT. HOUSE - NIGHT

WILL'S truck idles at the curb.

@McCLANE
Get in.

INT./EXT. TRUCK - MOVING - NIGHT

No one has any hope of sleep, and nobody will say so.

TOM
Faster.

I/E HARBOR OFFICE - MORNING

A GUARD sleeps in the booth.

HOPE
Wake up.

EXT. HARBOR - MOMENTS LATER

WILL
We're done here.

INT. HARBOR OFFICE - LATER #14A#

ANN looks up from the ledger.

ANN LEE
Not yet.
`;

/** Five scenes in two acts; the last is written in a screenplay's form. */
export const PARLOR = `Title: The Parlor
Author: A. Writer

# Act One

## Scene 1

The parlor. GRACE sits by the stove. Otto paces.

GRACE
Sit down, Otto.

OTTO
I can't.

## Scene 2

Grace alone.

GRACE
He'll come back.

# Act Two

## Scene 3

OTTO
I came back.

## Scene 4

Otto and GRACE at the window.

GRACE
So you did.

## INT. PARLOR - EVENING

OTTO
Goodnight.

/* drafter
{"v":1,"template":"stage-play-standard"}
*/
`;

export interface Built {
  doc: Doc;
  index: SceneIndex;
  template: Template;
  perPage: number | null;
  cast: Cast;
}

/** The parse, its scene index (with pages when `pages`), and its cast with `words`. */
export function build(source: string, options: { pages?: boolean; isWord?: IsWord } = {}): Built {
  const doc = parse(source);
  const template = doc.meta?.template === 'stage-play-standard' ? stagePlay : screenplay;
  const layout = options.pages ? paginate(doc, template) : null;
  const index = sceneIndex(doc, template, layout);
  const perPage = linesPerPage(layout);
  const cast = castOf(index, doc, template, perPage, options.isWord ?? isWord);
  return { doc, index, template, perPage, cast };
}

/** The scene numbers (1-based) a character is in, by key. */
export function scenesOf(cast: Cast, key: string): number[] {
  const at = cast.characters.findIndex((c) => c.key === key);
  return (cast.byScene[at] ?? []).map((p) => p.scene + 1);
}

/** `n` lines of filler action, about `n / 55` pages. */
export const filler = (n: number) =>
  Array.from({ length: n }, (_, i) => `The tide goes out, line ${i + 1}.`).join('\n');
