const test = require('node:test');
const assert = require('node:assert/strict');
const { zipSync, strToU8 } = require('fflate');
const iconv = require('iconv-lite');
// CommonJS 是桌面端和浏览器虚拟 ESM 的共同源实现；Vite 构建负责验证浏览器映射。
const parser = async () => require('../electron/book-parser.cjs');
const bytes = text => new TextEncoder().encode(text);

test('desktop parser exposes a CommonJS entry that can load from ASAR', () => {
  const desktopParser = require('../electron/book-parser.cjs');
  const mainSource = require('node:fs').readFileSync(require('node:path').join(__dirname, '../electron/main.cjs'), 'utf8');
  assert.equal(typeof desktopParser.parseBook, 'function');
  assert.match(mainSource, /require\(['"]\.\/book-parser\.cjs['"]\)/);
  assert.doesNotMatch(mainSource, /import\(['"]\.\/book-parser\.mjs['"]\)/);
});

function epub(extra = {}) {
  return zipSync(Object.fromEntries(Object.entries({
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
    'OPS/book.opf': '<package><metadata><dc:title>测试小说</dc:title><dc:creator>作者甲</dc:creator></metadata><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>',
    'OPS/a.xhtml': '<html><body><h1 id="a">归途</h1><p>第二段故事。</p></body></html>',
    'OPS/b.xhtml': '<html><body><h1 id="b">启程</h1><p>第一段故事。</p></body></html>',
    'OPS/nav.xhtml': '<html><body><nav epub:type="toc"><ol><li><a href="b.xhtml#b">旅途开始</a></li><li><a href="a.xhtml#a">回到家乡</a></li></ol></nav></body></html>',
    ...extra,
  }).map(([name, text]) => [name, bytes(text)])));
}
// 可选导出生成的二进制样本，供浏览器文件选择器验收使用。
if (process.env.FISH_BOOK_EXPORT_FIXTURE === '1') {
  const fs = require('node:fs');
  const path = require('node:path');
  const output = path.join(__dirname, '../.playwright-mcp/book-fixtures');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, '格式测试.epub'), epub());
}
test('TXT keeps CRLF offsets and decodes UTF-8, UTF-16 and GB18030', async () => {
  const { parseBook } = await parser();
  const text = '第一章 启程\r\n你好世界\r\n第二章 归途\r\n再见';
  for (const data of [bytes(text), iconv.encode(text, 'gb18030'), Buffer.concat([Buffer.from([255,254]), iconv.encode(text, 'utf16le')])]) {
    const book = parseBook('小说.TXT', data);
    assert.equal(book.text, text);
    assert.equal(book.chapters[1].start, text.indexOf('第二章'));
  }
});
test('HTML extracts paragraphs and headings without scripts or remote resources', async () => {
  const { parseBook } = await parser();
  const book = parseBook('小说.html', bytes('<title>书名</title><body><h1>序幕</h1><p>你好 <em>世界</em>&amp;朋友</p><script>alert(1)</script><style>body{}</style><iframe>广告</iframe><img src="https://example.com/tracker"><h2>结束</h2><p>终。</p></body>'));
  assert.equal(book.title, '书名');
  assert.ok(book.text.includes('你好 世界&朋友'));
  assert.ok(!/alert|body\{|广告|tracker/.test(book.text));
  assert.equal(book.text.slice(book.chapters[1].start, book.chapters[1].start + 2), '结束');
});
test('FB2 extracts metadata and nested section titles without binary or notes', async () => {
  const { parseBook } = await parser();
  const book = parseBook('小说.fb2', bytes('<FictionBook><description><title-info><book-title>远行</book-title><author><first-name>小</first-name><last-name>鱼</last-name></author></title-info></description><body><section><title><p>序曲</p></title><p>正文甲。</p><section><title><p>终曲</p></title><p>正文乙。</p></section></section></body><body name="notes"><p>脚注内容</p></body><binary>YWJjZA==</binary></FictionBook>'));
  assert.equal(book.title, '远行');
  assert.match(book.author, /小.*鱼/);
  assert.deepEqual(book.chapters.map(c => c.title), ['序曲', '终曲']);
  assert.ok(!/YWJj|脚注内容/.test(book.text));
});
test('EPUB follows spine rather than archive order and resolves navigation anchors', async () => {
  const { parseBook } = await parser();
  const book = parseBook('小说.epub', epub());
  assert.equal(book.title, '测试小说');
  assert.equal(book.author, '作者甲');
  assert.ok(book.text.indexOf('第一段') < book.text.indexOf('第二段'));
  assert.deepEqual(book.chapters.map(c => c.title), ['旅途开始', '回到家乡']);
  assert.ok(book.text.slice(book.chapters[1].start).startsWith('归途'));
});
test('rejects unsupported, empty, oversized, encrypted and unsafe archive input', async () => {
  const { parseBook, MAX_BOOK_BYTES } = await parser();
  assert.throws(() => parseBook('a.pdf', bytes('text')), /不支持/);
  assert.throws(() => parseBook('a.html', bytes('<script>bad</script>')), /正文/);
  assert.throws(() => parseBook('a.txt', new Uint8Array(MAX_BOOK_BYTES + 1)), /大小/);
  assert.throws(() => parseBook('a.epub', strToU8('broken')), /EPUB/);
  assert.throws(() => parseBook('a.epub', epub({ 'META-INF/encryption.xml': '<encryption/>' })), /加密/);
  assert.throws(() => parseBook('a.epub', epub({ '../escape.xhtml': '<p>bad</p>' })), /路径/);
  assert.throws(() => parseBook('a.fb2', bytes('<html><p>不是 FB2</p></html>')), /FB2/);
});

test('EPUB 2 NCX navigation resolves URI-encoded local paths', async () => {
  const { parseBook } = await parser();
  const data = epub({
    'OPS/book.opf': '<package><metadata><dc:title>旧版书</dc:title></metadata><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="ncx"><itemref idref="a"/></spine></package>',
    'OPS/toc.ncx': '<ncx><navMap><navPoint><navLabel><text>旧版目录</text></navLabel><content src="%61.xhtml#a"/></navPoint></navMap></ncx>',
  });
  assert.deepEqual(parseBook('旧版.epub', data).chapters, [{ title: '旧版目录', start: 0 }]);
});

test('archive expansion limits and entity declarations fail safely', async () => {
  const { parseBook } = await parser();
  const data = zipSync({ 'mimetype': bytes('application/epub+zip'), 'large.xhtml': new Uint8Array(16 * 1024 * 1024 + 1) });
  assert.throws(() => parseBook('large.epub', data), /解压大小/);
  assert.throws(() => parseBook('entity.fb2', bytes('<!DOCTYPE FictionBook [<!ENTITY x SYSTEM "file:///secret">]><FictionBook><body>&x;</body></FictionBook>')), /实体/);
});

test('desktop book loader reads new formats and preserves legacy TXT offsets', async () => {
  const fs = require('node:fs/promises');
  const path = require('node:path');
  const vm = require('node:vm');
  const jschardet = require('jschardet');
  const source = await fs.readFile(path.join(__dirname, '../electron/main.cjs'), 'utf8');
  const context = vm.createContext({ fs, path, iconv, jschardet, Buffer, bookParser: parser(), parsedBooks: new Map(), booksFolder: async () => path.join(__dirname, 'fixtures') });
  vm.runInContext(source.slice(source.indexOf('async function readBook('), source.indexOf('function notifyConfig(')), context);
  const book = await vm.runInContext('readBookDetails("格式测试.fb2")', context);
  assert.equal(book.title, '水边的书房');
  assert.equal(book.chapters.length, 2);
  const bytes = await fs.readFile(path.join(__dirname, 'fixtures/阅读调试.txt'));
  const expected = iconv.decode(bytes, jschardet.detect(bytes).encoding || 'utf-8');
  assert.equal(await vm.runInContext('readBook("阅读调试.txt", 5, 20)', context), expected.slice(5, 25));
  await assert.rejects(vm.runInContext('readBookDetails("../secret.txt")', context), /无效/);
});
