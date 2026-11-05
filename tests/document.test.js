// Document-level features: footnotes, heading ids, table of contents, front
// matter and the AST walker.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assignHeadingIds,
  convert,
  extractToc,
  find,
  findAll,
  markdownToHtml,
  parse,
  parseFrontMatter,
  REMOVE,
  renderHtml,
  renderToc,
  SKIP,
  Slugger,
  STOP,
  textContent,
  walk,
} from '../src/index.js';

describe('footnotes', () => {
  it('renders the reference and the note section', () => {
    assert.equal(
      markdownToHtml('a[^n]\n\n[^n]: note\n'),
      '<p>a<sup class="footnote-ref"><a href="#fn-1" id="fnref-1">1</a></sup></p>\n' +
        '<section class="footnotes">\n<ol>\n<li id="fn-1">\n' +
        '<p>note <a href="#fnref-1" class="footnote-backref" aria-label="Back to reference">↩︎</a></p>\n' +
        '</li>\n</ol>\n</section>\n',
    );
  });

  it('numbers by first reference, not definition order', () => {
    const doc = parse('[^b] [^a]\n\n[^a]: A\n[^b]: B\n');
    const section = find(doc, 'footnotes');
    assert.deepEqual(section.children.map((d) => [d.label, d.number]), [['b', 1], ['a', 2]]);
  });

  it('gives repeated references their own ids and backlinks', () => {
    const html = markdownToHtml('[^n] [^n]\n\n[^n]: x\n');
    assert.ok(html.includes('id="fnref-1"'));
    assert.ok(html.includes('id="fnref-1-2"'));
    assert.ok(html.includes('href="#fnref-1"'));
    assert.ok(html.includes('href="#fnref-1-2"'));
  });

  it('drops unreferenced definitions', () => {
    const html = markdownToHtml('a\n\n[^n]: unused\n');
    assert.equal(html, '<p>a</p>\n');
  });

  it('leaves undefined references as text', () => {
    assert.equal(markdownToHtml('a[^nope]'), '<p>a[^nope]</p>\n');
  });

  it('matches labels without regard to case', () => {
    assert.ok(markdownToHtml('[^NOTE]\n\n[^note]: x\n').includes('class="footnote-ref"'));
  });

  it('keeps the first of duplicate definitions', () => {
    const html = markdownToHtml('[^n]\n\n[^n]: first\n\n[^n]: second\n');
    assert.ok(html.includes('first'));
    assert.ok(!html.includes('second'));
  });

  it('holds several blocks through indentation', () => {
    const html = markdownToHtml('[^n]\n\n[^n]: one\n\n    two\n\n        code\n\nafter\n');
    assert.ok(html.includes('<p>one</p>\n<p>two'));
    assert.ok(html.includes('<pre><code>code\n</code></pre>'));
    // The unindented paragraph is back in the document, before the notes.
    assert.ok(html.indexOf('<p>after</p>') < html.indexOf('<section'));
  });

  it('takes lazy continuation lines', () => {
    const [definition] = find(parse('[^n]\n\n[^n]: one\ntwo\n'), 'footnotes').children;
    assert.equal(textContent(definition), 'one two');
  });

  it('adds a backlink paragraph when the note doesn\'t end in one', () => {
    const html = markdownToHtml('[^n]\n\n[^n]: ```\n    x\n    ```\n');
    assert.ok(/<\/pre>\n<p><a [^>]*footnote-backref/.test(html), html);
  });

  it('skips any number of spaces after the marker', () => {
    const [definition] = find(parse('[^n]\n\n[^n]:     text\n'), 'footnotes').children;
    assert.equal(definition.children[0].type, 'paragraph');
  });

  it('handles references inside footnotes, including chains', () => {
    const doc = parse('[^a]\n\n[^a]: see [^b]\n[^b]: end\n[^c]: unused [^a]\n');
    const section = find(doc, 'footnotes');
    assert.deepEqual(section.children.map((d) => d.label), ['a', 'b']);
  });

  it('survives a footnote citing itself', () => {
    const doc = parse('[^a]\n\n[^a]: again [^a]\n');
    const [definition] = find(doc, 'footnotes').children;
    assert.equal(definition.refCount, 2);
    assert.ok(markdownToHtml('[^a]\n\n[^a]: again [^a]\n').includes('fnref-1-2'));
  });

  it('can be defined inside a container', () => {
    const html = markdownToHtml('[^n]\n\n> [^n]: quoted note\n');
    assert.ok(html.includes('quoted note'));
    assert.ok(html.includes('<blockquote>\n</blockquote>'));
  });

  it('a definition interrupts a paragraph', () => {
    const doc = parse('text [^a]\n[^a]: note\n');
    assert.equal(doc.children[0].children.length, 2);
    assert.equal(find(doc, 'footnotes').children[0].label, 'a');
  });

  it('the marker is not treated as a link when a reference has the same label', () => {
    const html = markdownToHtml('[^a]\n\n[^a]: note\n');
    assert.ok(!html.includes('[^a]'));
  });
});

