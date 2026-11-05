// Behaviour of each open block type. A spec answers three questions for the
// line-by-line parser: does this block continue on the current line (`continue`),
// which children may it hold (`accepts`), and what happens when it ends (`close`).
// Blocks with `takesLines` absorb text through `addLine`; `verbatim` ones also
// stop any new block from starting inside them.

import { isSpaceOrTab, trimEndSpaces } from '../syntax/chars.js';
import { normalizeLabel } from '../syntax/link-parts.js';
import { consumeDefinitions } from './references.js';
import { makeTableRow } from './table.js';

export const MATCHED = 0;
export const UNMATCHED = 1;
export const FINISHED = 2;

const never = () => false;
const anyButListItem = (type) => type !== 'list_item';
const noop = () => {};

/** Peels reference definitions off an open paragraph. */
export function extractDefinitions(entry, parser) {
  if (entry.lines.length === 0 || entry.lines[0][0] !== '[') return;
  const text = entry.lines.join('\n');
  const offset = consumeDefinitions(text, parser.references);
  if (offset === 0) return;
  const remaining = text.slice(offset);
  entry.lines = remaining === '' ? [] : remaining.split('\n');
  entry.node.position.start += text.slice(0, offset).split('\n').length - 1;
}

// Lists and items end where their last child ends, so trailing blank lines don't
// count, which is what makes the tight/loose check below a simple line comparison.
function endAtLastChild(entry) {
  const { node } = entry;
  const last = node.children.at(-1);
  node.position.end = last ? last.position.end : node.position.start;
}

function separatedByBlank(block, next) {
  return block.position.end !== next.position.start - 1;
}

function isLooseList(list) {
  return list.children.some((item, index) => {
    const nextItem = list.children[index + 1];
    if (nextItem && separatedByBlank(item, nextItem)) return true;
    return item.children.some((child, childIndex) => {
      const nextChild = item.children[childIndex + 1];
      return nextChild !== undefined && separatedByBlank(child, nextChild);
    });
  });
}

const TASK_MARKER = /^\[([ xX])\][ \t\n]+(?=\S)/;

function detectTaskMarker(item) {
  const first = item.children[0];
  if (first?.type !== 'paragraph') return;
  const match = TASK_MARKER.exec(first.raw);
  if (!match) return;
  item.checked = match[1] !== ' ';
  first.raw = first.raw.slice(match[0].length);
}

export const specs = {
  document: {
    container: true,
    continue: () => MATCHED,
    accepts: anyButListItem,
    close: noop,
  },

  blockquote: {
    container: true,
    continue(cursor) {
      if (cursor.indented || cursor.peek !== '>') return UNMATCHED;
      cursor.skipToNonSpace();
      cursor.advance(1);
      cursor.skipOptionalSpace();
      return MATCHED;
    },
    accepts: anyButListItem,
    close: noop,
  },

  list: {
    container: true,
    continue: () => MATCHED,
    accepts: (type) => type === 'list_item',
    close(entry) {
      endAtLastChild(entry);
      entry.node.tight = !isLooseList(entry.node);
    },
  },

  list_item: {
    container: true,
    continue(cursor, entry) {
      if (cursor.blank) {
        // A blank line right after an empty marker ends the item.
        if (entry.node.children.length === 0) return UNMATCHED;
        cursor.skipToNonSpace();
        return MATCHED;
      }
      const width = entry.markerOffset + entry.markerPadding;
      if (cursor.indent < width) return UNMATCHED;
      cursor.advance(width, true);
      return MATCHED;
    },
    accepts: anyButListItem,
    close(entry) {
      endAtLastChild(entry);
      detectTaskMarker(entry.node);
    },
  },

  footnote_definition: {
    container: true,
    continue(cursor) {
      if (cursor.indented) {
        cursor.advance(4, true);
        return MATCHED;
      }
      if (cursor.blank) {
        cursor.skipToNonSpace();
        return MATCHED;
      }
      return UNMATCHED;
    },
    accepts: anyButListItem,
    // Definitions leave the tree here; references are numbered after inline parsing.
    close(entry, parser, parent) {
      endAtLastChild(entry);
      parent.node.children.pop();
      const key = normalizeLabel(entry.node.label);
      if (!(key in parser.footnotes)) parser.footnotes[key] = entry.node;
    },
  },

  paragraph: {
    takesLines: true,
    continue: (cursor) => (cursor.blank ? UNMATCHED : MATCHED),
    accepts: never,
    addLine(entry, text) {
      entry.lines.push(text);
    },
    close(entry, parser, parent) {
      extractDefinitions(entry, parser);
      const raw = trimEndSpaces(entry.lines.join('\n'));
      if (raw === '') parent.node.children.pop();
      else entry.node.raw = raw;
    },
  },

  heading: {
    continue: () => UNMATCHED,
    accepts: never,
    close: noop,
  },

  thematic_break: {
    continue: () => UNMATCHED,
    accepts: never,
    close: noop,
  },

  code_block: {
    takesLines: true,
    verbatim: true,
    continue(cursor, entry) {
      return entry.node.fenced ? continueFence(cursor, entry) : continueIndented(cursor);
    },
    accepts: never,
    addLine(entry, text) {
      entry.lines.push(text);
    },
    close(entry) {
      const { node, lines } = entry;
      if (!node.fenced) {
        while (lines.length > 0 && lines.at(-1).trim() === '') lines.pop();
        node.position.end = node.position.start + lines.length - 1;
      }
      node.value = lines.length > 0 ? `${lines.join('\n')}\n` : '';
    },
  },

  html_block: {
    takesLines: true,
    verbatim: true,
    continue(cursor, entry) {
      return cursor.blank && entry.condition.endsAtBlank ? UNMATCHED : MATCHED;
    },
    accepts: never,
    addLine(entry, text) {
      entry.lines.push(text);
    },
    endsWith: (entry, text) => entry.condition.end?.test(text) ?? false,
    close(entry) {
      let { length } = entry.lines;
      while (length > 0 && entry.lines[length - 1].trim() === '') length--;
      entry.node.value = entry.lines.slice(0, length).join('\n');
    },
  },

  table: {
    container: true,
    takesLines: true,
    continue: (cursor) => (cursor.blank ? UNMATCHED : MATCHED),
    accepts: never,
    addLine(entry, text, parser) {
      entry.node.children.push(makeTableRow(text, entry.node.align, parser.lineNumber));
    },
    close: noop,
  },
};

function continueFence(cursor, entry) {
  if (!cursor.indented && cursor.peek === entry.fenceChar) {
    const line = trimEndSpaces(cursor.trimmedRest);
    if (line.length >= entry.fenceLength && [...line].every((ch) => ch === entry.fenceChar)) {
      return FINISHED;
    }
  }
  // Remove as much indentation as the opening fence had.
  for (let i = entry.fenceIndent; i > 0 && isSpaceOrTab(cursor.current); i--) {
    cursor.advance(1, true);
  }
  return MATCHED;
}

function continueIndented(cursor) {
  if (cursor.indented) {
    cursor.advance(4, true);
    return MATCHED;
  }
  if (cursor.blank) {
    cursor.skipToNonSpace();
    return MATCHED;
  }
  return UNMATCHED;
}
