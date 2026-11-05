// The parsing pipeline: front matter, blocks, inlines, then the passes that need
// the finished tree (footnote numbering and heading ids).

import { attachFootnotes } from './ast/footnotes.js';
import { assignHeadingIds } from './ast/headings.js';
import { walk } from './ast/walk.js';
import { BlockParser } from './block/parser.js';
import { parseFrontMatter } from './front-matter.js';
import { parseInlines } from './inline/parser.js';

function normalizeSource(source) {
  if (typeof source !== 'string') {
    throw new TypeError(`expected Markdown source as a string, got ${typeof source}`);
  }
  const withoutBom = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  return withoutBom.replaceAll('\0', '\ufffd');
}

function resolveInlines(root, scope) {
  walk(root, (node) => {
    if (node.raw === undefined) return;
    node.children = parseInlines(node.raw, scope);
    delete node.raw;
  });
}

/**
 * Parses Markdown into an AST.
 *
 * Options: `frontMatter` (default true) recognises a leading key/value block;
 * `headingIds` (default true) stores an `id` on each heading; `headingIdPrefix`
 * is prepended to those ids.
 */
export function parse(source, options = {}) {
  const { frontMatter = true, headingIds = true, headingIdPrefix = '' } = options;

  const text = normalizeSource(source);
  const front = frontMatter ? parseFrontMatter(text) : { data: null, body: text, bodyLine: 1 };

  const parser = new BlockParser({ firstLine: front.bodyLine });
  const { document, references, footnotes } = parser.parse(front.body);

  const scope = { references, footnotes };
  resolveInlines(document, scope);
  for (const definition of Object.values(footnotes)) resolveInlines(definition, scope);
  attachFootnotes(document, footnotes);

  if (headingIds) assignHeadingIds(document, { prefix: headingIdPrefix });

  document.frontMatter = front.data;
  document.references = references;
  return document;
}