describe('heading ids', () => {
  it('slugify heading text', () => {
    assert.equal(markdownToHtml('# Hello, *World*!'), '<h1 id="hello-world">Hello, <em>World</em>!</h1>\n');
  });

  it('dedupe repeats', () => {
    const headings = findAll(parse('# a\n# a\n# a\n'), 'heading');
    assert.deepEqual(headings.map((h) => h.id), ['a', 'a-1', 'a-2']);
  });

  it('avoid colliding with a literal suffix', () => {
    const headings = findAll(parse('# a-1\n# a\n# a\n'), 'heading');
    assert.deepEqual(headings.map((h) => h.id), ['a-1', 'a', 'a-2']);
  });

  it('keep non-Latin letters', () => {
    assert.equal(Slugger.slugify('Überblick 日本語'), 'überblick-日本語');
  });

  it('fall back when nothing is left', () => {
    const headings = findAll(parse('# !!!\n#\n'), 'heading');
    assert.deepEqual(headings.map((h) => h.id), ['section', 'section-1']);
  });

  it('keep underscores and hyphens', () => {
    assert.equal(Slugger.slugify('a_b-c d'), 'a_b-c-d');
  });

  it('use text from code spans and links', () => {
    assert.equal(find(parse('# `a` [b](/u)'), 'heading').id, 'a-b');
  });

  it('accept a prefix', () => {
    assert.equal(find(parse('# a', { headingIdPrefix: 'doc-' }), 'heading').id, 'doc-a');
  });

  it('can be turned off, and assigned later', () => {
    const doc = parse('# a', { headingIds: false });
    assert.equal(find(doc, 'heading').id, undefined);
    assignHeadingIds(doc);
    assert.equal(find(doc, 'heading').id, 'a');
  });

  it('each Slugger keeps its own record', () => {
    const one = new Slugger();
    assert.equal(one.slug('x'), 'x');
    assert.equal(one.slug('x'), 'x-1');
    assert.equal(new Slugger().slug('x'), 'x');
  });
});

describe('table of contents', () => {
  it('nests by level', () => {
    const toc = extractToc(parse('# a\n## b\n### c\n## d\n# e\n'));
    const shape = (items) => items.map((i) => [i.text, shape(i.children)]);
    assert.deepEqual(shape(toc), [
      ['a', [['b', [['c', []]]], ['d', []]]],
      ['e', []],
    ]);
  });

  it('attaches skipped levels to the nearest shallower heading', () => {
    const toc = extractToc(parse('# a\n### b\n## c\n'));
    assert.deepEqual(toc[0].children.map((i) => i.text), ['b', 'c']);
  });

  it('handles a deep heading first', () => {
    const toc = extractToc(parse('### a\n# b\n'));
    assert.deepEqual(toc.map((i) => i.text), ['a', 'b']);
  });

  it('filters by level', () => {
    const toc = extractToc(parse('# a\n## b\n### c\n'), { minLevel: 2, maxLevel: 2 });
    assert.deepEqual(toc.map((i) => i.text), ['b']);
  });

  it('includes nested headings but not those in footnotes', () => {
    const toc = extractToc(parse('> # quoted\n\n[^n]\n\n[^n]: # noted\n'));
    assert.deepEqual(toc.map((i) => i.text), ['quoted']);
  });

  it('renders links, escaping text', () => {
    assert.equal(
      renderToc(extractToc(parse('# a <b\n## c\n'))),
      '<nav class="toc">\n<ul>\n<li><a href="#a-b">a &lt;b</a>\n<ul>\n<li><a href="#c">c</a></li>\n</ul>\n</li>\n</ul>\n</nav>\n',
    );
  });

  it('renders text when there are no ids', () => {
    const html = renderToc(extractToc(parse('# a', { headingIds: false })));
    assert.ok(html.includes('<li>a</li>'));
  });

  it('renders nothing for no headings', () => {
    assert.equal(renderToc(extractToc(parse('a'))), '');
    assert.equal(markdownToHtml('a', { toc: true }), '<p>a</p>\n');
  });

  it('is returned by convert and placed by the toc option', () => {
    const { toc, html } = convert('# a\n', { toc: true });
    assert.equal(toc[0].id, 'a');
    assert.ok(html.startsWith('<nav class="toc">'));
    assert.ok(!convert('# a\n').html.includes('<nav'));
  });
});

