// A deterministic, feature-length script for benchmarks: scenes are repeated,
// with numbered locations, until the text reaches `minChars` characters. A
// 120-page feature is about 200 KB; these scenes have shorter lines than most
// scripts, so 200 KB of them lays out to about 190 pages.

function scene(n: number): string {
  return `INT. KITCHEN ${n} - NIGHT

Margaret sits at the table in front of a plate she hasn't touched. The clock on the wall reads twenty to midnight, and the rain hasn't stopped since noon.

MARGARET
(quietly)
You said you'd call.

DANNY (O.S.)
Mom? It's me. I lost my phone, and the bus was late, and the bakery was closing.

She opens the door. DANNY, soaked through, holds out a bakery box gone soft in the rain.

DANNY
I *did* call. From a pay phone. Do you know how hard it is to find a pay phone these days?

MARGARET
Harder than finding your mother's house, apparently.

He sets the box on the table and lifts the lid. Something that used to be a cake.

[[Check that the cake gag lands before the turn.]]

MARGARET
Is that a cake?

DANNY
It was a cake.

They both start talking at once.

MARGARET
You can't just turn up at midnight with--

DANNY ^
I know, I know. I'm sorry. I--

CUT TO:
`;
}

export function buildScript(minChars: number): string {
  const scenes: string[] = [];
  let length = 0;
  for (let n = 1; length < minChars; n++) {
    const s = scene(n);
    scenes.push(s);
    length += s.length + 1;
  }
  return scenes.join('\n');
}
