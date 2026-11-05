// URL policy: decide whether a link target may appear in the output, and encode
// the ones that may.

export const DEFAULT_SCHEMES = Object.freeze(['http', 'https', 'mailto', 'tel', 'ftp']);

// Raster images only: an SVG data URL can carry script.
const SAFE_IMAGE_DATA = /^data:image\/(?:png|gif|jpeg|webp)[;,]/i;

// Browsers ignore these while parsing a URL, so `java\tscript:` is still a script
// URL. They are removed before looking for the scheme.
const IGNORED_BY_BROWSERS = /[\u0000-\u0020\u007f-\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]/g;

/** Returns the lower-cased scheme of a URL, or null for a relative one. */
export function urlScheme(url) {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(url.replace(IGNORED_BY_BROWSERS, ''));
  return match ? match[1].toLowerCase() : null;
}

/** Checks a URL against an allow-list. `kind` is 'link' or 'image'. */
export function isSafeUrl(url, { schemes = DEFAULT_SCHEMES, kind = 'link' } = {}) {
  const scheme = urlScheme(url);
  if (scheme === null || schemes.includes(scheme)) return true;
  if (kind === 'image' && scheme === 'data') {
    return SAFE_IMAGE_DATA.test(url.replace(IGNORED_BY_BROWSERS, ''));
  }
  return false;
}

const URL_SAFE = /[A-Za-z0-9\-._~:/?#@!$&'()*+,;=]/;

/** Percent-encodes what a URL can't contain, leaving existing `%XX` sequences alone. */
export function encodeUrl(url) {
  let out = '';
  for (let i = 0; i < url.length; i++) {
    const ch = url[i];
    if (URL_SAFE.test(ch)) {
      out += ch;
    } else if (ch === '%') {
      out += /^[0-9a-fA-F]{2}$/.test(url.slice(i + 1, i + 3)) ? '%' : '%25';
    } else {
      const code = url.codePointAt(i);
      const char = String.fromCodePoint(code);
      // A lone surrogate can't be encoded as UTF-8.
      out += code >= 0xd800 && code <= 0xdfff ? '%EF%BF%BD' : encodeURIComponent(char);
      i += char.length - 1;
    }
  }
  return out;
}

/** Returns the encoded URL, or null when policy rejects it. */
export function sanitizeUrl(url, options) {
  return isSafeUrl(url, options) ? encodeUrl(url) : null;
}
