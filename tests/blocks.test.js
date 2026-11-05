import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { markdownToHtml, parse } from '../src/index.js';

const options = { headingIds: false };

function cases(table) {
  for (const [name, source, expected] of table) {
    it(name, () => assert.equal(markdownToHtml(source, options), expected));
  }
}

describe('headings', () => {
  cases([
    ['all ATX levels', '# a\n###### b\n', '<h1>a</h1>\n<h6>b</h6>\n'],
    ['seven hashes are text', '####### a\n', '<p>####### a</p>\n'],
    ['needs a space after the hashes', '#5 bolt\n', '<p>#5 bolt</p>\n'],
    ['closing sequence removed', '## foo ##\n', '<h2>foo</h2>\n'],
    ['closing sequence may differ in length', '# foo ######   \n', '<h1>foo</h1>\n'],
    ['hashes glued to text stay', '# foo#\n', '<h1>foo#</h1>\n'],
    ['escaped closing hash stays', '# foo \\#\n', '<h1>foo #</h1>\n'],
    ['empty heading', '#\n', '<h1></h1>\n'],
    ['only hashes is empty', '## ##\n', '<h2></h2>\n'],
    ['indented three spaces is fine', '   # foo\n', '<h1>foo</h1>\n'],
    ['indented four is code', '    # foo\n', '<pre><code># foo\n</code></pre>\n'],
    ['interrupts a paragraph', 'foo\n# bar\nbaz\n', '<p>foo</p>\n<h1>bar</h1>\n<p>baz</p>\n'],
    ['setext level one', 'Foo\n===\n', '<h1>Foo</h1>\n'],
    ['setext level two', 'Foo\n---\n', '<h2>Foo</h2>\n'],
    ['setext spans lines', 'Foo\nBar\n---\n', '<h2>Foo\nBar</h2>\n'],
    ['setext underline may be indented', 'Foo\n   ----      \n', '<h2>Foo</h2>\n'],
    ['setext underline can\'t contain spaces', 'Foo\n= =\n', '<p>Foo\n= =</p>\n'],
    ['underline without paragraph is a break', '---\n', '<hr />\n'],
    ['equals without paragraph is text', '===\n', '<p>===</p>\n'],
    ['lazy line can\'t form a setext heading', '> foo\n---\n', '<blockquote>\n<p>foo</p>\n</blockquote>\n<hr />\n'],
  ]);
});

describe('thematic breaks', () => {
  cases([
    ['three kinds', '***\n---\n___\n', '<hr />\n<hr />\n<hr />\n'],
    ['spaces between markers', ' - - -\n', '<hr />\n'],
    ['two markers are not enough', '--\n', '<p>--</p>\n'],
    ['mixed markers are text', '*-*\n', '<p><em>-</em></p>\n'],
    ['interrupts a paragraph', 'foo\n***\nbar\n', '<p>foo</p>\n<hr />\n<p>bar</p>\n'],
    ['wins over a list item', '* * *\n', '<hr />\n'],
    ['splits a list', '- a\n***\n- b\n', '<ul>\n<li>a</li>\n</ul>\n<hr />\n<ul>\n<li>b</li>\n</ul>\n'],
  ]);
});

describe('paragraphs', () => {
  cases([
    ['blank lines separate', 'aaa\n\nbbb\n', '<p>aaa</p>\n<p>bbb</p>\n'],
    ['leading space removed on each line', '  aaa\n bbb\n', '<p>aaa\nbbb</p>\n'],
    ['continuation may be deeply indented', 'aaa\n             bbb\n', '<p>aaa\nbbb</p>\n'],
    ['trailing spaces removed at the end', 'aaa     \n', '<p>aaa</p>\n'],
    ['empty input', '', ''],
    ['only blank lines', '\n  \n\t\n', ''],
    ['CRLF line endings', 'a\r\nb\r\n\r\nc\r\n', '<p>a\nb</p>\n<p>c</p>\n'],
    ['CR line endings', 'a\rb\r', '<p>a\nb</p>\n'],
    ['no final newline', 'a', '<p>a</p>\n'],
  ]);

  it('drops a byte order mark', () => {
    assert.equal(markdownToHtml(`${String.fromCharCode(0xfeff)}# a`, options), '<h1>a</h1>\n');
  });

  it('replaces NUL characters', () => {
    assert.equal(markdownToHtml('a\0b', options), `<p>a${String.fromCharCode(0xfffd)}b</p>\n`);
  });

  it('rejects non-string input', () => {
    assert.throws(() => parse(42), TypeError);
  });
});

