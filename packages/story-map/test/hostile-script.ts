// Original hostile text for the story map's own tests and the trap suite: one script with the same
// hostile string in every place the writer's words reach the page.

/** Each string a story map must keep as text. */
export const HOSTILE = [
  '</text><script>alert(1)</script>',
  '"><svg onload=alert(1)>',
  ']]>',
  '<foreignObject>',
  '&lt;',
  'two lines',
  '</style><b>bold</b>',
  '</title><i>x</i>',
  '‮evil‬',
] as const;

/**
 * A screenplay holding `h` in its title, author, two speakers' names, a place, a synopsis, a
 * marked line of dialogue, an introduction's hook, and a Setup and Payoff label (left out when `h`
 * holds `]]`, which would close the note). `name` is a third speaker's name, for a long one.
 */
export function hostileScript(h: string, name = 'OTTO'): string {
  const label = h.includes(']]') ? 'the bell' : `the bell ${h}`;
  const scene = (n: number, place: string, who: string, other: string, extra = '') =>
    [
      `INT. ${place} - ${n % 2 ? 'DAY' : 'NIGHT'}`,
      '',
      `= Wren checks the ${h} lamp before the storm, scene ${n}.`,
      '',
      `${extra}A kettle ticks on the stove, ${n}.`,
      '',
      who,
      `We should have rung the bell at ${n}, really.`,
      '',
      other,
      'Then ring it now and let them all hear.',
      '',
    ].join('\n');
  return [
    `Title: The Bell ${h} Tower`,
    `Author: Wren ${h} Abernathy`,
    '',
    `INT. ${h} SIGNAL BOX - DAY`,
    '',
    `= The ${h} lamp goes out at dusk.`,
    '',
    `WREN ${h.toUpperCase()} (40s), a keeper who writes ${h} on walls, climbs the stairs.`,
    '',
    `[[Setup: ${label}]]`,
    '',
    `@Wren ${h}`,
    `Somebody wrote ${h} on the lamp again tonight.`,
    '[[Quote]]',
    '',
    `@Pim ${h}`,
    'Then wipe it off before the ferry comes.',
    '',
    `@${name}`,
    'I saw the ferry turn back at the breakwater.',
    '',
    scene(2, 'HARBOUR OFFICE', `@Wren ${h}`, `@Pim ${h}`),
    scene(3, 'FISH MARKET', `@Pim ${h}`, `@${name}`),
    scene(4, 'BREAKWATER', `@Wren ${h}`, `@${name}`, `[[Payoff: ${label}]]\n\n`),
    scene(5, 'LAMP ROOM', `@Wren ${h}`, `@Pim ${h}`),
  ].join('\n');
}
