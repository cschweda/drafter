// Test scripts for @drafter/history: original text written for Drafter. `Last Ferry` is a
// 12-scene screenplay in two acts, and each variant below is a version of it a writer might
// save later (a scene trimmed, renamed, rewritten, split, merged, moved, copied, or cut).
// `Night Fares` has five scenes under one heading, and `The Lantern Room` is a 6-scene stage play.

/** The scenes of `Last Ferry`, by a short name, each from its heading to its last line. */
export const S = {
  office: `INT. FERRY OFFICE - DAWN

= Nell opens up alone.

Rain ticks on the tin roof. NELL ABARA, forties, unlocks a cash drawer, counts the float twice, and writes the total on the back of her hand in blue biro.

NELL
Forty-two dollars and a button. Somebody paid me with a button again.

She pockets the button anyway, wipes the fogged window with her sleeve, and flips the cardboard sign to OPEN.`,

  jetty: `EXT. JETTY - MORNING

Gulls argue over a split bag of chips. The ferry, a stubby green boat called the MARGARET ROSE, knocks against old tyres roped to the pilings.

Nell coils a mooring line, hand over elbow, while a SCHOOLBOY in an oversized blazer waits with a bicycle.

SCHOOLBOY
Is it running today or is it broken like Tuesday?

NELL
It was resting on Tuesday. Get on before it changes its mind.`,

  arrival: `INT. CAR - DAY

TOBIAS ABARA, younger, sharper suit, drives a rented hatchback down the coast road with one hand. A folder marked VALUATION slides across the passenger seat at every bend.

He practises a smile in the mirror and does not like it.

TOBIAS
(to himself)
Nell, it's a good offer. Nell, nobody takes the ferry anymore. Nell, please.`,

  cabin: `INT. FERRY CABIN - DAY

Twelve plastic seats bolted in rows, four of them taken. The engine hammers under the floor like a neighbour who wants quiet.

Nell weaves between the seats with a tin box, taking fares. An OLD MAN pays in coins counted out from a sock. A NURSE asleep against the window gets a free ride; Nell does not wake her.

The Schoolboy has his homework spread across two seats and a lifejacket.

SCHOOLBOY
What's seven eights?

NELL
Fifty-six. Do your own homework.

SCHOOLBOY
You just did it.

Nell taps the tin box against the window. Beyond the salt-crusted glass the island rises out of the mist, a grey hump with one white house and a radio mast blinking red.

NELL
That's the last stop. Everybody off who isn't me.

The old man gathers his sock of coins. The nurse wakes, startled, and checks her watch. The engine coughs twice and settles into a lower complaint.`,

  landing: `EXT. ISLAND LANDING - DAY

The ramp drops with a clang. Passengers file off into wind that tugs at umbrellas and hats.

Tobias stands at the top of the slipway, folder under his arm, rain on his good shoes. Nell sees him before he sees her.

NELL
You came on the bus and then a taxi and then you walked the last bit. I can tell from your shoes.

TOBIAS
Hello to you too.`,

  pub: `INT. HARBOUR PUB - NIGHT

Low ceiling, a fire that smokes more than it warms, and a dartboard with no darts. Nell and Tobias share a corner table and a basket of soggy chips.

TOBIAS
The council will buy the license. They'll put on a water taxi in summer.

NELL
And in winter?

TOBIAS
In winter people can wait.

NELL
Mrs Okafor's dialysis can't wait. The post can't wait. The schoolboy has exams.

Tobias slides the folder across. She does not open it.`,

  kitchen: `INT. NELL'S KITCHEN - NIGHT

A narrow room above the ferry office. Charts pinned over the sink, a kettle that whistles out of tune.

Nell reads the valuation at last, lips moving over the numbers. Tobias dries a mug that is already dry.

NELL
This says the boat is worth less than the engine.

TOBIAS
The boat is worth less than the engine.

She laughs despite herself, then stops.`,

  storm: `EXT. JETTY - NIGHT

The wind has turned. Waves slap over the jetty boards and the Margaret Rose bucks on her lines like a tethered horse.

Nell's phone buzzes. She reads a message, and her face sets.

NELL
The nurse. Her waters broke on the island and the helicopter's grounded.

TOBIAS
Nell, no. Not in this.

She is already untying the stern line.`,

  wheelhouse: `INT. FERRY WHEELHOUSE - NIGHT

A cramped box of dials and a wheel worn pale where hands have held it for forty years. Rain sheets the glass faster than the wiper can clear it.

Tobias braces in the doorway, soaked, the valuation folder still absurdly under his arm.

TOBIAS
What do I do?

NELL
Hold the torch on the compass and stop talking.

He holds the torch. His hand shakes. She steadies it with hers without looking.`,

  water: `EXT. OPEN WATER - NIGHT

A wall of black water lifts the Margaret Rose and drops her. Spray explodes over the bow. Somewhere ahead, the island's red mast light blinks, vanishes, blinks.

The folder slips from Tobias's arm and skates across the deck. Pages scatter into the dark like startled birds.

He watches them go and does not chase them.`,

  coastguard: `INT. COAST GUARD HUT - DAWN

A paraffin heater, a radio crackling with weather, and a COAST GUARD OFFICER in a cardigan pouring tea into chipped mugs.

The nurse sleeps on a camp bed with a newborn tucked inside her coat. Nell sits on the floor with her back to the wall, too tired to take off her boots.

OFFICER
You'll get a letter about this. A stern one.

NELL
Frame it for me.`,

  morning: `EXT. JETTY - DAY

Sun, absurdly, as if the night never happened. The Margaret Rose sits at her mooring with a dent in her bow and a gull on her roof.

Tobias, in a borrowed jumper, flips the cardboard sign to OPEN.

TOBIAS
Forty-two dollars and a button. Who pays with a button?

NELL
Regulars.

FADE OUT.`,
} as const;