describe('code blocks', () => {
  cases([
    ['indented', '    a\n    b\n', '<pre><code>a\nb\n</code></pre>\n'],
    ['keeps extra indentation', '      a\n', '<pre><code>  a\n</code></pre>\n'],
    ['interior blank lines kept', '    a\n\n\n    b\n', '<pre><code>a\n\n\nb\n</code></pre>\n'],
    ['surrounding blank lines dropped', '\n    a\n  \n\n', '<pre><code>a\n</code></pre>\n'],
    ['blank line whitespace beyond indent kept', '    a\n      \n    b\n', '<pre><code>a\n  \nb\n</code></pre>\n'],
    ['can\'t interrupt a paragraph', 'a\n    b\n', '<p>a\nb</p>\n'],
    ['ends at an unindented line', '    a\nb\n', '<pre><code>a\n</code></pre>\n<p>b</p>\n'],
    ['tab counts as indentation', '\ta\n', '<pre><code>a\n</code></pre>\n'],
    ['tab after spaces', '  \ta\n', '<pre><code>a\n</code></pre>\n'],
    ['backtick fence', '```\n<\n >\n```\n', '<pre><code>&lt;\n &gt;\n</code></pre>\n'],
    ['tilde fence', '~~~\na\n~~~\n', '<pre><code>a\n</code></pre>\n'],
    ['closing fence may be longer', '```\na\n`````\nb\n', '<pre><code>a\n</code></pre>\n<p>b</p>\n'],
    ['shorter fence does not close', '````\na\n```\n', '<pre><code>a\n```\n</code></pre>\n'],
    ['other fence char does not close', '```\na\n~~~\n', '<pre><code>a\n~~~\n</code></pre>\n'],
    ['unclosed runs to the end', '```\na\n\nb', '<pre><code>a\n\nb\n</code></pre>\n'],
    ['empty fence', '```\n```\n', '<pre><code></code></pre>\n'],
    ['blank lines only', '```\n\n  \n```\n', '<pre><code>\n  \n</code></pre>\n'],
    ['fence indent is removed', '   ```\n   a\n  b\n c\n```\n', '<pre><code>a\nb\nc\n</code></pre>\n'],
    ['closing fence can\'t have text', '```\na\n``` x\n```\n', '<pre><code>a\n``` x\n</code></pre>\n'],
    ['interrupts a paragraph', 'a\n```\nb\n```\nc\n', '<p>a</p>\n<pre><code>b\n</code></pre>\n<p>c</p>\n'],
    ['info string gives the language', '```ruby startline=3\nx\n```\n', '<pre><code class="language-ruby">x\n</code></pre>\n'],
    ['info string is unescaped', '``` f&ouml;\\+\n```\n', '<pre><code class="language-fö+"></code></pre>\n'],
    ['backticks forbidden in backtick info', '``` a`b\n', '<p>``` a`b</p>\n'],
    ['backticks allowed in tilde info', '~~~ a`b\n~~~\n', '<pre><code class="language-a`b"></code></pre>\n'],
    ['markup inside is literal', '```\n*a* <b>\n```\n', '<pre><code>*a* &lt;b&gt;\n</code></pre>\n'],
  ]);

  it('records fence details on the node', () => {
    const [block] = parse('```js title="x"\n1\n```\n').children;
    assert.equal(block.fenced, true);
    assert.equal(block.lang, 'js');
    assert.equal(block.info, 'js title="x"');
    assert.equal(block.value, '1\n');
  });
});

