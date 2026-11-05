// Delimiter run handling for emphasis, strong emphasis and strikethrough. Runs
// are collected during the inline scan and matched afterwards, closers first,
// following the CommonMark delimiter stack algorithm.

import { charAt, charBefore, isPunctuationChar, isWhitespaceChar } from '../syntax/chars.js';

export class DelimiterStack {
  top = null;

  push(delimiter) {
    delimiter.prev = this.top;
    delimiter.next = null;
    if (this.top) this.top.next = delimiter;
    this.top = delimiter;
  }

  remove(delimiter) {
    if (delimiter.prev) delimiter.prev.next = delimiter.next;
    if (delimiter.next) delimiter.next.prev = delimiter.prev;
    else this.top = delimiter.prev;
  }
}

/** Applies the left- and right-flanking rules to the run spanning [start, end) in `text`. */
export function classifyRun(text, start, end) {
  const before = charBefore(text, start);
  const after = charAt(text, end);
  const spaceBefore = isWhitespaceChar(before);
  const spaceAfter = isWhitespaceChar(after);
  const punctBefore = isPunctuationChar(before);
  const punctAfter = isPunctuationChar(after);

  const leftFlanking = !spaceAfter && (!punctAfter || spaceBefore || punctBefore);
  const rightFlanking = !spaceBefore && (!punctBefore || spaceAfter || punctAfter);

  if (text[start] === '_') {
    return {
      canOpen: leftFlanking && (!rightFlanking || punctBefore),
      canClose: rightFlanking && (!leftFlanking || punctAfter),
    };
  }
  return { canOpen: leftFlanking, canClose: rightFlanking };
}

function canPair(opener, closer) {
  if (opener.char !== closer.char || !opener.canOpen) return false;
  if (closer.char === '~') return opener.count === closer.count;
  // The "multiple of 3" rule for runs that can both open and close.
  if (!closer.canOpen && !opener.canClose) return true;
  const sum = opener.originalCount + closer.originalCount;
  return !(sum % 3 === 0 && closer.originalCount % 3 !== 0);
}

function floorKey(closer) {
  return `${closer.char}${closer.canOpen ? 1 : 0}${closer.originalCount % 3}`;
}

function nodeTypeFor(char, used) {
  if (char === '~') return 'strikethrough';
  return used === 2 ? 'strong' : 'emphasis';
}

function trimDelimiter(delimiter, used) {
  delimiter.count -= used;
  const textNode = delimiter.entry.node;
  textNode.value = textNode.value.slice(used);
}

/**
 * Pairs every closer above `bottom` with its nearest eligible opener, wrapping
 * the content between them, and leaves unmatched runs as literal text.
 */
export function resolveDelimiters(list, stack, bottom) {
  // Lowest position worth searching for each kind of closer, so that input with
  // many unmatched runs doesn't rescan the stack each time.
  const floors = new Map();
  if (stack.top === bottom) return;

  let closer = stack.top;
  while (closer.prev !== bottom) closer = closer.prev;

  while (closer) {
    if (!closer.canClose) {
      closer = closer.next;
      continue;
    }

    const key = floorKey(closer);
    const floor = floors.get(key) ?? bottom;
    let opener = closer.prev;
    while (opener && opener !== bottom && opener !== floor && !canPair(opener, closer)) {
      opener = opener.prev;
    }

    if (!opener || opener === bottom || opener === floor) {
      floors.set(key, closer.prev);
      const next = closer.next;
      if (!closer.canOpen) stack.remove(closer);
      closer = next;
      continue;
    }

    const used = closer.char === '~' ? closer.count : opener.count >= 2 && closer.count >= 2 ? 2 : 1;
    const children = list.takeBetween(opener.entry, closer.entry);
    list.insertAfter(opener.entry, { type: nodeTypeFor(closer.char, used), children });

    // Runs between the pair can no longer match anything.
    opener.next = closer;
    closer.prev = opener;

    trimDelimiter(opener, used);
    trimDelimiter(closer, used);
    if (opener.count === 0) {
      list.remove(opener.entry);
      stack.remove(opener);
    }
    if (closer.count === 0) {
      list.remove(closer.entry);
      const next = closer.next;
      stack.remove(closer);
      closer = next;
    }
  }

  while (stack.top && stack.top !== bottom) stack.remove(stack.top);
}
