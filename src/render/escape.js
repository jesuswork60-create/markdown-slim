const REPLACEMENTS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Escapes text for use in HTML content or a double-quoted attribute. */
export function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (ch) => REPLACEMENTS[ch]);
}