describe('blockquotes', () => {
  cases([
    ['simple', '> a\n> b\n', '<blockquote>\n<p>a\nb</p>\n</blockquote>\n'],
    ['space after marker optional', '>a\n', '<blockquote>\n<p>a</p>\n</blockquote>\n'],
    ['indented marker', '   > a\n', '<blockquote>\n<p>a</p>\n</blockquote>\n'],
    ['four spaces is code', '    > a\n', '<pre><code>&gt; a\n</code></pre>\n'],
    ['lazy continuation', '> a\nb\n', '<blockquote>\n<p>a\nb</p>\n</blockquote>\n'],
    ['lazy across nesting', '> > a\nb\n> c\n', '<blockquote>\n<blockquote>\n<p>a\nb\nc</p>\n</blockquote>\n</blockquote>\n'],
    ['nested markers', '>>> a\n', '<blockquote>\n<blockquote>\n<blockquote>\n<p>a</p>\n</blockquote>\n</blockquote>\n</blockquote>\n'],
    ['blank line ends the quote', '> a\n\n> b\n', '<blockquote>\n<p>a</p>\n</blockquote>\n<blockquote>\n<p>b</p>\n</blockquote>\n'],
    ['blank quote line splits paragraphs', '> a\n>\n> b\n', '<blockquote>\n<p>a</p>\n<p>b</p>\n</blockquote>\n'],
    ['empty quote', '>\n', '<blockquote>\n</blockquote>\n'],
    ['interrupts a paragraph', 'a\n> b\n', '<p>a</p>\n<blockquote>\n<p>b</p>\n</blockquote>\n'],
    ['holds other blocks', '> # h\n> - x\n', '<blockquote>\n<h1>h</h1>\n<ul>\n<li>x</li>\n</ul>\n</blockquote>\n'],
    ['code is not lazy', '>     a\n    b\n', '<blockquote>\n<pre><code>a\n</code></pre>\n</blockquote>\n<pre><code>b\n</code></pre>\n'],
    ['fence is not lazy', '> ```\na\n', '<blockquote>\n<pre><code></code></pre>\n</blockquote>\n<p>a</p>\n'],
    ['tab after marker keeps its width', '>\t\ta\n', '<blockquote>\n<pre><code>  a\n</code></pre>\n</blockquote>\n'],
  ]);
});

