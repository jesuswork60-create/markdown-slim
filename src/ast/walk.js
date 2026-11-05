// Tree traversal helpers for the AST. Every node with descendants keeps them in
// a `children` array, so the walker needs no knowledge of specific node types.

/** Visitor result: don't descend into this node's children. */
export const SKIP = Symbol('skip');
/** Visitor result: detach this node from its parent. */
export const REMOVE = Symbol('remove');
/** Visitor result: end the whole walk. */
export const STOP = Symbol('stop');

/**
 * Walks depth first in document order. `visitor` is a function called on entry,
 * or an object with `enter` and/or `leave`. Each callback receives the node and
 * `{ parent, index, ancestors }` and may return SKIP, REMOVE, STOP or a
 * replacement node. Returns the root, which a replacement may have changed.
 */
export function walk(root, visitor) {
  const enter = typeof visitor === 'function' ? visitor : visitor.enter;
  const leave = typeof visitor === 'function' ? undefined : visitor.leave;
  const ancestors = [];
  let result = root;

  const replace = (parent, index, node) => {
    if (parent) parent.children[index] = node;
    else result = node;
  };

  const visit = (node, parent, index) => {
    let current = node;
    let descend = true;

    if (enter) {
      const outcome = enter(current, { parent, index, ancestors });
      if (outcome === STOP || outcome === REMOVE) return outcome;
      if (outcome === SKIP) descend = false;
      else if (outcome && typeof outcome === 'object') {
        replace(parent, index, outcome);
        current = outcome;
      }
    }

    if (descend && current.children) {
      ancestors.push(current);
      let i = 0;
      while (i < current.children.length) {
        const outcome = visit(current.children[i], current, i);
        if (outcome === STOP) {
          ancestors.pop();
          return STOP;
        }
        if (outcome === REMOVE) current.children.splice(i, 1);
        else i++;
      }
      ancestors.pop();
    }

    if (leave) {
      const outcome = leave(current, { parent, index, ancestors });
      if (outcome === STOP || outcome === REMOVE) return outcome;
      if (outcome && typeof outcome === 'object') replace(parent, index, outcome);
    }
    return undefined;
  };

  const outcome = visit(root, null, 0);
  if (outcome === REMOVE) throw new TypeError('walk: the root node cannot be removed');
  return result;
}

function toPredicate(test) {
  return typeof test === 'function' ? test : (node) => node.type === test;
}

/** Returns the first node matching a type name or predicate, or null. */
export function find(root, test) {
  const matches = toPredicate(test);
  let found = null;
  walk(root, (node) => {
    if (!matches(node)) return undefined;
    found = node;
    return STOP;
  });
  return found;
}

/** Returns every node matching a type name or predicate, in document order. */
export function findAll(root, test) {
  const matches = toPredicate(test);
  const found = [];
  walk(root, (node) => {
    if (matches(node)) found.push(node);
  });
  return found;
}

/** The plain text of a subtree: what a reader sees with the markup removed. */
export function textContent(node) {
  switch (node.type) {
    case 'text':
    case 'code_span':
      return node.value;
    case 'soft_break':
    case 'hard_break':
      return ' ';
    default:
      return node.children ? node.children.map(textContent).join('') : '';
  }
}
