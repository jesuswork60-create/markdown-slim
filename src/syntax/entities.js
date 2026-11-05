// HTML entity decoding. Numeric references are complete; named references
// cover the common subset below rather than the full HTML5 table.

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', iexcl: '¡', cent: '¢',
  pound: '£', curren: '¤', yen: '¥', brvbar: '¦', sect: '§', uml: '¨', copy: '©', ordf: 'ª',
  laquo: '«', not: '¬', shy: '\u00ad', reg: '®', macr: '¯', deg: '°', plusmn: '±', sup2: '²',
  sup3: '³', acute: '´', micro: 'µ', para: '¶', middot: '·', cedil: '¸', sup1: '¹', ordm: 'º',
  raquo: '»', frac14: '¼', frac12: '½', frac34: '¾', iquest: '¿', times: '×', divide: '÷',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ', Ccedil: 'Ç',
  Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï',
  Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø',
  Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý', szlig: 'ß',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ', ccedil: 'ç',
  egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  ntilde: 'ñ', ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', yuml: 'ÿ',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', hellip: '…',
  trade: '™', larr: '←', uarr: '↑', rarr: '→', darr: '↓', harr: '↔', ne: '≠', le: '≤', ge: '≥',
  infin: '∞', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', pi: 'π', sigma: 'σ', mu: 'μ', omega: 'ω',
};

const REPLACEMENT = '\ufffd';

function decodeNumeric(code) {
  if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return REPLACEMENT;
  return String.fromCodePoint(code);
}

/** Matches one entity reference; keep in step with `decodeEntity`. */
export const ENTITY_SOURCE = '&(?:#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});';

/**
 * Decodes a whole reference such as `&amp;` or `&#35;`.
 * Returns null for a named reference this table does not know.
 */
export function decodeEntity(reference) {
  const body = reference.slice(1, -1);
  if (body[0] === '#') {
    const hex = body[1] === 'x' || body[1] === 'X';
    return decodeNumeric(hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10));
  }
  return Object.hasOwn(NAMED, body) ? NAMED[body] : null;
}

const ESCAPE_OR_ENTITY = new RegExp(`\\\\([!-/:-@[-\`{-~])|${ENTITY_SOURCE}`, 'g');

/** Resolves backslash escapes and entities in link destinations, titles and info strings. */
export function unescapeString(text) {
  if (!text.includes('\\') && !text.includes('&')) return text;
  return text.replace(ESCAPE_OR_ENTITY, (match, escaped) => {
    if (escaped !== undefined) return escaped;
    return decodeEntity(match) ?? match;
  });
}
