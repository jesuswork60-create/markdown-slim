// Numbers footnote references in reading order and gathers the referenced
// definitions into a `footnotes` node at the end of the document. Definitions
// nothing refers to are dropped.

import { normalizeLabel } from '../syntax/link-parts.js';
import { walk } from './walk.js';

export function attachFootnotes(document, definitions) {
  const ordered = [];

  const collect = (root) => {
    walk(root, (node) => {
      if (node.type !== 'footnote_ref') return;
      const definition = definitions[normalizeLabel(node.label)];
      if (definition.number === undefined) {
        ordered.push(definition);
        definition.number = ordered.length;
        definition.refCount = 0;
      }
      definition.refCount++;
      node.number = definition.number;
      node.refIndex = definition.refCount;
    });
  };

  collect(document);
  // A definition may reference another one, so the list can grow during this loop.
  for (let i = 0; i < ordered.length; i++) collect(ordered[i]);

  if (ordered.length > 0) {
    document.children.push({ type: 'footnotes', children: ordered });
  }
}
