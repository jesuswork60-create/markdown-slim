// Standalone document output: a table of contents fragment and a full HTML page
// around rendered content.

import { escapeHtml } from './escape.js';

function tocList(entries) {
  const items = entries.map((entry) => {
    const label = escapeHtml(entry.text);
    const link = entry.id ? `<a href="#${encodeURIComponent(entry.id)}">${label}</a>` : label;
    const nested = entry.children.length > 0 ? `\n${tocList(entry.children)}` : '';
    return `<li>${link}${nested}</li>\n`;
  });
  return `<ul>\n${items.join('')}</ul>\n`;
}

/** Renders the outline from `extractToc` as a `<nav>`; empty string when there are no entries. */
export function renderToc(entries) {
  if (entries.length === 0) return '';
  return `<nav class="toc">\n${tocList(entries)}</nav>\n`;
}

const PAGE_STYLE = `body { max-width: 46rem; margin: 2rem auto; padding: 0 1rem; font: 1rem/1.6 system-ui, sans-serif; }
pre { overflow-x: auto; padding: 0.75rem; background: #f4f4f4; }
code { font-family: ui-monospace, monospace; }
table { border-collapse: collapse; }
th, td { padding: 0.25rem 0.6rem; border: 1px solid #ccc; }
blockquote { margin-left: 0; padding-left: 1rem; border-left: 0.25rem solid #ccc; }`;

/** Wraps rendered HTML in a complete document. */
export function renderPage(content, { title = 'Document', description = null, lang = 'en' } = {}) {
  const descriptionTag =
    typeof description === 'string'
      ? `<meta name="description" content="${escapeHtml(description)}">\n`
      : '';
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${descriptionTag}<style>
${PAGE_STYLE}
</style>
</head>
<body>
${content}</body>
</html>
`;
}
