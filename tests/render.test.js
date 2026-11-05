import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  defaultHandlers,
  encodeUrl,
  escapeHtml,
  HtmlRenderer,
  isSafeUrl,
  markdownToHtml,
  parse,
  renderHtml,
  renderPage,
  sanitizeUrl,
  urlScheme,
} from '../src/index.js';

describe('escaping', () => {
  it('covers the four significant characters', () => {
    assert.equal(escapeHtml(`<a href="x">&'`), `&lt;a href=&quot;x&quot;&gt;&amp;'`);
  });

  it('applies to text, code and attributes', () => {
    assert.equal(markdownToHtml('a & b < c'), '<p>a &amp; b &lt; c</p>\n');
    assert.equal(markdownToHtml('```a"b\n<\n```'), '<pre><code class="language-a&quot;b">&lt;\n</code></pre>\n');
    assert.equal(markdownToHtml('[x](/u "<&\\"")'), '<p><a href="/u" title="&lt;&amp;&quot;">x</a></p>\n');
  });

  it('heading ids cannot break out of the attribute', () => {
    const html = markdownToHtml('# "><script>\n', { headingIdPrefix: '"' });
    assert.equal(html, '<h1 id="&quot;section">&quot;&gt;&lt;script&gt;</h1>\n');
  });
});

describe('URL sanitising', () => {
  const rejected = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    `${String.fromCharCode(1)}javascript:alert(1)`,
    `java${String.fromCharCode(0x200b)}script:alert(1)`,
    'vbscript:msgbox(1)',
    'data:text/html;base64,AAAA',
    'file:///etc/passwd',
  ];
  for (const url of rejected) {
    it(`rejects ${JSON.stringify(url)}`, () => assert.equal(isSafeUrl(url), false));
  }

  const accepted = [
    'http://example.com',
    'HTTPS://example.com',
    'mailto:nobody@example.com',
    'tel:+15550100',
    '/relative/path',
    './a:b',
    'a/b:c',
    '#fragment',
    '?q=a:b',
    '//example.com/x',
    '',
  ];
  for (const url of accepted) {
    it(`accepts ${JSON.stringify(url)}`, () => assert.equal(isSafeUrl(url), true));
  }

  it('finds schemes', () => {
    assert.equal(urlScheme('HTTP://x'), 'http');
    assert.equal(urlScheme('/x:y'), null);
  });

  it('allows raster data URLs for images only', () => {
    const png = 'data:image/png;base64,AAAA';
    assert.equal(isSafeUrl(png, { kind: 'image' }), true);
    assert.equal(isSafeUrl(png), false);
    assert.equal(isSafeUrl('data:image/svg+xml;base64,AAAA', { kind: 'image' }), false);
    assert.equal(isSafeUrl('data:text/html,x', { kind: 'image' }), false);
  });

  it('the allow-list can be replaced', () => {
    const options = { schemes: ['gopher'] };
    assert.equal(isSafeUrl('gopher://x', options), true);
    assert.equal(isSafeUrl('http://x', options), false);
    assert.equal(sanitizeUrl('http://x', options), null);
    assert.equal(markdownToHtml('[a](gopher://x)', { allowedSchemes: ['gopher'] }), '<p><a href="gopher://x">a</a></p>\n');
  });

  it('removes the href from a rejected link but keeps its text', () => {
    assert.equal(markdownToHtml('[a](javascript:alert(1))'), '<p><a>a</a></p>\n');
  });

  it('sees through entities and escapes', () => {
    assert.equal(markdownToHtml('[a](java&#115;cript:alert)'), '<p><a>a</a></p>\n');
    assert.equal(markdownToHtml('[a](&#x6a;avascript:alert)'), '<p><a>a</a></p>\n');
    assert.equal(markdownToHtml('[a](javascript\\:alert)'), '<p><a>a</a></p>\n');
  });

  it('applies to autolinks, references and images', () => {
    assert.equal(markdownToHtml('<javascript:alert(1)>'), '<p><a>javascript:alert(1)</a></p>\n');
    assert.equal(markdownToHtml('[a]\n\n[a]: javascript:x\n'), '<p><a>a</a></p>\n');
    assert.equal(markdownToHtml('![a](javascript:x)'), '<p><img alt="a" /></p>\n');
    assert.equal(markdownToHtml('![a](data:image/gif;base64,AA)'), '<p><img src="data:image/gif;base64,AA" alt="a" /></p>\n');
  });

  it('stays in force with allowHtml', () => {
    assert.equal(markdownToHtml('[a](javascript:x)', { allowHtml: true }), '<p><a>a</a></p>\n');
  });

  it('encodes without double-encoding', () => {
    assert.equal(encodeUrl('/a b%20c%zz[]'), '/a%20b%20c%25zz%5B%5D');
    assert.equal(encodeUrl('/😀'), '/%F0%9F%98%80');
    assert.equal(encodeUrl(`/${String.fromCharCode(0xd800)}`), '/%EF%BF%BD');
    assert.equal(encodeUrl('a%'), 'a%25');
  });
});

