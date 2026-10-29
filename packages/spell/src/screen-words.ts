// Drafter's own short list of the screenwriting and stage-play craft's words that the bundled
// dictionaries lack (Plan D, final review), so `PRE-LAP`, `INTERCUT`, `walkie-talkie`, and
// `sotto voce` aren't marked in nearly every script. Written for Drafter from general knowledge of
// the craft, not taken from any app or list.
//
// The rule: a word goes in only when it is a term of the craft that scripts use in their own text
// (action, stage directions, parentheticals, notes) and at least one bundled dictionary doesn't
// know it (a test checks this, so a word both know is taken out). Plurals and possessives need no
// entry (`lookupForms` tries `intercuts` as `intercut`), and nor do hyphenated forms whose parts are
// here or in the dictionary (`pre-lap`, `slo-mo`). All-capital extensions (`V.O.`, `O.S.`, `POV`)
// are skipped already as short capitals. Lowercase, sorted.

export const SCREEN_WORDS: readonly string[] = [
  "cont'd", // (cont'd) written as a parenthetical, or in action
  'crossfade',
  'cyclorama', // a stage play's sky cloth
  'flashforward',
  'intercut',
  'intercutting',
  'logline',
  'offscreen',
  'pov', // lowercase, in action: "from her pov"
  'pre', // the hyphenated prefix: PRE-LAP, pre-title, pre-dawn
  'prelap',
  'sightline',
  'slo', // slo-mo
  'slugline',
  'sotto', // sotto voce
  'voce',
  'voiceover',
  'walkie', // walkie-talkie, or a walkie alone
  'walla', // background crowd murmur
];
