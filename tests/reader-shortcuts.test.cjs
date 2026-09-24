const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// 执行实际快捷键注册逻辑，仅替换 Electron 窗口和系统快捷键边界。
const source = fs.readFileSync(require.resolve('../electron/main.cjs'), 'utf8');
const registerSource = source.slice(source.indexOf('function registerShortcuts('), source.indexOf('async function readBook('));
function harness(reader) {
  const callbacks = new Map();
  const state = { cleanMode: true, start: 218, currentBookName: 'test.txt' };
  let notifications = 0;
  let created = 0;
  const context = vm.createContext({
    readWindow: reader, shortcutErrors: [],
    createReadWindow() { created += 1; },
    store: { get: key => state[key], set: (key, value) => { state[key] = value; } },
    notifyConfig() { notifications += 1; },
    globalShortcut: { unregisterAll() {}, register(key, callback) { callbacks.set(key, callback); return true; } },
  });
  vm.runInContext(`${registerSource}\nregisterShortcuts({ key1: 'Alt+Z', key2: 'Alt+C', key3: 'Alt+V', key4: 'Alt+Q' });`, context);
  return { state, exit: () => callbacks.get('Alt+Q')(), created: () => created, notifications: () => notifications };
}

test('exit clean mode without a reader only changes state and never creates a window', () => {
  const app = harness(null);
  app.exit();
  assert.equal(app.created(), 0);
  assert.deepEqual(app.state, { cleanMode: false, start: 218, currentBookName: 'test.txt' });
  assert.equal(app.notifications(), 1);
});

test('exit clean mode preserves an existing window and reading position, including repeated exits', () => {
  const forbiddenWindow = new Proxy({}, { get() { throw new Error('Exit clean mode must not operate on the window'); } });
  const app = harness(forbiddenWindow);
  app.exit();
  app.exit();
  assert.equal(app.state.cleanMode, false);
  assert.equal(app.state.start, 218);
  assert.equal(app.created(), 0);
});
