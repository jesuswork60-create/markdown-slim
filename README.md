# markdown-slim

markdown-slim turns Markdown into HTML. It is a small library plus a command line tool called `mdslim`, written in plain JavaScript for Node 22 with no dependencies.

The syntax follows CommonMark for the most part, with a few additions from GitHub's flavour: tables, task lists, strikethrough and footnotes. Parsing happens in two stages (blocks first, then the text inside them) and produces a plain JSON-friendly tree, which a separate renderer turns into HTML. You can look at or change the tree before rendering, and you can override how any node type is rendered.

The output is safe by default in two ways. Raw HTML in the source is escaped unless you ask for it to be passed through, and link and image URLs with schemes outside a short allow-list (so `javascript:` and friends) lose their `href` or `src`.

## Install

It isn't published to a package registry, so clone the repository and run it from there. There is nothing to install beyond Node 22:

```sh
node bin/mdslim.js --help
```

`npm link` will put `mdslim` on your path if you'd rather have that.

## Command line

```sh
printf '# Hello\n\nSome *emphasis* and a [link](https://example.com).\n' | node bin/mdslim.js
```

prints

```html
<h1 id="hello">Hello</h1>
<p>Some <em>emphasis</em> and a <a href="https://example.com">link</a>.</p>
```

Give it a file name, or nothing (or `-`) to read standard input.

| Flag | What it does |
| --- | --- |
| `-o`, `--output <file>` | Write to a file instead of standard output |
| `--full-page` | Wrap the result in a complete HTML document |
| `--title <text>` | Page title, for use with `--full-page` |
| `--toc` | Put a table of contents before the content |
| `--ast` | Print the syntax tree as JSON instead of HTML |
| `--allow-html` | Pass raw HTML through unescaped |
| `--no-front-matter` | Treat a leading `---` block as ordinary Markdown |
| `--no-heading-ids` | Don't add `id` attributes to headings |

With `--full-page` the title comes from `--title`, then a `title` key in the front matter, then the first level 1 heading, then the file name. A `description` key in the front matter becomes a meta tag.

The exit status is 0 on success, 1 if a file can't be read or written, and 2 for bad arguments.

## Library

From the repository root:

```js
import { convert, renderHtml, walk } from './src/index.js';

const source = `---
title: Notes
---
# Notes

Read the [guide](/guide).
`;

const { html, ast, toc, frontMatter } = convert(source);

console.log(frontMatter.title); // Notes
console.log(toc[0].id); // notes
console.log(html);
// <h1 id="notes">Notes</h1>
// <p>Read the <a href="/guide">guide</a>.</p>

// Change the tree, then render it with one handler replaced.
walk(ast, (node) => {
  if (node.type === 'link') node.url = `/docs${node.url}`;
});

const shifted = renderHtml(ast, {
  handlers: {
    heading: (node, context) => `<h${node.level + 1}>${context.children(node)}</h${node.level + 1}>\n`,
  },
});

console.log(shifted);
// <h2>Notes</h2>
// <p>Read the <a href="/docs/guide">guide</a>.</p>
```

The main entry points:

- `markdownToHtml(source, options)` returns the HTML string.
- `convert(source, options)` returns `{ html, ast, toc, frontMatter }`.
- `parse(source, options)` returns the tree. Its options are `frontMatter`, `headingIds` and `headingIdPrefix`.
- `renderHtml(ast, options)` returns HTML from a tree. Its options are `handlers`, `allowHtml`, `allowedSchemes` and `softBreak`.
- `extractToc(ast, { minLevel, maxLevel })` and `renderToc(entries)` build a table of contents, and `convert` and `markdownToHtml` also take `toc: true`.
- `walk(root, visitor)` goes through the tree. The visitor is a function or `{ enter, leave }`, is called with `(node, { parent, index, ancestors })`, and may return `SKIP`, `REMOVE`, `STOP` or a replacement node. `find`, `findAll` and `textContent` are built on it.

A handler receives the node and a context with `children(node)`, `node(node)`, `fallback(node)` for the built-in output, `ancestor(n)`, `escape(text)`, `attrs(object)` and `safeUrl(url, kind)`. To see the node types and their fields, run a document through `mdslim --ast`.

Front matter is a `---` block on the very first line holding simple `key: value` pairs. Values can be strings, numbers, `true`, `false`, `null` or an inline list such as `[a, b]`. A block that doesn't fit this pattern is left to the Markdown parser.

## Tests

```sh
npm test
```

The tests use `node:test` and live in `tests/`, one file each for blocks, inlines, rendering, document-level features, the command line and slow or awkward input.

## Known limitations

- The tests were written by hand with the CommonMark spec open, and the project hasn't been run against the spec's own example suite, so expect some differences from it.
- Only common named entities are recognised (`&amp;`, `&copy;`, `&ndash;` and so on). Other names stay as literal text, though numeric references all work.
- Bare URLs aren't turned into links. Only the `<https://example.com>` form is.
- Inside a table, a `|` in a code span splits the cell unless it is written `\|`.
- Block nodes record the lines they span, with no column information, and inline nodes have no position at all.
- Very deep nesting overflows the call stack. A thousand nested quotes work and two thousand throw a `RangeError`, which the command line tool doesn't catch. There is no depth limit to guard against this, so don't feed it untrusted input without catching the error.
- Front matter isn't YAML. There are no nested maps, block lists or multi-line strings.
- `allowHtml` passes raw HTML as it is, scripts included. It doesn't sanitise anything, so use it only with input you trust.
- Footnote ids are always `fn-1`, `fnref-1` and so on, so they collide if you put two rendered documents on one page. Heading ids have a prefix option and footnotes don't.
- Spaces after a footnote marker are skipped, so an indented code block can't start on the same line as `[^note]:`.
- Input is read into memory whole. There is no streaming mode.

## License

MIT. See [LICENSE](LICENSE).