describe('lists', () => {
  cases([
    ['bullet', '- a\n- b\n', '<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n'],
    ['ordered', '1. a\n2. b\n', '<ol>\n<li>a</li>\n<li>b</li>\n</ol>\n'],
    ['ordered start', '7) a\n', '<ol start="7">\n<li>a</li>\n</ol>\n'],
    ['start zero', '0. a\n', '<ol start="0">\n<li>a</li>\n</ol>\n'],
    ['ten digits is too long', '1234567890. a\n', '<p>1234567890. a</p>\n'],
    ['marker change starts a new list', '- a\n* b\n', '<ul>\n<li>a</li>\n</ul>\n<ul>\n<li>b</li>\n</ul>\n'],
    ['delimiter change starts a new list', '1. a\n1) b\n', '<ol>\n<li>a</li>\n</ol>\n<ol>\n<li>b</li>\n</ol>\n'],
    ['needs space after marker', '-a\n1.b\n', '<p>-a\n1.b</p>\n'],
    ['nested by content offset', '- a\n  - b\n    - c\n', '<ul>\n<li>a\n<ul>\n<li>b\n<ul>\n<li>c</li>\n</ul>\n</li>\n</ul>\n</li>\n</ul>\n'],
    ['too little indent stays a sibling', '- a\n - b\n  - c\n', '<ul>\n<li>a</li>\n<li>b</li>\n<li>c</li>\n</ul>\n'],
    ['ordered nesting needs marker width', '10. a\n    - b\n', '<ol start="10">\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n</ol>\n'],
    ['lazy line in item', '- a\nb\n', '<ul>\n<li>a\nb</li>\n</ul>\n'],
    ['unindented paragraph after blank ends list', '- a\n\nb\n', '<ul>\n<li>a</li>\n</ul>\n<p>b</p>\n'],
    ['interrupts a paragraph', 'a\n- b\n', '<p>a</p>\n<ul>\n<li>b</li>\n</ul>\n'],
    ['only 1 interrupts a paragraph', 'a\n2. b\n', '<p>a\n2. b</p>\n'],
    ['1 does interrupt', 'a\n1. b\n', '<p>a</p>\n<ol>\n<li>b</li>\n</ol>\n'],
    ['empty item can\'t interrupt', 'a\n-\n', '<h2>a</h2>\n'],
    ['empty items', '-\n- b\n-\n', '<ul>\n<li></li>\n<li>b</li>\n<li></li>\n</ul>\n'],
    ['item starting with blank line', '-\n  a\n', '<ul>\n<li>a</li>\n</ul>\n'],
    ['at most one blank before content', '-\n\n  a\n', '<ul>\n<li></li>\n</ul>\n<p>a</p>\n'],
    ['five spaces make code', '-     a\n', '<ul>\n<li>\n<pre><code>a\n</code></pre>\n</li>\n</ul>\n'],
    ['six spaces keep one in the code', '-      a\n', '<ul>\n<li>\n<pre><code> a\n</code></pre>\n</li>\n</ul>\n'],
    ['item holds code first', '1.     a\n', '<ol>\n<li>\n<pre><code>a\n</code></pre>\n</li>\n</ol>\n'],
    ['tab after marker', '-\ta\n', '<ul>\n<li>a</li>\n</ul>\n'],
    ['item holds a quote', '- > a\n', '<ul>\n<li>\n<blockquote>\n<p>a</p>\n</blockquote>\n</li>\n</ul>\n'],
    ['item holds a fence', '- ```\n  a\n  ```\n- b\n', '<ul>\n<li>\n<pre><code>a\n</code></pre>\n</li>\n<li>b</li>\n</ul>\n'],
    ['block after a tight paragraph', '- a\n  > b\n', '<ul>\n<li>a\n<blockquote>\n<p>b</p>\n</blockquote>\n</li>\n</ul>\n'],
    ['list inside a quote', '> - a\n> - b\n', '<blockquote>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n</blockquote>\n'],
  ]);

  describe('tight and loose', () => {
    cases([
      ['blank between items is loose', '- a\n\n- b\n', '<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ul>\n'],
      ['blank inside an item is loose', '- a\n\n  b\n- c\n', '<ul>\n<li>\n<p>a</p>\n<p>b</p>\n</li>\n<li>\n<p>c</p>\n</li>\n</ul>\n'],
      ['blank in a nested list only loosens that list', '- a\n  - b\n\n    c\n- d\n', '<ul>\n<li>a\n<ul>\n<li>\n<p>b</p>\n<p>c</p>\n</li>\n</ul>\n</li>\n<li>d</li>\n</ul>\n'],
      ['blank inside a fence stays tight', '- ```\n  a\n\n\n  ```\n- b\n', '<ul>\n<li>\n<pre><code>a\n\n\n</code></pre>\n</li>\n<li>b</li>\n</ul>\n'],
      ['trailing blank line stays tight', '- a\n- b\n\n', '<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n'],
      ['blank before a nested list is loose', '- a\n\n  - b\n', '<ul>\n<li>\n<p>a</p>\n<ul>\n<li>b</li>\n</ul>\n</li>\n</ul>\n'],
      ['blank after a nested list is loose', '- a\n  - b\n\n- c\n', '<ul>\n<li>\n<p>a</p>\n<ul>\n<li>b</li>\n</ul>\n</li>\n<li>\n<p>c</p>\n</li>\n</ul>\n'],
    ]);

    it('exposes the flag on the node', () => {
      const [tight] = parse('- a\n- b\n').children;
      const [loose] = parse('- a\n\n- b\n').children;
      assert.equal(tight.tight, true);
      assert.equal(loose.tight, false);
    });
  });

  describe('task items', () => {
    cases([
      ['checked and unchecked', '- [x] a\n- [ ] b\n', '<ul>\n<li><input type="checkbox" disabled checked /> a</li>\n<li><input type="checkbox" disabled /> b</li>\n</ul>\n'],
      ['capital X counts', '- [X] a\n', '<ul>\n<li><input type="checkbox" disabled checked /> a</li>\n</ul>\n'],
      ['ordered items too', '1. [x] a\n', '<ol>\n<li><input type="checkbox" disabled checked /> a</li>\n</ol>\n'],
      ['needs following text', '- [x]\n', '<ul>\n<li>[x]</li>\n</ul>\n'],
      ['needs a space after', '- [x]a\n', '<ul>\n<li>[x]a</li>\n</ul>\n'],
      ['other letters are text', '- [y] a\n', '<ul>\n<li>[y] a</li>\n</ul>\n'],
      ['loose item keeps it in the paragraph', '- [x] a\n\n- b\n', '<ul>\n<li>\n<p><input type="checkbox" disabled checked /> a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ul>\n'],
      ['outside a list is text', '[x] a\n', '<p>[x] a</p>\n'],
    ]);

    it('sets checked on the item', () => {
      const [list] = parse('- [x] a\n- [ ] b\n- c\n').children;
      assert.deepEqual(list.children.map((item) => item.checked), [true, false, undefined]);
    });
  });
});

