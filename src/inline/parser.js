// Second parsing phase: turns the raw text of one block into inline nodes.
// A single left-to-right scan handles the constructs that bind tightest (code
// spans, autolinks, raw HTML, escapes) and records delimiter runs and brackets,
// which are resolved into emphasis and links as their closers appear.

import { isAsciiPunctuation, isSpaceOrTab } from '../syntax/chars.js';
import { decodeEntity, ENTITY_SOURCE } from '../syntax/entities.js';
import { scanInlineHtml } from '../syntax/html-tags.js';
import {
  normalizeLabel,
  parseLinkDestination,
  parseLinkLabel,
  parseLinkTitle,
  skipSpacesAndNewline,
} from '../syntax/link-parts.js';
import { classifyRun, DelimiterStack, resolveDelimiters } from './emphasis.js';
import { InlineList } from './node-list.js';

const PLAIN_TEXT = /[^\\`*_~&<[\]!\n]+/y;
const ENTITY = new RegExp(ENTITY_SOURCE, 'y');
const URI_AUTOLINK = /<([A-Za-z][A-Za-z0-9.+-]{1,31}:[^\x00-\x20<>]*)>/y;
const EMAIL_AUTOLINK =
  /<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/y;
const FOOTNOTE_REF = /\[\^([^\]\s]+)\]/y;

function matchAt(regex, text, pos) {
  regex.lastIndex = pos;
  return regex.exec(text);
}

function codeSpanValue(content) {
  const value = content.replaceAll('\n', ' ');
  const padded = value.length > 1 && value.startsWith(' ') && value.endsWith(' ');
  return padded && value.trim() !== '' ? value.slice(1, -1) : value;
}

class InlineParser {
  constructor(raw, scope) {
    this.raw = raw;
    this.scope = scope;
    this.pos = 0;
    this.list = new InlineList();
    this.delimiters = new DelimiterStack();
    this.brackets = [];
    // Memos that keep hostile input (many unclosed backticks or comments) linear.
    this.backtickRunsWithoutCloser = new Set();
    this.exhaustedHtml = new Set();
  }

  run() {
    while (this.pos < this.raw.length) this.step();
    resolveDelimiters(this.list, this.delimiters, null);
    return this.list.toArray();
  }

  step() {
    switch (this.raw[this.pos]) {
      case '\n': this.lineBreak(); break;
      case '\\': this.backslash(); break;
      case '`': this.codeSpan(); break;
      case '*':
      case '_':
      case '~': this.delimiterRun(); break;
      case '&': this.entity(); break;
      case '<': this.angleBracket(); break;
      case '[': this.openBracket(); break;
      case '!': this.bang(); break;
      case ']': this.closeBracket(); break;
      default: this.plainText();
    }
  }

  addText(value, opaque = false) {
    const entry = this.list.append({ type: 'text', value });
    entry.opaque = opaque;
    return entry;
  }

  plainText() {
    const match = matchAt(PLAIN_TEXT, this.raw, this.pos);
    this.addText(match[0]);
    this.pos += match[0].length;
  }

  skipLineIndent() {
    while (isSpaceOrTab(this.raw[this.pos])) this.pos++;
  }

  lineBreak() {
    const { tail } = this.list;
    let hard = false;
    if (tail && tail.node.type === 'text' && !tail.opaque) {
      const { value } = tail.node;
      let end = value.length;
      while (end > 0 && value[end - 1] === ' ') end--;
      hard = value.length - end >= 2;
      tail.node.value = value.slice(0, end);
    }
    this.list.append({ type: hard ? 'hard_break' : 'soft_break' });
    this.pos++;
    this.skipLineIndent();
  }

  backslash() {
    const next = this.raw[this.pos + 1];
    if (next === '\n') {
      this.list.append({ type: 'hard_break' });
      this.pos += 2;
      this.skipLineIndent();
    } else if (isAsciiPunctuation(next)) {
      this.addText(next, true);
      this.pos += 2;
    } else {
      this.addText('\\');
      this.pos++;
    }
  }

  codeSpan() {
    const { raw, pos: start } = this;
    let contentStart = start;
    while (raw[contentStart] === '`') contentStart++;
    const length = contentStart - start;

    if (!this.backtickRunsWithoutCloser.has(length)) {
      let i = contentStart;
      while ((i = raw.indexOf('`', i)) !== -1) {
        let runEnd = i;
        while (raw[runEnd] === '`') runEnd++;
        if (runEnd - i === length) {
          this.list.append({ type: 'code_span', value: codeSpanValue(raw.slice(contentStart, i)) });
          this.pos = runEnd;
          return;
        }
        i = runEnd;
      }
      this.backtickRunsWithoutCloser.add(length);
    }
    this.addText(raw.slice(start, contentStart));
    this.pos = contentStart;
  }

  delimiterRun() {
    const { raw, pos: start } = this;
    const char = raw[start];
    let end = start;
    while (raw[end] === char) end++;
    const count = end - start;
    const entry = this.addText(raw.slice(start, end));
    this.pos = end;
    if (char === '~' && count > 2) return;
    const { canOpen, canClose } = classifyRun(raw, start, end);
    if (canOpen || canClose) {
      this.delimiters.push({ char, count, originalCount: count, canOpen, canClose, entry });
    }
  }

  entity() {
    const match = matchAt(ENTITY, this.raw, this.pos);
    const decoded = match && decodeEntity(match[0]);
    if (decoded == null) {
      this.addText('&');
      this.pos++;
      return;
    }
    this.addText(decoded, true);
    this.pos += match[0].length;
  }

  angleBracket() {
    const uri = matchAt(URI_AUTOLINK, this.raw, this.pos);
    const email = uri ? null : matchAt(EMAIL_AUTOLINK, this.raw, this.pos);
    if (uri || email) {
      this.autolink(uri ?? email, uri ? uri[1] : `mailto:${email[1]}`);
      return;
    }
    const end = scanInlineHtml(this.raw, this.pos, this.exhaustedHtml);
    if (end !== -1) {
      this.list.append({ type: 'html_inline', value: this.raw.slice(this.pos, end) });
      this.pos = end;
    } else {
      this.addText('<');
      this.pos++;
    }
  }

  autolink(match, url) {
    this.list.append({
      type: 'link',
      url,
      title: '',
      autolink: true,
      children: [{ type: 'text', value: match[1] }],
    });
    this.pos += match[0].length;
  }

  pushBracket(image, textLength) {
    const top = this.brackets.at(-1);
    if (top) top.hasBracketAfter = true;
    const entry = this.addText(this.raw.slice(this.pos, this.pos + textLength));
    this.pos += textLength;
    this.brackets.push({
      entry,
      image,
      contentStart: this.pos,
      active: true,
      hasBracketAfter: false,
      delimiterBottom: this.delimiters.top,
    });
  }

  openBracket() {
    const footnote = matchAt(FOOTNOTE_REF, this.raw, this.pos);
    if (footnote && normalizeLabel(footnote[1]) in this.scope.footnotes) {
      this.list.append({ type: 'footnote_ref', label: footnote[1] });
      this.pos += footnote[0].length;
      return;
    }
    this.pushBracket(false, 1);
  }

  bang() {
    if (this.raw[this.pos + 1] === '[') {
      this.pushBracket(true, 2);
    } else {
      this.addText('!');
      this.pos++;
    }
  }

  closeBracket() {
    const closePos = this.pos;
    this.pos++;
    const opener = this.brackets.at(-1);
    if (!opener || !opener.active) {
      if (opener) this.brackets.pop();
      this.addText(']');
      return;
    }

    const target = this.inlineTarget() ?? this.referenceTarget(opener, closePos);
    this.brackets.pop();
    if (!target) {
      this.addText(']');
      return;
    }

    resolveDelimiters(this.list, this.delimiters, opener.delimiterBottom);
    const children = this.list.takeBetween(opener.entry, null);
    this.list.remove(opener.entry);
    this.list.append({
      type: opener.image ? 'image' : 'link',
      url: target.url,
      title: target.title,
      children,
    });

    // Links can't nest: earlier `[` openers may no longer form links. Images may
    // hold links, so `![` openers stay active. Everything below an inactive
    // non-image opener has already been deactivated, so the loop can stop there.
    if (!opener.image) {
      for (let i = this.brackets.length - 1; i >= 0; i--) {
        const bracket = this.brackets[i];
        if (bracket.image) continue;
        if (!bracket.active) break;
        bracket.active = false;
      }
    }
  }

  // Parses `(destination "title")` right after the closing bracket.
  inlineTarget() {
    const { raw } = this;
    if (raw[this.pos] !== '(') return null;
    let i = skipSpacesAndNewline(raw, this.pos + 1);
    const destination = parseLinkDestination(raw, i);
    if (!destination) return null;
    i = destination.end;

    const afterDestination = skipSpacesAndNewline(raw, i);
    let title = '';
    if (afterDestination > i) {
      const parsed = parseLinkTitle(raw, afterDestination);
      if (parsed) {
        title = parsed.value;
        i = skipSpacesAndNewline(raw, parsed.end);
      } else {
        i = afterDestination;
      }
    }
    if (raw[i] !== ')') return null;
    this.pos = i + 1;
    return { url: destination.value, title };
  }

  // Resolves full, collapsed and shortcut reference forms.
  referenceTarget(opener, closePos) {
    const { raw } = this;
    const explicit = parseLinkLabel(raw, this.pos);
    let label = explicit?.raw ?? null;
    let end = explicit?.end ?? this.pos;
    if (label === null) {
      // Link text containing brackets can't double as a label.
      if (opener.hasBracketAfter) return null;
      if (raw.startsWith('[]', this.pos)) end = this.pos + 2;
      label = raw.slice(opener.contentStart, closePos);
    }
    if (label.length > 999) return null;
    const definition = this.scope.references[normalizeLabel(label)];
    if (!definition) return null;
    this.pos = end;
    return definition;
  }
}

const EMPTY_SCOPE = { references: Object.create(null), footnotes: Object.create(null) };

/** Parses inline markup. `scope` supplies the document's references and footnote labels. */
export function parseInlines(raw, scope = EMPTY_SCOPE) {
  return new InlineParser(raw, scope).run();
}
