// Inputs that make naive parsers take quadratic time or lose content. The time
// limits are generous: they catch blow-ups, not small slowdowns.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { markdownToHtml } from '../src/index.js';

const N = 20000;
const LIMIT_MS = 5000;

function timed(name, source) {
  it(name, () => {
    const start = performance.now();
    const html = markdownToHtml(source);
    assert.ok(performance.now() - start < LIMIT_MS, `took too long on ${name}`);
    assert.equal(typeof html, 'string');
  });
}

describe('pathological input stays fast', () => {
  timed('unmatched stars', 'a* '.repeat(N));
  timed('unmatched openers', '*a '.repeat(N));
  timed('alternating delimiters', '*_'.repeat(N));
  timed('runs that can both open and close', 'a**b'.repeat(N));
  timed('open brackets', '['.repeat(N));
  timed('nested brackets', `${'['.repeat(N)}a${']'.repeat(N)}`);
  timed('close brackets', ']'.repeat(N));
  timed('image openers', '!['.repeat(N));
  timed('links under open brackets', `${'['.repeat(N / 4)}${'[a](/u) '.repeat(N / 4)}`);
  timed('backtick runs of growing length', Array.from({ length: 300 }, (_, i) => '`'.repeat(i + 1)).join(' '));
  timed('unclosed backticks', '`a'.repeat(N));
  timed('unclosed comments', '<!-- '.repeat(N));
  timed('unclosed processing instructions', '<? '.repeat(N));
  timed('unclosed CDATA', '<![CDATA[ '.repeat(N));
  timed('unclosed tags', '<a '.repeat(N));
  timed('many ampersands', '&'.repeat(N));
  timed('long run of spaces', `a${' '.repeat(N)}b`);
  timed('many short paragraphs', 'a\n\n'.repeat(N));
  timed('many list items', '- a\n'.repeat(N));
  timed('long table', `a|b\n-|-\n${'1|2\n'.repeat(N)}`);
  timed('many reference definitions', '[a]: /u\n'.repeat(N));
  timed('many footnotes', Array.from({ length: 2000 }, (_, i) => `[^${i}]\n\n[^${i}]: x\n\n`).join(''));
  timed('repeated headings', '# a\n'.repeat(2000));
  timed('moderately deep quotes', `${'>'.repeat(500)} a`);
  timed('moderately deep lists', Array.from({ length: 200 }, (_, i) => `${'  '.repeat(i)}- a`).join('\n'));
});

describe('content is preserved', () => {
  it('the text of unresolved markup survives', () => {
    assert.equal(markdownToHtml('[*a](b **c `d'), '<p>[*a](b **c `d</p>\n');
  });

  it('control characters in text don\'t break parsing', () => {
    const text = `a${String.fromCharCode(1)}b${String.fromCharCode(0x7f)}c`;
    assert.equal(markdownToHtml(text), `<p>${text}</p>\n`);
  });

  it('surrogate pairs and lone surrogates pass through', () => {
    assert.equal(markdownToHtml('😀*a*'), '<p>😀<em>a</em></p>\n');
    const lone = String.fromCharCode(0xd83d);
    assert.equal(markdownToHtml(`${lone}*a*`), `<p>${lone}<em>a</em></p>\n`);
  });

  it('the same source always gives the same output', () => {
    const source = '# a\n\n*b* [c][d] [^e]\n\n[d]: /u\n[^e]: f\n';
    assert.equal(markdownToHtml(source), markdownToHtml(source));
  });
});