describe('front matter', () => {
  const data = (source) => parseFrontMatter(source).data;

  it('reads simple pairs', () => {
    const result = parseFrontMatter('---\ntitle: Hello\nsub.key-a: x y\n---\nbody\n');
    assert.deepEqual({ ...result.data }, { title: 'Hello', 'sub.key-a': 'x y' });
    assert.equal(result.body, 'body\n');
    assert.equal(result.bodyLine, 5);
  });

  it('converts values', () => {
    const parsed = data(
      '---\na: 1\nb: -2.5\nc: 1e3\nd: true\ne: false\nf: null\ng: ~\nh:\ni: "x: \\"y\\"\\n"\nj: \'it\'\'s\'\nk: 1.2.3\n---\n',
    );
    assert.deepEqual({ ...parsed }, {
      a: 1, b: -2.5, c: 1000, d: true, e: false, f: null, g: null, h: null,
      i: 'x: "y"\n', j: "it's", k: '1.2.3',
    });
  });

  it('reads inline lists', () => {
    const parsed = data('---\na: [x, 2, true, "p, q", \'r\']\nb: []\nc: [one # kept]\nd: [e, f] # note\n---\n');
    assert.deepEqual(parsed.a, ['x', 2, true, 'p, q', 'r']);
    assert.deepEqual(parsed.b, []);
    assert.deepEqual(parsed.c, ['one # kept']);
    assert.deepEqual(parsed.d, ['e', 'f']);
  });

  it('keeps a list item with an unterminated quote as text', () => {
    assert.deepEqual(data('---\na: ["x, y]\n---\n').a, ['"x', 'y']);
  });

  it('ignores comments and blank lines', () => {
    const parsed = data('---\n# note\n\na: 1 # trailing\nb: x#y\n---\n');
    assert.deepEqual({ ...parsed }, { a: 1, b: 'x#y' });
  });

  it('the last duplicate wins', () => {
    assert.equal(data('---\na: 1\na: 2\n---\n').a, 2);
  });

  it('allows ... as the closing fence and CRLF', () => {
    assert.equal(data('---\r\na: 1\r\n...\r\n').a, 1);
  });

  it('keeps an unterminated quote as text', () => {
    assert.equal(data('---\na: "x\n---\n').a, '"x');
  });

  for (const [name, source] of [
    ['no closing fence', '---\na: 1\n'],
    ['a line that is not a pair', '---\njust text\n---\n'],
    ['no space after the colon', '---\na:1\n---\n'],
    ['empty block', '---\n---\n'],
    ['comments only', '---\n# x\n---\n'],
    ['not on the first line', '\n---\na: 1\n---\n'],
    ['indented fence', ' ---\na: 1\n---\n'],
  ]) {
    it(`is not recognised with ${name}`, () => assert.equal(data(source), null));
  }

  it('leaves unrecognised blocks to the Markdown parser', () => {
    assert.equal(markdownToHtml('---\ntext\n---\n', { headingIds: false }), '<hr />\n<h2>text</h2>\n');
  });

  it('is available on the AST and from convert', () => {
    const source = '---\ntitle: T\n---\n# h\n';
    assert.equal(parse(source).frontMatter.title, 'T');
    assert.equal(convert(source).frontMatter.title, 'T');
    assert.equal(convert(source).html, '<h1 id="h">h</h1>\n');
  });

  it('can be switched off', () => {
    const source = '---\ntitle: T\n---\n';
    const doc = parse(source, { frontMatter: false });
    assert.equal(doc.frontMatter, null);
    assert.equal(doc.children[0].type, 'thematic_break');
  });

  it('is null when absent', () => {
    assert.equal(parse('a').frontMatter, null);
  });

  it('a __proto__ key stays an ordinary value', () => {
    const parsed = data('---\n__proto__: x\n---\n');
    assert.equal(parsed.__proto__, 'x');
    assert.equal({}.x, undefined);
  });
});

