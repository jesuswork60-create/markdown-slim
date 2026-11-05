// Block start rules, tried in order on each line that isn't inside verbatim
// content. A starter inspects the cursor without moving it, and on a match
// consumes the marker and opens the block. Its return value tells the parser
// what to do with the rest of the line.

import { unescapeString } from '../syntax/entities.js';
import { isSpaceOrTab, trimEndSpaces } from '../syntax/chars.js';
import { matchHtmlBlockStart } from './html-block.js';
import { extractDefinitions } from './specs.js';
import { makeTableRow, parseDelimiterRow, splitTableRow } from './table.js';

export const NONE = 0; // no match, try the next starter
export const CONTAINER = 1; // a container opened, look for more blocks inside it
export const LEAF = 2; // a leaf opened, the rest of the line is its text
export const DONE = 3; // the line is fully consumed

function blockquote(parser, cursor) {
  if (cursor.indented || cursor.peek !== '>') return NONE;
  cursor.skipToNonSpace();
  cursor.advance(1);
  cursor.skipOptionalSpace();
  parser.closeUnmatched();
  parser.open('blockquote');
  return CONTAINER;
}

// Strips the optional closing `#` run, which must be preceded by whitespace.
function stripClosingHashes(text) {
  const trimmed = trimEndSpaces(text);
  let end = trimmed.length;
  while (end > 0 && trimmed[end - 1] === '#') end--;
  if (end === trimmed.length) return trimmed;
  if (end === 0 || isSpaceOrTab(trimmed[end - 1])) return trimEndSpaces(trimmed.slice(0, end));
  return trimmed;
}

function atxHeading(parser, cursor) {
  if (cursor.indented || cursor.peek !== '#') return NONE;
  const match = /^(#{1,6})(?:[ \t]+|$)/.exec(cursor.trimmedRest);
  if (!match) return NONE;
  parser.closeUnmatched();
  const entry = parser.open('heading', { level: match[1].length });
  entry.node.raw = stripClosingHashes(cursor.trimmedRest.slice(match[0].length));
  parser.closeTop(parser.lineNumber);
  return DONE;
}

function fencedCode(parser, cursor) {
  if (cursor.indented) return NONE;
  const match = /^(?:`{3,}(?!.*`)|~{3,})/.exec(cursor.trimmedRest);
  if (!match) return NONE;
  const info = unescapeString(cursor.trimmedRest.slice(match[0].length).trim());
  parser.closeUnmatched();
  parser.open(
    'code_block',
    { fenced: true, info, lang: info.split(/\s+/, 1)[0] || null },
    { fenceChar: match[0][0], fenceLength: match[0].length, fenceIndent: cursor.indent },
  );
  return DONE;
}

function htmlBlock(parser, cursor) {
  if (cursor.indented || cursor.peek !== '<') return NONE;
  const afterParagraph = parser.tip.node.type === 'paragraph';
  const condition = matchHtmlBlockStart(cursor.trimmedRest, afterParagraph);
  if (!condition) return NONE;
  parser.closeUnmatched();
  parser.open('html_block', {}, { condition });
  // Leading spaces belong to the block, so the cursor stays put.
  return LEAF;
}

function setextHeading(parser, cursor, container) {
  if (cursor.indented || container.node.type !== 'paragraph') return NONE;
  const match = /^(=+|-+)[ \t]*$/.exec(cursor.trimmedRest);
  if (!match) return NONE;
  parser.closeUnmatched();
  extractDefinitions(container, parser);
  if (container.lines.length === 0) return NONE;

  const raw = trimEndSpaces(container.lines.join('\n'));
  const { start } = container.node.position;
  container.lines = [];
  parser.closeTop(); // removes the now empty paragraph
  const entry = parser.open('heading', { level: match[1][0] === '=' ? 1 : 2 });
  entry.node.raw = raw;
  entry.node.position.start = start;
  parser.closeTop(parser.lineNumber);
  return DONE;
}