describe('tables', () => {
  const row = (tag, ...cells) => `<tr>\n${cells.map((c) => `<${tag}>${c}</${tag}>\n`).join('')}</tr>\n`;
  const table = (head, ...body) =>
    `<table>\n<thead>\n${head}</thead>\n${body.length ? `<tbody>\n${body.join('')}</tbody>\n` : ''}</table>\n`;

  cases([
    ['basic', '| a | b |\n|---|---|\n| 1 | 2 |\n', table(row('th', 'a', 'b'), row('td', '1', '2'))],
    ['outer pipes optional', 'a | b\n--|--\n1 | 2\n', table(row('th', 'a', 'b'), row('td', '1', '2'))],
    ['header only', 'a | b\n--|--\n', table(row('th', 'a', 'b'))],
    ['single column', '| a |\n| - |\n| 1 |\n', table(row('th', 'a'), row('td', '1'))],
    ['short row padded', 'a | b\n--|--\n1\n', table(row('th', 'a', 'b'), row('td', '1', ''))],
    ['long row truncated', 'a | b\n--|--\n1|2|3\n', table(row('th', 'a', 'b'), row('td', '1', '2'))],
    ['escaped pipe', 'a | b\n--|--\nx\\|y | z\n', table(row('th', 'a', 'b'), row('td', 'x|y', 'z'))],
    ['escaped pipe in code', 'a | b\n--|--\n`x\\|y` | z\n', table(row('th', 'a', 'b'), row('td', '<code>x|y</code>', 'z'))],
    ['inline markup in cells', 'a | b\n--|--\n*x* | [y](/u)\n', table(row('th', 'a', 'b'), row('td', '<em>x</em>', '<a href="/u">y</a>'))],
    ['column mismatch is not a table', 'a | b\n--|--|--\n', '<p>a | b\n--|--|--</p>\n'],
    ['bad delimiter is not a table', 'a | b\n--|x\n', '<p>a | b\n--|x</p>\n'],
    ['delimiter needs a pipe', 'a\n:--\n', '<p>a\n:--</p>\n'],
    ['blank line ends it', 'a|b\n-|-\n1|2\n\nc\n', `${table(row('th', 'a', 'b'), row('td', '1', '2'))}<p>c</p>\n`],
    ['block start ends it', 'a|b\n-|-\n1|2\n# h\n', `${table(row('th', 'a', 'b'), row('td', '1', '2'))}<h1>h</h1>\n`],
    ['earlier paragraph lines stay a paragraph', 'p\na|b\n-|-\n', `<p>p</p>\n${table(row('th', 'a', 'b'))}`],
    ['inside a quote', '> a|b\n> -|-\n> 1|2\n', `<blockquote>\n${table(row('th', 'a', 'b'), row('td', '1', '2'))}</blockquote>\n`],
    ['quote end ends it', '> a|b\n> -|-\n1|2\n', `<blockquote>\n${table(row('th', 'a', 'b'))}</blockquote>\n<p>1|2</p>\n`],
    ['inside a list item', '- a|b\n  -|-\n  1|2\n', `<ul>\n<li>\n${table(row('th', 'a', 'b'), row('td', '1', '2'))}</li>\n</ul>\n`],
  ]);

  it('applies alignment to every cell', () => {
    const html = markdownToHtml('a|b|c|d\n:-|-:|:-:|-\n1|2|3|4\n', options);
    for (const align of ['left', 'right', 'center']) {
      assert.ok(html.includes(`<th style="text-align:${align}">`), align);
      assert.ok(html.includes(`<td style="text-align:${align}">`), align);
    }
    assert.ok(html.includes('<th>d</th>'));
    assert.ok(html.includes('<td>4</td>'));
  });

  it('builds rows and cells in the AST', () => {
    const [node] = parse('a|b\n:-|-\n1|2\n').children;
    assert.equal(node.type, 'table');
    assert.deepEqual(node.align, ['left', null]);
    assert.deepEqual(node.children.map((r) => r.header), [true, false]);
    assert.equal(node.children[1].children[0].children[0].value, '1');
  });
});

