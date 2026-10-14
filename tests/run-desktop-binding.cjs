const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
if (process.platform !== 'win32') throw new Error('桌面绑定集成测试需要 Windows');
const executable = require('electron');
const testData = fs.mkdtempSync(path.join(os.tmpdir(), 'fish-book-binding-restart-'));
for (const args of [[], ['--restore-binding']]) {
  const result = spawnSync(executable, [path.join(__dirname, 'desktop-binding.e2e.cjs'), ...args], {
    cwd: path.resolve(__dirname, '..'), windowsHide: true, stdio: 'inherit', timeout: 60000,
    env: { ...process.env, FISH_BOOK_BINDING_TEST_DATA: testData, ELECTRON_RENDERER_URL: '' },
  });
  if (result.error || result.status !== 0) { console.error(result.error || `Desktop test exited ${result.status}`); process.exit(1); }
}
console.log('DESKTOP_ALL_PASS');
