import { parse } from '@drafter/fountain';
import { test } from 'vitest';
import { buildScript } from '../../../fixtures/generators/script';

// Technical design §2.7: a 200 KB script should parse in under 5 ms. Semantic
// fields and inline runs are computed on first read, so the second benchmark
// adds what pagination will read on top of the parse itself.
const BUDGET_MS = 5;
const script = buildScript(200_000);
const size = `${Math.round(script.length / 1000)} KB`;

function report(label: string, latency: { mean: number; p99: number }, note: string) {
  process.stdout.write(
    `${label} (${size}): mean ${latency.mean.toFixed(2)} ms, p99 ${latency.p99.toFixed(2)} ms — ${note}\n`,
  );
}

test(`parse a ${size} script`, async ({ bench }) => {
  const result = await bench('parse', () => {
    parse(script);
  }).run();
  const verdict = result.latency.mean < BUDGET_MS ? 'within' : 'OVER';
  report('parse', result.latency, `${verdict} the ${BUDGET_MS} ms budget`);
});

test(`parse a ${size} script and read every semantic field and inline run`, async ({ bench }) => {
  const result = await bench('parse + read', () => {
    for (const block of parse(script).blocks) {
      void block.sem;
      for (const line of block.lines) void line.inline;
    }
  }).run();
  report(
    'parse + read everything',
    result.latency,
    'for reference; pagination does this in a worker',
  );
});
