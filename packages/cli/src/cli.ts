import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, resolve } from 'node:path';
import { type Doc, parse, toJSON } from '@drafter/fountain';
import { type Layout, paginate, UnsupportedTemplateError } from '@drafter/layout';
import { FONT_FILES, type FontSet, renderPdf } from '@drafter/render-pdf';
import { builtins, loadTemplate, type Template, TemplateError } from '@drafter/templates';
import { Command, CommanderError } from 'commander';
import pkg from '../package.json' with { type: 'json' };
import { renderText } from './txt';

export { renderText } from './txt';

/** Where the CLI reads and writes: the process's own streams, or a test's. */
export interface IO {
  /** Standard output: text, or the bytes of a PDF written to `-`. */
  out(data: string | Uint8Array): void;
  /** Standard error. */
  err(text: string): void;
  /** Where relative paths start. */
  cwd: string;
}

const nodeIO = (): IO => ({
  out: (data) => process.stdout.write(data),
  err: (text) => process.stderr.write(text),
  cwd: process.cwd(),
});

/** A problem the user can fix: printed as a message, without a stack trace. */
class CliError extends Error {}

const DEFAULT_TEMPLATE = 'us-screenplay';

interface BuildOptions {
  pdf?: string;
  txt?: string;
  json?: string;
  template?: string;
  sceneNumbers?: boolean;
}

/**
 * Runs the `drafter` command line on `argv` (without the node and script
 * paths) and resolves to the exit code: 0 on success, 1 on any error.
 */
export async function run(argv: readonly string[], io: IO = nodeIO()): Promise<number> {
  let code = 0;
  const handle =
    <A extends unknown[]>(task: (...args: A) => Promise<number>) =>
    async (...args: A) => {
      try {
        code = await task(...args);
      } catch (error) {
        if (
          !(error instanceof CliError) &&
          !(error instanceof TemplateError) &&
          !(error instanceof UnsupportedTemplateError)
        ) {
          throw error;
        }
        io.err(`drafter: ${error.message}\n`);
        code = 1;
      }
    };

  const program = new Command('drafter')
    .description(
      'Lays out Fountain screenplays and stage plays, and writes them as PDF, text, or JSON.',
    )
    .version(pkg.version)
    .exitOverride()
    .configureOutput({ writeOut: (s) => io.out(s), writeErr: (s) => io.err(s) });
  const templateHelp = `a built-in template (${Object.keys(builtins).join(', ')}) or a template JSON file`;

  program
    .command('build')
    .description('Lay out a script and write it as PDF, fixed-width text, or JSON.')
    .argument('<input>', 'the .fountain file')
    .option('--pdf <file>', "write a PDF (with no output named, the input's name ending in .pdf)")
    .option('--txt <file>', 'write fixed-width text, page by page')
    .option('--json <file>', 'write the parsed script as JSON')
    .option('--template <id|file>', templateHelp)
    .option('--scene-numbers', 'print scene numbers')
    .option('--no-scene-numbers', "don't print scene numbers, whatever the template says")
    .addHelpText('after', '\nAn output of - goes to standard output.')
    .action(handle((input: string, options: BuildOptions) => build(input, options, io)));

  program
    .command('check')
    .description('Lay out a script and list its problems. Exits 1 if any is an error.')
    .argument('<input>', 'the .fountain file')
    .option('--template <id|file>', templateHelp)
    .action(handle((input: string, options: BuildOptions) => check(input, options, io)));

  try {
    await program.parseAsync([...argv], { from: 'user' });
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode;
    throw error;
  }
  return code;
}

async function build(input: string, options: BuildOptions, io: IO): Promise<number> {
  const outputs: Array<['pdf' | 'txt' | 'json', string]> = [];
  for (const kind of ['pdf', 'txt', 'json'] as const) {
    const target = options[kind];
    if (target !== undefined) outputs.push([kind, target]);
  }
  if (outputs.length === 0) outputs.push(['pdf', defaultPdf(input)]);
  if (outputs.filter(([, target]) => target === '-').length > 1) {
    throw new CliError('only one output can go to standard output (-)');
  }
  const source = resolve(io.cwd, input);
  for (const [, target] of outputs) {
    if (target !== '-' && resolve(io.cwd, target) === source) {
      throw new CliError(`won't write over the input, ${input}`);
    }
  }

  const { doc, template, layout, text } = await load(input, options, io);
  // Errors and warnings go to standard error as the script builds; notes are for `check`.
  const at = locator(text);
  for (const problem of problemsOf(doc, layout)) {
    if (problem.severity !== 'info') io.err(`${describe(input, at, problem)}\n`);
  }
  for (const [kind, target] of outputs) {
    const data =
      kind === 'pdf'
        ? await renderPdf(layout, template, { fonts: await loadFonts() })
        : kind === 'txt'
          ? renderText(layout, template)
          : `${JSON.stringify(toJSON(doc), null, 2)}\n`;
    await emit(target, data, io);
  }
  const written = outputs.map(([, target]) => (target === '-' ? 'standard output' : target));
  io.err(`${input}: ${pages(layout)} (${template.id}) → ${written.join(', ')}\n`);
  return 0;
}

async function check(input: string, options: BuildOptions, io: IO): Promise<number> {
  const { doc, template, layout, text } = await load(input, { template: options.template }, io);
  const at = locator(text);
  const problems = problemsOf(doc, layout);
  const report = [`${input}: ${pages(layout)} (${template.id})`];
  for (const problem of problems) report.push(describe(input, at, problem));
  report.push(summary(problems));
  io.out(`${report.join('\n')}\n`);
  return problems.some((problem) => problem.severity === 'error') ? 1 : 0;
}

