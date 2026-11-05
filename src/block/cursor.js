import { isSpaceOrTab } from '../syntax/chars.js';

const TAB_STOP = 4;

/**
 * A position within one source line that understands tab stops. Containers
 * consume indentation by visual column, so a tab can be partly consumed; the
 * remainder comes back as spaces from `rest()`.
 */
export class LineCursor {
  constructor(text) {
    this.text = text;
    this.pos = 0;
    this.column = 0;
    this.partialTab = false;
    this.#scan();
  }

  // Refreshes the facts about the next non-space character.
  #scan() {
    let i = this.pos;
    let col = this.column;
    while (i < this.text.length) {
      const ch = this.text[i];
      if (ch === ' ') col++;
      else if (ch === '\t') col += TAB_STOP - (col % TAB_STOP);
      else break;
      i++;
    }
    this.nextPos = i;
    this.nextColumn = col;
    this.indent = col - this.column;
    this.blank = i >= this.text.length;
    this.indented = this.indent >= TAB_STOP;
  }

  /** The next non-space character, undefined on a blank remainder. */
  get peek() {
    return this.text[this.nextPos];
  }

  /** The character at the raw position, whitespace included. */
  get current() {
    return this.text[this.pos];
  }

  /** The remainder of the line starting at the next non-space character. */
  get trimmedRest() {
    return this.text.slice(this.nextPos);
  }

  /** Moves forward by characters, or by visual columns when `byColumns` is set. */
  advance(count, byColumns = false) {
    while (count > 0 && this.pos < this.text.length) {
      if (this.text[this.pos] === '\t') {
        const toStop = TAB_STOP - (this.column % TAB_STOP);
        if (byColumns) {
          const step = Math.min(toStop, count);
          this.partialTab = toStop > count;
          this.column += step;
          if (!this.partialTab) this.pos++;
          count -= step;
        } else {
          this.partialTab = false;
          this.column += toStop;
          this.pos++;
          count--;
        }
      } else {
        this.partialTab = false;
        this.pos++;
        this.column++;
        count--;
      }
    }
    this.#scan();
  }

  skipToNonSpace() {
    this.pos = this.nextPos;
    this.column = this.nextColumn;
    this.partialTab = false;
    this.#scan();
  }

  /** Consumes one column of whitespace if there is any. */
  skipOptionalSpace() {
    if (isSpaceOrTab(this.current)) this.advance(1, true);
  }

  /** Restores a position captured with `mark()`. */
  reset(mark) {
    this.pos = mark.pos;
    this.column = mark.column;
    this.partialTab = mark.partialTab;
    this.#scan();
  }

  mark() {
    return { pos: this.pos, column: this.column, partialTab: this.partialTab };
  }

  /** The unconsumed text, with the unconsumed part of a split tab expanded to spaces. */
  rest() {
    if (!this.partialTab) return this.text.slice(this.pos);
    const remaining = TAB_STOP - (this.column % TAB_STOP);
    return ' '.repeat(remaining) + this.text.slice(this.pos + 1);
  }
}