describe('HTML blocks', () => {
  const passing = { ...options, allowHtml: true };

  it('are escaped by default', () => {
    assert.equal(markdownToHtml('<div>\n*a*\n</div>\n', options), '<p>&lt;div&gt;\n*a*\n&lt;/div&gt;</p>\n');
  });

  for (const [name, source, expected] of [
    ['block tag up to a blank line', '<div>\n*a*\n\n*b*\n', '<div>\n*a*\n<p><em>b</em></p>\n'],
    ['closing tag starts one', '</div>\n*a*\n', '</div>\n*a*\n'],
    ['script runs past blank lines', '<script>\n\nvar a;\n</script>\nb\n', '<script>\n\nvar a;\n</script>\n<p>b</p>\n'],
    ['pre runs past blank lines', '<pre>\n\n*x*</pre>*y*\n*z*\n', '<pre>\n\n*x*</pre>*y*\n<p><em>z</em></p>\n'],
    ['comment', '<!-- a\n\nb -->\nc\n', '<!-- a\n\nb -->\n<p>c</p>\n'],
    ['processing instruction', '<?php\n\necho 1;\n?>\n', '<?php\n\necho 1;\n?>\n'],
    ['declaration', '<!DOCTYPE html>\n', '<!DOCTYPE html>\n'],
    ['CDATA', '<![CDATA[\n\nx\n]]>\n', '<![CDATA[\n\nx\n]]>\n'],
    ['any complete tag alone on a line', '<custom-tag a="1">\n*x*\n\n*y*\n', '<custom-tag a="1">\n*x*\n<p><em>y</em></p>\n'],
    ['block tag interrupts a paragraph', 'a\n<div>\n', '<p>a</p>\n<div>\n'],
    ['other tags don\'t interrupt', 'a\n<span>\nb\n', '<p>a\n<span>\nb</p>\n'],
    ['tag with text after is inline', '<span>x</span>\n', '<p><span>x</span></p>\n'],
    ['indented four is code', '    <div>\n', '<pre><code>&lt;div&gt;\n</code></pre>\n'],
    ['leading spaces are kept', '  <div>\n  x\n', '  <div>\n  x\n'],
    ['ends with its quote', '> <div>\n> x\ny\n', '<blockquote>\n<div>\nx\n</blockquote>\n<p>y</p>\n'],
  ]) {
    it(name, () => assert.equal(markdownToHtml(source, passing), expected));
  }
});

