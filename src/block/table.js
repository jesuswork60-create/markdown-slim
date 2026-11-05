// GFM table row handling. Rows are split before inline parsing, so a pipe in a
// code span still separates cells unless it is escaped, matching GFM.

/**
 * Splits a row into raw cell strings. `\|` becomes a literal pipe; any other
 * backslash pair is kept for the inline parser to deal with.
 */
export function splitTableRow(line) {
  const text = line.trim();
  const cells = [];
  let cell = '';
  let endedOnPipe = false;
  for (let i = text[0] === '|' ? 1 : 0; i < text.length; i++) {
    const ch = text[i];
    endedOnPipe = false;
    if (ch === '\\' && i + 1 < text.length) {
      const next = text[++i];
      cell += next === '|' ? '|' : ch + next;
    } else if (ch === '|') {
      cells.push(cell.trim());
      cell = '';
      endedOnPipe = true;
    } else {
      cell += ch;
    }
  }
  if (!endedOnPipe && text !== '|' && text !== '') cells.push(cell.trim());
  return cells;
}

function columnAlignment(cell) {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (left) return 'left';
  return right ? 'right' : null;
}

/** Parses a delimiter row into per-column alignments, or returns null if it is not one. */
export function parseDelimiterRow(line) {
  if (!line.includes('|') || !line.includes('-')) return null;
  const cells = splitTableRow(line);
  if (cells.length === 0) return null;
  if (!cells.every((cell) => /^:?-+:?$/.test(cell))) return null;
  return cells.map(columnAlignment);
}

/** Builds a row node, padding short rows and dropping cells beyond the column count. */
export function makeTableRow(line, alignments, lineNumber, header = false) {
  const cells = splitTableRow(line);
  const position = { start: lineNumber, end: lineNumber };
  return {
    type: 'table_row',
    header,
    position,
    children: alignments.map((align, column) => ({
      type: 'table_cell',
      header,
      align,
      raw: cells[column] ?? '',
      position,
      children: [],
    })),
  };
}
