// 使用真实 Electron 主进程、IPC 和独立 WinForms 宿主；用户配置、书库均不参与测试。
const { app, BrowserWindow } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const testData = process.env.FISH_BOOK_BINDING_TEST_DATA || fs.mkdtempSync(path.join(os.tmpdir(), 'fish-book-binding-'));
const restoring = process.argv.includes('--restore-binding');
app.setPath('userData', testData);
app.setAppPath(root);
const Store = require('electron-store');
const store = new Store({ name: 'sysConfig' });
if (!restoring) store.set({ booksInfo: [], currentBookName: '', cleanMode: false, readerRequested: false, books_folder_path: path.join(testData, 'books') });
require('../electron/main.cjs');
let host;
let main;
let reader;
const label = `FishBook Binding QA ${Date.now()}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await check()) return; await wait(80); }
  throw new Error(`Timeout: ${label}`);
}
async function api(method, ...args) {
  return main.webContents.executeJavaScript(`window.fishBook[${JSON.stringify(method)}](...${JSON.stringify(args)})`);
}
async function startHost() {
  const executable = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  host = spawn(executable, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'fixtures', 'window-host.ps1'), '-Label', label, '-ReaderProcessId', String(process.pid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let ready = false;
  host.stdout.on('data', data => { if (String(data).includes('READY')) ready = true; });
  host.stderr.on('data', data => console.error(String(data)));
  await until(() => ready, 'test host ready');
}
const focus = name => { host.stdin.write(`focus${name}\n`); };
async function focusElectron(window) {
  const handle = window.getNativeWindowHandle();
  const hwnd = handle.length === 8 ? handle.readBigUInt64LE().toString() : String(handle.readUInt32LE());
  host.stdin.write(`activate${hwnd}\n`);
  await until(() => window.isFocused(), 'Electron foreground focus').catch(async error => { console.log(JSON.stringify({ readerVisible: reader.isVisible(), bindingStatus: (await api('getConfig')).bindingStatus })); throw error; });
}
const checkVisible = value => until(() => reader.isVisible() === value, `reader visible=${value}`);
app.whenReady().then(async () => {
  try {
    await until(() => BrowserWindow.getAllWindows().length === 2, 'app windows created');
    [main, reader] = BrowserWindow.getAllWindows().sort((a, b) => a.id - b.id);
    await until(() => !main.webContents.isLoading() && !reader.webContents.isLoading(), 'renderer loaded');
    await startHost();
    focus('A');
    if (restoring) {
      const config = await api('getConfig');
      assert.equal(config.readerBinding.mode, 'app');
      assert.equal(config.readerRequested, false);
      await wait(1000); assert.equal(reader.isVisible(), false, 'manual hide restored across fish-book restart');
      await api('showReader'); await checkVisible(true);
      console.log('DESKTOP_RESTART_PASS: binding and manual hide persisted across a fresh Electron process');
      host?.kill(); app.exit(0); return;
    }
    let windows;
    await until(async () => { windows = await api('listReaderWindows'); return windows.some(item => item.title === label + ' A') && windows.some(item => item.title === label + ' B'); }, 'external windows enumerated').catch(error => { console.log(JSON.stringify({ hostPid: host.pid, hostExited: host.exitCode, hostWindows: windows.filter(item => item.pid === host.pid), label })); throw error; });
    const a = windows.find(item => item.title === label + ' A');
    const b = windows.find(item => item.title === label + ' B');
    assert.ok(a && b, 'both external target windows listed');
    await focusElectron(main);
    await main.webContents.executeJavaScript("[...document.querySelectorAll('.sidebar nav button')].find(el => el.textContent.includes('阅读偏好')).click()");
    await until(() => main.webContents.executeJavaScript("Boolean([...document.querySelectorAll('[role=tab]')].find(el => el.textContent.includes('悬浮窗口')))"), 'settings tabs mounted');
    await main.webContents.executeJavaScript("[...document.querySelectorAll('[role=tab]')].find(el => el.textContent.includes('悬浮窗口')).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))");
    await until(() => main.webContents.executeJavaScript(`Boolean(document.querySelector('#binding-window option[value="${a.hwnd}"]'))`), 'real target appears in binding UI').catch(async error => { console.log(await main.webContents.executeJavaScript("document.querySelector('.reader-binding')?.textContent")); throw error; });
    await main.webContents.executeJavaScript(`const select = document.querySelector('#binding-window'); select.value = '${a.hwnd}'; select.dispatchEvent(new Event('change', { bubbles: true }));`);
    await until(() => main.webContents.executeJavaScript("Boolean([...document.querySelectorAll('.binding-actions button')].find(el => el.textContent.includes('绑定并开启') && !el.disabled))"), 'binding selection enables submit');
    await main.webContents.executeJavaScript("[...document.querySelectorAll('.binding-actions button')].find(el => el.textContent.includes('绑定并开启')).click()");
    await until(() => store.get('readerBinding')?.mode === 'app', 'binding UI saves app binding');
    const screenshotDir = path.join(root, '.playwright-mcp'); fs.mkdirSync(screenshotDir, { recursive: true });
    fs.writeFileSync(path.join(screenshotDir, 'reader-binding-light.png'), (await main.webContents.capturePage()).toPNG());
    await api('setConfig', 'theme', 'dark');
    await until(() => main.webContents.executeJavaScript("document.documentElement.classList.contains('dark')"), 'dark theme applied');
    fs.writeFileSync(path.join(screenshotDir, 'reader-binding-dark.png'), (await main.webContents.capturePage()).toPNG());
    await checkVisible(false);
    focus('A'); await checkVisible(true);
    assert.equal(reader.isFocused(), false, 'auto show does not steal focus');
    focus('B'); await checkVisible(true);
    await focusElectron(main); await checkVisible(false);
    focus('A'); await checkVisible(true);
    await focusElectron(reader); await wait(700); assert.equal(reader.isVisible(), true, 'reader interaction does not flicker');
    await api('hideReader'); await checkVisible(false);
    await until(() => main.webContents.executeJavaScript("document.querySelector('.binding-current [role=status]')?.textContent.includes('已手动隐藏')"), 'manual hide shown in settings');
    await focusElectron(main); focus('B'); await wait(700); assert.equal(reader.isVisible(), false, 'manual hide wins on app return');
    assert.equal(store.get('readerRequested'), false);
    await api('showReader'); await checkVisible(true);
    await focusElectron(main); await api('bindReader', 'window', a.hwnd);
    focus('B'); await checkVisible(false);
    focus('A'); await checkVisible(true);
    host.stdin.write('minimizeA\n'); await checkVisible(false);
    focus('A'); await checkVisible(true);
    host.stdin.write('closeA\n'); await checkVisible(false);
    await until(() => store.get('readerBinding').invalidated === true, 'closed window invalidated');
    focus('B'); await wait(500); assert.equal(reader.isVisible(), false);
    const saved = new Store({ name: 'sysConfig' });
    assert.equal(saved.get('readerBinding').hwnd, a.hwnd, 'window binding persisted');
    assert.equal(saved.get('readerBinding').invalidated, true);
    await api('bindReader', 'app', b.hwnd); focus('B'); await checkVisible(true);
    const appPath = store.get('readerBinding').appPath;
    host.stdin.write('quit\n'); await checkVisible(false);
    await startHost(); focus('A'); await checkVisible(true);
    assert.equal(store.get('readerBinding').appPath, appPath, 'app restart retains executable binding');
    const query = spawnSync(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${process.pid} -and $_.Name -eq 'powershell.exe' -and $_.ProcessId -ne ${host.pid} -and $_.ProcessId -ne $PID } | Select-Object -ExpandProperty ProcessId`], { encoding: 'utf8', windowsHide: true });
    const helperPid = Number(query.stdout.trim());
    assert.ok(helperPid > 0, 'native monitor process found');
    process.kill(helperPid);
    await checkVisible(false);
    await until(async () => (await api('getConfig')).bindingStatus.reason === 'unavailable', 'monitor failure hides reader');
    await api('listReaderWindows'); focus('A'); await checkVisible(true);
    await api('hideReader'); await api('unbindReader'); await wait(300); assert.equal(reader.isVisible(), false, 'unbind preserves manual hide');
    await api('showReader'); await checkVisible(true);
    const freshWindows = await api('listReaderWindows');
    await api('bindReader', 'app', freshWindows.find(item => item.title === label + ' A').hwnd);
    await api('hideReader');
    console.log('DESKTOP_BINDING_PASS: settings UI, light/dark themes, enumerate, app/window binding, auto show/hide, no focus stealing, reader focus, manual hide, minimize, close, app restart, monitor failure/recovery, persistence, unbind');
    host?.kill(); app.exit(0);
  } catch (error) { console.error(error.stack); host?.kill(); app.exit(1); }
  finally { host?.kill(); }
});