describe('link reference definitions', () => {
  cases([
    ['basic', '[foo]: /url "title"\n\n[foo]\n', '<p><a href="/url" title="title">foo</a></p>\n'],
    ['split over lines', "   [foo]: \n      /url  \n           'the title'  \n\n[foo]\n", '<p><a href="/url" title="the title">foo</a></p>\n'],
    ['angle destination', '[foo]: <my url>\n\n[foo]\n', '<p><a href="my%20url">foo</a></p>\n'],
    ['empty angle destination', '[foo]: <>\n\n[foo]\n', '<p><a href="">foo</a></p>\n'],
    ['missing destination', '[foo]:\n\n[foo]\n', '<p>[foo]:</p>\n<p>[foo]</p>\n'],
    ['case insensitive', '[FOO]: /url\n\n[Foo]\n', '<p><a href="/url">Foo</a></p>\n'],
    ['first definition wins', '[foo]: /a\n[foo]: /b\n\n[foo]\n', '<p><a href="/a">foo</a></p>\n'],
    ['title must end the line', '[foo]: /url "title" ok\n', '<p>[foo]: /url &quot;title&quot; ok</p>\n'],
    ['bad title on the next line isn\'t part of it', '[foo]: /url\n"title" ok\n\n[foo]\n', '<p>&quot;title&quot; ok</p>\n<p><a href="/url">foo</a></p>\n'],
    ['can\'t interrupt a paragraph', 'a\n[foo]: /url\n\n[foo]\n', '<p>a\n[foo]: /url</p>\n<p>[foo]</p>\n'],
    ['followed by text in one paragraph', '[foo]: /url\nbar\n\n[foo]\n', '<p>bar</p>\n<p><a href="/url">foo</a></p>\n'],
    ['several in a row', '[a]: /1\n[b]: /2\n\n[a] [b]\n', '<p><a href="/1">a</a> <a href="/2">b</a></p>\n'],
    ['before a setext underline', '[foo]: /url\nbar\n===\n', '<h1>bar</h1>\n'],
    ['alone before an underline', '[foo]: /url\n===\n[foo]\n', '<p>===\n<a href="/url">foo</a></p>\n'],
    ['used from inside a quote', '[foo]\n\n> [foo]: /url\n', '<p><a href="/url">foo</a></p>\n<blockquote>\n</blockquote>\n'],
    ['unicode case folding', '[ẞ]: /url\n\n[SS]\n', '<p><a href="/url">SS</a></p>\n'],
  ]);

  it('are exposed on the document', () => {
    const doc = parse('[Foo Bar]: /url "t"\n');
    assert.deepEqual({ ...doc.references['FOO BAR'] }, { url: '/url', title: 't' });
    assert.equal(doc.children.length, 0);
  });

  it('labels named like Object.prototype members are safe', () => {
    assert.equal(markdownToHtml('[constructor]\n[__proto__]\n', options), '<p>[constructor]\n[<strong>proto</strong>]</p>\n');
    assert.equal(markdownToHtml('[__proto__]: /u\n\n[__proto__]\n', options), '<p><a href="/u"><strong>proto</strong></a></p>\n');
    assert.equal(markdownToHtml('[a]\n\n[a]: /u\n', options), '<p><a href="/u">a</a></p>\n');
    assert.equal({}.url, undefined);
  });
});

describe('source positions', () => {
  it('records block line ranges', () => {
    const doc = parse('# h\n\npara\nmore\n\n- a\n- b\n\n```\nx\n```\n');
    const ranges = doc.children.map((node) => [node.type, node.position.start, node.position.end]);
    assert.deepEqual(ranges, [
      ['heading', 1, 1],
      ['paragraph', 3, 4],
      ['list', 6, 7],
      ['code_block', 9, 11],
    ]);
  });

  it('counts lines from the original file after front matter', () => {
    const doc = parse('---\na: 1\n---\n\n# h\n');
    assert.equal(doc.children[0].position.start, 5);
  });

  it('skips definition lines at the start of a paragraph', () => {
    const doc = parse('[a]: /u\ntext\n');
    assert.equal(doc.children[0].position.start, 2);
  });

  it('places a setext heading over its full span', () => {
    const [heading] = parse('a\nb\n--\n').children;
    assert.deepEqual([heading.position.start, heading.position.end], [1, 3]);
  });

  it('places a table after preceding paragraph lines', () => {
    const [paragraph, table] = parse('p\na|b\n-|-\n1|2\n').children;
    assert.deepEqual([paragraph.position.start, paragraph.position.end], [1, 1]);
    assert.deepEqual([table.position.start, table.position.end], [2, 4]);
  });
});
