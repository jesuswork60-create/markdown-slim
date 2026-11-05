// Recognisers for raw HTML, used by both HTML blocks and inline HTML.

const TAG_NAME = '[A-Za-z][A-Za-z0-9-]*';
const ATTRIBUTE_NAME = '[a-zA-Z_:][a-zA-Z0-9:._-]*';
const ATTRIBUTE_VALUE = `(?:[^"'=<>\`\\x00-\\x20]+|'[^']*'|"[^"]*")`;
const ATTRIBUTE = `(?:\\s+${ATTRIBUTE_NAME}(?:\\s*=\\s*${ATTRIBUTE_VALUE})?)`;

export const OPEN_TAG = `<${TAG_NAME}${ATTRIBUTE}*\\s*/?>`;
export const CLOSE_TAG = `</${TAG_NAME}\\s*>`;

const TAG_AT = new RegExp(`${OPEN_TAG}|${CLOSE_TAG}`, 'y');

// Constructs closed by a fixed terminator. Declaration comes last so it
// doesn't shadow the more specific `<!--` and `<![CDATA[` openers.
const TERMINATED = [
  { open: '<!--', close: '-->', searchFrom: 2 },
  { open: '<?', close: '?>', searchFrom: 2 },
  { open: '<![CDATA[', close: ']]>', searchFrom: 9 },
  { open: '<!', close: '>', searchFrom: 2, next: /[A-Za-z]/ },
];

/**
 * Returns the index just past the inline HTML construct at `pos`, or -1.
 * `exhausted` remembers openers whose terminator is known to be absent from
 * the rest of the text, which keeps repeated `<!--` input linear.
 */
export function scanInlineHtml(text, pos, exhausted) {
  for (const kind of TERMINATED) {
    if (!text.startsWith(kind.open, pos)) continue;
    if (kind.next && !kind.next.test(text[pos + kind.open.length] ?? '')) continue;
    if (exhausted.has(kind.open)) return -1;
    const end = text.indexOf(kind.close, pos + kind.searchFrom);
    if (end === -1) {
      exhausted.add(kind.open);
      return -1;
    }
    return end + kind.close.length;
  }
  TAG_AT.lastIndex = pos;
  return TAG_AT.test(text) ? TAG_AT.lastIndex : -1;
}