const TITLE = 'Title: Last Ferry\nAuthor: A. Writer';
const ACT_ONE = '# ACT ONE';
const ACT_TWO = '# ACT TWO';

/** A version of `Last Ferry`: a title page, then each act's scenes, one blank line apart. */
export function lastFerry(actOne: readonly string[], actTwo: readonly string[]): string {
  return `${[TITLE, ACT_ONE, ...actOne, ACT_TWO, ...actTwo].join('\n\n')}\n`;
}

export const ACT_ONE_SCENES = [S.office, S.jetty, S.arrival, S.cabin, S.landing, S.pub] as const;
export const ACT_TWO_SCENES = [
  S.kitchen,
  S.storm,
  S.wheelhouse,
  S.water,
  S.coastguard,
  S.morning,
] as const;

/** The 12-scene screenplay as first written. */
export const LAST_FERRY = lastFerry(ACT_ONE_SCENES, ACT_TWO_SCENES);

// Versions of single scenes.

/** The cabin scene cut to about a quarter of its length, under its own heading. */
export const CABIN_TRIMMED = `INT. FERRY CABIN - DAY

Twelve plastic seats bolted in rows, four of them taken. The engine hammers under the floor like a neighbour who wants quiet.

Nell weaves between the seats with a tin box, taking fares.`;

/** The pub scene under a new heading, its text kept but for one line. */
export const PUB_RENAMED = `INT. THE ANCHOR TAVERN - NIGHT

Low ceiling, a fire that smokes more than it warms, and a dartboard with no darts. Nell and Tobias share a corner table and a basket of soggy chips.

TOBIAS
The council will buy the license. They'll run a water taxi in summer.

NELL
And in winter?

TOBIAS
In winter people can wait.

NELL
Mrs Okafor's dialysis can't wait. The post can't wait. The schoolboy has exams.

Tobias slides the folder across. She pushes it back.`;

/** The wheelhouse scene rewritten from nothing under a new heading. */
export const WHEELHOUSE_REWRITE = `INT. FERRY BRIDGE - NIGHT

Instruments glow green. Nell steers by feel, eyes half closed, counting the swells under her breath.

Tobias vomits neatly into a bucket and apologises to it.

TOBIAS
I used to love boats.

NELL
You were six. You loved the snack bar.`;

/** The wheelhouse scene kept under the same heading but rewritten from nothing. */
export const WHEELHOUSE_SAME_HEADING_REWRITE = `INT. FERRY WHEELHOUSE - NIGHT

Instruments glow green. Nell steers by feel, eyes half closed, counting the swells under her breath.

Tobias vomits neatly into a bucket and apologises to it.

TOBIAS
I used to love boats.

NELL
You were six. You loved the snack bar.`;

/** The cabin scene split in two: its first half under its heading, its second under a new one. */
export const CABIN_SPLIT = [
  `INT. FERRY CABIN - DAY

Twelve plastic seats bolted in rows, four of them taken. The engine hammers under the floor like a neighbour who wants quiet.

Nell weaves between the seats with a tin box, taking fares. An OLD MAN pays in coins counted out from a sock. A NURSE asleep against the window gets a free ride; Nell does not wake her.

The Schoolboy has his homework spread across two seats and a lifejacket.

SCHOOLBOY
What's seven eights?

NELL
Fifty-six. Do your own homework.

SCHOOLBOY
You just did it.`,
  `EXT. FERRY DECK - DAY

Nell taps the tin box against the window. Beyond the salt-crusted glass the island rises out of the mist, a grey hump with one white house and a radio mast blinking red.

NELL
That's the last stop. Everybody off who isn't me.

The old man gathers his sock of coins. The nurse wakes, startled, and checks her watch. The engine coughs twice and settles into a lower complaint.`,
] as const;

