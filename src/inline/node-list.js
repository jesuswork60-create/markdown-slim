// A doubly linked list of inline nodes. Emphasis and link resolution repeatedly
// move runs of siblings under a new parent, which is awkward and slow on arrays.

export class InlineList {
  head = null;
  tail = null;

  append(node) {
    const entry = { node, prev: this.tail, next: null };
    if (this.tail) this.tail.next = entry;
    else this.head = entry;
    this.tail = entry;
    return entry;
  }

  insertAfter(anchor, node) {
    const entry = { node, prev: anchor, next: anchor.next };
    if (anchor.next) anchor.next.prev = entry;
    else this.tail = entry;
    anchor.next = entry;
    return entry;
  }

  remove(entry) {
    if (entry.prev) entry.prev.next = entry.next;
    else this.head = entry.next;
    if (entry.next) entry.next.prev = entry.prev;
    else this.tail = entry.prev;
  }

  /** Detaches everything strictly between two entries (`last` null means to the tail). */
  takeBetween(first, last) {
    const nodes = [];
    let cursor = first.next;
    while (cursor !== last) {
      nodes.push(cursor.node);
      cursor = cursor.next;
    }
    first.next = last;
    if (last) last.prev = first;
    else this.tail = first;
    return collapseText(nodes);
  }

  toArray() {
    const nodes = [];
    for (let cursor = this.head; cursor; cursor = cursor.next) nodes.push(cursor.node);
    return collapseText(nodes);
  }
}

/** Joins neighbouring text nodes and drops empty ones. */
export function collapseText(nodes) {
  const result = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      if (node.value === '') continue;
      const previous = result.at(-1);
      if (previous?.type === 'text') {
        previous.value += node.value;
        continue;
      }
    }
    result.push(node);
  }
  return result;
}
