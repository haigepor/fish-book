const { unzipSync } = require('fflate');
const { parseDocument } = require('htmlparser2');
const { BOOK_EXTENSIONS, MAX_BOOK_BYTES, bookFormat, supportedBook } = require('./book-formats.cjs');
const MAX_EXPANDED = 64 * 1024 * 1024;
const MAX_ENTRY = 16 * 1024 * 1024;

function decodeText(data) {
  if (data[0] === 255 && data[1] === 254) return new TextDecoder('utf-16le').decode(data);
  if (data[0] === 254 && data[1] === 255) return new TextDecoder('utf-16be').decode(data);
  const head = new TextDecoder('ascii').decode(data.subarray(0, 512));
  const declared = head.match(/(?:encoding|charset)\s*=\s*["']?([\w-]+)/i)?.[1];
  if (declared) { try { return new TextDecoder(declared, { fatal: true }).decode(data); } catch { /* 无效声明时继续识别。 */ } }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(data); }
  catch { return new TextDecoder('gb18030', { fatal: true }).decode(data); }
}

function textChapters(text) {
  const chapters = [];
  const pattern = /^(?:第[零〇一二三四五六七八九十百千万两\d]+[章回节卷部篇](?:\s.*|[^\s]{0,40})|chapter\s+\d+\b.*|序章|序言|前言|尾声|后记)$/i;
  let start = 0;
  for (const line of text.split('\n')) {
    const title = line.trim();
    if (title.length <= 80 && pattern.test(title)) chapters.push({ title, start });
    start += line.length + 1;
  }
  return chapters;
}
const tag = node => (node?.name || '').split(':').pop().toLowerCase();
const children = node => node?.children || [];
function all(node, name) {
  const result = [];
  const stack = [node];
  while (stack.length) {
    const next = stack.pop();
    if (tag(next) === name) result.push(next);
    stack.push(...children(next).slice().reverse());
  }
  return result;
}
function plain(node) {
  if (!node) return '';
  const stack = [node];
  let result = '';
  while (stack.length) {
    const item = stack.pop();
    if (item.type === 'text') result += item.data;
    else stack.push(...children(item).slice().reverse());
  }
  return result.replace(/\s+/g, ' ').trim();
}
function documentOf(text, xml = false) {
  // 不解析外部实体，也不构造浏览器 DOM，书籍资源不会触发网络请求。
  if (/<!ENTITY\b/i.test(text)) throw new Error('不支持包含实体声明的文件');
  return parseDocument(text, { xmlMode: xml, decodeEntities: true });
}
const blocked = new Set(['head', 'script', 'style', 'iframe', 'object', 'embed', 'svg', 'noscript', 'template', 'binary', 'image']);
const blocks = new Set(['p', 'div', 'section', 'article', 'li', 'br', 'hr', 'blockquote', 'pre', 'tr', 'title', 'subtitle', 'v', 'empty-line']);
function extract(root, fb2 = false) {
  let text = '';
  const chapters = [];
  const anchors = new Map();
  const newline = () => { if (text && !text.endsWith('\n')) text += '\n'; };
  function visit(node, depth = 0) {
    if (depth > 128) throw new Error('文档层级过深');
    const name = tag(node);
    if (blocked.has(name) || node.attribs?.hidden !== undefined) return;
    if (node.type === 'text') { text += node.data.replace(/\s+/g, ' '); return; }
    const heading = /^h[1-6]$/.test(name) || fb2 && name === 'title';
    const block = heading || blocks.has(name);
    if (block) newline();
    if (node.attribs?.id) anchors.set(node.attribs.id, text.length);
    if (heading && plain(node)) {
      chapters.push({ title: plain(node).slice(0, 200), start: text.length });
      text += plain(node);
    } else for (const child of children(node)) visit(child, depth + 1);
    if (block) newline();
  }
  visit(root);
  return { text, chapters, anchors };
}
function resolveEntry(base, href) {
  let decoded;
  try { decoded = decodeURIComponent(href); } catch { throw new Error('EPUB 资源路径编码无效'); }
  if (/^(?:[a-z][\w+.-]*:|\/)|[\\\0]/i.test(decoded)) throw new Error('EPUB 包含外部或非法资源路径');
  const parts = base.split('/').slice(0, -1);
  for (const part of decoded.split('/')) {
    if (part === '..') { if (!parts.length) throw new Error('EPUB 路径越界'); parts.pop(); }
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}
function parseEpub(data) {
  let total = 0;
  let count = 0;
  let files;
  try {
    // 在解压前检查目录声明的大小；只解压文本资源，不解压图片、字体等。
    files = unzipSync(data, { filter(entry) {
      if (++count > 5000) throw new Error('EPUB 文件数量过多');
      if (entry.name.split('/').includes('..') || /^(?:\/|[a-z]:)|[\\\0]/i.test(entry.name)) throw new Error('EPUB 路径无效');
      total += entry.originalSize;
      if (entry.originalSize > MAX_ENTRY || total > MAX_EXPANDED) throw new Error('EPUB 解压大小超出限制');
      return /(?:\.xml|\.opf|\.ncx|\.xhtml|\.html|\.htm)$|^mimetype$/i.test(entry.name);
    } });
  } catch (error) { throw new Error(`EPUB 无法解压：${error.message}`); }
  if (!files.mimetype || decodeText(files.mimetype).trim() !== 'application/epub+zip') throw new Error('不是有效的 EPUB 文件');
  if (files['META-INF/encryption.xml']) throw new Error('暂不支持带加密声明的 EPUB，请导入无加密版本');
  const read = name => { if (!Object.hasOwn(files, name)) throw new Error(`EPUB 缺少资源：${name}`); return documentOf(decodeText(files[name]), true); };
  const container = read('META-INF/container.xml');
  const rootPath = all(container, 'rootfile')[0]?.attribs?.['full-path'];
  if (!rootPath) throw new Error('EPUB 缺少包描述文件');
  const opfPath = resolveEntry('', rootPath);
  const opf = read(opfPath);
  const manifest = new Map(all(all(opf, 'manifest')[0], 'item').map(item => [item.attribs.id, item.attribs]));
  const spine = all(all(opf, 'spine')[0], 'itemref').filter(item => item.attribs.linear !== 'no');
  if (!spine.length) throw new Error('EPUB 缺少阅读顺序');
  let text = '';
  const fallback = [];
  const locations = new Map();
  for (const ref of spine) {
    const item = manifest.get(ref.attribs.idref);
    if (!item || !['application/xhtml+xml', 'text/html'].includes(item['media-type'])) throw new Error('EPUB 阅读顺序包含不支持或缺失的正文');
    const file = resolveEntry(opfPath, item.href);
    const doc = read(file);
    const content = extract(all(doc, 'body')[0] || doc);
    const offset = text.length;
    locations.set(file, offset);
    for (const [id, start] of content.anchors) locations.set(`${file}#${id}`, offset + start);
    fallback.push(...content.chapters.map(c => ({ ...c, start: offset + c.start })));
    text += content.text + '\n';
    if (text.length > MAX_EXPANDED) throw new Error('EPUB 正文过大');
  }
  const chapters = [];
  const addLink = (base, href, title) => {
    if (!href || !title || /^(?:[a-z][\w+.-]*:|\/)/i.test(href)) return;
    const [path, fragment] = href.split('#');
    const file = path ? resolveEntry(base, path) : base;
    const key = fragment ? `${file}#${decodeURIComponent(fragment)}` : file;
    const start = locations.get(key);
    if (start !== undefined) chapters.push({ title: title.slice(0, 200), start });
  };
  const nav = [...manifest.values()].find(item => item.properties?.split(/\s+/).includes('nav'));
  if (nav) {
    const file = resolveEntry(opfPath, nav.href);
    const toc = all(read(file), 'nav').find(node => node.attribs?.['epub:type']?.split(/\s+/).includes('toc'));
    for (const link of all(toc, 'a')) addLink(file, link.attribs.href, plain(link));
  } else {
    const ncx = manifest.get(all(opf, 'spine')[0]?.attribs.toc) || [...manifest.values()].find(item => item['media-type'] === 'application/x-dtbncx+xml');
    if (ncx) {
      const file = resolveEntry(opfPath, ncx.href);
      for (const point of all(read(file), 'navpoint')) addLink(file, all(point, 'content')[0]?.attribs.src, plain(all(point, 'navlabel')[0]));
    }
  }
  return { text, chapters: chapters.length ? chapters : fallback, title: plain(all(opf, 'title')[0]), author: all(opf, 'creator').map(plain).join('、') };
}

function parseBook(name, input, options = {}) {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const format = bookFormat(name);
  if (!supportedBook(name)) throw new Error('不支持此格式，请选择 TXT、EPUB、HTML/HTM 或 FB2');
  if (data.byteLength > MAX_BOOK_BYTES) throw new Error('文件大小超过 32 MB 限制');
  let result;
  if (format === 'epub') result = parseEpub(data);
  else {
    const text = format === 'txt' && options.decodeTxt ? options.decodeTxt(data) : decodeText(data);
    if (format === 'txt') result = { text, chapters: textChapters(text) };
    else if (format === 'fb2') {
      const doc = documentOf(text, true);
      if (!all(doc, 'fictionbook').length) throw new Error('不是有效的 FB2 文件');
      const info = all(doc, 'title-info')[0];
      const bodies = all(doc, 'body').filter(body => !body.attribs.name);
      result = extract({ children: bodies }, true);
      result.title = plain(all(info, 'book-title')[0]);
      result.author = all(info, 'author').map(author => ['first-name', 'middle-name', 'last-name', 'nickname'].map(key => plain(all(author, key)[0])).filter(Boolean).join(' ')).join('、');
    } else {
      const doc = documentOf(text);
      result = extract(all(doc, 'body')[0] || doc);
      result.title = plain(all(doc, 'title')[0]);
      result.author = all(doc, 'meta').find(node => node.attribs.name?.toLowerCase() === 'author')?.attribs.content || '';
    }
  }
  if (!result.text.trim()) throw new Error('没有可阅读的正文');
  const chapters = result.chapters.length ? result.chapters : textChapters(result.text);
  return { text: result.text, chapters: [...new Map(chapters.sort((a, b) => a.start - b.start).filter(c => c.start < result.text.length).map(c => [c.start, c])).values()], title: (result.title || name.replace(/\.[^.]+$/, '')).slice(0, 200), author: (result.author || '').slice(0, 200), format, parserVersion: 1 };
}

module.exports = { BOOK_EXTENSIONS, MAX_BOOK_BYTES, supportedBook, decodeText, textChapters, parseBook };