function table(parser, cursor, container) {
  if (cursor.indented || container.node.type !== 'paragraph') return NONE;
  const align = parseDelimiterRow(cursor.trimmedRest);
  if (!align) return NONE;
  const headerLine = container.lines.at(-1);
  if (splitTableRow(headerLine).length !== align.length) return NONE;

  parser.closeUnmatched();
  container.lines.pop();
  const headerNumber = parser.lineNumber - 1;
  parser.closeTop(headerNumber - 1);
  const entry = parser.open('table', { align });
  entry.node.position.start = headerNumber;
  entry.node.children.push(makeTableRow(headerLine, align, headerNumber, true));
  return DONE;
}

const THEMATIC = /^(?:(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,})$/;

function thematicBreak(parser, cursor) {
  if (cursor.indented || !THEMATIC.test(cursor.trimmedRest)) return NONE;
  parser.closeUnmatched();
  parser.open('thematic_break');
  parser.closeTop(parser.lineNumber);
  return DONE;
}

function footnoteDefinition(parser, cursor) {
  if (cursor.indented || cursor.peek !== '[') return NONE;
  const match = /^\[\^([^\]\s]+)\]:[ \t]*/.exec(cursor.trimmedRest);
  if (!match) return NONE;
  cursor.skipToNonSpace();
  cursor.advance(match[0].length);
  parser.closeUnmatched();
  parser.open('footnote_definition', { label: match[1] });
  return CONTAINER;
}

const ORDERED_MARKER = /^(\d{1,9})([.)])/;

function readListMarker(cursor, container) {
  const line = cursor.trimmedRest;
  const inParagraph = container.node.type === 'paragraph';
  let marker;
  let fields;
  if (line[0] === '*' || line[0] === '+' || line[0] === '-') {
    marker = line[0];
    fields = { ordered: false, delimiter: marker };
  } else {
    const match = ORDERED_MARKER.exec(line);
    // Only a list starting at 1 may interrupt a paragraph.
    if (!match || (inParagraph && Number(match[1]) !== 1)) return null;
    marker = match[0];
    fields = { ordered: true, delimiter: match[2], start: Number(match[1]) };
  }
  const after = line[marker.length];
  if (after !== undefined && !isSpaceOrTab(after)) return null;
  if (inParagraph && line.slice(marker.length).trim() === '') return null;
  return { marker, fields };
}

function listItem(parser, cursor, container) {
  if (cursor.indented) return NONE;
  const found = readListMarker(cursor, container);
  if (!found) return NONE;

  const markerOffset = cursor.indent;
  cursor.skipToNonSpace();
  cursor.advance(found.marker.length);

  // Work out the content offset: up to 4 spaces after the marker belong to the
  // item's padding; 5 or more mean the content is an indented code block.
  const afterMarker = cursor.mark();
  const startColumn = cursor.column;
  do {
    cursor.advance(1, true);
  } while (cursor.column - startColumn < 5 && isSpaceOrTab(cursor.current));
  const spaces = cursor.column - startColumn;
  const emptyItem = cursor.current === undefined;

  let markerPadding;
  if (spaces >= 5 || spaces < 1 || emptyItem) {
    markerPadding = found.marker.length + 1;
    cursor.reset(afterMarker);
    cursor.skipOptionalSpace();
  } else {
    markerPadding = found.marker.length + spaces;
  }

  parser.closeUnmatched();
  const tip = parser.tip;
  const sameList =
    tip.node.type === 'list' &&
    tip.node.ordered === found.fields.ordered &&
    tip.node.delimiter === found.fields.delimiter;
  if (!sameList) parser.open('list', { ...found.fields, tight: true });
  parser.open('list_item', {}, { markerOffset, markerPadding });
  return CONTAINER;
}

function indentedCode(parser, cursor) {
  if (!cursor.indented || cursor.blank || parser.tip.node.type === 'paragraph') return NONE;
  cursor.advance(4, true);
  parser.closeUnmatched();
  parser.open('code_block', { fenced: false, info: '', lang: null });
  return LEAF;
}

export const STARTERS = [
  blockquote,
  atxHeading,
  fencedCode,
  htmlBlock,
  setextHeading,
  table,
  thematicBreak,
  footnoteDefinition,
  listItem,
  indentedCode,
];
