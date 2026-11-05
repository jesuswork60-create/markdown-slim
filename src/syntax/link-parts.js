// Parsers for the pieces of a link: label, destination and title. Inline links
// and link reference definitions both use them. Each takes the text and a start
// offset and returns the parsed value with the offset just past it, or null.

import { unescapeString } from './entities.js';

const MAX_LABEL_LENGTH = 999;
const MAX_PAREN_DEPTH = 32;

function isControlOrSpace(code) {
  return code <= 0x20 || code === 0x7f;
}

/** Skips spaces and tabs with at most one line ending among them. */
export function skipSpacesAndNewline(text, pos) {
  let seenNewline = false;
  while (pos < text.length) {
    const ch = text[pos];
    if (ch === '\n') {
      if (seenNewline) break;
      seenNewline = true;
    } else if (ch !== ' ' && ch !== '\t') {
      break;
    }
    pos++;
  }
  return pos;
}

/** Parses `[label]`. Labels may not contain unescaped brackets and need a non-space character. */
export function parseLinkLabel(text, pos) {
  if (text[pos] !== '[') return null;
  let i = pos + 1;
  let hasContent = false;
  while (i < text.length && i - pos <= MAX_LABEL_LENGTH + 1) {
    const ch = text[i];
    if (ch === ']') {
      return hasContent ? { raw: text.slice(pos + 1, i), end: i + 1 } : null;
    }
    if (ch === '[') return null;
    if (ch === '\\') i++;
    if (ch !== ' ' && ch !== '\t' && ch !== '\n') hasContent = true;
    i++;
  }
  return null;
}

/** Case-folds and collapses whitespace so equivalent labels compare equal. */
export function normalizeLabel(label) {
  return label.trim().replace(/\s+/g, ' ').toLowerCase().toUpperCase();
}

function parseAngleDestination(text, pos) {
  let i = pos + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '>') return { value: unescapeString(text.slice(pos + 1, i)), end: i + 1 };
    if (ch === '<' || ch === '\n') return null;
    if (ch === '\\') i++;
    i++;
  }
  return null;
}

function parseBareDestination(text, pos) {
  let i = pos;
  let depth = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length && text[i + 1] !== '\n') {
      i += 2;
      continue;
    }
    if (ch === '(') {
      if (++depth > MAX_PAREN_DEPTH) return null;
    } else if (ch === ')') {
      if (depth === 0) break;
      depth--;
    } else if (isControlOrSpace(text.charCodeAt(i))) {
      break;
    }
    i++;
  }
  if (depth !== 0) return null;
  return { value: unescapeString(text.slice(pos, i)), end: i };
}

/** Parses a destination. A bare one may be empty; callers that forbid that check `end`. */
export function parseLinkDestination(text, pos) {
  return text[pos] === '<' ? parseAngleDestination(text, pos) : parseBareDestination(text, pos);
}

const TITLE_CLOSERS = { '"': '"', "'": "'", '(': ')' };

export function parseLinkTitle(text, pos) {
  const closer = TITLE_CLOSERS[text[pos]];
  if (closer === undefined) return null;
  const opener = text[pos];
  let i = pos + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === closer) return { value: unescapeString(text.slice(pos + 1, i)), end: i + 1 };
    if (ch === '(' && opener === '(') return null;
    if (ch === '\\') i++;
    i++;
  }
  return null;
}