/** Reads, parses, and lays out a script with the template the options and the file choose. */
async function load(input: string, options: BuildOptions, io: IO) {
  let text: string;
  try {
    text = await readFile(resolve(io.cwd, input), 'utf8');
  } catch (error) {
    throw new CliError(`can't read ${input}: ${reason(error)}`);
  }
  const doc = parse(text);
  const template = await chooseTemplate(input, options.template, doc, io);
  const { sceneNumbers } = options;
  const layout = paginate(doc, template, sceneNumbers === undefined ? {} : { sceneNumbers });
  return { doc, template, layout, text };
}

const builtin = (id: string): Template | undefined =>
  Object.hasOwn(builtins, id) ? builtins[id] : undefined;

/** The template: `--template`, else the file's metadata block, else us-screenplay (§8.6). */
async function chooseTemplate(
  input: string,
  flag: string | undefined,
  doc: Doc,
  io: IO,
): Promise<Template> {
  if (flag !== undefined) {
    const found = builtin(flag);
    if (found) return found;
    if (!/\.json$|[\\/]/i.test(flag)) {
      const names = Object.keys(builtins).join(', ');
      throw new CliError(
        `there's no built-in template "${flag}". The built-in templates are ${names}; or pass a template's JSON file.`,
      );
    }
    let text: string;
    try {
      text = await readFile(resolve(io.cwd, flag), 'utf8');
    } catch (error) {
      throw new CliError(`can't read ${flag}: ${reason(error)}`);
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new CliError(`${flag} isn't valid JSON: ${(error as Error).message}`);
    }
    return loadTemplate(json);
  }
  const named = doc.meta?.template;
  if (typeof named === 'string') {
    const found = builtin(named);
    if (found) return found;
    io.err(
      `drafter: warning: ${input} asks for template "${named}", which isn't built in, so it is laid out with ${DEFAULT_TEMPLATE}\n`,
    );
  }
  return builtins[DEFAULT_TEMPLATE] as Template;
}

const require = createRequire(import.meta.url);

/** Courier Prime, from `@drafter/render-pdf`'s `fonts/` folder. */
async function loadFonts(): Promise<FontSet> {
  const styles = Object.keys(FONT_FILES) as Array<keyof FontSet>;
  const files = await Promise.all(
    styles.map((style) =>
      readFile(require.resolve(`@drafter/render-pdf/fonts/${FONT_FILES[style]}`)),
    ),
  );
  return Object.fromEntries(
    styles.map((style, k) => [style, new Uint8Array(files[k] as Buffer)]),
  ) as unknown as FontSet;
}

async function emit(target: string, data: string | Uint8Array, io: IO) {
  if (target === '-') {
    io.out(data);
    return;
  }
  try {
    await writeFile(resolve(io.cwd, target), data);
  } catch (error) {
    throw new CliError(`can't write ${target}: ${reason(error)}`);
  }
}

/** `script.fountain` → `script.pdf`; any other name gets `.pdf` added, so it never matches the input. */
const defaultPdf = (input: string) =>
  `${extname(input).toLowerCase() === '.fountain' ? input.slice(0, -'.fountain'.length) : input}.pdf`;

function reason(error: unknown): string {
  const code = (error as { code?: string }).code;
  if (code === 'ENOENT') return 'no such file';
  if (code === 'EISDIR') return "it's a folder";
  if (code === 'EACCES') return 'permission denied';
  return (error as Error).message;
}

const pages = (layout: Layout) =>
  `${layout.pages.length} ${layout.pages.length === 1 ? 'page' : 'pages'}`;

interface Problem {
  code: string;
  severity: 'error' | 'warning' | 'info';
  span: { from: number };
  message: string;
}

/** Parse and layout diagnostics together, in document order. */
const problemsOf = (doc: Doc, layout: Layout): Problem[] =>
  [...doc.diagnostics, ...layout.diagnostics].sort((a, b) => a.span.from - b.span.from);

/** Maps an offset to a 1-based line and column, counting code points and skipping a byte-order mark. */
function locator(text: string) {
  const starts = [text.charCodeAt(0) === 0xfeff ? 1 : 0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((starts[mid] as number) <= offset) lo = mid;
      else hi = mid - 1;
    }
    const start = starts[lo] as number;
    return { line: lo + 1, col: [...text.slice(start, Math.max(start, offset))].length + 1 };
  };
}

const LABELS = { error: 'error', warning: 'warning', info: 'note' } as const;

/** `file:line:col: severity: message [code]`, the form editors and terminals link to. */
function describe(input: string, at: ReturnType<typeof locator>, problem: Problem): string {
  const { line, col } = at(problem.span.from);
  return `${input}:${line}:${col}: ${LABELS[problem.severity]}: ${problem.message} [${problem.code}]`;
}

function summary(problems: readonly Problem[]): string {
  const counts = (['error', 'warning', 'info'] as const)
    .map((severity) => {
      const n = problems.filter((problem) => problem.severity === severity).length;
      const label = LABELS[severity];
      return n === 0 ? '' : `${n} ${label}${n === 1 ? '' : 's'}`;
    })
    .filter(Boolean);
  return counts.length === 0 ? 'no problems' : counts.join(', ');
}