/** The cabin scene split in two, both halves under new headings. */
export const CABIN_SPLIT_RENAMED = [
  CABIN_SPLIT[0].replace('INT. FERRY CABIN - DAY', 'INT. FERRY SALOON - DAY'),
  CABIN_SPLIT[1],
] as const;

/** The kitchen and storm scenes merged into one, under the kitchen's heading. */
export const KITCHEN_STORM_MERGED = `INT. NELL'S KITCHEN - NIGHT

A narrow room above the ferry office. Charts pinned over the sink, a kettle that whistles out of tune.

Nell reads the valuation at last, lips moving over the numbers. Tobias dries a mug that is already dry.

NELL
This says the boat is worth less than the engine.

TOBIAS
The boat is worth less than the engine.

She laughs despite herself, then stops. The window rattles: the wind has turned.

Waves slap over the jetty boards and the Margaret Rose bucks on her lines like a tethered horse.

Nell's phone buzzes. She reads a message, and her face sets.

NELL
The nurse. Her waters broke on the island and the helicopter's grounded.

TOBIAS
Nell, no. Not in this.

She is already pulling on her boots.`;

/** The kitchen and storm scenes merged into one under a heading new to both. */
export const KITCHEN_STORM_MERGED_RENAMED = KITCHEN_STORM_MERGED.replace(
  "INT. NELL'S KITCHEN - NIGHT",
  'INT. ROOM ABOVE THE OFFICE - NIGHT',
);

/** A copy of the jetty scene, slightly changed, as a later callback (a near-duplicate). */
export const JETTY_CALLBACK = `EXT. JETTY - MORNING

Gulls argue over a split bag of chips. The ferry, a stubby green boat called the MARGARET ROSE, knocks against old tyres roped to the pilings.

Tobias coils a mooring line, hand over elbow, while the SCHOOLBOY in an oversized blazer waits with a bicycle.

SCHOOLBOY
Is it running today or is it broken like Tuesday?

TOBIAS
It was resting on Tuesday. Get on before it changes its mind.`;

/** A scene that shares one line with the jetty scene and little else. */
export const JETTY_ECHO = `EXT. JETTY - EVENING

The last light goes copper on the water. Nell sits on an upturned crate, sharing a flask of soup with the Schoolboy, who has failed his exam and does not want to talk about it.

SCHOOLBOY
Is it running today or is it broken like Tuesday?

NELL
Ask me tomorrow. Drink your soup.`;

// The variants, each a whole version of the script.

export const V = {
  /** The cabin scene trimmed to a quarter. */
  trimmed: lastFerry(
    [S.office, S.jetty, S.arrival, CABIN_TRIMMED, S.landing, S.pub],
    ACT_TWO_SCENES,
  ),
  /** The pub scene under a new heading. */
  renamed: lastFerry(
    [S.office, S.jetty, S.arrival, S.cabin, S.landing, PUB_RENAMED],
    ACT_TWO_SCENES,
  ),
  /** The wheelhouse scene rewritten under a new heading. */
  rewrite: lastFerry(ACT_ONE_SCENES, [
    S.kitchen,
    S.storm,
    WHEELHOUSE_REWRITE,
    S.water,
    S.coastguard,
    S.morning,
  ]),
  /** The cabin scene split in two. */
  split: lastFerry(
    [S.office, S.jetty, S.arrival, ...CABIN_SPLIT, S.landing, S.pub],
    ACT_TWO_SCENES,
  ),
  /** The cabin scene split in two, both halves renamed. */
  splitRenamed: lastFerry(
    [S.office, S.jetty, S.arrival, ...CABIN_SPLIT_RENAMED, S.landing, S.pub],
    ACT_TWO_SCENES,
  ),
  /** The kitchen and storm scenes merged. */
  merged: lastFerry(ACT_ONE_SCENES, [
    KITCHEN_STORM_MERGED,
    S.wheelhouse,
    S.water,
    S.coastguard,
    S.morning,
  ]),
  /** The kitchen and storm scenes merged under a new heading. */
  mergedRenamed: lastFerry(ACT_ONE_SCENES, [
    KITCHEN_STORM_MERGED_RENAMED,
    S.wheelhouse,
    S.water,
    S.coastguard,
    S.morning,
  ]),
  /** The landing scene moved into act two. */
  moved: lastFerry(
    [S.office, S.jetty, S.arrival, S.cabin, S.pub],
    [S.kitchen, S.landing, S.storm, S.wheelhouse, S.water, S.coastguard, S.morning],
  ),
  /** The jetty scene cut, and its near-copy kept later on. */
  callbackKept: lastFerry(
    [S.office, S.arrival, S.cabin, S.landing, S.pub],
    [S.kitchen, S.storm, S.wheelhouse, S.water, S.coastguard, JETTY_CALLBACK, S.morning],
  ),
  /** The jetty scene cut, and a scene sharing one of its lines kept later on. */
  echoKept: lastFerry(
    [S.office, S.arrival, S.cabin, S.landing, S.pub],
    [S.kitchen, S.storm, S.wheelhouse, S.water, S.coastguard, JETTY_ECHO, S.morning],
  ),
  /** The water scene cut. */
  waterCut: lastFerry(ACT_ONE_SCENES, [S.kitchen, S.storm, S.wheelhouse, S.coastguard, S.morning]),
} as const;

