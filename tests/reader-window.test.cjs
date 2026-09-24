const test = require('node:test');
const assert = require('node:assert/strict');

test('reader drag moves the complete window while retaining its size', () => {
  const { readerGestureBounds } = require('../electron/reader-window.cjs');
  assert.deepEqual(readerGestureBounds(
    { x: 40, y: 60, width: 560, height: 110 },
    { x: 100, y: 120 },
    { x: 145, y: 155 },
    '',
  ), { x: 85, y: 95, width: 560, height: 110 });
});

test('reader resize follows every edge and respects 100 by 100 minimum', () => {
  const { readerGestureBounds } = require('../electron/reader-window.cjs');
  const origin = { x: 40, y: 60, width: 320, height: 200 };
  const start = { x: 200, y: 200 };
  assert.deepEqual(readerGestureBounds(origin, start, { x: 1000, y: 1000 }, 'se'), { x: 40, y: 60, width: 1120, height: 900 });
  assert.deepEqual(readerGestureBounds(origin, start, { x: 900, y: 900 }, 'nw'), { x: 260, y: 160, width: 100, height: 100 });
});