describe('custom handlers', () => {
  it('replace the output of a node type', () => {
    const html = renderHtml(parse('# a\n\nb\n'), {
      handlers: { heading: (node, ctx) => `<div class="h${node.level}">${ctx.children(node)}</div>\n` },
    });
    assert.equal(html, '<div class="h1">a</div>\n<p>b</p>\n');
  });

  it('can wrap the built-in behaviour', () => {
    const html = markdownToHtml('[a](/u)', {
      handlers: {
        link: (node, ctx) => ctx.fallback(node).replace('<a ', '<a rel="nofollow" '),
      },
    });
    assert.equal(html, '<p><a rel="nofollow" href="/u">a</a></p>\n');
  });

  it('apply to nested nodes', () => {
    const html = markdownToHtml('> *a*', {
      handlers: { emphasis: (node, ctx) => `<i>${ctx.children(node)}</i>` },
    });
    assert.equal(html, '<blockquote>\n<p><i>a</i></p>\n</blockquote>\n');
  });

  it('can see their ancestors', () => {
    const seen = [];
    markdownToHtml('- *a*', {
      handlers: {
        emphasis(node, ctx) {
          seen.push(ctx.ancestor(1).type, ctx.ancestor(2).type, ctx.ancestor(3).type);
          return ctx.fallback(node);
        },
      },
    });
    assert.deepEqual(seen, ['paragraph', 'list_item', 'list']);
  });

  it('can render node types the parser never makes', () => {
    const tree = { type: 'document', children: [{ type: 'callout', text: 'x' }] };
    const renderer = new HtmlRenderer({ handlers: { callout: (node) => `<aside>${node.text}</aside>` } });
    assert.equal(renderer.render(tree), '<aside>x</aside>');
  });

  it('a list item override still gets the tight paragraph bare', () => {
    const html = markdownToHtml('- a', {
      handlers: { list_item: (node, ctx) => `<li class="x">${ctx.children(node)}</li>\n` },
    });
    assert.equal(html, '<ul>\n<li class="x">a</li>\n</ul>\n');
  });

  it('unknown node types raise an error', () => {
    assert.throws(() => renderHtml({ type: 'mystery' }), /no HTML handler for node type "mystery"/);
    assert.throws(() => new HtmlRenderer().fallback({ type: 'mystery' }), /no built-in HTML handler/);
  });

  it('a renderer can be reused, even after a handler throws', () => {
    let fail = true;
    const renderer = new HtmlRenderer({
      handlers: {
        emphasis(node, ctx) {
          if (fail) throw new Error('boom');
          return ctx.fallback(node);
        },
      },
    });
    const tree = parse('- *a*');
    assert.throws(() => renderer.render(tree), /boom/);
    fail = false;
    assert.equal(renderer.render(tree), '<ul>\n<li><em>a</em></li>\n</ul>\n');
  });

  it('the built-in table is not changed by overrides', () => {
    const original = defaultHandlers.text;
    renderHtml(parse('a'), { handlers: { text: () => 'x' } });
    assert.equal(defaultHandlers.text, original);
  });

  it('rendering does not change the tree', () => {
    const tree = parse('# a\n\n- [x] b\n\n[^n]\n\n[^n]: c\n');
    const before = JSON.stringify(tree);
    renderHtml(tree);
    renderHtml(tree);
    assert.equal(JSON.stringify(tree), before);
  });

  it('the attribute helper skips absent values', () => {
    const renderer = new HtmlRenderer();
    assert.equal(renderer.attrs({ a: 1, b: null, c: undefined, d: false, e: true, f: '"' }), ' a="1" e f="&quot;"');
  });
});

describe('renderPage', () => {
  it('wraps content in a document', () => {
    const page = renderPage('<p>x</p>\n', { title: 'T' });
    assert.ok(page.startsWith('<!doctype html>\n<html lang="en">'));
    assert.ok(page.includes('<title>T</title>'));
    assert.ok(page.includes('<body>\n<p>x</p>\n</body>'));
  });

  it('escapes metadata', () => {
    const page = renderPage('', { title: '</title><x>', description: '"><y>', lang: '"z' });
    assert.ok(page.includes('<title>&lt;/title&gt;&lt;x&gt;</title>'));
    assert.ok(page.includes('content="&quot;&gt;&lt;y&gt;"'));
    assert.ok(page.includes('<html lang="&quot;z">'));
  });

  it('has defaults and ignores a non-string description', () => {
    const page = renderPage('', { description: 42 });
    assert.ok(page.includes('<title>Document</title>'));
    assert.ok(!page.includes('name="description"'));
  });
});
