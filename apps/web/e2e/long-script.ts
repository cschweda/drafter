// Long scripts for the budget tests, made of invented words so no real script is copied, and the
// same on every run (a seeded generator).

/** A seeded generator of invented words (Marsaglia's xorshift), so every run types the same text. */
export function generator(seed: number) {
  let state = seed;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  const syllables = ['bra', 'tol', 'mev', 'ska', 'rin', 'dou', 'pel', 'vax', 'quo', 'ten', 'lir'];
  const word = (parts = 1 + (next() % 3)) => {
    let w = '';
    for (let i = 0; i < parts; i++) w += syllables[next() % syllables.length];
    return w;
  };
  return { next, word };
}

/**
 * `scenes` scenes among `characters` invented characters (a third of them two words long), each
 * scene naming three in its action, one capitalised and possessive, with four speeches. The
 * defaults are about 120 pages: 185 scenes among 60 characters.
 */
export function longScript({ scenes = 185, characters = 60, seed = 2026 } = {}): string {
  const { next, word } = generator(seed);
  const names = Array.from({ length: characters }, (_, i) =>
    `${word(2)}${i % 3 === 0 ? ` ${word(2)}` : ''}`.toUpperCase(),
  );
  const pick = () => names[next() % names.length] as string;
  const capitalised = (name: string) =>
    name
      .toLowerCase()
      .split(' ')
      .map((w) => (w[0] ?? '').toUpperCase() + w.slice(1))
      .join(' ');
  const sentence = (n: number) => Array.from({ length: n }, () => word()).join(' ');
  let text = '';
  for (let s = 0; s < scenes; s++) {
    text += `${next() % 2 ? 'INT.' : 'EXT.'} ${word(2).toUpperCase()} - ${next() % 2 ? 'DAY' : 'NIGHT'}\n\n`;
    text += `${sentence(6)} ${pick()} ${sentence(10)} ${capitalised(pick())}'s ${sentence(12)}.\n${sentence(14)}.\n\n`;
    for (let k = 0; k < 4; k++) text += `${pick()}\n${sentence(5 + (next() % 15))}.\n\n`;
    text += `${sentence(20)} ${pick()} ${sentence(9)}.\n\n`;
  }
  return text;
}
