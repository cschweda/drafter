// Builds a feature-length Final Draft file in memory, for the import speed test. The text is
// original: a handful of scenes, written for Drafter, repeated with numbered locations and names
// so no two scenes are the same. The output is never written to disk or committed.

/** A `<Text>` run carrying the formatting attributes a Final Draft save puts on every run. */
const run = (text: string, style = '') =>
  `<Text AdornmentStyle="0" Background="#FFFFFFFFFFFF" Color="#000000000000" Font="Courier Final Draft" RevisionID="0" Size="12" Style="${style}">${text}</Text>`;

const para = (type: string, body: string, attrs = '') =>
  `    <Paragraph${attrs} Type="${type}">\n      ${body}\n    </Paragraph>`;

const speech = (cue: string, lines: string, paren?: string) =>
  [
    para('Character', run(cue)),
    ...(paren ? [para('Parenthetical', run(`(${paren})`))] : []),
    para('Dialogue', run(lines)),
  ].join('\n');

const PLACES = ['SORTING OFFICE', 'NIGHT MARKET', 'SIGNAL BOX', 'LAUNDERETTE', 'ROOFTOP GARDEN'];
const TIMES = ['DAY', 'NIGHT', 'DAWN', 'LATER', 'CONTINUOUS'];

/** One scene, about a page long, varied by its number. */
function scene(n: number): string {
  const place = `${PLACES[n % PLACES.length]} ${Math.floor(n / PLACES.length) + 1}`;
  const time = TIMES[n % TIMES.length];
  const a = `COURIER ${n}`;
  const b = `DISPATCHER ${(n * 7) % 31}`;
  const summary =
    n % 3 === 0 ? ` Summary="Parcel ${n} goes to the wrong address, on purpose."` : '';
  return [
    `    <Paragraph Number="${n}" Type="Scene Heading">\n      <SceneProperties Length="1" Page="${n}" Title=""${summary}/>\n      ${run(`${n % 2 ? 'INT.' : 'EXT.'} ${place} - ${time}`)}\n    </Paragraph>`,
    para(
      'Action',
      `${run(`Rain on corrugated iron. Parcel ${n} sits on a trolley, its label half peeled. `)}${run(`${a}`, 'Bold')}${run(' (20s, bike clips still on) checks the address against a list that has been folded too many times.')}`,
    ),
    speech(
      a,
      `This says Flat ${n}. There is no Flat ${n}. I've been up and down those stairs twice.`,
    ),
    speech(b, 'Then go up a third time, and count properly.', 'not looking up'),
    para(
      'Action',
      `${run(`${a} doesn't move. Somewhere a kettle clicks off. The trolley wheel squeaks once, on its own.`)}`,
    ),
    speech(a, `Who sends a parcel to a door that isn't there?`),
    speech(b, `Somebody who knows you'll ${n % 2 ? 'knock' : 'look'} anyway.`),
    para(
      'Action',
      `${run('A long pause. ')}${run('Then', 'Italic')}${run(` ${a} lifts the parcel. It is lighter than it should be, and it rattles like seeds in a tin.`)}`,
    ),
    speech(a, 'If this is a joke, I want it in writing.'),
    speech(
      b,
      `Sign here. And here. And initial the corner, the way they taught you in week ${n % 9}.`,
    ),
    para(
      'Action',
      run(
        'The dispatcher slides a clipboard across. The pen is on a string that is far too short. They manage.',
      ),
    ),
    n % 4 === 3 ? para('Transition', run('CUT TO:')) : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** A Final Draft file of `scenes` scenes; the default, 140, lays out as about 120 US screenplay pages. */
export function makeFeature(scenes = 140): string {
  const body = Array.from({ length: scenes }, (_, k) => scene(k + 1)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
${body}
  </Content>
  <TitlePage>
    <Content>
      <Paragraph Alignment="Center">${run('RETURN TO SENDER', 'Underline')}</Paragraph>
      <Paragraph Alignment="Center">${run('')}</Paragraph>
      <Paragraph Alignment="Center">${run('Written by')}</Paragraph>
      <Paragraph Alignment="Center">${run('')}</Paragraph>
      <Paragraph Alignment="Center">${run('Noor Valcourt')}</Paragraph>
    </Content>
  </TitlePage>
  <ElementSettings Type="Action">
    <FontSpec Font="Courier Final Draft" Size="12" Style=""/>
  </ElementSettings>
  <PageLayout BottomMargin="72" TopMargin="72"/>
  <SmartType>
    <Characters>${Array.from({ length: scenes }, (_, k) => `<Character>COURIER ${k + 1}</Character>`).join('')}</Characters>
  </SmartType>
</FinalDraft>
`;
}
