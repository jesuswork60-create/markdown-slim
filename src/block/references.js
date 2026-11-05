// Link reference definitions live at the start of paragraphs, so they are
// peeled off when a paragraph closes or turns into a setext heading.

import {
  normalizeLabel,
  parseLinkDestination,
  parseLinkLabel,
  parseLinkTitle,
  skipSpacesAndNewline,
} from '../syntax/link-parts.js';

// Returns the offset after trailing spaces if only a line end follows, else -1.
function lineEndAfter(text, pos) {
  let i = pos;
  while (text[i] === ' ' || text[i] === '\t') i++;
  if (i >= text.length) return i;
  return text[i] === '\n' ? i + 1 : -1;
}

function parseDefinition(text, pos) {
  const label = parseLinkLabel(text, pos);
  if (!label || text[label.end] !== ':') return null;

  const destStart = skipSpacesAndNewline(text, label.end + 1);
  if (destStart >= text.length) return null;
  const destination = parseLinkDestination(text, destStart);
  if (!destination || (destination.end === destStart && text[destStart] !== '<')) return null;

  const titleStart = skipSpacesAndNewline(text, destination.end);
  const title = titleStart > destination.end ? parseLinkTitle(text, titleStart) : null;
  if (title) {
    const end = lineEndAfter(text, title.end);
    if (end !== -1) return { label: label.raw, url: destination.value, title: title.value, end };
  }
  // No usable title: the definition stands only if the destination ends its line.
  const end = lineEndAfter(text, destination.end);
  return end === -1 ? null : { label: label.raw, url: destination.value, title: '', end };
}

/**
 * Registers the definitions at the start of `text` (first definition of a label
 * wins) and returns the offset where ordinary paragraph text begins.
 */
export function consumeDefinitions(text, references) {
  let pos = 0;
  while (text[pos] === '[') {
    const definition = parseDefinition(text, pos);
    if (!definition) break;
    const key = normalizeLabel(definition.label);
    if (key !== '' && !(key in references)) {
      references[key] = { url: definition.url, title: definition.title };
    }
    pos = definition.end;
  }
  return pos;
}
