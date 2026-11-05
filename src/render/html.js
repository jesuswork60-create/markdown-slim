// HTML rendering. A separate pass over the finished AST: every node type maps to
// a handler `(node, context) => string`, and callers may override any of them.

import { textContent } from '../ast/walk.js';
import { escapeHtml } from './escape.js';
import { DEFAULT_SCHEMES, sanitizeUrl } from './url.js';

function isTightParagraph(context) {
  const grandparent = context.ancestor(2);
  return grandparent?.type === 'list' && grandparent.tight;
}

function taskCheckbox(node, context) {
  const item = context.ancestor(1);
  if (item?.type !== 'list_item' || item.checked === undefined || item.children[0] !== node) {
    return '';
  }
  const attrs = context.attrs({ type: 'checkbox', disabled: true, checked: item.checked });
  return `<input${attrs} /> `;
}

function renderTable(node, context) {
  const [header, ...rows] = node.children;
  let html = `<table>\n<thead>\n${context.node(header)}</thead>\n`;
  if (rows.length > 0) {
    html += `<tbody>\n${rows.map((row) => context.node(row)).join('')}</tbody>\n`;
  }
  return `${html}</table>\n`;
}

function renderListItem(node, context) {
  let inner = '';
  node.children.forEach((child, index) => {
    const html = context.node(child);
    // Tight paragraphs render bare, so they need their own line ending when a
    // block follows; other blocks start on a fresh line and end with a newline.
    const bare = !html.endsWith('\n');
    if (index === 0 && !bare) inner += '\n';
    inner += html;
    if (bare && index < node.children.length - 1) inner += '\n';
  });
  return `<li>${inner}</li>\n`;
}

const FOOTNOTE_BACKREF = '\u21a9\ufe0e';

function footnoteRefId(number, refIndex) {
  return refIndex === 1 ? `fnref-${number}` : `fnref-${number}-${refIndex}`;
}

function renderFootnote(node, context) {
  const links = [];
  for (let refIndex = 1; refIndex <= node.refCount; refIndex++) {
    const href = `#${footnoteRefId(node.number, refIndex)}`;
    const attrs = context.attrs({ href, class: 'footnote-backref', 'aria-label': 'Back to reference' });
    links.push(`<a${attrs}>${FOOTNOTE_BACKREF}</a>`);
  }
  const backrefs = links.join(' ');
  const body = context.children(node);
  // The backlink reads best at the end of the note's last paragraph.
  const content = body.endsWith('</p>\n')
    ? `${body.slice(0, -'</p>\n'.length)} ${backrefs}</p>\n`
    : `${body}<p>${backrefs}</p>\n`;
  return `<li id="fn-${node.number}">\n${content}</li>\n`;
}

