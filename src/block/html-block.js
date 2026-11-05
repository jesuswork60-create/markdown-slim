// HTML block start and end conditions, in the order they must be tried.

import { CLOSE_TAG, OPEN_TAG } from '../syntax/html-tags.js';

const BLOCK_TAGS = [
  'address', 'article', 'aside', 'base', 'basefont', 'blockquote', 'body', 'caption', 'center',
  'col', 'colgroup', 'dd', 'details', 'dialog', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'frame', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head',
  'header', 'hr', 'html', 'iframe', 'legend', 'li', 'link', 'main', 'menu', 'menuitem', 'meta',
  'nav', 'noframes', 'ol', 'optgroup', 'option', 'p', 'param', 'search', 'section', 'summary',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'title', 'tr', 'track', 'ul',
].join('|');

const CONDITIONS = [
  {
    start: /^<(?:script|pre|textarea|style)(?:\s|>|$)/i,
    end: /<\/(?:script|pre|textarea|style)>/i,
  },
  { start: /^<!--/, end: /-->/ },
  { start: /^<\?/, end: /\?>/ },
  { start: /^<![A-Za-z]/, end: />/ },
  { start: /^<!\[CDATA\[/, end: /\]\]>/ },
  { start: new RegExp(`^</?(?:${BLOCK_TAGS})(?:\\s|/?>|$)`, 'i'), endsAtBlank: true },
  {
    start: new RegExp(`^(?:${OPEN_TAG}|${CLOSE_TAG})[ \\t]*$`),
    endsAtBlank: true,
    interruptsParagraph: false,
  },
];

/** Finds the condition opening an HTML block on this line, or null. */
export function matchHtmlBlockStart(line, afterParagraph) {
  for (const condition of CONDITIONS) {
    if (afterParagraph && condition.interruptsParagraph === false) continue;
    if (condition.start.test(line)) return condition;
  }
  return null;
}