// Night Fares: five scenes under one heading, in one cab, with different passengers.

export const CAR = [
  `INT. CAR - NIGHT

A minicab that smells of pine air freshener. IDRIS, sixties, drives with both hands at ten and two. In the back, a BRIDE in full white dress eats a kebab from its paper.

BRIDE
Don't ask.

IDRIS
I never ask. That's the whole job.`,
  `INT. CAR - NIGHT

Wipers on high. Idris's next fare is a tall MAN holding a cello case upright between his knees like a passenger of its own.

MAN
Could you take the bridges slowly? She doesn't like bridges.

Idris eases off the accelerator without a word.`,
  `INT. CAR - NIGHT

Two TEENAGERS share one set of earphones and argue in whispers about a film neither has seen. Idris turns the radio down to listen and pretends he hasn't.

TEENAGER
The dog lives. Everyone says the dog lives.`,
  `INT. CAR - NIGHT

Empty back seat. Idris eats a cold samosa at a red light and talks to the photograph clipped to his sun visor, a woman laughing at someone off the edge of the picture.

IDRIS
Slow night, love. A bride and a cello.`,
  `INT. CAR - NIGHT

Dawn grey in the windscreen. A NIGHT CLEANER, uniform under her coat, falls asleep the moment she sits. Idris turns off the meter, takes the long way so she can sleep, and hums along to nothing at all.`,
] as const;

const NIGHT_FARES_TITLE = 'Title: Night Fares\nAuthor: A. Writer';
const DEPOT = `INT. CAB DEPOT - NIGHT

Strip lights and a kettle. The DISPATCHER reads out jobs without looking up.`;
const HOME = `EXT. IDRIS'S HOUSE - DAWN

Idris parks, sits a moment with the engine off, and goes in.`;

/** A version of `Night Fares` with the depot, the car scenes given, and home. */
export function nightFares(cars: readonly string[]): string {
  return `${[NIGHT_FARES_TITLE, DEPOT, ...cars, HOME].join('\n\n')}\n`;
}

// The Lantern Room: a play in two acts of three scenes each.

const PLAY_META = '/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/';

export const PLAY_SCENES = [
  `## The Climb

A spiral stair inside a lighthouse, lit from above. ESME, seventeen, climbs with a toolbox. Her GRANDFATHER, older than the stairs, follows one step at a time.

GRANDFATHER
Ninety-one steps. I used to count them for luck.

ESME
Did it work?

GRANDFATHER
I am still climbing them.`,
  `## The Lamp

The lantern room. A great glass lens, dull with salt. Esme polishes it in slow circles while her grandfather sits on an upturned bucket and directs.

GRANDFATHER
Clockwise. The lens remembers which way.`,
  `## The Letter

Same. A letter with an official crest lies open on the floor. Neither of them looks at it.

ESME
They're automating it. A box on a pole, they said.

GRANDFATHER
A box on a pole cannot climb ninety-one steps.`,
  `## The Gale

Night. Wind screams at the glass. The new automatic light on its pole below has failed; the lighthouse is dark.

Esme strikes a match. Her grandfather holds the old brass lamp steady.`,
  `## The Ship

The beam turns again. Far out, a ship's horn answers twice.

GRANDFATHER
Two blasts. Thank you, they're saying.

ESME
Or watch where you point that.`,
  `## The Keys

Morning. Esme alone on the stair, a ring of heavy keys in her hand. She counts the steps aloud as she climbs, and the lights fade at ninety-one.`,
] as const;

/** A version of `The Lantern Room` with the scenes given to each act. */
export function lanternRoom(actOne: readonly string[], actTwo: readonly string[]): string {
  return `${[
    'Title: The Lantern Room\nAuthor: A. Writer',
    '# Act One',
    ...actOne,
    '# Act Two',
    ...actTwo,
    PLAY_META,
  ].join('\n\n')}\n`;
}

export const LANTERN_ROOM = lanternRoom(PLAY_SCENES.slice(0, 3), PLAY_SCENES.slice(3));