/** The built-in handler for each node type. */
export const defaultHandlers = {
  document: (node, context) => context.children(node),

  paragraph(node, context) {
    const content = taskCheckbox(node, context) + context.children(node);
    return isTightParagraph(context) ? content : `<p>${content}</p>\n`;
  },

  heading(node, context) {
    const tag = `h${node.level}`;
    return `<${tag}${context.attrs({ id: node.id })}>${context.children(node)}</${tag}>\n`;
  },

  blockquote: (node, context) => `<blockquote>\n${context.children(node)}</blockquote>\n`,

  thematic_break: () => '<hr />\n',

  code_block(node, context) {
    const className = node.lang ? `language-${node.lang}` : undefined;
    const code = context.escape(node.value);
    return `<pre><code${context.attrs({ class: className })}>${code}</code></pre>\n`;
  },

  html_block(node, context) {
    if (context.options.allowHtml) return `${node.value}\n`;
    return `<p>${context.escape(node.value)}</p>\n`;
  },

  list(node, context) {
    const tag = node.ordered ? 'ol' : 'ul';
    const start = node.ordered && node.start !== 1 ? node.start : undefined;
    return `<${tag}${context.attrs({ start })}>\n${context.children(node)}</${tag}>\n`;
  },

  list_item: renderListItem,

  table: renderTable,

  table_row: (node, context) => `<tr>\n${context.children(node)}</tr>\n`,

  table_cell(node, context) {
    const tag = node.header ? 'th' : 'td';
    const style = node.align ? `text-align:${node.align}` : undefined;
    return `<${tag}${context.attrs({ style })}>${context.children(node)}</${tag}>\n`;
  },

  footnotes(node, context) {
    return `<section class="footnotes">\n<ol>\n${context.children(node)}</ol>\n</section>\n`;
  },

  footnote_definition: renderFootnote,

  footnote_ref(node, context) {
    const attrs = context.attrs({
      href: `#fn-${node.number}`,
      id: footnoteRefId(node.number, node.refIndex),
    });
    return `<sup class="footnote-ref"><a${attrs}>${node.number}</a></sup>`;
  },

  text: (node, context) => context.escape(node.value),

  emphasis: (node, context) => `<em>${context.children(node)}</em>`,

  strong: (node, context) => `<strong>${context.children(node)}</strong>`,

  strikethrough: (node, context) => `<del>${context.children(node)}</del>`,

  code_span: (node, context) => `<code>${context.escape(node.value)}</code>`,

  soft_break: (node, context) => context.options.softBreak,

  hard_break: () => '<br />\n',

  html_inline(node, context) {
    return context.options.allowHtml ? node.value : context.escape(node.value);
  },

  // A rejected URL keeps the link text but loses the href.
  link(node, context) {
    const attrs = context.attrs({
      href: context.safeUrl(node.url),
      title: node.title || undefined,
    });
    return `<a${attrs}>${context.children(node)}</a>`;
  },

  image(node, context) {
    const attrs = context.attrs({
      src: context.safeUrl(node.url, 'image'),
      alt: textContent(node),
      title: node.title || undefined,
    });
    return `<img${attrs} />`;
  },
};

/**
 * Renders ASTs to HTML. Handlers receive this object as their context:
 * `children(node)` and `node(child)` recurse, `fallback(node)` runs the built-in
 * handler, `ancestor(n)` looks up the tree (1 is the parent), and `escape`,
 * `attrs` and `safeUrl` are the output helpers. Rendering is single-threaded
 * state on the instance, so one renderer may be reused across documents.
 */
export class HtmlRenderer {
  #handlers;
  #path = [];

  /**
   * Options: `handlers` overrides by node type; `allowHtml` passes raw HTML
   * through unescaped (only for trusted input); `allowedSchemes` replaces the
   * URL scheme allow-list; `softBreak` is the output for a soft line break.
   */
  constructor(options = {}) {
    const { allowHtml = false, allowedSchemes = DEFAULT_SCHEMES, softBreak = '\n', handlers } = options;
    this.options = { allowHtml, allowedSchemes, softBreak };
    this.#handlers = { ...defaultHandlers, ...handlers };
  }

  render(root) {
    this.#path = [];
    return this.node(root);
  }

  node(node) {
    const handler = this.#handlers[node.type];
    if (!handler) throw new TypeError(`no HTML handler for node type "${node.type}"`);
    this.#path.push(node);
    try {
      return handler(node, this);
    } finally {
      this.#path.pop();
    }
  }

  children(node) {
    return node.children.map((child) => this.node(child)).join('');
  }

  fallback(node) {
    const handler = defaultHandlers[node.type];
    if (!handler) throw new TypeError(`no built-in HTML handler for node type "${node.type}"`);
    return handler(node, this);
  }

  /** The node `levels` steps above the one being rendered; 0 is the node itself. */
  ancestor(levels) {
    return this.#path[this.#path.length - 1 - levels];
  }

  escape(text) {
    return escapeHtml(text);
  }

  /** Serialises attributes, leaving out null, undefined and false values. */
  attrs(attributes) {
    let out = '';
    for (const [name, value] of Object.entries(attributes)) {
      if (value === undefined || value === null || value === false) continue;
      out += value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`;
    }
    return out;
  }

  /** The encoded URL, or null when the scheme is not allowed. */
  safeUrl(url, kind = 'link') {
    return sanitizeUrl(url, { schemes: this.options.allowedSchemes, kind });
  }
}

/** Renders an AST with a one-off renderer. */
export function renderHtml(root, options) {
  return new HtmlRenderer(options).render(root);
}
