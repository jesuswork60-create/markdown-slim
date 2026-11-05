// Front matter: a small `key: value` block between `---` fences on the first
// lines of a document. This is deliberately not YAML. A block holding anything
// other than simple pairs is treated as ordinary Markdown.

const OPENING_FENCE = /^---[ \t]*$/;
const CLOSING_FENCE = /^(?:---|\.\.\.)[ \t]*$/;
const PAIR = /^([A-Za-z_][\w.-]*)[ \t]*:(?:[ \t]+(.*))?$/;
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function parseDoubleQuoted(text) {
  let value = '';
  for (let i = 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') return { value, end: i + 1 };
    if (ch !== '\\') {
      value += ch;
      continue;
    }
    const next = text[++i];
    if (next === undefined) return null;
    value += { n: '\n', t: '\t' }[next] ?? next;
  }
  return null;
}

function parseSingleQuoted(text) {
  let value = '';
  for (let i = 1; i < text.length; i++) {
    if (text[i] !== "'") {
      value += text[i];
    } else if (text[i + 1] === "'") {
      value += "'";
      i++;
    } else {
      return { value, end: i + 1 };
    }
  }
  return null;
}

function parseQuoted(text) {
  return text[0] === '"' ? parseDoubleQuoted(text) : parseSingleQuoted(text);
}

function parseScalar(text) {
  if (text === '' || text === '~' || text === 'null') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (NUMBER.test(text)) return Number(text);
  return text;
}

// Splits `a, "b, c", d` on the commas outside quotes.
function parseList(body) {
  const items = [];
  let rest = body.trim();
  while (rest !== '') {
    if (rest[0] === '"' || rest[0] === "'") {
      const quoted = parseQuoted(rest);
      if (quoted) {
        items.push(quoted.value);
        rest = rest.slice(quoted.end).replace(/^\s*,?\s*/, '');
        continue;
      }
    }
    const comma = rest.indexOf(',');
    const item = comma === -1 ? rest : rest.slice(0, comma);
    items.push(parseScalar(item.trim()));
    rest = comma === -1 ? '' : rest.slice(comma + 1).trimStart();
  }
  return items;
}

function stripComment(text) {
  const hash = text.search(/[ \t]#/);
  return (hash === -1 ? text : text.slice(0, hash)).trimEnd();
}

/** Parses one value: quoted string, `[list]`, boolean, null, number or bare string. */
export function parseFrontMatterValue(raw) {
  const text = raw.trim();
  if (text[0] === '"' || text[0] === "'") {
    const quoted = parseQuoted(text);
    if (quoted) return quoted.value;
  }
  // A closing bracket at the very end means any `#` inside is list content.
  if (text.startsWith('[') && text.endsWith(']')) return parseList(text.slice(1, -1));
  const bare = stripComment(text);
  if (bare.startsWith('[') && bare.endsWith(']')) return parseList(bare.slice(1, -1));
  return parseScalar(bare);
}

/**
 * Splits leading front matter from a source string. Returns `data` (null when
 * there is none), the remaining `body`, and `bodyLine`, the 1-based source line
 * where the body starts.
 */
export function parseFrontMatter(source) {
  const none = { data: null, body: source, bodyLine: 1 };
  const lines = source.split(/\r\n|\n|\r/);
  if (!OPENING_FENCE.test(lines[0])) return none;

  const data = Object.create(null);
  let pairs = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (CLOSING_FENCE.test(line)) {
      if (pairs === 0) return none;
      return { data, body: lines.slice(i + 1).join('\n'), bodyLine: i + 2 };
    }
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const match = PAIR.exec(line);
    if (!match) return none;
    data[match[1]] = parseFrontMatterValue(match[2] ?? '');
    pairs++;
  }
  return none;
}
