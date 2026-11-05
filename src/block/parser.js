// First parsing phase: turns source lines into a tree of block nodes. Inline
// content stays as `raw` strings on leaves until the inline phase runs.
//
// Each line walks the stack of open blocks to see which still continue, then
// tries to start new blocks inside the deepest match, then hands whatever text
// is left to the innermost block able to take it.

import { LineCursor } from './cursor.js';
import { FINISHED, MATCHED, specs } from './specs.js';
import { DONE, LEAF, NONE, STARTERS } from './starters.js';

export function splitLines(source) {
  const lines = source.split(/\r\n|\n|\r/);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

export class BlockParser {
  constructor({ firstLine = 1 } = {}) {
    this.lineNumber = firstLine - 1;
    this.references = Object.create(null);
    this.footnotes = Object.create(null);
    this.document = {
      type: 'document',
      position: { start: firstLine, end: firstLine },
      children: [],
    };
    this.stack = [{ node: this.document, spec: specs.document, lines: [] }];
    this.lastMatched = 0;
    this.allClosed = true;
  }

  get tip() {
    return this.stack.at(-1);
  }

  parse(source) {
    for (const line of splitLines(source)) this.processLine(line);
    this.document.position.end = Math.max(this.lineNumber, this.document.position.start);
    this.lineNumber++;
    while (this.stack.length > 1) this.closeTop();
    return { document: this.document, references: this.references, footnotes: this.footnotes };
  }

  /** Opens a block under the tip, first closing anything that can't hold it. */
  open(type, fields = {}, state = {}) {
    while (!this.tip.spec.accepts(type)) this.closeTop();
    const spec = specs[type];
    const node = {
      type,
      position: { start: this.lineNumber, end: this.lineNumber },
      ...fields,
    };
    if (spec.container) node.children = [];
    this.tip.node.children.push(node);
    const entry = { node, spec, lines: [], ...state };
    this.stack.push(entry);
    return entry;
  }

  /** Closes the innermost open block, which by default ended on the previous line. */
  closeTop(endLine = this.lineNumber - 1) {
    const entry = this.stack.pop();
    entry.node.position.end = endLine;
    entry.spec.close(entry, this, this.tip);
  }

  /** Closes the blocks this line failed to continue. Starters call it once they match. */
  closeUnmatched() {
    if (this.allClosed) return;
    while (this.stack.length - 1 > this.lastMatched) this.closeTop();
    this.allClosed = true;
  }

  processLine(text) {
    this.lineNumber++;
    const cursor = new LineCursor(text);

    this.lastMatched = 0;
    for (let i = 1; i < this.stack.length; i++) {
      const entry = this.stack[i];
      const result = entry.spec.continue(cursor, entry);
      if (result === FINISHED) {
        // Only leaves finish this way, so this block is the innermost one.
        this.closeTop(this.lineNumber);
        return;
      }
      if (result !== MATCHED) break;
      this.lastMatched = i;
    }
    this.allClosed = this.lastMatched === this.stack.length - 1;

    let container = this.stack[this.lastMatched];
    if (!container.spec.verbatim) {
      container = this.#startBlocks(cursor, container);
      if (container === null) return;
    }
    this.#addText(cursor, container);
  }

  // Tries starters until none match; returns the block for the remaining text,
  // or null when a starter consumed the whole line.
  #startBlocks(cursor, initial) {
    let container = initial;
    for (;;) {
      let outcome = NONE;
      for (const start of STARTERS) {
        outcome = start(this, cursor, container);
        if (outcome !== NONE) break;
      }
      if (outcome === DONE) return null;
      if (outcome === NONE) {
        cursor.skipToNonSpace();
        return container;
      }
      container = this.tip;
      if (outcome === LEAF) return container;
    }
  }

  #addText(cursor, container) {
    // A paragraph continues lazily even when its containers did not match.
    if (!this.allClosed && !cursor.blank && this.tip.node.type === 'paragraph') {
      this.tip.lines.push(cursor.rest());
      return;
    }
    this.closeUnmatched();

    if (container.spec.takesLines) {
      const line = cursor.rest();
      container.spec.addLine(container, line, this);
      if (container.spec.endsWith?.(container, line)) this.closeTop(this.lineNumber);
    } else if (!cursor.blank) {
      const paragraph = this.open('paragraph');
      paragraph.lines.push(cursor.rest());
    }
  }
}
