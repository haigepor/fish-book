const test = require('node:test');
const assert = require('node:assert/strict');
test('adaptive boundaries grow with capacity and preserve exact next/previous offsets', async () => {
  const { fitPage } = await import('../src/lib/pagination.mjs');
  const text = '这是第一段。\n\n第二段有更多文字。'.repeat(20);
  const small = fitPage(text, 0, 1, value => value.length <= 30);
  const large = fitPage(text, 0, 1, value => value.length <= 80);
  assert.equal(small, 30);
  assert.equal(large, 80);
  const end = fitPage(text, small, 1, value => value.length <= 30);
  assert.equal(fitPage(text, end, -1, value => value.length <= 30), small);
  assert.equal(text.slice(0, small) + text.slice(small, end), text.slice(0, end));
});
test('adaptive pages handle emoji, end of book and tiny viewports', async () => {
  const { fitPage } = await import('../src/lib/pagination.mjs');
  assert.equal(fitPage('😀中文', 0, 1, value => value.length <= 1), 2);
  assert.equal(fitPage('中文', 2, 1, () => true), 2);
  assert.equal(fitPage('', 0, 1, () => true), 0);
  assert.equal(fitPage('中文', 0, -1, () => true), 0);
});