describe('walk', () => {
  const types = (root) => findAll(root, () => true).map((node) => node.type);

  it('visits in document order, entering before leaving', () => {
    const log = [];
    walk(parse('# *a*\n\nb\n', { headingIds: false }), {
      enter: (node) => log.push(`+${node.type}`),
      leave: (node) => log.push(`-${node.type}`),
    });
    assert.deepEqual(log, [
      '+document', '+heading', '+emphasis', '+text', '-text', '-emphasis', '-heading',
      '+paragraph', '+text', '-text', '-paragraph', '-document',
    ]);
  });

  it('accepts a plain function', () => {
    assert.deepEqual(types(parse('a')), ['document', 'paragraph', 'text']);
  });

  it('reports parent, index and ancestors', () => {
    const seen = [];
    walk(parse('a\n\n*b*\n'), (node, { parent, index, ancestors }) => {
      if (node.type === 'emphasis') seen.push(parent.type, index, ancestors.map((a) => a.type));
    });
    assert.deepEqual(seen, ['paragraph', 0, ['document', 'paragraph']]);
  });

  it('SKIP leaves children unvisited but still calls leave', () => {
    const entered = [];
    const left = [];
    walk(parse('> a\n\nb\n'), {
      enter(node) {
        entered.push(node.type);
        return node.type === 'blockquote' ? SKIP : undefined;
      },
      leave: (node) => left.push(node.type),
    });
    assert.deepEqual(entered, ['document', 'blockquote', 'paragraph', 'text']);
    assert.ok(left.includes('blockquote'));
  });

  it('STOP ends everything', () => {
    const seen = [];
    walk(parse('a\n\nb\n'), (node) => {
      seen.push(node.type);
      return node.type === 'text' ? STOP : undefined;
    });
    assert.deepEqual(seen, ['document', 'paragraph', 'text']);
  });

  it('STOP from leave ends everything', () => {
    let visits = 0;
    walk(parse('a\n\nb\n'), {
      enter: () => {
        visits++;
      },
      leave: () => STOP,
    });
    assert.equal(visits, 3);
  });

  it('REMOVE detaches a node without skipping its sibling', () => {
    const doc = parse('a\n\n# x\n\n# y\n\nb\n');
    walk(doc, (node) => (node.type === 'heading' ? REMOVE : undefined));
    assert.deepEqual(doc.children.map((n) => n.type), ['paragraph', 'paragraph']);
  });

  it('REMOVE from leave works too', () => {
    const doc = parse('a\n\nb\n');
    walk(doc, { leave: (node) => (node.type === 'paragraph' ? REMOVE : undefined) });
    assert.equal(doc.children.length, 0);
  });

  it('removing the root is an error', () => {
    assert.throws(() => walk(parse('a'), () => REMOVE), /root/);
  });

  it('a returned node replaces the visited one and is then walked', () => {
    const doc = parse('*a*');
    const seen = [];
    walk(doc, (node) => {
      seen.push(node.type);
      return node.type === 'emphasis' ? { type: 'strong', children: node.children } : undefined;
    });
    assert.equal(doc.children[0].children[0].type, 'strong');
    assert.ok(seen.includes('text'));
    assert.equal(renderHtml(doc), '<p><strong>a</strong></p>\n');
  });

  it('a replacement from leave is not walked again', () => {
    const doc = parse('a');
    let enters = 0;
    walk(doc, {
      enter: () => {
        enters++;
      },
      leave: (node) => (node.type === 'text' ? { type: 'text', value: 'b' } : undefined),
    });
    assert.equal(enters, 3);
    assert.equal(textContent(doc), 'b');
  });

  it('can replace the root and returns it', () => {
    const replacement = { type: 'document', children: [] };
    assert.equal(walk(parse('a'), () => replacement), replacement);
  });

  it('find returns the first match or null', () => {
    const doc = parse('# a\n\n# b\n');
    assert.equal(textContent(find(doc, 'heading')), 'a');
    assert.equal(find(doc, 'table'), null);
    assert.equal(textContent(find(doc, (n) => n.type === 'heading' && n.id === 'b')), 'b');
  });

  it('textContent flattens markup', () => {
    const doc = parse('*a* `b` [c](/u)\nd  \ne ![f](/g)\n');
    assert.equal(textContent(doc), 'a b c d e f');
  });

  it('modified trees render', () => {
    const doc = parse('see [a](/u)');
    walk(doc, (node) => {
      if (node.type === 'link') node.url = `/base${node.url}`;
    });
    assert.equal(renderHtml(doc), '<p>see <a href="/base/u">a</a></p>\n');
  });
});

describe('AST shape', () => {
  it('holds no parser leftovers', () => {
    const doc = parse('# a\n\nb\n\n| c |\n|---|\n| d |\n\n- e\n\n[^f]\n\n[^f]: g\n\n[h]: /u\n');
    walk(doc, (node) => {
      assert.equal(node.raw, undefined, node.type);
      assert.equal(typeof node.type, 'string');
    });
  });

  it('survives a JSON round trip', () => {
    const doc = parse('---\na: 1\n---\n# b\n\n[c]\n\n[c]: /u\n');
    const copy = JSON.parse(JSON.stringify(doc));
    assert.equal(copy.frontMatter.a, 1);
    assert.equal(copy.references.C.url, '/u');
    assert.equal(copy.children[0].children[0].value, 'b');
  });
});
