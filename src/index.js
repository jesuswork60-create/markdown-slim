// Public API.

import { extractToc } from './ast/headings.js';
import { parse } from './parse.js';
import { HtmlRenderer } from './render/html.js';
import { renderToc } from './render/page.js';

export { assignHeadingIds, extractToc, Slugger } from './ast/headings.js';
export { find, findAll, REMOVE, SKIP, STOP, textContent, walk } from './ast/walk.js';
export { parseFrontMatter } from './front-matter.js';
export { parseInlines } from './inline/parser.js';
export { parse } from './parse.js';
export { escapeHtml } from './render/escape.js';
export { defaultHandlers, HtmlRenderer, renderHtml } from './render/html.js';
export { renderPage, renderToc } from './render/page.js';
export { DEFAULT_SCHEMES, encodeUrl, isSafeUrl, sanitizeUrl, urlScheme } from './render/url.js';

/**
 * Converts Markdown and returns everything a caller may want from one parse:
 * `{ html, ast, toc, frontMatter }`. Takes the options of both `parse` and
 * `HtmlRenderer`, plus `toc: true` to place a table of contents before the
 * content in `html`.
 */
export function convert(source, options = {}) {
  const ast = parse(source, options);
  const toc = extractToc(ast);
  const body = new HtmlRenderer(options).render(ast);
  const html = options.toc ? renderToc(toc) + body : body;
  return { html, ast, toc, frontMatter: ast.frontMatter };
}

/** Converts Markdown to an HTML string. */
export function markdownToHtml(source, options) {
  return convert(source, options).html;
}
