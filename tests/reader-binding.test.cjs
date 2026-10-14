const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBinding, visibilityDecision } = require('../electron/reader-binding.cjs');
const host = { hwnd: '101', pid: 42, startedAt: '12345', appPath: 'C:\\Apps\\Editor.exe', title: '工作文档', visible: true, minimized: false };
const binding = { mode: 'window', ...host };
const config = { readerRequested: true, readerBinding: binding };
const decide = (changes = {}, snapshot = {}, context = {}) => visibilityDecision({ ...config, ...changes }, { foreground: host, target: host, ...snapshot }, { readerHwnd: '900', visible: true, host, available: true, ...context });

test('app binding matches the executable across windows and process restarts', () => {
  const appBinding = normalizeBinding({ mode: 'app', ...host });
  assert.equal(appBinding.hwnd, undefined);
  assert.equal(decide({ readerBinding: appBinding }, { foreground: { ...host, hwnd: '202', pid: 90, startedAt: '678' } }).visible, true);
  assert.equal(decide({ readerBinding: appBinding }, { foreground: { ...host, appPath: 'C:\\Other\\Editor.exe' } }).visible, false);
});
test('window binding excludes other windows, reused handles and restarted processes', () => {
  assert.equal(decide().visible, true);
  for (const patch of [{ hwnd: '202' }, { pid: 43 }, { startedAt: '678' }]) assert.equal(decide({}, { foreground: { ...host, ...patch } }).visible, false);
  assert.equal(decide({}, { target: null }).reason, 'window-closed');
  assert.equal(decide({ readerBinding: { ...binding, invalidated: true } }).visible, false);
});
test('manual hide takes priority over returning to the bound app and restart', () => {
  const saved = JSON.parse(JSON.stringify({ ...config, readerRequested: false }));
  assert.equal(decide(saved).reason, 'manual-hidden');
  assert.equal(decide({ readerRequested: true }).visible, true);
});
test('reader focus retains the valid host without keeping overlays over unrelated apps', () => {
  const reader = { ...host, hwnd: '900', appPath: 'C:\\fish-book.exe' };
  assert.equal(decide({}, { foreground: reader }).visible, true);
  assert.equal(decide({}, { foreground: reader }, { visible: false }).visible, false);
  assert.equal(decide({}, { foreground: { ...host, hwnd: '300', appPath: 'C:\\Other.exe' } }).visible, false);
  assert.equal(decide({}, { foreground: reader, target: { ...host, minimized: true } }).visible, false);
});
test('unknown foreground, minimized target and monitor failure hide safely', () => {
  assert.equal(decide({}, { foreground: null }).visible, false);
  assert.equal(decide({}, { foreground: { ...host, minimized: true } }).visible, false);
  assert.equal(decide({}, {}, { available: false }).reason, 'unavailable');
  assert.equal(decide({ readerBinding: null }, {}, { available: false }).visible, true);
});
test('binding validation keeps stable identity and rejects incomplete or malformed targets', () => {
  assert.deepEqual(normalizeBinding(null), null);
  assert.equal(normalizeBinding({ mode: 'window', appPath: host.appPath }), null);
  assert.equal(normalizeBinding({ ...binding, hwnd: '1;bad' }), null);
  assert.equal(normalizeBinding({ ...binding, mode: 'other' }), null);
  assert.equal(normalizeBinding(binding).title, host.title);
});
