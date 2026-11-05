// The mdslim command line. `main` takes its streams as arguments and returns an
// exit code, so tests can run it in-process.

import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { parseArgs } from 'node:util';

import { find, textContent } from './ast/walk.js';
import { convert } from './index.js';
import { renderPage } from './render/page.js';

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

const USAGE = `Usage: mdslim [options] [file]

Converts Markdown to HTML. Reads standard input when no file is given or the
file is "-", and writes to standard output unless -o is used.

Options:
  -o, --output <path>   Write to a file
      --full-page       Produce a complete HTML document
      --title <text>    Page title for --full-page
      --toc             Put a table of contents before the content
      --ast             Print the syntax tree as JSON instead of HTML
      --allow-html      Pass raw HTML through (only for trusted input)
      --no-front-matter Treat a leading --- block as ordinary Markdown
      --no-heading-ids  Leave id attributes off headings
  -h, --help            Show this help
`;

const OPTIONS = {
  output: { type: 'string', short: 'o' },
  'full-page': { type: 'boolean' },
  title: { type: 'string' },
  toc: { type: 'boolean' },
  ast: { type: 'boolean' },
  'allow-html': { type: 'boolean' },
  'no-front-matter': { type: 'boolean' },
  'no-heading-ids': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

class UsageError extends Error {}

function parseCommandLine(args) {
  let parsed;
  try {
    parsed = parseArgs({ args, options: OPTIONS, allowPositionals: true });
  } catch (error) {
    throw new UsageError(error.message);
  }
  const { values, positionals } = parsed;
  if (positionals.length > 1) throw new UsageError('expected at most one input file');
  if (values.ast && (values['full-page'] || values.toc)) {
    throw new UsageError('--ast cannot be combined with --full-page or --toc');
  }
  if (values.title !== undefined && !values['full-page']) {
    throw new UsageError('--title requires --full-page');
  }
  return { values, input: positionals[0] ?? '-' };
}

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

// Preference order: --title, front matter, first level 1 heading, input file name.
function pageTitle(explicit, result, input) {
  if (explicit !== undefined) return explicit;
  if (typeof result.frontMatter?.title === 'string') return result.frontMatter.title;
  const heading = find(result.ast, (node) => node.type === 'heading' && node.level === 1);
  if (heading) return textContent(heading);
  return input === '-' ? undefined : basename(input, extname(input));
}

function produceOutput(source, values, input) {
  const result = convert(source, {
    frontMatter: !values['no-front-matter'],
    headingIds: !values['no-heading-ids'],
    allowHtml: values['allow-html'] ?? false,
    toc: values.toc ?? false,
  });
  if (values.ast) return `${JSON.stringify(result.ast, null, 2)}\n`;
  if (!values['full-page']) return result.html;
  return renderPage(result.html, {
    title: pageTitle(values.title, result, input),
    description: result.frontMatter?.description,
  });
}

/** Runs the CLI and resolves to the process exit code. */
export async function main(args, { stdin, stdout, stderr }) {
  let command;
  try {
    command = parseCommandLine(args);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    stderr.write(`mdslim: ${error.message}\n\n${USAGE}`);
    return EXIT_USAGE;
  }

  const { values, input } = command;
  if (values.help) {
    stdout.write(USAGE);
    return EXIT_OK;
  }

  try {
    const source = input === '-' ? await readStream(stdin) : await readFile(input, 'utf8');
    const output = produceOutput(source, values, input);
    if (values.output !== undefined) await writeFile(values.output, output);
    else stdout.write(output);
    return EXIT_OK;
  } catch (error) {
    if (error.code === undefined) throw error;
    stderr.write(`mdslim: ${error.message}\n`);
    return EXIT_FAILURE;
  }
}
