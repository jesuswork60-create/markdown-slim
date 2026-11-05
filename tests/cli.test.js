import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { main } from '../src/cli.js';

const BIN = fileURLToPath(new URL('../bin/mdslim.js', import.meta.url));

function sink() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(chunk);
      done();
    },
  });
  stream.text = () => Buffer.concat(chunks).toString('utf8');
  return stream;
}

async function run(args, input = '') {
  const stdout = sink();
  const stderr = sink();
  const code = await main(args, { stdin: Readable.from([input]), stdout, stderr });
  return { code, out: stdout.text(), err: stderr.text() };
}

describe('mdslim', () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'mdslim-'));
    writeFileSync(join(dir, 'doc.md'), '# Title\n\nBody *text*.\n');
    writeFileSync(join(dir, 'plain.md'), 'no heading\n');
    writeFileSync(join(dir, 'meta.md'), '---\ntitle: From Meta\ndescription: About\n---\n# Heading\n');
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('converts a file to standard output', async () => {
    const { code, out, err } = await run([join(dir, 'doc.md')]);
    assert.equal(code, 0);
    assert.equal(err, '');
    assert.equal(out, '<h1 id="title">Title</h1>\n<p>Body <em>text</em>.</p>\n');
  });

  it('reads standard input with no file', async () => {
    assert.equal((await run([], '*a*')).out, '<p><em>a</em></p>\n');
  });

  it('reads standard input for a dash', async () => {
    assert.equal((await run(['-'], '*a*')).out, '<p><em>a</em></p>\n');
  });

  it('decodes multi-byte characters split across chunks', async () => {
    const bytes = Buffer.from('é');
    const stdin = Readable.from([bytes.subarray(0, 1), bytes.subarray(1)]);
    const stdout = sink();
    await main([], { stdin, stdout, stderr: sink() });
    assert.equal(stdout.text(), '<p>é</p>\n');
  });

  it('writes to a file with -o', async () => {
    const target = join(dir, 'out.html');
    const { code, out } = await run([join(dir, 'doc.md'), '-o', target]);
    assert.equal(code, 0);
    assert.equal(out, '');
    assert.ok(readFileSync(target, 'utf8').includes('<h1 id="title">'));
  });

  it('--toc adds a table of contents', async () => {
    const { out } = await run(['--toc'], '# a\n## b\n');
    assert.ok(out.startsWith('<nav class="toc">'));
    assert.ok(out.includes('href="#b"'));
  });

  it('--ast prints parseable JSON', async () => {
    const { code, out } = await run(['--ast'], '---\nk: v\n---\n# a\n');
    assert.equal(code, 0);
    const tree = JSON.parse(out);
    assert.equal(tree.type, 'document');
    assert.equal(tree.frontMatter.k, 'v');
    assert.equal(tree.children[0].type, 'heading');
  });

  it('--allow-html passes raw HTML', async () => {
    assert.equal((await run([], '<b>x</b>')).out, '<p>&lt;b&gt;x&lt;/b&gt;</p>\n');
    assert.equal((await run(['--allow-html'], '<b>x</b>')).out, '<p><b>x</b></p>\n');
  });

  it('--no-heading-ids leaves ids off', async () => {
    assert.equal((await run(['--no-heading-ids'], '# a')).out, '<h1>a</h1>\n');
  });

  it('--no-front-matter treats the block as Markdown', async () => {
    const { out } = await run(['--no-front-matter', '--no-heading-ids'], '---\na: 1\n---\n');
    assert.equal(out, '<hr />\n<h2>a: 1</h2>\n');
  });

  describe('--full-page', () => {
    const titleOf = (html) => /<title>(.*)<\/title>/.exec(html)[1];

    it('produces a document with the content inside', async () => {
      const { out } = await run(['--full-page', join(dir, 'doc.md')]);
      assert.ok(out.startsWith('<!doctype html>'));
      assert.ok(out.includes('<body>\n<h1 id="title">Title</h1>'));
    });

    it('takes the title from --title first', async () => {
      const { out } = await run(['--full-page', '--title', 'A & B', join(dir, 'meta.md')]);
      assert.equal(titleOf(out), 'A &amp; B');
    });

    it('then from front matter', async () => {
      const { out } = await run(['--full-page', join(dir, 'meta.md')]);
      assert.equal(titleOf(out), 'From Meta');
      assert.ok(out.includes('<meta name="description" content="About">'));
    });

    it('then from the first level 1 heading', async () => {
      assert.equal(titleOf((await run(['--full-page', join(dir, 'doc.md')])).out), 'Title');
    });

    it('then from the file name', async () => {
      assert.equal(titleOf((await run(['--full-page', join(dir, 'plain.md')])).out), 'plain');
    });

    it('then a default', async () => {
      assert.equal(titleOf((await run(['--full-page'], 'x')).out), 'Document');
    });

    it('ignores a non-string front matter title', async () => {
      const { out } = await run(['--full-page'], '---\ntitle: 5\n---\n# Real\n');
      assert.equal(titleOf(out), 'Real');
    });

    it('combines with --toc', async () => {
      const { out } = await run(['--full-page', '--toc'], '# a\n');
      assert.ok(out.includes('<body>\n<nav class="toc">'));
    });
  });

  it('--help prints usage and succeeds', async () => {
    const { code, out } = await run(['--help']);
    assert.equal(code, 0);
    assert.ok(out.startsWith('Usage: mdslim'));
    assert.equal((await run(['-h'])).code, 0);
  });

  for (const [name, args, message] of [
    ['an unknown flag', ['--nope'], /--nope/],
    ['two input files', ['a.md', 'b.md'], /at most one/],
    ['--ast with --full-page', ['--ast', '--full-page'], /cannot be combined/],
    ['--ast with --toc', ['--ast', '--toc'], /cannot be combined/],
    ['--title without --full-page', ['--title', 'x'], /requires --full-page/],
    ['-o without a value', ['-o'], /-o/],
  ]) {
    it(`exits 2 for ${name}`, async () => {
      const { code, out, err } = await run(args);
      assert.equal(code, 2);
      assert.equal(out, '');
      assert.match(err, message);
      assert.ok(err.includes('Usage: mdslim'));
    });
  }

  it('exits 1 when the input is missing', async () => {
    const { code, err } = await run([join(dir, 'missing.md')]);
    assert.equal(code, 1);
    assert.match(err, /^mdslim: .*ENOENT/);
  });

  it('exits 1 when the output cannot be written', async () => {
    const { code, err } = await run([join(dir, 'doc.md'), '-o', join(dir, 'no', 'such', 'dir.html')]);
    assert.equal(code, 1);
    assert.match(err, /^mdslim: /);
  });

  it('runs as a real process', () => {
    const result = spawnSync(process.execPath, [BIN, '--toc'], { input: '# a\n', encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('<h1 id="a">a</h1>'));
  });

  it('sets the exit status as a real process', () => {
    const result = spawnSync(process.execPath, [BIN, '--nope'], { input: '', encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
  });
});
