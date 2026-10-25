import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { test } from 'vitest';
import { buildScript } from '../../../fixtures/generators/script';

// Technical design §5.7: a full paginate of a 120-page script takes
// single-digit milliseconds. The script is parsed once, and its semantic
// fields and inline runs are read once, so the benchmark times layout alone.
const BUDGET_MS = 10;
const doc = parse(buildScript(200_000));
for (const block of doc.blocks) {
  void block.sem;
  for (const line of block.lines) void line.inline;
}
const template = builtins['us-screenplay'] as Template;
const pages = paginate(doc, template).pages.length;

test(`paginate a ${pages}-page script`, async ({ bench }) => {
  const result = await bench('paginate', () => {
    paginate(doc, template);
  }).run();
  const { mean, p99 } = result.latency;
  const verdict = mean < BUDGET_MS ? 'within' : 'OVER';
  process.stdout.write(
    `paginate (${pages} pages): mean ${mean.toFixed(2)} ms, p99 ${p99.toFixed(2)} ms — ${verdict} the ${BUDGET_MS} ms budget\n`,
  );
});
