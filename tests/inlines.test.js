import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { markdownToHtml, parseInlines } from '../src/index.js';

const paragraph = (inner) => `<p>${inner}</p>\n`;

function cases(table) {
  for (const [name, source, expected] of table) {
    it(name, () => assert.equal(markdownToHtml(source), paragraph(expected)));
  }
}

describe('backslash escapes', () => {
  cases([
    ['ASCII punctuation', '\\*a\\* \\[b\\] \\` \\\\', '*a* [b] ` \\'],
    ['other characters keep the backslash', '\\a \\é', '\\a \\é'],
    ['escaped entity stays literal', '\\&amp;', '&amp;amp;'],
    ['no effect inside code', '`\\*`', '<code>\\*</code>'],
    ['in link destinations', '[a](/u\\)v)', '<a href="/u)v">a</a>'],
    ['backslash at the end', 'a\\', 'a\\'],
  ]);
});

describe('entities', () => {
  cases([
    ['named', '&copy; &amp; &ndash;', '© &amp; –'],
    ['decimal', '&#35; &#1234;', '# Ӓ'],
    ['hexadecimal', '&#X22; &#xD06;', '&quot; ആ'],
    ['invalid code points become the replacement character', `&#0; &#xD800; &#x110000;`, `${'\ufffd'} ${'\ufffd'} ${'\ufffd'}`],
    ['unknown names stay literal', '&nosuch; &amp', '&amp;nosuch; &amp;amp'],
    ['decoded text is not markup', '&#42;a&#42;', '*a*'],
    ['in link titles and targets', '[a](/f&ouml; "&auml;")', '<a href="/f%C3%B6" title="ä">a</a>'],
    ['not inside code', '`&amp;`', '<code>&amp;amp;</code>'],
    ['object members are not entities', '&constructor;', '&amp;constructor;'],
  ]);
});

describe('code spans', () => {
  cases([
    ['simple', '`a`', '<code>a</code>'],
    ['longer fence holds backticks', '`` a`b ``', '<code>a`b</code>'],
    ['one space stripped each side', '`  a  `', '<code> a </code>'],
    ['spaces only are kept', '`   `', '<code>   </code>'],
    ['newlines become spaces', '`a\nb`', '<code>a b</code>'],
    ['binds tighter than emphasis', '*a`*`', '*a<code>*</code>'],
    ['binds tighter than links', '[a`](/u)`', '[a<code>](/u)</code>'],
    ['unmatched run is literal', '```a``', '```a``'],
    ['escapes HTML', '`<b>`', '<code>&lt;b&gt;</code>'],
  ]);
});

describe('emphasis and strong', () => {
  cases([
    ['star', '*a*', '<em>a</em>'],
    ['underscore', '_a_', '<em>a</em>'],
    ['strong', '**a** __b__', '<strong>a</strong> <strong>b</strong>'],
    ['both', '***a***', '<em><strong>a</strong></em>'],
    ['space before closer', '*a *', '*a *'],
    ['intraword star', 'a*b*c', 'a<em>b</em>c'],
    ['intraword underscore is literal', 'a_b_c', 'a_b_c'],
    ['snake case', 'foo_bar_baz', 'foo_bar_baz'],
    ['punctuation neighbours', 'a*"b"*', 'a*&quot;b&quot;*'],
    ['underscore next to punctuation', '"_a_"', '&quot;<em>a</em>&quot;'],
    ['nested', '*a **b** c*', '<em>a <strong>b</strong> c</em>'],
    ['strong holding emphasis', '**a *b* c**', '<strong>a <em>b</em> c</strong>'],
    ['rule of three', '*a**b*', '<em>a**b</em>'],
    ['rule of three, longer', '***a** b*', '<em><strong>a</strong> b</em>'],
    ['unbalanced extra stars on the left', '**a*', '*<em>a</em>'],
    ['unbalanced extra stars on the right', '*a**', '<em>a</em>*'],
    ['different characters don\'t pair', '*a_', '*a_'],
    ['interleaved, first closer wins', '*a _b* c_', '<em>a _b</em> c_'],
    ['escaped delimiter', '*a\\*', '*a*'],
    ['unicode symbols count as punctuation', '*£*b', '*£*b'],
    ['a symbol before a closer at the end is fine', '*£*', '<em>£</em>'],
    ['unicode whitespace counts', `*${String.fromCharCode(0xa0)}a*`, `*${String.fromCharCode(0xa0)}a*`],
    ['astral letter next to a run', '𝐚*b*', '𝐚<em>b</em>'],
    ['spans lines', '*a\nb*', '<em>a\nb</em>'],
  ]);

  it('a star followed by a space at line start is a list marker', () => {
    assert.equal(markdownToHtml('* a*'), '<ul>\n<li>a*</li>\n</ul>\n');
  });
});

