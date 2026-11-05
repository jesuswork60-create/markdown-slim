// Heading ids and table of contents extraction.

import { SKIP, textContent, walk } from './walk.js';

/** Turns heading text into URL-friendly ids, unique within one instance. */
export class Slugger {
  #used = new Set();

  static slugify(text) {
    return text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  slug(text) {
    const base = Slugger.slugify(text) || 'section';
    let candidate = base;
    for (let suffix = 1; this.#used.has(candidate); suffix++) candidate = `${base}-${suffix}`;
    this.#used.add(candidate);
    return candidate;
  }
}

/** Stores a unique `id` on every heading. */
export function assignHeadingIds(root, { prefix = '' } = {}) {
  const slugger = new Slugger();
  walk(root, (node) => {
    if (node.type === 'heading') node.id = prefix + slugger.slug(textContent(node));
  });
  return root;
}

/**
 * Builds a nested outline from a document's headings. Skipped levels attach to
 * the nearest shallower heading. Headings inside footnotes are left out.
 */
export function extractToc(root, { minLevel = 1, maxLevel = 6 } = {}) {
  const outline = [];
  const open = [];
  walk(root, (node) => {
    if (node.type === 'footnotes') return SKIP;
    if (node.type !== 'heading' || node.level < minLevel || node.level > maxLevel) return undefined;
    const item = { level: node.level, text: textContent(node), id: node.id ?? null, children: [] };
    while (open.length > 0 && open.at(-1).level >= item.level) open.pop();
    (open.at(-1)?.children ?? outline).push(item);
    open.push(item);
    return undefined;
  });
  return outline;
}
