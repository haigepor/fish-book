const test = require('node:test');
const assert = require('node:assert/strict');
test('chapter offsets preserve CRLF and identify current chapter', async () => {
  const { parseChapters, currentChapter } = await import('../src/lib/chapters.mjs');
  const text = '说明\r\n第一章 开始\r\n正文\r\nChapter 2 Next\r\n结束';
  const chapters = parseChapters(text);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[1].start, text.indexOf('Chapter 2'));
  assert.equal(currentChapter(chapters, chapters[1].start), 'Chapter 2 Next');
  assert.equal(currentChapter(chapters, 0), '正文');
  assert.deepEqual(parseChapters('普通正文，没有目录。'), []);
});