describe('strikethrough', () => {
  cases([
    ['double tilde', '~~a~~', '<del>a</del>'],
    ['single tilde', '~a~', '<del>a</del>'],
    ['three tildes are literal', 'x ~~~a~~~', 'x ~~~a~~~'],
    ['counts must match', '~~a~', '~~a~'],
    ['holds other markup', '~~*a*~~', '<del><em>a</em></del>'],
    ['inside other markup', '**~~a~~**', '<strong><del>a</del></strong>'],
    ['space before closer', '~~a ~~', '~~a ~~'],
    ['intraword', 'a~~b~~c', 'a<del>b</del>c'],
  ]);
});

describe('links', () => {
  cases([
    ['inline', '[a](/u)', '<a href="/u">a</a>'],
    ['with title', '[a](/u "t")', '<a href="/u" title="t">a</a>'],
    ['title quote styles', `[a](/u 't') [b](/v (s))`, '<a href="/u" title="t">a</a> <a href="/v" title="s">b</a>'],
    ['empty destination', '[a]()', '<a href="">a</a>'],
    ['angle destination with spaces', '[a](<b c>)', '<a href="b%20c">a</a>'],
    ['space without angle brackets fails', '[a](b c)', '[a](b c)'],
    ['balanced parentheses', '[a](b(c)d)', '<a href="b(c)d">a</a>'],
    ['unbalanced parentheses fail', '[a](b(c)', '[a](b(c)'],
    ['whitespace around parts', '[a](  /u\n "t"  )', '<a href="/u" title="t">a</a>'],
    ['title needs a separating space', '[a](/u"t")', '<a href="/u%22t%22">a</a>'],
    ['unclosed angle destination', '[a](<b)', '[a](&lt;b)'],
    ['newline in an angle destination', '[a](<b\nc>)', '[a](&lt;b\nc&gt;)'],
    ['unclosed title', '[a](/u "t)', '[a](/u &quot;t)'],
    ['unclosed parenthesised title', '[a](/u (t)', '[a](/u (t)'],
    ['nested parenthesis in a title', '[a](/u (t(u)))', '[a](/u (t(u)))'],
    ['markup in text', '[*a* `b`](/u)', '<a href="/u"><em>a</em> <code>b</code></a>'],
    ['balanced brackets in text', '[a [b] c](/u)', '<a href="/u">a [b] c</a>'],
    ['escaped bracket in text', '[a\\]b](/u)', '<a href="/u">a]b</a>'],
    ['links do not nest', '[a [b](/1) c](/2)', '[a <a href="/1">b</a> c](/2)'],
    ['unmatched closing bracket', 'a] b', 'a] b'],
    ['unmatched opening bracket', '[a b', '[a b'],
    ['emphasis stays outside the link', '*[a*](/u)', '*<a href="/u">a*</a>'],
    ['URL is percent encoded', '[a](/ü?x=1&y=2)', '<a href="/%C3%BC?x=1&amp;y=2">a</a>'],
    ['existing escapes are preserved', '[a](/x%20y%zz)', '<a href="/x%20y%25zz">a</a>'],
  ]);

  describe('references', () => {
    const def = '\n\n[ref]: /u "t"\n';
    for (const [name, source, expected] of [
      ['full', '[a][ref]', '<a href="/u" title="t">a</a>'],
      ['collapsed', '[ref][]', '<a href="/u" title="t">ref</a>'],
      ['shortcut', '[ref]', '<a href="/u" title="t">ref</a>'],
      ['label is case insensitive', '[a][REF]', '<a href="/u" title="t">a</a>'],
      ['whitespace in labels collapses', '[a][ ref ]', '<a href="/u" title="t">a</a>'],
      ['undefined label stays literal', '[a][nope]', '[a][nope]'],
      ['undefined shortcut stays literal', '[nope]', '[nope]'],
      ['inline form wins', '[ref](/other)', '<a href="/other">ref</a>'],
      ['followed by text', '[ref] x', '<a href="/u" title="t">ref</a> x'],
      ['bracketed text can\'t be a shortcut', '[[ref]]', '[<a href="/u" title="t">ref</a>]'],
      ['undefined full label blocks the shortcut', '[ref][nope]', '[ref][nope]'],
    ]) {
      it(name, () => assert.equal(markdownToHtml(source + def), paragraph(expected)));
    }

    it('a full reference can follow an unresolved bracket', () => {
      const html = markdownToHtml('[foo][bar][baz]\n\n[baz]: /u\n');
      assert.equal(html, paragraph('[foo]<a href="/u">bar</a>'));
    });
  });
});

