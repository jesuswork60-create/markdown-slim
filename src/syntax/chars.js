// Character classes shared by the block and inline parsers.

const UNICODE_WHITESPACE = /^[\p{Zs}\t\n\f\r]$/u;
const UNICODE_PUNCTUATION = /^[\p{P}\p{S}]$/u;
const ASCII_PUNCTUATION = /^[!-/:-@[-`{-~]$/;

export function isSpaceOrTab(ch) {
  return ch === ' ' || ch === '\t';
}

export function isAsciiPunctuation(ch) {
  return ch !== undefined && ASCII_PUNCTUATION.test(ch);
}

export function isWhitespaceChar(ch) {
  return UNICODE_WHITESPACE.test(ch);
}

export function isPunctuationChar(ch) {
  return UNICODE_PUNCTUATION.test(ch);
}

/** The full code point ending just before `pos`, or a newline at the start of the string. */
export function charBefore(text, pos) {
  if (pos <= 0) return '\n';
  const low = text.charCodeAt(pos - 1);
  if (low >= 0xdc00 && low <= 0xdfff && pos >= 2) {
    const high = text.charCodeAt(pos - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.slice(pos - 2, pos);
  }
  return text[pos - 1];
}

/** The full code point starting at `pos`, or a newline at the end of the string. */
export function charAt(text, pos) {
  if (pos >= text.length) return '\n';
  return String.fromCodePoint(text.codePointAt(pos));
}

/** Removes trailing spaces and tabs without a regex, which would backtrack on long space runs. */
export function trimEndSpaces(text) {
  let end = text.length;
  while (end > 0 && isSpaceOrTab(text[end - 1])) end--;
  return text.slice(0, end);
}
