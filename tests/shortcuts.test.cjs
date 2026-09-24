const test = require('node:test');
const assert = require('node:assert/strict');
test('records single keys, arrows, function keys and modifier combinations', async () => {
  const { shortcutFromEvent, shortcutAction } = await import('../src/lib/shortcuts.mjs');
  for (const [key, expected] of [['a', 'A'], [' ', 'Space'], ['ArrowLeft', 'Left'], ['Escape', 'Escape'], ['Tab', 'Tab'], ['F8', 'F8'], ['+', 'Plus']]) assert.equal(shortcutFromEvent({ key }), expected);
  assert.equal(shortcutFromEvent({ key: 'a', metaKey: true }), 'Super+A');
  assert.equal(shortcutFromEvent({ key: 'Shift', shiftKey: true }), '');
  assert.equal(shortcutAction({ key: 'ArrowLeft' }, { key1: 'Left' }), 'previous');
  assert.equal(shortcutAction({ key: 'ArrowLeft' }, { key2: 'ArrowLeft' }), 'next');
});