describe('images', () => {
  cases([
    ['inline', '![a](/i.png)', '<img src="/i.png" alt="a" />'],
    ['title', '![a](/i.png "t")', '<img src="/i.png" alt="a" title="t" />'],
    ['alt uses plain text', '![*a* `b` [c](/x)](/i.png)', '<img src="/i.png" alt="a b c" />'],
    ['empty alt', '![](/i.png)', '<img src="/i.png" alt="" />'],
    ['reference', '![a][r]\n\n[r]: /i.png', '<img src="/i.png" alt="a" />'],
    ['inside a link', '[![a](/i.png)](/u)', '<a href="/u"><img src="/i.png" alt="a" /></a>'],
    ['a link inside keeps the image opener active', '![[a](/x)](/i.png)', '<img src="/i.png" alt="a" />'],
    ['bang alone', 'a! b', 'a! b'],
    ['escaped bang', '\\![a](/u)', '!<a href="/u">a</a>'],
  ]);
});

describe('autolinks', () => {
  cases([
    ['URI', '<http://example.com/a?b=1>', '<a href="http://example.com/a?b=1">http://example.com/a?b=1</a>'],
    ['email', '<nobody@example.com>', '<a href="mailto:nobody@example.com">nobody@example.com</a>'],
    ['spaces are not allowed', '<http://example.com/a b>', '&lt;http://example.com/a b&gt;'],
    ['one letter scheme is not a URI', '<m:abc>', '&lt;m:abc&gt;'],
    ['ampersand escaped in both places', '<http://example.com/?a=1&b=2>', '<a href="http://example.com/?a=1&amp;b=2">http://example.com/?a=1&amp;b=2</a>'],
    ['bare URLs are left as text', 'http://example.com', 'http://example.com'],
  ]);

  it('marks the node', () => {
    const [node] = parseInlines('<http://example.com>');
    assert.equal(node.type, 'link');
    assert.equal(node.autolink, true);
  });
});

describe('line breaks', () => {
  cases([
    ['two spaces', 'a  \nb', 'a<br />\nb'],
    ['many spaces', 'a       \nb', 'a<br />\nb'],
    ['backslash', 'a\\\nb', 'a<br />\nb'],
    ['one space is soft', 'a \nb', 'a\nb'],
    ['leading space on the next line goes', 'a  \n     b', 'a<br />\nb'],
    ['not at the end of a paragraph', 'a  ', 'a'],
    ['after emphasis', '*a*  \nb', '<em>a</em><br />\nb'],
    ['entity space does not count', 'a&#32;&#32;\nb', 'a  \nb'],
    ['no effect in code spans', '`a  \nb`', '<code>a   b</code>'],
  ]);

  it('soft break output is configurable', () => {
    assert.equal(markdownToHtml('a\nb', { softBreak: '<br />\n' }), paragraph('a<br />\nb'));
  });
});

describe('inline HTML', () => {
  it('is escaped by default', () => {
    assert.equal(markdownToHtml('a <b c="1">d</b>'), paragraph('a &lt;b c=&quot;1&quot;&gt;d&lt;/b&gt;'));
  });

  for (const [name, source] of [
    ['open and close tags', 'a <b>c</b>'],
    ['attributes', 'a <x a=1 b="2" c=\'3\' d/>'],
    ['comment', 'a <!-- b --> c'],
    ['short comment', 'a <!--> c'],
    ['processing instruction', 'a <?x y?>'],
    ['declaration', 'a <!X y>'],
    ['CDATA', 'a <![CDATA[>&<]]>'],
  ]) {
    it(`${name} pass through with allowHtml`, () => {
      assert.equal(markdownToHtml(source, { allowHtml: true }), paragraph(source));
    });
  }

  for (const [name, source, expected] of [
    ['malformed attribute', 'a <b c=>', 'a &lt;b c=&gt;'],
    ['missing space between attributes', 'a <b c="1"d="2">', 'a &lt;b c=&quot;1&quot;d=&quot;2&quot;&gt;'],
    ['unterminated comment', 'a <!-- b', 'a &lt;!-- b'],
    ['stray angle bracket', '1 < 2 > 0', '1 &lt; 2 &gt; 0'],
  ]) {
    it(`${name} stays text`, () => {
      assert.equal(markdownToHtml(source, { allowHtml: true }), paragraph(expected));
    });
  }

  it('hides emphasis markers inside tags', () => {
    assert.equal(markdownToHtml('*a <b c="*">', { allowHtml: true }), paragraph('*a <b c="*">'));
  });
});

describe('parseInlines', () => {
  it('works without a document scope', () => {
    assert.deepEqual(parseInlines('a *b*'), [
      { type: 'text', value: 'a ' },
      { type: 'emphasis', children: [{ type: 'text', value: 'b' }] },
    ]);
  });

  it('merges adjacent text nodes', () => {
    assert.deepEqual(parseInlines('a\\*b&amp;c!d'), [{ type: 'text', value: 'a*b&c!d' }]);
  });

  it('accepts references from the scope', () => {
    const scope = {
      references: Object.assign(Object.create(null), { REF: { url: '/u', title: '' } }),
      footnotes: Object.create(null),
    };
    assert.equal(parseInlines('[ref]', scope)[0].url, '/u');
  });
});
